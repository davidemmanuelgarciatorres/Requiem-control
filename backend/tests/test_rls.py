"""Row-Level Security: segunda barrera, verificada directamente en PostgreSQL con el rol de aplicación."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app import entitlements
from tests.conftest import APP_URL


@pytest.fixture
def two_orgs(make_client):
    a, b = make_client(), make_client()
    a.register("a@example.com", org="Org A")
    b.register("b@example.com", org="Org B")
    return a.session, b.session


@pytest.fixture
def app_conn():
    engine = create_engine(APP_URL)
    with engine.connect() as conn:
        yield conn
    engine.dispose()


def ctx(conn, user_id="", org_id=""):
    conn.execute(
        text("SELECT set_config('app.current_user_id', :u, false), set_config('app.current_org_id', :o, false)"),
        {"u": user_id, "o": org_id},
    )


def test_app_role_cannot_bypass_rls(app_conn):
    row = app_conn.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
    assert row == (False, False)


def test_without_context_tenant_tables_are_empty(two_orgs, app_conn):
    ctx(app_conn)
    for table in ("organizations", "organization_members", "subscriptions", "audit_logs", "usage_records"):
        assert app_conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0, table


def test_context_only_exposes_own_org(two_orgs, app_conn):
    a, b = two_orgs
    ctx(app_conn, a["user"]["id"], a["active_organization"]["id"])
    assert app_conn.execute(text("SELECT name FROM organizations")).scalars().all() == ["Org A"]
    assert app_conn.execute(text("SELECT count(*) FROM subscriptions")).scalar_one() == 1
    orgs_in_audit = app_conn.execute(text("SELECT DISTINCT organization_id::text FROM audit_logs")).scalars().all()
    assert orgs_in_audit == [a["active_organization"]["id"]]
    # Consulta explícita por la organización ajena: la base de datos no devuelve nada.
    q = text("SELECT count(*) FROM organization_members WHERE organization_id = :o")
    assert app_conn.execute(q, {"o": b["active_organization"]["id"]}).scalar_one() == 0


def test_cannot_write_into_foreign_org(two_orgs, app_conn):
    a, b = two_orgs
    ctx(app_conn, a["user"]["id"], a["active_organization"]["id"])
    with pytest.raises(DBAPIError, match="row-level security"):
        app_conn.execute(
            text(
                "INSERT INTO organization_members (organization_id, user_id, role_id) "
                "SELECT :o, :u, id FROM roles WHERE code = 'admin'"
            ),
            {"o": b["active_organization"]["id"], "u": a["user"]["id"]},
        )
    app_conn.rollback()
    ctx(app_conn, a["user"]["id"], a["active_organization"]["id"])
    updated = app_conn.execute(
        text("UPDATE organizations SET name = 'pwned' WHERE id = :o"), {"o": b["active_organization"]["id"]}
    ).rowcount
    assert updated == 0


def test_audit_log_is_append_only(two_orgs, app_conn):
    a, _ = two_orgs
    ctx(app_conn, a["user"]["id"], a["active_organization"]["id"])
    with pytest.raises(DBAPIError, match="permission denied"):
        app_conn.execute(text("DELETE FROM audit_logs"))
    app_conn.rollback()


def test_entitlements_free_plan_allows_two_agents(two_orgs):
    from app.db import _session_factory, set_tenant_context

    a, _ = two_orgs
    with _session_factory()() as db:
        set_tenant_context(db, user_id=None, org_id=a["active_organization"]["id"])
        ent = entitlements.for_organization(db, a["active_organization"]["id"])
    assert ent.plan_code == "free" and ent.max_active_agents == 2
    entitlements.ensure_can_activate_agent(ent, 0)
    entitlements.ensure_can_activate_agent(ent, 1)
    with pytest.raises(entitlements.EntitlementError) as e:
        entitlements.ensure_can_activate_agent(ent, 2)
    assert e.value.code == "plan.max_active_agents"
