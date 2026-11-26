"""Inteligencia financiera: ingresos/gastos, margen, flujo, comparación, categorías, inusuales, aislamiento."""

from tests.test_agents import import_dataset

ROWS = [
    "01/10/2026;Ventas;1000",
    "05/10/2026;Ventas;1500",
    "10/10/2026;Renta;-800",
    "15/10/2026;Nómina;-600",
    "01/11/2026;Ventas;700",
    "05/11/2026;Ventas;600",
    "10/11/2026;Renta;-800",
    "15/11/2026;Nómina;-900",
    "20/11/2026;Ventas;650",
    "25/11/2026;Ventas;640",
    "28/11/2026;Ventas;90000",
]
CSV = ("Fecha;Concepto;Monto\n" + "\n".join(ROWS)).encode()


def test_overview_numbers_and_explanations(client):
    client.register("owner@example.com")
    ds = import_dataset(client, content=CSV, roles={"Concepto": "category"})
    o = client.get("/api/finance/overview").json()
    assert o["dataset"]["id"] == ds["id"]
    m = {x["key"]: x for x in o["metrics"]}
    assert m["income"]["value"] == 1000 + 1500 + 700 + 600 + 650 + 640 + 90000
    assert m["expenses"]["value"] == 3100 and m["expenses"]["rows"] == 4
    assert m["net"]["value"] == m["income"]["value"] - 3100
    assert all("formula" in x for x in o["metrics"])
    oct_, nov = o["monthly"]
    assert oct_ == {"period": "2026-10", "income": 2500, "expenses": 1400, "net": 1100, "cumulative": 1100, "count": 4}
    assert nov["cumulative"] == 1100 + nov["net"]
    cmp = {x["key"]: x for x in o["comparison"]["metrics"]}
    assert o["comparison"]["previous"] == "2026-10" and cmp["expenses"]["delta"] == 300
    assert o["expense_categories"][0]["label"] == "Renta" and o["expense_categories"][0]["total"] == 1600
    assert o["unusual"][0]["amount"] == 90000 and o["unusual"][0]["row_number"] == 12
    codes = [x["code"] for x in o["observations"]]
    assert "unusual" in codes
    assert {"not_accounting_advice", "sign_convention", "partial_period"} <= {x["code"] for x in o["limitations"]}


def test_negative_months_and_period_choice(client):
    client.register("owner@example.com")
    rows = ["01/09/2026;Ventas;500", "02/09/2026;Renta;-900", "01/10/2026;Ventas;2000", "31/10/2026;Renta;-100"]
    import_dataset(
        client, content=("Fecha;Concepto;Monto\n" + "\n".join(rows)).encode(), roles={"Concepto": "category"}
    )
    o = client.get("/api/finance/overview?period_a=2026-10&period_b=2026-09").json()
    assert o["comparison"]["previous"] == "2026-10" and o["comparison"]["current"] == "2026-09"
    obs = {x["code"]: x for x in o["observations"]}
    assert obs["negative_months"]["params"]["periods"] == ["2026-09"]
    assert obs["cumulative_negative"]["params"]["value"] == -400
    assert client.get("/api/finance/overview?period_a=bad").status_code == 422


def test_no_dataset_missing_roles_and_isolation(client, make_client):
    client.register("owner@example.com")
    assert client.get("/api/finance/overview").json() == {"datasets": [], "dataset": None}
    notes = import_dataset(client, content=b"Nota;Valor\nA;1\nB;2\n")
    r = client.get(f"/api/finance/overview?dataset_id={notes['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "finance.missing_roles"
    ds = import_dataset(client, content=CSV, roles={"Concepto": "category"})
    other = make_client()
    other.register("other@example.com", org="Ajena")
    assert other.get(f"/api/finance/overview?dataset_id={ds['id']}").status_code == 404
    assert other.get("/api/finance/overview").json()["dataset"] is None
