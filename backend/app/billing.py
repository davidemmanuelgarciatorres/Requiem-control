"""Cobros (Fase 8) con Stripe por su API oficial (REST), sin guardar datos de tarjeta.

- Suscribirse: se crea una sesión de Stripe Checkout y el navegador va a la página de pago de Stripe.
- Administrar/cancelar: portal de clientes de Stripe.
- Webhooks: se verifica la firma (HMAC-SHA256 con el secreto `whsec_…`, tolerancia 5 min) ANTES de leer
  nada; cada evento se procesa una sola vez (`billing_events`). El plan de la organización solo cambia
  por un webhook verificado, nunca por lo que diga el navegador.
"""

import hashlib
import hmac
import json
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx2
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import set_tenant_context
from app.errors import ApiError
from app.models import Subscription

STRIPE_API = "https://api.stripe.com/v1"
TOLERANCE_SECONDS = 300
PREMIUM = "premium"

client_factory: Callable[[], httpx2.Client] = lambda: httpx2.Client(timeout=20.0)  # noqa: E731


def missing_configuration() -> list[str]:
    s = get_settings()
    if s.billing_provider != "stripe":
        return ["BILLING_PROVIDER=stripe"]
    missing = []
    if not s.stripe_secret_key or not s.stripe_secret_key.get_secret_value():
        missing.append("STRIPE_SECRET_KEY")
    if not s.stripe_webhook_secret or not s.stripe_webhook_secret.get_secret_value():
        missing.append("STRIPE_WEBHOOK_SECRET")
    if not s.stripe_price_premium:
        missing.append("STRIPE_PRICE_PREMIUM")
    return missing


def test_mode() -> bool:
    key = get_settings().stripe_secret_key
    return bool(key and key.get_secret_value().startswith(("sk_test_", "rk_test_")))


def _stripe(method: str, path: str, data: dict[str, Any], idempotency_key: str | None = None) -> dict[str, Any]:
    s = get_settings()
    if missing_configuration():
        raise ApiError(503, "billing.not_configured", "Los pagos no están configurados.")
    assert s.stripe_secret_key is not None
    headers = {"Authorization": f"Bearer {s.stripe_secret_key.get_secret_value()}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        with client_factory() as http:
            r = http.request(method, f"{STRIPE_API}{path}", data=data, headers=headers)
    except httpx2.HTTPError as e:
        raise ApiError(502, "billing.unreachable", "No se pudo contactar al proveedor de pagos.") from e
    if r.status_code >= 400:
        raise ApiError(
            502, "billing.provider_error", "El proveedor de pagos rechazó la solicitud.", {"status": r.status_code}
        )
    return dict(r.json())


def current(db: Session, org_id: uuid.UUID) -> Subscription:
    return db.execute(select(Subscription).where(Subscription.organization_id == org_id)).scalar_one()


def checkout(db: Session, *, org_id: uuid.UUID, user_email: str) -> str:
    sub = current(db, org_id)
    if sub.plan.code == PREMIUM and sub.status in ("active", "trialing", "past_due"):
        raise ApiError(409, "billing.already_premium", "Tu organización ya tiene Premium.")
    s = get_settings()
    data: dict[str, Any] = {
        "mode": "subscription",
        "line_items[0][price]": s.stripe_price_premium,
        "line_items[0][quantity]": 1,
        "success_url": f"{s.public_app_url}/settings?billing=success",
        "cancel_url": f"{s.public_app_url}/settings?billing=cancel",
        "client_reference_id": str(org_id),
        "metadata[organization_id]": str(org_id),
        "subscription_data[metadata][organization_id]": str(org_id),
        "locale": "es",
    }
    if sub.provider_customer_id:
        data["customer"] = sub.provider_customer_id
    else:
        data["customer_email"] = user_email
    # Misma clave durante un minuto: un doble clic no crea dos sesiones de pago.
    session = _stripe("POST", "/checkout/sessions", data, idempotency_key=f"checkout-{org_id}-{int(time.time() // 60)}")
    return str(session["url"])


def portal(db: Session, *, org_id: uuid.UUID) -> str:
    sub = current(db, org_id)
    if not sub.provider_customer_id:
        raise ApiError(409, "billing.no_customer", "Aún no tienes una suscripción de pago.")
    s = get_settings()
    session = _stripe(
        "POST",
        "/billing_portal/sessions",
        {"customer": sub.provider_customer_id, "return_url": f"{s.public_app_url}/settings"},
    )
    return str(session["url"])


# --- Webhooks -------------------------------------------------------------------------------------
def verify_signature(payload: bytes, header: str | None, secret: str, now: float | None = None) -> None:
    """Verificación de la firma de Stripe (esquema v1). Lanza ApiError(400) si no es válida."""
    if not header:
        raise ApiError(400, "billing.bad_signature", "Firma ausente.")
    parts: dict[str, list[str]] = {}
    for item in header.split(","):
        k, _, v = item.strip().partition("=")
        parts.setdefault(k, []).append(v)
    try:
        ts = int(parts["t"][0])
    except (KeyError, ValueError, IndexError) as e:
        raise ApiError(400, "billing.bad_signature", "Firma inválida.") from e
    if abs((now or time.time()) - ts) > TOLERANCE_SECONDS:
        raise ApiError(400, "billing.bad_signature", "Firma caducada.")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", [])):
        raise ApiError(400, "billing.bad_signature", "Firma inválida.")


STATUS_MAP = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "unpaid": "past_due",
    "incomplete": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
    "paused": "past_due",
}


