"""Flujo completo de importación a través de la API, con permisos y aislamiento."""

from sqlalchemy import create_engine, text

from tests.conftest import APP_URL
from tests.test_ingestion_unit import xlsx_bytes

SALES_CSV = (
    b"Fecha;Cliente;Producto;Monto;Notas\n"
    b"01/10/2026;Ana;Martillo;$1,200.00;\n"
    b"02/10/2026;Luis;Pinzas;$350.50;urgente\n"
    b"02/10/2026;Luis;Pinzas;$350.50;urgente\n"
    b"03/10/2026;;Taladro;N/A;\n"
    b"fecha mala;Eva;Llave;$90;\n"
)


def mapping(preview, **overrides):
    cols = []
    for c in preview["report"]["columns"]:
        t = c["type"] if c["type"] != "empty" else "text"
        m = {"key": c["key"], "name": c["name"], "type": t, "role": c["suggested_role"], "include": True}
        m.update(overrides.get(c["name"], {}))
        cols.append(m)
    return cols


def test_upload_preview_confirm_report_and_rows(client):
    client.register("data@example.com")
    r = client.upload("ventas.csv", SALES_CSV)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["format"] == "csv" and p["status"] == "validated" and p["row_count"] == 5
    assert p["options"]["delimiter"] == ";"
    assert [c["type"] for c in p["report"]["columns"]] == ["date", "text", "text", "number", "text"]
    assert [c["suggested_role"] for c in p["report"]["columns"]][:4] == ["date", "customer", "product", "amount"]
    codes = {i["code"] for i in p["report"]["issues"]}
    assert {"duplicate_rows", "missing_values", "mixed_types"} <= codes
    assert p["preview_rows"][0] == ["01/10/2026", "Ana", "Martillo", "$1,200.00", ""]

    cols = mapping(p, Notas={"include": False}, Monto={"name": "Importe"})
    r = client.send(
        "POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "Ventas octubre", "columns": cols}
    )
    assert r.status_code == 201, r.text
    ds = r.json()
    assert ds["row_count"] == 5 and ds["column_count"] == 4 and ds["source_filename"] == "ventas.csv"
    assert [c["name"] for c in ds["columns"]] == ["Fecha", "Cliente", "Producto", "Importe"]
    assert next(c for c in ds["columns"] if c["name"] == "Fecha")["conversion_failures"] == 1

    rows = client.get(f"/api/datasets/{ds['id']}/rows?limit=2").json()
    assert rows["total"] == 5 and len(rows["rows"]) == 2
    assert rows["rows"][0] == {
        "row_number": 2,
        "data": {"c0": "2026-10-01", "c1": "Ana", "c2": "Martillo", "c3": 1200.0},
    }
    last = client.get(f"/api/datasets/{ds['id']}/rows?offset=4").json()["rows"][0]
    assert last["row_number"] == 6 and last["data"]["c0"] is None  # "fecha mala" → nulo, contado como fallo

    assert [d["name"] for d in client.get("/api/datasets").json()] == ["Ventas octubre"]
    assert client.get("/api/datasets/uploads").json()[0]["status"] == "imported"
    # Confirmar dos veces el mismo archivo no se permite.
    again = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "x", "columns": cols})
    assert again.status_code == 409
    usage = client.get("/api/organizations/current/subscription").json()["usage"]
    assert usage["datasets"] == 1 and usage["storage_bytes"] == len(SALES_CSV)


def test_xlsx_import_and_duplicate_file_warning(client):
    client.register("xl@example.com")
    content = xlsx_bytes([["SKU", "Cantidad"], ["A-1", 5], ["A-2", 7]])
    p = client.upload("inventario.xlsx", content).json()
    assert p["format"] == "xlsx" and p["sheets"] == ["Ventas"] and p["duplicate_of"] is None
    client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "Inventario", "columns": mapping(p)})
    p2 = client.upload("inventario-copia.xlsx", content).json()
    assert p2["duplicate_of"]["name"] == "Inventario"


def test_rejections_are_explained_and_audited(client):
    client.register("bad@example.com")
    r = client.upload("ventas.xlsx", b"esto no es excel")
    assert r.status_code == 422 and r.json()["error"]["code"] == "upload.extension_mismatch"
    r = client.upload("reporte.pdf", b"%PDF-1.4")
    assert r.json()["error"]["code"] == "upload.unsupported_format"
    logs = client.get("/api/organizations/current/audit-logs").json()
    assert sum(1 for log in logs if log["action"] == "data.upload_rejected") == 2


