# Changelog

All notable changes to Mayday Router are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

## 1.2.12-base (2026-10-30)

### Added
- Webshare.io proxy pool sync: accounts (API tokens, masked in the UI)
  sync their proxy list from the Webshare v2 API into the proxy pools
  registry — entries upserted with stable ids (no duplicates), user-set
  isActive/strictProxy preserved on update, stale entries removed only
  after a successful fetch. Sync runs on boot, daily, and on demand from
  the new "Webshare Sync" panel on the Proxy Pools page (add account /
  sync / deactivate / delete). Fail-open everywhere: unauthorized (401)
  accounts are flagged but keep their pools; failed syncs touch nothing.
  Multi-account supported, synced sequentially. Backbone/rotating mode is
  rejected as unsupported until its schema is documented.

## 1.2.11-base (2026-10-30)

### Fixed
- CodeBuddy intl gateway now requires X-Conversation-ID /
  X-Conversation-Request-ID / X-Conversation-Message-ID headers (HTTP 400
  code 11128 otherwise): the codebuddy-intl executor derives a stable
  conversation id (session key, else first user message, else random) plus
  fresh per-request ids, computed from the pre-transform body (port of
  VansRouter 2c7b252, adapted to the fork's executor flow).
- Usage dashboard quota race: stale responses from a previous provider
  filter can no longer overwrite the active one (latest-wins request
  tracker, no-store fetches), visible rows are scoped to the active filter,
  and the refresh guard no longer re-subscribes the auto-refresh effects
  (port of VansRouter f1d824b, adapted to the fork's ProviderLimits).

## 1.2.10-base (2026-10-29)

### Added
- Session connection pinning for chat requests: a conversation now reuses
  the same upstream connection (API key) across turns, so the provider-side
  prompt cache survives and long sessions stop paying full price for their
  prefix every turn. The pin clears when the connection dies (quota
  exhausted / cooldown / circuit breaker), so free-quota rotation continues
  exactly as before — pinning only removes the unnecessary switches. Pin
  key: the client's session/conversation id (request headers or body
  metadata), falling back to the client API key. TTL 2h idle, cap 5000,
  everything fail-open.

## 1.2.9-base (2026-10-29)

### Fixed
- Headroom compression for Claude conversations no longer round-trips the
  whole body through OpenAI: only text leaves are projected to the compress
  proxy and written back in place — native Claude PDF/document blocks,
  images, signed thinking, cache_control, and tool-result is_error flags
  are preserved byte-for-byte, tool pairing survives compression, and
  orphaned tool_result projections are pruned so the proxy never sees an
  invalid pair. All failures stay fail-open — body untouched (port of
  9router 86adae3, with the Kiro apply path generalized and shared).

## 1.2.8-base (2026-10-29)

### Fixed
- Combo streaming: a member whose stream ends without any content (e.g.
  Gemini MALFORMED_FUNCTION_CALL hidden inside a "successful" stream) now
  falls through to the next member instead of returning an empty answer;
  the peek is bounded (45s deadline, fail-open) and the replayed stream is
  byte-faithful — no chunk loss or duplication (port of 9router ca7b540).
- Forced-SSE→JSON responses for Claude-format clients now reuse the proper
  openai→claude message conversion — tool_use, thinking, and usage blocks
  survive, and finish_reason "length" maps to "max_tokens" (port of 9router
  1d4335d).
- OpenCode fingerprint: tool definitions colliding with the
  bash/glob/grep/read quartet adopt the canonical definition in place, so
  the free-tier gate sees exactly the tools it expects (port of 9router
  483c10f).

## 1.2.7-base (2026-10-29)

### Fixed
- Combo no longer ends on a request-scoped 4xx: validation/body-level errors
  from one member (e.g. invalid_parameter_error, "need a resolvable tool
  name") advance to the next member, and when every member rejects, the
  first real error is returned with its status. Account locking stays off
  (P39 no-lock preserved) (port of 9router 5cdcddf).
- Gemini tool schemas: multi-type unions pick the best single type by
  structural clues, and `items`/`properties`/`required` are pruned to
  satisfy Gemini protobuf type predicates — schemas from agentic clients no
  longer 400 on Gemini members (port of 9router 8db1f4a).
- Streamed tool_call fragments without an `id` get a synthesized stable id,
  and fingerprint-renamed tool names are restored on the openai→openai
  passthrough — strict clients no longer abort the tool loop (port of
  9router 95c9d03).

## 1.2.6-base (2026-10-29)

### Fixed
- Non-streaming responses carrying an SSE error body (HTTP 200 + error
  frame) are now rejected with the upstream status instead of returning an
  empty 200 "success" (port of 9router 56dbf46).
- role:"tool" messages containing image_url parts are converted to Claude
  image blocks — Anthropic no longer 400s on tool results with screenshots
  (port of 9router 9500965).
- Adaptive-thinking downgrade now reads the Haiku major version: Haiku 5.5
  keeps adaptive thinking on the Claude passthrough; only pre-5 haiku ids
  are downgraded (port of 9router 0ad0a72).
- Headroom "phantom savings" warnings now require BOTH messageBytes and
  bodyBytes to fail to shrink — tool-dominated bodies no longer trigger
  false warnings (port of 9router db81a8c).

## 1.2.5-base (2026-10-21)

### Fixed
- kimi-k3 400 "tool messages need a resolvable tool name" on combo requests
  (direct requests were unaffected): when the capacity adapter routed an
  oversized conversation to an adapter model, stripHistoryForContext dropped
  the middle of the history but kept the trailing tool replies — whose
  assistant tool_calls had just been cut away, orphaning them. The last
  assistant message is now kept together with its trailing run, so the cut
  can no longer orphan a tool reply. Root cause confirmed empirically
  against kimi-k3: an orphaned tool reply 400s; a resolvable id passes;
  `name` does not rescue; adjacency is not required; duplicates tolerated.

## 1.2.4-base (2026-10-21)

### Fixed
- Regression from 1.2.3: orphan-tool detection false-positived on real client
  history, so valid tool results were dropped from the request — the model
  lost its own tool context, looped, and confabulated ("The ls output is
  merged by an alias."). dropOrphanToolMessages is now UNWIRED from the
  translation pipeline entirely; pairing safety stays with the id remap
  (1.2.2), the P38 backfill, and the headroom compression guard (1.2.2),
  none of which touch valid messages.

## 1.2.3-base (2026-10-21)

### Fixed
- Regression from 1.2.2-base: orphaned tool replies were flattened into
  "[Tool result: ...]" assistant text, which models echoed as a bracket
  pattern at the end of every reply. Orphans are now removed outright
  (their referenced tool_call does not exist in the history, so the content
  was unreachable), and the removal runs BEFORE fixMissingToolResponses so
  any assistant tool_calls left unanswered get a backfilled empty tool
  reply — pairing stays valid for order-pairing providers.

## 1.2.2-base (2026-10-21)

### Fixed
- DashScope-family HTTP 400 ("tool messages need a resolvable tool name"):
  tool replies whose assistant tool_call went missing (client history, lossy
  translation) are now demoted to plain text before dispatch instead of being
  forwarded as orphans, and `ensureToolCallIds` remaps invalid ids on both
  sides of a pair to the SAME replacement id (previously each side generated
  a different one).
- Headroom compression: proxy responses that break tool_call↔tool pairing are
  rejected fail-open — the request body is left untouched, matching rtk's
  fail-open contract.
- Combo routing: each member (fallback loop and fusion panel) now gets its own
  copy of the request body, so in-place mutations written by a failed member
  (e.g. "[image omitted]" placeholders from a non-vision model) no longer leak
  into the next member's request; fusion panel calls also lose a
  parallel-mutation race.
- Custom-model delete: no longer falls back destructively; 404
  model-not-found no longer burns the whole credential pool.
- Updater: verifies the version actually changed before declaring success and
  refuses swapping onto the same running image.
- Dockerfile: `apk upgrade` failures no longer abort the image build.

## 1.2.1-base (2026-10-01)

### Fixed
- Update pill now appears without a manual page refresh (the version check
  re-runs every 5 minutes and whenever the window regains focus).
- Update dialog: tarball one-click now falls back to the manual flow when the
  release carries no downloadable bundle, instead of failing mid-update.
- Skills page: fixed a React hydration mismatch (the skill URL differed
  between server render and client hydration); the absolute URL now appears
  cleanly after mount.

### Added
- Status strip: the "Fallback events /24h" cell is back, now fed by real
  fallback hops recorded by the request router.

## 1.2.0-base (2026-10-01)

First **base release** — the Control Room UI, real-time usage live flow, and
the dashboard self-updater together mark the project's first stable baseline.

### Added — Update from the dashboard
- One-click updates from the topbar, for every install type:
  - **Tarball/direct installs** — downloads the release bundle, verifies
    SHA-256, swaps the app directory, and restarts itself. No rebuild, no
    terminal.
  - **Docker installs** (opt-in: `ENABLE_DOCKER_SELF_UPDATE=true` +
    `/var/run/docker.sock` mount) — the container drives its own replacement
    via the Docker API through a throwaway helper container, keeping its exact
    configuration (env, mounts, ports, networks, restart policy).
  - **npm/CLI installs** — the existing updater path.
- The update dialog shows a real per-stage progress tracker (download →
  verify → install → restart) driven by live server state, reconnects
  automatically, and confirms the new version before reloading.
- Safety: checksum verification before anything is touched, previous app
  directory kept for rollback (tarball path), old container removed only
  after the replacement is healthy (docker path), and the previous docker
  image is auto-pruned when untagged (tagged images stay as rollback).
- The manual install command shown to Docker users is generated from the
  running install's real configuration — no hardcoded names or ports.
- Release tarballs (`mayday-router-<version>-linux-x64.tar.gz` + `.sha256`)
  are attached to every GitHub release.

### Fixed
- Docker self-update no longer deadlocks on the port held by the running
  container (helper-container swap) and no longer fails on socket permissions
  when the entrypoint drops privileges.
- The update dialog now detects completion instead of sitting on "working".

## 0.33.0-beta (2026-10-01)

### Fixed — dashboard self-update
- Docker self-update now performs the swap in a throwaway helper container:
  the old container cannot stop itself mid-update (the replacement needs its
  port), which previously left the instance in a failed state.
- The container entrypoint keeps the docker socket's group when dropping to
  the unprivileged user, so the self-updater can actually reach the socket.
- The manual update command shown in the dialog is generated from the running
  install's real configuration (no hardcoded name/port), with a parameterized
  fallback when the docker socket isn't mounted.

## 0.32.0-beta (2026-09-30)

### Fixed — mobile UI
- Basic chat header: model selector, History, and Clear buttons now wrap and
  truncate correctly on narrow screens instead of overflowing off-canvas.
- Skills: the "Paste this to your AI" banner is compact on small screens, and
  the entry skill card uses a subtle accent outline instead of a heavy filled
  background.

## 0.31.0-beta (2026-09-30)

### Added — Docker self-update (path A)
- One-click dashboard updates for Docker installs: the running container
  drives its own replacement through the Docker API — pulls the new image,
  recreates itself with the captured configuration (env, mounts, ports,
  networks, restart policy), health-checks the replacement, then removes the
  old container. No rebuild or terminal access needed.
- Opt-in via `ENABLE_DOCKER_SELF_UPDATE=true` + mounting
  `/var/run/docker.sock` (documented; the socket is root-equivalent).
- Registry-first image pull with a local-image fallback, so self-update also
  works with images built on the host.
- The update modal now picks the strategy automatically by install mode
  (tarball / docker / npm) and reports per-stage progress.

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
