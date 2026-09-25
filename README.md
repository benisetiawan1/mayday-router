# Mayday Router

Mayday Router adalah gateway AI router self-hosted — build kustom berbasis
[9router](https://github.com/decolua/9router) / VansRouter dengan branding
"Mayday" (mayday.20c.org), berisi patch & penyempurnaan custom.

> Repo ini adalah **sumber build resmi**. Upstream (9router/VansRouter) hanya
> dijadikan referensi pengembangan — bukan sumber build langsung.

## Struktur

```
├── src/          # source app (Next.js + SSE gateway)
├── open-sse/     # provider adapters & capabilities
├── public/       # aset statis (skills)
├── skills/       # SKILL.md untuk AI agents (dashboard → Skills)
├── scripts/      # build helpers & auto-patch
├── Dockerfile    # build image mayday-router:latest
├── package.json  # deps & scripts
└── .env.example  # template env
```

## Build & Deploy

```bash
# Build image
docker build -t mayday-router:latest .

# Deploy (lihat scripts/deploy-mayday-router.sh untuk versi lengkap)
docker run -d --name mayday-router --network webapps -p 20128:20128 \
  --env-file .env.example \
  -v /DATAS/AppData/WebBase/mayday-router/db:/app/data \
  -e JWT_SECRET=<dari env> -e DATA_DIR=/app/data --restart always \
  mayday-router:latest
```

> Kredensial/data (`db/`, `*.sqlite`, `.env`) TIDAK disimpan di repo. Backup DB
> sebelum rebuild.

## Skills

`skills/*/SKILL.md` — dokumen yang dipaste ke AI agent mana pun supaya paham
cara pakai Mayday. Diserve self-hosted dari `/skills/*` di dashboard.

## Kredit

Mayday Router dibangun di atas pekerjaan komunitas open-source:

- **9router** — https://github.com/decolua/9router
- **VansRouter** — fork/evolusi 9router

Terima kasih kepada maintainer kedua proyek di atas.

## Lisensi

Lihat `LICENSE`.