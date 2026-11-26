"""Ingesta de datos: subir CSV/XLSX, previsualizar, mapear, confirmar y consultar."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import AuthContext, client_ip, require_permission
from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.ingestion import service
from app.models import DatasetRow, UploadedFile
from app.schemas import (
    ConfirmImportIn,
    DatasetOut,
    DatasetRowsOut,
    DatasetSummaryOut,
    UploadPreviewOut,
    UploadSummaryOut,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("/uploads", response_model=UploadPreviewOut, status_code=201)
async def upload(
    request: Request,
    file: UploadFile = File(...),
    sheet: str | None = Form(None),
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    limit = get_settings().max_upload_bytes
    content = await file.read(limit + 1)  # nunca se lee más de lo permitido
    if len(content) > limit:
        raise ApiError(422, "upload.too_large", "El archivo supera el tamaño máximo.", {"limit_bytes": limit})
    org = ctx.require_org()
    up, table = service.create_upload(
        db,
        org_id=org.id,
        user_id=ctx.user.id,
        filename=file.filename or "archivo",
        content=content,
        sheet=sheet,
        ip=client_ip(request),
    )
    return service.preview(db, up, table)


@router.get("/uploads", response_model=list[UploadSummaryOut])
def list_uploads(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    org = ctx.require_org()
    rows = db.execute(
        select(UploadedFile)
        .where(UploadedFile.organization_id == org.id)
        .order_by(UploadedFile.created_at.desc())
        .limit(100)
    ).scalars()
    return [
        {
            "id": u.id,
            "filename": u.original_filename,
            "format": u.file_format,
            "size_bytes": u.size_bytes,
            "status": u.status,
            "created_at": u.created_at,
        }
        for u in rows
    ]


@router.get("/uploads/{upload_id}", response_model=UploadPreviewOut)
def get_upload(
    upload_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    up = service.get_upload(db, ctx.require_org().id, upload_id)
    return service.preview(db, up, service.load_table(up))


@router.delete("/uploads/{upload_id}", status_code=204)
def discard_upload(
    upload_id: UUID,
    request: Request,
    response: Response,
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    up = service.get_upload(db, org.id, upload_id)
    if up.status == "imported":
        raise ApiError(409, "upload.in_use", "Este archivo pertenece a un conjunto de datos; elimina el conjunto.")
    db.delete(up)
    audit.record(
        db,
        "data.upload_discard",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="upload",
        target_id=upload_id,
        ip=client_ip(request),
    )
    response.status_code = 204
    return response


@router.post("/uploads/{upload_id}/confirm", response_model=DatasetOut, status_code=201)
def confirm(
    upload_id: UUID,
    body: ConfirmImportIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    org = ctx.require_org()
    up = service.get_upload(db, org.id, upload_id)
    ds = service.confirm(
        db,
        up,
        name=body.name,
        mapping=[c.model_dump() for c in body.columns],
        user_id=ctx.user.id,
        ip=client_ip(request),
    )
    return {**service.dataset_summary(ds, up.original_filename), "columns": ds.columns, "report": ds.report}


@router.get("", response_model=list[DatasetSummaryOut])
def list_datasets(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    return service.list_datasets(db, ctx.require_org().id)


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    dataset_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    ds, filename = service.get_dataset(db, ctx.require_org().id, dataset_id)
    return {**service.dataset_summary(ds, filename), "columns": ds.columns, "report": ds.report}


@router.get("/{dataset_id}/rows", response_model=DatasetRowsOut)
def get_rows(
    dataset_id: UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ds, _ = service.get_dataset(db, ctx.require_org().id, dataset_id)
    rows = db.execute(
        select(DatasetRow.row_number, DatasetRow.data)
        .where(DatasetRow.dataset_id == ds.id)
        .order_by(DatasetRow.row_number)
        .offset(offset)
        .limit(limit)
    ).all()
    total = db.execute(select(func.count()).select_from(DatasetRow).where(DatasetRow.dataset_id == ds.id)).scalar_one()
    return {
        "total": int(total),
        "offset": offset,
        "limit": limit,
        "rows": [{"row_number": r.row_number, "data": r.data} for r in rows],
    }


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: UUID,
    request: Request,
    response: Response,
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> Response:
    org = ctx.require_org()
    ds, _ = service.get_dataset(db, org.id, dataset_id)
    upload_id = ds.uploaded_file_id
    db.delete(ds)  # filas en cascada
    if upload_id:
        up = db.get(UploadedFile, upload_id)
        if up is not None:
            db.delete(up)  # libera el almacenamiento del plan
    audit.record(
        db,
        "data.dataset_delete",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="dataset",
        target_id=dataset_id,
        ip=client_ip(request),
    )
    response.status_code = 204
    return response
