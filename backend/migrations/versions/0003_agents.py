"""Agentes de IA: definiciones, activación por organización, ejecuciones y aprobaciones — con RLS.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-26
"""

import json

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"

DATASET_INPUT = {
    "type": "object",
    "required": ["dataset_id"],
    "properties": {"dataset_id": {"type": "string", "format": "uuid"}},
    "additionalProperties": False,
}

# id, versión, estado, solo lectura, requiere aprobación, herramientas, permisos, timeout, reintentos, fase
AGENTS = [
    ("data-analyst", "1.0.0", "available", False, True, ["read_dataset", "dataset_quality", "summarize", "propose_action"],
     ["data.read", "agents.run"], 120, 2, 4),
    ("financial-analyst", "1.0.0", "available", True, False, ["read_dataset", "dataset_quality", "summarize"],
     ["data.read", "agents.run"], 120, 2, 4),
    ("inventory-analyst", "0.0.0", "planned", False, True, [], ["data.read", "agents.run"], 120, 2, 7),
    ("customer-ops", "0.0.0", "planned", False, True, [], ["data.read", "agents.run"], 120, 2, 7),
    ("email-ops", "0.0.0", "planned", False, True, [], ["agents.run"], 120, 2, 7),
    ("automation", "0.0.0", "planned", False, True, [], ["agents.run"], 120, 2, 7),
]


def upgrade() -> None:
    op.execute("""
    CREATE TABLE agent_definitions (
        id varchar(48) PRIMARY KEY,
        version varchar(16) NOT NULL,
        status varchar(16) NOT NULL CHECK (status IN ('available', 'planned', 'retired')),
        read_only boolean NOT NULL,
        requires_approval boolean NOT NULL,
        allowed_tools jsonb NOT NULL,
        required_permissions jsonb NOT NULL,
        input_schema jsonb NOT NULL,
        timeout_seconds integer NOT NULL CHECK (timeout_seconds > 0),
        max_retries integer NOT NULL CHECK (max_retries >= 0),
        phase integer NOT NULL
    );

    CREATE TABLE organization_agents (
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        agent_id varchar(48) NOT NULL REFERENCES agent_definitions(id),
        active boolean NOT NULL DEFAULT false,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, agent_id)
    );

    CREATE TABLE agent_executions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        agent_id varchar(48) NOT NULL REFERENCES agent_definitions(id),
        agent_version varchar(16) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'created' CHECK (status IN
            ('created', 'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
        input jsonb NOT NULL,
        output jsonb,
        error jsonb,
        usage jsonb NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        queued_at timestamptz,
        started_at timestamptz,
        completed_at timestamptz,
        CONSTRAINT uq_exec_idempotency UNIQUE (organization_id, idempotency_key)
    );
    CREATE INDEX ix_exec_org_created ON agent_executions (organization_id, created_at DESC);

    CREATE TABLE approvals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        execution_id uuid NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
        action_type varchar(48) NOT NULL,
        payload jsonb NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN
            ('pending', 'approved', 'rejected', 'executed', 'failed', 'cancelled')),
        requested_at timestamptz NOT NULL DEFAULT now(),
        decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
        decided_at timestamptz,
        result jsonb
    );
    CREATE INDEX ix_approvals_org_status ON approvals (organization_id, status, requested_at DESC);
    """)

    for table in ("organization_agents", "agent_executions", "approvals"):
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY {table}_tenant ON {table} FOR ALL
            USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
        """)

    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT ON agent_definitions TO {APP_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON organization_agents, agent_executions, approvals TO {APP_ROLE};
      END IF;
    END $$;
    """)

    for (aid, version, status, ro, approval, tools, perms, timeout, retries, phase) in AGENTS:
        op.execute(
            "INSERT INTO agent_definitions (id, version, status, read_only, requires_approval, allowed_tools, "
            "required_permissions, input_schema, timeout_seconds, max_retries, phase) VALUES "
            f"('{aid}', '{version}', '{status}', {ro}, {approval}, '{json.dumps(tools)}', '{json.dumps(perms)}', "
            f"'{json.dumps(DATASET_INPUT)}', {timeout}, {retries}, {phase})"
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS approvals, agent_executions, organization_agents, agent_definitions CASCADE")
