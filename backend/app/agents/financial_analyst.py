"""Analista financiero: totales, tendencia mensual, comparación de periodos, concentración e
importes inusuales. Cada cifra se calcula a partir de las filas importadas (trazables a su fila
de origen). No sustituye a un contador ni a un asesor fiscal."""

from typing import Any

import numpy as np
import pandas as pd

from app.agents.tools import AgentInputError, ToolContext

CHANGE_THRESHOLD = 0.10  # ±10 % entre los dos últimos meses
CONCENTRATION_THRESHOLD = 0.40  # un solo grupo con ≥ 40 % del total
MAX_UNUSUAL = 10


def _pick(columns: list[dict[str, Any]], role: str, types: tuple[str, ...]) -> dict[str, Any] | None:
    return next((c for c in columns if c["role"] == role and c["type"] in types), None)


def run(ctx: ToolContext, params: dict[str, Any]) -> dict[str, Any]:
    ds, df = ctx.call("read_dataset", dataset_id=params["dataset_id"])
    es = ctx.language != "en"
    amount_col = _pick(ds.columns, "amount", ("number", "integer"))
    date_col = _pick(ds.columns, "date", ("date",))
    missing = [r for r, c in (("amount", amount_col), ("date", date_col)) if c is None]
    if missing:
        raise AgentInputError("agent.missing_roles", "Faltan columnas con rol Importe y/o Fecha.", missing=missing)
    assert amount_col is not None and date_col is not None
    group_col = next(
        (c for role in ("category", "product", "customer") if (c := _pick(ds.columns, role, ("text",)))), None
    )

    data = pd.DataFrame(
        {
            "row": df["_row"],
            "amount": pd.to_numeric(df[amount_col["key"]], errors="coerce"),
            "date": pd.to_datetime(df[date_col["key"]], errors="coerce", format="%Y-%m-%d"),
        }
    )
    if group_col:
        data["group"] = df[group_col["key"]].fillna("—").astype(str)
    excluded = int(data[["amount", "date"]].isna().any(axis=1).sum())
    data = data.dropna(subset=["amount", "date"])
    if data.empty:
        raise AgentInputError("agent.no_usable_rows", "No hay filas con importe y fecha válidos.")

    total = float(data["amount"].sum())
    count = len(data)
    start, end = data["date"].min(), data["date"].max()
    monthly = data.groupby(data["date"].dt.to_period("M"))["amount"].agg(["sum", "count"]).sort_index()
    series: list[dict[str, Any]] = [
        {"period": str(p), "total": round(float(r["sum"]), 2), "count": int(r["count"])} for p, r in monthly.iterrows()
    ]

    recommendations: list[dict[str, Any]] = []
    limitations: list[dict[str, Any]] = [
        {"code": "not_accounting_advice", "params": {}},
        {"code": "dataset_only", "params": {}},
    ]
    if excluded:
        limitations.append({"code": "excluded_rows", "params": {"count": excluded}})
    highlights = [
        (
            f"Total {total:,.2f} en {count} movimientos, del {start:%Y-%m-%d} al {end:%Y-%m-%d}."
            if es
            else f"Total {total:,.2f} across {count} transactions, from {start:%Y-%m-%d} to {end:%Y-%m-%d}."
        )
    ]

    change = None
    if len(series) >= 2:
        cur, prev = series[-1], series[-2]
        last_period = monthly.index[-1]
        if end.date() < last_period.end_time.date():
            limitations.append({"code": "partial_period", "params": {"period": cur["period"]}})
        if prev["total"]:
            change = (cur["total"] - prev["total"]) / abs(prev["total"])
            if abs(change) >= CHANGE_THRESHOLD:
                recommendations.append(
                    {
                        "code": "revenue_change",
                        "severity": "warning" if change < 0 else "info",
                        "params": {
                            "direction": "down" if change < 0 else "up",
                            "pct": round(change, 4),
                            "current_period": cur["period"],
                            "previous_period": prev["period"],
                            "current": cur["total"],
                            "previous": prev["total"],
                        },
                        "evidence": {"periods": [prev["period"], cur["period"]]},
                    }
                )
            highlights.append(f"{cur['period']} vs {prev['period']}: {change:+.1%}.")
    else:
        limitations.append({"code": "single_period", "params": {}})

    breakdown = None
    if group_col:
        by_group = data.groupby("group")["amount"].sum().sort_values(ascending=False)
        positive_total = float(by_group[by_group > 0].sum()) or 1.0
        items: list[dict[str, Any]] = [
            {"label": str(k), "total": round(float(v), 2), "share": round(float(v) / positive_total, 4)}
            for k, v in by_group.head(5).items()
        ]
        rest = by_group.iloc[5:]
        if len(rest):
            items.append(
                {
                    "label": "__other__",
                    "total": round(float(rest.sum()), 2),
                    "share": round(float(rest.sum()) / positive_total, 4),
                }
            )
        breakdown = {"dimension": group_col["name"], "role": group_col["role"], "items": items}
        top = items[0]
        if top["share"] >= CONCENTRATION_THRESHOLD and len(by_group) > 1:
            recommendations.append(
                {
                    "code": "concentration",
                    "severity": "info",
                    "params": {"label": top["label"], "share": top["share"], "dimension": group_col["name"]},
                    "evidence": {},
                }
            )

    unusual: list[dict[str, Any]] = []
    amounts = data["amount"].astype(float)
    if count >= 8:
        q1, q3 = np.percentile(amounts, [25, 75])
        iqr = q3 - q1
        if iqr > 0:
            mask = (amounts > q3 + 3 * iqr) | (amounts < q1 - 3 * iqr)
            flagged = data[mask].reindex(amounts[mask].abs().sort_values(ascending=False).index)
            for _, r in flagged.head(MAX_UNUSUAL).iterrows():
                unusual.append(
                    {
                        "row_number": int(r["row"]),
                        "date": r["date"].date().isoformat(),
                        "amount": round(float(r["amount"]), 2),
                        "label": str(r["group"]) if group_col else None,
                    }
                )
            if unusual:
                recommendations.append(
                    {
                        "code": "unusual_transactions",
                        "severity": "warning",
                        "params": {"count": int(mask.sum())},
                        "evidence": {"rows": [u["row_number"] for u in unusual]},
                    }
                )

    if change is not None and unusual and any(u["date"][:7] == series[-1]["period"] for u in unusual):
        # El cambio entre meses está influido por movimientos atípicos del último mes.
        limitations.append({"code": "change_includes_unusual", "params": {"period": series[-1]["period"]}})

    negatives = data[data["amount"] < 0]
    if len(negatives):
        recommendations.append(
            {
                "code": "negative_amounts",
                "severity": "info",
                "params": {"count": len(negatives), "total": round(float(negatives["amount"].sum()), 2)},
                "evidence": {"rows": [int(x) for x in negatives["row"].head(5)]},
            }
        )

    metrics = [
        {"key": "total", "value": round(total, 2), "format": "currency"},
        {"key": "transactions", "value": count, "format": "number"},
        {"key": "average", "value": round(total / count, 2), "format": "currency"},
        {"key": "median", "value": round(float(amounts.median()), 2), "format": "currency"},
    ]
    if change is not None:
        metrics.append({"key": "change", "value": round(change, 4), "format": "percent"})
    facts = {
        "dataset": ds.name,
        "period": {"from": start.date().isoformat(), "to": end.date().isoformat()},
        "metrics": {m["key"]: m["value"] for m in metrics},
        "monthly": series[-6:],
        "breakdown_top": breakdown["items"][:3] if breakdown else None,
        "unusual_count": len(unusual),
        "limitations": [lim["code"] for lim in limitations],
        "highlights": highlights,
    }
    return {
        "dataset": {"id": str(ds.id), "name": ds.name, "row_count": len(df)},
        "period": {"from": start.date().isoformat(), "to": end.date().isoformat()},
        "columns_used": {
            "amount": amount_col["name"],
            "date": date_col["name"],
            "group": group_col["name"] if group_col else None,
        },
        "metrics": metrics,
        "series": series,
        "breakdown": breakdown,
        "unusual": unusual,
        "recommendations": recommendations,
        "limitations": limitations,
        "facts": facts,
    }
