"""Rangos (Líder, Colíder, Encargado, Miembro, Observador), nivel de IA por plan y límites mensuales."""

import pytest
from sqlalchemy import text

from app import entitlements
from app.agents import providers
from tests.test_agents import activate, import_dataset, run


def add(owner, make_client, email, role, plan_users=None):
    u = make_client()
    u.register(email, org=f"Propia {email}")
    r = owner.send("POST", "/api/organizations/current/members", json={"email": email, "role": role})
    assert r.status_code == 201, r.text
    org = owner.get("/api/auth/me").json()["active_organization"]["id"]
    assert u.send("POST", "/api/auth/switch-organization", json={"organization_id": org}).status_code == 200
    return u, r.json()


def fill_usage(owner_engine, client, tool, n):
    org = client.get("/api/auth/me").json()["active_organization"]["id"]
    metric = entitlements.TOOLS[tool][1]
    with owner_engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO usage_records (organization_id, metric, quantity, period_start) "
                "VALUES (:o, :m, :n, date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')"
            ),
            {"o": org, "m": metric, "n": n},
        )


# --- Rangos ------------------------------------------------------------------------------------------------
def test_rank_names_and_the_new_manager_rank(client, make_client, premium):
    client.register("lider@example.com")
    premium(client)
    s = client.get("/api/auth/me").json()
    assert s["role"] == "owner"
    manager, m = add(client, make_client, "encargado@example.com", "manager")
    perms = set(manager.get("/api/auth/me").json()["permissions"])
    assert {"agents.manage", "agents.run", "approvals.decide", "data.write"} <= perms
    assert not perms & {"members.manage", "integrations.manage", "org.update", "billing.manage", "org.delete"}
    assert (
        manager.send("POST", "/api/organizations/current/members", json={"email": "x@example.com"}).status_code == 403
    )


