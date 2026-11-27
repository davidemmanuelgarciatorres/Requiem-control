"""Fase 8: facturación con un proveedor de pagos (Stripe) e idempotencia de webhooks;
limitador de intentos compartido entre réplicas.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-27
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    ALTER TABLE subscriptions
        ADD COLUMN provider_customer_id varchar(128),
        ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    CREATE UNIQUE INDEX uq_subscriptions_provider_ref ON subscriptions (provider, provider_ref) WHERE provider_ref IS NOT NULL;

    -- Eventos de webhook ya procesados: el proveedor puede reenviar el mismo evento (idempotencia).
    CREATE TABLE billing_events (
        provider varchar(32) NOT NULL,
        event_id varchar(128) NOT NULL,
        event_type varchar(80) NOT NULL,
        organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, event_id)
    );

    -- Limitador de intentos compartido (funciona con varias réplicas de la API).
    CREATE TABLE rate_limit_hits (
        bucket varchar(200) NOT NULL,
        hit_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_rate_limit_hits ON rate_limit_hits (bucket, hit_at);

    -- El webhook llega sin sesión: estas funciones (SECURITY DEFINER) son el ÚNICO acceso que tiene,
    -- y solo para localizar/actualizar la suscripción de la organización indicada por el proveedor.
    CREATE FUNCTION billing_apply(p_org uuid, p_plan_code text, p_status text, p_provider text, p_ref text,
                                  p_customer text, p_period_end timestamptz, p_cancel boolean)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN
      UPDATE subscriptions s SET
        plan_id = (SELECT id FROM plans WHERE code = p_plan_code),
        status = p_status, provider = p_provider, provider_ref = p_ref,
        provider_customer_id = COALESCE(p_customer, s.provider_customer_id),
        current_period_end = p_period_end, cancel_at_period_end = p_cancel, updated_at = now()
      WHERE s.organization_id = p_org;
    END $$;

    CREATE FUNCTION billing_org_by_ref(p_provider text, p_ref text)
    RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT organization_id FROM subscriptions WHERE provider = p_provider AND provider_ref = p_ref
    $$;

    CREATE FUNCTION billing_record_event(p_provider text, p_event text, p_type text, p_org uuid)
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN
      INSERT INTO billing_events (provider, event_id, event_type, organization_id) VALUES (p_provider, p_event, p_type, p_org);
      RETURN true;
    EXCEPTION WHEN unique_violation THEN
      RETURN false;
    END $$;

    CREATE FUNCTION rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer)
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE n integer;
    BEGIN
      DELETE FROM rate_limit_hits WHERE bucket = p_bucket AND hit_at < now() - make_interval(secs => p_window_seconds);
      SELECT count(*) INTO n FROM rate_limit_hits WHERE bucket = p_bucket;
      IF n >= p_max THEN RETURN false; END IF;
      INSERT INTO rate_limit_hits (bucket) VALUES (p_bucket);
      RETURN true;
    END $$;

    CREATE FUNCTION rate_limit_reset(p_bucket text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      DELETE FROM rate_limit_hits WHERE p_bucket IS NULL OR bucket = p_bucket
    $$;

    REVOKE ALL ON FUNCTION billing_apply(uuid, text, text, text, text, text, timestamptz, boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing_org_by_ref(text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing_record_event(text, text, text, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION rate_limit_hit(text, integer, integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION rate_limit_reset(text) FROM PUBLIC;
    """)
    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT EXECUTE ON FUNCTION billing_apply(uuid, text, text, text, text, text, timestamptz, boolean) TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION billing_org_by_ref(text, text) TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION billing_record_event(text, text, text, uuid) TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION rate_limit_hit(text, integer, integer) TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION rate_limit_reset(text) TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("""
    DROP FUNCTION IF EXISTS rate_limit_reset(text);
    DROP FUNCTION IF EXISTS rate_limit_hit(text, integer, integer);
    DROP FUNCTION IF EXISTS billing_record_event(text, text, text, uuid);
    DROP FUNCTION IF EXISTS billing_org_by_ref(text, text);
    DROP FUNCTION IF EXISTS billing_apply(uuid, text, text, text, text, text, timestamptz, boolean);
    DROP TABLE IF EXISTS rate_limit_hits;
    DROP TABLE IF EXISTS billing_events;
    DROP INDEX IF EXISTS uq_subscriptions_provider_ref;
    ALTER TABLE subscriptions DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS cancel_at_period_end,
        DROP COLUMN IF EXISTS provider_customer_id;
    """)