def test_mapping_validation(client):
    client.register("map@example.com")
    p = client.upload("v.csv", SALES_CSV).json()
    cols = mapping(p, Cliente={"name": "Fecha"})
    r = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "x", "columns": cols})
    assert r.json()["error"]["code"] == "import.duplicate_names"
    none = [{**c, "include": False} for c in mapping(p)]
    r = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "x", "columns": none})
    assert r.json()["error"]["code"] == "import.no_columns"
    r = client.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "x", "columns": mapping(p)[:2]})
    assert r.json()["error"]["code"] == "import.mapping_incomplete"


def test_upload_requires_csrf_and_multipart(client):
    client.register("csrf@example.com")
    assert client.upload("v.csv", SALES_CSV, csrf=False).status_code == 403
    r = client.send("POST", "/api/datasets/uploads", json={"file": "x"})
    assert r.status_code == 415


def test_viewer_can_read_but_not_import(make_client):
    owner, viewer = make_client(), make_client()
    owner.register("o@example.com", org="Main")
    viewer.register("v@example.com", org="Own")
    owner.send("POST", "/api/organizations/current/members", json={"email": "v@example.com", "role": "viewer"})
    p = owner.upload("v.csv", SALES_CSV).json()
    owner.send("POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "Ventas", "columns": mapping(p)})
    viewer.send(
        "POST", "/api/auth/switch-organization", json={"organization_id": owner.session["active_organization"]["id"]}
    )
    assert [d["name"] for d in viewer.get("/api/datasets").json()] == ["Ventas"]
    assert viewer.upload("v.csv", SALES_CSV).status_code == 403


def test_datasets_are_isolated_between_organizations(make_client):
    a, b = make_client(), make_client()
    a.register("a@example.com", org="A")
    b.register("b@example.com", org="B")
    p = a.upload("v.csv", SALES_CSV).json()
    ds = a.send(
        "POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "Secreto", "columns": mapping(p)}
    ).json()
    assert b.get("/api/datasets").json() == []
    assert b.get(f"/api/datasets/{ds['id']}").status_code == 404
    assert b.get(f"/api/datasets/{ds['id']}/rows").status_code == 404
    assert b.get(f"/api/datasets/uploads/{p['id']}").status_code == 404
    assert b.send("DELETE", f"/api/datasets/{ds['id']}").status_code == 404

    # Y en la base de datos: con el contexto de B, RLS no devuelve filas de A.
    engine = create_engine(APP_URL)
    with engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.current_org_id', :o, false)"), {"o": b.session["active_organization"]["id"]}
        )
        for table in ("uploaded_files", "datasets", "dataset_rows"):
            assert conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0
    engine.dispose()


def test_storage_limit_of_the_plan(client, owner_engine):
    client.register("full@example.com")
    with owner_engine.begin() as c:
        c.execute(text("UPDATE plans SET max_storage_mb = 0 WHERE code = 'free'"))
    try:
        r = client.upload("v.csv", SALES_CSV)
        assert r.status_code == 402 and r.json()["error"]["code"] == "plan.max_storage"
    finally:
        with owner_engine.begin() as c:
            c.execute(text("UPDATE plans SET max_storage_mb = 50 WHERE code = 'free'"))


def test_discard_and_delete_free_storage(client):
    client.register("del@example.com")
    p = client.upload("v.csv", SALES_CSV).json()
    assert client.send("DELETE", f"/api/datasets/uploads/{p['id']}").status_code == 204
    p = client.upload("v.csv", SALES_CSV).json()
    ds = client.send(
        "POST", f"/api/datasets/uploads/{p['id']}/confirm", json={"name": "x", "columns": mapping(p)}
    ).json()
    assert client.send("DELETE", f"/api/datasets/uploads/{p['id']}").status_code == 409  # pertenece a un conjunto
    assert client.send("DELETE", f"/api/datasets/{ds['id']}").status_code == 204
    assert client.get("/api/datasets/uploads").json() == []
    assert client.get("/api/organizations/current/subscription").json()["usage"]["storage_bytes"] == 0
