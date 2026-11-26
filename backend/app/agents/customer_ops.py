"""Operaciones con clientes (Fase 7): actividad y segmentación RFM (recencia, frecuencia, monto).
Propone una LISTA DE SEGUIMIENTO (clientes en riesgo) que solo se guarda si se aprueba.

Columnas esperadas: Cliente (rol «Cliente»), Fecha (rol «Fecha») e Importe (rol «Importe»).
La fecha de referencia es la última fecha del archivo (no la de hoy), para que el análisis sea
reproducible con datos históricos.
"""

from typing import Any

import pandas as pd

from app.agents.tools import AgentInputError, ToolContext

MAX_ROWS = 25
SEGMENTS = ("champions", "loyal", "new", "at_risk", "lost", "regular")


def _pick(columns: list[dict[str, Any]], role: str, types: tuple[str, ...]) -> dict[str, Any] | None:
    return next((c for c in columns if c["role"] == role and c["type"] in types), None)


def segment(recency: float, frequency: int, avg_gap: float | None, monetary_rank: float) -> str:
    """Reglas explicables (sin modelos opacos)."""
    if frequency == 1:
        return "new" if recency <= 30 else "lost"
    gap = avg_gap or 30.0
    if recency > max(90.0, gap * 4):
        return "lost"
    if recency > max(45.0, gap * 2):
        return "at_risk"
    if monetary_rank >= 0.8 and recency <= gap * 1.5:
        return "champions"
    if frequency >= 3:
        return "loyal"
    return "regular"


def run(ctx: ToolContext, params: dict[str, Any]) -> dict[str, Any]:
    ds, df = ctx.call("read_dataset", dataset_id=params["dataset_id"])
    cols = ds.columns
    customer = _pick(cols, "customer", ("text", "integer"))
    date = _pick(cols, "date", ("date",))
    amount = _pick(cols, "amount", ("number", "integer"))
    missing = [r for r, c in (("customer", customer), ("date", date), ("amount", amount)) if c is None]
    if missing:
        raise AgentInputError(
            "agent.missing_roles", "Faltan columnas con rol Cliente, Fecha y/o Importe.", missing=missing
        )
    assert customer and date and amount

    data = pd.DataFrame(
        {
            "row": df["_row"],
            "customer": df[customer["key"]].astype("string").str.strip(),
            "date": pd.to_datetime(df[date["key"]], errors="coerce", format="%Y-%m-%d"),
            "amount": pd.to_numeric(df[amount["key"]], errors="coerce"),
        }
    )
    excluded = int(data[["customer", "date", "amount"]].isna().any(axis=1).sum())
    data = data.dropna(subset=["customer", "date", "amount"])
    data = data[data["customer"] != ""]
    if data.empty:
        raise AgentInputError("agent.no_usable_rows", "No hay filas con cliente, fecha e importe válidos.")
    ref = data["date"].max()

    rows: list[dict[str, Any]] = []
    grouped = data.groupby("customer")
    totals = grouped["amount"].sum()
    rank = totals.rank(pct=True)
    for name, g in grouped:
        dates = g["date"].sort_values()
        gaps = dates.diff().dropna().dt.days
        avg_gap = float(gaps.mean()) if len(gaps) else None
        recency = float((ref - dates.iloc[-1]).days)
        seg = segment(recency, len(g), avg_gap, float(rank[name]))
        rows.append(
            {
                "customer": str(name),
                "segment": seg,
                "orders": len(g),
                "total": round(float(g["amount"].sum()), 2),
                "last_purchase": dates.iloc[-1].strftime("%Y-%m-%d"),
                "days_since": int(recency),
                "avg_days_between": round(avg_gap, 1) if avg_gap is not None else None,
                "row_number": int(g["row"].iloc[-1]),
            }
        )
    rows.sort(key=lambda r: -r["total"])
    counts = {s: sum(1 for r in rows if r["segment"] == s) for s in SEGMENTS}
    revenue = float(totals.sum())
    at_risk = sorted([r for r in rows if r["segment"] == "at_risk"], key=lambda r: -r["total"])
    top_share = (
        float(totals.sort_values(ascending=False).head(max(1, len(totals) // 5)).sum() / revenue) if revenue else 0.0
    )

    metrics = [
        {"key": "customers", "value": len(rows), "format": "number"},
        {
            "key": "active_customers",
            "value": counts["champions"] + counts["loyal"] + counts["regular"] + counts["new"],
            "format": "number",
        },
        {"key": "at_risk", "value": counts["at_risk"], "format": "number"},
        {"key": "lost", "value": counts["lost"], "format": "number"},
        {"key": "avg_ticket", "value": round(revenue / len(data), 2), "format": "currency"},
        {"key": "top20_share", "value": round(top_share, 4), "format": "percent"},
    ]
    recommendations: list[dict[str, Any]] = []
    if at_risk:
        approval = ctx.call(
            "propose_action",
            action_type="customers.follow_up_list",
            payload={"dataset_id": str(ds.id), "customers": at_risk[:200]},
        )
        recommendations.append(
            {
                "code": "customers_follow_up",
                "severity": "warning",
                "params": {"count": len(at_risk), "value": round(sum(r["total"] for r in at_risk), 2)},
                "evidence": {"rows": [r["row_number"] for r in at_risk[:20]]},
                "approval_id": str(approval.id),
            }
        )
    if counts["lost"]:
        recommendations.append(
            {"code": "customers_lost", "severity": "info", "params": {"count": counts["lost"]}, "evidence": {}}
        )
    if top_share >= 0.6 and len(rows) >= 5:
        recommendations.append(
            {
                "code": "customers_concentration",
                "severity": "info",
                "params": {"share": round(top_share, 4)},
                "evidence": {},
            }
        )

    limitations: list[dict[str, Any]] = [
        {"code": "dataset_only", "params": {}},
        {"code": "reference_date", "params": {"date": ref.strftime("%Y-%m-%d")}},
    ]
    if excluded:
        limitations.append({"code": "excluded_rows", "params": {"count": excluded}})

    columns = ["customer", "segment", "orders", "total", "last_purchase", "days_since"]
    es = ctx.language != "en"
    return {
        "dataset": {"id": str(ds.id), "name": ds.name, "row_count": ds.row_count},
        "period": {"from": data["date"].min().strftime("%Y-%m-%d"), "to": ref.strftime("%Y-%m-%d")},
        "columns_used": {"customer": customer["name"], "date": date["name"], "amount": amount["name"]},
        "metrics": metrics,
        "breakdown": {
            "dimension": "segment",
            "role": "segment",
            "items": [
                {"label": f"segment:{s}", "total": counts[s], "share": round(counts[s] / len(rows), 4)}
                for s in SEGMENTS
                if counts[s]
            ],
        },
        "tables": [
            t
            for t in (
                {"key": "follow_up", "columns": [*columns, "avg_days_between"], "rows": at_risk[:MAX_ROWS]},
                {"key": "top_customers", "columns": columns, "rows": rows[:MAX_ROWS]},
            )
            if t["rows"]
        ],
        "recommendations": recommendations,
        "limitations": limitations,
        "facts": {
            "metrics": {m["key"]: m["value"] for m in metrics},
            "segments": counts,
            "highlights": [
                f"{len(rows)} clientes; {counts['at_risk']} en riesgo y {counts['lost']} perdidos."
                if es
                else f"{len(rows)} customers; {counts['at_risk']} at risk and {counts['lost']} lost."
            ],
        },
    }
