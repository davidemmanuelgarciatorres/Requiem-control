"""Cuentas: verificación de correo, enlaces de un solo uso (restablecer contraseña / verificar correo)
e invitaciones por correo a una organización.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-27
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

    -- Enlaces de un solo uso. Solo se guarda el sha256 del token; el token viaja únicamente en el correo.
    CREATE TABLE auth_tokens (
        token_hash bytea PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose varchar(24) NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_auth_tokens_user ON auth_tokens (user_id, purpose);

    CREATE TABLE invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email citext NOT NULL,
        role_id uuid NOT NULL REFERENCES roles(id),
        token_hash bytea NOT NULL UNIQUE,
        invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_invitations_pending ON invitations (organization_id, email) WHERE accepted_at IS NULL;
    ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY invitations_tenant ON invitations FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

    -- Aceptar una invitación: la persona invitada aún no pertenece a la organización (RLS no la deja ver
    -- la invitación), así que esta función acotada valida el token, el correo y la caducidad, y crea la membresía.
    CREATE FUNCTION accept_invitation(p_hash bytea, p_user uuid)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE inv invitations%ROWTYPE; u_email citext;
    BEGIN
      SELECT * INTO inv FROM invitations WHERE token_hash = p_hash FOR UPDATE;
      IF NOT FOUND OR inv.accepted_at IS NOT NULL OR inv.expires_at < now() THEN RETURN NULL; END IF;
      SELECT email INTO u_email FROM users WHERE id = p_user;
      IF u_email IS DISTINCT FROM inv.email THEN RETURN NULL; END IF;
      INSERT INTO organization_members (organization_id, user_id, role_id)
        VALUES (inv.organization_id, p_user, inv.role_id)
        ON CONFLICT (organization_id, user_id) DO NOTHING;
      UPDATE invitations SET accepted_at = now() WHERE id = inv.id;
      RETURN inv.organization_id;
    END $$;

    CREATE FUNCTION invitation_preview(p_hash bytea)
    RETURNS TABLE (organization_name text, email text, expired boolean)
    LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT o.name::text, i.email::text, (i.expires_at < now() OR i.accepted_at IS NOT NULL)
      FROM invitations i JOIN organizations o ON o.id = i.organization_id WHERE i.token_hash = p_hash
    $$;
    REVOKE ALL ON FUNCTION accept_invitation(bytea, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION invitation_preview(bytea) FROM PUBLIC;
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens, invitations TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION accept_invitation(bytea, uuid) TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION invitation_preview(bytea) TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("""
    DROP FUNCTION IF EXISTS invitation_preview(bytea);
    DROP FUNCTION IF EXISTS accept_invitation(bytea, uuid);
    DROP TABLE IF EXISTS invitations;
    DROP TABLE IF EXISTS auth_tokens;
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
    """)
