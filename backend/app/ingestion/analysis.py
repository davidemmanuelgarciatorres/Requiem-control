"""Inferencia de tipos y análisis de calidad de una tabla importada.

Cada hallazgo es explicable: incluye un código estable (la interfaz lo traduce),
la columna, los conteos y las filas de ejemplo que lo respaldan. Los números de
fila se refieren a la fila del archivo original (la 1 es el encabezado).
"""

import re
from datetime import date
from typing import Any, Literal

import numpy as np
import pandas as pd

ColumnType = Literal["integer", "number", "date", "boolean", "text", "empty"]
Role = Literal["none", "date", "amount", "category", "customer", "product", "quantity", "identifier"]

MISSING_TOKENS = {
    "",
    "na",
    "n/a",
    "n.a.",
    "null",
    "none",
    "nan",
    "-",
    "--",
    "s/d",
    "sin dato",
    "sin datos",
    "#n/a",
    "#n/d",
}
TRUE_TOKENS = {"true", "verdadero", "si", "sí", "yes", "y", "s"}
FALSE_TOKENS = {"false", "falso", "no", "n"}
DOMINANT_SHARE = (
    0.8  # un tipo domina si ≥ 80 % de los valores no vacíos lo cumplen; el resto se marca como inconsistente
)
EXAMPLE_ROWS = 5

