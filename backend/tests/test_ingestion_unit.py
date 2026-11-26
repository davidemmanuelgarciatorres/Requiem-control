"""Pruebas unitarias de validación, lectura y análisis (sin base de datos)."""

import io
import zipfile
from datetime import date

import pytest
from openpyxl import Workbook

from app.ingestion.analysis import analyze, convert, infer_type, parse_date, parse_number
from app.ingestion.parsing import parse
from app.ingestion.validation import UploadRejected, detect

MB = 1024 * 1024


def xlsx_bytes(rows: list[list[object]], sheet: str = "Ventas") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def check(content: bytes, name: str):
    return detect(content, name, max_bytes=MB, max_uncompressed=10 * MB)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("$1,234.50", 1234.5),
        ("1.234,50", 1234.5),
        ("12,5", 12.5),
        ("(1,000.00)", -1000.0),
        ("15%", 0.15),
        ("MXN 2,500", 2500.0),
        ("-3", -3.0),
        ("abc", None),
        ("1,2,3", None),
    ],
)
def test_parse_number_mexican_formats(raw, expected):
    assert parse_number(raw) == expected


def test_parse_date_prefers_day_month():
    assert parse_date("03/04/2026") == date(2026, 4, 3)
    assert parse_date("2026-04-03") == date(2026, 4, 3)
    assert parse_date("04/25/2026") == date(2026, 4, 25)  # 25 no puede ser mes → mes/día
    assert parse_date("31/02/2026") is None


def test_type_inference_and_conversion():
    assert infer_type(["1", "2", "3", ""]) == "integer"
    assert infer_type(["$1,200.50", "900"]) == "number"
    assert infer_type(["sí", "no", "Si"]) == "boolean"
    assert infer_type(["", "N/A"]) == "empty"
    assert infer_type(["Ana", "1", "Luis"]) == "text"
    assert convert("$1,200.50", "number") == (1200.5, True)
    assert convert("hola", "number") == (None, False)
    assert convert("N/A", "integer") == (None, True)
    assert convert("26/11/2026", "date") == ("2026-11-26", True)


def test_analysis_finds_missing_duplicates_mixed_and_outliers():
    rows = [["01/10/2026", "Ana", str(100 + i)] for i in range(10)]
    rows += [["01/10/2026", "Ana", "100"]]  # fila 12 del archivo: duplicado de la fila 2
    rows += [["no es fecha", "", "99999"]]  # fila 13: tipo mezclado + faltante + atípico
    r = analyze(["Fecha", "Cliente", "Monto"], rows)
    by_code = {(i["code"], i.get("column")): i for i in r["issues"]}
    assert r["row_count"] == 12 and r["duplicate_rows"] == 1
    assert by_code[("duplicate_rows", None)]["rows"] == [12]
    assert by_code[("missing_values", "Cliente")]["rows"] == [13]
    assert by_code[("mixed_types", "Fecha")]["examples"] == ["no es fecha"]
    assert by_code[("outliers", "Monto")]["rows"] == [13]
    monto = r["columns"][2]
    assert monto["type"] == "integer" and monto["suggested_role"] == "amount" and monto["stats"]["max"] == 99999
    assert r["columns"][0]["suggested_role"] == "date"
    assert r["completeness"] == round(1 - 1 / 36, 4)


def test_csv_semicolon_and_latin1():
    content = "Producto;Precio\nMartillo;1.234,50\nPinzas;99,90\n".encode("cp1252") + "Llave Ñ;10\n".encode("cp1252")
    det = check(content, "inventario.csv")
    assert det.format == "csv" and det.encoding == "cp1252"
    t = parse(content, "csv", encoding=det.encoding, max_rows=100, max_cols=10)
    assert t.options["delimiter"] == ";"
    assert t.headers == ["Producto", "Precio"] and t.rows[2] == ["Llave Ñ", "10"]


def test_csv_utf8_bom_blank_rows_and_duplicate_headers():
    content = "﻿Nombre,Nombre,\n\nAna,1,\n,,\nLuis,2\n".encode()
    t = parse(content, "csv", encoding=check(content, "a.csv").encoding, max_rows=100, max_cols=10)
    assert t.headers == ["Nombre", "Nombre (2)"]
    assert t.rows == [["Ana", "1"], ["Luis", "2"]]
    assert t.skipped_empty_rows == 2


def test_xlsx_values_not_formulas():
    content = xlsx_bytes([["Fecha", "Total"], [date(2026, 1, 5), 10.5], [date(2026, 1, 6), "=B2*2"]])
    assert check(content, "ventas.xlsx").format == "xlsx"
    t = parse(content, "xlsx", max_rows=100, max_cols=10)
    assert t.headers == ["Fecha", "Total"] and t.options["sheet"] == "Ventas"
    assert t.rows[0] == ["2026-01-05", "10.5"]
    # Fórmula sin valor calculado guardado: nunca se evalúa → celda vacía.
    assert t.rows[1] == ["2026-01-06", ""]


@pytest.mark.parametrize(
    ("content", "name", "code"),
    [
        (b"", "a.csv", "upload.empty"),
        (b"a,b\n1,2\n", "a.pdf", "upload.unsupported_format"),
        (b"a,b\n1,2\n", "a.xlsx", "upload.extension_mismatch"),
        (b"\x00\x01binary", "a.csv", "upload.binary"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"0" * 100, "viejo.xlsx", "upload.legacy_or_encrypted"),
        (b"PK\x03\x04 truncated", "a.xlsx", "upload.corrupt"),
        (b"x" * (MB + 1), "big.csv", "upload.too_large"),
        (b"a,b\n", "a.xlsm", "upload.macros_not_allowed"),
    ],
)
def test_rejections(content, name, code):
    with pytest.raises(UploadRejected) as e:
        check(content, name)
    assert e.value.code == code


def test_zip_that_is_not_a_workbook_is_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hola.txt", "no soy excel")
    with pytest.raises(UploadRejected) as e:
        check(buf.getvalue(), "a.xlsx")
    assert e.value.code == "upload.unsupported_format"


def test_macro_workbook_renamed_to_xlsx_is_rejected():
    content = xlsx_bytes([["a"], [1]])
    buf = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(content)) as src, zipfile.ZipFile(buf, "w") as dst:
        for item in src.infolist():
            dst.writestr(item, src.read(item.filename))
        dst.writestr("xl/vbaProject.bin", b"\x00" * 100)
    with pytest.raises(UploadRejected) as e:
        check(buf.getvalue(), "sospechoso.xlsx")
    assert e.value.code == "upload.macros_not_allowed"


def test_zip_bomb_is_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("xl/workbook.xml", "<workbook/>")
        zf.writestr("xl/worksheets/sheet1.xml", "0" * (20 * MB))  # comprime ~1000:1
    with pytest.raises(UploadRejected) as e:
        check(buf.getvalue(), "bomba.xlsx")
    assert e.value.code == "upload.archive_suspicious"


def test_row_and_column_limits():
    many_rows = ("a\n" + "1\n" * 50).encode()
    with pytest.raises(UploadRejected) as e:
        parse(many_rows, "csv", encoding="utf-8-sig", max_rows=10, max_cols=10)
    assert e.value.code == "upload.too_many_rows" and e.value.params["limit"] == 10
    wide = (",".join(f"c{i}" for i in range(20)) + "\n" + ",".join("1" * 20) + "\n").encode()
    with pytest.raises(UploadRejected) as e:
        parse(wide, "csv", encoding="utf-8-sig", max_rows=10, max_cols=5)
    assert e.value.code == "upload.too_many_columns"
