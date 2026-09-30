"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/shared/components";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtUptime = (ms) => {
  if (!ms || ms <= 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

const WINDOW_TABS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7d", label: "7 days" },
  { id: "last30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const REASON_LABELS = {
  applied: "Prompt exceeded threshold",
  below_threshold: "Below size threshold",
  not_profitable: "Compression not profitable",
  below_min_chars: "Below minimum chars",
  below_min_tokens: "Below minimum tokens",
  unsupported_model: "Model not in allowlist",
  unsupported_format: "Non-Claude request format",
  timeout: "Compression timed out",
  transform_error: "Transform error",
  passthrough: "Passthrough",
  disabled: "Disabled",
  not_installed: "Not installed",
};

function SummaryCard({ label, value, sub, tone }) {
  const color = tone === "ok" ? "var(--color-success)" : tone === "warn" ? "var(--color-warning)" : undefined;
  return (
    <div className="kv">
      <div className="k">{label}</div>
      <div className="v" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="sid mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PxpipeClient() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState(null);
  const [windowId, setWindowId] = useState("last7d");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes, logsRes] = await Promise.all([
        fetch("/api/pxpipe/status", { headers: { "Cache-Control": "no-store" } }),
        fetch("/api/pxpipe/stats"),
        fetch("/api/pxpipe/logs?limit=50"),
      ]);
      setStatus(await statusRes.json());
      setStats(await statsRes.json());
      setLogs(await logsRes.json());
      const healthRes = await fetch("/api/pxpipe/health", { method: "POST" });
      setHealth(await healthRes.json());
    } catch {
      /* sections render placeholders */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Intentional initial synchronization with the PXPIPE service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const w = stats?.windows?.[windowId];
  const statusLabel = !status
    ? "—"
    : !status.installed
      ? "Not installed"
      : health?.healthy
        ? "Healthy"
        : status.running
          ? "Running"
          : "Stopped";

  return (
    <div className="flex flex-col">
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · PXPIPE Dashboard</span>
          <div className="acts">
            <a href="/dashboard/token-saver" className="btn ghost">
              Token Saver settings
            </a>
            <Button size="sm" variant="ghost" icon="sync" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="grid-6">
          <SummaryCard
            label="Status"
            value={statusLabel}
            tone={health?.healthy ? "ok" : status?.installed ? "warn" : undefined}
            sub={status?.enabled ? "Enabled in pipeline" : "Disabled in pipeline"}
          />
          <SummaryCard label="Version" value={status?.version ? `v${status.version}` : "—"} sub="pxpipe-proxy" />
          <SummaryCard label="Uptime" value={fmtUptime(status?.uptimeMs)} sub="module loaded" />
          <SummaryCard label="Requests" value={w ? w.requests.toLocaleString() : "—"} />
          <SummaryCard label="Compressed" value={w ? w.compressed.toLocaleString() : "—"} tone="ok" />
          <SummaryCard label="Bypassed" value={w ? w.bypassed.toLocaleString() : "—"} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · Token savings (estimated)</span>
          <div className="acts">
            <div className="seg">
              {WINDOW_TABS.map((tab) => (
                <button key={tab.id} className={windowId === tab.id ? "on" : ""} onClick={() => setWindowId(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="spec">
          <div className="kv"><div className="k">Original tokens</div><div className="v">{w ? fmtTokens(w.tokensBeforeEst) : "—"}</div></div>
          <div className="kv"><div className="k">After PXPIPE</div><div className="v">{w ? fmtTokens(w.tokensAfterEst) : "—"}</div></div>
          <div className="kv"><div className="k">Saved</div><div className="v" style={{ color: "var(--color-success)" }}>{w ? fmtTokens(w.tokensSavedEst) : "—"}</div></div>
          <div className="kv"><div className="k">Reduction</div><div className="v" style={{ color: "var(--color-success)" }}>{w ? `${w.savedPct}%` : "—"}</div></div>
        </div>
        <p className="px-4 py-3 text-xs text-text-muted border-t border-border-subtle">
          Estimates from body size before/after imaging; billed usage per request
          (recorded on the Usage page) remains the ground truth. Images generated:{" "}
          {w ? w.imagesGenerated.toLocaleString() : "—"} · avg compression time:{" "}
          {w ? `${w.avgCompressionMs}ms` : "—"} · errors: {w ? w.errors : "—"}
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>03</b> · Tokens saved — last 30 days</span>
        </div>
        {stats?.timeline?.some((d) => d.tokensSavedEst > 0) ? (
          <div className="px-3 py-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPxpipe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtTokens} width={48} />
                <Tooltip formatter={(v) => [fmtTokens(v), "Tokens saved"]} labelFormatter={(d) => d} />
                <Area type="monotone" dataKey="tokensSavedEst" stroke="#10b981" fill="url(#gradPxpipe)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty">
            <div className="sub">No savings recorded yet — enable PXPIPE in the Token Saver and route a large Claude-format request.</div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>04</b> · History</span>
        </div>
        <div className="tbl">
          <div className="row head" style={{ gridTemplateColumns: "130px 1fr 80px 80px 70px 50px 80px 130px" }}>
            <div>Time</div><div>Model</div><div>Original</div><div>Compressed</div><div>Saved</div><div>%</div><div>Duration</div><div>Status</div>
          </div>
          {(stats?.recent || []).slice(0, 50).map((ev, i) => (
            <div key={`${ev.ts}-${i}`} className="row" style={{ gridTemplateColumns: "130px 1fr 80px 80px 70px 50px 80px 130px" }}>
              <div className="dim">{new Date(ev.ts).toLocaleString()}</div>
              <div className="cr-name">{ev.provider ? `${ev.provider}/${ev.model}` : ev.model || "—"}</div>
              <div className="dim">{ev.applied ? fmtTokens(ev.tokensBeforeEst) : "—"}</div>
              <div className="dim">{ev.applied ? fmtTokens(ev.tokensAfterEst) : "—"}</div>
              <div className="dim" style={{ color: "var(--color-success)" }}>{ev.applied ? fmtTokens(ev.tokensSavedEst) : "—"}</div>
              <div className="dim">{ev.applied ? `${ev.savedPct}%` : "—"}</div>
              <div className="dim">{ev.durationMs != null ? `${ev.durationMs}ms` : "—"}</div>
              <div>
                <span className={`st ${ev.applied ? "ok" : ev.reason === "transform_error" || ev.reason === "timeout" ? "down" : "warn"}`} title={ev.detail || ""}>
                  <span className={`led ${ev.applied ? "ok" : ev.reason === "transform_error" || ev.reason === "timeout" ? "down" : "warn"}`} />
                  {ev.applied ? "Compressed" : REASON_LABELS[ev.reason] || ev.reason}
                </span>
              </div>
            </div>
          ))}
          {(!stats?.recent || stats.recent.length === 0) && (
            <div className="empty">
              <div className="sub">No PXPIPE activity yet</div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>05</b> · PXPIPE Logs</span>
        </div>
        {logs?.installLog ? (
          <pre className="px-4 py-3 text-xs leading-relaxed overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{logs.installLog}</pre>
        ) : (
          <div className="empty">
            <div className="sub">No install log yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}
