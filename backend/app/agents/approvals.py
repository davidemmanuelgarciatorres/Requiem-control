"""Aprobación humana de acciones propuestas por agentes.

1. El agente propone (tools.propose_action) → aprobación `pending`.
2. Una persona con `approvals.decide` aprueba o rechaza.
3. La transición pending → approved/rejected es ATÓMICA (UPDATE … WHERE status = 'pending'):
   dos solicitudes simultáneas o repetidas nunca ejecutan la acción dos veces.
4. El servidor ejecuta la acción aprobada y registra el resultado y la auditoría.
"""

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app import audit
from app.agents.runner import now
from app.errors import ApiError
from app.models import AgentExecution, Approval, Dataset, Organization, Report


def _remove_duplicates(db: Session, org_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    ds = db.execute(
        select(Dataset).where(Dataset.id == uuid.UUID(payload["dataset_id"]), Dataset.organization_id == org_id)
    ).scalar_one_or_none()
    if ds is None:
        raise ApiError(409, "approval.target_missing", "El conjunto de datos ya no existe.")
    db.execute(
        text(
            "DELETE FROM dataset_rows a USING dataset_rows b WHERE a.dataset_id = :d AND b.dataset_id = :d "
            "AND a.data = b.data AND a.row_number > b.row_number"
        ),
        {"d": ds.id},
    )
    remaining = int(
        db.execute(text("SELECT count(*) FROM dataset_rows WHERE dataset_id = :d"), {"d": ds.id}).scalar_one()
    )
    removed_rows = ds.row_count - remaining
    report = dict(ds.report)
    report["duplicate_rows"] = 0
    report["row_count"] = remaining
    report["issues"] = [i for i in report.get("issues", []) if i["code"] != "duplicate_rows"]
    report["duplicates_removed"] = int(report.get("duplicates_removed", 0)) + removed_rows
    ds.report = report
    ds.row_count = remaining
    db.flush()
    return {"removed_rows": removed_rows, "remaining_rows": remaining}


def _list_report(
    agent_id: str, title: str, key: str, columns: list[str]
) -> Callable[[Session, uuid.UUID, dict[str, Any]], dict[str, Any]]:
    """Guarda la lista aprobada como reporte (no toca los datos ni sistemas externos)."""

    def handler(db: Session, org_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
        org = db.get(Organization, org_id)
        rows = payload.get(key, [])
        report = Report(
            organization_id=org_id,
            agent_id=agent_id,
            title=f"{title} · {payload.get('dataset_name', '')}"[:160],
            dataset_id=uuid.UUID(payload["dataset_id"]) if payload.get("dataset_id") else None,
            content={
                "organization": org.name if org else "",
                "agent_id": agent_id,
                "agent_version": "1.0.0",
                "sources": [
                    {
                        "type": "dataset",
                        "id": payload.get("dataset_id"),
                        "name": payload.get("dataset_name"),
                        "rows": len(rows),
                    }
                ],
                "metrics": [{"key": "items", "value": len(rows), "format": "number"}],
                "tables": [{"key": key if key != "items" else "purchase_list", "columns": columns, "rows": rows}],
                "recommendations": [],
                "limitations": [{"code": "dataset_only", "params": {}}],
                "summary": None,
                "generated_by": {"provider": None, "simulated": True},
                "execution": {"id": None, "completed_at": None},
            },
        )
        db.add(report)
        db.flush()
        return {"report_id": str(report.id), "count": len(rows)}

    return handler


def _create_draft(db: Session, org_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    from app.integrations import google

    draft_id = google.create_draft(
        db,
        org_id,
        to=payload["to"],
        subject=payload.get("subject", ""),
        body=payload["body"],
        thread_id=payload.get("thread_id"),
        in_reply_to=payload.get("in_reply_to"),
    )
    return {"draft_id": draft_id, "to": payload["to"]}


ACTION_HANDLERS: dict[str, Callable[[Session, uuid.UUID, dict[str, Any]], dict[str, Any]]] = {
    "dataset.remove_duplicates": _remove_duplicates,
    "inventory.purchase_list": _list_report(
        "inventory-analyst", "Lista de compra", "items", ["product", "stock", "minimum", "suggested"]
    ),
    "customers.follow_up_list": _list_report(
        "customer-ops",
        "Seguimiento de clientes",
        "customers",
        ["customer", "orders", "total", "last_purchase", "days_since"],
    ),
    "email.create_draft": _create_draft,
}


def decide(
    db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID, approval_id: uuid.UUID, approve: bool, ip: str | None
) -> Approval:
    new_status = "approved" if approve else "rejected"
    claimed = db.execute(
        update(Approval)
        .where(Approval.id == approval_id, Approval.organization_id == org_id, Approval.status == "pending")
        .values(status=new_status, decided_by=user_id, decided_at=now())
        .returning(Approval.id)
    ).first()
    approval = db.execute(
        select(Approval).where(Approval.id == approval_id, Approval.organization_id == org_id)
    ).scalar_one_or_none()
    if approval is None:
        raise ApiError(404, "approval.not_found", "No encontrado.")
    if claimed is None:
        raise ApiError(409, "approval.already_decided", "Esta acción ya fue decidida.", {"status": approval.status})
    db.refresh(approval)
    audit.record(
        db,
        f"approval.{new_status}",
        organization_id=org_id,
        user_id=user_id,
        target_type="approval",
        target_id=approval.id,
        ip=ip,
        details={"action": approval.action_type},
    )
    if approve:
        try:
            with db.begin_nested():
                approval.result = ACTION_HANDLERS[approval.action_type](db, org_id, approval.payload)
            approval.status = "executed"
            audit.record(
                db,
                "approval.executed",
                organization_id=org_id,
                user_id=user_id,
                target_type="approval",
                target_id=approval.id,
                details=approval.result,
            )
        except ApiError as e:
            approval.status = "failed"
            approval.result = {"error": e.code}
    _complete_execution_if_done(db, approval.execution_id)
    db.flush()
    return approval


def _complete_execution_if_done(db: Session, execution_id: uuid.UUID) -> None:
    pending = db.execute(
        select(func.count())
        .select_from(Approval)
        .where(Approval.execution_id == execution_id, Approval.status == "pending")
    ).scalar_one()
    execution = db.get(AgentExecution, execution_id)
    if execution is not None and execution.status == "awaiting_approval" and not pending:
        execution.status = "completed"
        execution.completed_at = now()
