"""Automatizaciones programadas (Fase 7): ejecutar un agente cada día, semana o mes a una hora local.

- El proceso de trabajo (worker) llama a `run_due()` cada minuto. `claim_due_automations()` reclama
  las vencidas con SKIP LOCKED (varios workers nunca disparan la misma) y devuelve solo identificadores.
- Cada disparo crea una ejecución normal (mismos límites del plan, permisos y aprobaciones) con una
  clave de idempotencia por automatización y fecha programada: nunca se duplica.
- Las acciones con efecto siguen esperando aprobación humana: una automatización solo PROPONE.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.agents import runner
from app.config import get_settings
from app.db import _session_factory, set_tenant_context
from app.errors import ApiError
from app.models import Automation

log = logging.getLogger("requiem.automations")
MAX_PER_ORG = 10


def next_run(a: Automation | Any, after: datetime) -> datetime:
    """Próxima fecha (UTC) estrictamente posterior a `after`, a la hora local elegida."""
    tz = ZoneInfo(a.timezone)
    local = after.astimezone(tz)
    candidate = local.replace(hour=a.hour, minute=0, second=0, microsecond=0)
    if a.frequency == "daily":
        if candidate <= local:
            candidate += timedelta(days=1)
    elif a.frequency == "weekly":
        days = ((a.weekday or 0) - candidate.weekday()) % 7
        candidate += timedelta(days=days)
        if candidate <= local:
            candidate += timedelta(days=7)
    else:  # monthly
        dom = a.day_of_month or 1
        candidate = candidate.replace(day=dom)
        if candidate <= local:
            month = candidate.month % 12 + 1
            year = candidate.year + (1 if month == 1 else 0)
            candidate = candidate.replace(year=year, month=month)
    # Recalcular en la zona para respetar cambios de horario.
    return candidate.replace(tzinfo=None).replace(tzinfo=tz).astimezone(UTC)


def run_due(limit: int = 20) -> int:
    db = _session_factory()()
    try:
        due = db.execute(
            text("SELECT automation_id, organization_id, user_id FROM claim_due_automations(:n)"), {"n": limit}
        ).all()
        db.commit()
    finally:
        db.close()
    fired = 0
    for row in due:
        if fire(row.automation_id, row.organization_id, row.user_id):
            fired += 1
    return fired


def fire(automation_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None) -> bool:
    db = _session_factory()()
    execution_id = None
    try:
        set_tenant_context(db, user_id=user_id, org_id=org_id)
        a = db.get(Automation, automation_id)
        if a is None or not a.active:
            return False
        now = datetime.now(UTC)
        scheduled = a.next_run_at or now
        a.next_run_at = next_run(a, now)
        a.last_run_at = now
        try:
            if user_id is None:
                raise ApiError(409, "automation.owner_missing", "La persona que creó la automatización ya no existe.")
            params = {"dataset_id": str(a.dataset_id)} if a.dataset_id else {}
            ex, _ = runner.create_execution(
                db,
                org_id=org_id,
                user_id=user_id,
                agent_id=a.agent_id,
                params=params,
                idempotency_key=f"auto-{a.id.hex[:20]}-{int(scheduled.timestamp())}",
            )
            a.last_execution_id = ex.id
            a.last_error = None
            execution_id = ex.id
        except ApiError as e:
            a.last_error = {"code": e.code, "at": now.isoformat()}
            log.warning("Automatización %s no se pudo disparar: %s", a.id, e.code)
        db.commit()
    finally:
        db.close()
    # En modo "inline" no hay cola externa para esta ejecución: se ejecuta aquí mismo.
    if execution_id is not None and get_settings().execution_mode == "inline":
        runner.run_execution(execution_id, org_id, user_id)
    return execution_id is not None