def test_co_leaders_only_manage_lower_ranks(client, make_client, premium):
    client.register("lider@example.com")
    premium(client)
    co1, m1 = add(client, make_client, "co1@example.com", "admin")
    co2, m2 = add(client, make_client, "co2@example.com", "admin")
    _, mem = add(client, make_client, "miembro@example.com", "member")
    # Un Colíder no puede degradar ni quitar a otro Colíder, ni nombrar Colíderes.
    assert (
        co1.send("PATCH", f"/api/organizations/current/members/{m2['id']}", json={"role": "member"}).status_code == 403
    )
    assert co1.send("DELETE", f"/api/organizations/current/members/{m2['id']}").status_code == 403
    assert (
        co1.send("PATCH", f"/api/organizations/current/members/{mem['id']}", json={"role": "admin"}).status_code == 403
    )
    # Sí gestiona rangos inferiores.
    r = co1.send("PATCH", f"/api/organizations/current/members/{mem['id']}", json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    # El Líder gestiona a todos.
    assert (
        client.send("PATCH", f"/api/organizations/current/members/{m2['id']}", json={"role": "member"}).status_code
        == 200
    )


# --- Nivel de IA -------------------------------------------------------------------------------------------
def test_free_plan_gets_the_basic_ai_and_premium_the_advanced(client, premium):
    from tests.test_finance import CSV

    client.register("ana@example.com")
    import_dataset(client, content=CSV, roles={"Concepto": "category"})
    q = {"question": "¿Cuál es mi mayor gasto?"}
    basic = client.send("POST", "/api/assistant/messages", json=q).json()["answer"]
    assert basic["meta"]["tier"] == "basic" and len(basic["parts"]) <= 2
    assert any("mayor gasto" in p["text"] for p in basic["parts"])  # sigue respondiendo lo que se preguntó
    premium(client)
    adv = client.send("POST", "/api/assistant/messages", json=q).json()["answer"]
    assert adv["meta"]["tier"] == "advanced" and len(adv["parts"]) > len(basic["parts"])


def test_basic_tier_uses_lighter_models_shorter_output_and_less_context():
    class Client:
        def __init__(self):
            self.kwargs = None

    c = providers.ClaudeProvider(client=object(), tier="basic")
    assert c.model == "claude-haiku-5-5"
    assert providers.ClaudeProvider(client=object()).model != c.model
    g = providers.GeminiProvider(client=object(), tier="basic")
    assert g.model == "gemini-2.5-flash-lite"
    facts = {"metrics": {"a": 1}, "highlights": ["1", "2", "3", "4", "5"], "segments": {"x": 1}}
    assert providers.basic_facts(facts) == {"metrics": {"a": 1}, "highlights": ["1", "2", "3"]}
    assert providers.MAX_TOKENS["basic"] < providers.MAX_TOKENS["advanced"]


def test_basic_assistant_forgets_the_conversation(client, monkeypatch, premium):
    seen = []

    class Fake:
        name, model, simulated = "anthropic", "fake", False

        def __init__(self, tier):
            self.tier = tier

        def complete(self, *, system, messages):
            seen.append((self.tier, len(messages)))
            return providers.ProviderResult(text="[VERIFIED] ok", provider="anthropic", model="fake", simulated=False)

    from app import assistant

    monkeypatch.setattr(assistant, "get_provider", lambda tier="advanced": Fake(tier))
    client.register("ana@example.com")
    conv = client.send("POST", "/api/assistant/messages", json={"question": "hola"}).json()["answer"]["conversation_id"]
    client.send("POST", "/api/assistant/messages", json={"question": "¿y luego?", "conversation_id": conv})
    assert seen[-1] == ("basic", 1)
    premium(client)
    client.send("POST", "/api/assistant/messages", json={"question": "¿y luego?", "conversation_id": conv})
    assert seen[-1][0] == "advanced" and seen[-1][1] > 1


# --- Límites mensuales ---------------------------------------------------------------------------------------
@pytest.mark.parametrize("tool", ["assistant", "imports", "exports"])
def test_monthly_tool_limits(client, owner_engine, tool):
    client.register("ana@example.com")
    ds = import_dataset(client) if tool != "assistant" else None
    limit = client.get("/api/organizations/current/subscription").json()["tools"][tool]["limit"]
    fill_usage(owner_engine, client, tool, limit - (1 if tool == "imports" else 0))
    if tool == "assistant":
        r = client.send("POST", "/api/assistant/messages", json={"question": "hola"})
    elif tool == "imports":
        r = client.upload("otra.csv", b"Fecha;Monto\n01/10/2026;10\n")
        p = r.json()
        cols = [
            {"key": c["key"], "name": c["name"], "type": c["type"], "role": c["suggested_role"], "include": True}
            for c in p["report"]["columns"]
        ]
        r = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "Otra", "columns": cols})
    else:
        activate(client, "financial-analyst")
        ex = run(client, "financial-analyst", ds["id"]).json()
        rep = client.send("POST", "/api/reports", json={"execution_id": ex["id"], "title": "R"}).json()["id"]
        r = client.get(f"/api/reports/{rep}/export.csv")
    assert r.status_code == 402, r.text
    err = r.json()["error"]
    assert err["code"] == "plan.limit_reached" and err["tool"] == tool and err["limit"] == limit
    usage = client.get("/api/organizations/current/subscription").json()["tools"][tool]
    assert usage["used"] >= usage["limit"]


def test_successful_uses_are_counted(client):
    client.register("ana@example.com")
    client.send("POST", "/api/assistant/messages", json={"question": "hola"})
    import_dataset(client)
    tools = client.get("/api/organizations/current/subscription").json()["tools"]
    assert tools["assistant"] == {"used": 1, "limit": 50}
    assert tools["imports"] == {"used": 1, "limit": 20}
    assert tools["exports"]["used"] == 0


def test_active_automations_are_limited_by_plan(client, premium):
    client.register("ana@example.com")
    ds = import_dataset(client)
    activate(client, "financial-analyst")
    body = {"name": "A", "agent_id": "financial-analyst", "dataset_id": ds["id"], "frequency": "daily", "hour": 8}
    for i in range(2):
        assert client.send("POST", "/api/automations", json={**body, "name": f"A{i}"}).status_code == 201
    r = client.send("POST", "/api/automations", json={**body, "name": "A3"})
    assert r.status_code == 402 and r.json()["error"]["tool"] == "automations"
    off = client.send("POST", "/api/automations", json={**body, "name": "pausada", "active": False})
    assert off.status_code == 201  # pausadas no cuentan
    assert (
        client.send("PUT", f"/api/automations/{off.json()['id']}", json={**body, "name": "pausada"}).status_code == 402
    )
    premium(client)
    assert client.send("POST", "/api/automations", json={**body, "name": "A4"}).status_code == 201
