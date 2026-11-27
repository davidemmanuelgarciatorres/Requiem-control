#!/usr/bin/env bash
# Se ejecuta UNA vez al crear el volumen de PostgreSQL: crea los roles separados de REQUIEM.
set -euo pipefail
: "${OWNER_PASSWORD:?Define OWNER_PASSWORD}" "${APP_PASSWORD:?Define APP_PASSWORD}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE requiem_owner LOGIN PASSWORD '${OWNER_PASSWORD}';
CREATE ROLE requiem_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE requiem_control OWNER requiem_owner;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d requiem_control <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO requiem_owner;
GRANT USAGE ON SCHEMA public TO requiem_app;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
