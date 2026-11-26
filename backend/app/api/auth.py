"""Autenticación: registro, inicio/cierre de sesión, sesión actual y organización activa."""

from typing import cast

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import AuthContext, client_ip, get_auth
from app.api.serializers import org_out, user_out
from app.config import get_settings
from app.db import get_db, set_tenant_context
from app.errors import ApiError, conflict, forbidden
from app.models import OrganizationMember, User
from app.schemas import (
    LoginIn,
    MembershipOut,
    RegisterIn,
    RoleCode,
    SessionOut,
    SwitchOrgIn,
    UpdateMeIn,
)
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.rate_limit import RateLimiter
from app.services import create_organization, create_session, memberships_of, organizations_by_id

router = APIRouter(prefix="/api/auth", tags=["auth"])

_settings = get_settings()
login_limiter = RateLimiter(_settings.login_rate_limit, _settings.login_rate_window_seconds)
register_limiter = RateLimiter(_settings.login_rate_limit, _settings.login_rate_window_seconds)


def _set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=s.session_ttl_hours * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def _validate_password(password: str, email: str) -> None:
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


def build_session_out(db: Session, ctx: AuthContext) -> SessionOut:
    members = memberships_of(db, ctx.user.id)
    orgs = organizations_by_id(db, [m.organization_id for m in members])
    return SessionOut(
        user=user_out(ctx.user),
        active_organization=org_out(ctx.organization) if ctx.organization else None,
        role=cast(RoleCode, ctx.membership.role.code) if ctx.membership else None,
        permissions=sorted(ctx.permissions),
        memberships=[
            MembershipOut(organization=org_out(orgs[m.organization_id]), role=cast(RoleCode, m.role.code))
            for m in members
            if m.organization_id in orgs
        ],
        csrf_token=ctx.session.csrf_token,
    )


@router.post("/register", response_model=SessionOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)) -> SessionOut:
    ip = client_ip(request)
    if not register_limiter.hit(f"register:{ip}"):
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")
    _validate_password(body.password, str(body.email))
    if db.execute(select(User.id).where(User.email == str(body.email))).first():
        raise conflict("auth.email_taken", "Ya existe una cuenta con ese correo.")

    user = User(
        email=str(body.email),
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        preferred_language=body.preferred_language,
    )
    db.add(user)
    db.flush()
    org = create_organization(db, user, body.organization_name, ip=ip)
    audit.record(db, "auth.register", organization_id=org.id, user_id=user.id, ip=ip)
    token, session = create_session(db, user, org.id, ip, request.headers.get("user-agent"))
    _set_session_cookie(response, token)

    set_tenant_context(db, user_id=user.id, org_id=org.id)
    membership = db.query(OrganizationMember).filter_by(organization_id=org.id, user_id=user.id).one()
    ctx = AuthContext(
        user=user,
        session=session,
        organization=org,
        membership=membership,
        permissions=frozenset(p.code for p in membership.role.permissions),
    )
    return build_session_out(db, ctx)


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> SessionOut:
    ip = client_ip(request)
    email = str(body.email).lower()
    if not login_limiter.hit(f"login:{ip}:{email}"):
        audit.record_and_commit(db, "auth.login_rate_limited", ip=ip, details={"email_domain": email.split("@")[-1]})
        raise ApiError(429, "auth.rate_limited", "Demasiados intentos. Espera un momento.")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    # Se verifica siempre (hash ficticio si no existe) para no revelar qué correos existen.
    if not verify_password(user.password_hash if user else None, body.password) or user is None or not user.is_active:
        audit.record_and_commit(db, "auth.login_failed", user_id=user.id if user else None, ip=ip)
        raise ApiError(401, "auth.invalid_credentials", "Correo o contraseña incorrectos.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    set_tenant_context(db, user_id=user.id, org_id=None)
    members = memberships_of(db, user.id)
    active_org_id = members[0].organization_id if members else None
    token, session = create_session(db, user, active_org_id, ip, request.headers.get("user-agent"))
    _set_session_cookie(response, token)
    set_tenant_context(db, user_id=user.id, org_id=active_org_id)
    audit.record(db, "auth.login", organization_id=active_org_id, user_id=user.id, ip=ip)
    login_limiter.reset(f"login:{ip}:{email}")

    ctx = AuthContext(user=user, session=session)
    if members:
        m = members[0]
        ctx.membership = m
        ctx.organization = organizations_by_id(db, [m.organization_id])[m.organization_id]
        ctx.permissions = frozenset(p.code for p in m.role.permissions)
    return build_session_out(db, ctx)


@router.post("/logout", status_code=204)
def logout(
    request: Request, response: Response, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> Response:
    audit.record(
        db,
        "auth.logout",
        organization_id=ctx.session.active_organization_id,
        user_id=ctx.user.id,
        ip=client_ip(request),
    )
    db.delete(ctx.session)
    response.status_code = 204
    response.delete_cookie(get_settings().session_cookie_name, path="/")
    return response


@router.get("/me", response_model=SessionOut)
def me(ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> SessionOut:
    return build_session_out(db, ctx)


@router.patch("/me", response_model=SessionOut)
def update_me(body: UpdateMeIn, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> SessionOut:
    if body.full_name is not None:
        ctx.user.full_name = body.full_name
    if body.preferred_language is not None:
        ctx.user.preferred_language = body.preferred_language
    db.flush()
    return build_session_out(db, ctx)


@router.post("/switch-organization", response_model=SessionOut)
def switch_organization(
    body: SwitchOrgIn, request: Request, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> SessionOut:
    membership = (
        db.query(OrganizationMember).filter_by(organization_id=body.organization_id, user_id=ctx.user.id).one_or_none()
    )
    if membership is None:
        # Misma respuesta exista o no la organización: no se revela su existencia.
        raise forbidden("org.not_member", "No perteneces a esa organización.")
    ctx.session.active_organization_id = membership.organization_id
    set_tenant_context(db, user_id=ctx.user.id, org_id=membership.organization_id)
    ctx.membership = membership
    ctx.organization = organizations_by_id(db, [membership.organization_id])[membership.organization_id]
    ctx.permissions = frozenset(p.code for p in membership.role.permissions)
    audit.record(
        db, "org.switch", organization_id=membership.organization_id, user_id=ctx.user.id, ip=client_ip(request)
    )
    db.flush()
    return build_session_out(db, ctx)
