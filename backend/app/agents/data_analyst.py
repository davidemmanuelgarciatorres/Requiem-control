"""Analista de datos: calidad, estructura y recomendaciones explicables de un conjunto importado."""

from typing import Any

from app.agents.tools import ToolContext, count_duplicate_rows


def run(ctx: ToolContext, params: dict[str, Any]) -> dict[str, Any]:
    ds, df = ctx.call("read_dataset", dataset_id=params["dataset_id"])
    report: dict[str, Any] = ctx.call("dataset_quality", dataset_id=params["dataset_id"])
    es = ctx.language != "en"

    recommendations: list[dict[str, Any]] = []
    # Duplicados exactos (sobre valores ya tipados) → acción propuesta que requiere aprobación.
    dup = count_duplicate_rows(ctx.db, ds.id)
    if dup:
        approval = ctx.call(
            "propose_action", action_type="dataset.remove_duplicates", payload={"dataset_id": str(ds.id)}
        )
        recommendations.append(
            {
                "code": "remove_duplicates",
                "severity": "warning",
                "params": {"count": dup},
                "evidence": {"rows": _issue_rows(report, "duplicate_rows")},
                "approval_id": str(approval.id),
            }
        )
    for issue in report.get("issues", []):
        col = issue.get("column")
        if issue["code"] == "missing_values":
            recommendations.append(
                {
                    "code": "fill_missing",
                    "severity": issue["severity"],
                    "params": {"column": col, "count": issue["count"], "pct": issue["pct"]},
                    "evidence": {"rows": issue.get("rows", [])},
                }
            )
        elif issue["code"] == "mixed_types":
            recommendations.append(
                {
                    "code": "fix_types",
                    "severity": "warning",
                    "params": {"column": col, "count": issue["count"], "expected": issue["expected"]},
                    "evidence": {"rows": issue.get("rows", []), "examples": issue.get("examples", [])},
                }
            )
        elif issue["code"] == "outliers":
            recommendations.append(
                {
                    "code": "review_outliers",
                    "severity": "info",
                    "params": {"column": col, "count": issue["count"]},
                    "evidence": {"rows": issue.get("rows", [])},
                }
            )
        elif issue["code"] == "empty_column":
            recommendations.append(
                {"code": "drop_empty_column", "severity": "info", "params": {"column": col}, "evidence": {}}
            )

    roles = {c["role"] for c in ds.columns}
    if not {"amount", "date"} <= roles:
        recommendations.append(
            {
                "code": "assign_roles",
                "severity": "info",
                "params": {"missing": sorted({"amount", "date"} - roles)},
                "evidence": {},
            }
        )

    profile = []
    highlights: list[str] = []
    for col, rep in zip(ds.columns, report.get("columns", []), strict=False):
        entry = {
            "name": col["name"],
            "type": col["type"],
            "role": col["role"],
            "completeness": round(1 - rep["missing_pct"], 4),
            "distinct": rep["distinct"],
            "stats": rep.get("stats"),
            "top_values": rep.get("top_values", [])[:3],
        }
        profile.append(entry)
        st = rep.get("stats") or {}
        if col["type"] in ("number", "integer") and "sum" in st:
            highlights.append(
                f"«{col['name']}»: suma {st['sum']:,.2f}, promedio {st['mean']:,.2f}."
                if es
                else f"“{col['name']}”: total {st['sum']:,.2f}, average {st['mean']:,.2f}."
            )

    completeness = report.get("completeness", 1.0)
    highlights.insert(
        0,
        (
            f"{len(df)} filas y {len(ds.columns)} columnas; completitud {completeness:.1%}; "
            f"{len(recommendations)} recomendaciones."
        )
        if es
        else (
            f"{len(df)} rows and {len(ds.columns)} columns; {completeness:.1%} complete; "
            f"{len(recommendations)} recommendations."
        ),
    )

    metrics = [
        {"key": "rows", "value": len(df), "format": "number"},
        {"key": "columns", "value": len(ds.columns), "format": "number"},
        {"key": "completeness", "value": completeness, "format": "percent"},
        {"key": "duplicates", "value": dup, "format": "number"},
        {"key": "issues", "value": len(report.get("issues", [])), "format": "number"},
    ]
    facts = {
        "dataset": ds.name,
        "metrics": {m["key"]: m["value"] for m in metrics},
        "recommendations": [r["code"] for r in recommendations],
        "highlights": highlights,
    }
    return {
        "dataset": {"id": str(ds.id), "name": ds.name, "row_count": len(df)},
        "period": None,
        "metrics": metrics,
        "profile": profile,
        "recommendations": recommendations,
        "limitations": [{"code": "dataset_only", "params": {}}],
        "facts": facts,
    }


def _issue_rows(report: dict[str, Any], code: str) -> list[int]:
    for issue in report.get("issues", []):
        if issue["code"] == code:
            return list(issue.get("rows", []))
    return []
