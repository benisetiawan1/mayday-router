import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapResultToPool,
  maskToken,
  syncAccount,
  syncAll,
} from "../src/shared/services/webshareSync.js";

function makeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function makeDeps({ fetchMock, initialPools = [], kv = {} }) {
  const pools = new Map(initialPools.map((p) => [p.id, { ...p }]));
  const store = new Map(Object.entries(kv).map(([k, v]) => [k, structuredClone(v)]));
  const calls = { fetches: [], creates: [], updates: [], deletes: [] };
  const deps = {
    fetch: async (url, opts) => {
      calls.fetches.push({ url, opts });
      return fetchMock(url, opts);
    },
    getPool: async (id) => (pools.has(id) ? { ...pools.get(id) } : null),
    createPool: async (entry) => {
      calls.creates.push({ ...entry });
      pools.set(entry.id, { ...entry, createdAt: "now", updatedAt: "now" });
      return { ...entry };
    },
    updatePool: async (id, patch) => {
      calls.updates.push({ id, ...patch });
      const p = pools.get(id);
      if (p) Object.assign(p, patch, { updatedAt: "now" });
      return p ? { ...p } : null;
    },
    listPools: async () => [...pools.values()].map((p) => ({ ...p })),
    deletePool: async (id) => {
      calls.deletes.push(id);
      return pools.delete(id);
    },
    kv: {
      get: async (key, fallback) => (store.has(key) ? structuredClone(store.get(key)) : fallback ?? null),
      getAll: async () => {
        const out = {};
        for (const [k, v] of store) out[k] = structuredClone(v);
        return out;
      },
      set: async (key, value) => { store.set(key, structuredClone(value)); },
      remove: async (key) => { store.delete(key); },
    },
  };
  return { deps, calls, pools, store };
}

const ACCOUNT = { id: "acc1", token: "tok", mode: "direct" };

test("maskToken masks a full token", () => {
  assert.equal(maskToken("abcdefghi"), "abc…ghi");
  assert.equal(maskToken("ab"), "a…b");
  assert.equal(maskToken(""), "");
});

test("mapResultToPool encodes credentials and builds a stable id/name", () => {
  const entry = mapResultToPool("acc1", {
    id: "d-10513",
    username: "user name",
    password: "p@ss:w/rd",
    proxy_address: "1.2.3.4",
    port: 1234,
    country_code: "US",
    city_name: "New York",
    valid: true,
  });
  assert.equal(entry.id, "ws-acc1-d-10513");
  assert.equal(entry.name, "Webshare US New York");
  assert.equal(entry.proxyUrl, "http://user%20name:p%40ss%3Aw%2Frd@1.2.3.4:1234");
  assert.equal(entry.type, "http");
  assert.equal(entry.isActive, true);
  assert.equal(entry.strictProxy, false);
  assert.equal(entry.testStatus, "unknown");
});

test("mapResultToPool falls back to address:port when no city", () => {
  const entry = mapResultToPool("acc1", {
    id: "d-2",
    username: "u",
    password: "p",
    proxy_address: "9.9.9.9",
    port: 80,
  });
  assert.equal(entry.name, "Webshare 9.9.9.9:80");
});

test("pagination follows next and upserts both pages", async () => {
  const pages = [
    makeResponse(200, {
      count: 2,
      next: "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=2&page_size=100",
      previous: null,
      results: [{ id: "d-1", username: "u1", password: "p1", proxy_address: "1.1.1.1", port: 1, country_code: "US", city_name: "A" }],
    }),
    makeResponse(200, {
      count: 2,
      next: null,
      previous: "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100",
      results: [{ id: "d-2", username: "u2", password: "p2", proxy_address: "2.2.2.2", port: 2, country_code: "US", city_name: "B" }],
    }),
  ];
  const fetchMock = async () => pages.shift();
  const { deps, calls, store } = makeDeps({ fetchMock });

  const result = await syncAccount(ACCOUNT, deps);

  assert.equal(result.status, "ok");
  assert.equal(result.count, 2);
  assert.equal(calls.creates.length, 2);
  assert.equal(calls.fetches.length, 2);
  assert.equal(calls.fetches[0].url.includes("page=1"), true);
  assert.equal(calls.fetches[1].url.includes("page=2"), true);
  assert.equal(store.get("account:acc1").lastStatus, "ok");
  assert.equal(store.get("account:acc1").lastCount, 2);
});

