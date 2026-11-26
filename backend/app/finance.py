"""Inteligencia financiera (módulo de la Fase 4): ingresos, gastos, utilidad, margen, flujo de
efectivo, comparación de periodos, categorías e importes inusuales.

Todo es cálculo determinista sobre las filas importadas (sin IA, sin costo). Convención:
importe > 0 = ingreso, importe < 0 = gasto. Cada indicador declara su fórmula y su fuente.
No sustituye a un contador ni a un asesor fiscal.
"""

import uuid
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError, not_found
from app.models import Dataset, DatasetRow

MAX_UNUSUAL = 10


def _pick(columns: list[dict[str, Any]], role: str, types: tuple[str, ...]) -> dict[str, Any] | None:
    return next((c for c in columns if c["role"] == role and c["type"] in types), None)


def eligible(ds: Dataset) -> bool:
    return bool(_pick(ds.columns, "amount", ("number", "integer")) and _pick(ds.columns, "date", ("date",)))


def eligible_datasets(db: Session, org_id: uuid.UUID) -> list[Dataset]:
    rows = db.execute(select(Dataset).where(Dataset.organization_id == org_id).order_by(Dataset.created_at.desc()))
    return [d for d in rows.scalars() if eligible(d)]


def _frame(db: Session, ds: Dataset) -> pd.DataFrame:
    amount = _pick(ds.columns, "amount", ("number", "integer"))
    date = _pick(ds.columns, "date", ("date",))
    assert amount and date
    group = next((c for r in ("category", "product", "customer") if (c := _pick(ds.columns, r, ("text",)))), None)
    rows = db.execute(
        select(DatasetRow.row_number, DatasetRow.data)
        .where(DatasetRow.dataset_id == ds.id)
        .order_by(DatasetRow.row_number)
    ).all()
    data = pd.DataFrame(
        {
            "row": [r.row_number for r in rows],
            "amount": pd.to_numeric(
                pd.Series([r.data.get(amount["key"]) for r in rows], dtype="object"), errors="coerce"
            ),
            "date": pd.to_datetime(
                pd.Series([r.data.get(date["key"]) for r in rows], dtype="object"), errors="coerce", format="%Y-%m-%d"
            ),
            "group": [str(r.data.get(group["key"]) or "—") if group else "—" for r in rows],
        }
    )
    data.attrs["group_name"] = group["name"] if group else None
    data.attrs["amount_name"] = amount["name"]
    data.attrs["date_name"] = date["name"]
    return data


def _by_group(frame: pd.DataFrame, total: float) -> list[dict[str, Any]]:
    if frame.empty or not total:
        return []
    g = frame.groupby("group")["amount"].sum().abs().sort_values(ascending=False)
    items = [
        {"label": str(k), "total": round(float(v), 2), "share": round(float(v) / total, 4)}
        for k, v in g.head(6).items()
    ]
    rest = g.iloc[6:]
    if len(rest):
        items.append(
            {"label": "__other__", "total": round(float(rest.sum()), 2), "share": round(float(rest.sum()) / total, 4)}
        )
    return items


