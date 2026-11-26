"""Fase 4: worker con cola en PostgreSQL (SKIP LOCKED), modo worker de la API y recuperación de ejecuciones colgadas."""

from sqlalchemy import text

from app import worker
from app.config import get_settings
from tests.test_agents import activate, import_dataset, run


def test_worker_mode_queues_and_worker_processes(client, monkeypatch):
    monkeypatch.setenv("EXECUTION_MODE", "worker")
    get_settings.cache_clear()
    try:
        client.register("owner@example.com")
        ds = import_dataset(client)
        activate(client, "financial-analyst")
        ex = run(client, "financial-analyst", ds["id"]).json()
        assert client.get(f"/api/agents/executions/{ex['id']}").json()["status"] == "queued"  # la API no la ejecutó
        assert worker.run_once() is True
        assert client.get(f"/api/agents/executions/{ex['id']}").json()["status"] == "completed"
        assert worker.run_once() is False  # cola vacía; no se ejecuta dos veces
    finally:
        get_settings.cache_clear()


def test_claim_is_exclusive_and_app_role_cannot_bypass_rls(client, monkeypatch, owner_engine):
    monkeypatch.setenv("EXECUTION_MODE", "worker")
    get_settings.cache_clear()
    try:
        client.register("owner@example.com")
        ds = import_dataset(client)
        activate(client, "financial-analyst")
        run(client, "financial-analyst", ds["id"])
        from app.db import _session_factory

        a, b = _session_factory()(), _session_factory()()
        try:
            first = a.execute(text("SELECT execution_id FROM claim_next_execution()")).first()
            second = b.execute(text("SELECT execution_id FROM claim_next_execution()")).first()  # SKIP LOCKED
            assert first is not None and second is None
            # Sin contexto de organización, el rol de la app sigue sin ver ejecuciones por SELECT directo.
            assert b.execute(text("SELECT count(*) FROM agent_executions")).scalar_one() == 0
        finally:
            a.rollback()
            b.rollback()
            a.close()
            b.close()
    finally:
        get_settings.cache_clear()


def test_stale_running_executions_are_marked_interrupted(client, monkeypatch, owner_engine):
    monkeypatch.setenv("EXECUTION_MODE", "worker")
    get_settings.cache_clear()
    try:
        client.register("owner@example.com")
        ds = import_dataset(client)
        activate(client, "financial-analyst")
        ex = run(client, "financial-analyst", ds["id"]).json()
        with owner_engine.begin() as c:
            c.execute(text("UPDATE agent_executions SET status='running', started_at = now() - interval '1 hour'"))
        assert worker.fail_stale() == 1
        e = client.get(f"/api/agents/executions/{ex['id']}").json()
        assert e["status"] == "failed" and e["error"]["code"] == "agent.interrupted"
    finally:
        get_settings.cache_clear()
