"""Integraciones (Fase 6): conexiones OAuth por organización con tokens cifrados y estados OAuth
de un solo uso. Nuevo permiso `integrations.manage` (propietario y administrador).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-26
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    CREATE TABLE integrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider varchar(32) NOT NULL CHECK (provider IN ('google')),
        status varchar(16) NOT NULL CHECK (status IN ('connected', 'error', 'disconnected')),
        services text[] NOT NULL DEFAULT '{}',
        scopes text[] NOT NULL DEFAULT '{}',
        account_email varchar(320),
        access_token_enc bytea,      -- cifrado con INTEGRATIONS_ENCRYPTION_KEY (nunca en texto plano)
        refresh_token_enc bytea,
        token_expires_at timestamptz,
        connected_by uuid REFERENCES users(id) ON DELETE SET NULL,
        connected_at timestamptz,
        last_sync_at timestamptz,
        last_error jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, provider)
    );
    ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY integrations_tenant ON integrations FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

    CREATE TABLE oauth_states (
        state_hash bytea PRIMARY KEY,            -- sha256 del parámetro `state`
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider varchar(32) NOT NULL,
        services text[] NOT NULL,
        code_verifier_enc bytea NOT NULL,        -- PKCE, cifrado
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
    CREATE POLICY oauth_states_owner ON oauth_states FOR ALL
        USING (organization_id = app_current_org() AND user_id = app_current_user())
        WITH CHECK (organization_id = app_current_org() AND user_id = app_current_user());

    INSERT INTO permissions (code, description) VALUES ('integrations.manage', 'Conectar y desconectar integraciones');
    INSERT INTO role_permissions (role_id, permission_code)
        SELECT r.id, 'integrations.manage' FROM roles r WHERE r.code IN ('owner', 'admin') AND r.organization_id IS NULL;
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON integrations, oauth_states TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM role_permissions WHERE permission_code = 'integrations.manage';
    DELETE FROM permissions WHERE code = 'integrations.manage';
    DROP TABLE IF EXISTS oauth_states;
    DROP TABLE IF EXISTS integrations;
    """)
