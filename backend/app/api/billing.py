"""Cobros (Fase 8): estado, suscribirse (Stripe Checkout), administrar (portal) y webhook firmado."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app import audit, billing
from app.api.deps import AuthContext, require_permission
from app.db import get_db

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/status")
def status(
    ctx: AuthContext = Depends(require_permission("billing.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    sub = billing.current(db, ctx.require_org().id)
    return {
        "configured": not billing.missing_configuration(),
        "test_mode": billing.test_mode(),
        "can_manage": "billing.manage" in ctx.permissions,
        "plan": sub.plan.code,
        "status": sub.status,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "has_customer": bool(sub.provider_customer_id),
        "price_cents": next((p for p in [sub.plan.price_cents] if sub.plan.code == "premium"), None),
    }


@router.post("/checkout")
def checkout(
    ctx: AuthContext = Depends(require_permission("billing.manage")), db: Session = Depends(get_db)
) -> dict[str, str]:
    org = ctx.require_org()
    url = billing.checkout(db, org_id=org.id, user_email=str(ctx.user.email))
    audit.record(
        db,
        "billing.checkout_started",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="subscription",
        target_id=None,
    )
    return {"url": url}


@router.post("/portal")
def portal(
    ctx: AuthContext = Depends(require_permission("billing.manage")), db: Session = Depends(get_db)
) -> dict[str, str]:
    return {"url": billing.portal(db, org_id=ctx.require_org().id)}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    """Llamado por Stripe (sin sesión). La firma se verifica antes de leer el contenido."""
    payload = await request.body()
    if len(payload) > 512 * 1024:
        return {"result": "ignored"}
    result = billing.parse_and_handle(db, payload, request.headers.get("stripe-signature"))
    return {"result": result}
