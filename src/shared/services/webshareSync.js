// Webshare.io proxy-pool sync.
//
// Pure mapping/orchestration with dependency injection so the core is testable
// without a DB or network (inject `deps` in tests). The default deps wire it to
// the SQLite proxy-pools repo and the kv account store via lazy `@/` imports, so
// loading this module never resolves those aliases until a real sync runs.
//
// Fail-open everywhere: any fetch/parse failure leaves current pools untouched
// and only records an account status; the scheduler and syncAll never throw.

import { randomUUID } from "node:crypto";

const LIST_BASE = "https://proxy.webshare.io/api/v2/proxy/list/";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DAILY_MS = 24 * 60 * 60 * 1000;
const SCOPE = "webshareSync";
const ACCOUNT_KEY_PREFIX = "account:";

export function maskToken(token) {
  const t = String(token || "");
  if (!t) return "";
  if (t.length <= 6) return `${t[0]}…${t[t.length - 1]}`;
  return `${t.slice(0, 3)}…${t.slice(-3)}`;
}

export function buildListUrl(page) {
  return `${LIST_BASE}?mode=direct&page=${page}&page_size=${PAGE_SIZE}`;
}

export function maskError(message) {
  return String(message ?? "").slice(0, 200);
}

export function mapResultToPool(accountId, result) {
  if (!result || typeof result !== "object") return null;
  const { id, username, password, proxy_address: address, port } = result;
  if (!id || !address || !port) return null;

  const country = result.country_code || "";
  const city = result.city_name || "";
  const name = country && city
    ? `Webshare ${country} ${city}`
    : `Webshare ${address}:${port}`;

  return {
    id: `ws-${accountId}-${id}`,
    name,
    proxyUrl: `http://${encodeURIComponent(username || "")}:${encodeURIComponent(password || "")}@${address}:${port}`,
    noProxy: "",
    type: "http",
    isActive: true,
    strictProxy: false,
    testStatus: "unknown",
  };
}

function accountKey(id) {
  return `${ACCOUNT_KEY_PREFIX}${id}`;
}

export async function listAccounts(deps = createDefaultDeps()) {
  const all = await deps.kv.getAll();
  const out = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(ACCOUNT_KEY_PREFIX) && value && typeof value === "object") {
      out.push({ ...value, id: value.id || key.slice(ACCOUNT_KEY_PREFIX.length) });
    }
  }
  out.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return out;
}

export async function getAccount(id, deps = createDefaultDeps()) {
  return deps.kv.get(accountKey(id), null);
}

export async function createAccount(data, deps = createDefaultDeps()) {
  const token = typeof data?.token === "string" ? data.token.trim() : "";
  if (!token) throw new Error("Token is required");
  const now = new Date().toISOString();
  const account = {
    id: randomUUID(),
    name: typeof data?.name === "string" ? data.name.trim() : "",
    token,
    mode: data?.mode === "backbone" ? "backbone" : "direct",
    countryCodeIn: typeof data?.countryCodeIn === "string" ? data.countryCodeIn.trim() : null,
    isActive: data?.isActive !== false,
    createdAt: now,
    lastSyncAt: null,
    lastStatus: "never",
    lastError: null,
    lastCount: null,
  };
  await deps.kv.set(accountKey(account.id), account);
  return account;
}

export async function updateAccount(id, patch, deps = createDefaultDeps()) {
  const account = await getAccount(id, deps);
  if (!account) return null;
  const merged = { ...account, id };
  if (patch.name !== undefined) merged.name = patch.name;
  if (patch.token !== undefined) merged.token = patch.token;
  if (patch.mode !== undefined) merged.mode = patch.mode;
  if (patch.countryCodeIn !== undefined) merged.countryCodeIn = patch.countryCodeIn || null;
  if (patch.isActive !== undefined) merged.isActive = patch.isActive === true;
  await deps.kv.set(accountKey(id), merged);
  return merged;
}

export async function deleteAccount(id, deps = createDefaultDeps()) {
  const account = await getAccount(id, deps);
  if (!account) return false;
  const prefix = `ws-${id}-`;
  const pools = await deps.listPools();
  for (const pool of pools) {
    if (pool.id.startsWith(prefix)) await deps.deletePool(pool.id);
  }
  await deps.kv.remove(accountKey(id));
  return true;
}

async function updateAccountStatus(account, fields, deps) {
  const current = await deps.kv.get(accountKey(account.id), null);
  const base = current && typeof current === "object" ? current : account;
  const merged = { ...base, id: account.id };
  merged.lastSyncAt = new Date().toISOString();
  if (fields.lastStatus !== undefined) merged.lastStatus = fields.lastStatus;
  if (fields.lastError !== undefined) merged.lastError = fields.lastError ?? null;
  if (fields.lastCount !== undefined) merged.lastCount = fields.lastCount;
  await deps.kv.set(accountKey(account.id), merged);
}

