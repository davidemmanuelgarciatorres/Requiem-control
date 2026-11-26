"""Integraciones (Fase 6): estado, conexión OAuth con Google, desconexión y lectura de solo lectura."""

from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import AuthContext, client_ip, get_auth, require_permission
from app.db import get_db, set_tenant_context
from app.errors import ApiError
from app.ingestion import service as ingestion
from app.integrations import google

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class ConnectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    services: list[str] = Field(min_length=1, max_length=3)


class SheetImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spreadsheet_id: str = Field(min_length=10, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    tab: str | None = Field(default=None, max_length=100)


@router.get("")
def status(ctx: AuthContext = Depends(require_permission("org.read")), db: Session = Depends(get_db)) -> dict[str, Any]:
    org = ctx.require_org()
    integ = google.get(db, org.id)
    missing = google.missing_configuration()
    return {
        "google": {
            "configured": not missing,
            "missing": missing,
            "plan_allows": google.plan_allows(db, org.id),
            "can_manage": "integrations.manage" in ctx.permissions,
            "status": integ.status if integ else "disconnected",
            "services": integ.services if integ else [],
            "account_email": integ.account_email if integ else None,
            "connected_at": integ.connected_at.isoformat() if integ and integ.connected_at else None,
            "last_sync_at": integ.last_sync_at.isoformat() if integ and integ.last_sync_at else None,
            "last_error": integ.last_error if integ else None,
            "available_services": list(google.SERVICES),
            "scopes": {k: v for k, v in google.SERVICE_SCOPES.items()},
        }
    }


@router.post("/google/connect")
def connect(
    body: ConnectIn,
    ctx: AuthContext = Depends(require_permission("integrations.manage")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    url = google.start(db, org_id=ctx.require_org().id, user_id=ctx.user.id, services=body.services)
    return {"authorization_url": url}


@router.get("/google/callback")
def callback(
    request: Request,
    state: str = Query(max_length=200),
    code: str | None = Query(default=None, max_length=2000),
    error: str | None = Query(default=None, max_length=200),
    ctx: AuthContext = Depends(get_auth),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Google redirige aquí al navegador. Siempre se termina en /integrations con el resultado (sin datos sensibles)."""
    org = ctx.require_org()
    try:
        if "integrations.manage" not in ctx.permissions:
            raise ApiError(403, "auth.forbidden", "Sin permiso.")
        google.finish(db, org_id=org.id, user_id=ctx.user.id, state=state, code=code, error=error)
        db.commit()
        target = "/integrations?" + urlencode({"connected": "google"})
    except ApiError as e:
        db.commit()  # conserva el `state` marcado como usado (un solo intento)
        set_tenant_context(db, user_id=ctx.user.id, org_id=org.id)  # el contexto RLS es por transacción
        audit.record_and_commit(
            db,
            "integration.connect_failed",
            organization_id=org.id,
            user_id=ctx.user.id,
            ip=client_ip(request),
            details={"code": e.code},
        )
        target = "/integrations?" + urlencode({"error": e.code})
    return RedirectResponse(target, status_code=303)


@router.post("/google/disconnect", status_code=204)
def disconnect(
    response: Response,
    ctx: AuthContext = Depends(require_permission("integrations.manage")),
    db: Session = Depends(get_db),
) -> Response:
    google.disconnect(db, org_id=ctx.require_org().id, user_id=ctx.user.id)
    response.status_code = 204
    return response


@router.get("/google/sheets")
def spreadsheets(
    q: str | None = Query(default=None, max_length=100),
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    return google.list_spreadsheets(db, ctx.require_org().id, q)


@router.get("/google/sheets/{spreadsheet_id}")
def spreadsheet(
    spreadsheet_id: str, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    if not spreadsheet_id.replace("-", "").replace("_", "").isalnum():
        raise ApiError(422, "request.invalid", "Identificador inválido.")
    return google.sheet_tabs(db, ctx.require_org().id, spreadsheet_id)


@router.post("/google/sheets/import", status_code=201)
def import_sheet(
    body: SheetImportIn,
    request: Request,
    ctx: AuthContext = Depends(require_permission("data.write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Convierte la pestaña en CSV y la pasa por el MISMO flujo seguro de importación."""
    org = ctx.require_org()
    filename, content = google.sheet_as_csv(db, org.id, body.spreadsheet_id, body.tab)
    up, table = ingestion.create_upload(
        db, org_id=org.id, user_id=ctx.user.id, filename=filename, content=content, sheet=None, ip=client_ip(request)
    )
    audit.record(
        db,
        "integration.sheet_import",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="upload",
        target_id=up.id,
        details={"spreadsheet_id": body.spreadsheet_id},
    )
    return ingestion.preview(db, up, table)


@router.get("/google/drive/recent")
def drive(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    return google.drive_recent(db, ctx.require_org().id)


@router.get("/google/gmail/recent")
def gmail(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    return google.gmail_recent(db, ctx.require_org().id)
