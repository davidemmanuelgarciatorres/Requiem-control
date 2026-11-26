#!/usr/bin/env bash
# Crea los roles y bases de datos LOCALES de desarrollo de REQUIEM CONTROL.
# Uso: sudo -u postgres ./scripts/init_dev_db.sh   (requiere PostgreSQL 16+ en localhost)
#
# Las contraseñas por defecto son SOLO para desarrollo local. En cualquier otro
# entorno define OWNER_PASSWORD y APP_PASSWORD y usa un gestor de secretos.
set -euo pipefail

OWNER_PASSWORD="${OWNER_PASSWORD:-requiem_owner_dev}"
APP_PASSWORD="${APP_PASSWORD:-requiem_app_dev}"

psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'requiem_owner') THEN
    CREATE ROLE requiem_owner LOGIN PASSWORD '${OWNER_PASSWORD}';
  END IF;
  -- Rol de la API: sin superusuario ni BYPASSRLS, para que la RLS siempre aplique.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'requiem_app') THEN
    CREATE ROLE requiem_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;
SQL

for db in requiem_control requiem_control_test requiem_control_e2e; do
  if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
    psql -q -c "CREATE DATABASE ${db} OWNER requiem_owner"
  fi
  psql -q -d "${db}" -c "REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO requiem_owner; GRANT USAGE ON SCHEMA public TO requiem_app; CREATE EXTENSION IF NOT EXISTS citext;"
done
echo "Listo. Ahora: cd backend && .venv/bin/alembic upgrade head"
