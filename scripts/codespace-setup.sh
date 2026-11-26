#!/usr/bin/env bash
# Instalación única al crear el Codespace (o en cualquier Linux con PostgreSQL en localhost).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Cliente de PostgreSQL"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -y -qq && sudo apt-get install -y -qq --no-install-recommends postgresql-client
fi

echo "==> Esperando a la base de datos"
for _ in $(seq 1 60); do
  pg_isready -h localhost -U postgres -q && break
  sleep 1
done

echo "==> Roles y bases de datos de REQUIEM"
PGHOST=localhost PGUSER=postgres PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" bash backend/scripts/init_dev_db.sh

echo "==> Dependencias de Python"
python3 -m venv backend/.venv
backend/.venv/bin/pip install -q --upgrade pip
backend/.venv/bin/pip install -q -r backend/requirements.txt

echo "==> Dependencias de la página"
(cd frontend && npm ci --no-audit --no-fund)

echo "Instalación lista. Para arrancar: bash scripts/codespace-start.sh"
