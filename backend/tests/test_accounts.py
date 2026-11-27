"""Cuentas: recuperar/cambiar contraseña, verificar correo e invitaciones por correo."""

import re

import pytest
from sqlalchemy import text

from app import mailer
from tests.conftest import PASSWORD


@pytest.fixture(autouse=True)
def clean_outbox():
    mailer.outbox.clear()
    yield
    mailer.outbox.clear()


def link_token(kind_path: str) -> str:
    m = re.search(rf"{kind_path}\?token=([\w-]+)", mailer.outbox[-1].text)
    assert m, mailer.outbox[-1].text
    return m.group(1)


def test_register_sends_verification_and_verify_works_once(client):
    s = client.register("ana@example.com").json()
    assert s["user"]["email_verified"] is False
    assert mailer.outbox[-1].to == "ana@example.com" and "Confirma tu correo" in mailer.outbox[-1].subject
    token = link_token("/verify-email")
    assert client.send("POST", "/api/auth/email/verify", json={"token": token}).status_code == 200
    assert client.get("/api/auth/me").json()["user"]["email_verified"] is True
    r = client.send("POST", "/api/auth/email/verify", json={"token": token})
    assert r.status_code == 400 and r.json()["error"]["code"] == "auth.token_invalid"  # un solo uso


def test_forgot_password_does_not_reveal_accounts_and_reset_flow(client, make_client, owner_engine):
    client.register("ana@example.com")
    mailer.outbox.clear()
    other = make_client()
    a = other.http.post("/api/auth/password/forgot", json={"email": "nadie@example.com"})
    b = other.http.post("/api/auth/password/forgot", json={"email": "ANA@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()  # misma respuesta
    assert len(mailer.outbox) == 1 and mailer.outbox[0].to == "ana@example.com"
    token = link_token("/reset-password")
    with owner_engine.begin() as c:  # en la BD solo está el hash
        stored = c.execute(text("SELECT token_hash FROM auth_tokens WHERE purpose='password_reset'")).scalar_one()
    assert token.encode() not in bytes(stored)
    assert other.http.post("/api/auth/password/reset", json={"token": token, "password": "corta"}).status_code == 422
    r = other.http.post("/api/auth/password/reset", json={"token": token, "password": "una-nueva-clave-segura"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 401  # todas las sesiones se cerraron
    assert (
        other.http.post("/api/auth/password/reset", json={"token": token, "password": "otra-clave-larga-1"}).status_code
        == 400
    )
    assert other.login("ana@example.com", "una-nueva-clave-segura").status_code == 200
    assert other.get("/api/auth/me").json()["user"]["email_verified"] is True
    assert "cambió" in mailer.outbox[-1].subject


def test_reset_token_expires_and_new_request_invalidates_old(client, owner_engine):
    client.register("ana@example.com")
    client.http.post("/api/auth/password/forgot", json={"email": "ana@example.com"})
    first = link_token("/reset-password")
    client.http.post("/api/auth/password/forgot", json={"email": "ana@example.com"})
    second = link_token("/reset-password")
    assert (
        client.http.post(
            "/api/auth/password/reset", json={"token": first, "password": "clave-nueva-larga-1"}
        ).status_code
        == 400
    )
    with owner_engine.begin() as c:
        c.execute(text("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'"))
    assert (
        client.http.post(
            "/api/auth/password/reset", json={"token": second, "password": "clave-nueva-larga-1"}
        ).status_code
        == 400
    )


def test_change_password_keeps_current_session_and_closes_others(client, make_client):
    client.register("ana@example.com")
    phone = make_client()
    phone.login("ana@example.com")
    bad = client.send(
        "POST", "/api/auth/password/change", json={"current_password": "mala", "new_password": "nueva-clave-larga"}
    )
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "auth.wrong_password"
    r = client.send(
        "POST", "/api/auth/password/change", json={"current_password": PASSWORD, "new_password": "nueva-clave-larga"}
    )
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 200 and phone.get("/api/auth/me").status_code == 401
    assert (
        client.http.post(
            "/api/auth/password/change", json={"current_password": "x", "new_password": "y" * 12}
        ).status_code
        == 403
    )  # sin CSRF


def test_invitation_for_new_user_joins_existing_org_without_creating_one(client, make_client):
    client.register("owner@example.com", org="Ferretería")
    r = client.send(
        "POST", "/api/organizations/current/invitations", json={"email": "nuevo@example.com", "role": "member"}
    )
    assert r.status_code == 201, r.text
    assert "te invitó" in mailer.outbox[-1].subject and mailer.outbox[-1].to == "nuevo@example.com"
    token = link_token("/invite")
    assert client.get("/api/organizations/current/invitations").json()[0]["email"] == "nuevo@example.com"
    guest = make_client()
    p = guest.get(f"/api/invitations/preview?token={token}").json()
    assert p == {"organization": "Ferretería", "email": "nuevo@example.com", "expired": False}
    s = guest._remember(
        guest.http.post(
            "/api/auth/register",
            json={"email": "nuevo@example.com", "password": PASSWORD, "full_name": "Nuevo", "invite_token": token},
        )
    ).json()
    assert s["active_organization"]["name"] == "Ferretería" and s["role"] == "member" and len(s["memberships"]) == 1
    assert s["user"]["email_verified"] is True
    assert client.get("/api/organizations/current/invitations").json() == []
    assert guest.get(f"/api/invitations/preview?token={token}").status_code == 400  # ya usada


def test_invitation_is_bound_to_its_email_and_existing_users_accept_it(client, make_client):
    client.register("owner@example.com", org="Ferretería")
    client.send("POST", "/api/organizations/current/invitations", json={"email": "beto@example.com", "role": "viewer"})
    token = link_token("/invite")
    intruder = make_client()
    intruder.register("intruso@example.com", org="Otra")
    assert intruder.send("POST", "/api/invitations/accept", json={"token": token}).status_code == 400  # otro correo
    beto = make_client()
    beto.register("beto@example.com", org="Propia")
    r = beto.send("POST", "/api/invitations/accept", json={"token": token})
    assert r.status_code == 200
    me = beto.get("/api/auth/me").json()
    assert me["active_organization"]["name"] == "Ferretería" and me["role"] == "viewer"
    bad = make_client()
    reg = bad.http.post(
        "/api/auth/register",
        json={"email": "z@example.com", "password": PASSWORD, "full_name": "Z", "invite_token": token},
    )
    assert reg.status_code == 400


def test_invitation_rules(client, make_client):
    client.register("owner@example.com")
    assert (
        client.send(
            "POST", "/api/organizations/current/invitations", json={"email": "x@example.com", "role": "owner"}
        ).status_code
        == 422
    )
    for i in range(2):  # plan gratuito: 3 miembros (1 actual + 2 invitaciones pendientes)
        assert (
            client.send(
                "POST", "/api/organizations/current/invitations", json={"email": f"p{i}@example.com"}
            ).status_code
            == 201
        )
    r = client.send("POST", "/api/organizations/current/invitations", json={"email": "p9@example.com"})
    assert r.status_code == 402
    inv = client.get("/api/organizations/current/invitations").json()[0]
    assert client.send("DELETE", f"/api/organizations/current/invitations/{inv['id']}").status_code == 204
    other = make_client()
    other.register("other@example.com", org="Ajena")
    assert other.get("/api/organizations/current/invitations").json() == []
    assert other.send("DELETE", f"/api/organizations/current/invitations/{inv['id']}").status_code == 404
