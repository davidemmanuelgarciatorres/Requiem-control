from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import PASSWORD


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["database"] == "ok"


def test_register_creates_user_org_owner_and_free_plan(client, owner_engine):
    r = client.register("ana@example.com", org="Ferretería Ana")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["email"] == "ana@example.com"
    assert body["active_organization"]["name"] == "Ferretería Ana"
    assert body["active_organization"]["slug"].startswith("ferreteria-ana-")
    assert body["role"] == "owner"
    assert "members.manage" in body["permissions"]
    cookie = r.headers["set-cookie"]
    assert "rc_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie

    with owner_engine.connect() as c:
        pw = c.execute(text("SELECT password_hash FROM users")).scalar_one()
        plan = c.execute(text("SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id")).scalar_one()
    assert pw.startswith("$argon2id$") and PASSWORD not in pw
    assert plan == "free"


def test_register_validation(client, make_client):
    assert client.register("x@example.com", password="short").json()["error"]["code"] == "auth.password_too_short"
    assert client.register("x@example.com", password="x@example.com").status_code == 422
    r = client.http.post(
        "/api/auth/register",
        json={
            "email": "y@example.com",
            "password": PASSWORD,
            "full_name": "Y",
            "organization_name": "O",
            "is_admin": True,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "request.invalid"
    assert client.register("bad-email").status_code == 422
    assert client.register("dup@example.com").status_code == 201
    r = make_client().register("DUP@example.com")
    assert r.status_code == 409 and r.json()["error"]["code"] == "auth.email_taken"


def test_login_is_generic_and_rotates_session(client, make_client):
    client.register("bob@example.com")
    first_cookie = client.http.cookies.get("rc_session")

    other = make_client()
    wrong = other.login("bob@example.com", "wrong-password-123")
    unknown = other.login("nobody@example.com", "wrong-password-123")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()

    ok = other.login("BOB@example.com")
    assert ok.status_code == 200
    assert ok.json()["active_organization"] is not None
    assert other.http.cookies.get("rc_session") != first_cookie


def test_login_rate_limit(client, make_client):
    client.register("carl@example.com")
    c = make_client()
    codes = [c.login("carl@example.com", "wrong-password-123").status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    assert c.login("carl@example.com").status_code == 429  # bloqueado aunque la contraseña sea correcta


def test_me_requires_session_and_logout_invalidates(client):
    assert client.get("/api/auth/me").status_code == 401
    client.register("dana@example.com")
    assert client.get("/api/auth/me").status_code == 200
    old_cookie = client.http.cookies.get("rc_session")
    assert client.send("POST", "/api/auth/logout").status_code == 204
    client.http.cookies.set("rc_session", old_cookie)
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_required_for_state_changes(client):
    client.register("eve@example.com")
    assert client.send("PATCH", "/api/auth/me", json={"full_name": "Eve"}, csrf=False).status_code == 403
    r = client.send("PATCH", "/api/auth/me", json={"full_name": "Eve"}, headers={"X-CSRF-Token": "nope"}, csrf=False)
    assert r.json()["error"]["code"] == "auth.csrf"
    assert client.send("PATCH", "/api/auth/me", json={"full_name": "Eve"}).status_code == 200


def test_foreign_origin_and_non_json_rejected(client):
    client.register("fay@example.com")
    r = client.send("PATCH", "/api/auth/me", json={"full_name": "X"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "request.origin_forbidden"
    r = client.http.post(
        "/api/auth/login", content="email=a&password=b", headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert r.status_code == 415


def test_expired_session_is_rejected(client, owner_engine):
    client.register("gus@example.com")
    with owner_engine.begin() as c:
        c.execute(text("UPDATE user_sessions SET expires_at = :t"), {"t": datetime.now(UTC) - timedelta(seconds=1)})
    assert client.get("/api/auth/me").status_code == 401


def test_errors_do_not_leak_internals(client):
    r = client.http.post("/api/auth/login", json={"email": "a@example.com"})
    assert r.status_code == 422
    assert "Traceback" not in r.text and "sqlalchemy" not in r.text.lower()


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"


def test_failed_logins_are_audited_even_though_request_fails(client, make_client, owner_engine):
    client.register("hal@example.com")
    make_client().login("hal@example.com", "wrong-password-123")
    with owner_engine.connect() as c:
        rows = c.execute(
            text("SELECT action, organization_id FROM audit_logs WHERE action = 'auth.login_failed'")
        ).all()
    assert rows == [("auth.login_failed", None)]


def test_forwarded_host_origin_only_when_trusted(client, monkeypatch):
    from app.config import get_settings

    body = {"email": "fh@example.com", "password": "correct-horse-battery", "full_name": "F", "organization_name": "O"}
    headers = {
        "Origin": "https://mi-codespace-5173.app.github.dev",
        "X-Forwarded-Host": "mi-codespace-5173.app.github.dev",
    }
    r = client.http.post("/api/auth/register", json=body, headers=headers)
    assert r.status_code == 403  # por defecto no se confía en X-Forwarded-Host
    monkeypatch.setenv("TRUST_FORWARDED_HOST", "true")
    get_settings.cache_clear()
    try:
        from fastapi.testclient import TestClient

        from app.main import create_app

        c = TestClient(create_app(), base_url="http://testserver")
        assert c.post("/api/auth/register", json=body, headers=headers).status_code == 201
        bad = {"Origin": "https://malo.example", "X-Forwarded-Host": "mi-codespace-5173.app.github.dev"}
        assert c.post("/api/auth/login", json={"email": "x@x.mx", "password": "y"}, headers=bad).status_code == 403
    finally:
        get_settings.cache_clear()
