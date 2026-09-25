#!/bin/bash
# Deploy mayday-router image — container "mayday-router", DB volume dari path real
# (bukan lagi via symlink 9routers). Mengganti container lama "9router" (vansrouter-mayday:final).
set -euo pipefail

IMAGE=mayday-router:latest
NAME=mayday-router
DB_DIR=/DATAS/AppData/WebBase/mayday-router/db
PORT=20128
JWT_SECRET=26fef936695eeffceec68ef209921394e672c364161ce5c5e3d44a002d0c9af5

echo "==> Backup DB sebelum deploy"
cp "$DB_DIR/db/data.sqlite" "$DB_DIR/db/data.sqlite.bak-before-deploy-$(date +%Y%m%d-%H%M%S)"

echo "==> Stop & remove container lama (9router)"
docker stop 9router 2>/dev/null || true
docker rm 9router 2>/dev/null || true

echo "==> Jalankan container baru: $NAME"
docker run -d --name "$NAME" --network webapps -p "$PORT:$PORT" \
  --env-file /DATAS/AppData/WebBase/mayday-router/source/.env.example \
  -v "$DB_DIR:/app/data" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e DATA_DIR=/app/data \
  -e NODE_ENV=production \
  -e PORT="$PORT" \
  -e HOSTNAME=0.0.0.0 \
  -e NEXT_TELEMETRY_DISABLED=1 \
  --restart always \
  "$IMAGE"

echo "==> Verifikasi"
sleep 5
docker ps --filter name="$NAME"
curl -sf "http://localhost:$PORT/v1/models" -H "Authorization: Bearer $JWT_SECRET" | head -c 200 || echo "(perlu API key untuk cek /v1/models)"
echo "==> DONE"