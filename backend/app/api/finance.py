"""Inteligencia financiera: indicadores calculados con los datos importados (sin IA ni costo)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import finance
from app.api.deps import AuthContext, require_permission
from app.db import get_db

router = APIRouter(prefix="/api/finance", tags=["finance"])


@router.get("/overview")
def finance_overview(
    dataset_id: UUID | None = None,
    period_a: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    period_b: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return finance.overview(db, ctx.require_org().id, dataset_id, period_a, period_b)
