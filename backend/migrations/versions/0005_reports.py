"""Reportes: instantáneas estructuradas de un análisis, con RLS.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-26
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    CREATE TABLE reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        execution_id uuid REFERENCES agent_executions(id) ON DELETE SET NULL,
        agent_id varchar(48) NOT NULL REFERENCES agent_definitions(id),
        dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
        title varchar(160) NOT NULL CHECK (length(btrim(title)) > 0),
        period_from date,
        period_to date,
        content jsonb NOT NULL,   -- instantánea inmutable: el reporte no cambia aunque cambien los datos
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_reports_org_created ON reports (organization_id, created_at DESC);
    CREATE UNIQUE INDEX uq_reports_execution ON reports (execution_id) WHERE execution_id IS NOT NULL;

    ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY reports_tenant ON reports FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON reports TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reports")
