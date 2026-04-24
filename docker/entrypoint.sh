#!/bin/sh
set -e

DATA_FILE="/app/public/data/satellites.json"

if [ ! -f "$DATA_FILE" ]; then
  echo "[entrypoint] Dataset not found at $DATA_FILE — running build:data..."
  if ! npm run build:data; then
    echo "[entrypoint] build:data failed (likely no network). Writing an empty dataset so the dev server still boots."
    mkdir -p /app/public/data
    printf '{"generatedAt":"","count":0,"satellites":[]}' > "$DATA_FILE"
  fi
else
  echo "[entrypoint] Using cached dataset at $DATA_FILE. Run 'docker compose run --rm app npm run build:data' to refresh."
fi

exec "$@"
