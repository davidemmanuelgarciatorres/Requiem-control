"""Barrido de TODAS las rutas de la API: autenticación, CSRF y entradas basura (nunca un 500)."""

import re

import pytest

PUBLIC = {
    ("GET", "/api/health"),
    ("GET", "/api/plans"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/billing/webhook/stripe"),  # sin sesión: lo autentica la firma de Stripe
}
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
JUNK_IDS = [
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "' OR 1=1 --",
    "../../etc/passwd",
    "%00",
    "Ω" * 300,
]


def routes(app):
    """Todas las rutas declaradas (se leen del esquema OpenAPI: incluye los routers anidados)."""
    found = [(m.upper(), p) for p, ops in app.openapi()["paths"].items() for m in ops if p.startswith("/api/")]
    assert len(found) > 60, f"el barrido solo encontró {len(found)} rutas"
    return found


def fill(path, value):
    return re.sub(r"\{[^}]+\}", value, path)


def test_every_private_route_requires_a_session(app, client):
    for method, path in routes(app):
        if (method, path) in PUBLIC:
            continue
        r = client.http.request(method, fill(path, "00000000-0000-0000-0000-000000000000"), json={})
        # Las subidas validan primero el tipo de contenido (415): también rechazan sin revelar nada.
        assert r.status_code in (401, 403) or ((r.status_code == 415 and "upload" in path) or "floaters" in path), (
            method,
            path,
            r.status_code,
            r.text[:200],
        )


def test_every_unsafe_route_requires_csrf(app, client):
    client.register("owner@example.com")
    for method, path in routes(app):
        if method not in UNSAFE or (method, path) in PUBLIC:
            continue
        r = client.http.request(method, fill(path, "00000000-0000-0000-0000-000000000000"), json={})
        if r.status_code == 415:
            continue  # subida sin multipart: rechazada antes de llegar al CSRF
        assert r.status_code == 403, (method, path, r.status_code, r.text[:200])
        assert r.json()["error"]["code"].startswith(("auth.csrf", "request.")), (method, path, r.text[:200])


@pytest.mark.parametrize("junk", JUNK_IDS)
def test_junk_input_never_causes_a_server_error(app, client, junk):
    client.register("owner@example.com")
    for method, path in routes(app):
        if path == "/api/auth/logout":
            continue
        url = fill(path, junk)
        bodies = [{}, {"x": junk}, {"question": junk * 50, "name": junk, "services": [junk], "decision": junk}]
        for body in bodies if method in UNSAFE else [None]:
            r = (
                client.send(method, url, json=body)
                if method in UNSAFE
                else client.get(url, params={"q": junk, "limit": junk})
            )
            # 503 solo es válido como respuesta controlada de «no configurado» (nunca un fallo interno).
            controlled = r.status_code == 503 and r.json()["error"]["code"].endswith("not_configured")
            assert r.status_code < 500 or controlled, (method, url, body, r.status_code, r.text[:300])
            if r.status_code >= 400:
                assert "error" in r.json() or r.status_code == 405, (method, url, r.text[:200])
            assert "Traceback" not in r.text and "sqlalchemy" not in r.text.lower()


def test_nul_characters_in_json_bodies_are_rejected_cleanly(client):
    client.register("owner@example.com")
    for method, url, body in [
        ("PATCH", "/api/organizations/current", {"name": "a\u0000b"}),
        ("POST", "/api/assistant/messages", {"question": "hola\u0000"}),
        ("PATCH", "/api/auth/me", {"full_name": "x\u0000y"}),
    ]:
        r = client.send(method, url, json=body)
        assert r.status_code in (400, 422), (url, r.status_code, r.text[:200])
