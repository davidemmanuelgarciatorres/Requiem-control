"""Fase 7: inventario, clientes, correo (borradores con aprobación) y automatizaciones programadas."""

from datetime import UTC, datetime
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from sqlalchemy import text

from app import automations, worker
from app.config import get_settings
from app.integrations import google
from tests.test_agents import activate, import_dataset, run
from tests.test_integrations import FakeGoogle, callback, configured, connect  # noqa: F401 — fixtures

INVENTORY = (
    "SKU;Producto;Existencia;Mínimo;Costo;Categoría;Último movimiento\n"
    "A1;Martillo;0;5;120;Herramienta;01/11/2026\n"
    "A2;Pinza;3;10;90;Herramienta;20/11/2026\n"
    "A3;Taladro;40;5;900;Eléctrico;25/11/2026\n"
    "A4;Brocha;25;5;30;Pintura;01/08/2026\n"
    "A5;Cable;-2;10;15;Eléctrico;24/11/2026\n"
    "A6;Lija;12;5;8;Pintura;23/11/2026\n"
).encode()


def roles(client, content, mapping, name="datos.csv"):
    p = client.upload(name, content).json()
    cols = [
        {"key": c["key"], "name": c["name"], "type": c["type"], "role": mapping.get(c["name"], "none"), "include": True}
        for c in p["report"]["columns"]
    ]
    r = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": name, "columns": cols})
    assert r.status_code == 201, r.text
    return r.json()


def done(client, ex_id):
    return client.get(f"/api/agents/executions/{ex_id}").json()


