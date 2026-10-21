#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL temporarily to the Supabase direct PostgreSQL connection string." >&2
  exit 1
fi
BACKUP_DIR="${BACKUP_DIR:-/var/backups/devutils}"
sudo install -d -m 0700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/devutils-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl --dbname="$SUPABASE_DB_URL" --file="$FILE"
sudo chmod 0600 "$FILE"
echo "Database backup created: $FILE"