#!/usr/bin/env bash
# Restaura un respaldo en una base de datos NUEVA (no toca la actual) para revisarla o cambiarla después.
# Uso:  deploy/restore.sh archivo.dump [nombre_base_destino]   (por defecto requiem_restore)
set -euo pipefail
FILE="${1:?Indica el archivo .dump}"
TARGET="${2:-requiem_restore}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
$COMPOSE exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TARGET} OWNER requiem_owner"
$COMPOSE exec -T db pg_restore -U postgres -d "${TARGET}" --no-owner --role=requiem_owner < "$FILE"
echo "Restaurado en la base ${TARGET}. Para usarla como principal, cambia DATABASE_URL o renómbrala con el servicio detenido."
