"""Analista de inventario (Fase 7): agotados, existencias bajas, inconsistencias, valor del inventario
y productos de lento movimiento. Propone una LISTA DE COMPRA que solo se guarda si se aprueba.
Nunca modifica registros.

Columnas esperadas (roles al importar):
- Producto (rol «Producto» o «Identificador») y Existencia (rol «Cantidad»): obligatorias.
- Opcionales: Mínimo/punto de reorden (columna numérica cuyo nombre contiene «mín», «min», «reorden»
  o «reorder»), Costo/precio (rol «Importe»), Categoría (rol «Categoría») y Fecha de último
  movimiento (rol «Fecha»).
"""

import re
from collections.abc import Mapping
from datetime import timedelta
from typing import Any

import pandas as pd

from app.agents.tools import AgentInputError, ToolContext

MAX_ROWS = 25
SLOW_DAYS = 60
MIN_NAME = re.compile(r"m[ií]n|reorden|reorder|punto", re.I)


def _pick(columns: list[dict[str, Any]], role: str, types: tuple[str, ...]) -> dict[str, Any] | None:
    return next((c for c in columns if c["role"] == role and c["type"] in types), None)


def run(ctx: ToolContext, params: dict[str, Any]) -> dict[str, Any]:
    ds, df = ctx.call("read_dataset", dataset_id=params["dataset_id"])
    cols = ds.columns
    product = _pick(cols, "product", ("text", "integer")) or _pick(cols, "identifier", ("text", "integer"))
    qty = _pick(cols, "quantity", ("number", "integer"))
    missing = [r for r, c in (("product", product), ("quantity", qty)) if c is None]
    if missing:
        raise AgentInputError("agent.missing_roles", "Faltan columnas con rol Producto y/o Cantidad.", missing=missing)
    assert product is not None and qty is not None
    minimum = next(
        (c for c in cols if c["type"] in ("number", "integer") and c is not qty and MIN_NAME.search(c["name"])), None
    )
    cost = _pick(cols, "amount", ("number", "integer"))
    category = _pick(cols, "category", ("text",))
    last_move = _pick(cols, "date", ("date",))

    data = pd.DataFrame(
        {
            "row": df["_row"],
            "product": df[product["key"]].astype("string").fillna("—"),
            "qty": pd.to_numeric(df[qty["key"]], errors="coerce"),
        }
    )
    if minimum:
        data["min"] = pd.to_numeric(df[minimum["key"]], errors="coerce")
    if cost:
        data["cost"] = pd.to_numeric(df[cost["key"]], errors="coerce")
    if category:
        data["category"] = df[category["key"]].astype("string").fillna("—")
    if last_move:
        data["last"] = pd.to_datetime(df[last_move["key"]], errors="coerce", format="%Y-%m-%d")
    excluded = int(data["qty"].isna().sum())
    data = data.dropna(subset=["qty"])
    if data.empty:
        raise AgentInputError("agent.no_usable_rows", "No hay filas con existencia válida.")

    def row_out(r: Mapping[Any, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
        out = {"row_number": int(r["row"]), "product": str(r["product"]), "stock": float(r["qty"])}
        if minimum:
            out["minimum"] = None if pd.isna(r["min"]) else float(r["min"])
        if category:
            out["category"] = str(r["category"])
        return {**out, **(extra or {})}

    out_of_stock = data[data["qty"] <= 0]
    negative = data[data["qty"] < 0]
    if minimum:
        low = data[(data["qty"] > 0) & data["min"].notna() & (data["qty"] <= data["min"])]
        low_rule = "minimum"
    else:
        # Sin columna de mínimo: se marca el 20 % con menos existencia (aproximación, se indica como limitación).
        threshold = float(data.loc[data["qty"] > 0, "qty"].quantile(0.2)) if (data["qty"] > 0).any() else 0.0
        low = data[(data["qty"] > 0) & (data["qty"] <= threshold)]
        low_rule = "percentile"
    dup_products = data[data.duplicated("product", keep=False)]

    value = None
    if cost:
        valid = data.dropna(subset=["cost"])
        value = float((valid["qty"].clip(lower=0) * valid["cost"]).sum())

    slow = pd.DataFrame()
    if last_move and data["last"].notna().any():
        ref = data["last"].max()
        slow = data[(data["qty"] > 0) & (data["last"] < ref - timedelta(days=SLOW_DAYS))]

    # Lista de compra sugerida: llevar al mínimo (o al doble del umbral) lo agotado y lo bajo.
    to_buy = pd.concat([out_of_stock, low]).drop_duplicates("row")
    purchase: list[dict[str, Any]] = []
    for r in to_buy.to_dict("records"):
        target = float(r["min"]) * 2 if minimum and not pd.isna(r["min"]) and r["min"] > 0 else None
        suggested = max(0.0, (target if target is not None else 0.0) - float(r["qty"]))
        purchase.append(row_out(r, {"suggested": round(suggested, 2) if target is not None else None}))

    metrics = [
        {"key": "products", "value": len(data), "format": "number"},
        {"key": "out_of_stock", "value": len(out_of_stock), "format": "number"},
        {"key": "low_stock", "value": len(low), "format": "number"},
    ]
    if value is not None:
        metrics.append({"key": "inventory_value", "value": round(value, 2), "format": "currency"})

    recommendations: list[dict[str, Any]] = []
    if purchase:
        approval = ctx.call(
            "propose_action",
            action_type="inventory.purchase_list",
            payload={"dataset_id": str(ds.id), "items": purchase[:200]},
        )
        recommendations.append(
            {
                "code": "inventory_reorder",
                "severity": "warning",
                "params": {"count": len(purchase)},
                "evidence": {"rows": [p["row_number"] for p in purchase[:20]]},
                "approval_id": str(approval.id),
            }
        )
    if len(negative):
        recommendations.append(
            {
                "code": "inventory_negative",
                "severity": "warning",
                "params": {"count": len(negative)},
                "evidence": {"rows": [int(x) for x in negative["row"].head(20)]},
            }
        )
    if len(dup_products):
        recommendations.append(
            {
                "code": "inventory_duplicates",
                "severity": "info",
                "params": {"count": int(dup_products["product"].nunique())},
                "evidence": {"rows": [int(x) for x in dup_products["row"].head(20)]},
            }
        )
    if len(slow):
        recommendations.append(
            {
                "code": "inventory_slow",
                "severity": "info",
                "params": {"count": len(slow), "days": SLOW_DAYS},
                "evidence": {"rows": [int(x) for x in slow["row"].head(20)]},
            }
        )

    limitations: list[dict[str, Any]] = [{"code": "dataset_only", "params": {}}]
    if excluded:
        limitations.append({"code": "excluded_rows", "params": {"count": excluded}})
    if low_rule == "percentile":
        limitations.append({"code": "no_minimum_column", "params": {}})
    if not last_move:
        limitations.append({"code": "no_movement_dates", "params": {}})

    tables = [
        {
            "key": "purchase_list",
            "columns": ["row_number", "product", "stock", *(["minimum"] if minimum else []), "suggested"],
            "rows": purchase[:MAX_ROWS],
        },
        {
            "key": "out_of_stock",
            "columns": ["row_number", "product", "stock"],
            "rows": [row_out(r) for r in out_of_stock.head(MAX_ROWS).to_dict("records")],
        },
    ]
    if len(slow):
        tables.append(
            {
                "key": "slow_movers",
                "columns": ["row_number", "product", "stock", "last_movement"],
                "rows": [
                    row_out(r, {"last_movement": r["last"].strftime("%Y-%m-%d")})
                    for r in slow.head(MAX_ROWS).to_dict("records")
                ],
            }
        )

    es = ctx.language != "en"
    highlights = [
        (
            f"{len(data)} productos; {len(out_of_stock)} agotados y {len(low)} con existencia baja."
            if es
            else f"{len(data)} products; {len(out_of_stock)} out of stock and {len(low)} low."
        )
    ]
    if value is not None:
        highlights.append(f"Valor del inventario: {value:,.2f}." if es else f"Inventory value: {value:,.2f}.")
    return {
        "dataset": {"id": str(ds.id), "name": ds.name, "row_count": ds.row_count},
        "period": None,
        "columns_used": {
            "product": product["name"],
            "quantity": qty["name"],
            "minimum": minimum["name"] if minimum else None,
            "cost": cost["name"] if cost else None,
        },
        "metrics": metrics,
        "tables": [t for t in tables if t["rows"]],
        "recommendations": recommendations,
        "limitations": limitations,
        "facts": {
            "metrics": {m["key"]: m["value"] for m in metrics},
            "highlights": highlights,
            "recommendations": [r["code"] for r in recommendations],
        },
    }