test("upsert preserves user isActive=false while refreshing proxyUrl", async () => {
  const fetchMock = async () => makeResponse(200, {
    count: 1,
    next: null,
    results: [{ id: "d-1", username: "u", password: "p", proxy_address: "3.3.3.3", port: 3 }],
  });
  const { deps, calls, pools } = makeDeps({
    fetchMock,
    initialPools: [{
      id: "ws-acc1-d-1",
      name: "Webshare old",
      proxyUrl: "http://old@3.3.3.3:3",
      isActive: false,
      strictProxy: true,
    }],
  });

  await syncAccount(ACCOUNT, deps);

  const pool = pools.get("ws-acc1-d-1");
  assert.equal(pool.isActive, false);
  assert.equal(pool.strictProxy, true);
  assert.equal(pool.proxyUrl, "http://u:p@3.3.3.3:3");
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].isActive, undefined);
  assert.equal(calls.updates[0].strictProxy, undefined);
});

test("fetch rejection aborts sync without deleting and marks account error", async () => {
  const fetchMock = async () => { throw new Error("network down"); };
  const { deps, calls, store } = makeDeps({
    fetchMock,
    initialPools: [{ id: "ws-acc1-d-1", name: "x", proxyUrl: "http://u:p@1.1.1.1:1", isActive: true }],
  });

  const result = await syncAccount(ACCOUNT, deps);

  assert.equal(result.status, "error");
  assert.equal(calls.deletes.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(store.get("account:acc1").lastStatus, "error");
});

test("429 and 5xx abort sync without deleting", async () => {
  for (const status of [429, 500]) {
    const fetchMock = async () => makeResponse(status, {});
    const { deps, calls, store } = makeDeps({
      fetchMock,
      initialPools: [{ id: "ws-acc1-d-1", name: "x", proxyUrl: "http://u:p@1.1.1.1:1", isActive: true }],
    });
    const result = await syncAccount(ACCOUNT, deps);
    assert.equal(result.status, "error", `status ${status}`);
    assert.equal(calls.deletes.length, 0);
    assert.equal(store.get("account:acc1").lastStatus, "error");
  }
});

test("401 marks account unauthorized and keeps pools", async () => {
  const fetchMock = async () => makeResponse(401, {});
  const { deps, calls, store, pools } = makeDeps({
    fetchMock,
    initialPools: [{ id: "ws-acc1-d-1", name: "x", proxyUrl: "http://u:p@1.1.1.1:1", isActive: true }],
  });

  const result = await syncAccount(ACCOUNT, deps);

  assert.equal(result.status, "unauthorized");
  assert.equal(store.get("account:acc1").lastStatus, "unauthorized");
  assert.equal(calls.deletes.length, 0);
  assert.equal(pools.has("ws-acc1-d-1"), true);
});

test("successful sync removes stale ws- entries but not non-ws pools", async () => {
  const fetchMock = async () => makeResponse(200, {
    count: 1,
    next: null,
    results: [{ id: "d-1", username: "u", password: "p", proxy_address: "4.4.4.4", port: 4 }],
  });
  const { deps, calls, pools } = makeDeps({
    fetchMock,
    initialPools: [
      { id: "ws-acc1-d-1", name: "keep", proxyUrl: "http://u:p@4.4.4.4:4", isActive: true },
      { id: "ws-acc1-d-Old", name: "stale", proxyUrl: "http://u:p@5.5.5.5:5", isActive: true },
      { id: "custom-1", name: "manual", proxyUrl: "http://u:p@6.6.6.6:6", isActive: true },
    ],
  });

  await syncAccount(ACCOUNT, deps);

  assert.ok(calls.deletes.includes("ws-acc1-d-Old"));
  assert.ok(!calls.deletes.includes("ws-acc1-d-1"));
  assert.ok(!calls.deletes.includes("custom-1"));
  assert.equal(pools.has("custom-1"), true);
  assert.equal(pools.has("ws-acc1-d-1"), true);
});

test("backbone mode fails open with a clear account error", async () => {
  let fetched = false;
  const fetchMock = async () => { fetched = true; return makeResponse(200, { results: [] }); };
  const { deps, store } = makeDeps({ fetchMock });

  const result = await syncAccount({ id: "acc1", token: "tok", mode: "backbone" }, deps);

  assert.equal(result.status, "error");
  assert.equal(fetched, false);
  assert.equal(store.get("account:acc1").lastStatus, "error");
  assert.match(store.get("account:acc1").lastError, /backbone not supported/);
});

test("syncAll runs sequentially and skips inactive accounts", async () => {
  const order = [];
  const fetchMock = async (url) => {
    order.push(url);
    return makeResponse(200, { count: 0, next: null, results: [] });
  };
  const { deps } = makeDeps({
    fetchMock,
    kv: {
      "account:1": { id: "1", token: "t", mode: "direct", isActive: true },
      "account:2": { id: "2", token: "t", mode: "direct", isActive: false },
      "account:3": { id: "3", token: "t", mode: "direct", isActive: true },
    },
  });

  const results = await syncAll(deps);

  assert.equal(order.length, 2);
  assert.equal(results.length, 2);
});