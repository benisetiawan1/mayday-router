import { SESSION_PIN_TTL_MS, SESSION_PIN_MAX } from "../config/runtimeConfig.js";

// Per-session upstream connection pinning. Keeps one client conversation on the
// same provider account across turns so the provider's prompt cache survives.
// Fail-open: every path no-ops on missing/invalid input, so a pin can never
// change the rotation the request would have had without it.
//
// pinKey identifies the conversation; we resolve it from an explicit
// session/conversation id (headers, then body), falling back to the client API
// key. Maps are in-memory only and lazily janitor'd on top of every access.

const pins = new Map(); // `${provider}\u0000${pinKey}` -> { connectionId, provider, pinKey, pinnedAt, lastHitAt }
const byConnection = new Map(); // connectionId -> Set<pinMapKey>

// Test hooks can shrink these; production values come from runtimeConfig.
let ttlMs = SESSION_PIN_TTL_MS;
let maxEntries = SESSION_PIN_MAX;

const SESSION_HEADER_KEYS = ["x-session-id", "session-id", "session_id", "x-amp-thread-id", "x-claude-code-session-id"];
const SESSION_BODY_KEYS = ["session_id", "conversation_id", "prompt_cache_key"];

function mapKey(provider, pinKey) {
  return `${provider}\u0000${pinKey}`;
}

function normId(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v && v.length <= 256 ? v : null;
}

function dropPin(key) {
  const pin = pins.get(key);
  if (!pin) return;
  const set = byConnection.get(pin.connectionId);
  if (set) {
    set.delete(key);
    if (set.size === 0) byConnection.delete(pin.connectionId);
  }
  pins.delete(key);
}

// Evict pins stale past TTL, then enforce the hard cap (oldest lastHitAt first).
function janitor() {
  const t = Date.now();
  for (const [key, pin] of pins) {
    if (t - pin.lastHitAt > ttlMs) dropPin(key);
  }
  if (pins.size > maxEntries) {
    const excess = [...pins.values()]
      .sort((a, b) => a.lastHitAt - b.lastHitAt)
      .slice(0, pins.size - maxEntries);
    for (const pin of excess) dropPin(mapKey(pin.provider, pin.pinKey));
  }
}

export function pinConnection(provider, pinKey, connectionId) {
  try {
    if (!provider || !pinKey || !connectionId) return;
    janitor();
    const key = mapKey(provider, pinKey);
    const prev = pins.get(key);
    pins.set(key, { connectionId, provider, pinKey, pinnedAt: Date.now(), lastHitAt: Date.now() });
    let set = byConnection.get(connectionId);
    if (!set) {
      set = new Set();
      byConnection.set(connectionId, set);
    }
    set.add(key);
    if (prev && prev.connectionId !== connectionId) {
      const oldSet = byConnection.get(prev.connectionId);
      if (oldSet) {
        oldSet.delete(key);
        if (oldSet.size === 0) byConnection.delete(prev.connectionId);
      }
    }
  } catch {
    // fail open
  }
}

export function getPinnedConnection(provider, pinKey) {
  try {
    if (!provider || !pinKey) return null;
    janitor();
    const pin = pins.get(mapKey(provider, pinKey));
    if (!pin) return null;
    if (Date.now() - pin.lastHitAt > ttlMs) {
      dropPin(mapKey(pin.provider, pin.pinKey));
      return null;
    }
    pin.lastHitAt = Date.now();
    return pin.connectionId;
  } catch {
    return null;
  }
}

export function unpinConnection(connectionId) {
  try {
    if (!connectionId) return;
    const set = byConnection.get(connectionId);
    if (!set) return;
    for (const key of [...set]) pins.delete(key);
    byConnection.delete(connectionId);
  } catch {
    // fail open
  }
}

export function unpin(provider, pinKey) {
  try {
    if (!provider || !pinKey) return;
    dropPin(mapKey(provider, pinKey));
  } catch {
    // fail open
  }
}

// Resolve a conversation pinKey from request identity available at selection
// time: explicit session/conversation id (headers, then body), else the client
// API key. Returns null when nothing identifies the conversation — the caller
// then skips pinning and the request behaves like plain rotation.
export function resolvePinKey({ headers, body, apiKey } = {}) {
  try {
    const h = headers && typeof headers === "object" ? headers : {};
    for (const k of SESSION_HEADER_KEYS) {
      const v = normId(h[k] ?? h[k.toLowerCase()]);
      if (v) return v;
    }
    const b = body && typeof body === "object" ? body : null;
    if (b) {
      for (const k of SESSION_BODY_KEYS) {
        const v = normId(b[k]);
        if (v) return v;
      }
      const md = b.metadata && typeof b.metadata === "object" ? b.metadata : null;
      if (md) {
        const v = normId(md.session_id) || normId(md.user_id);
        if (v) return v;
      }
    }
    if (apiKey) return `k:${apiKey}`;
    return null;
  } catch {
    return null;
  }
}

// Test hooks: shrink TTL / cap and reset the store (mirrors clearSessionStore etc).
export function __setPinConfig(ttl, max) {
  if (typeof ttl === "number" && ttl > 0) ttlMs = ttl;
  if (typeof max === "number" && max > 0) maxEntries = max;
}

export function __resetPinner() {
  pins.clear();
  byConnection.clear();
  ttlMs = SESSION_PIN_TTL_MS;
  maxEntries = SESSION_PIN_MAX;
}