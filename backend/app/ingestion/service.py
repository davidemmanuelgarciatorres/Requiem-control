"""Casos de uso de la ingesta: subir y validar, previsualizar, confirmar con mapeo, consultar."""

import hashlib
import uuid
from typing import Any

from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app import audit, entitlements
from app.config import get_settings
from app.errors import ApiError, not_found
from app.ingestion.analysis import ColumnType, analyze, convert
from app.ingestion.parsing import ParsedTable, parse
from app.ingestion.validation import FileFormat, UploadRejected, detect
from app.models import Dataset, DatasetRow, UploadedFile

PREVIEW_ROWS = 20
INSERT_BATCH = 1000


def _reject(e: UploadRejected) -> ApiError:
    return ApiError(422, e.code, e.message, dict(e.params))


def _parse(content: bytes, fmt: FileFormat, options: dict[str, Any]) -> ParsedTable:
    s = get_settings()
    try:
        return parse(
            content,
            fmt,
            encoding=options.get("encoding"),
            sheet=options.get("sheet"),
            max_rows=s.max_import_rows,
            max_cols=s.max_import_columns,
        )
    except UploadRejected as e:
        raise _reject(e) from e


def storage_used_bytes(db: Session, org_id: uuid.UUID) -> int:
    return int(
        db.execute(
            select(func.coalesce(func.sum(UploadedFile.size_bytes), 0)).where(UploadedFile.organization_id == org_id)
        ).scalar_one()
    )


def create_upload(
    db: Session,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    content: bytes,
    sheet: str | None,
    ip: str | None,
) -> tuple[UploadedFile, ParsedTable]:
    s = get_settings()
    try:
        detected = detect(content, filename, max_bytes=s.max_upload_bytes, max_uncompressed=s.max_uncompressed_bytes)
    except UploadRejected as e:
        audit.record_and_commit(
            db,
            "data.upload_rejected",
            organization_id=org_id,
            user_id=user_id,
            ip=ip,
            details={"code": e.code, "size": len(content)},
        )
        raise _reject(e) from e

    ent = entitlements.for_organization(db, org_id)
    used = storage_used_bytes(db, org_id)
    if used + len(content) > ent.max_storage_mb * 1024 * 1024:
        raise ApiError(
            402,
            "plan.max_storage",
            "Tu plan no tiene espacio suficiente para este archivo.",
            {"limit_mb": ent.max_storage_mb, "used_bytes": used},
        )

    options: dict[str, Any] = {"encoding": detected.encoding} if detected.format == "csv" else {"sheet": sheet}
    table = _parse(content, detected.format, options)
    upload = UploadedFile(
        organization_id=org_id,
        uploaded_by=user_id,
        original_filename=filename[:255] or "archivo",
        file_format=detected.format,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        content=content,
        status="validated",
        parse_options=table.options,
    )
    db.add(upload)
    db.flush()
    audit.record(
        db,
        "data.upload",
        organization_id=org_id,
        user_id=user_id,
        target_type="upload",
        target_id=upload.id,
        ip=ip,
        details={"format": detected.format, "size": len(content), "rows": len(table.rows)},
    )
    return upload, table


def get_upload(db: Session, org_id: uuid.UUID, upload_id: uuid.UUID) -> UploadedFile:
    upload = db.execute(
        select(UploadedFile).where(UploadedFile.id == upload_id, UploadedFile.organization_id == org_id)
    ).scalar_one_or_none()
    if upload is None:
        raise not_found("upload")
    return upload


def load_table(upload: UploadedFile) -> ParsedTable:
    return _parse(upload.content, upload.file_format, upload.parse_options)  # type: ignore[arg-type]


def preview(db: Session, upload: UploadedFile, table: ParsedTable) -> dict[str, Any]:
    dup = db.execute(
        select(Dataset.id, Dataset.name)
        .join(UploadedFile, UploadedFile.id == Dataset.uploaded_file_id)
        .where(
            UploadedFile.organization_id == upload.organization_id,
            UploadedFile.sha256 == upload.sha256,
            UploadedFile.id != upload.id,
        )
        .limit(1)
    ).first()
    return {
        "id": upload.id,
        "filename": upload.original_filename,
        "format": upload.file_format,
        "size_bytes": upload.size_bytes,
        "status": upload.status,
        "created_at": upload.created_at,
        "options": upload.parse_options,
        "sheets": table.sheets,
        "row_count": len(table.rows),
        "preview_rows": table.rows[:PREVIEW_ROWS],
        "report": analyze(
            table.headers, table.rows, ragged_rows=table.ragged_rows, skipped_empty_rows=table.skipped_empty_rows
        ),
        "duplicate_of": {"dataset_id": str(dup.id), "name": dup.name} if dup else None,
    }