_CURRENCY = re.compile(r"^(?:mxn|usd|eur)?\s*[$€£]?\s*|\s*(?:mxn|usd|eur)$", re.IGNORECASE)
_NUMERIC = re.compile(r"^[+-]?\d+(?:\.\d+)?$")
_THOUSANDS_COMMA = re.compile(r"^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$")
_THOUSANDS_DOT = re.compile(r"^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$")
_DATE_ISO = re.compile(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$")
_DATE_DMY = re.compile(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$")

ROLE_HINTS: list[tuple[Role, tuple[str, ...]]] = [
    ("date", ("fecha", "date", "dia", "día", "periodo", "mes")),
    ("quantity", ("cantidad", "qty", "quantity", "unidades", "piezas", "pzas")),
    (
        "amount",
        (
            "monto",
            "importe",
            "total",
            "amount",
            "precio",
            "venta",
            "ingreso",
            "costo",
            "gasto",
            "subtotal",
            "saldo",
            "pago",
        ),
    ),
    ("category", ("categoria", "categoría", "category", "tipo", "clase", "rubro", "segmento")),
    ("customer", ("cliente", "customer", "comprador", "razon social", "razón social")),
    ("product", ("producto", "product", "sku", "articulo", "artículo", "item")),
    ("identifier", ("id", "folio", "rfc", "codigo", "código", "clave", "factura", "uuid")),
]


def is_missing(value: str) -> bool:
    return value.strip().lower() in MISSING_TOKENS


def parse_number(value: str) -> float | None:
    s = value.strip().replace(" ", " ")
    if not s:
        return None
    negative = s.startswith("(") and s.endswith(")")  # (1,234.00) contable
    if negative:
        s = s[1:-1]
    percent = s.endswith("%")
    if percent:
        s = s[:-1].strip()
    s = _CURRENCY.sub("", s).replace(" ", "")
    if _NUMERIC.match(s):
        n = float(s)
    elif _THOUSANDS_COMMA.match(s):
        n = float(s.replace(",", ""))
    elif _THOUSANDS_DOT.match(s):
        n = float(s.replace(".", "").replace(",", "."))
    elif re.match(r"^[+-]?\d+,\d+$", s):  # coma decimal: 12,5
        n = float(s.replace(",", "."))
    else:
        return None
    if percent:
        n /= 100
    return -n if negative else n


def parse_date(value: str) -> date | None:
    s = value.strip()
    m = _DATE_ISO.match(s)
    try:
        if m:
            return date(int(m[1]), int(m[2]), int(m[3]))
        m = _DATE_DMY.match(s)
        if m:
            d, mo, y = int(m[1]), int(m[2]), int(m[3])
            if y < 100:
                y += 2000
            # Convención de México: día/mes/año. Si el "mes" es > 12, era mes/día/año.
            if mo > 12 and d <= 12:
                d, mo = mo, d
            return date(y, mo, d)
    except ValueError:
        return None
    return None


def parse_bool(value: str) -> bool | None:
    s = value.strip().lower()
    if s in TRUE_TOKENS:
        return True
    if s in FALSE_TOKENS:
        return False
    return None


def _matches(value: str, t: ColumnType) -> bool:
    if t == "text":
        return True
    if t == "boolean":
        return parse_bool(value) is not None
    if t == "date":
        return parse_date(value) is not None
    n = parse_number(value)
    if t == "integer":
        return n is not None and float(n).is_integer()
    return n is not None  # number


def infer_type(values: list[str]) -> ColumnType:
    present = [v for v in values if not is_missing(v)]
    if not present:
        return "empty"
    sample = present[:5000]
    for t in ("boolean", "integer", "number", "date"):
        ok = sum(1 for v in sample if _matches(v, t))
        if ok / len(sample) >= DOMINANT_SHARE:
            return t
    return "text"


def suggest_role(header: str, t: ColumnType) -> Role:
    h = header.lower()
    for role, words in ROLE_HINTS:
        if any(re.search(rf"(^|[^a-záéíóúñ]){re.escape(w)}([^a-záéíóúñ]|$)", h) for w in words):
            if role == "date" and t not in ("date", "text"):
                continue
            if role in ("amount", "quantity") and t not in ("integer", "number"):
                continue
            return role
    return "date" if t == "date" else "none"


def convert(value: str, t: ColumnType) -> tuple[Any, bool]:
    """Convierte una celda al tipo de la columna. Devuelve (valor JSON, ok). Faltante → (None, True)."""
    if is_missing(value):
        return None, True
    if t in ("text", "empty"):
        return value.strip(), True
    if t == "boolean":
        b = parse_bool(value)
        return b, b is not None
    if t == "date":
        d = parse_date(value)
        return (d.isoformat() if d else None), d is not None
    n = parse_number(value)
    if n is None:
        return None, False
    if t == "integer":
        return (int(n) if float(n).is_integer() else n), float(n).is_integer()
    return n, True


def _row_numbers(mask: "pd.Series[bool]") -> list[int]:
    # +2: índice base 0 y la fila 1 del archivo es el encabezado.
    return [int(i) + 2 for i in mask[mask].index[:EXAMPLE_ROWS]]


def analyze(
    headers: list[str],
    rows: list[list[str]],
    types: list[ColumnType] | None = None,
    ragged_rows: int = 0,
    skipped_empty_rows: int = 0,
) -> dict[str, Any]:
    """Análisis completo. `types` fuerza los tipos (tras el mapeo del usuario); si no, se infieren."""
    df = pd.DataFrame(rows, columns=[f"c{i}" for i in range(len(headers))], dtype="string")
    n_rows, n_cols = df.shape
    missing = df.apply(lambda col: col.map(is_missing)).astype(bool)

    issues: list[dict[str, Any]] = []
    columns: list[dict[str, Any]] = []
    for i, header in enumerate(headers):
        key = f"c{i}"
        col = df[key]
        miss = missing[key]
        values = col[~miss]
        t = types[i] if types else infer_type(col.tolist())
        info: dict[str, Any] = {
            "key": key,
            "name": header,
            "type": t,
            "suggested_role": suggest_role(header, t),
            "non_missing": int((~miss).sum()),
            "missing": int(miss.sum()),
            "missing_pct": round(float(miss.mean()) if n_rows else 0.0, 4),
            "distinct": int(values.nunique()),
            "examples": values.drop_duplicates().head(3).tolist(),
        }
        if t == "empty" or info["non_missing"] == 0:
            issues.append({"code": "empty_column", "severity": "warning", "column": header, "count": n_rows})
        elif info["missing"]:
            issues.append(
                {
                    "code": "missing_values",
                    "severity": "warning" if info["missing_pct"] >= 0.05 else "info",
                    "column": header,
                    "count": info["missing"],
                    "pct": info["missing_pct"],
                    "rows": _row_numbers(miss),
                }
            )

        if t not in ("text", "empty") and len(values):
            bad = values.map(lambda v, t=t: not _matches(str(v), t)).astype(bool)
            if bad.any():
                issues.append(
                    {
                        "code": "mixed_types",
                        "severity": "warning",
                        "column": header,
                        "count": int(bad.sum()),
                        "expected": t,
                        "examples": values[bad].head(3).tolist(),
                        "rows": _row_numbers(bad),
                    }
                )
        if t in ("integer", "number") and len(values):
            nums = pd.to_numeric(values.map(parse_number), errors="coerce").dropna().astype(float)
            if len(nums):
                info["stats"] = {
                    "min": float(nums.min()),
                    "max": float(nums.max()),
                    "mean": float(nums.mean()),
                    "median": float(nums.median()),
                    "sum": float(nums.sum()),
                }
            if len(nums) >= 8:
                q1, q3 = np.percentile(nums, [25, 75])
                iqr = q3 - q1
                if iqr > 0:
                    low, high = q1 - 3 * iqr, q3 + 3 * iqr  # valla amplia: solo valores muy alejados
                    out_mask = (nums < low) | (nums > high)
                    if out_mask.any():
                        issues.append(
                            {
                                "code": "outliers",
                                "severity": "info",
                                "column": header,
                                "count": int(out_mask.sum()),
                                "low": float(low),
                                "high": float(high),
                                "rows": _row_numbers(out_mask.reindex(col.index, fill_value=False)),
                            }
                        )
        elif t == "date" and len(values):
            dates = [d for d in (parse_date(str(v)) for v in values) if d]
            if dates:
                info["stats"] = {"min": min(dates).isoformat(), "max": max(dates).isoformat()}
        elif t == "text" and len(values):
            top = values.value_counts().head(5)
            info["top_values"] = [{"value": str(k), "count": int(v)} for k, v in top.items()]
        columns.append(info)

    normalized = df.apply(lambda col: col.str.strip().str.lower())
    dup_mask = normalized.duplicated(keep="first")
    if dup_mask.any():
        issues.append(
            {
                "code": "duplicate_rows",
                "severity": "warning",
                "count": int(dup_mask.sum()),
                "rows": _row_numbers(dup_mask),
            }
        )
    if ragged_rows:
        issues.append({"code": "ragged_rows", "severity": "warning", "count": ragged_rows})

    total_cells = n_rows * n_cols
    severity_order = {"warning": 0, "info": 1}
    issues.sort(key=lambda x: (severity_order[x["severity"]], -int(x.get("count", 0))))
    return {
        "row_count": n_rows,
        "column_count": n_cols,
        "completeness": round(1 - float(missing.to_numpy().sum()) / total_cells, 4) if total_cells else 1.0,
        "duplicate_rows": int(dup_mask.sum()),
        "skipped_empty_rows": skipped_empty_rows,
        "columns": columns,
        "issues": issues,
    }
