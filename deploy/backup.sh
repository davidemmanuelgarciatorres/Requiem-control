#!/usr/bin/env bash
# Respaldo completo de la base de datos de REQUIEM (formato comprimido de pg_dump) con retención.
# Uso:  deploy/backup.sh [carpeta] [días_de_retención]      (por defecto ./backups y 14 días)
# Programarlo (ej. cada noche a las 2:30):  30 2 * * *  cd /ruta/requiem && deploy/backup.sh /respaldos 30
# Guarda los respaldos FUERA del servidor también (otro disco o almacenamiento externo): contienen datos de clientes.
set -euo pipefail
DIR="${1:-./backups}"
KEEP_DAYS="${2:-14}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/requiem-$(date -u +%Y%m%dT%H%M%SZ).dump"
$COMPOSE exec -T db pg_dump -U postgres -Fc --no-owner requiem_control > "$FILE.partial"
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"
# Verificación: el respaldo debe poder leerse.
$COMPOSE exec -T db pg_restore --list < "$FILE" > /dev/null
find "$DIR" -name 'requiem-*.dump' -type f -mtime +"$KEEP_DAYS" -delete
echo "Respaldo listo: $FILE ($(du -h "$FILE" | cut -f1))"
