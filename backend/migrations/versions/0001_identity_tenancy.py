"""Identidad, organizaciones, roles, permisos, planes, sesiones, auditoría y uso — con RLS.

Revision ID: 0001
Revises:
Create Date: 2026-11-26
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"

PERMISSIONS = [
    ("org.read", "Ver la organización"),
    ("org.update", "Editar datos de la organización"),
    ("org.delete", "Eliminar la organización"),
    ("org.export", "Exportar los datos de la organización"),
    ("members.read", "Ver miembros"),
    ("members.manage", "Agregar, cambiar rol o quitar miembros"),
    ("billing.read", "Ver plan y uso"),
    ("billing.manage", "Cambiar plan y facturación"),
    ("audit.read", "Ver el registro de auditoría"),
    ("data.read", "Ver datos importados"),
    ("data.write", "Importar y modificar datos"),
    ("agents.run", "Ejecutar agentes"),
    ("agents.manage", "Activar y configurar agentes"),
    ("approvals.decide", "Aprobar o rechazar acciones de agentes"),
]

ROLES = {
    # code: (name, rank, permissions)
    "owner": ("Propietario", 100, [p for p, _ in PERMISSIONS]),
    "admin": ("Administrador", 80, [p for p, _ in PERMISSIONS if p not in ("org.delete", "billing.manage")]),
    "member": ("Miembro", 50, ["org.read", "members.read", "billing.read", "data.read", "data.write", "agents.run"]),
    "viewer": ("Lector", 10, ["org.read", "members.read", "data.read"]),
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # --- Funciones de contexto de inquilino ------------------------------------
    op.execute("""
        CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid $$;
        CREATE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;
    """)

    op.execute("""
    CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE CHECK (length(email) <= 254),
        full_name varchar(120) NOT NULL CHECK (length(btrim(full_name)) > 0),
        password_hash text NOT NULL,
        preferred_language varchar(5) NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es', 'en')),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
        slug varchar(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        country char(2) NOT NULL DEFAULT 'MX',
        currency char(3) NOT NULL DEFAULT 'MXN',
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE permissions (
        code varchar(64) PRIMARY KEY,
        description text NOT NULL
    );

    CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
        code varchar(32) NOT NULL,
        name varchar(64) NOT NULL,
        rank integer NOT NULL,
        CONSTRAINT uq_roles_org_code UNIQUE NULLS NOT DISTINCT (organization_id, code)
    );

    CREATE TABLE role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_code varchar(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_code)
    );

    CREATE TABLE organization_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES roles(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_members_org_user UNIQUE (organization_id, user_id)
    );
    CREATE INDEX ix_members_org ON organization_members (organization_id);
    CREATE INDEX ix_members_user ON organization_members (user_id);

    CREATE TABLE plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(32) NOT NULL UNIQUE,
        name varchar(64) NOT NULL,
        price_cents integer NOT NULL CONSTRAINT ck_plans_price CHECK (price_cents >= 0),
        currency char(3) NOT NULL,
        interval varchar(16) NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
        max_active_agents integer NOT NULL CHECK (max_active_agents >= 0),
        max_monthly_executions integer NOT NULL CHECK (max_monthly_executions >= 0),
        max_storage_mb integer NOT NULL CHECK (max_storage_mb >= 0),
        max_members integer NOT NULL CHECK (max_members >= 1),
        features jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_public boolean NOT NULL DEFAULT true
    );

    CREATE TABLE subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES plans(id),
        status varchar(16) NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
        provider varchar(32),
        provider_ref varchar(128),
        current_period_end timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE user_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL UNIQUE,
        csrf_token varchar(64) NOT NULL,
        active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        ip inet,
        user_agent varchar(256)
    );
    CREATE INDEX ix_sessions_user ON user_sessions (user_id);
    CREATE INDEX ix_sessions_expires ON user_sessions (expires_at);

    CREATE TABLE audit_logs (
        id bigserial PRIMARY KEY,
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(64) NOT NULL,
        target_type varchar(32),
        target_id varchar(64),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        ip inet,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_audit_org_created ON audit_logs (organization_id, created_at DESC);

    CREATE TABLE usage_records (
        id bigserial PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        metric varchar(48) NOT NULL,
        quantity bigint NOT NULL CHECK (quantity >= 0),
        period_start timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_usage_org_metric_period ON usage_records (organization_id, metric, period_start);
    """)

    # --- Row-Level Security -----------------------------------------------------
    op.execute("""
    ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_select ON organizations FOR SELECT USING (
        id = app_current_org()
        OR EXISTS (SELECT 1 FROM organization_members m
                   WHERE m.organization_id = organizations.id AND m.user_id = app_current_user())
    );
    CREATE POLICY org_insert ON organizations FOR INSERT WITH CHECK (id = app_current_org());
    CREATE POLICY org_update ON organizations FOR UPDATE USING (id = app_current_org()) WITH CHECK (id = app_current_org());
    CREATE POLICY org_delete ON organizations FOR DELETE USING (id = app_current_org());

    ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY members_select ON organization_members FOR SELECT
        USING (organization_id = app_current_org() OR user_id = app_current_user());
    CREATE POLICY members_write ON organization_members FOR INSERT WITH CHECK (organization_id = app_current_org());
    CREATE POLICY members_update ON organization_members FOR UPDATE
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
    CREATE POLICY members_delete ON organization_members FOR DELETE USING (organization_id = app_current_org());

    ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY roles_select ON roles FOR SELECT
        USING (organization_id IS NULL OR organization_id = app_current_org());

    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY subscriptions_tenant ON subscriptions FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

    ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY usage_tenant ON usage_records FOR ALL
        USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

    -- Auditoría: solo lectura de la organización activa; inserción sin org (eventos de
    -- autenticación) o en la org activa. Sin UPDATE/DELETE: registro de solo anexado.
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY audit_select ON audit_logs FOR SELECT USING (organization_id = app_current_org());
    CREATE POLICY audit_insert ON audit_logs FOR INSERT
        WITH CHECK (organization_id IS NULL OR organization_id = app_current_org());
    """)

    # --- Privilegios del rol de aplicación (si existe) --------------------------
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT USAGE ON SCHEMA public TO {APP_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON users, organizations, organization_members,
              subscriptions, user_sessions, usage_records TO {APP_ROLE};
        GRANT SELECT, INSERT ON audit_logs TO {APP_ROLE};
        GRANT SELECT ON permissions, roles, role_permissions, plans TO {APP_ROLE};
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION app_current_org(), app_current_user() TO {APP_ROLE};
      END IF;
    END $$;
    """)

    # --- Datos semilla ----------------------------------------------------------
    for code, desc in PERMISSIONS:
        op.execute(f"INSERT INTO permissions (code, description) VALUES ('{code}', '{desc}')")
    for code, (name, rank, perms) in ROLES.items():
        op.execute(f"INSERT INTO roles (code, name, rank) VALUES ('{code}', '{name}', {rank})")
        values = ", ".join(f"('{p}')" for p in perms)
        op.execute(
            f"INSERT INTO role_permissions (role_id, permission_code) "
            f"SELECT r.id, v.code FROM roles r, (VALUES {values}) AS v(code) "
            f"WHERE r.code = '{code}' AND r.organization_id IS NULL"
        )
    # Límites configurables: se editan en la tabla, no en el código.
    op.execute("""
    INSERT INTO plans (code, name, price_cents, currency, max_active_agents, max_monthly_executions,
                       max_storage_mb, max_members, features) VALUES
      ('free', 'Gratis', 0, 'MXN', 2, 100, 50, 3,
       '{"reports": "basic", "integrations": false, "history_days": 30}'),
      ('premium', 'Premium', 40000, 'MXN', 6, 2000, 2048, 15,
       '{"reports": "advanced", "integrations": true, "history_days": 365}');
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS usage_records, audit_logs, user_sessions, subscriptions, plans,
        organization_members, role_permissions, roles, permissions, organizations, users CASCADE;
    DROP FUNCTION IF EXISTS app_current_org(), app_current_user();
    """)