def overview(
    db: Session,
    org_id: uuid.UUID,
    dataset_id: uuid.UUID | None,
    period_a: str | None = None,
    period_b: str | None = None,
) -> dict[str, Any]:
    datasets = eligible_datasets(db, org_id)
    options = [{"id": str(d.id), "name": d.name, "row_count": d.row_count} for d in datasets]
    if dataset_id is None:
        if not datasets:
            return {"datasets": options, "dataset": None}
        ds = datasets[0]
    else:
        ds_found = db.execute(
            select(Dataset).where(Dataset.id == dataset_id, Dataset.organization_id == org_id)
        ).scalar_one_or_none()
        if ds_found is None:
            raise not_found("dataset")
        ds = ds_found
        if not eligible(ds):
            raise ApiError(409, "finance.missing_roles", "El conjunto necesita columnas con rol Importe y Fecha.")

    data = _frame(db, ds)
    excluded = int(data[["amount", "date"]].isna().any(axis=1).sum())
    data = data.dropna(subset=["amount", "date"])
    limitations: list[dict[str, Any]] = [
        {"code": "not_accounting_advice", "params": {}},
        {"code": "sign_convention", "params": {}},
    ]
    if excluded:
        limitations.append({"code": "excluded_rows", "params": {"count": excluded}})
    if data.empty:
        raise ApiError(409, "finance.no_usable_rows", "No hay filas con importe y fecha válidos.")

    income_rows = data[data["amount"] > 0]
    expense_rows = data[data["amount"] < 0]
    income = float(income_rows["amount"].sum())
    expenses = float(-expense_rows["amount"].sum())
    net = income - expenses
    if expense_rows.empty:
        limitations.append({"code": "no_expenses", "params": {}})

    src = {"dataset": ds.name, "amount": data.attrs["amount_name"], "date": data.attrs["date_name"]}
    metrics = [
        {
            "key": "income",
            "value": round(income, 2),
            "format": "currency",
            "formula": "income",
            "rows": len(income_rows),
        },
        {
            "key": "expenses",
            "value": round(expenses, 2),
            "format": "currency",
            "formula": "expenses",
            "rows": len(expense_rows),
        },
        {"key": "net", "value": round(net, 2), "format": "currency", "formula": "net"},
    ]
    if income:
        metrics.append({"key": "margin", "value": round(net / income, 4), "format": "percent", "formula": "margin"})
    if len(income_rows):
        metrics.append(
            {
                "key": "avg_income",
                "value": round(income / len(income_rows), 2),
                "format": "currency",
                "formula": "avg_income",
            }
        )

    monthly_rows: list[dict[str, Any]] = []
    cumulative = 0.0
    period = data["date"].dt.to_period("M")
    for p, chunk in data.groupby(period):
        inc = float(chunk.loc[chunk["amount"] > 0, "amount"].sum())
        exp = float(-chunk.loc[chunk["amount"] < 0, "amount"].sum())
        cumulative += inc - exp
        monthly_rows.append(
            {
                "period": str(p),
                "income": round(inc, 2),
                "expenses": round(exp, 2),
                "net": round(inc - exp, 2),
                "cumulative": round(cumulative, 2),
                "count": len(chunk),
            }
        )
    end = data["date"].max()
    if monthly_rows and end.date() < pd.Period(monthly_rows[-1]["period"]).end_time.date():
        limitations.append({"code": "partial_period", "params": {"period": monthly_rows[-1]["period"]}})

    # Comparación: los periodos elegidos o, por defecto, los dos últimos meses.
    by_period = {m["period"]: m for m in monthly_rows}
    comparison = None
    if len(monthly_rows) >= 2:
        a = by_period.get(period_a or "") or monthly_rows[-2]
        b = by_period.get(period_b or "") or monthly_rows[-1]

        def delta(k: str) -> dict[str, Any]:
            prev, cur = a[k], b[k]
            return {
                "key": k,
                "previous": prev,
                "current": cur,
                "delta": round(cur - prev, 2),
                "delta_pct": round((cur - prev) / abs(prev), 4) if prev else None,
            }

        comparison = {
            "previous": a["period"],
            "current": b["period"],
            "metrics": [delta("income"), delta("expenses"), delta("net")],
        }
    else:
        limitations.append({"code": "single_period", "params": {}})

    observations: list[dict[str, Any]] = []
    negative = [m["period"] for m in monthly_rows if m["net"] < 0]
    if negative:
        observations.append(
            {"code": "negative_months", "severity": "warning", "params": {"count": len(negative), "periods": negative}}
        )
    if monthly_rows and min(m["cumulative"] for m in monthly_rows) < 0:
        low = min(monthly_rows, key=lambda m: m["cumulative"])
        observations.append(
            {
                "code": "cumulative_negative",
                "severity": "warning",
                "params": {"period": low["period"], "value": low["cumulative"]},
            }
        )
    if income and expenses / income > 0.9:
        observations.append(
            {"code": "thin_margin", "severity": "warning", "params": {"pct": round(expenses / income, 4)}}
        )
    exp_cats = _by_group(expense_rows, expenses) if data.attrs["group_name"] else []
    if exp_cats and exp_cats[0]["share"] >= 0.4 and len(exp_cats) > 1:
        observations.append(
            {
                "code": "expense_concentration",
                "severity": "info",
                "params": {"label": exp_cats[0]["label"], "share": exp_cats[0]["share"]},
            }
        )

    unusual: list[dict[str, Any]] = []
    absval = data["amount"].abs()
    if len(data) >= 8:
        q1, q3 = np.percentile(absval, [25, 75])
        high = q3 + 3 * (q3 - q1)
        if q3 > q1:
            flagged = data[absval > high].assign(abs=absval).sort_values("abs", ascending=False).head(MAX_UNUSUAL)
            unusual = [
                {
                    "row_number": int(r.row),
                    "date": r.date.strftime("%Y-%m-%d"),
                    "amount": round(float(r.amount), 2),
                    "label": None if r.group == "—" else r.group,
                }
                for r in flagged.itertuples()
            ]
            if unusual:
                observations.append(
                    {
                        "code": "unusual",
                        "severity": "warning",
                        "params": {"count": len(unusual), "threshold": round(float(high), 2)},
                    }
                )

    return {
        "datasets": options,
        "dataset": {"id": str(ds.id), "name": ds.name, "row_count": ds.row_count},
        "source": src,
        "period": {"from": data["date"].min().strftime("%Y-%m-%d"), "to": end.strftime("%Y-%m-%d")},
        "periods": [m["period"] for m in monthly_rows],
        "group_name": data.attrs["group_name"],
        "metrics": metrics,
        "monthly": monthly_rows,
        "comparison": comparison,
        "expense_categories": exp_cats,
        "income_categories": _by_group(income_rows, income) if data.attrs["group_name"] else [],
        "observations": observations,
        "unusual": unusual,
        "limitations": limitations,
    }
