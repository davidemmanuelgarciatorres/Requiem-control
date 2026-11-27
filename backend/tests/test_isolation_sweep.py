"""Barrido de aislamiento: un usuario de la organización B no puede leer, cambiar ni borrar NADA de la A
usando los identificadores reales de A en ninguna ruta con parámetros."""

import re

from tests.test_agents import activate, import_dataset, run
from tests.test_route_sweep import routes

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def test_cross_org_access_is_denied_everywhere(app, client, make_client):
    # --- Organización A con un recurso de cada tipo -------------------------------------------
    client.register("a@example.com", org="Empresa A")
    ds = import_dataset(client)
    up = client.upload("otro.csv", b"Fecha;Monto\n01/10/2026;1\n").json()
    activate(client, "data-analyst")
    activate(client, "financial-analyst")
    ex_dup = client.get(f"/api/agents/executions/{run(client, 'data-analyst', ds['id']).json()['id']}").json()
    ex_fin = run(client, "financial-analyst", ds["id"], idempotency_key="iso-fin-000001").json()
    rep = client.send("POST", "/api/reports", json={"execution_id": ex_fin["id"]}).json()
    auto = client.send(
        "POST",
        "/api/automations",
        json={"name": "A", "agent_id": "financial-analyst", "dataset_id": ds["id"], "frequency": "daily", "hour": 8},
    ).json()
    conv = client.send("POST", "/api/assistant/messages", json={"question": "hola"}).json()["question"][
        "conversation_id"
    ]
    ids = {
        "dataset_id": ds["id"],
        "upload_id": up["id"],
        "execution_id": ex_fin["id"],
        "report_id": rep["id"],
        "approval_id": ex_dup["approvals"][0]["id"],
        "automation_id": auto["id"],
        "conversation_id": conv,
        "agent_id": "financial-analyst",
        "spreadsheet_id": "sheet1234567890",
        "floater_id": "00000000-0000-0000-0000-000000000000",
        "member_id": "00000000-0000-0000-0000-000000000000",
    }

    # --- Organización B intenta usar esos identificadores --------------------------------------
    other = make_client()
    other.register("b@example.com", org="Empresa B")
    leaks = []
    tested = 0
    for method, path in routes(app):
        params = re.findall(r"\{([^}]+)\}", path)
        if not params or path.startswith("/api/agents/{agent_id}"):
            continue  # los agentes son un catálogo público común, no datos de la organización
        url = path
        for p in params:
            url = url.replace("{" + p + "}", ids.get(p, ids["dataset_id"]))
        body = {
            "decision": "approve",
            "name": "x",
            "agent_id": "financial-analyst",
            "frequency": "daily",
            "hour": 1,
            "dataset_id": ds["id"],
            "spreadsheet_id": "sheet1234567890",
        }
        r = other.send(method, url, json=body) if method in UNSAFE else other.get(url)
        tested += 1
        if r.status_code < 400 or ds["id"] in r.text or "Empresa A" in r.text:
            leaks.append((method, url, r.status_code, r.text[:120]))
    assert leaks == []
    assert tested >= 20, tested  # el barrido de verdad recorrió las rutas con identificador

    # Y A sigue intacta.
    assert client.get(f"/api/datasets/{ds['id']}").status_code == 200
    assert client.get(f"/api/reports/{rep['id']}").status_code == 200
    assert client.get("/api/automations").json()[0]["id"] == auto["id"]
    assert client.get(f"/api/agents/executions/{ex_dup['id']}").json()["approvals"][0]["status"] == "pending"
