"""Derechos del plan, validados SIEMPRE en el servidor.

Los límites viven en la tabla `plans` (configurables sin tocar código).
"""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Plan, Subscription


class EntitlementError(Exception):
    """Se intentó superar un límite del plan."""

    def __init__(self, code: str, limit: int) -> None:
        super().__init__(code)
        self.code = code
        self.limit = limit


@dataclass(frozen=True)
class Entitlements:
    plan_code: str
    max_active_agents: int
    max_monthly_executions: int
    max_storage_mb: int
    max_members: int


def for_organization(db: Session, organization_id: UUID) -> Entitlements:
    plan = db.execute(
        select(Plan)
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.organization_id == organization_id, Subscription.status.in_(("active", "trialing")))
    ).scalar_one_or_none()
    if plan is None:  # sin suscripción activa → reglas del plan gratuito
        plan = db.execute(select(Plan).where(Plan.code == "free")).scalar_one()
    return Entitlements(
        plan_code=plan.code,
        max_active_agents=plan.max_active_agents,
        max_monthly_executions=plan.max_monthly_executions,
        max_storage_mb=plan.max_storage_mb,
        max_members=plan.max_members,
    )


def ensure_can_activate_agent(ent: Entitlements, currently_active: int) -> None:
    """Usado por el motor de agentes (Fase 4). Plan gratuito: máximo 2 agentes activos."""
    if currently_active + 1 > ent.max_active_agents:
        raise EntitlementError("plan.max_active_agents", ent.max_active_agents)


def ensure_can_add_member(ent: Entitlements, current_members: int) -> None:
    if current_members + 1 > ent.max_members:
        raise EntitlementError("plan.max_members", ent.max_members)
