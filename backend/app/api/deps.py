"""Dependencias de autenticación, contexto de inquilino, CSRF y permisos."""

import ipaddress
from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, set_tenant_context
from app.errors import ApiError, forbidden, unauthorized
from app.models import Organization, OrganizationMember, User, UserSession
from app.security.tokens import tokens_match
from app.services import load_session, now

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class AuthContext:
    user: User
    session: UserSession
    organization: Organization | None = None
    membership: OrganizationMember | None = None
    permissions: frozenset[str] = field(default_factory=frozenset)

    def require_org(self) -> Organization:
        if self.organization is None:
            raise ApiError(409, "org.none_active", "No hay una organización activa.")
        return self.organization


def client_ip(request: Request) -> str | None:
    """IP del cliente si es una dirección válida (si no, None). Detrás de un proxy habrá que
    configurar uvicorn con --proxy-headers y la lista de proxies de confianza."""
    host = request.client.host if request.client else None
    try:
        return str(ipaddress.ip_address(host)) if host else None
    except ValueError:
        return None


def get_auth(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise unauthorized()
    session = load_session(db, token)
    if session is None:
        raise unauthorized("La sesión expiró o no es válida.")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise unauthorized()

    # CSRF: toda petición que cambia estado debe traer el token ligado a la sesión.
    if request.method not in SAFE_METHODS:
        sent = request.headers.get(settings.csrf_header_name, "")
        if not sent or not tokens_match(sent, session.csrf_token):
            raise forbidden("auth.csrf", "Token CSRF inválido o ausente.")

    set_tenant_context(db, user_id=user.id, org_id=session.active_organization_id)
    ctx = AuthContext(user=user, session=session)
    if session.active_organization_id:
        membership = db.query(OrganizationMember).filter_by(
            organization_id=session.active_organization_id, user_id=user.id
        ).one_or_none()
        if membership is None:
            # Ya no es miembro (lo quitaron): se descarta la organización activa.
            session.active_organization_id = None
            set_tenant_context(db, user_id=user.id, org_id=None)
        else:
            ctx.membership = membership
            ctx.organization = db.get(Organization, membership.organization_id)
            ctx.permissions = frozenset(p.code for p in membership.role.permissions)
    session.last_seen_at = now()
    return ctx


def require_permission(code: str) -> Callable[[AuthContext], AuthContext]:
    def checker(ctx: AuthContext = Depends(get_auth)) -> AuthContext:
        ctx.require_org()
        if code not in ctx.permissions:
            raise forbidden()
        return ctx

    return checker
