"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, CardSkeleton, ConfirmModal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

function recordsOf(fitness, pools, now = Date.now()) {
  const names = new Map((pools || []).map((p) => [p.id, p]));
  return Object.entries(fitness || {}).flatMap(([poolId, scopes]) => Object.entries(scopes || {}).flatMap(([scope, info]) => {
    const until = Number(info?.until || 0);
    if (until <= now) return [];
    const [provider, model] = String(scope).split("::");
    const pool = names.get(poolId);
    return [{ poolId, scope, provider, model: model === "*" ? "all models" : model, until, reason: info?.reason || "blocked", poolName: pool?.name || poolId.slice(0, 8), proxyUrl: pool?.proxyUrl || "" }];
  }));
}

export default function ProxyFitnessPage() {
  const [pools, setPools] = useState([]);
  const [fitness, setFitness] = useState({});
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(false);
  const notify = useNotificationStore();
  const fetchAll = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" }), fetch("/api/proxy-pools/fitness", { cache: "no-store" })]);
      setPools((await p.json()).proxyPools || []);
      setFitness(f.ok ? ((await f.json()).pools || {}) : {});
    } catch {
      // Keep the empty state when the dashboard APIs are unavailable.
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
  }, [fetchAll]);
  const records = useMemo(() => recordsOf(fitness, pools).filter((r) => (provider === "all" || r.provider === provider) && `${r.proxyUrl} ${r.poolName} ${r.model}`.toLowerCase().includes(search.toLowerCase())), [fitness, pools, provider, search]);
  const providers = useMemo(() => [...new Set(recordsOf(fitness, pools).map((r) => r.provider))].sort(), [fitness, pools]);
  const clearAll = async () => {
    await fetch("/api/proxy-pools/fitness/clear-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(provider === "all" ? {} : { provider }) });
    setConfirm(false); notify.success("Proxy fitness cleared"); fetchAll();
  };
  return (
    <div className="flex w-full flex-col gap-4">
      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="panel">
          <div className="panel-head">
            <span className="t"><b>01</b> · Proxy Fitness</span>
            <Badge variant={records.length ? "error" : "default"}>
              {records.length} active blocks
            </Badge>
            <div className="acts">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="inp"
                style={{ width: 160 }}
              >
                <option value="all">All providers</option>
                {providers.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <input
                className="inp"
                style={{ width: 160 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search IP / proxy / pool..."
              />
              <Button variant="secondary" size="sm" onClick={fetchAll}>
                Refresh
              </Button>
              {records.length > 0 && (
                <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
                  Clear All
                </Button>
              )}
            </div>
          </div>
          <p className="dim" style={{ padding: "0 14px", marginTop: 10 }}>
            Smart rotation skips pools marked unfit for a provider/model.
          </p>
          <div>
            <div className="row head" style={{ gridTemplateColumns: "160px 1fr 140px 90px 90px 110px" }}>
              <div>Provider</div>
              <div>Model</div>
              <div>Pool</div>
              <div>Reason</div>
              <div>Until</div>
              <div>Actions</div>
            </div>
            {records.length ? (
              records.map((r) => (
                <div
                  key={`${r.poolId}:${r.scope}`}
                  className="row"
                  style={{ gridTemplateColumns: "160px 1fr 140px 90px 90px 110px" }}
                >
                  <div className="cr-name">{r.provider}</div>
                  <div>
                    <code className="px-1.5 py-0.5 rounded bg-bg text-xs">{r.model}</code>
                  </div>
                  <div className="dim truncate">{r.poolName}</div>
                  <div>
                    <Badge variant="error" size="sm" dot>{r.reason}</Badge>
                  </div>
                  <div className="dim">{new Date(r.until).toLocaleTimeString()}</div>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await fetch(`/api/proxy-pools/${r.poolId}/fitness/clear`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ scope: r.scope }),
                        });
                        fetchAll();
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">
                <div className="big">No active blocks</div>
                <div className="sub">All proxy pools are healthy and fit for routing.</div>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={clearAll}
        title="Clear proxy fitness"
        message="Clear active proxy fitness blocks?"
        confirmText="Clear All"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export { recordsOf };