def _org_from(db: Session, obj: dict[str, Any]) -> uuid.UUID | None:
    raw = (obj.get("metadata") or {}).get("organization_id") or obj.get("client_reference_id")
    if raw:
        try:
            return uuid.UUID(str(raw))
        except ValueError:
            return None
    ref = obj.get("subscription") if obj.get("object") in ("invoice", "checkout.session") else obj.get("id")
    if ref:
        found = db.execute(text("SELECT billing_org_by_ref('stripe', :r)"), {"r": str(ref)}).scalar()
        return found if isinstance(found, uuid.UUID) else (uuid.UUID(str(found)) if found else None)
    return None


def _apply(
    db: Session,
    org: uuid.UUID,
    *,
    plan: str,
    status: str,
    ref: str | None,
    customer: str | None,
    period_end: int | None,
    cancel: bool,
) -> None:
    db.execute(
        text("SELECT billing_apply(:o, :p, :s, 'stripe', :r, :c, :e, :x)"),
        {
            "o": org,
            "p": plan,
            "s": status,
            "r": ref,
            "c": customer,
            "e": datetime.fromtimestamp(period_end, UTC) if period_end else None,
            "x": cancel,
        },
    )


def handle_event(db: Session, event: dict[str, Any]) -> str:
    """Aplica un evento verificado. Devuelve 'processed', 'duplicate' o 'ignored'."""
    etype = str(event.get("type", ""))
    obj = (event.get("data") or {}).get("object") or {}
    org = _org_from(db, obj)
    if not db.execute(
        text("SELECT billing_record_event('stripe', :e, :t, :o)"), {"e": str(event.get("id")), "t": etype, "o": org}
    ).scalar():
        return "duplicate"
    if org is None:
        return "ignored"
    if etype == "checkout.session.completed" and obj.get("mode") == "subscription":
        _apply(
            db,
            org,
            plan=PREMIUM,
            status="active",
            ref=obj.get("subscription"),
            customer=obj.get("customer"),
            period_end=None,
            cancel=False,
        )
    elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        status = "canceled" if etype.endswith("deleted") else STATUS_MAP.get(str(obj.get("status")), "past_due")
        items = (obj.get("items") or {}).get("data") or [{}]
        period_end = obj.get("current_period_end") or items[0].get("current_period_end")
        if status == "canceled":
            # Vuelve al plan gratuito; los datos se conservan y los límites gratuitos aplican a lo nuevo.
            _apply(
                db,
                org,
                plan="free",
                status="active",
                ref=None,
                customer=obj.get("customer"),
                period_end=None,
                cancel=False,
            )
        else:
            _apply(
                db,
                org,
                plan=PREMIUM,
                status=status,
                ref=obj.get("id"),
                customer=obj.get("customer"),
                period_end=period_end,
                cancel=bool(obj.get("cancel_at_period_end")),
            )
    elif etype == "invoice.payment_failed":
        sub_ref = obj.get("subscription")
        _apply(
            db,
            org,
            plan=PREMIUM,
            status="past_due",
            ref=sub_ref,
            customer=obj.get("customer"),
            period_end=None,
            cancel=False,
        )
    else:
        return "ignored"
    set_tenant_context(db, user_id=None, org_id=org)
    audit.record(
        db,
        f"billing.{etype}",
        organization_id=org,
        user_id=None,
        target_type="subscription",
        target_id=None,
        details={"event": str(event.get("id"))},
    )
    return "processed"


def parse_and_handle(db: Session, payload: bytes, signature: str | None) -> str:
    s = get_settings()
    if not s.stripe_webhook_secret or not s.stripe_webhook_secret.get_secret_value():
        raise ApiError(503, "billing.not_configured", "Los pagos no están configurados.")
    verify_signature(payload, signature, s.stripe_webhook_secret.get_secret_value())
    try:
        event = json.loads(payload)
    except ValueError as e:
        raise ApiError(400, "billing.bad_payload", "Evento inválido.") from e
    return handle_event(db, event)
