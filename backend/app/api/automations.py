"""Automatizaciones (Fase 7): programar agentes. Requiere `agents.manage`; ver la lista, `data.read`."""

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID
from zoneinfo import available_timezones

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, automations
from app.agents.runner import AGENT_IMPLEMENTATIONS, DATASET_AGENTS
from app.api.deps import AuthContext, require_permission
from app.db import get_db
from app.errors import ApiError, not_found
from app.models import Automation, Dataset

router = APIRouter(prefix="/api/automations", tags=["automations"])
_TZ = available_timezones()


class AutomationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    agent_id: str = Field(max_length=48)
    dataset_id: UUID | None = None
    frequency: Literal["daily", "weekly", "monthly"]
    hour: int = Field(ge=0, le=23)
    weekday: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    timezone: str = Field(default="America/Mexico_City", max_length=64)
    active: bool = True


def _out(a: Automation) -> dict[str, Any]:
    return {
        k: getattr(a, k)
        for k in (
            "id",
            "name",
            "agent_id",
            "dataset_id",
            "frequency",
            "hour",
            "weekday",
            "day_of_month",
            "timezone",
            "active",
            "next_run_at",
            "last_run_at",
            "last_execution_id",
            "last_error",
            "created_at",
        )
    }


def _validate(db: Session, org_id: UUID, body: AutomationIn) -> None:
    if body.agent_id not in AGENT_IMPLEMENTATIONS:
        raise ApiError(422, "automation.invalid_agent", "Agente no válido.")
    if body.timezone not in _TZ:
        raise ApiError(422, "automation.invalid_timezone", "Zona horaria no válida.")
    if body.agent_id in DATASET_AGENTS:
        if body.dataset_id is None:
            raise ApiError(422, "agent.dataset_required", "Elige un conjunto de datos.")
        if (
            db.execute(
                select(Dataset.id).where(Dataset.id == body.dataset_id, Dataset.organization_id == org_id)
            ).first()
            is None
        ):
            raise not_found("dataset")
    if body.frequency == "weekly" and body.weekday is None:
        raise ApiError(422, "automation.weekday_required", "Elige el día de la semana.")
    if body.frequency == "monthly" and body.day_of_month is None:
        raise ApiError(422, "automation.day_required", "Elige el día del mes.")


@router.get("")
def list_automations(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Automation).where(Automation.organization_id == ctx.require_org().id).order_by(Automation.created_at)
    ).scalars()
    return [_out(a) for a in rows]


@router.post("", status_code=201)
def create(
    body: AutomationIn, ctx: AuthContext = Depends(require_permission("agents.manage")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    org = ctx.require_org()
    _validate(db, org.id, body)
    count = int(
        db.execute(
            select(func.count()).select_from(Automation).where(Automation.organization_id == org.id)
        ).scalar_one()
    )
    if count >= automations.MAX_PER_ORG:
        raise ApiError(
            409, "automation.limit", "Alcanzaste el máximo de automatizaciones.", {"limit": automations.MAX_PER_ORG}
        )
    a = Automation(organization_id=org.id, created_by=ctx.user.id, **body.model_dump())
    a.next_run_at = automations.next_run(a, datetime.now(UTC)) if a.active else None
    db.add(a)
    db.flush()
    audit.record(
        db,
        "automation.create",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="automation",
        target_id=a.id,
        details={"agent": a.agent_id, "frequency": a.frequency},
    )
    return _out(a)


@router.put("/{automation_id}")
def update(
    automation_id: UUID,
    body: AutomationIn,
    ctx: AuthContext = Depends(require_permission("agents.manage")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    org = ctx.require_org()
    a = db.execute(
        select(Automation).where(Automation.id == automation_id, Automation.organization_id == org.id)
    ).scalar_one_or_none()
    if a is None:
        raise not_found("automation")
    _validate(db, org.id, body)
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    a.next_run_at = automations.next_run(a, datetime.now(UTC)) if a.active else None
    db.flush()
    audit.record(
        db, "automation.update", organization_id=org.id, user_id=ctx.user.id, target_type="automation", target_id=a.id
    )
    return _out(a)


@router.delete("/{automation_id}", status_code=204)
def delete(
    automation_id: UUID,
    response: Response,
    ctx: AuthContext = Depends(require_permission("agents.manage")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    a = db.execute(
        select(Automation).where(Automation.id == automation_id, Automation.organization_id == org.id)
    ).scalar_one_or_none()
    if a is None:
        raise not_found("automation")
    db.delete(a)
    audit.record(
        db,
        "automation.delete",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="automation",
        target_id=automation_id,
    )
    response.status_code = 204
    return response
