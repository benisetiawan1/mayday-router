import { statsEmitter } from "./db/repos/usageRepo.js";

// Live per-request registry for the usage "LIVE FLOW" panel.
// Every entry corresponds to ONE real in-flight (or just-finished) chat
// request. Phases are driven by real pipeline events only:
//   received → routed → streaming → done | error | aborted
// No synthetic/template animation data — the UI animates strictly from these.

const MAX_ENTRIES = 60;
const DONE_TTL_MS = 1600; // keep finished rows briefly so the UI can show DONE
const STALE_MS = 180_000; // safety net for orphaned entries (crashed streams)

// globalThis so Next dev hot-reload doesn't reset the registry
if (!global._liveRequests) {
  global._liveRequests = new Map();
}
const live = global._liveRequests;

// rolling 24h log of real fallback hops (process-lifetime, in-memory)
if (!global._fallbackLog) {
  global._fallbackLog = [];
}
const fallbackLog = global._fallbackLog;

// Real event feed (v2.1-style log lines): completed requests with their true
// duration + tokens, and fallback hops. No synthetic entries ever.
const FEED_CAP = 40;
if (!global._liveFeed) {
  global._liveFeed = [];
}
const feed = global._liveFeed;

function pushFeed(entry) {
  feed.unshift(entry);
  if (feed.length > FEED_CAP) feed.length = FEED_CAP;
}

function emit() {
  try {
    statsEmitter.emit("pending");
  } catch {}
}

function sweep(now = Date.now()) {
  for (const [id, r] of live) {
    if ((r.phase === "done" || r.phase === "error" || r.phase === "aborted") && now - r.updatedAt > DONE_TTL_MS) {
      live.delete(id);
    } else if (now - r.updatedAt > STALE_MS) {
      live.delete(id);
    }
  }
}

export function liveStart({ id, model, provider, combo = null }) {
  if (!id || !model) return;
  live.set(id, {
    id,
    model,
    provider: provider || "",
    combo,
    account: null,
    connectionId: null,
    phase: "received",
    fallbackFrom: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    chunks: 0,
    bytes: 0,
    tokensOut: 0, // provider-reported usage when streamed; stays 0 otherwise
    status: null,
  });
  if (live.size > MAX_ENTRIES) {
    const first = live.keys().next().value;
    live.delete(first);
  }
  emit();
}

export function liveRouted(id, { account, connectionId }) {
  const r = live.get(id);
  if (!r) return;
  // A re-route after a recorded fallback = one real fallback hop completed.
  if (r.fallbackFrom && !r.fallbackFrom.recorded) {
    r.fallbackFrom.recorded = true;
    pushFeed({
      kind: "fallback",
      ts: Date.now(),
      provider: r.provider,
      from: r.fallbackFrom.account,
      status: r.fallbackFrom.status,
      to: account || null,
    });
  }
  r.phase = "routed";
  r.account = account || null;
  r.connectionId = connectionId || null;
  r.updatedAt = Date.now();
  emit();
}

export function liveStreaming(id) {
  const r = live.get(id);
  if (!r || r.phase === "streaming") return;
  r.phase = "streaming";
  r.updatedAt = Date.now();
  emit();
}

// Throttled by the caller cadence of stream chunks; each call is real progress.
let lastProgressEmit = 0;
export function liveProgress(id, { chunks, bytes, tokensOut }) {
  const r = live.get(id);
  if (!r) return;
  r.chunks = chunks;
  r.bytes = bytes;
  if (tokensOut) r.tokensOut = tokensOut;
  r.updatedAt = Date.now();
  const now = Date.now();
  if (now - lastProgressEmit > 400) {
    lastProgressEmit = now;
    emit();
  }
}

export function liveFallback(id, { fromAccount, status }) {
  const r = live.get(id);
  if (!r) return;
  fallbackLog.push(Date.now());
  r.fallbackFrom = { account: fromAccount || null, status: status || null };
  r.phase = "received"; // back to received while the router picks another account
  r.account = null;
  r.updatedAt = Date.now();
  emit();
}

export function liveEnd(id, { status = "ok", tokensIn = 0, tokensOut = 0 } = {}) {
  const r = live.get(id);
  if (!r) return;
  r.phase = status === "ok" ? "done" : status === "aborted" ? "aborted" : "error";
  r.status = status;
  if (tokensIn) r.tokensIn = tokensIn;
  if (tokensOut) r.tokensOut = tokensOut;
  r.updatedAt = Date.now();
  // Feed line with the request's real measured duration
  pushFeed({
    kind: status === "ok" ? "complete" : status === "aborted" ? "aborted" : "error",
    ts: r.updatedAt,
    provider: r.provider,
    model: r.model,
    ms: r.updatedAt - r.startedAt,
    tokensIn: r.tokensIn || tokensIn || 0,
    tokensOut: r.tokensOut || 0,
    bytes: r.bytes || 0,
  });
  emit();
}

export function getLiveFeed() {
  return feed.slice(0, FEED_CAP);
}

export function getFallbackEvents24h() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (fallbackLog.length && fallbackLog[0] < cutoff) fallbackLog.shift();
  return fallbackLog.length;
}

export function getLiveRequests() {
  sweep();
  return Array.from(live.values()).sort((a, b) => b.startedAt - a.startedAt);
}

// Wrap a (possibly streaming) Response so real progress is recorded as bytes
// actually flow to the client: first chunk flips the phase to "streaming",
// provider-reported `completion_tokens` (when present in an SSE chunk) is
// captured verbatim — never estimated — and stream close marks the request
// done. The stream itself passes through untouched.
export function instrumentResponseStream(response, id) {
  const body = response?.body;
  if (!body || typeof body.pipeThrough !== "function") {
    liveEnd(id, { status: "ok" });
    return response;
  }
  const dec = new TextDecoder();
  let chunks = 0;
  let bytes = 0;
  let tokensOut = 0;
  let tokensIn = 0;
  let firstChunkSeen = false;
  const ts = new TransformStream({
    transform(chunk, controller) {
      chunks++;
      bytes += chunk?.byteLength || 0;
      if (!firstChunkSeen) {
        firstChunkSeen = true;
        liveStreaming(id);
      }
      try {
        const text = dec.decode(chunk, { stream: true });
        // provider-reported usage, captured verbatim from the SSE usage chunk
        const mo = text.match(/"completion_tokens"\s*:\s*(\d+)/);
        if (mo) tokensOut = parseInt(mo[1], 10);
        const mi = text.match(/"prompt_tokens"\s*:\s*(\d+)/);
        if (mi) tokensIn = parseInt(mi[1], 10);
      } catch {}
      liveProgress(id, { chunks, bytes, tokensOut });
      controller.enqueue(chunk);
    },
    flush() {
      liveEnd(id, { status: "ok", tokensIn, tokensOut });
    },
    cancel() {
      liveEnd(id, { status: "aborted" });
    },
  });
  return new Response(body.pipeThrough(ts), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
