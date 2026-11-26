"""Aislamiento entre organizaciones a nivel API."""


def setup_two_orgs(make_client):
    a, b = make_client(), make_client()
    a.register("a@example.com", org="Org A")
    b.register("b@example.com", org="Org B")
    return a, b


def test_members_and_audit_are_scoped(make_client):
    a, b = setup_two_orgs(make_client)
    members = a.get("/api/organizations/current/members").json()
    assert [m["email"] for m in members] == ["a@example.com"]
    logs = a.get("/api/organizations/current/audit-logs").json()
    assert logs and all(log["user_id"] == a.session["user"]["id"] for log in logs)
    assert [o["name"] for o in a.get("/api/organizations").json()] == ["Org A"]


def test_cannot_switch_to_foreign_org(make_client):
    a, b = setup_two_orgs(make_client)
    r = a.send("POST", "/api/auth/switch-organization", json={"organization_id": b.session["active_organization"]["id"]})
    assert r.status_code == 403
    # Una organización inexistente produce exactamente la misma respuesta.
    r2 = a.send("POST", "/api/auth/switch-organization",
                json={"organization_id": "00000000-0000-0000-0000-000000000000"})
    assert r2.status_code == 403 and r2.json() == r.json()


def test_cannot_touch_foreign_member_by_id(make_client):
    a, b = setup_two_orgs(make_client)
    b_member_id = b.get("/api/organizations/current/members").json()[0]["id"]
    assert a.send("PATCH", f"/api/organizations/current/members/{b_member_id}", json={"role": "viewer"}).status_code == 404
    assert a.send("DELETE", f"/api/organizations/current/members/{b_member_id}").status_code == 404
    assert b.get("/api/organizations/current/members").json()[0]["role"] == "owner"


def test_multiple_orgs_and_switching(make_client):
    a, _ = setup_two_orgs(make_client)
    first_id = a.session["active_organization"]["id"]
    r = a.send("POST", "/api/organizations", json={"name": "Segunda"})
    assert r.status_code == 201 and r.json()["active_organization"]["name"] == "Segunda"
    assert len(r.json()["memberships"]) == 2
    assert a.get("/api/organizations/current").json()["name"] == "Segunda"
    assert a.send("POST", "/api/auth/switch-organization", json={"organization_id": first_id}).status_code == 200
    assert a.get("/api/organizations/current").json()["name"] == "Org A"


def test_removed_member_loses_access(make_client):
    a, b = setup_two_orgs(make_client)
    r = a.send("POST", "/api/organizations/current/members", json={"email": "b@example.com", "role": "member"})
    assert r.status_code == 201
    a_org = a.session["active_organization"]["id"]
    assert b.send("POST", "/api/auth/switch-organization", json={"organization_id": a_org}).status_code == 200
    assert b.get("/api/organizations/current").json()["name"] == "Org A"
    assert a.send("DELETE", f"/api/organizations/current/members/{r.json()['id']}").status_code == 204
    # La organización activa se descarta en la siguiente petición.
    assert b.get("/api/organizations/current").status_code == 409
    assert b.get("/api/auth/me").json()["active_organization"] is None
