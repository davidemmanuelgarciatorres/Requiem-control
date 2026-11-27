"""Cuenta: recuperar/cambiar contraseña, verificar correo e invitaciones por correo."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import accounts, audit, entitlements, mailer
from app.api.deps import AuthContext, client_ip, get_auth, require_permission
from app.config import get_settings
from app.db import get_db, set_tenant_context
from app.errors import ApiError, conflict, not_found
from app.models import Invitation, OrganizationMember, Role, User, UserSession
from app.schemas import RoleCode
from app.security.passwords import hash_password, verify_password
from app.security.rate_limit import RateLimiter
from app.services import count_members, system_role

router = APIRouter(tags=["account"])
_s = get_settings()
forgot_ip_limiter = RateLimiter(_s.login_rate_limit, _s.login_rate_window_seconds)
forgot_email_limiter = RateLimiter(3, 3600)
resend_limiter = RateLimiter(3, 3600)
token_limiter = RateLimiter(20, 600)


class ForgotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)


class ResetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class ChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=10, max_length=200)


class InviteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    role: RoleCode = "member"


def _link(path: str, token: str) -> str:
    return f"{get_settings().public_app_url}{path}?token={token}"


def validate_new_password(password: str, email: str) -> None:
    s = get_settings()
    if len(password) < s.password_min_length:
        raise ApiError(
            422,
            "auth.password_too_short",
            f"La contraseña debe tener al menos {s.password_min_length} caracteres.",
            {"min_length": s.password_min_length},
        )
    if password.strip().lower() == email.lower():
        raise ApiError(422, "auth.password_weak", "La contraseña no puede ser igual al correo.")


def send_verification(db: Session, user: User, background: BackgroundTasks) -> None:
    raw = accounts.issue(db, user, "email_verify")
    background.add_task(
        mailer.send_template,
        user.email,
        "verify",
        user.preferred_language,
        name=user.full_name.split(" ")[0],
        link=_link("/verify-email", raw),
    )


# --- Contraseña -------------------------------------------------------------------------------
@router.post("/api/auth/password/forgot", status_code=202)
def forgot(
    body: ForgotIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
) -> dict[str, bool]:
    """Siempre responde igual, exista o no la cuenta (no revela qué correos están registrados)."""
    ip = client_ip(request)
    email = str(body.email).lower()
    if not forgot_ip_limiter.hit(f"forgot-ip:{ip}"):
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is not None and user.is_active and forgot_email_limiter.hit(f"forgot:{email}"):
        raw = accounts.issue(db, user, "password_reset")
        background.add_task(
            mailer.send_template,
            user.email,
            "reset",
            user.preferred_language,
            name=user.full_name.split(" ")[0],
            link=_link("/reset-password", raw),
        )
        audit.record(db, "auth.password_reset_requested", user_id=user.id, ip=ip)
    return {"accepted": True}


@router.post("/api/auth/password/reset")
def reset(
    body: ResetIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
) -> dict[str, bool]:
    ip = client_ip(request)
    if not token_limiter.hit(f"token:{ip}"):
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")
    user = accounts.consume(db, body.token, "password_reset")
    if user is None:
        raise ApiError(400, "auth.token_invalid", "El enlace no es válido o ya caducó. Solicita uno nuevo.")
    validate_new_password(body.password, user.email)
    user.password_hash = hash_password(body.password)
    user.email_verified_at = user.email_verified_at or datetime.now(UTC)  # demostró acceso a su correo
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))  # cierra TODAS las sesiones
    audit.record(db, "auth.password_reset", user_id=user.id, ip=ip)
    background.add_task(
        mailer.send_template, user.email, "changed", user.preferred_language, name=user.full_name.split(" ")[0]
    )
    return {"ok": True}


@router.post("/api/auth/password/change")
def change(
    body: ChangeIn,
    request: Request,
    background: BackgroundTasks,
    ctx: AuthContext = Depends(get_auth),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    user = ctx.user
    if not verify_password(user.password_hash, body.current_password):
        raise ApiError(400, "auth.wrong_password", "La contraseña actual no es correcta.")
    validate_new_password(body.new_password, user.email)
    user.password_hash = hash_password(body.new_password)
    # Las demás sesiones se cierran; la actual sigue abierta.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != ctx.session.id))
    audit.record(
        db,
        "auth.password_changed",
        user_id=user.id,
        ip=client_ip(request),
        organization_id=ctx.organization.id if ctx.organization else None,
    )
    background.add_task(
        mailer.send_template, user.email, "changed", user.preferred_language, name=user.full_name.split(" ")[0]
    )
    return {"ok": True}


# --- Verificación de correo -----------------------------------------------------------------------
@router.post("/api/auth/email/verify")
def verify_email(body: TokenIn, request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    if not token_limiter.hit(f"token:{client_ip(request)}"):
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")
    user = accounts.consume(db, body.token, "email_verify")
    if user is None:
        raise ApiError(400, "auth.token_invalid", "El enlace no es válido o ya caducó. Solicita uno nuevo.")
    user.email_verified_at = user.email_verified_at or datetime.now(UTC)
    audit.record(db, "auth.email_verified", user_id=user.id)
    return {"ok": True}


@router.post("/api/auth/email/resend", status_code=202)
def resend(
    background: BackgroundTasks, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> dict[str, bool]:
    if ctx.user.email_verified_at is not None:
        return {"accepted": False}
    if not resend_limiter.hit(f"resend:{ctx.user.id}"):
        raise ApiError(429, "auth.rate_limited", "Ya te enviamos varios correos. Espera un rato.")
    send_verification(db, ctx.user, background)
    return {"accepted": True}


# --- Invitaciones ----------------------------------------------------------------------------------
@router.get("/api/organizations/current/invitations")
def list_invitations(
    ctx: AuthContext = Depends(require_permission("members.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Invitation, Role.code)
        .join(Role, Role.id == Invitation.role_id)
        .where(Invitation.organization_id == ctx.require_org().id, Invitation.accepted_at.is_(None))
        .order_by(Invitation.created_at.desc())
    ).all()
    now = datetime.now(UTC)
    return [
        {
            "id": str(i.id),
            "email": i.email,
            "role": code,
            "expires_at": i.expires_at.isoformat(),
            "expired": i.expires_at < now,
        }
        for i, code in rows
    ]


@router.post("/api/organizations/current/invitations", status_code=201)
def create_invitation(
    body: InviteIn,
    request: Request,
    background: BackgroundTasks,
    ctx: AuthContext = Depends(require_permission("members.manage")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from app.api.organizations import _assert_can_manage

    org = ctx.require_org()
    if body.role == "owner":
        raise ApiError(422, "members.owner_not_assignable", "El rol de propietario no se asigna al invitar.")
    role = system_role(db, body.role)
    _assert_can_manage(ctx, role.rank)
    email = str(body.email).lower()
    existing = db.execute(select(User.id).where(User.email == email)).scalar_one_or_none()
    if existing and db.query(OrganizationMember).filter_by(organization_id=org.id, user_id=existing).first():
        raise conflict("members.exists", "Esa persona ya es miembro.")
    pending = int(
        db.execute(
            select(func.count())
            .select_from(Invitation)
            .where(Invitation.organization_id == org.id, Invitation.accepted_at.is_(None), Invitation.email != email)
        ).scalar_one()
    )
    ent = entitlements.for_organization(db, org.id)
    try:
        entitlements.ensure_can_add_member(ent, count_members(db, org.id) + pending)
    except entitlements.EntitlementError as e:
        raise ApiError(402, e.code, "Tu plan no permite más miembros.", {"limit": e.limit}) from e
    if not mailer.configured():
        raise ApiError(503, "email.not_configured", "El envío de correos no está configurado.")
    inv, raw = accounts.invite(db, org_id=org.id, inviter_id=ctx.user.id, email=email, role=role)
    background.add_task(
        mailer.send_template,
        email,
        "invite",
        ctx.user.preferred_language,
        inviter=ctx.user.full_name,
        org=org.name,
        link=_link("/invite", raw),
    )
    audit.record(
        db,
        "members.invite",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="invitation",
        target_id=inv.id,
        details={"role": body.role},
        ip=client_ip(request),
    )
    return {
        "id": str(inv.id),
        "email": email,
        "role": body.role,
        "expires_at": inv.expires_at.isoformat(),
        "expired": False,
    }


@router.delete("/api/organizations/current/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    invitation_id: UUID,
    response: Response,
    ctx: AuthContext = Depends(require_permission("members.manage")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    inv = db.execute(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.organization_id == org.id, Invitation.accepted_at.is_(None)
        )
    ).scalar_one_or_none()
    if inv is None:
        raise not_found("invitation")
    db.delete(inv)
    audit.record(
        db,
        "members.invite_revoked",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="invitation",
        target_id=invitation_id,
    )
    response.status_code = 204
    return response


@router.get("/api/invitations/preview")
def preview(
    request: Request, token: str = Query(min_length=10, max_length=200), db: Session = Depends(get_db)
) -> dict[str, object]:
    if not token_limiter.hit(f"token:{client_ip(request)}"):
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")
    info = accounts.preview_invitation(db, token)
    if info is None or info["expired"]:
        raise ApiError(400, "invitation.invalid", "La invitación no es válida o ya caducó.")
    return info


@router.post("/api/invitations/accept")
def accept(body: TokenIn, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> dict[str, str]:
    org_id = accounts.accept_invitation(db, body.token, ctx.user.id)
    if org_id is None:
        raise ApiError(400, "invitation.invalid", "La invitación no es válida, ya caducó o es para otro correo.")
    ctx.session.active_organization_id = org_id
    set_tenant_context(db, user_id=ctx.user.id, org_id=org_id)
    audit.record(db, "members.invite_accepted", organization_id=org_id, user_id=ctx.user.id)
    return {"organization_id": str(org_id)}
