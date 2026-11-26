"""Personalización del usuario: imágenes flotantes (máx. 3) y sus preferencias."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import AuthContext, client_ip, get_auth
from app.db import get_db
from app.errors import ApiError, not_found
from app.floaters import MAX_FLOATERS, MAX_UPLOAD_BYTES, FloaterImageError, process_image
from app.models import UserFloater
from app.schemas import FloaterOut, FloaterPreferences, FloatersOut

router = APIRouter(prefix="/api/me", tags=["me"])


def _prefs(ctx: AuthContext) -> FloaterPreferences:
    return FloaterPreferences.model_validate((ctx.user.ui_preferences or {}).get("floaters", {}))


def _list(db: Session, ctx: AuthContext) -> list[UserFloater]:
    return list(
        db.execute(
            select(UserFloater).where(UserFloater.user_id == ctx.user.id).order_by(UserFloater.position)
        ).scalars()
    )


@router.get("/floaters", response_model=FloatersOut)
def get_floaters(ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {
        "preferences": _prefs(ctx),
        "images": [FloaterOut.model_validate(f, from_attributes=True) for f in _list(db, ctx)],
        "max_images": MAX_FLOATERS,
    }


@router.post("/floaters", response_model=FloaterOut, status_code=201)
async def add_floater(
    request: Request, file: UploadFile = File(...), ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> UserFloater:
    used = {f.position for f in _list(db, ctx)}
    free = [p for p in range(MAX_FLOATERS) if p not in used]
    if not free:
        raise ApiError(409, "floaters.limit", "Ya tienes el máximo de imágenes.", {"limit": MAX_FLOATERS})
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        data, w, h = process_image(raw)
    except FloaterImageError as e:
        raise ApiError(422, e.code, e.message) from e
    floater = UserFloater(user_id=ctx.user.id, position=free[0], image=data, width=w, height=h)
    db.add(floater)
    db.flush()
    db.refresh(floater)
    audit.record(
        db,
        "me.floater_add",
        organization_id=ctx.session.active_organization_id,
        user_id=ctx.user.id,
        target_type="floater",
        target_id=floater.id,
        ip=client_ip(request),
        details={"bytes": len(data)},
    )
    return floater


@router.get("/floaters/{floater_id}/image")
def floater_image(floater_id: UUID, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> Response:
    f = db.execute(
        select(UserFloater).where(UserFloater.id == floater_id, UserFloater.user_id == ctx.user.id)
    ).scalar_one_or_none()
    if f is None:
        raise not_found("floater")
    return Response(
        content=f.image, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400, immutable"}
    )


@router.delete("/floaters/{floater_id}", status_code=204)
def delete_floater(
    floater_id: UUID, response: Response, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> Response:
    f = db.execute(
        select(UserFloater).where(UserFloater.id == floater_id, UserFloater.user_id == ctx.user.id)
    ).scalar_one_or_none()
    if f is None:
        raise not_found("floater")
    db.delete(f)
    response.status_code = 204
    return response


@router.put("/preferences/floaters", response_model=FloaterPreferences)
def set_floater_preferences(
    body: FloaterPreferences, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)
) -> FloaterPreferences:
    prefs = dict(ctx.user.ui_preferences or {})
    prefs["floaters"] = body.model_dump()
    ctx.user.ui_preferences = prefs
    db.flush()
    return body
