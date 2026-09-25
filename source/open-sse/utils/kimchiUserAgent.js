const DEFAULT_VERSION = "0.1.58";
const RELEASE_URL = "https://api.github.com/repos/getkimchi/kimchi/releases/latest";
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const STATE_KEY = "__9routerKimchiUserAgent";

const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {
  value: `kimchi/${DEFAULT_VERSION}`,
  fetchedAt: 0,
  promise: null,
});

function parseVersion(tag) {
  const match = String(tag || "").match(/^v?(\d+\.\d+\.\d+)$/);
  return match ? `kimchi/${match[1]}` : null;
}

export function getKimchiUserAgent() {
  if (!state.promise && Date.now() - state.fetchedAt >= CACHE_TTL_MS) {
    void refreshKimchiUserAgent();
  }
  return state.value;
}

export async function refreshKimchiUserAgent(fetcher = globalThis.fetch, { force = false } = {}) {
  if (typeof fetcher !== "function") return state.value;
  if (state.promise) return state.promise;
  if (!force && Date.now() - state.fetchedAt < CACHE_TTL_MS) return state.value;

  state.promise = (async () => {
    try {
      const response = await fetcher(RELEASE_URL, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = await response.json();
        const version = parseVersion(data?.tag_name);
        if (version) state.value = version;
      }
    } catch {
      // Keep the last known version. The deterministic fallback remains usable offline.
    } finally {
      state.fetchedAt = Date.now();
      state.promise = null;
    }
    return state.value;
  })();

  return state.promise;
}

export { DEFAULT_VERSION, RELEASE_URL };
