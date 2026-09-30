# Changelog

All notable changes to Mayday Router are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versions are pre-1.0 betas.

## 0.30.0-beta (2026-09-30)

### Control Room UI (full redesign)
- Dashboard re-skinned end-to-end to the "Control Room" design system:
  mono/condensed typography, hairline panels, LED/tag/bar primitives,
  full-width layout, numbered sections.
- New shell: 54px topbar (brand, version chip, operational LED, ⌘K search,
  icon actions), text tabs with active underline, grouped System menu,
  simplified status strip.
- Every dashboard page restructured onto the new primitives; all shared
  components restyled without behavior changes.
- Fully responsive: no horizontal overflow down to phone widths; tables
  scroll inside their panels; mobile-adapted topbar, tabs, and forms.

### Usage: real-time live flow
- New per-request lifecycle instrumentation: received → routed → streaming →
  done/error/aborted, with real account names, streamed byte counts,
  provider-reported token usage, measured durations, and fallback hops.
- New usage layout: LIVE · Active requests panel (flow tree CLIENT → MAYDAY →
  provider → model, pausable feed), Requests chart + Top providers side by
  side, and a Request feed with real `STREAM complete · ms · in/out` and
  `403 → fallback` log lines.

### Fixes
- i18n DOM translator no longer reverts dynamically-updated text nodes to
  their hydration-time values (this blanked live stats after navigation).
- Basic chat: added the missing dashboard chat route (session-authenticated,
  machine-trusted internal hop).
- Basic chat: model requests now always carry the connection's provider
  prefix — bare/slashed model ids no longer mis-route to providers without
  credentials.
- Basic chat: model list loads once per provider instead of once per
  connection, fixing slow/partial loading on large fleets.
- Basic chat follows the dashboard theme and fills the content width.
- Design mockups are served correctly again from the app bundle.
- Asset scanning scoped to the source tree so vendored/binary folders no
  longer break dev builds.
- Status strip renders only from real APIs; placeholder cells removed.

## 0.29.0-beta (2026-09-26)

### Added — Extended features
- Extended page (System → Extended) with opt-in power features.
- Skill Router (TF-IDF): classifies user intent and injects the matching
  skill's instructions; per-skill thresholds; default OFF.
- Session Skill Dedup: full skill injection once per session, short reminders
  afterwards; default OFF.
- Manifest-driven Skills Registry: CRUD skills as on-disk manifests, no shell
  execution.
- Custom Skill Studio: author skill manifests from the dashboard.
- Hermes Memory Bridge: read-only snapshot bridge to `DATA_DIR/hermes-bridge/`.

## 0.28.0-beta (2026-09-18)

### Added
- Proxy pools: outbound proxy management with batch import and bulk
  activate/deactivate/delete/health-check.
- One-click relay deploys (Cloudflare Workers / Vercel / Deno).
- Proxy fitness tracker: automatic quarantine of failing proxies with
  per-provider filters.

### Improved
- Circuit breaker is now proxy-aware: failures are attributed to the specific
  proxy bucket instead of the whole provider.

## 0.27.0-beta (2026-09-10)

### Added
- Media providers: image generation, video, text-to-speech,
  speech-to-text, embeddings, web search, and web fetch through the same
  gateway and dashboard.
- Per-kind provider pages with live example testers.

## 0.26.0-beta (2026-09-02)

### Added — Token Saver
- RTK: tool-output compression (60–90% fewer input tokens on git/grep/ls/
  tree/log output).
- Headroom: external context-compression proxy integration.
- Caveman: telegraphic LLM-output compression (Lite / Full / Ultra).
- Ponytail: lazy-developer prompt compression (Lite / Full / Ultra).
- Guards: Loop Guard and per-account Semaphore concurrency limiting.

## 0.25.0-beta (2026-08-24)

### Added
- CLI Tools manager: one-screen configuration of coding-agent CLIs with
  live connection status and per-tool detail pages.
- MITM-based onboarding for providers that require traffic capture.

## 0.24.0-beta (2026-08-15)

### Added
- Combo strategies: fusion (parallel queries + synthesized answer) alongside
  fallback and round robin.
- Capacity adapters: automatically route around models lacking vision, audio,
  PDF, or video capability when the request needs it.
- Client presets and per-combo strategy/sticky/timeout settings.

## 0.23.0-beta (2026-08-06)

### Added
- Usage analytics: requests/tokens/cost charts, cached-token hit rate, and
  per-model/per-provider/per-account/per-key breakdowns.
- Quota tracker: per-provider used/limit bars with reset windows.
- Console log page with live-streaming gateway logs.

## 0.22.0-beta (2026-07-28)

### Added
- OAuth onboarding for coding-agent providers — no manual token handling.
- Free-tier provider support, including providers usable without any key.

### Fixed
- Free-tier sessions now negotiate per-session quotas correctly instead of
  being rejected upstream.

## 0.21.0-beta (2026-07-20)

### Added
- API keys with per-key ACLs (providers, combos, kinds, models) and machine
  binding.
- Remote access wizards: Cloudflare Tunnel and Tailscale.
- Dashboard login with signed sessions.

## 0.20.0-beta (2026-07-10)

### Added
- Multiple accounts per provider with priorities, per-account round robin,
  sticky routing, one-by-one health testing, and bulk import.
- Automatic fallback across accounts and providers on rate limits and errors.

## 0.19.0-beta (2026-07-02)

### Added
- Dashboard internationalization: 33 languages with automatic text
  translation.
- Dark / light / system themes.

## 0.18.0-beta (2026-06-24)

### Added
- Built-in basic chat client for trying models directly from the dashboard,
  with streaming and attachments.

## 0.17.0-beta (2026-06-16)

### Added
- Dual-protocol endpoint: OpenAI-compatible and Anthropic-compatible APIs on
  one base URL.
- Model aliasing and per-provider model catalogs.

## 0.16.0-beta (2026-06-08)

### Added
- First public beta: gateway core, provider registry, dashboard with
  provider/connection management, and request routing with retries.

## 0.1.0 (2026-05-28)

### Added
- Initial release: local-first AI request router with a single unified
  endpoint, SQLite-backed state, and a minimal dashboard.
