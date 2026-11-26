"""Ingesta de datos: archivos subidos, conjuntos de datos y filas — con RLS.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-26
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

APP_ROLE = "requiem_app"


def upgrade() -> None:
    op.execute("""
    -- Archivo original tal como se subió. El contenido se guarda en la base de datos (bytea):
    -- queda bajo la misma RLS que el resto de los datos de la organización y no depende de un
    -- sistema de archivos compartido. Límite por archivo controlado por la API (10 MB por defecto).
    CREATE TABLE uploaded_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        original_filename varchar(255) NOT NULL,
        file_format varchar(8) NOT NULL CHECK (file_format IN ('csv', 'xlsx')),
        size_bytes integer NOT NULL CHECK (size_bytes > 0),
        sha256 char(64) NOT NULL,
        content bytea NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'validated'
            CHECK (status IN ('validated', 'imported', 'discarded')),
        parse_options jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_uploads_org_created ON uploaded_files (organization_id, created_at DESC);
    CREATE INDEX ix_uploads_org_sha ON uploaded_files (organization_id, sha256);

    -- Conjunto de datos importado (resultado de confirmar una subida con su mapeo de columnas).
    CREATE TABLE datasets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        uploaded_file_id uuid REFERENCES uploaded_files(id) ON DELETE SET NULL,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
        row_count integer NOT NULL CHECK (row_count >= 0),
        column_count integer NOT NULL CHECK (column_count >= 0),
        columns jsonb NOT NULL,          -- [{key, name, source, type, role}]
        report jsonb NOT NULL,           -- análisis de calidad y resumen por columna
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_datasets_org_created ON datasets (organization_id, created_at DESC);

    -- Filas: el contenido de una hoja de cálculo es genuinamente flexible → JSONB por fila.
    CREATE TABLE dataset_rows (
        dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        row_number integer NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (dataset_id, row_number)
    );
    CREATE INDEX ix_dataset_rows_org ON dataset_rows (organization_id);
    """)

    for table in ("uploaded_files", "datasets", "dataset_rows"):
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY {table}_tenant ON {table} FOR ALL
            USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
        """)

    op.execute(f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON uploaded_files, datasets, dataset_rows TO {APP_ROLE};
      END IF;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dataset_rows, datasets, uploaded_files CASCADE")
