"""Fase 7: agentes de inventario, clientes y correo disponibles; automatizaciones programadas.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-26
"""

import json

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"
DATASET_TOOLS = ["read_dataset", "dataset_quality", "summarize", "propose_action"]
EMAIL_TOOLS = ["read_gmail", "gmail_can_draft", "draft_reply", "summarize", "propose_action"]


def upgrade() -> None:
    for agent_id, tools, perms in (
        ("inventory-analyst", DATASET_TOOLS, ["data.read", "agents.run"]),
        ("customer-ops", DATASET_TOOLS, ["data.read", "agents.run"]),
        ("email-ops", EMAIL_TOOLS, ["agents.run"]),
    ):
        op.execute(
            "UPDATE agent_definitions SET version = '1.0.0', status = 'available', read_only = false, "
            f"requires_approval = true, allowed_tools = '{json.dumps(tools)}'::jsonb, "
            f"required_permissions = '{json.dumps(perms)}'::jsonb WHERE id = '{agent_id}'"
        )
    # Las automatizaciones son un módulo (no un agente que se activa): se retira del catálogo de agentes.
    op.execute("UPDATE agent_definitions SET status = 'retired' WHERE id = 'automation'")

    op.execute("""
    CREATE TABLE automations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
        agent_id varchar(48) NOT NULL REFERENCES agent_definitions(id),
        dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
        frequency varchar(16) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
        weekday smallint CHECK (weekday BETWEEN 0 AND 6),
        day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28),
        timezone varchar(64) NOT NULL DEFAULT 'America/Mexico_City',
        active boolean NOT NULL DEFAULT true,
        next_run_at timestamptz,
        last_run_at timestamptz,
        last_execution_id uuid REFERENCES agent_executions(id) ON DELETE SET NULL,
        last_error jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_automations_due ON automations (next_run_at) WHERE active;
    ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY automations_tenant ON automations FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

    -- Reclama automatizaciones vencidas (SKIP LOCKED) y las aparta 10 minutos; devuelve solo identificadores.
    CREATE FUNCTION claim_due_automations(max_items integer)
    RETURNS TABLE (automation_id uuid, organization_id uuid, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN
      RETURN QUERY
      UPDATE automations a SET next_run_at = now() + interval '10 minutes'
      WHERE a.id IN (
        SELECT x.id FROM automations x
        WHERE x.active AND x.next_run_at IS NOT NULL AND x.next_run_at <= now()
        ORDER BY x.next_run_at
        FOR UPDATE SKIP LOCKED
        LIMIT max_items
      )
      RETURNING a.id, a.organization_id, a.created_by;
    END $$;
    REVOKE ALL ON FUNCTION claim_due_automations(integer) FROM PUBLIC;
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON automations TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION claim_due_automations(integer) TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS claim_due_automations(integer); DROP TABLE IF EXISTS automations;")
    op.execute(
        "UPDATE agent_definitions SET status = 'planned' WHERE id IN ('inventory-analyst', 'customer-ops', 'email-ops', 'automation')"
    )
