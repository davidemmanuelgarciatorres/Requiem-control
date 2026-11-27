"""Derechos del plan, validados SIEMPRE en el servidor.

Los límites viven en la tabla `plans` (columnas y `features`), configurables sin tocar código.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Plan, Subscription, UsageRecord

AiTier = Literal["basic", "advanced"]
# Herramienta → (clave del límite en `features`, métrica en usage_records). Límite mensual (mes calendario UTC).
TOOLS: dict[str, tuple[str, str]] = {
    "assistant": ("max_assistant_questions", "assistant.question"),
    "imports": ("max_imports", "data.import"),
    "exports": ("max_exports", "report.export"),
}
# Valores por omisión si un plan no los define (los del plan gratuito).
DEFAULTS: dict[str, Any] = {
    "ai_tier": "basic",
    "max_assistant_questions": 50,
    "max_imports": 20,
    "max_exports": 30,
    "max_automations": 2,
}


class EntitlementError(Exception):
    """Se intentó superar un límite del plan."""

    def __init__(self, code: str, limit: int, tool: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.limit = limit
        self.tool = tool


@dataclass(frozen=True)
class Entitlements:
    plan_code: str
    max_active_agents: int
    max_monthly_executions: int
    max_storage_mb: int
    max_members: int
    features: dict[str, Any]

    @property
    def ai_tier(self) -> AiTier:
        return "advanced" if self.features.get("ai_tier", DEFAULTS["ai_tier"]) == "advanced" else "basic"

    def limit(self, key: str) -> int:
        return int(self.features.get(key, DEFAULTS[key]))


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
        features=dict(plan.features or {}),
    )


def ensure_can_activate_agent(ent: Entitlements, currently_active: int) -> None:
    """Plan gratuito: máximo 2 agentes activos."""
    if currently_active + 1 > ent.max_active_agents:
        raise EntitlementError("plan.max_active_agents", ent.max_active_agents)


def ensure_can_add_member(ent: Entitlements, current_members: int) -> None:
    if current_members + 1 > ent.max_members:
        raise EntitlementError("plan.max_members", ent.max_members)


def ensure_can_add_automation(ent: Entitlements, current_active: int) -> None:
    limit = ent.limit("max_automations")
    if current_active + 1 > limit:
        raise EntitlementError("plan.limit_reached", limit, "automations")


def _month_start() -> datetime:
    n = datetime.now(UTC)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def used_this_month(db: Session, organization_id: UUID, tool: str) -> int:
    metric = TOOLS[tool][1]
    return int(
        db.execute(
            select(func.coalesce(func.sum(UsageRecord.quantity), 0)).where(
                UsageRecord.organization_id == organization_id,
                UsageRecord.metric == metric,
                UsageRecord.period_start == _month_start(),
            )
        ).scalar_one()
    )


def ensure_tool_available(db: Session, organization_id: UUID, tool: str) -> Entitlements:
    """Comprueba el límite mensual ANTES de trabajar; el uso se anota con `record_use` si todo salió bien."""
    ent = for_organization(db, organization_id)
    limit = ent.limit(TOOLS[tool][0])
    if used_this_month(db, organization_id, tool) >= limit:
        raise EntitlementError("plan.limit_reached", limit, tool)
    return ent


def record_use(db: Session, organization_id: UUID, tool: str) -> None:
    db.add(UsageRecord(organization_id=organization_id, metric=TOOLS[tool][1], quantity=1, period_start=_month_start()))
    db.flush()


def usage_summary(db: Session, organization_id: UUID) -> dict[str, dict[str, int]]:
    ent = for_organization(db, organization_id)
    return {
        tool: {"used": used_this_month(db, organization_id, tool), "limit": ent.limit(key)}
        for tool, (key, _metric) in TOOLS.items()
    }
