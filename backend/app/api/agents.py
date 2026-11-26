"""Agentes de IA: catálogo, activación, ejecuciones (con ciclo de vida) y aprobaciones humanas."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import entitlements
from app.agents import approvals as approvals_service
from app.agents import runner
from app.agents.providers import provider_status
from app.api.deps import AuthContext, client_ip, require_permission
from app.config import get_settings
from app.db import get_db, set_tenant_context
from app.errors import not_found
from app.models import AgentDefinition, AgentExecution, Approval
from app.schemas import (
    ActivationIn,
    AgentsOut,
    ApprovalOut,
    DecisionIn,
    ExecutionOut,
    ProviderOut,
    RunAgentIn,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])
approvals_router = APIRouter(prefix="/api/approvals", tags=["approvals"])


def _execution_out(db: Session, e: AgentExecution) -> dict[str, Any]:
    aps = db.execute(select(Approval).where(Approval.execution_id == e.id).order_by(Approval.requested_at)).scalars()
    return {
        **{
            k: getattr(e, k)
            for k in (
                "id",
                "agent_id",
                "agent_version",
                "status",
                "input",
                "output",
                "error",
                "usage",
                "created_at",
                "queued_at",
                "started_at",
                "completed_at",
            )
        },
        "approvals": [ApprovalOut.model_validate(a, from_attributes=True) for a in aps],
    }


def _get_execution(db: Session, org_id: UUID, execution_id: UUID) -> AgentExecution:
    e = db.execute(
        select(AgentExecution).where(AgentExecution.id == execution_id, AgentExecution.organization_id == org_id)
    ).scalar_one_or_none()
    if e is None:
        raise not_found("execution")
    return e


@router.get("", response_model=AgentsOut)
def list_agents(
    ctx: AuthContext = Depends(require_permission("org.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    org = ctx.require_org()
    active = runner.active_agent_ids(db, org.id)
    ent = entitlements.for_organization(db, org.id)
    defs = db.execute(
        select(AgentDefinition)
        .where(AgentDefinition.status != "retired")
        .order_by(AgentDefinition.phase, AgentDefinition.id)
    ).scalars()
    return {
        "agents": [
            {
                **{
                    k: getattr(d, k)
                    for k in (
                        "id",
                        "version",
                        "status",
                        "read_only",
                        "requires_approval",
                        "allowed_tools",
                        "required_permissions",
                        "timeout_seconds",
                        "phase",
                    )
                },
                "active": d.id in active,
            }
            for d in defs
        ],
        "active_count": len(active),
        "active_limit": ent.max_active_agents,
        "monthly_executions": runner.monthly_executions(db, org.id),
        "monthly_limit": ent.max_monthly_executions,
    }


@router.get("/provider", response_model=ProviderOut)
def get_provider_status(_: AuthContext = Depends(require_permission("org.read"))) -> dict[str, Any]:
    s = provider_status()
    return {
        "provider": s.provider,
        "model": s.model,
        "simulated": s.simulated,
        "configured": s.configured,
        "note": s.note,
    }


@router.put("/{agent_id}/activation", status_code=204)
def set_activation(
    agent_id: str,
    body: ActivationIn,
    response: Response,
    ctx: AuthContext = Depends(require_permission("agents.manage")),
    db: Session = Depends(get_db),
) -> Response:
    runner.set_activation(db, org_id=ctx.require_org().id, user_id=ctx.user.id, agent_id=agent_id, active=body.active)
    response.status_code = 204
    return response


@router.post("/{agent_id}/executions", response_model=ExecutionOut, status_code=202)
def run_agent(
    agent_id: str,
    body: RunAgentIn,
    background: BackgroundTasks,
    response: Response,
    ctx: AuthContext = Depends(require_permission("agents.run")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    org = ctx.require_org()
    execution, created = runner.create_execution(
        db,
        org_id=org.id,
        user_id=ctx.user.id,
        agent_id=agent_id,
        params={"dataset_id": str(body.dataset_id)} if body.dataset_id else {},
        idempotency_key=body.idempotency_key,
    )
    if created:
        # Confirmar ANTES de encolar: la tarea usa su propia conexión y debe ver la ejecución.
        db.commit()
        set_tenant_context(db, user_id=ctx.user.id, org_id=org.id)
    out = _execution_out(db, execution)
    if created:
        if get_settings().execution_mode == "inline":
            background.add_task(runner.run_execution, execution.id, org.id, ctx.user.id)
        # En modo "worker" la ejecución queda en cola y la toma `python -m app.worker`.
    else:
        response.status_code = 200
    return out


@router.get("/executions", response_model=list[ExecutionOut])
def list_executions(
    limit: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    org = ctx.require_org()
    rows = db.execute(
        select(AgentExecution)
        .where(AgentExecution.organization_id == org.id)
        .order_by(AgentExecution.created_at.desc())
        .limit(limit)
    ).scalars()
    return [_execution_out(db, e) for e in rows]


@router.get("/executions/{execution_id}", response_model=ExecutionOut)
def get_execution(
    execution_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return _execution_out(db, _get_execution(db, ctx.require_org().id, execution_id))


@router.post("/executions/{execution_id}/cancel", response_model=ExecutionOut)
def cancel(
    execution_id: UUID, ctx: AuthContext = Depends(require_permission("agents.run")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    e = _get_execution(db, ctx.require_org().id, execution_id)
    runner.cancel_execution(db, e, ctx.user.id)
    return _execution_out(db, e)


@approvals_router.get("", response_model=list[ApprovalOut])
def list_approvals(
    status: str | None = Query(None, pattern=r"^(pending|approved|rejected|executed|failed|cancelled)$"),
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> list[Approval]:
    q = select(Approval).where(Approval.organization_id == ctx.require_org().id)
    if status:
        q = q.where(Approval.status == status)
    return list(db.execute(q.order_by(Approval.requested_at.desc()).limit(50)).scalars())


@approvals_router.post("/{approval_id}/decision", response_model=ApprovalOut)
def decide(
    approval_id: UUID,
    body: DecisionIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("approvals.decide")),
    db: Session = Depends(get_db),
) -> Approval:
    return approvals_service.decide(
        db,
        org_id=ctx.require_org().id,
        user_id=ctx.user.id,
        approval_id=approval_id,
        approve=body.decision == "approve",
        ip=client_ip(request),
    )