def test_inventory_agent_findings_and_purchase_list_on_approval(client):
    client.register("owner@example.com")
    ds = roles(
        client,
        INVENTORY,
        {
            "Producto": "product",
            "Existencia": "quantity",
            "Costo": "amount",
            "Categoría": "category",
            "Último movimiento": "date",
        },
    )
    activate(client, "inventory-analyst")
    e = done(client, run(client, "inventory-analyst", ds["id"]).json()["id"])
    assert e["status"] == "awaiting_approval", e
    m = {x["key"]: x["value"] for x in e["output"]["metrics"]}
    assert m == {
        "products": 6,
        "out_of_stock": 2,
        "low_stock": 1,
        "inventory_value": 120 * 0 + 90 * 3 + 900 * 40 + 30 * 25 + 8 * 12,
    }
    codes = {r["code"] for r in e["output"]["recommendations"]}
    assert {"inventory_reorder", "inventory_negative", "inventory_slow"} <= codes
    purchase = next(t for t in e["output"]["tables"] if t["key"] == "purchase_list")
    by = {r["product"]: r for r in purchase["rows"]}
    assert by["Martillo"]["suggested"] == 10 and by["Pinza"]["suggested"] == 17 and by["Cable"]["suggested"] == 22
    slow = next(t for t in e["output"]["tables"] if t["key"] == "slow_movers")
    assert [r["product"] for r in slow["rows"]] == ["Brocha"]
    ap = e["approvals"][0]
    assert ap["action_type"] == "inventory.purchase_list" and ap["status"] == "pending"
    assert client.get("/api/reports").json() == []  # nada se guarda sin aprobación
    r = client.send("POST", f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"})
    assert r.status_code == 200, r.text
    reports = client.get("/api/reports").json()
    assert len(reports) == 1 and reports[0]["title"].startswith("Lista de compra")
    rep = client.get(f"/api/reports/{reports[0]['id']}").json()
    assert rep["content"]["tables"][0]["rows"][0]["product"] in by


def test_inventory_requires_roles_and_works_without_minimum(client):
    client.register("owner@example.com")
    activate(client, "inventory-analyst")
    bad = import_dataset(client, content=b"Nota;Valor\nA;1\nB;2\n")
    e = done(client, run(client, "inventory-analyst", bad["id"]).json()["id"])
    assert e["status"] == "failed" and e["error"]["code"] == "agent.missing_roles"
    simple = roles(
        client, b"Producto;Existencia\nA;1\nB;50\nC;60\nD;70\nE;80\n", {"Producto": "product", "Existencia": "quantity"}
    )
    e = done(client, run(client, "inventory-analyst", simple["id"], idempotency_key="inv-simple-01").json()["id"])
    assert "no_minimum_column" in {x["code"] for x in e["output"]["limitations"]}


def test_customer_segments_and_follow_up(client):
    client.register("owner@example.com")
    rows = ["Cliente;Fecha;Monto"]
    # Ana compra cada ~10 días hasta noviembre (activa); Beto compraba seguido y se detuvo en agosto (en riesgo/perdido);
    # Carla solo una vez hace poco (nueva); Dani compró una sola vez hace mucho (perdido).
    rows += [f"Ana;{d:02d}/{m:02d}/2026;500" for m in (9, 10, 11) for d in (1, 11, 21)]
    rows += [f"Beto;{d:02d}/{m:02d}/2026;300" for m in (7, 8, 9) for d in (5, 20)]
    rows += ["Carla;25/11/2026;200", "Dani;10/03/2026;150"]
    ds = roles(client, "\n".join(rows).encode(), {"Cliente": "customer", "Fecha": "date", "Monto": "amount"})
    activate(client, "customer-ops")
    e = done(client, run(client, "customer-ops", ds["id"]).json()["id"])
    seg = {r["customer"]: r["segment"] for t in e["output"]["tables"] for r in t["rows"]}
    assert (
        seg["Ana"] in ("champions", "loyal")
        and seg["Beto"] == "at_risk"
        and seg["Carla"] == "new"
        and seg["Dani"] == "lost"
    )
    assert e["status"] == "awaiting_approval"
    assert {"reference_date"} <= {x["code"] for x in e["output"]["limitations"]}
    ap = e["approvals"][0]
    assert ap["action_type"] == "customers.follow_up_list" and ap["payload"]["count"] == 1


def _gmail_fake(fake: FakeGoogle):
    base = fake.__call__

    def handler(request):
        url = str(request.url)
        if url.startswith(f"{google.GMAIL_API}/drafts"):
            fake.calls.append(("POST", url, {"json": request.content.decode()}))
            return httpx2.Response(200, json={"id": "draft-1"})
        if url.startswith(f"{google.GMAIL_API}/messages/"):
            mid = url.split("/messages/")[1].split("?")[0]
            data = {
                "m1": ("Cliente Uno <uno@cliente.mx>", "Quiero hacer un pedido", "Hola, quisiera ordenar 10 martillos"),
                "m2": ("No Reply <no-reply@banco.mx>", "Tu estado de cuenta", "Aviso automático"),
                "m3": ("Dos <dos@cliente.mx>", "Queja por producto", "El taladro no funciona, quiero devolución"),
            }[mid]
            return httpx2.Response(
                200,
                json={
                    "threadId": f"t-{mid}",
                    "snippet": data[2],
                    "payload": {
                        "headers": [
                            {"name": "From", "value": data[0]},
                            {"name": "Subject", "value": data[1]},
                            {"name": "Date", "value": "Thu, 26 Nov 2026"},
                            {"name": "Message-ID", "value": f"<{mid}@mail>"},
                        ]
                    },
                },
            )
        if url.startswith(f"{google.GMAIL_API}/messages"):
            return httpx2.Response(200, json={"messages": [{"id": "m1"}, {"id": "m2"}, {"id": "m3"}]})
        return base(request)

    return handler


@pytest.fixture
def gmail(monkeypatch, configured):  # noqa: F811
    fake = FakeGoogle()
    fake.granted = ["openid", "email", *google.SERVICE_SCOPES["gmail"], *google.SERVICE_SCOPES["gmail_drafts"]]
    monkeypatch.setattr(
        google, "client_factory", lambda: httpx2.Client(transport=httpx2.MockTransport(_gmail_fake(fake)))
    )
    return fake


def test_email_agent_requires_gmail(client):
    client.register("owner@example.com")
    activate(client, "email-ops")
    e = done(client, run(client, "email-ops", None).json()["id"])
    assert e["status"] == "failed" and e["error"]["code"] == "agent.integration_required"


def test_email_agent_classifies_and_drafts_only_after_approval(client, gmail):
    client.register("owner@example.com")
    url = connect(client, ["gmail", "gmail_drafts"])
    assert callback(client, parse_qs(urlparse(url).query)["state"][0]) == "/integrations?connected=google"
    activate(client, "email-ops")
    r = client.send("POST", "/api/agents/email-ops/executions", json={})
    assert r.status_code == 202, r.text
    e = done(client, r.json()["id"])
    assert e["status"] == "awaiting_approval", e
    cats = {row["subject"]: row["category"] for row in e["output"]["tables"][0]["rows"]}
    assert cats == {
        "Quiero hacer un pedido": "order",
        "Tu estado de cuenta": "automated",
        "Queja por producto": "complaint",
    }
    assert len(e["approvals"]) == 2  # nunca a remitentes automáticos
    assert not any("/drafts" in c[1] for c in gmail.calls)  # nada se creó todavía
    complaint = next(a for a in e["approvals"] if a["payload"]["category"] == "complaint")
    assert complaint["payload"]["to"] == "dos@cliente.mx" and "[Completa" in complaint["payload"]["body"]
    d = client.send("POST", f"/api/approvals/{complaint['id']}/decision", json={"decision": "approve"})
    assert d.status_code == 200, d.text
    drafts = [c for c in gmail.calls if "/drafts" in c[1]]
    assert len(drafts) == 1 and "t-m3" in drafts[0][2]["json"]  # en el mismo hilo
    assert not any("/send" in c[1] for c in gmail.calls)  # jamás se envía


def test_automations_schedule_fire_once_and_isolation(client, make_client, owner_engine, monkeypatch):
    client.register("owner@example.com")
    ds = import_dataset(client)
    activate(client, "financial-analyst")
    body = {
        "name": "Finanzas semanal",
        "agent_id": "financial-analyst",
        "dataset_id": ds["id"],
        "frequency": "weekly",
        "hour": 8,
        "weekday": 0,
    }
    r = client.send("POST", "/api/automations", json=body)
    assert r.status_code == 201, r.text
    auto = r.json()
    assert auto["next_run_at"] is not None
    assert client.send("POST", "/api/automations", json={**body, "weekday": None}).status_code == 422
    assert client.send("POST", "/api/automations", json={**body, "agent_id": "nope"}).status_code == 422
    with owner_engine.begin() as c:
        c.execute(text("UPDATE automations SET next_run_at = now() - interval '1 minute'"))
    assert worker.tick_automations() == 1
    assert automations.run_due() == 0  # ya reprogramada: no se dispara dos veces
    runs = client.get("/api/agents/executions?limit=10").json()
    assert len(runs) == 1 and runs[0]["status"] == "completed"
    a = client.get("/api/automations").json()[0]
    assert a["last_execution_id"] == runs[0]["id"] and a["last_error"] is None
    assert datetime.fromisoformat(a["next_run_at"]) > datetime.now(UTC)
    other = make_client()
    other.register("other@example.com", org="Ajena")
    assert other.get("/api/automations").json() == []
    assert other.send("DELETE", f"/api/automations/{auto['id']}").status_code == 404
    assert client.send("DELETE", f"/api/automations/{auto['id']}").status_code == 204


def test_automation_records_errors_instead_of_failing_silently(client, owner_engine):
    client.register("owner@example.com")
    ds = import_dataset(client)
    activate(client, "financial-analyst")
    client.send(
        "POST",
        "/api/automations",
        json={"name": "x", "agent_id": "financial-analyst", "dataset_id": ds["id"], "frequency": "daily", "hour": 9},
    )
    activate(client, "financial-analyst", active=False)
    with owner_engine.begin() as c:
        c.execute(text("UPDATE automations SET next_run_at = now() - interval '1 minute'"))
    assert automations.run_due() == 0
    assert client.get("/api/automations").json()[0]["last_error"]["code"] == "agent.inactive"


def test_next_run_respects_timezone_and_frequency():
    a = SimpleNamespace(timezone="America/Mexico_City", hour=8, frequency="daily", weekday=None, day_of_month=None)
    after = datetime(2026, 11, 26, 15, 0, tzinfo=UTC)  # 09:00 en CDMX → la próxima es mañana 08:00 (14:00 UTC)
    assert automations.next_run(a, after) == datetime(2026, 11, 27, 14, 0, tzinfo=UTC)
    a.frequency, a.weekday = "weekly", 0  # lunes
    assert automations.next_run(a, after) == datetime(2026, 11, 30, 14, 0, tzinfo=UTC)
    a.frequency, a.day_of_month = "monthly", 1
    assert automations.next_run(a, after) == datetime(2026, 12, 1, 14, 0, tzinfo=UTC)
    assert get_settings().execution_mode == "inline"


def test_draft_headers_from_external_email_are_sanitized():
    from app.agents.tools import _clean_header

    assert _clean_header("<id@mail>\r\nBcc: victim@x.mx", 300) == "<id@mail>Bcc: victim@x.mx"
    assert "\n" not in (_clean_header("a\nb", 300) or "") and _clean_header("", 10) is None
