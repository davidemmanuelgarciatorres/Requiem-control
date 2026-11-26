"""Fase 6: integración con Google por OAuth (PKCE + state de un solo uso), tokens cifrados, renovación,
lectura de Sheets/Drive/Gmail, importación por el flujo seguro, desconexión, permisos y aislamiento.
Google se simula con un transporte HTTP: no hay red ni cuentas reales."""

import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text

from app.config import get_settings
from app.integrations import google

SHEETS = google.SERVICE_SCOPES["sheets"]


class FakeGoogle:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.token_status = 200
        self.refresh_ok = True
        self.api_401_once = False
        self.granted = ["openid", "email", *SHEETS]

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        body = parse_qs(request.content.decode()) if request.method == "POST" else {}
        self.calls.append((request.method, url, body))
        if url.startswith(google.TOKEN_URL):
            if body.get("grant_type") == ["refresh_token"]:
                if not self.refresh_ok:
                    return httpx2.Response(400, json={"error": "invalid_grant"})
                return httpx2.Response(200, json={"access_token": "ACCESS-2", "expires_in": 3600})
            if self.token_status != 200:
                return httpx2.Response(self.token_status, json={"error": "invalid_grant"})
            return httpx2.Response(
                200,
                json={
                    "access_token": "ACCESS-1",
                    "refresh_token": "REFRESH-1",
                    "expires_in": 3600,
                    "scope": " ".join(self.granted),
                    "token_type": "Bearer",
                },
            )
        if url.startswith(google.USERINFO_URL):
            return httpx2.Response(200, json={"email": "dueño@ejemplo.mx"})
        if url.startswith(google.REVOKE_URL):
            return httpx2.Response(200)
        if self.api_401_once:
            self.api_401_once = False
            return httpx2.Response(401, json={})
        if url.startswith(google.DRIVE_FILES):
            return httpx2.Response(
                200,
                json={
                    "files": [{"id": "sheet1234567890", "name": "Ventas 2026", "modifiedTime": "2026-11-20T10:00:00Z"}]
                },
            )
        if url.startswith(f"{google.SHEETS_API}/sheet1234567890/values/"):
            return httpx2.Response(
                200, json={"values": [["Fecha", "Monto"], ["01/10/2026", "$1,000.00"], ["02/10/2026", "=1+1"]]}
            )
        if url.startswith(f"{google.SHEETS_API}/sheet1234567890"):
            return httpx2.Response(
                200, json={"properties": {"title": "Ventas 2026"}, "sheets": [{"properties": {"title": "Octubre"}}]}
            )
        if url.startswith(f"{google.GMAIL_API}/messages/"):
            return httpx2.Response(
                200,
                json={
                    "labelIds": ["UNREAD"],
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "cliente@x.mx"},
                            {"name": "Subject", "value": "Pedido"},
                            {"name": "Date", "value": "Thu"},
                        ]
                    },
                },
            )
        if url.startswith(f"{google.GMAIL_API}/messages"):
            return httpx2.Response(200, json={"messages": [{"id": "m1"}]})
        return httpx2.Response(404, json={})


