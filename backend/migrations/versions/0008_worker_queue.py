"""Cola de ejecuciones para un proceso de trabajo aparte (worker).

`claim_next_execution()` toma UNA ejecución en cola con FOR UPDATE SKIP LOCKED (dos workers nunca
toman la misma) y devuelve solo identificadores; el worker fija después el contexto RLS de esa
organización para ejecutarla. `fail_stale_executions()` marca como interrumpidas las que quedaron
"en curso" si un worker se cayó, y libera las reclamadas que nunca empezaron.
Ambas son SECURITY DEFINER (dueño: el rol de migraciones) y solo el rol de la app puede llamarlas.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-26
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    ALTER TABLE agent_executions ADD COLUMN claimed_at timestamptz;
    CREATE INDEX ix_agent_executions_queue ON agent_executions (created_at) WHERE status = 'queued' AND claimed_at IS NULL;

    CREATE FUNCTION claim_next_execution()
    RETURNS TABLE (execution_id uuid, organization_id uuid, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN
      RETURN QUERY
      UPDATE agent_executions e SET claimed_at = now()
      WHERE e.id = (
        SELECT x.id FROM agent_executions x
        WHERE x.status = 'queued' AND x.claimed_at IS NULL
        ORDER BY x.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING e.id, e.organization_id, e.user_id;
    END $$;

    CREATE FUNCTION fail_stale_executions(max_age interval)
    RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE n integer;
    BEGIN
      UPDATE agent_executions SET claimed_at = NULL
        WHERE status = 'queued' AND claimed_at < now() - max_age;
      UPDATE agent_executions
        SET status = 'failed', completed_at = now(),
            error = jsonb_build_object('code', 'agent.interrupted',
                                       'message', 'La ejecución se interrumpió; vuelve a intentarlo.',
                                       'params', '{}'::jsonb)
        WHERE status = 'running' AND started_at < now() - max_age;
      GET DIAGNOSTICS n = ROW_COUNT;
      RETURN n;
    END $$;

    REVOKE ALL ON FUNCTION claim_next_execution() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fail_stale_executions(interval) FROM PUBLIC;
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT EXECUTE ON FUNCTION claim_next_execution() TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION fail_stale_executions(interval) TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("""
    DROP FUNCTION IF EXISTS fail_stale_executions(interval);
    DROP FUNCTION IF EXISTS claim_next_execution();
    DROP INDEX IF EXISTS ix_agent_executions_queue;
    ALTER TABLE agent_executions DROP COLUMN IF EXISTS claimed_at;
    """)
