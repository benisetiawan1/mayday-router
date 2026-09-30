"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import ProviderTopology, { RequestFeed } from "@/app/(dashboard)/dashboard/usage/components/ProviderTopology";
import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";

// Skeleton placeholders sized to match the final content so the layout does
// not shift (CLS) when data arrives. Keep dimensions in sync with the real
// components they replace.
const overviewSkeleton = (
  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-24 w-full animate-pulse rounded-lg border border-border bg-bg-subtle/50" aria-hidden="true" />
    ))}
  </div>
);

const topologySkeleton = (
  <div className="h-40 w-full animate-pulse rounded-lg border border-border bg-bg-subtle/50 sm:h-48" aria-hidden="true" />
);

const chartSkeleton = (
  <div className="h-[220px] w-full animate-pulse rounded-lg border border-border bg-bg-subtle/50" aria-hidden="true" />
);

const tableSkeleton = (
  <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-bg-subtle/50" aria-hidden="true" />
);

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // ponytail: cost split is a token-share allocation of the (rate-accurate)
      // server total, not a per-rate recompute. cached is a subset of prompt, so
      // peel it out of the input share. Upgrade to a stored per-component cost
      // breakdown if exact cached-rate cost display is needed.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return { ...data, key, totalTokens, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: {
          requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0,
          totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0,
          lastUsed: null, pending: 0,
          provider: null, rawModel: null, keyName: null, endpoint: null
        },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }

    const trackUnique = (field) => {
      if (s[field] === null) {
        s[field] = item[field] || undefined;
      } else if (s[field] !== undefined && s[field] !== item[field]) {
        s[field] = undefined;
      }
    };
    trackUnique("provider");
    trackUnique("rawModel");
    trackUnique("keyName");
    trackUnique("endpoint");

    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "accountName", label: "Account" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

function PeriodSelector({ period, setPeriod, fetching }) {
  return (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button type="button"
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
          )}
        </div>
  );
}