@pytest.fixture
def fake(monkeypatch):
    f = FakeGoogle()
    monkeypatch.setattr(google, "client_factory", lambda: httpx2.Client(transport=httpx2.MockTransport(f)))
    return f


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("INTEGRATIONS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("ALLOW_INTEGRATIONS_ON_FREE", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def connect(client, services=("sheets",)):
    r = client.send("POST", "/api/integrations/google/connect", json={"services": list(services)})
    assert r.status_code == 200, r.text
    return r.json()["authorization_url"]


def callback(client, state, code="CODE", **extra):
    params = {"state": state, **({"code": code} if code else {}), **extra}
    r = client.get("/api/integrations/google/callback", params=params, follow_redirects=False)
    assert r.status_code == 303
    return r.headers["location"]


def connected(client, fake, services=("sheets",)):
    url = connect(client, services)
    state = parse_qs(urlparse(url).query)["state"][0]
    assert callback(client, state) == "/integrations?connected=google"
    return state


def test_not_configured_is_honest(client):
    client.register("owner@example.com")
    g = client.get("/api/integrations").json()["google"]
    assert g["configured"] is False and g["status"] == "disconnected"
    assert set(g["missing"]) == {"GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"}
    r = client.send("POST", "/api/integrations/google/connect", json={"services": ["sheets"]})
    assert r.status_code == 503 and r.json()["error"]["code"] == "integration.not_configured"


def test_free_plan_blocks_integrations_in_production(client, configured, monkeypatch):
    monkeypatch.setenv("ALLOW_INTEGRATIONS_ON_FREE", "false")
    get_settings.cache_clear()
    client.register("owner@example.com")
    assert client.get("/api/integrations").json()["google"]["plan_allows"] is False
    r = client.send("POST", "/api/integrations/google/connect", json={"services": ["sheets"]})
    assert r.status_code == 402 and r.json()["error"]["code"] == "plan.integrations"


def test_authorization_url_uses_pkce_state_and_minimal_readonly_scopes(client, configured):
    client.register("owner@example.com")
    q = parse_qs(urlparse(connect(client, ["sheets", "gmail"])).query)
    assert q["code_challenge_method"] == ["S256"] and len(q["code_challenge"][0]) >= 43
    assert q["access_type"] == ["offline"] and q["response_type"] == ["code"]
    scopes = q["scope"][0].split()
    assert (
        "https://www.googleapis.com/auth/gmail.readonly" in scopes
        and "https://www.googleapis.com/auth/spreadsheets.readonly" in scopes
    )
    assert not any(
        s.endswith(("/drive", "/gmail.modify", "/gmail.send", "/spreadsheets")) for s in scopes
    )  # nada de escritura
    assert len(q["state"][0]) >= 40


def test_full_connection_flow_encrypted_tokens_and_single_use_state(client, configured, fake, owner_engine):
    client.register("owner@example.com")
    state = connected(client, fake)
    token_call = next(c for c in fake.calls if c[1].startswith(google.TOKEN_URL))
    assert token_call[2]["code_verifier"][0] and token_call[2]["grant_type"] == ["authorization_code"]
    g = client.get("/api/integrations").json()["google"]
    assert g["status"] == "connected" and g["services"] == ["sheets"] and g["account_email"] == "dueño@ejemplo.mx"
    with owner_engine.begin() as c:
        access, refresh = c.execute(text("SELECT access_token_enc, refresh_token_enc FROM integrations")).one()
    assert b"ACCESS-1" not in bytes(access) and b"REFRESH-1" not in bytes(refresh)  # cifrados en reposo
    # El mismo `state` no sirve dos veces.
    assert callback(client, state) == "/integrations?error=integration.state_used"
    actions = [a["action"] for a in client.get("/api/organizations/current/audit-logs").json()]
    assert "integration.connect" in actions and "integration.connect_failed" in actions


def test_state_from_another_user_expired_denied_and_bad_exchange(client, make_client, configured, fake, owner_engine):
    client.register("owner@example.com")
    state = parse_qs(urlparse(connect(client)).query)["state"][0]
    attacker = make_client()
    attacker.register("attacker@example.com", org="Otra")
    assert callback(attacker, state) == "/integrations?error=integration.invalid_state"
    assert callback(client, "inventado") == "/integrations?error=integration.invalid_state"
    with owner_engine.begin() as c:
        c.execute(text("UPDATE oauth_states SET expires_at = now() - interval '1 minute'"))
    assert callback(client, state) == "/integrations?error=integration.state_expired"
    s2 = parse_qs(urlparse(connect(client)).query)["state"][0]
    assert callback(client, s2, code=None, error="access_denied") == "/integrations?error=integration.denied"
    fake.token_status = 400
    s3 = parse_qs(urlparse(connect(client)).query)["state"][0]
    assert callback(client, s3) == "/integrations?error=integration.token_exchange_failed"
    assert client.get("/api/integrations").json()["google"]["status"] == "disconnected"  # nunca "conectada" sin tokens


def test_scopes_not_granted(client, configured, fake):
    client.register("owner@example.com")
    fake.granted = ["openid", "email"]
    state = parse_qs(urlparse(connect(client)).query)["state"][0]
    assert callback(client, state) == "/integrations?error=integration.scopes_not_granted"


def test_sheets_list_and_import_through_safe_pipeline(client, configured, fake):
    client.register("owner@example.com")
    connected(client, fake)
    files = client.get("/api/integrations/google/sheets?q=Ven'tas").json()
    assert files == [{"id": "sheet1234567890", "name": "Ventas 2026", "modified_at": "2026-11-20T10:00:00Z"}]
    drive_q = next(c for c in fake.calls if c[1].startswith(google.DRIVE_FILES))[1]
    assert "Ven%5C%27tas" in drive_q or "Ven\\'tas" in drive_q  # comilla escapada en la consulta
    assert client.get("/api/integrations/google/sheets/sheet1234567890").json() == {
        "title": "Ventas 2026",
        "tabs": ["Octubre"],
    }
    r = client.send("POST", "/api/integrations/google/sheets/import", json={"spreadsheet_id": "sheet1234567890"})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["filename"] == "Ventas 2026 - Octubre.csv" and p["format"] == "csv"
    assert [c["name"] for c in p["report"]["columns"]] == ["Fecha", "Monto"]
    assert client.get("/api/integrations").json()["google"]["last_sync_at"] is not None
    bad = client.send("POST", "/api/integrations/google/sheets/import", json={"spreadsheet_id": "../../etc"})
    assert bad.status_code == 422


def test_token_refresh_and_reauth_required(client, configured, fake, owner_engine):
    client.register("owner@example.com")
    connected(client, fake)
    with owner_engine.begin() as c:
        c.execute(
            text("UPDATE integrations SET token_expires_at = :t"), {"t": datetime.now(UTC) - timedelta(minutes=5)}
        )
    assert client.get("/api/integrations/google/sheets").status_code == 200
    assert any(c[2].get("grant_type") == ["refresh_token"] for c in fake.calls)
    fake.api_401_once = True
    fake.refresh_ok = False
    r = client.get("/api/integrations/google/sheets")
    assert r.status_code == 409 and r.json()["error"]["code"] == "integration.reauth_required"
    g = client.get("/api/integrations").json()["google"]
    assert g["status"] == "error" and g["last_error"]["code"] == "integration.reauth_required"


def test_services_must_be_granted_and_gmail_metadata_only(client, configured, fake):
    client.register("owner@example.com")
    connected(client, fake)
    r = client.get("/api/integrations/google/gmail/recent")
    assert r.status_code == 409 and r.json()["error"]["code"] == "integration.service_not_granted"
    fake.granted = ["openid", "email", *SHEETS, *google.SERVICE_SCOPES["gmail"]]
    connected(client, fake, ("gmail",))  # autorización incremental: conserva Sheets
    assert client.get("/api/integrations").json()["google"]["services"] == ["gmail", "sheets"]
    mails = client.get("/api/integrations/google/gmail/recent").json()
    assert mails == [{"id": "m1", "from": "cliente@x.mx", "subject": "Pedido", "date": "Thu", "unread": True}]
    msg_call = next(c for c in fake.calls if "/messages/m1" in c[1])[1]
    assert "format=metadata" in msg_call


def test_disconnect_revokes_and_clears_tokens(client, configured, fake, owner_engine):
    client.register("owner@example.com")
    connected(client, fake)
    assert client.send("POST", "/api/integrations/google/disconnect").status_code == 204
    assert any(c[1].startswith(google.REVOKE_URL) for c in fake.calls)
    with owner_engine.begin() as c:
        row = c.execute(text("SELECT status, access_token_enc, refresh_token_enc FROM integrations")).one()
    assert row == ("disconnected", None, None)
    assert client.get("/api/integrations/google/sheets").status_code == 409


def test_permissions_and_isolation(client, make_client, configured, fake):
    client.register("owner@example.com", org="Ferretería")
    connected(client, fake)
    member = make_client()
    member.register("member@example.com", org="Propia")
    client.send("POST", "/api/organizations/current/members", json={"email": "member@example.com", "role": "member"})
    target = next(o for o in member.get("/api/organizations").json() if o["name"] == "Ferretería")
    member.send("POST", "/api/auth/switch-organization", json={"organization_id": target["id"]})
    g = member.get("/api/integrations").json()["google"]
    assert g["status"] == "connected" and g["can_manage"] is False
    assert member.send("POST", "/api/integrations/google/connect", json={"services": ["sheets"]}).status_code == 403
    assert member.send("POST", "/api/integrations/google/disconnect").status_code == 403
    assert member.get("/api/integrations/google/sheets").status_code == 200  # puede usar lo conectado para leer
    stranger = make_client()
    stranger.register("stranger@example.com", org="Ajena")
    assert stranger.get("/api/integrations").json()["google"]["status"] == "disconnected"
    assert stranger.get("/api/integrations/google/sheets").status_code == 409
    body = json.dumps(client.get("/api/integrations").json())
    assert "ACCESS" not in body and "REFRESH" not in body  # los tokens nunca salen del servidor