export async function syncAccount(account, deps = createDefaultDeps()) {
  const id = account?.id;
  const token = account?.token;
  if (!id || !token) {
    return { id, status: "error", error: "Missing id or token" };
  }
  if ((account.mode || "direct") !== "direct") {
    await updateAccountStatus(account, { lastStatus: "error", lastError: "mode backbone not supported yet" }, deps);
    return { id, status: "error", error: "mode backbone not supported yet" };
  }

  const seen = new Map();
  let url = buildListUrl(1);
  let pages = 0;
  let failure = null;

  while (url && pages < MAX_PAGES) {
    pages += 1;
    let res;
    try {
      res = await deps.fetch(url, { headers: { Authorization: `Token ${token}` } });
    } catch (e) {
      failure = { status: "error", error: `Network error: ${maskError(e?.message)}` };
      break;
    }

    if (res.status === 401 || res.status === 403) {
      failure = { status: "unauthorized", error: `HTTP ${res.status}` };
      break;
    }
    if (res.status === 429) {
      failure = { status: "error", error: "Rate limited (429); wait 60s" };
      break;
    }
    if (!res.ok) {
      failure = { status: "error", error: `HTTP ${res.status}` };
      break;
    }

    let data;
    try {
      data = await res.json();
    } catch {
      failure = { status: "error", error: "Unparseable response" };
      break;
    }
    const results = data?.results;
    if (!Array.isArray(results)) {
      failure = { status: "error", error: "Unparseable response" };
      break;
    }

    for (const r of results) {
      const entry = mapResultToPool(id, r);
      if (entry) seen.set(entry.id, entry);
    }
    url = typeof data?.next === "string" && data.next ? data.next : null;
  }

  if (!failure && url) {
    failure = { status: "error", error: `Sync capped at ${MAX_PAGES} pages` };
  }

  if (failure) {
    await updateAccountStatus(
      account,
      failure.status === "unauthorized"
        ? { lastStatus: "unauthorized", lastError: failure.error }
        : { lastStatus: "error", lastError: failure.error },
      deps
    );
    return { id, status: failure.status, error: failure.error };
  }

  try {
    for (const entry of seen.values()) {
      const existing = await deps.getPool(entry.id);
      if (existing) {
        // Preserve the user's isActive/strictProxy; only refresh identity fields.
        await deps.updatePool(entry.id, { proxyUrl: entry.proxyUrl, name: entry.name });
      } else {
        await deps.createPool(entry);
      }
    }

    const prefix = `ws-${id}-`;
    const pools = await deps.listPools();
    for (const pool of pools) {
      if (pool.id.startsWith(prefix) && !seen.has(pool.id)) {
        await deps.deletePool(pool.id);
      }
    }
  } catch (e) {
    await updateAccountStatus(account, { lastStatus: "error", lastError: maskError(e?.message) }, deps);
    return { id, status: "error", error: maskError(e?.message) };
  }

  await updateAccountStatus(account, { lastStatus: "ok", lastError: null, lastCount: seen.size }, deps);
  return { id, status: "ok", count: seen.size };
}

export async function syncAll(deps = createDefaultDeps()) {
  const accounts = await listAccounts(deps);
  const results = [];
  for (const account of accounts) {
    if (account.isActive === false) continue;
    try {
      results.push(await syncAccount(account, deps));
    } catch (e) {
      results.push({ id: account.id, status: "error", error: maskError(e?.message) });
    }
  }
  return results;
}

export function createDefaultDeps() {
  let kvCache = null;
  const getKv = async () => {
    if (kvCache) return kvCache;
    const { makeKv } = await import("@/lib/db/helpers/kvStore.js");
    kvCache = makeKv(SCOPE);
    return kvCache;
  };
  return {
    fetch: (...args) => globalThis.fetch(...args),
    getPool: async (id) => (await import("@/lib/db/index.js")).getProxyPoolById(id),
    createPool: async (entry) => (await import("@/lib/db/index.js")).createProxyPool(entry),
    updatePool: async (id, patch) => (await import("@/lib/db/index.js")).updateProxyPool(id, patch),
    listPools: async () => (await import("@/lib/db/index.js")).getProxyPools(),
    deletePool: async (id) => (await import("@/lib/db/index.js")).deleteProxyPool(id),
    kv: {
      get: async (key, fallback) => (await getKv()).get(key, fallback),
      getAll: async () => (await getKv()).getAll(),
      set: async (key, value) => (await getKv()).set(key, value),
      remove: async (key) => (await getKv()).remove(key),
    },
  };
}

// ─── Scheduler (mirrors quotaAutoPing) ──────────────────────────────────────

const g = globalThis.__webshareSync ??= { interval: null, running: false };

async function runSyncAllSafe() {
  if (g.running) return;
  g.running = true;
  try {
    await syncAll();
  } catch (e) {
    console.warn("[WebshareSync] tick failed:", e?.message || e);
  } finally {
    g.running = false;
  }
}

export function startWebshareSync() {
  if (g.interval) return;
  console.log("[WebshareSync] scheduler started");
  runSyncAllSafe().catch(() => {});
  g.interval = setInterval(() => { runSyncAllSafe().catch(() => {}); }, DAILY_MS);
  if (g.interval.unref) g.interval.unref();
}

export function stopWebshareSync() {
  if (!g.interval) return;
  clearInterval(g.interval);
  g.interval = null;
  console.log("[WebshareSync] scheduler stopped");
}