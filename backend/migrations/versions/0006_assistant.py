"""Asistente IA: mensajes de conversación, privados por usuario dentro de su organización (RLS).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-26
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    CREATE TABLE assistant_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL,
        role varchar(16) NOT NULL CHECK (role IN ('user', 'assistant')),
        content text NOT NULL CHECK (length(content) BETWEEN 1 AND 8000),
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_assistant_conv ON assistant_messages (conversation_id, created_at);
    CREATE INDEX ix_assistant_user ON assistant_messages (organization_id, user_id, created_at DESC);

    ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
    -- Solo la persona que conversa ve sus mensajes, y solo dentro de la organización activa.
    CREATE POLICY assistant_owner ON assistant_messages FOR ALL
        USING (organization_id = app_current_org() AND user_id = app_current_user())
        WITH CHECK (organization_id = app_current_org() AND user_id = app_current_user());
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, DELETE ON assistant_messages TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS assistant_messages")
