"""Reportes: instantánea estructurada de una ejecución completada, comparación con el reporte
anterior del mismo agente y exportación CSV."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.errors import ApiError, not_found
from app.models import AgentExecution, Organization, Report

AGENT_TITLES = {"financial-analyst": "Análisis financiero", "data-analyst": "Calidad de datos"}


def create_from_execution(
    db: Session, *, org: Organization, user_id: uuid.UUID, execution_id: uuid.UUID, title: str | None
) -> Report:
    ex = db.execute(
        select(AgentExecution).where(AgentExecution.id == execution_id, AgentExecution.organization_id == org.id)
    ).scalar_one_or_none()
    if ex is None:
        raise not_found("execution")
    if ex.status != "completed" or not ex.output:
        raise ApiError(
            409, "report.execution_not_completed", "Solo se pueden generar reportes de análisis completados."
        )
    existing = db.execute(select(Report).where(Report.execution_id == ex.id)).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotente: un reporte por ejecución
    out = ex.output
    period = out.get("period") or {}
    dataset = out.get("dataset") or {}
    content = {
        "organization": org.name,
        "agent_id": ex.agent_id,
        "agent_version": ex.agent_version,
        "sources": [
            {"type": "dataset", "id": dataset.get("id"), "name": dataset.get("name"), "rows": dataset.get("row_count")}
        ],
        "columns_used": out.get("columns_used"),
        "metrics": out.get("metrics", []),
        "series": out.get("series"),
        "breakdown": out.get("breakdown"),
        "unusual": out.get("unusual"),
        "recommendations": out.get("recommendations", []),
        "limitations": out.get("limitations", []),
        "summary": out.get("summary"),
        "generated_by": ex.usage,
        "execution": {"id": str(ex.id), "completed_at": ex.completed_at.isoformat() if ex.completed_at else None},
    }
    name = dataset.get("name") or ""
    report = Report(
        organization_id=org.id,
        created_by=user_id,
        execution_id=ex.id,
        agent_id=ex.agent_id,
        dataset_id=uuid.UUID(dataset["id"]) if dataset.get("id") else None,
        title=(title or f"{AGENT_TITLES.get(ex.agent_id, ex.agent_id)} · {name}").strip()[:160],
        period_from=date.fromisoformat(period["from"]) if period.get("from") else None,
        period_to=date.fromisoformat(period["to"]) if period.get("to") else None,
        content=content,
    )
    db.add(report)
    db.flush()
    audit.record(
        db, "report.create", organization_id=org.id, user_id=user_id, target_type="report", target_id=report.id
    )
    return report


def get(db: Session, org_id: uuid.UUID, report_id: uuid.UUID) -> Report:
    r = db.execute(select(Report).where(Report.id == report_id, Report.organization_id == org_id)).scalar_one_or_none()
    if r is None:
        raise not_found("report")
    return r


def comparison(db: Session, report: Report) -> dict[str, Any] | None:
    """Compara los indicadores con el reporte anterior del mismo agente en la organización."""
    prev = db.execute(
        select(Report)
        .where(
            Report.organization_id == report.organization_id,
            Report.agent_id == report.agent_id,
            Report.created_at < report.created_at,
            Report.id != report.id,
        )
        .order_by(Report.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if prev is None:
        return None
    before = {m["key"]: m for m in prev.content.get("metrics", [])}
    rows = []
    for m in report.content.get("metrics", []):
        b = before.get(m["key"])
        if b is None:
            continue
        delta = m["value"] - b["value"]
        rel = (delta / abs(b["value"])) if b["value"] else None
        rows.append(
            {
                "key": m["key"],
                "format": m["format"],
                "current": m["value"],
                "previous": b["value"],
                "delta": round(delta, 4),
                "delta_pct": round(rel, 4) if rel is not None else None,
            }
        )
    return {
        "previous_id": str(prev.id),
        "previous_title": prev.title,
        "previous_created_at": prev.created_at.isoformat(),
        "previous_period": {
            "from": prev.period_from.isoformat() if prev.period_from else None,
            "to": prev.period_to.isoformat() if prev.period_to else None,
        },
        "metrics": rows,
    }


def csv_rows(report: Report) -> list[list[Any]]:
    c = report.content
    rows: list[list[Any]] = [
        ["REQUIEM CONTROL", "Reporte"],
        ["Título", report.title],
        ["Organización", c.get("organization")],
        [
            "Periodo",
            report.period_from.isoformat() if report.period_from else "",
            report.period_to.isoformat() if report.period_to else "",
        ],
        ["Generado", report.created_at.isoformat()],
        ["Fuente", ", ".join(str(s.get("name")) for s in c.get("sources", []))],
        [],
        ["Indicador", "Valor", "Formato"],
        *[[m["key"], m["value"], m["format"]] for m in c.get("metrics", [])],
    ]
    if c.get("series"):
        rows += [[], ["Periodo", "Total", "Movimientos"], *[[s["period"], s["total"], s["count"]] for s in c["series"]]]
    if c.get("breakdown"):
        rows += [
            [],
            [c["breakdown"]["dimension"], "Total", "Participación"],
            *[[i["label"], i["total"], i["share"]] for i in c["breakdown"]["items"]],
        ]
    if c.get("unusual"):
        rows += [
            [],
            ["Fila", "Fecha", "Importe", "Grupo"],
            *[[u["row_number"], u["date"], u["amount"], u["label"]] for u in c["unusual"]],
        ]
    rows += [
        [],
        ["Recomendación", "Severidad", "Parámetros"],
        *[
            [r["code"], r["severity"], "; ".join(f"{k}={v}" for k, v in r.get("params", {}).items())]
            for r in c.get("recommendations", [])
        ],
    ]
    rows += [
        [],
        ["Limitación", "Parámetros"],
        *[
            [li["code"], "; ".join(f"{k}={v}" for k, v in li.get("params", {}).items())]
            for li in c.get("limitations", [])
        ],
    ]
    return rows
