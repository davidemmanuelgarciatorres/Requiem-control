"""Fase 5: reportes, comparación histórica, exportación CSV segura y resumen del panel."""

import csv
import io

from sqlalchemy import text

from app.exports import safe_cell, to_csv
from tests.test_agents import activate, import_dataset, run


def _setup(client, email="owner@example.com", org="Ferretería"):
    client.register(email, org=org)
    ds = import_dataset(client)
    activate(client, "financial-analyst")
    ex = run(client, "financial-analyst", ds["id"]).json()
    assert client.get(f"/api/agents/executions/{ex['id']}").json()["status"] == "completed"
    return ds, ex


def _parse(resp):
    assert resp.headers["content-type"].startswith("text/csv")
    body = resp.content.decode("utf-8")
    assert body.startswith("﻿")
    return list(csv.reader(io.StringIO(body[1:])))


def test_safe_cell_neutralizes_formulas():
    for bad in ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx", '=HYPERLINK("http://x")']:
        assert safe_cell(bad) == "'" + bad
    assert safe_cell(-120.5) == -120.5 and safe_cell(7) == 7
    assert safe_cell("Ventas") == "Ventas" and safe_cell(None) == "" and safe_cell(True) == "true"
    assert to_csv([["a", "=b"]]) == "﻿a,'=b\r\n"


def test_create_report_snapshot_and_idempotent(client):
    ds, ex = _setup(client)
    r = client.send("POST", "/api/reports", json={"execution_id": ex["id"]})
    assert r.status_code == 201, r.text
    rep = r.json()
    assert rep["title"].startswith("Análisis financiero") and rep["agent_id"] == "financial-analyst"
    assert rep["period_from"] == "2026-10-01" and rep["period_to"] == "2026-11-06"
    assert rep["content"]["sources"][0]["name"] == "Ventas" and rep["content"]["metrics"]
    assert rep["comparison"] is None
    again = client.send("POST", "/api/reports", json={"execution_id": ex["id"]}).json()
    assert again["id"] == rep["id"]
    assert [x["id"] for x in client.get("/api/reports").json()] == [rep["id"]]
    # El reporte es una instantánea: eliminar el dataset no lo altera.
    assert client.send("DELETE", f"/api/datasets/{ds['id']}").status_code == 204
    got = client.get(f"/api/reports/{rep['id']}").json()
    assert got["content"]["metrics"] == rep["content"]["metrics"] and got["dataset_id"] is None


