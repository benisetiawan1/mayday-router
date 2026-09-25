# Changelog

## 0.22.0-beta (2026-09-25)

### Fix OpenCode free-tier
- Port executor opencode dari upstream 9router v0.5.86: session handling (x-opencode-session), per-session quota, request-id derivation.
- Free tier OpenCode (opencode / MiMo) sekarang bisa digunakan (sebelumnya 403 "free tier can only be used from within OpenCode").
- Sync registry opencode + helpers (isMuseSparkModel), thinkingLevels, reasoningContentInjector, opencodeFingerprint.

### Rebrand
- VansAI -> Mayday di seluruh UI + i18n + dashboardGuard.

## 0.21.0-beta (2026-09-25)
- Rebrand total 9router/vansrouter -> mayday (paths, headers, env, skills, clineAuth).
- Update channel arahkan ke repo sendiri (GitHub releases).
- Skills self-hosted + repo private.

## 0.23.0-beta (2026-09-25)

### Update channel fix
- version/route.js: pakai GitHub /releases (list) dengan semver sort termasuk prerelease (-beta). Sebelumnya /releases/latest tidak pernah mengembalikan rilis beta sehingga update tidak terdeteksi.
- Update channel sekarang benar-benar berfungsi untuk alur rilis beta Mayday.

## 0.24.0-beta (2026-09-25)

### Investigasi MiMo Code Free
- Registry & executor mimo-free sudah terdaftar; model check belum tuntas (perlu verifikasi PROVIDERS.baseUrl & bootstrap upstream). Fix lanjutan di rilis berikut.

### Catatan
- Versi ini untuk uji deteksi update channel (tanpa perubahan fungsional baru).

## 0.25.0-beta (2026-09-25)

### Update flow Docker-aware
- Popup update tidak lagi menyarankan "npm i -g mayday" di mode Docker.
- Install command diganti: bash scripts/deploy-mayday-router.sh (git pull -> docker build -> backup DB -> swap).
- Endpoint /api/version/shutdown dikunci (409) di mode Docker agar tidak membunuh proses container secara sembrono.
