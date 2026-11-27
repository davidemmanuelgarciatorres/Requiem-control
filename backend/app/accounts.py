"""Enlaces de un solo uso (restablecer contraseña, verificar correo) e invitaciones por correo.

Solo se guarda el sha256 de cada token; el token viaja únicamente en el correo. Cada enlace se
puede usar una sola vez, caduca, y emitir uno nuevo invalida los anteriores del mismo tipo.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.models import AuthToken, Invitation, Role, User

TTL = {"password_reset": timedelta(hours=1), "email_verify": timedelta(hours=48)}
INVITE_TTL = timedelta(days=7)


def token_hash(raw: str) -> bytes:
    return hashlib.sha256(raw.encode()).digest()


def issue(db: Session, user: User, purpose: str) -> str:
    db.execute(
        delete(AuthToken).where(AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None))
    )
    raw = secrets.token_urlsafe(32)
    db.add(
        AuthToken(
            token_hash=token_hash(raw), user_id=user.id, purpose=purpose, expires_at=datetime.now(UTC) + TTL[purpose]
        )
    )
    db.flush()
    return raw


def consume(db: Session, raw: str, purpose: str) -> User | None:
    """Devuelve el usuario si el enlace es válido (y lo marca como usado); si no, None (sin decir por qué)."""
    if not raw or len(raw) > 200:
        return None
    tok = db.execute(
        select(AuthToken).where(AuthToken.token_hash == token_hash(raw), AuthToken.purpose == purpose).with_for_update()
    ).scalar_one_or_none()
    if tok is None or tok.used_at is not None or tok.expires_at < datetime.now(UTC):
        return None
    user = db.get(User, tok.user_id)
    if user is None or not user.is_active:
        return None
    tok.used_at = datetime.now(UTC)
    db.flush()
    return user


def invite(db: Session, *, org_id: uuid.UUID, inviter_id: uuid.UUID, email: str, role: Role) -> tuple[Invitation, str]:
    raw = secrets.token_urlsafe(32)
    inv = db.execute(
        select(Invitation).where(
            Invitation.organization_id == org_id, Invitation.email == email, Invitation.accepted_at.is_(None)
        )
    ).scalar_one_or_none()
    if inv is None:
        inv = Invitation(
            organization_id=org_id,
            email=email,
            role_id=role.id,
            token_hash=token_hash(raw),
            invited_by=inviter_id,
            expires_at=datetime.now(UTC) + INVITE_TTL,
        )
        db.add(inv)
    else:  # reenviar: nuevo token (el anterior deja de servir) y nueva caducidad
        inv.role_id, inv.token_hash, inv.invited_by = role.id, token_hash(raw), inviter_id
        inv.expires_at = datetime.now(UTC) + INVITE_TTL
    db.flush()
    return inv, raw


def preview_invitation(db: Session, raw: str) -> dict[str, object] | None:
    if not raw or len(raw) > 200:
        return None
    row = db.execute(
        text("SELECT organization_name, email, expired FROM invitation_preview(:h)"), {"h": token_hash(raw)}
    ).first()
    if row is None:
        return None
    return {"organization": row.organization_name, "email": row.email, "expired": bool(row.expired)}


def accept_invitation(db: Session, raw: str, user_id: uuid.UUID) -> uuid.UUID | None:
    if not raw or len(raw) > 200:
        return None
    org = db.execute(text("SELECT accept_invitation(:h, :u)"), {"h": token_hash(raw), "u": user_id}).scalar()
    return uuid.UUID(str(org)) if org else None