def test_only_completed_executions(client):
    client.register("owner@example.com")
    ds = import_dataset(client, roles={"Monto": "none"})
    activate(client, "financial-analyst")
    ex = run(client, "financial-analyst", ds["id"]).json()
    assert client.get(f"/api/agents/executions/{ex['id']}").json()["status"] == "failed"
    r = client.send("POST", "/api/reports", json={"execution_id": ex["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "report.execution_not_completed"


def test_comparison_with_previous_report(client, owner_engine):
    ds, ex1 = _setup(client)
    first = client.send("POST", "/api/reports", json={"execution_id": ex1["id"], "title": "Octubre"}).json()
    with owner_engine.begin() as c:
        c.execute(text("UPDATE reports SET created_at = created_at - interval '1 day'"))
    # Segunda versión de los datos con menos filas → indicadores distintos.
    ds2 = import_dataset(client, content=("Fecha;Categoría;Monto\n01/10/2026;A;100\n02/11/2026;A;300").encode())
    ex2 = run(client, "financial-analyst", ds2["id"], idempotency_key="second-run-0001").json()
    second = client.send("POST", "/api/reports", json={"execution_id": ex2["id"]}).json()
    comp = second["comparison"]
    assert comp["previous_id"] == first["id"] and comp["previous_title"] == "Octubre"
    by_key = {m["key"]: m for m in comp["metrics"]}
    total = by_key["total"]
    assert total["current"] == 400 and total["delta"] == round(400 - total["previous"], 4)
    assert by_key["transactions"]["current"] == 2 and by_key["transactions"]["previous"] == 17


def test_report_csv_export_neutralizes_injection(client):
    client.register("owner@example.com")
    evil = 'Fecha;Categoría;Monto\n01/10/2026;=HYPERLINK("http://x");100\n02/10/2026;@SUM(A1);200'.encode()
    ds = import_dataset(client, content=evil)
    activate(client, "financial-analyst")
    ex = run(client, "financial-analyst", ds["id"]).json()
    rep = client.send("POST", "/api/reports", json={"execution_id": ex["id"], "title": "=cmd|' /C calc'!A0"}).json()
    resp = client.get(f"/api/reports/{rep['id']}/export.csv")
    assert resp.status_code == 200 and "attachment" in resp.headers["content-disposition"]
    rows = _parse(resp)
    cells = [c for row in rows for c in row]
    assert not any(c.startswith(("=", "@", "+")) for c in cells)
    assert ["Título", "'=cmd|' /C calc'!A0"] in rows
    d = _parse(client.get(f"/api/datasets/{ds['id']}/export.csv"))
    assert d[0] == ["Fila", "Fecha", "Categoría", "Monto"]
    assert d[1][2] == '\'=HYPERLINK("http://x")' and d[2][2] == "'@SUM(A1)" and float(d[1][3]) == 100
    actions = [a["action"] for a in client.get("/api/organizations/current/audit-logs").json()]
    assert "report.export" in actions and "data.export" in actions and "report.create" in actions


def test_delete_report_requires_write(client, make_client):
    _, ex = _setup(client)
    rep = client.send("POST", "/api/reports", json={"execution_id": ex["id"]}).json()
    viewer = make_client()
    viewer.register("viewer@example.com", org="Otra")
    client.send("POST", "/api/organizations/current/members", json={"email": "viewer@example.com", "role": "viewer"})
    orgs = viewer.get("/api/organizations").json()
    target = next(o for o in orgs if o["name"] == "Ferretería")
    viewer.send("POST", "/api/auth/switch-organization", json={"organization_id": target["id"]})
    assert viewer.get(f"/api/reports/{rep['id']}").status_code == 200
    assert viewer.send("DELETE", f"/api/reports/{rep['id']}").status_code == 403
    assert client.send("DELETE", f"/api/reports/{rep['id']}").status_code == 204
    assert client.get(f"/api/reports/{rep['id']}").status_code == 404


def test_reports_isolated_between_orgs(client, make_client, owner_engine):
    ds, ex = _setup(client)
    rep = client.send("POST", "/api/reports", json={"execution_id": ex["id"]}).json()
    other = make_client()
    other.register("other@example.com", org="Ajena")
    for url in (
        f"/api/reports/{rep['id']}",
        f"/api/reports/{rep['id']}/export.csv",
        f"/api/datasets/{ds['id']}/export.csv",
    ):
        assert other.get(url).status_code == 404
    assert other.get("/api/reports").json() == []
    assert other.send("DELETE", f"/api/reports/{rep['id']}").status_code == 404
    r = other.send("POST", "/api/reports", json={"execution_id": ex["id"]})
    assert r.status_code == 404
    # RLS: el rol de la aplicación sin contexto no ve reportes.
    from sqlalchemy import create_engine

    from tests.conftest import APP_URL

    eng = create_engine(APP_URL)
    with eng.begin() as c:
        assert c.execute(text("SELECT count(*) FROM reports")).scalar_one() == 0
    eng.dispose()


def test_dashboard_summary_real_data(client, make_client):
    client.register("owner@example.com")
    empty = client.get("/api/dashboard/summary").json()
    assert empty["datasets"] == 0 and empty["financial"] is None and empty["recent_executions"] == []
    ds = import_dataset(client)
    activate(client, "financial-analyst")
    ex = run(client, "financial-analyst", ds["id"]).json()
    s = client.get("/api/dashboard/summary").json()
    assert s["datasets"] == 1 and s["active_agents"] == 1 and s["storage_bytes"] > 0
    assert s["financial"]["execution_id"] == ex["id"] and s["financial"]["series"]
    assert s["recent_executions"][0]["dataset"] == "Ventas" and s["recommendations"]
    run(client, "financial-analyst", ds["id"], idempotency_key="again-0000001")
    s2 = client.get("/api/dashboard/summary").json()
    codes = [r["code"] for r in s2["recommendations"]]
    assert len(s2["recent_executions"]) == 2 and len(codes) == len(set(codes))  # sin duplicados
    other = make_client()
    other.register("other@example.com", org="Ajena")
    assert other.get("/api/dashboard/summary").json()["datasets"] == 0
