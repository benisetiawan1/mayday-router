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
