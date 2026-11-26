"""Lógica de dominio: sesiones, organizaciones y membresías."""

import re
import secrets
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import set_tenant_context
from app.models import Organization, OrganizationMember, Plan, Role, Subscription, User, UserSession
from app.security.tokens import hash_token, new_token


def now() -> datetime:
    return datetime.now(UTC)


# --- Sesiones -----------------------------------------------------------------


def create_session(
    db: Session, user: User, active_org_id: uuid.UUID | None, ip: str | None, user_agent: str | None
) -> tuple[str, UserSession]:
    """Crea SIEMPRE un token nuevo (previene fijación de sesión) y limpia sesiones caducadas del usuario."""
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < now()))
    token = new_token()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        csrf_token=new_token(),
        active_organization_id=active_org_id,
        expires_at=now() + timedelta(hours=get_settings().session_ttl_hours),
        ip=ip,
        user_agent=(user_agent or "")[:256] or None,
    )
    db.add(session)
    db.flush()
    return token, session


def load_session(db: Session, token: str) -> UserSession | None:
    session = db.execute(select(UserSession).where(UserSession.token_hash == hash_token(token))).scalar_one_or_none()
    if session is None:
        return None
    if session.expires_at <= now():
        db.delete(session)
        return None
    return session


# --- Organizaciones -----------------------------------------------------------


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:60] or "org"
    return f"{base}-{secrets.token_hex(3)}"


def system_role(db: Session, code: str) -> Role:
    return db.execute(select(Role).where(Role.code == code, Role.organization_id.is_(None))).scalar_one()


def create_organization(
    db: Session, owner: User, name: str, *, country: str = "MX", currency: str = "MXN", ip: str | None = None
) -> Organization:
    """Crea la organización, la membresía de propietario y la suscripción al plan gratuito (atómico)."""
    org = Organization(
        id=uuid.uuid4(), name=name, slug=slugify(name), country=country, currency=currency, created_by=owner.id
    )
    # La política RLS de INSERT exige que la organización sea la del contexto actual.
    set_tenant_context(db, user_id=owner.id, org_id=org.id)
    db.add(org)
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role_id=system_role(db, "owner").id))
    free = db.execute(select(Plan).where(Plan.code == "free")).scalar_one()
    db.add(Subscription(organization_id=org.id, plan_id=free.id, status="active"))
    audit.record(
        db, "org.create", organization_id=org.id, user_id=owner.id, target_type="organization", target_id=org.id, ip=ip
    )
    db.flush()
    return org


def memberships_of(db: Session, user_id: uuid.UUID) -> list[OrganizationMember]:
    """Membresías del usuario (la política RLS permite ver las filas propias en todas sus organizaciones)."""
    return list(
        db.execute(
            select(OrganizationMember)
            .where(OrganizationMember.user_id == user_id)
            .order_by(OrganizationMember.created_at)
        ).scalars()
    )


def organizations_by_id(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, Organization]:
    if not ids:
        return {}
    rows = db.execute(select(Organization).where(Organization.id.in_(ids))).scalars()
    return {o.id: o for o in rows}


def count_members(db: Session, org_id: uuid.UUID) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(OrganizationMember).where(OrganizationMember.organization_id == org_id)
        ).scalar_one()
    )


def count_owners(db: Session, org_id: uuid.UUID) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(OrganizationMember)
            .join(Role, Role.id == OrganizationMember.role_id)
            .where(OrganizationMember.organization_id == org_id, Role.code == "owner")
        ).scalar_one()
    )
