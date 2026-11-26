#!/usr/bin/env bash
# Instalación única al crear el Codespace (o en cualquier Linux con PostgreSQL en localhost).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Cliente de PostgreSQL"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -y -qq && sudo apt-get install -y -qq --no-install-recommends postgresql-client
fi

echo "==> Base de datos"
db_ready() { pg_isready -h localhost -q >/dev/null 2>&1; }
for _ in $(seq 1 20); do db_ready && break; sleep 1; done
if ! db_ready; then
  # Codespace con la configuración genérica de GitHub (sin el contenedor de PostgreSQL de .devcontainer):
  # se usa Docker si existe; si no, se instala PostgreSQL en este mismo contenedor.
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "    Iniciando PostgreSQL 16 con Docker…"
    docker start requiem-db >/dev/null 2>&1 || docker run -d --name requiem-db --restart unless-stopped \
      -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5432:5432 -v requiem-pgdata:/var/lib/postgresql/data postgres:16 >/dev/null
  else
    echo "    Instalando PostgreSQL en este contenedor…"
    sudo apt-get update -y -qq
    sudo apt-get install -y -qq --no-install-recommends postgresql >/dev/null
    sudo service postgresql start
    sudo -u postgres psql -q -c "ALTER USER postgres PASSWORD 'postgres';"
  fi
  for _ in $(seq 1 60); do db_ready && break; sleep 1; done
fi
db_ready || { echo "ERROR: PostgreSQL no responde en localhost:5432"; exit 1; }

echo "==> Roles y bases de datos de REQUIEM"
PGHOST=localhost PGUSER=postgres PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" bash backend/scripts/init_dev_db.sh

echo "==> Dependencias de Python"
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Se necesita Python 3.12 o más nuevo"'
python3 -m venv backend/.venv
backend/.venv/bin/pip install -q --upgrade pip
backend/.venv/bin/pip install -q -r backend/requirements.txt

echo "==> Node.js"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  # La página usa Vite 8, que necesita Node 22. Los Codespaces genéricos traen nvm.
  export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22 >/dev/null && nvm alias default 22 >/dev/null
fi
node -v

echo "==> Dependencias de la página"
(cd frontend && npm ci --no-audit --no-fund)

echo "Instalación lista. Para arrancar: bash scripts/codespace-start.sh"
