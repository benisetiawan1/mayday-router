"use client";

import { useState, useEffect } from "react";

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

function Cell({ label, value, sub, hl, ok }) {
  return (
    <div className="px-5 pt-3 pb-2.5 border-r border-border-subtle last:border-r-0">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-text-subtle">{label}</div>
      <div
        className={`font-display text-[30px] font-semibold leading-[1.1] mt-[3px] tabular-nums ${
          ok ? "text-success" : hl ? "text-primary" : "text-text-main"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="text-[10px] text-text-muted mt-0.5">{sub}</div> : null}
    </div>
  );
}

export default function StatusStrip() {
  const [stats, setStats] = useState({
    connections: null,
    providers: null,
    keys: null,
    requests: null,
    health: null,
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      const [provRes, keysRes, usageRes, healthRes] = await Promise.allSettled([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/keys", { cache: "no-store" }),
        fetch("/api/usage/stats", { cache: "no-store" }),
        fetch("/api/health"),
      ]);

      const next = { connections: null, providers: null, keys: null, requests: null, health: null };

      if (provRes.status === "fulfilled" && provRes.value.ok) {
        const d = await provRes.value.json();
        const conns = d.connections || [];
        next.connections = conns.length;
        next.providers = new Set(conns.map((c) => c.provider)).size;
      }
      if (keysRes.status === "fulfilled" && keysRes.value.ok) {
        const d = await keysRes.value.json();
        next.keys = (d.keys || []).length;
      }
      if (usageRes.status === "fulfilled" && usageRes.value.ok) {
        const d = await usageRes.value.json();
        next.requests = d.stats?.totalRequests ?? d.totalRequests ?? null;
      }
      if (healthRes.status === "fulfilled") {
        next.health = healthRes.value.ok;
      }

      if (alive) setStats(next);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  // Mockup v3 order: connections · api keys · total requests · gateway health.
  // "Fallback events" cell from the mockup is omitted — usageDb has no fallback/403
  // persistence, and the plan forbids dummy data. Add the cell back when a real
  // fallback counter exists.
  return (
    <div data-i18n-skip className="flex-none grid grid-cols-2 sm:grid-cols-4 border-b border-border bg-surface">
      <Cell
        label="Provider connections"
        value={fmt(stats.connections)}
        sub={stats.providers != null ? `across ${stats.providers} providers` : undefined}
        hl
      />
      <Cell label="API keys" value={fmt(stats.keys)} sub="active access keys" />
      <Cell label="Total requests" value={fmt(stats.requests)} sub="lifetime" />
      <Cell
        label="Gateway health"
        value={stats.health === true ? "OK" : stats.health === false ? "DOWN" : "—"}
        sub="all systems normal"
        ok={stats.health === true}
      />
    </div>
  );
}