"""Exportación CSV segura.

Inyección de fórmulas: Excel/Sheets ejecutan celdas que empiezan con = + - @ (o tab/CR).
Toda celda de TEXTO que empiece así se antepone con un apóstrofo para que se lea como texto.
Los números se escriben como números (un −120 no se altera).
"""

import csv
import io
from collections.abc import Iterable
from typing import Any

DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return value
    text = str(value)
    return "'" + text if text.startswith(DANGEROUS_PREFIXES) else text


def to_csv(rows: Iterable[Iterable[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    for row in rows:
        writer.writerow([safe_cell(v) for v in row])
    # BOM UTF-8 para que Excel abra correctamente los acentos.
    return "﻿" + buf.getvalue()
