"""Organizaciones, miembros, plan/uso, auditoría, exportación y eliminación.

Todas las rutas `/current/...` operan sobre la organización activa de la
sesión; el identificador nunca se toma del cliente. Además, la RLS de
PostgreSQL impide leer o escribir filas de otra organización.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, billing, entitlements
from app.agents.runner import active_agent_ids, monthly_executions
from app.api.auth import build_session_out
from app.api.deps import AuthContext, client_ip, get_auth, require_permission
from app.api.serializers import member_out, org_out
from app.db import get_db
from app.errors import ApiError, conflict, forbidden, not_found
from app.ingestion.service import storage_used_bytes
from app.models import AuditLog, OrganizationMember, Plan, Subscription, User
from app.schemas import (
    AuditLogOut,
    MemberAddIn,
    MemberOut,
    MemberUpdateIn,
    OrganizationCreateIn,
    OrganizationDeleteIn,
    OrganizationOut,
    OrganizationUpdateIn,
    PlanOut,
    SessionOut,
    SubscriptionOut,
)
from app.services import (
    count_members,
    count_owners,
    create_organization,
    memberships_of,
    organizations_by_id,
    system_role,
)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationOut])
def list_mine(ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> list[OrganizationOut]:
    members = memberships_of(db, ctx.user.id)
    orgs = organizations_by_id(db, [m.organization_id for m in members])
    return [org_out(orgs[m.organization_id]) for m in members if m.organization_id in orgs]


@router.post("", response_model=SessionOut, status_code=201)
def create(
    body: OrganizationCreateIn, request: Request, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> SessionOut:
    org = create_organization(
        db, ctx.user, body.name, country=body.country, currency=body.currency, ip=client_ip(request)
    )
    # La nueva organización pasa a ser la activa.
    ctx.session.active_organization_id = org.id
    membership = db.query(OrganizationMember).filter_by(organization_id=org.id, user_id=ctx.user.id).one()
    ctx.organization, ctx.membership = org, membership
    ctx.permissions = frozenset(p.code for p in membership.role.permissions)
    db.flush()
    return build_session_out(db, ctx)


@router.get("/current", response_model=OrganizationOut)
def get_current(ctx: AuthContext = Depends(require_permission("org.read"))) -> OrganizationOut:
    return org_out(ctx.require_org())


@router.patch("/current", response_model=OrganizationOut)
def update_current(
    body: OrganizationUpdateIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("org.update")),
    db: Session = Depends(get_db),
) -> OrganizationOut:
    org = ctx.require_org()
    changes = body.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(org, key, value)
    audit.record(
        db,
        "org.update",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="organization",
        target_id=org.id,
        details={"fields": sorted(changes)},
        ip=client_ip(request),
    )
    db.flush()
    return org_out(org)


@router.delete("/current", status_code=204)
def delete_current(
    body: OrganizationDeleteIn,
    request: Request,
    response: Response,
    ctx: AuthContext = Depends(require_permission("org.delete")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    if body.confirm_slug != org.slug:
        raise ApiError(422, "org.confirmation_mismatch", "La confirmación no coincide con el identificador.")
    ctx.session.active_organization_id = None
    db.flush()
    db.delete(org)  # ON DELETE CASCADE elimina membresías, suscripción, uso y auditoría de la organización.
    # Evento conservado sin organización (la de la org se elimina con ella).
    audit.record(
        db, "org.delete", user_id=ctx.user.id, target_type="organization", target_id=org.id, ip=client_ip(request)
    )
    response.status_code = 204
    return response


# --- Miembros -----------------------------------------------------------------


def _member_or_404(db: Session, org_id: UUID, member_id: UUID) -> OrganizationMember:
    m = db.query(OrganizationMember).filter_by(id=member_id, organization_id=org_id).one_or_none()
    if m is None:
        raise not_found("member")
    return m


def _assert_can_manage(ctx: AuthContext, target_rank: int) -> None:
    assert ctx.membership is not None
    if target_rank > ctx.membership.role.rank:
        raise forbidden("members.rank", "No puedes gestionar a alguien con un rol superior al tuyo.")


@router.get("/current/members", response_model=list[MemberOut])
def list_members(
    ctx: AuthContext = Depends(require_permission("members.read")), db: Session = Depends(get_db)
) -> list[MemberOut]:
    org = ctx.require_org()
    rows = db.query(OrganizationMember).filter_by(organization_id=org.id).order_by(OrganizationMember.created_at)
    return [member_out(m) for m in rows]


@router.post("/current/members", response_model=MemberOut, status_code=201)
def add_member(
    body: MemberAddIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("members.manage")),
    db: Session = Depends(get_db),
) -> MemberOut:
    org = ctx.require_org()
    role = system_role(db, body.role)
    _assert_can_manage(ctx, role.rank)
    ent = entitlements.for_organization(db, org.id)
    try:
        entitlements.ensure_can_add_member(ent, count_members(db, org.id))
    except entitlements.EntitlementError as e:
        raise ApiError(402, e.code, "Tu plan no permite más miembros.", {"limit": e.limit}) from e
    user = db.execute(select(User).where(User.email == str(body.email))).scalar_one_or_none()
    if user is None:
        # Las invitaciones por correo requieren envío de email (pendiente). Solo usuarios registrados.
        raise not_found("user")
    if db.query(OrganizationMember).filter_by(organization_id=org.id, user_id=user.id).first():
        raise conflict("members.exists", "Esa persona ya es miembro.")
    m = OrganizationMember(organization_id=org.id, user_id=user.id, role_id=role.id)
    db.add(m)
    db.flush()
    db.refresh(m)
    audit.record(
        db,
        "members.add",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="member",
        target_id=m.id,
        details={"role": body.role},
        ip=client_ip(request),
    )
    return member_out(m)


@router.patch("/current/members/{member_id}", response_model=MemberOut)
def update_member(
    member_id: UUID,
    body: MemberUpdateIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("members.manage")),
    db: Session = Depends(get_db),
) -> MemberOut:
    org = ctx.require_org()
    m = _member_or_404(db, org.id, member_id)
    new_role = system_role(db, body.role)
    _assert_can_manage(ctx, max(m.role.rank, new_role.rank))
    if m.role.code == "owner" and body.role != "owner" and count_owners(db, org.id) <= 1:
        raise conflict("members.last_owner", "La organización debe conservar al menos un propietario.")
    old = m.role.code
    m.role_id = new_role.id
    db.flush()
    db.refresh(m)
    audit.record(
        db,
        "members.role_change",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="member",
        target_id=m.id,
        details={"from": old, "to": body.role},
        ip=client_ip(request),
    )
    return member_out(m)


@router.delete("/current/members/{member_id}", status_code=204)
def remove_member(
    member_id: UUID,
    request: Request,
    response: Response,
    ctx: AuthContext = Depends(require_permission("members.manage")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    m = _member_or_404(db, org.id, member_id)
    _assert_can_manage(ctx, m.role.rank)
    if m.role.code == "owner" and count_owners(db, org.id) <= 1:
        raise conflict("members.last_owner", "La organización debe conservar al menos un propietario.")
    db.delete(m)
    audit.record(
        db,
        "members.remove",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="member",
        target_id=member_id,
        ip=client_ip(request),
    )
    response.status_code = 204
    return response


# --- Plan, uso, auditoría y exportación --------------------------------------


def count_datasets(db: Session, org_id: UUID) -> int:
    from sqlalchemy import func

    from app.models import Dataset

    return int(
        db.execute(select(func.count()).select_from(Dataset).where(Dataset.organization_id == org_id)).scalar_one()
    )


@router.get("/current/subscription", response_model=SubscriptionOut)
def subscription(
    ctx: AuthContext = Depends(require_permission("billing.read")), db: Session = Depends(get_db)
) -> SubscriptionOut:
    org = ctx.require_org()
    sub = db.execute(select(Subscription).where(Subscription.organization_id == org.id)).scalar_one()
    p = sub.plan
    return SubscriptionOut(
        status=sub.status,
        plan=PlanOut.model_validate(p, from_attributes=True),
        usage={
            "members": count_members(db, org.id),
            "active_agents": len(active_agent_ids(db, org.id)),
            "monthly_executions": monthly_executions(db, org.id),
            "storage_bytes": (used := storage_used_bytes(db, org.id)),
            "storage_mb": round(used / (1024 * 1024), 2),
            "datasets": count_datasets(db, org.id),
        },
        billing_enabled=not billing.missing_configuration(),
    )


@router.get("/current/audit-logs", response_model=list[AuditLogOut])
def audit_logs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: AuthContext = Depends(require_permission("audit.read")),
    db: Session = Depends(get_db),
) -> list[AuditLogOut]:
    org = ctx.require_org()
    rows = db.execute(
        select(AuditLog)
        .where(AuditLog.organization_id == org.id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    ).scalars()
    return [AuditLogOut.model_validate(r, from_attributes=True) for r in rows]


@router.get("/current/export")
def export(
    request: Request, ctx: AuthContext = Depends(require_permission("org.export")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Exportación de los datos de la organización (portabilidad)."""
    org = ctx.require_org()
    sub = db.execute(select(Subscription).where(Subscription.organization_id == org.id)).scalar_one()
    logs = db.execute(select(AuditLog).where(AuditLog.organization_id == org.id).order_by(AuditLog.id)).scalars()
    audit.record(db, "org.export", organization_id=org.id, user_id=ctx.user.id, ip=client_ip(request))
    return {
        "format": "requiem-control-export/1",
        "organization": org_out(org).model_dump(mode="json"),
        "members": [
            member_out(m).model_dump(mode="json")
            for m in db.query(OrganizationMember).filter_by(organization_id=org.id)
        ],
        "subscription": {"plan": sub.plan.code, "status": sub.status},
        "audit_logs": [AuditLogOut.model_validate(r, from_attributes=True).model_dump(mode="json") for r in logs],
    }


plans_router = APIRouter(prefix="/api/plans", tags=["plans"])


@plans_router.get("", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)) -> list[PlanOut]:
    rows = db.execute(select(Plan).where(Plan.is_public.is_(True)).order_by(Plan.price_cents)).scalars()
    return [PlanOut.model_validate(p, from_attributes=True) for p in rows]
