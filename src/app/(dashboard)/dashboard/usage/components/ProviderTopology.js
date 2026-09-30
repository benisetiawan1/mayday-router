"use client";

import { useEffect, useMemo, useState } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const EMPTY = [];

function labelFromKey(key) {
  const c = AI_PROVIDERS[key];
  return (c && c.name) || key;
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

// Stable per-provider hue (v2.1 uses fixed .ds/.mi/.or classes; ours is
// data-driven so any provider gets a stable distinct color).
function provColorClass(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `c${h % 5}`;
}

const fnum = (n) => (n || 0).toLocaleString("en-US");

// v2.1-style live row, but every visible state is real:
// phase/LED from pipeline events, elapsed from real startedAt,
// tokens only when provider-reported (usage in SSE chunk), else real bytes.
function LiveRow({ r, now, maxBytes, hl }) {
  const elapsed = Math.max(0, (now - r.startedAt) / 1000);
  const sinceFinal = r.updatedAt ? now - r.updatedAt : 0;
  // DONE/ERROR stays visible ~1.7s, then fades out (removed at 2.2s by filter)
  const isFinal = r.phase === "done" || r.phase === "error" || r.phase === "aborted";
  const dying = isFinal && sinceFinal > 1700;
  const phase = r.phase;
  const meta = {
    received: { txt: "REQ IN", cls: "req", led: "warn pulse", bar: 4 },
    routed: { txt: `ROUTE · ${r.account || "…"}`, cls: "route", led: "warn", bar: 12 },
    streaming: { txt: "ANSWERING", cls: "stream", led: "ok pulse", bar: null },
    done: { txt: "DONE", cls: "done", led: "ok", bar: 100 },
    error: { txt: "ERROR", cls: "err", led: "down", bar: 100 },
    aborted: { txt: "ABORTED", cls: "err", led: "warn", bar: 100 },
  }[phase] || { txt: phase, cls: "req", led: "warn", bar: 4 };

  // While streaming, the bar tracks real received bytes relative to the
  // largest transfer currently in flight — movement is real, not a timer.
  const barW = meta.bar ?? Math.min(96, 12 + (84 * Math.log10((r.bytes || 0) + 1)) / Math.log10((maxBytes || 1) + 1));
  const fb = r.fallbackFrom;

  return (
    <div className={`live-row${dying ? " dying" : ""}${hl ? " hl" : ""}`}>
      <span className={`led ${meta.led}`} />
      <span className={`pf ${provColorClass((r.provider || "").toLowerCase())}`}>{labelFromKey(r.provider)}</span>
      <span className="mono dim md">{r.model}</span>
      <span className={`ph ${meta.cls}`}>
        {fb ? <><span className="ph err">{fb.status || "ERR"} → FB</span> </> : null}
        {meta.txt}
      </span>
      <div className="bar"><i style={{ width: `${barW}%` }} /></div>
      <span className="toks">{r.tokensOut > 0 ? `${fnum(r.tokensOut)} tok` : `${fnum(r.bytes || 0)}B`}</span>
      <span className="eta mono">{elapsed.toFixed(1)}s</span>
    </div>
  );
}

// Live flow panel for usage "02 · Provider topology".
// Stacked tree: CLIENT → MAYDAY → per-provider branches → models.
// Only providers/models that actually received traffic (in-flight or recent)
// are rendered — idle providers stay hidden. Real SSE state only.
// v2.1 "04 · Request feed" — log lines from real events (liveFeed), falling
// back to the retained recent-requests ring when no live traffic yet.
export function RequestFeed({ liveFeed = EMPTY, recentRequests = EMPTY }) {
  const recent = useMemo(() => recentRequests.slice(-8).reverse(), [recentRequests]);
  return (
    <div className="cr-stream" style={{ borderTop: 0 }}>
      {liveFeed.length === 0 && recent.length === 0 ? (
        <div className="stream-empty">No completed requests</div>
      ) : liveFeed.length > 0 ? (
        liveFeed.map((e, i) => {
          if (e.kind === "fallback") {
            return (
              <div key={`fb-${e.ts}-${i}`} className="fline">
                <span className="ts">{clock(e.ts)}</span>
                <span className="feed-err">account {e.from || "?"} unavailable ({e.status || "err"})</span>
                <span className="dim">→ fallback → {e.to || "next account"}</span>
              </div>
            );
          }
          if (e.kind === "complete") {
            return (
              <div key={`cp-${e.ts}-${i}`} className="fline">
                <span className="ts">{clock(e.ts)}</span>
                <span className={`pf ${provColorClass((e.provider || "").toLowerCase())}`}>{labelFromKey(e.provider)}</span>
                <span className="mono dim">{e.model}</span>
                <span className="dim">· STREAM complete · {fnum(e.ms)}ms · in={fnum(e.tokensIn)} out={fnum(e.tokensOut)}</span>
              </div>
            );
          }
          return (
            <div key={`er-${e.ts}-${i}`} className="fline">
              <span className="ts">{clock(e.ts)}</span>
              <span className={`pf ${provColorClass((e.provider || "").toLowerCase())}`}>{labelFromKey(e.provider)}</span>
              <span className="mono dim">{e.model}</span>
              <span className="feed-err">· {e.kind === "aborted" ? "client aborted" : "error"} · {fnum(e.ms)}ms</span>
            </div>
          );
        })
      ) : (
        recent.map((r, i) => (
          <div key={`${r.timestamp}-${r.model}-${i}`} className="fline">
            <span className="ts">{clock(r.timestamp)}</span>
            <span className={`pf ${provColorClass((r.provider || "").toLowerCase())}`}>{labelFromKey(r.provider)}</span>
            <span className="mono dim">{r.model}</span>
            <span className="dim">· in={fnum(r.promptTokens)} out={fnum(r.completionTokens)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function ProviderTopology({ providers = EMPTY, activeRequests = EMPTY, recentRequests = EMPTY, liveRequests = EMPTY }) {
  const [hoverProv, setHoverProv] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick while anything is on screen (in-flight rows for elapsed, finished
  // rows so their 2.2s fade-out filter actually re-evaluates).
  const hasLive = liveRequests.length > 0;
  useEffect(() => {
    if (!hasLive) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [hasLive]);

  const maxBytes = useMemo(
    () => liveRequests.reduce((m, r) => Math.max(m, r.bytes || 0), 0),
    [liveRequests]
  );

  // Finished rows fade out client-side after a short hold: the server prunes
  // lazily on the next push, so without this a DONE row would linger when idle.
  const visibleLive = useMemo(
    () => liveRequests.filter((r) => {
      const finalPhase = r.phase === "done" || r.phase === "error" || r.phase === "aborted";
      return !finalPhase || now - r.updatedAt < 2200;
    }),
    [liveRequests, now]
  );

  // providers with a live (non-final) request right now
  const liveProviders = useMemo(() => {
    const s = new Set();
    for (const r of liveRequests) {
      if (r.phase === "done" || r.phase === "error" || r.phase === "aborted") continue;
      if (r.provider) s.add(r.provider.toLowerCase());
    }
    return s;
  }, [liveRequests]);

  // traffic: providerKey -> { label, activeTotal, models: Map(model -> { active, seen }) }
  const traffic = useMemo(() => {
    const map = new Map();
    const ensure = (provKey) => {
      if (!provKey) return null;
      const k = provKey.toLowerCase();
      if (!map.has(k)) map.set(k, { key: k, label: labelFromKey(k), activeTotal: 0, models: new Map() });
      return map.get(k);
    };
    for (const r of activeRequests) {
      const entry = ensure(r.provider);
      if (!entry || !r.model) continue;
      entry.activeTotal += r.count || 0;
      const m = entry.models.get(r.model) || { active: 0, seen: false };
      m.active += r.count || 0;
      m.seen = true;
      entry.models.set(r.model, m);
    }
    for (const r of recentRequests) {
      const entry = ensure(r.provider);
      if (!entry || !r.model) continue;
      const m = entry.models.get(r.model) || { active: 0, seen: false };
      m.seen = true;
      entry.models.set(r.model, m);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, models: Array.from(e.models.entries()) }))
      .sort((a, b) => b.activeTotal - a.activeTotal || b.models.length - a.models.length);
  }, [activeRequests, recentRequests]);

  const totalActive = useMemo(
    () => activeRequests.reduce((s, r) => s + (r.count || 0), 0),
    [activeRequests]
  );

  return (
    <div className="cr-flow">
      {/* 1 · stacked flow tree */}
      <div className="flowtree">
        <div className="ft-head">
          <span className="fnode">Client</span>
          <span className="flink hot" aria-hidden="true" />
          <span className="fnode core">
            Mayday
            {totalActive > 0 && <b className="fcount">{totalActive}</b>}
          </span>
          {traffic.length > 0 && <span className="flink hot" aria-hidden="true" />}
          {traffic.length > 0 && (
            <div className="ft-spine">
              {traffic.map((entry) => {
                const hl = hoverProv === entry.key;
                return (
                  <div
                    key={entry.key}
                    className={`ft-row${hl ? " hl" : ""}`}
                    onMouseEnter={() => setHoverProv(entry.key)}
                    onMouseLeave={() => setHoverProv(null)}
                  >
                    <span className={`fchip prov${entry.activeTotal > 0 || liveProviders.has(entry.key) ? " hot" : ""}`}>
                      <span className="dot" />
                      {entry.label}
                      {entry.activeTotal > 0 && <span className="fchip-cnt">{entry.activeTotal}</span>}
                    </span>
                    <span className="ft-models">
                      {entry.models.map(([model, m]) => (
                        <span key={model} className={`fchip sm${m.active > 0 ? " hot" : ""}`}>
                          {model}
                          {m.active > 1 ? ` ×${m.active}` : ""}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {traffic.length === 0 && (
          <div className="stream-empty" style={{ paddingTop: 10 }}>No provider traffic yet</div>
        )}
      </div>

      {/* 2 · active requests — one row per REAL in-flight request (liveRequests) */}
      <div className="cr-stream">
        <div className="stream-head">
          Active requests
          <span className="tag b">{liveRequests.length > 0 ? liveRequests.length : totalActive} live</span>
        </div>
        {visibleLive.length === 0 ? (
          <div className="stream-empty">No in-flight requests — waiting for traffic…</div>
        ) : (
          visibleLive.map((r) => (
            <LiveRow
              key={r.id}
              r={r}
              now={now}
              maxBytes={maxBytes}
              hl={hoverProv && (r.provider || "").toLowerCase() === hoverProv}
            />
          ))
        )}
      </div>
    </div>
  );
}