export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const [stats, setStats] = useState(null);
  const [loadState, setLoadState] = useState({ loading: true, fetching: false });
  const loading = loadState.loading;
  const fetching = loadState.fetching;
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  // Pause feed (live-flow panel): freezes only liveRequests/liveFeed/activeRequests
  const [feedPaused, setFeedPaused] = useState(false);
  const feedPausedRef = useRef(false);
  useEffect(() => { feedPausedRef.current = feedPaused; }, [feedPaused]);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Top providers for the current period (real aggregates)
  const topProviders = useMemo(() => {
    const bp = stats?.byProvider || {};
    return Object.entries(bp)
      .filter(([, d]) => (d?.requests || 0) > 0)
      .sort((a, b) => (b[1].requests || 0) - (a[1].requests || 0))
      .slice(0, 8);
  }, [stats?.byProvider]);
  const totalProviderRequests = useMemo(
    () => topProviders.reduce((s, [, d]) => s + (d.requests || 0), 0),
    [topProviders]
  );
  const labelFromProviderKey = (key) => AI_PROVIDERS[key]?.name || key;
  // Fetch connected providers once, deduplicate by provider type
  // Always include noAuth free providers (e.g. opencode) regardless of connections
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/providers", { signal: controller.signal }).then((r) => r.ok ? r.json() : null),
      fetch("/api/provider-nodes", { signal: controller.signal }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([d, nodesData]) => {
        if (controller.signal.aborted) return;
        // Build node name lookup for custom providers
        const nodeNameMap = {};
        for (const node of (nodesData?.nodes || [])) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || []).reduce((acc, c) => {
          if (c.isActive === false || !isLLMProvider(c.provider) || seen.has(c.provider)) return acc;
          seen.add(c.provider);
          acc.push({ ...c, nodeName: nodeNameMap[c.provider] || null });
          return acc;
        }, []);
        const noAuthProviders = Object.values(FREE_PROVIDERS).reduce((acc, p) => {
          if (p.noAuth && !seen.has(p.id) && isLLMProvider(p.id)) acc.push({ provider: p.id, name: p.name });
          return acc;
        }, []);
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoadState({ loading: true, fetching: false });
    } else {
      setLoadState({ loading: false, fetching: true });
    }

    const controller = new AbortController();
    fetch(`/api/usage/stats?period=${period}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadState({ loading: false, fetching: false });
      });
    return () => controller.abort();
  }, [period]);
  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Always merge only real-time fields, never overwrite full stats from REST
        setStats((prev) => {
          if (!prev) return prev;
          // Pause feed: freeze only the live-flow fields; long-term stats keep updating
          const liveFields = feedPausedRef.current ? {} : {
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            liveRequests: data.liveRequests,
            liveFeed: data.liveFeed,
          };
          return {
            ...prev,
            ...liveFields,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoadState(prev => ({ ...prev, loading: false }));
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoadState(prev => ({ ...prev, loading: false }));

    return () => es.close();
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3">
                {group.summary.provider ? (
                  <Badge variant={group.summary.pending > 0 ? "primary" : "neutral"} size="sm">{group.summary.provider}</Badge>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3">
                {group.summary.rawModel ? (
                  <span className="font-medium text-text-main">{group.summary.rawModel}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3">
                {group.summary.provider ? (
                  <Badge variant={group.summary.pending > 0 ? "primary" : "neutral"} size="sm">{group.summary.provider}</Badge>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3">
                {group.summary.rawModel ? (
                  <span className="font-medium text-text-main">{group.summary.rawModel}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3">
                {group.summary.provider ? (
                  <Badge variant="neutral" size="sm">{group.summary.provider}</Badge>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3">
                {group.summary.rawModel ? (
                  <span className="font-medium text-text-main">{group.summary.rawModel}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3">
                {group.summary.provider ? (
                  <Badge variant="neutral" size="sm">{group.summary.provider}</Badge>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  return (
    <div className="flex min-w-0 flex-col">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && <PeriodSelector period={period} setPeriod={setPeriod} fetching={fetching} />}

      {/* LIVE · Active requests (v2.1 layout: live panel first) */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>LIVE</b> · Active requests — who is receiving & answering now</span>
          <div className="acts">
            <button type="button" className="btn ghost" onClick={() => setFeedPaused((v) => !v)}>
              {feedPaused ? "▶ Resume feed" : "⏸ Pause feed"}
            </button>
            <Link href="/dashboard/console-log" className="btn ghost">Open console log</Link>
          </div>
        </div>
        {loading ? topologySkeleton : (
          <ProviderTopology
            providers={providers}
            activeRequests={stats.activeRequests || []}
            recentRequests={stats.recentRequests || []}
            liveRequests={stats.liveRequests || []}
          />
        )}
      </div>

      {/* 02 · Requests + 03 · Top providers (v2.1 side-by-side grid) */}
      <div className="usage-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-head">
            <span className="t"><b>02</b> · Requests</span>
          </div>
          {loading ? chartSkeleton : <UsageChart period={period} />}
          {loading ? overviewSkeleton : <OverviewCards stats={stats} />}
        </div>
        {!loading && topProviders.length > 0 && (
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-head"><span className="t"><b>03</b> · Top providers</span></div>
            {topProviders.map(([key, d]) => (
              <div key={key} className="row" style={{ gridTemplateColumns: "1fr 110px 70px" }}>
                <span className="cr-name">{labelFromProviderKey(key)}</span>
                <span className="dim" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(d.requests || 0).toLocaleString("en-US")}</span>
                <span className="faint" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totalProviderRequests > 0 ? Math.round((100 * (d.requests || 0)) / totalProviderRequests) : 0}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 04 · Request feed (v2.1 log lines) */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>04</b> · Request feed</span>
          <div className="acts"><span className="tag">{(stats?.liveFeed || []).length > 0 ? `${(stats?.liveFeed || []).length} recent · live` : "retained"}</span></div>
        </div>
        {loading ? null : (
          <RequestFeed
            liveFeed={stats.liveFeed || []}
            recentRequests={stats.recentRequests || []}
          />
        )}
      </div>

      {/* Recent requests feed lives inside the live-flow panel (merged, single list) */}

      {/* Usage breakdown table */}
      <div className="panel">
        <div className="panel-head">
          <select
            value={tableView}
            onChange={(e) => setTableView(e.target.value)}
            className="inp"
            style={{ width: "auto", height: 26, padding: "0 6px" }}
          >
            {TABLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="acts">
            <div className="seg">
              <button type="button"
                onClick={() => setViewMode("costs")}
                className={viewMode === "costs" ? "on" : ""}
              >
                Costs
              </button>
              <button type="button"
                onClick={() => setViewMode("tokens")}
                className={viewMode === "tokens" ? "on" : ""}
              >
                Tokens
              </button>
            </div>
          </div>
        </div>
        {loading ? tableSkeleton : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
