"""Reportes, exportaciones CSV y resumen real del panel."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, reports
from app.agents.runner import active_agent_ids
from app.api.deps import AuthContext, require_permission
from app.db import get_db
from app.exports import to_csv
from app.ingestion import service as ingestion
from app.models import AgentExecution, Approval, Dataset, DatasetRow, Report
from app.schemas import ReportCreateIn, ReportOut, ReportSummaryOut

router = APIRouter(tags=["reports"])


def _summary(r: Report) -> dict[str, Any]:
    return {
        k: getattr(r, k) for k in ("id", "title", "agent_id", "dataset_id", "period_from", "period_to", "created_at")
    }


def _csv_response(text: str, filename: str) -> Response:
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "-" for ch in filename)[:80] or "export"
    return Response(
        content=text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'},
    )


@router.post("/api/reports", response_model=ReportOut, status_code=201)
def create_report(
    body: ReportCreateIn, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    r = reports.create_from_execution(
        db, org=ctx.require_org(), user_id=ctx.user.id, execution_id=body.execution_id, title=body.title
    )
    return {**_summary(r), "content": r.content, "comparison": reports.comparison(db, r)}


@router.get("/api/reports", response_model=list[ReportSummaryOut])
def list_reports(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Report)
        .where(Report.organization_id == ctx.require_org().id)
        .order_by(Report.created_at.desc())
        .limit(100)
    ).scalars()
    return [_summary(r) for r in rows]


@router.get("/api/reports/{report_id}", response_model=ReportOut)
def get_report(
    report_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    r = reports.get(db, ctx.require_org().id, report_id)
    return {**_summary(r), "content": r.content, "comparison": reports.comparison(db, r)}


@router.delete("/api/reports/{report_id}", status_code=204)
def delete_report(
    report_id: UUID,
    response: Response,
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> Response:
    r = reports.get(db, ctx.require_org().id, report_id)
    db.delete(r)
    audit.record(
        db,
        "report.delete",
        organization_id=r.organization_id,
        user_id=ctx.user.id,
        target_type="report",
        target_id=report_id,
    )
    response.status_code = 204
    return response


@router.get("/api/reports/{report_id}/export.csv")
def export_report(
    report_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> Response:
    r = reports.get(db, ctx.require_org().id, report_id)
    audit.record(
        db,
        "report.export",
        organization_id=r.organization_id,
        user_id=ctx.user.id,
        target_type="report",
        target_id=r.id,
        details={"format": "csv"},
    )
    return _csv_response(to_csv(reports.csv_rows(r)), r.title)


@router.get("/api/datasets/{dataset_id}/export.csv")
def export_dataset(
    dataset_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> Response:
    ds, _ = ingestion.get_dataset(db, ctx.require_org().id, dataset_id)
    keys = [c["key"] for c in ds.columns]
    rows: list[list[Any]] = [["Fila", *[c["name"] for c in ds.columns]]]
    for r in db.execute(
        select(DatasetRow.row_number, DatasetRow.data)
        .where(DatasetRow.dataset_id == ds.id)
        .order_by(DatasetRow.row_number)
    ):
        rows.append([r.row_number, *[r.data.get(k) for k in keys]])
    audit.record(
        db,
        "data.export",
        organization_id=ds.organization_id,
        user_id=ctx.user.id,
        target_type="dataset",
        target_id=ds.id,
        details={"format": "csv", "rows": len(rows) - 1},
    )
    return _csv_response(to_csv(rows), ds.name)


@router.get("/api/dashboard/summary")
def dashboard_summary(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Indicadores del panel calculados con los datos reales de la organización (sin datos de demostración)."""
    org = ctx.require_org()
    datasets = int(
        db.execute(select(func.count()).select_from(Dataset).where(Dataset.organization_id == org.id)).scalar_one()
    )
    latest_fin = db.execute(
        select(AgentExecution)
        .where(
            AgentExecution.organization_id == org.id,
            AgentExecution.agent_id == "financial-analyst",
            AgentExecution.status == "completed",
        )
        .order_by(AgentExecution.completed_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    recent = (
        db.execute(
            select(AgentExecution)
            .where(AgentExecution.organization_id == org.id)
            .order_by(AgentExecution.created_at.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )
    pending = int(
        db.execute(
            select(func.count())
            .select_from(Approval)
            .where(Approval.organization_id == org.id, Approval.status == "pending")
        ).scalar_one()
    )
    report_rows = (
        db.execute(select(Report).where(Report.organization_id == org.id).order_by(Report.created_at.desc()).limit(5))
        .scalars()
        .all()
    )
    recs: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None, str]] = set()
    for e in recent:
        if e.status in ("completed", "awaiting_approval") and e.output:
            ds_id = (e.output.get("dataset") or {}).get("id")
            for r in e.output.get("recommendations", [])[:3]:
                # Las ejecuciones repetidas sobre el mismo conjunto no duplican la recomendación.
                if (e.agent_id, ds_id, r["code"]) in seen:
                    continue
                seen.add((e.agent_id, ds_id, r["code"]))
                recs.append(
                    {
                        **r,
                        "execution_id": str(e.id),
                        "agent_id": e.agent_id,
                        "dataset": (e.output.get("dataset") or {}).get("name"),
                    }
                )
    financial = None
    if latest_fin and latest_fin.output:
        o = latest_fin.output
        financial = {
            "execution_id": str(latest_fin.id),
            "dataset": o.get("dataset"),
            "period": o.get("period"),
            "metrics": o.get("metrics"),
            "series": o.get("series"),
            "completed_at": latest_fin.completed_at.isoformat() if latest_fin.completed_at else None,
        }
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "datasets": datasets,
        "storage_bytes": ingestion.storage_used_bytes(db, org.id),
        "active_agents": len(active_agent_ids(db, org.id)),
        "pending_approvals": pending,
        "financial": financial,
        "recent_executions": [
            {
                "id": str(e.id),
                "agent_id": e.agent_id,
                "status": e.status,
                "created_at": e.created_at.isoformat(),
                "dataset": ((e.output or {}).get("dataset") or {}).get("name"),
            }
            for e in recent
        ],
        "recommendations": recs[:5],
        "reports": [{"id": str(r.id), "title": r.title, "created_at": r.created_at.isoformat()} for r in report_rows],
    }
