#!/usr/bin/env bash
# Arranca REQUIEM CONTROL (API + página) y muestra la dirección y la URI de redirección para Google.
# Nunca imprime secretos: solo dice si están configurados.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Si la base de datos quedó apagada (p. ej. tras reiniciar el Codespace), se vuelve a encender.
if ! pg_isready -h localhost -q >/dev/null 2>&1; then
  docker start requiem-db >/dev/null 2>&1 || sudo service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do pg_isready -h localhost -q >/dev/null 2>&1 && break; sleep 1; done
fi

if [ ! -x backend/.venv/bin/uvicorn ] || [ ! -d frontend/node_modules ]; then
  echo "Falta la instalación; ejecutando scripts/codespace-setup.sh…"
  bash scripts/codespace-setup.sh
fi

if [ -n "${CODESPACE_NAME:-}" ]; then
  URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  SECURE=true
else
  URL="${PUBLIC_URL:-http://localhost:5173}"
  case "$URL" in https://*) SECURE=true ;; *) SECURE=false ;; esac
fi

# Clave de cifrado de tokens: se genera UNA vez por Codespace y vive en backend/.env (ignorado por Git).
ENV_FILE=backend/.env
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if ! grep -q '^INTEGRATIONS_ENCRYPTION_KEY=' "$ENV_FILE"; then
  KEY="$(backend/.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
  echo "INTEGRATIONS_ENCRYPTION_KEY=${KEY}" >> "$ENV_FILE"
fi

# Node 22 instalado con nvm (Codespaces genéricos).
export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use 22 >/dev/null 2>&1 || true

export ENVIRONMENT=development
export ALLOWED_ORIGINS="[\"${URL}\", \"http://localhost:5173\", \"http://127.0.0.1:5173\"]"
# En Codespaces el túnel de GitHub declara el dominio público; se acepta solo si termina en .app.github.dev.
if [ -n "${CODESPACE_NAME:-}" ]; then export TRUST_FORWARDED_HOST=true; fi
export COOKIE_SECURE="${SECURE}"
export GOOGLE_OAUTH_REDIRECT_URI="${URL}/api/integrations/google/callback"
export ALLOW_INTEGRATIONS_ON_FREE=true   # solo para probar; en producción se usa el plan
if [ -z "${AI_PROVIDER:-}" ]; then
  if [ -n "${GEMINI_API_KEY:-}" ]; then export AI_PROVIDER=gemini; else export AI_PROVIDER=mock; fi
fi

echo "==> Migraciones"
(cd backend && .venv/bin/alembic upgrade head)

echo "==> Arrancando API y página"
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "node_modules/.bin/vite" 2>/dev/null || true
LOGS="${TMPDIR:-/tmp}"
# Desligados por completo de esta terminal (stdin/stdout/stderr redirigidos) para que el script termine.
nohup bash -c 'cd backend && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000' \
  > "$LOGS/requiem-api.log" 2>&1 < /dev/null &
nohup bash -c 'cd frontend && exec npm run dev -- --host 0.0.0.0 --port 5173' \
  > "$LOGS/requiem-web.log" 2>&1 < /dev/null &

for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:5173/ 2>/dev/null && break
  sleep 1
done

state() { if [ -n "${!1:-}" ]; then echo "configurado"; else echo "FALTA"; fi; }
cat <<MSG

==================================================================
 REQUIEM CONTROL está corriendo
 Abre:   ${URL}

 En Google Cloud → Clientes → requiem-web, agrega:
   Orígenes autorizados de JavaScript:  ${URL}
   URI de redireccionamiento:           ${URL}/api/integrations/google/callback

 GOOGLE_OAUTH_CLIENT_ID:      $(state GOOGLE_OAUTH_CLIENT_ID)
 GOOGLE_OAUTH_CLIENT_SECRET:  $(state GOOGLE_OAUTH_CLIENT_SECRET)
 Proveedor de IA:             ${AI_PROVIDER}
 Registros: ${LOGS}/requiem-api.log y ${LOGS}/requiem-web.log
 Si algo se rechaza: grep -i rechaz ${LOGS}/requiem-api.log
==================================================================
MSG
