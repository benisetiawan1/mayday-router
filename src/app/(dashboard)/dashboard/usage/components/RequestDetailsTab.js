"use client";

import { useState, useEffect } from "react";
import Button from "@/shared/components/Button";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

let providerNameCache = null;
let providerNodesCache = null;

async function fetchProviderNames() {
  if (providerNameCache && providerNodesCache) {
    return { providerNameCache, providerNodesCache };
  }

  const nodesRes = await fetch("/api/provider-nodes");
  const nodesData = await nodesRes.json();
  const nodes = nodesData.nodes || [];
  providerNodesCache = {};

  for (const node of nodes) {
    providerNodesCache[node.id] = node.name;
  }

  providerNameCache = {
    ...AI_PROVIDERS,
    ...providerNodesCache
  };

  return { providerNameCache, providerNodesCache };
}

function getProviderName(providerId, cache) {
  if (!providerId) return providerId;
  if (!cache) return providerId;

  const cached = cache[providerId];

  if (typeof cached === 'string') {
    return cached;
  }

  if (cached?.name) {
    return cached.name;
  }

  const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return providerConfig?.name || providerId;
}

function CollapsibleSection({ title, children, defaultOpen = false, icon = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-black/5 dark:border-white/5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>}
          <span className="font-semibold text-sm text-text-main">{title}</span>
        </div>
        <span className={cn(
          "material-symbols-outlined text-[20px] text-text-muted transition-transform duration-200",
          isOpen ? "rotate-90" : ""
        )}>
          chevron_right
        </span>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-black/5 dark:border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

function getInputTokens(tokens) {
  if (!tokens) return 0;
  if (tokens.prompt_tokens !== undefined) {
    const prompt = Number(tokens.prompt_tokens) || 0;
    const cache = Number(tokens.cached_tokens || tokens.cache_read_input_tokens) || 0;
    return prompt < cache ? prompt + cache : prompt;
  }
  const input = Number(tokens.input_tokens) || 0;
  const cache = Number(tokens.cache_read_input_tokens || tokens.cached_tokens) || 0;
  return input + cache;
}

function maskKey(fullKey) {
  if (!fullKey) return "";
  return fullKey.length > 8 ? `${fullKey.slice(0, 8)}...` : fullKey;
}

// Map the fetched `status` field to the mockup `.st` + `.led` presentation.
function statusMeta(status) {
  const s = String(status ?? "").toLowerCase();
  if (/^2\d\d/.test(status ?? "") || s === "success" || s === "ok") {
    return { cls: "ok", led: "ok", label: "200" };
  }
  if (s.includes("403") || s.includes("fallback")) {
    return { cls: "warn", led: "warn", label: "403→fb" };
  }
  if (s && s !== "none" && s !== "null" && s !== "0") {
    const m = String(status).match(/\d{3}/);
    return { cls: "down", led: "down", label: m ? m[0] : String(status) };
  }
  return { cls: "", led: "", label: "—" };
}

function RequestFilters({ filterProvider, setFilterProvider, filterStart, setFilterStart, filterEnd, setFilterEnd, providers, cn, handleApplyFilters, handleClearFilters }) {
  return (
    <div className="panel">
      <div className="p-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="provider-filter" className="text-sm text-text-muted">Provider</label>
          <select
            id="provider-filter"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className={cn("inp w-full min-w-0 cursor-pointer")}
            style={{ colorScheme: 'auto' }}
          >
            <option value="">All Providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="start-date-filter" className="text-sm text-text-muted">Start Date</label>
          <input id="start-date-filter" type="datetime-local" value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            className={cn("inp w-full min-w-0")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="end-date-filter" className="text-sm text-text-muted">End Date</label>
          <input id="end-date-filter" type="datetime-local" value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            className={cn("inp w-full min-w-0")}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleApplyFilters}>Search</Button>
          <Button variant="ghost" onClick={handleClearFilters}
            disabled={!filterProvider && !filterStart && !filterEnd}>Clear</Button>
        </div>
      </div>
    </div>
  );
}


function RequestRow({ detail, index, handleViewDetail, providerNameCache }) {
  const sm = statusMeta(detail.status);
  const inTokens = getInputTokens(detail.tokens).toLocaleString();
  const outTokens = detail.tokens?.completion_tokens?.toLocaleString() || "0";
  return (
    <div
      key={`${detail.id}-${index}`}
      className="row d-row"
      style={{ cursor: "pointer" }}
      onClick={() => handleViewDetail(detail)}
    >
      <div className="dim tabular-nums" style={{ fontSize: 11 }}>{new Date(detail.timestamp).toLocaleString()}</div>
      <div className="min-w-0">
        <div>
          <span className="cr-name">{getProviderName(detail.provider, providerNameCache)}</span>
          {" "}
          <span className="dim">{detail.model}</span>
        </div>
        <div className="sid">TTFT: <span className="tabular-nums">{detail.latency?.ttft || 0}ms</span> · Total: <span className="tabular-nums">{detail.latency?.total || 0}ms</span></div>
      </div>
      <div className={`st ${sm.cls}`}>
        {sm.led && <span className={`led ${sm.led}`} />}
        {sm.label}
      </div>
      <div className="dim tabular-nums" style={{ fontSize: 11, textAlign: "right" }}>
        {detail.tokens != null ? `${inTokens} → ${outTokens}` : "—"}
      </div>
    </div>
  );
}


export default function RequestDetailsTab() {
  const [details, setDetails] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  // Filter input state (not applied until Search clicked)
  const [filterProvider, setFilterProvider] = useState("");
  const [filterStart, setFilterStart] = useState(() => {
    if (typeof window === "undefined") return "";
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [filterEnd, setFilterEnd] = useState("");
  // Applied filter state (triggers fetch)
  const [appliedProvider, setAppliedProvider] = useState("");
  const [appliedStart, setAppliedStart] = useState(() => {
    if (typeof window === "undefined") return "";
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [appliedEnd, setAppliedEnd] = useState("");
  // Guard: don't fetch until default filter is ready
  const [isFilterReady, setIsFilterReady] = useState(true);

  // Fetch providers once
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/usage/providers", { signal: controller.signal })
      .then(r => r.json())
      .then(async d => {
        if (controller.signal.aborted) return;
        setProviders(d.providers || []);
        const cache = await fetchProviderNames();
        if (!controller.signal.aborted) setProviderNameCache(cache.providerNameCache);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Fetch details — guarded by isFilterReady to prevent unfiltered initial request
  useEffect(() => {
    if (!isFilterReady) return;
    if (!appliedStart) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch with abort controller; setLoading(true) is intentional at the start of the request.
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (appliedProvider) params.append("provider", appliedProvider);
    params.append("startDate", appliedStart);
    if (appliedEnd) params.append("endDate", appliedEnd);

    fetch(`/api/usage/request-details?${params}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setDetails(Array.isArray(data.details) ? data.details : []);
        setTotalItems(data.pagination?.totalItems ?? 0);
        setTotalPages(data.pagination?.totalPages ?? 0);
      })
      .catch(err => {
        if (!controller.signal.aborted) console.error("request-details fetch failed:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isFilterReady, page, pageSize, appliedProvider, appliedStart, appliedEnd]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedProvider(filterProvider);
    setAppliedStart(filterStart);
    setAppliedEnd(filterEnd);
  };

  const handleClearFilters = () => {
    const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 16); })();
    setFilterProvider(""); setFilterStart(weekAgo); setFilterEnd("");
    setPage(1);
    setAppliedProvider(""); setAppliedStart(weekAgo); setAppliedEnd("");
  };

  const handlePageChange = (newPage) => setPage(newPage);
  const handlePageSizeChange = (newSize) => { setPageSize(newSize); setPage(1); };
  const handleViewDetail = (detail) => {
    setSelectedDetail(detail);
    setIsDrawerOpen(true);
    // Fetch full detail (list strips heavy request/response bodies)
    fetch(`/api/usage/request-details/${encodeURIComponent(detail.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.detail) setSelectedDetail(data.detail); })
      .catch(() => {});
  };

  const pagination = { page, pageSize, totalItems, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <RequestFilters filterProvider={filterProvider} setFilterProvider={setFilterProvider} filterStart={filterStart} setFilterStart={setFilterStart} filterEnd={filterEnd} setFilterEnd={setFilterEnd} providers={providers} cn={cn} handleApplyFilters={handleApplyFilters} handleClearFilters={handleClearFilters} />

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>03</b> · Request details</span>
        </div>
        <div className="row head d-row">
          <div>Time</div>
          <div>Provider / Model</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Tokens</div>
        </div>
        <div>
          {loading || !isFilterReady ? (
            <div className="p-8 text-center text-text-muted">
              <div className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                Loading...
              </div>
            </div>
          ) : details.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              No request details found
            </div>
          ) : (
            details.map((detail, index) => (
              <RequestRow key={index} detail={detail} index={index} handleViewDetail={handleViewDetail} providerNameCache={providerNameCache} />
            ))
          )}
        </div>

        {!loading && details.length > 0 && (
          <div className="border-t border-border-subtle p-3">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Details"
        width="lg"
      >
        {selectedDetail && (
          <div className="space-y-6">
            <div className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-text-muted">ID:</span>{" "}
                <span className="break-all font-mono text-text-main">{selectedDetail.id}</span>
              </div>
              <div>
                <span className="text-text-muted">Timestamp:</span>{" "}
                <span className="text-text-main">{new Date(selectedDetail.timestamp).toLocaleString()}</span>
              </div>
              <div>
                 <span className="text-text-muted">Provider:</span>{" "}
                 <span className="text-text-main font-medium">{getProviderName(selectedDetail.provider, providerNameCache)}</span>
               </div>
              <div>
                <span className="text-text-muted">Model:</span>{" "}
                <span className="text-text-main font-mono">{selectedDetail.model}</span>
              </div>
              <div>
                <span className="text-text-muted">API Key Name:</span>{" "}
                <span className="text-text-main">
                  {selectedDetail.apiKeyName || "-"}
                </span>
              </div>
              <div>
                <span className="text-text-muted">API Key:</span>{" "}
                <span className="text-text-main font-mono">
                  {selectedDetail.apiKeyName && selectedDetail.apiKey ? maskKey(selectedDetail.apiKey) : "-"}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Status:</span>{" "}
                <span className="inline-flex items-center gap-1.5">
                  <span className={`led ${selectedDetail.status === "success" ? "ok" : "down"}`} />
                  <span className="font-medium">{selectedDetail.status}</span>
                </span>
              </div>
              <div>
                <span className="text-text-muted">Latency:</span>{" "}
                <span className="text-text-main font-mono">
                  TTFT {selectedDetail.latency?.ttft || 0}ms / Total {selectedDetail.latency?.total || 0}ms
                </span>
              </div>
              <div>
                <span className="text-text-muted">Input Tokens:</span>{" "}
                <span className="text-text-main font-mono">
                  {getInputTokens(selectedDetail.tokens).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Output Tokens:</span>{" "}
                <span className="text-text-main font-mono">
                  {selectedDetail.tokens?.completion_tokens?.toLocaleString() || 0}
                </span>
              </div>
            </div>

            {selectedDetail.pxpipe && (
              <div className="rounded-lg border border-black/5 dark:border-white/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[18px] text-text-muted">image</span>
                  <span className="font-semibold text-sm text-text-main">PXPIPE</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    selectedDetail.pxpipe.applied
                      ? "bg-green-500/15 text-green-600"
                      : "bg-amber-500/15 text-amber-600"
                  )}>
                    {selectedDetail.pxpipe.applied ? "Activated" : "Skipped"}
                  </span>
                </div>
                {selectedDetail.pxpipe.applied ? (
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-text-muted block text-xs">Original (est.)</span>
                      <span className="font-mono">{(selectedDetail.pxpipe.tokensBeforeEst || 0).toLocaleString()} tokens</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Compressed (est.)</span>
                      <span className="font-mono">{(selectedDetail.pxpipe.tokensAfterEst || 0).toLocaleString()} tokens</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Saved</span>
                      <span className="font-mono text-green-600">{selectedDetail.pxpipe.savedPct || 0}%</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Images</span>
                      <span className="font-mono">{selectedDetail.pxpipe.imageCount || 0} ({selectedDetail.pxpipe.durationMs || 0}ms)</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    Reason: <span className="font-mono">{selectedDetail.pxpipe.reason}</span>
                    {selectedDetail.pxpipe.detail ? ` — ${selectedDetail.pxpipe.detail}` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <CollapsibleSection title="1. Client Request (Input)" defaultOpen={true} icon="input">
                <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {JSON.stringify(selectedDetail.request, null, 2)}
                </pre>
              </CollapsibleSection>

              {selectedDetail.providerRequest && (
                <CollapsibleSection title="2. Provider Request (Translated)" icon="translate">
                  <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {JSON.stringify(selectedDetail.providerRequest, null, 2)}
                  </pre>
                </CollapsibleSection>
              )}

              {selectedDetail.providerResponse && (
                <CollapsibleSection title="3. Provider Response (Raw)" icon="data_object">
                  <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {typeof selectedDetail.providerResponse === 'object'
                      ? JSON.stringify(selectedDetail.providerResponse, null, 2)
                      : selectedDetail.providerResponse
                    }
                  </pre>
                </CollapsibleSection>
              )}

              <CollapsibleSection title="4. Client Response (Final)" defaultOpen={true} icon="output">
                {selectedDetail.response?.thinking && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-text-main mb-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-70">
                      <span className="material-symbols-outlined text-[16px]">psychology</span>
                      Thinking Process
                    </h4>
                    <pre className="max-h-[200px] max-w-full overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 sm:p-4">
                      {selectedDetail.response.thinking}
                    </pre>
                  </div>
                )}

                <h4 className="font-semibold text-text-main mb-2 text-xs uppercase tracking-wide opacity-70">
                  Content
                </h4>
                <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {selectedDetail.response?.content || "[No content]"}
                </pre>
              </CollapsibleSection>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
