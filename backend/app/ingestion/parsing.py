"""Lectura de CSV/XLSX a una tabla de cadenas (encabezados + filas).

Todo se lee como texto: la inferencia de tipos ocurre después (analysis.py), con
reglas explícitas. En XLSX se usan los VALORES calculados guardados en el archivo
(`data_only=True`); nunca se evalúan fórmulas ni se siguen vínculos externos.
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any

from openpyxl import load_workbook

from app.ingestion.validation import FileFormat, UploadRejected

CSV_DELIMITERS = [",", ";", "\t", "|"]


@dataclass
class ParsedTable:
    headers: list[str]
    rows: list[list[str]]
    options: dict[str, Any] = field(default_factory=dict)  # encoding, delimiter, sheet
    sheets: list[str] = field(default_factory=list)
    ragged_rows: int = 0  # filas con más celdas que encabezados
    skipped_empty_rows: int = 0


def _cell_to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time(0) else value.isoformat(sep=" ", timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() and abs(value) < 1e15 else repr(value)
    return str(value).strip()


def _normalize_headers(raw: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for i, h in enumerate(raw):
        name = " ".join(h.split())[:80] or f"Columna {i + 1}"
        key = name.lower()
        if key in seen:
            seen[key] += 1
            name = f"{name} ({seen[key]})"
        else:
            seen[key] = 1
        out.append(name)
    return out


def _finish(
    raw_rows: list[list[str]], options: dict[str, Any], sheets: list[str], max_rows: int, max_cols: int
) -> ParsedTable:
    rows = [r for r in raw_rows]
    # Primera fila no vacía = encabezados.
    while rows and not any(c.strip() for c in rows[0]):
        rows.pop(0)
    if not rows:
        raise UploadRejected("upload.no_data", "El archivo no contiene datos.")
    header_row = rows.pop(0)
    # Recorta columnas vacías al final del encabezado.
    while header_row and not header_row[-1].strip():
        header_row.pop()
    width = len(header_row)
    if width == 0:
        raise UploadRejected("upload.no_header", "No se encontró una fila de encabezados.")
    if width > max_cols:
        raise UploadRejected("upload.too_many_columns", "El archivo tiene demasiadas columnas.", limit=max_cols)

    out: list[list[str]] = []
    ragged = skipped = 0
    for r in rows:
        cells = [c.strip() for c in r]
        if not any(cells):
            skipped += 1
            continue
        if len(cells) > width and any(cells[width:]):
            ragged += 1
        cells = (cells + [""] * width)[:width]
        out.append(cells)
        if len(out) > max_rows:
            raise UploadRejected("upload.too_many_rows", "El archivo tiene demasiadas filas.", limit=max_rows)
    if not out:
        raise UploadRejected("upload.no_data", "El archivo no contiene filas de datos.")
    return ParsedTable(_normalize_headers(header_row), out, options, sheets, ragged, skipped)


def parse_csv(content: bytes, encoding: str, *, max_rows: int, max_cols: int) -> ParsedTable:
    text = content.decode(encoding, errors="replace")
    sample = text[:65536]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters="".join(CSV_DELIMITERS)).delimiter
    except csv.Error:
        # Si el detector duda, el separador más frecuente en la primera línea.
        first = sample.splitlines()[0] if sample else ""
        delimiter = max(CSV_DELIMITERS, key=first.count)
    csv.field_size_limit(1_000_000)
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
        raw_rows = []
        for row in reader:
            raw_rows.append(row)
            if len(raw_rows) > max_rows + 2:
                raise UploadRejected("upload.too_many_rows", "El archivo tiene demasiadas filas.", limit=max_rows)
    except csv.Error as e:
        raise UploadRejected("upload.corrupt", "El CSV tiene un formato inválido.") from e
    return _finish(raw_rows, {"encoding": encoding, "delimiter": delimiter}, [], max_rows, max_cols)


def parse_xlsx(content: bytes, sheet: str | None, *, max_rows: int, max_cols: int) -> ParsedTable:
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True, keep_links=False)
    except Exception as e:  # openpyxl lanza varios tipos según el daño
        raise UploadRejected("upload.corrupt", "No se pudo leer el libro de Excel.") from e
    try:
        visible = [ws.title for ws in wb.worksheets if ws.sheet_state == "visible"]
        if not visible:
            raise UploadRejected("upload.no_data", "El libro no tiene hojas visibles.")
        name = sheet if sheet in visible else visible[0]
        ws = wb[name]
        raw_rows: list[list[str]] = []
        for values in ws.iter_rows(values_only=True, max_col=max_cols + 1):
            raw_rows.append([_cell_to_str(v) for v in values])
            if len(raw_rows) > max_rows + 2:
                raise UploadRejected("upload.too_many_rows", "El archivo tiene demasiadas filas.", limit=max_rows)
        return _finish(raw_rows, {"sheet": name}, visible, max_rows, max_cols)
    finally:
        wb.close()


def parse(
    content: bytes,
    fmt: FileFormat,
    *,
    encoding: str | None = None,
    sheet: str | None = None,
    max_rows: int,
    max_cols: int,
) -> ParsedTable:
    if fmt == "csv":
        return parse_csv(content, encoding or "utf-8-sig", max_rows=max_rows, max_cols=max_cols)
    return parse_xlsx(content, sheet, max_rows=max_rows, max_cols=max_cols)
