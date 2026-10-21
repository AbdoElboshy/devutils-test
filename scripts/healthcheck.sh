#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:3000/api/health}"
BODY="$(curl --fail --silent --show-error --max-time 10 "$URL")"
if [[ "$BODY" != *'"status":"ok"'* ]]; then
  echo "Health check returned an unexpected response." >&2
  exit 1
fi
echo "DevUtils health check passed: $URL"