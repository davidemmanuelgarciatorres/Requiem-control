"""Fase 8: cobros con Stripe (simulado): checkout, portal, webhooks firmados e idempotentes, cambios de plan."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs

import httpx2
import pytest
from sqlalchemy import text

from app import billing
from app.config import get_settings

SECRET = "whsec_test_secret"


@pytest.fixture
def stripe(monkeypatch):
    monkeypatch.setenv("BILLING_PROVIDER", "stripe")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("STRIPE_PRICE_PREMIUM", "price_premium_mxn")
    monkeypatch.setenv("PUBLIC_APP_URL", "https://app.example.mx")
    get_settings.cache_clear()
    calls = []

    def handler(request):
        calls.append(
            {"path": request.url.path, "data": parse_qs(request.content.decode()), "headers": dict(request.headers)}
        )
        if request.url.path.endswith("/checkout/sessions"):
            return httpx2.Response(200, json={"id": "cs_1", "url": "https://checkout.stripe.com/c/cs_1"})
        if request.url.path.endswith("/billing_portal/sessions"):
            return httpx2.Response(200, json={"url": "https://billing.stripe.com/p/1"})
        return httpx2.Response(404, json={})

    monkeypatch.setattr(billing, "client_factory", lambda: httpx2.Client(transport=httpx2.MockTransport(handler)))
    yield calls
    get_settings.cache_clear()


def signed(event, secret=SECRET, ts=None):
    body = json.dumps(event).encode()
    t = int(ts or time.time())
    sig = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={t},v1={sig}"


def post_webhook(client, event, **kw):
    body, header = signed(event, **kw)
    return client.http.post(
        "/api/billing/webhook/stripe",
        content=body,
        headers={"Stripe-Signature": header, "Content-Type": "application/json"},
    )


def org_id(client):
    return client.session["active_organization"]["id"]


def test_not_configured_is_honest(client):
    client.register("owner@example.com")
    st = client.get("/api/billing/status").json()
    assert st["configured"] is False and st["plan"] == "free"
    r = client.send("POST", "/api/billing/checkout")
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing.not_configured"
    assert client.get("/api/organizations/current/subscription").json()["billing_enabled"] is False


def test_checkout_session_shape_and_idempotency(client, stripe):
    client.register("owner@example.com")
    r = client.send("POST", "/api/billing/checkout")
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.com/")
    call = stripe[0]
    d = call["data"]
    assert d["mode"] == ["subscription"] and d["line_items[0][price]"] == ["price_premium_mxn"]
    assert d["client_reference_id"] == [org_id(client)] and d["subscription_data[metadata][organization_id]"] == [
        org_id(client)
    ]
    assert d["success_url"] == ["https://app.example.mx/settings?billing=success"]
    assert call["headers"]["authorization"] == "Bearer sk_test_123" and call["headers"]["idempotency-key"].startswith(
        "checkout-"
    )
    assert client.get("/api/billing/status").json()["test_mode"] is True
    # Cambiar de plan desde el navegador NO es posible: solo un webhook firmado lo hace.
    assert client.get("/api/billing/status").json()["plan"] == "free"


def test_signed_webhooks_upgrade_update_and_cancel(client, stripe):
    client.register("owner@example.com")
    oid = org_id(client)
    r = post_webhook(
        client,
        {
            "id": "evt_1",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "object": "checkout.session",
                    "mode": "subscription",
                    "client_reference_id": oid,
                    "subscription": "sub_1",
                    "customer": "cus_1",
                }
            },
        },
    )
    assert r.status_code == 200 and r.json()["result"] == "processed"
    st = client.get("/api/billing/status").json()
    assert st["plan"] == "premium" and st["status"] == "active" and st["has_customer"] is True
    sub = client.get("/api/organizations/current/subscription").json()
    assert sub["plan"]["code"] == "premium" and sub["plan"]["max_active_agents"] > 2  # límites de Premium
    # Mismo evento otra vez: no se procesa dos veces.
    assert (
        post_webhook(client, {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {}}}).json()[
            "result"
        ]
        == "duplicate"
    )
    # Pago fallido → past_due (se localiza por la suscripción, sin metadatos).
    post_webhook(
        client,
        {
            "id": "evt_2",
            "type": "invoice.payment_failed",
            "data": {"object": {"object": "invoice", "subscription": "sub_1", "customer": "cus_1"}},
        },
    )
    assert client.get("/api/billing/status").json()["status"] == "past_due"
    # Renovación con fecha de fin de periodo y cancelación programada.
    end = int(time.time()) + 30 * 86400
    post_webhook(
        client,
        {
            "id": "evt_3",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "object": "subscription",
                    "id": "sub_1",
                    "customer": "cus_1",
                    "status": "active",
                    "cancel_at_period_end": True,
                    "metadata": {"organization_id": oid},
                    "items": {"data": [{"current_period_end": end}]},
                }
            },
        },
    )
    st = client.get("/api/billing/status").json()
    assert st["status"] == "active" and st["cancel_at_period_end"] is True and st["current_period_end"] is not None
    # Cancelación definitiva → vuelve al plan gratuito.
    post_webhook(
        client,
        {
            "id": "evt_4",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "object": "subscription",
                    "id": "sub_1",
                    "customer": "cus_1",
                    "status": "canceled",
                    "metadata": {"organization_id": oid},
                }
            },
        },
    )
    st = client.get("/api/billing/status").json()
    assert st["plan"] == "free" and st["status"] == "active"
    r = client.send("POST", "/api/billing/portal")
    assert r.status_code == 200 and r.json()["url"].startswith("https://billing.stripe.com/")
    actions = [a["action"] for a in client.get("/api/organizations/current/audit-logs").json()]
    assert "billing.checkout.session.completed" in actions and "billing.customer.subscription.deleted" in actions


def test_bad_signatures_are_rejected(client, stripe):
    client.register("owner@example.com")
    ev = {
        "id": "evt_x",
        "type": "checkout.session.completed",
        "data": {"object": {"mode": "subscription", "client_reference_id": org_id(client)}},
    }
    assert post_webhook(client, ev, secret="whsec_wrong").status_code == 400
    assert post_webhook(client, ev, ts=time.time() - 3600).status_code == 400  # repetición antigua
    r = client.http.post(
        "/api/billing/webhook/stripe", content=json.dumps(ev).encode(), headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 400
    assert client.get("/api/billing/status").json()["plan"] == "free"


def test_only_billing_managers_can_pay_and_premium_cannot_checkout_twice(client, make_client, stripe):
    client.register("owner@example.com", org="Ferretería")
    oid = org_id(client)
    member = make_client()
    member.register("member@example.com", org="Propia")
    client.send("POST", "/api/organizations/current/members", json={"email": "member@example.com", "role": "admin"})
    target = next(o for o in member.get("/api/organizations").json() if o["name"] == "Ferretería")
    member.send("POST", "/api/auth/switch-organization", json={"organization_id": target["id"]})
    assert member.send("POST", "/api/billing/checkout").status_code == 403  # admin no maneja la facturación
    post_webhook(
        client,
        {
            "id": "evt_p",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "object": "checkout.session",
                    "mode": "subscription",
                    "client_reference_id": oid,
                    "subscription": "sub_9",
                    "customer": "cus_9",
                }
            },
        },
    )
    r = client.send("POST", "/api/billing/checkout")
    assert r.status_code == 409 and r.json()["error"]["code"] == "billing.already_premium"


def test_shared_rate_limiter_stores_hashed_keys(client, owner_engine):
    from app.api import auth as auth_api

    for _ in range(3):
        client.http.post("/api/auth/login", json={"email": "nadie@example.com", "password": "x" * 12})
    with owner_engine.begin() as c:
        buckets = [r[0] for r in c.execute(text("SELECT DISTINCT bucket FROM rate_limit_hits"))]
    assert buckets and all("@" not in b and len(b) == 64 for b in buckets)
    auth_api.login_limiter.reset()
