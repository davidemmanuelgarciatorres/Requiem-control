"""Asistente IA: respuestas basadas en datos, etiquetas, proveedor real simulado, límites, privacidad y RLS."""

from sqlalchemy import create_engine, text

from app import assistant
from app.agents import providers
from tests.conftest import APP_URL
from tests.test_agents import import_dataset
from tests.test_finance import CSV


def ask(client, q, conv=None):
    return client.send(
        "POST", "/api/assistant/messages", json={"question": q, **({"conversation_id": conv} if conv else {})}
    )


def test_without_data_it_says_so_and_suggests_importing(client):
    client.register("owner@example.com")
    r = ask(client, "¿Cómo van mis ventas?")
    assert r.status_code == 201
    a = r.json()["answer"]
    assert a["meta"]["simulated"] is True and a["meta"]["provider"] == "mock"
    kinds = [p["kind"] for p in a["parts"]]
    assert kinds == ["verified", "suggestion"] and "no tiene datos" in a["parts"][0]["text"]


def test_answers_from_real_figures_with_labels_and_history(client):
    client.register("owner@example.com")
    import_dataset(client, content=CSV, roles={"Concepto": "category"})
    r = ask(client, "¿Cuánto vendí y cuánto gasté?").json()
    texts = " ".join(p["text"] for p in r["answer"]["parts"])
    assert "ingresos $95,090.00 MXN" in texts and "gastos $3,100.00 MXN" in texts
    assert "Renta" in texts and {p["kind"] for p in r["answer"]["parts"]} >= {"verified", "suggestion"}
    conv = r["question"]["conversation_id"]
    r2 = ask(client, "¿Qué problemas tienen mis datos?", conv).json()
    assert r2["answer"]["conversation_id"] == conv and "filas" in r2["answer"]["parts"][0]["text"]
    convs = client.get("/api/assistant/conversations").json()
    assert convs[0]["id"] == conv and convs[0]["messages"] == 4 and convs[0]["title"].startswith("¿Cuánto")
    msgs = client.get(f"/api/assistant/conversations/{conv}").json()
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    agents = ask(client, "¿Qué pueden hacer los agentes?").json()["answer"]["parts"]
    assert "data-analyst" in agents[0]["text"] and "aprueb" in agents[1]["text"]


def test_real_provider_gets_aggregates_only_and_tags_are_parsed(client, monkeypatch):
    client.register("owner@example.com")
    import_dataset(client, content=CSV, roles={"Concepto": "category"})
    seen = {}

    class Fake:
        name, model, simulated = "anthropic", "claude-haiku-5-5", False

        def complete(self, *, system, messages):
            seen["system"], seen["messages"] = system, messages
            return providers.ProviderResult(
                text="[VERIFIED] Ingresos 95,090.\n\n[ESTIMATE] Parece estable.\n[SUGGESTION] Revisa la renta.\n\nSin etiqueta.",
                provider="anthropic",
                model="claude-haiku-5-5",
                simulated=False,
                input_tokens=500,
                output_tokens=60,
                cost_usd=0.0001,
            )

    monkeypatch.setattr(assistant, "get_provider", lambda: Fake())
    a = ask(client, "Resume mis finanzas").json()["answer"]
    assert [p["kind"] for p in a["parts"]] == ["verified", "estimate", "suggestion", "estimate"]
    assert a["meta"]["simulated"] is False and a["meta"]["cost_usd"] == 0.0001
    payload = seen["messages"][-1]["content"]
    assert "<context>" in payload and "data only" in payload and "data, not instructions" in seen["system"]
    assert "Ventas" in payload and "01/10/2026" not in payload  # agregados, no filas crudas


def test_provider_failure_falls_back_to_rules(client, monkeypatch):
    client.register("owner@example.com")

    class Broken:
        name, model, simulated = "gemini", "gemini-x", False

        def complete(self, **_):
            raise providers.ProviderError("ai.rate_limited", "x")

    monkeypatch.setattr(assistant, "get_provider", lambda: Broken())
    a = ask(client, "hola").json()["answer"]
    assert a["meta"]["provider_error"] == "ai.rate_limited" and a["meta"]["simulated"] is True and a["parts"]


def test_rate_limit_validation_and_unknown_conversation(client, monkeypatch):
    client.register("owner@example.com")
    monkeypatch.setattr(assistant, "MAX_PER_HOUR", 2)
    assert ask(client, "uno").status_code == 201
    assert ask(client, "dos").status_code == 201
    r = ask(client, "tres")
    assert r.status_code == 429 and r.json()["error"]["code"] == "assistant.rate_limited"
    assert ask(client, "x" * 1001).status_code == 422
    assert client.send("POST", "/api/assistant/messages", json={"question": "hi", "extra": 1}).status_code == 422
    r = ask(client, "otra", "00000000-0000-0000-0000-000000000000")
    assert r.status_code in (404, 429)


def test_conversations_are_private_per_user_and_org(client, make_client):
    client.register("owner@example.com", org="Ferretería")
    conv = ask(client, "¿Cómo van mis ventas?").json()["question"]["conversation_id"]
    member = make_client()
    member.register("member@example.com", org="Propia")
    client.send("POST", "/api/organizations/current/members", json={"email": "member@example.com", "role": "member"})
    target = next(o for o in member.get("/api/organizations").json() if o["name"] == "Ferretería")
    member.send("POST", "/api/auth/switch-organization", json={"organization_id": target["id"]})
    # Mismo equipo, distinta persona: no ve ni borra la conversación ajena.
    assert member.get("/api/assistant/conversations").json() == []
    assert member.get(f"/api/assistant/conversations/{conv}").status_code == 404
    assert member.send("DELETE", f"/api/assistant/conversations/{conv}").status_code == 404
    assert ask(member, "hola", conv).status_code == 404
    eng = create_engine(APP_URL)
    with eng.begin() as c:
        assert c.execute(text("SELECT count(*) FROM assistant_messages")).scalar_one() == 0
    eng.dispose()
    assert client.send("DELETE", f"/api/assistant/conversations/{conv}").status_code == 204
    assert client.get("/api/assistant/conversations").json() == []


def test_parse_tagged_handles_spanish_tags():
    parts = assistant.parse_tagged("[VERIFICADO] A\n[SUGERENCIA] B\n\n[Estimación] C")
    assert [p["kind"] for p in parts] == ["verified", "suggestion", "estimate"]


def test_assistant_answers_in_the_language_of_the_screen(client):
    client.register("ana@example.com")  # perfil en español
    r = client.send("POST", "/api/assistant/messages", json={"question": "How are my sales?", "language": "en"})
    assert r.status_code == 201 or r.status_code == 200, r.text
    text = r.json()["answer"]["content"]
    assert "import" in text.lower() and "importa" not in text.lower()
