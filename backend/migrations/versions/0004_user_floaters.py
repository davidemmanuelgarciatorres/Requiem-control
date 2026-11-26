"""Imágenes flotantes personales (hasta 3 por usuario) y preferencias de interfaz.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-26
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users ADD COLUMN ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

    -- Imágenes ya re-codificadas por el servidor (WebP, ≤ 256 px, sin metadatos EXIF).
    CREATE TABLE user_floaters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position smallint NOT NULL CHECK (position BETWEEN 0 AND 2),   -- máximo 3 por usuario
        image bytea NOT NULL CHECK (octet_length(image) <= 262144),
        width smallint NOT NULL,
        height smallint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_floaters_user_position UNIQUE (user_id, position)
    );

    -- Datos personales: cada usuario solo ve y modifica los suyos.
    ALTER TABLE user_floaters ENABLE ROW LEVEL SECURITY;
    CREATE POLICY user_floaters_owner ON user_floaters FOR ALL
        USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_floaters TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_floaters; ALTER TABLE users DROP COLUMN IF EXISTS ui_preferences;")
