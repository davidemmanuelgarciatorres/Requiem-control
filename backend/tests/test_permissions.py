"""Roles, permisos y límites del plan aplicados en el servidor."""


def org_with(make_client, *people):
    owner = make_client()
    owner.register("owner@example.com", org="Main")
    clients = {}
    for email, role in people:
        c = make_client()
        c.register(email, org=f"Own {email}")
        r = owner.send("POST", "/api/organizations/current/members", json={"email": email, "role": role})
        assert r.status_code == 201, r.text
        c.send(
            "POST",
            "/api/auth/switch-organization",
            json={"organization_id": owner.session["active_organization"]["id"]},
        )
        clients[email] = c
    return owner, clients


def test_viewer_cannot_manage_members_or_read_audit(make_client):
    _, c = org_with(make_client, ("v@example.com", "viewer"))
    v = c["v@example.com"]
    assert v.get("/api/organizations/current/members").status_code == 200
    assert v.send("POST", "/api/organizations/current/members", json={"email": "owner@example.com"}).status_code == 403
    assert v.get("/api/organizations/current/audit-logs").status_code == 403
    assert v.send("PATCH", "/api/organizations/current", json={"name": "Hack"}).status_code == 403


def test_admin_cannot_remove_or_demote_owner(make_client):
    owner, c = org_with(make_client, ("ad@example.com", "admin"))
    admin = c["ad@example.com"]
    owner_member = next(m for m in admin.get("/api/organizations/current/members").json() if m["role"] == "owner")
    assert admin.send("DELETE", f"/api/organizations/current/members/{owner_member['id']}").status_code == 403
    r = admin.send("PATCH", f"/api/organizations/current/members/{owner_member['id']}", json={"role": "viewer"})
    assert r.status_code == 403


def test_owner_cannot_be_added_directly_and_last_owner_is_protected(make_client):
    owner, _ = org_with(make_client, ("m@example.com", "member"))
    assert (
        owner.send(
            "POST", "/api/organizations/current/members", json={"email": "x@example.com", "role": "owner"}
        ).status_code
        == 422
    )
    me = next(m for m in owner.get("/api/organizations/current/members").json() if m["role"] == "owner")
    r = owner.send("PATCH", f"/api/organizations/current/members/{me['id']}", json={"role": "admin"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "members.last_owner"


def test_free_plan_member_limit_is_enforced_server_side(make_client):
    owner, _ = org_with(make_client, ("m1@example.com", "member"), ("m2@example.com", "viewer"))
    extra = make_client()
    extra.register("m3@example.com", org="Extra")
    r = owner.send("POST", "/api/organizations/current/members", json={"email": "m3@example.com"})
    assert r.status_code == 402 and r.json()["error"] == {
        "code": "plan.max_members",
        "message": "Tu plan no permite más miembros.",
        "limit": 3,
    }
    sub = owner.get("/api/organizations/current/subscription").json()
    assert sub["plan"]["code"] == "free" and sub["usage"]["members"] == 3 and sub["billing_enabled"] is False


def test_unknown_user_cannot_be_added(make_client):
    owner, _ = org_with(make_client)
    r = owner.send("POST", "/api/organizations/current/members", json={"email": "ghost@example.com"})
    assert r.status_code == 404


def test_export_and_delete_organization(make_client):
    owner, _ = org_with(make_client)
    export = owner.get("/api/organizations/current/export").json()
    assert export["format"] == "requiem-control-export/1"
    assert export["members"][0]["email"] == "owner@example.com"
    slug = owner.session["active_organization"]["slug"]
    assert owner.send("DELETE", "/api/organizations/current", json={"confirm_slug": "wrong"}).status_code == 422
    assert owner.send("DELETE", "/api/organizations/current", json={"confirm_slug": slug}).status_code == 204
    assert owner.get("/api/organizations").json() == []
    assert owner.get("/api/auth/me").json()["active_organization"] is None


def test_plans_are_public_and_configurable(client):
    plans = {p["code"]: p for p in client.get("/api/plans").json()}
    assert plans["free"]["max_active_agents"] == 2 and plans["free"]["price_cents"] == 0
    assert plans["premium"]["price_cents"] == 40000 and plans["premium"]["currency"] == "MXN"


def test_system_status_is_only_for_admins(client, make_client):
    client.register("owner@example.com", org="Ferretería")
    st = client.get("/api/system/status").json()
    assert (
        st["database"] == "ok" and st["ai"]["simulated"] is True and "GOOGLE_OAUTH_CLIENT_ID" in st["google"]["missing"]
    )
    member = make_client()
    member.register("member@example.com", org="Propia")
    client.send("POST", "/api/organizations/current/members", json={"email": "member@example.com", "role": "member"})
    target = next(o for o in member.get("/api/organizations").json() if o["name"] == "Ferretería")
    member.send("POST", "/api/auth/switch-organization", json={"organization_id": target["id"]})
    assert member.get("/api/system/status").status_code == 403
