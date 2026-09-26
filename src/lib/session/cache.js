// Session-skill dedup cache. Metadata-only per session: which skill full-prompts
// have already been injected, so repeat turns downgrade to a short reminder
// instead of re-sending the whole prompt. Never stores message content.

const CAPACITY = 2000;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h — survives most restarts within a session

/** @type {Map<string, object>} */
const lru = new Map();

function evictExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, entry] of lru) {
    if (entry.lastSeenAt < cutoff) lru.delete(key);
  }
}

function getSession(sessionId) {
  const entry = lru.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.lastSeenAt > TTL_MS) {
    lru.delete(sessionId);
    return null;
  }
  lru.delete(sessionId);
  entry.lastSeenAt = Date.now();
  lru.set(sessionId, entry);
  return entry;
}

function setSession(sessionId, updates) {
  const existing = lru.get(sessionId) ?? { injectedSkillIds: [], lastSeenAt: 0 };
  const next = { ...existing, ...updates, lastSeenAt: Date.now() };
  if (lru.has(sessionId)) lru.delete(sessionId);
  lru.set(sessionId, next);
  if (lru.size > CAPACITY) {
    evictExpired();
    while (lru.size > CAPACITY) lru.delete(lru.keys().next().value);
  }
  return next;
}

/**
 * Record a skill's full prompt was injected; report whether it was seen before.
 * @param {string} sessionId
 * @param {string} skillId
 * @returns {boolean} true if already injected earlier in this session
 */
export function markSkillInjected(sessionId, skillId) {
  if (!sessionId || !skillId) return false;
  const entry = getSession(sessionId) ?? { injectedSkillIds: [], lastSeenAt: 0 };
  const injected = Array.isArray(entry.injectedSkillIds) ? entry.injectedSkillIds : [];
  const already = injected.includes(skillId);
  setSession(sessionId, { injectedSkillIds: already ? injected : [...injected, skillId] });
  return already;
}

export function cacheSize() {
  return lru.size;
}