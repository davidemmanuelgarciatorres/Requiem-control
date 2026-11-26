"""Ciclo de vida de las ejecuciones de agentes.

created → queued → running → (awaiting_approval →) completed | failed | cancelled

La ejecución se encola en la misma API (tarea en segundo plano tras responder 202).
Un worker independiente se añadirá cuando la carga lo justifique; el contrato no cambia.
"""

import logging
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, entitlements
from app.agents import data_analyst, financial_analyst
from app.agents.providers import ProviderError
from app.agents.tools import AgentInputError, ToolContext, ToolNotAllowed
from app.db import _session_factory, set_tenant_context
from app.errors import ApiError
from app.models import AgentDefinition, AgentExecution, Approval, OrganizationAgent, User

log = logging.getLogger("requiem.agents")

AGENT_IMPLEMENTATIONS: dict[str, Callable[[ToolContext, dict[str, Any]], dict[str, Any]]] = {
    "data-analyst": data_analyst.run,
    "financial-analyst": financial_analyst.run,
}
TERMINAL = {"completed", "failed", "cancelled"}


def now() -> datetime:
    return datetime.now(UTC)


def month_start() -> datetime:
    n = now()
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def active_agent_ids(db: Session, org_id: uuid.UUID) -> set[str]:
    return set(
        db.execute(
            select(OrganizationAgent.agent_id).where(
                OrganizationAgent.organization_id == org_id, OrganizationAgent.active.is_(True)
            )
        ).scalars()
    )


def monthly_executions(db: Session, org_id: uuid.UUID) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(AgentExecution)
            .where(AgentExecution.organization_id == org_id, AgentExecution.created_at >= month_start())
        ).scalar_one()
    )


def set_activation(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID, agent_id: str, active: bool) -> None:
    definition = db.get(AgentDefinition, agent_id)
    if definition is None:
        raise ApiError(404, "agent.not_found", "Agente no encontrado.")
    if active and definition.status != "available":
        raise ApiError(409, "agent.unavailable", "Este agente aún no está disponible.")
    current = active_agent_ids(db, org_id)
    if active and agent_id not in current:
        ent = entitlements.for_organization(db, org_id)
        try:
            entitlements.ensure_can_activate_agent(ent, len(current))
        except entitlements.EntitlementError as e:
            raise ApiError(402, e.code, "Tu plan no permite más agentes activos.", {"limit": e.limit}) from e
    row = db.get(OrganizationAgent, (org_id, agent_id))
    if row is None:
        row = OrganizationAgent(organization_id=org_id, agent_id=agent_id)
        db.add(row)
    row.active = active
    row.updated_by = user_id
    row.updated_at = now()
    audit.record(
        db,
        "agent.activate" if active else "agent.deactivate",
        organization_id=org_id,
        user_id=user_id,
        target_type="agent",
        target_id=agent_id,
    )
    db.flush()


