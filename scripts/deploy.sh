#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/devutils/app}"
ENV_FILE="${ENV_FILE:-/etc/devutils/devutils.env}"

cd "$APP_DIR"
sudo -u devutils node scripts/validate-env.mjs --file "$ENV_FILE"
sudo -u devutils npm ci
sudo -u devutils npx tsx scripts/generate-sitemap.ts --env-file "$ENV_FILE"
sudo -u devutils npm run build
sudo systemctl restart devutils
sleep 2
bash scripts/healthcheck.sh
echo "DevUtils deployment completed successfully."