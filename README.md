# mayday-router

Custom Mayday gateway build — forked/patched dari [9router](https://github.com/decolua/9router) / VansRouter, branded "Mayday" (mayday.20c.org). Repo PRIVATE — pusat source, patching, dan skills; tidak lagi build langsung dari upstream.

## Struktur

| Path | Isi |
|---|---|
| `source/` | Source code hasil patch Mayday — sumber build, bukan upstream |
| `source/skills/mayday*/` | SKILL.md untuk AI agents (dashboard → Skills) |
| `source/scripts/auto-patch.py` | Semua patch Mayday (38 patch idempotent) |

## Build & Deploy

```bash
cd source
docker build -t mayday-router:latest .
docker stop 9router && docker rm 9router
docker run -d --name 9router --network webapps -p 20128:20128 \
  --env-file .env.example \
  -v /DATAS/AppData/WebBase/9routers/db:/app/data \
  -e JWT_SECRET=<dari env> -e DATA_DIR=/app/data --restart always \
  mayday-router:latest
```

> Kredensial/asli (`data/`, `*.sqlite`, `.env`) TIDAK disimpan di repo ini. Backup DB sebelum rebuild.

## Referensi Upstream

- 9router: https://github.com/decolua/9router (branch `master`)
- Hanya untuk diff saat porting fitur baru — bukan sumber build.

## Operasional

- `source/skills/*/SKILL.md` — dipaste ke AI agent mana pun supaya paham cara pakai Mayday
- `source/scripts/auto-patch.py --check` — verifikasi patch masih cocok setelah ada perubahan source
- Insiden & preferensi operasional: lihat Hermes skill `9router-mayday-ops`