def confirm(
    db: Session, upload: UploadedFile, *, name: str, mapping: list[dict[str, Any]], user_id: uuid.UUID, ip: str | None
) -> Dataset:
    if upload.status != "validated":
        raise ApiError(409, "upload.already_processed", "Este archivo ya se importó o se descartó.")
    table = load_table(upload)
    by_key = {m["key"]: m for m in mapping}
    selected: list[tuple[int, dict[str, Any]]] = []
    for i in range(len(table.headers)):
        m = by_key.get(f"c{i}")
        if m is None:
            raise ApiError(422, "import.mapping_incomplete", "Falta el mapeo de una o más columnas.")
        if m["include"]:
            selected.append((i, m))
    if not selected:
        raise ApiError(422, "import.no_columns", "Selecciona al menos una columna.")
    names = [m["name"].strip() for _, m in selected]
    if len({n.lower() for n in names}) != len(names):
        raise ApiError(422, "import.duplicate_names", "Hay columnas con el mismo nombre.")

    idx = [i for i, _ in selected]
    types: list[ColumnType] = [m["type"] for _, m in selected]
    sub_rows = [[r[i] for i in idx] for r in table.rows]
    report = analyze(
        names, sub_rows, types=types, ragged_rows=table.ragged_rows, skipped_empty_rows=table.skipped_empty_rows
    )

    columns = [
        {"key": f"c{n}", "name": names[n], "source": table.headers[i], "type": types[n], "role": m["role"]}
        for n, (i, m) in enumerate(selected)
    ]
    dataset = Dataset(
        organization_id=upload.organization_id,
        uploaded_file_id=upload.id,
        created_by=user_id,
        name=name.strip(),
        row_count=len(sub_rows),
        column_count=len(columns),
        columns=columns,
        report=report,
    )
    db.add(dataset)
    db.flush()

    failures = [0] * len(columns)
    batch: list[dict[str, Any]] = []
    for row_index, row in enumerate(sub_rows):
        data: dict[str, Any] = {}
        for n, cell in enumerate(row):
            value, ok = convert(cell, types[n])
            if not ok:
                failures[n] += 1
            data[columns[n]["key"]] = value
        # Número de fila del archivo original (la 1 es el encabezado) para trazar cada dato a su origen.
        batch.append(
            {
                "dataset_id": dataset.id,
                "organization_id": upload.organization_id,
                "row_number": row_index + 2,
                "data": data,
            }
        )
        if len(batch) >= INSERT_BATCH:
            db.execute(insert(DatasetRow), batch)
            batch = []
    if batch:
        db.execute(insert(DatasetRow), batch)

    for n, col in enumerate(columns):
        col["conversion_failures"] = failures[n]
    dataset.columns = columns
    upload.status = "imported"
    audit.record(
        db,
        "data.import",
        organization_id=upload.organization_id,
        user_id=user_id,
        target_type="dataset",
        target_id=dataset.id,
        ip=ip,
        details={"rows": len(sub_rows), "columns": len(columns)},
    )
    db.flush()
    return dataset


def dataset_summary(d: Dataset, filename: str | None) -> dict[str, Any]:
    return {
        "id": d.id,
        "name": d.name,
        "row_count": d.row_count,
        "column_count": d.column_count,
        "completeness": d.report.get("completeness", 1.0),
        "issue_count": len(d.report.get("issues", [])),
        "source_filename": filename,
        "created_at": d.created_at,
    }


def list_datasets(db: Session, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Dataset, UploadedFile.original_filename)
        .outerjoin(UploadedFile, UploadedFile.id == Dataset.uploaded_file_id)
        .where(Dataset.organization_id == org_id)
        .order_by(Dataset.created_at.desc())
    ).all()
    return [dataset_summary(d, fn) for d, fn in rows]


def get_dataset(db: Session, org_id: uuid.UUID, dataset_id: uuid.UUID) -> tuple[Dataset, str | None]:
    row = db.execute(
        select(Dataset, UploadedFile.original_filename)
        .outerjoin(UploadedFile, UploadedFile.id == Dataset.uploaded_file_id)
        .where(Dataset.id == dataset_id, Dataset.organization_id == org_id)
    ).first()
    if row is None:
        raise not_found("dataset")
    return row[0], row[1]
