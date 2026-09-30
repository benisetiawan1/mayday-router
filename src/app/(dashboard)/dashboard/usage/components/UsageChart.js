"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");
  const fetchedPeriodRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (fetchedPeriodRef.current === period) return;
    fetchedPeriodRef.current = period;
    fetchData();
  }, [fetchData, period]);

  const values = data.map((d) => (viewMode === "tokens" ? d.tokens : d.cost));
  const max = Math.max(1, ...values);
  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="seg self-end">
        <button
          type="button"
          onClick={() => setViewMode("tokens")}
          className={viewMode === "tokens" ? "on" : ""}
        >
          Tokens
        </button>
        <button
          type="button"
          onClick={() => setViewMode("cost")}
          className={viewMode === "cost" ? "on" : ""}
        >
          Cost
        </button>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">Loading...</div>
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data for this period</div>
      ) : (
        <div className="bars">
          {data.map((d, i) => {
            const v = viewMode === "tokens" ? d.tokens : d.cost;
            const pct = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
            const peak = v === max && max > 0;
            return (
              <div className="col" key={`${d.label}-${i}`}>
                <div className={`b${peak ? " peak" : ""}`} style={{ height: `${pct}%` }} />
                <div className="n" style={peak ? { color: "var(--color-primary)" } : undefined}>
                  {viewMode === "tokens" ? fmtTokens(v) : fmtCost(v)}
                </div>
                <div className="t">{d.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}