def create_execution(
    db: Session,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    agent_id: str,
    params: dict[str, Any],
    idempotency_key: str | None,
) -> tuple[AgentExecution, bool]:
    """Crea y encola una ejecución. Devuelve (ejecución, creada). Con la misma clave de idempotencia
    devuelve la ejecución existente en lugar de crear otra."""
    if idempotency_key:
        existing = db.execute(
            select(AgentExecution).where(
                AgentExecution.organization_id == org_id, AgentExecution.idempotency_key == idempotency_key
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False
    definition = db.get(AgentDefinition, agent_id)
    if definition is None or agent_id not in AGENT_IMPLEMENTATIONS:
        raise ApiError(404, "agent.not_found", "Agente no encontrado.")
    if agent_id not in active_agent_ids(db, org_id):
        raise ApiError(409, "agent.inactive", "Activa el agente antes de ejecutarlo.")
    ent = entitlements.for_organization(db, org_id)
    if monthly_executions(db, org_id) >= ent.max_monthly_executions:
        raise ApiError(
            402,
            "plan.max_monthly_executions",
            "Alcanzaste el límite mensual de ejecuciones de tu plan.",
            {"limit": ent.max_monthly_executions},
        )
    execution = AgentExecution(
        organization_id=org_id,
        user_id=user_id,
        agent_id=agent_id,
        agent_version=definition.version,
        status="created",
        input=params,
        idempotency_key=idempotency_key,
    )
    db.add(execution)
    db.flush()
    execution.status = "queued"
    execution.queued_at = now()
    audit.record(
        db,
        "agent.run",
        organization_id=org_id,
        user_id=user_id,
        target_type="execution",
        target_id=execution.id,
        details={"agent": agent_id},
    )
    db.flush()
    return execution, True


def run_execution(execution_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None) -> None:
    """Ejecuta un agente en su propia transacción (tras responder al cliente)."""
    db = _session_factory()()
    try:
        set_tenant_context(db, user_id=user_id, org_id=org_id)
        execution = db.get(AgentExecution, execution_id)
        if execution is None or execution.status != "queued":
            return
        definition = db.get(AgentDefinition, execution.agent_id)
        assert definition is not None
        user = db.get(User, user_id) if user_id else None
        execution.status = "running"
        execution.started_at = now()
        db.commit()
        set_tenant_context(db, user_id=user_id, org_id=org_id)

        ctx = ToolContext(
            db=db,
            organization_id=org_id,
            user_id=user_id,
            execution=execution,
            definition=definition,
            language=user.preferred_language if user else "es",
        )
        started = time.monotonic()
        try:
            output = AGENT_IMPLEMENTATIONS[definition.id](ctx, execution.input)
            if time.monotonic() - started > definition.timeout_seconds:
                raise AgentInputError("agent.timeout", "La ejecución superó el tiempo máximo del agente.")
            usage: dict[str, Any] = {"provider": None, "tools": ctx.calls}
            summary = None
            if "summarize" in definition.allowed_tools:
                try:
                    result = ctx.call("summarize", facts=output.get("facts", {}))
                    summary = {
                        "text": result.text,
                        "provider": result.provider,
                        "model": result.model,
                        "simulated": result.simulated,
                    }
                    usage.update(
                        provider=result.provider,
                        model=result.model,
                        simulated=result.simulated,
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                        cost_usd=result.cost_usd,
                    )
                except ProviderError as e:
                    # El análisis determinista se entrega igual; solo falta el resumen redactado.
                    log.warning("AI provider failed for execution %s: %s", execution_id, e.code)
                    output["summary_error"] = e.code
            output.pop("facts", None)
            output["summary"] = summary
            execution.output = output
            execution.usage = usage
            pending = db.execute(
                select(func.count())
                .select_from(Approval)
                .where(Approval.execution_id == execution.id, Approval.status == "pending")
            ).scalar_one()
            execution.status = "awaiting_approval" if pending else "completed"
            if not pending:
                execution.completed_at = now()
            audit.record(
                db,
                "agent.complete",
                organization_id=org_id,
                user_id=user_id,
                target_type="execution",
                target_id=execution.id,
                details={"agent": definition.id, "status": execution.status},
            )
            db.commit()
        except (AgentInputError, ToolNotAllowed) as e:
            db.rollback()
            set_tenant_context(db, user_id=user_id, org_id=org_id)
            code = e.code if isinstance(e, AgentInputError) else "agent.tool_not_allowed"
            params = e.params if isinstance(e, AgentInputError) else {"tool": e.tool}
            _fail(db, execution_id, org_id, user_id, code, str(e), params)
        except Exception:
            log.exception("Agent execution %s crashed", execution_id)
            db.rollback()
            set_tenant_context(db, user_id=user_id, org_id=org_id)
            _fail(db, execution_id, org_id, user_id, "agent.internal_error", "Ocurrió un error inesperado.", {})
    finally:
        db.close()


def _fail(
    db: Session,
    execution_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    code: str,
    message: str,
    params: dict[str, Any],
) -> None:
    execution = db.get(AgentExecution, execution_id)
    if execution is None:
        return
    execution.status = "failed"
    execution.error = {"code": code, "message": message, "params": params}
    execution.completed_at = now()
    audit.record(
        db,
        "agent.fail",
        organization_id=org_id,
        user_id=user_id,
        target_type="execution",
        target_id=execution_id,
        details={"code": code},
    )
    db.commit()


def cancel_execution(db: Session, execution: AgentExecution, user_id: uuid.UUID) -> None:
    if execution.status not in ("created", "queued", "awaiting_approval"):
        raise ApiError(409, "agent.not_cancellable", "Esta ejecución ya no se puede cancelar.")
    execution.status = "cancelled"
    execution.completed_at = now()
    for approval in db.execute(
        select(Approval).where(Approval.execution_id == execution.id, Approval.status == "pending")
    ).scalars():
        approval.status = "cancelled"
        approval.decided_by = user_id
        approval.decided_at = now()
    audit.record(
        db,
        "agent.cancel",
        organization_id=execution.organization_id,
        user_id=user_id,
        target_type="execution",
        target_id=execution.id,
    )
    db.flush()
