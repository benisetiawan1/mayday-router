"use client";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function Cell({ label, value, sub, color = "var(--color-text-main)" }) {
  return (
    <div className="kv">
      <div className="k">{label}</div>
      <div className="v" style={{ color }}>{value}</div>
      {sub ? <div className="sid">{sub}</div> : null}
    </div>
  );
}

export default function OverviewCards({ stats }) {
  return (
    <div className="spec">
      <Cell label="Total Requests" value={fmt(stats.totalRequests)} />
      <Cell label="Total Input Tokens" value={fmt(stats.totalPromptTokens)} color="var(--color-primary)" />
      <Cell
        label="Cached Tokens"
        value={fmt(stats.totalCachedTokens)}
        color="var(--color-info)"
        sub={stats.totalPromptTokens > 0 ? `${((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1)}% hit rate` : "0.0% hit rate"}
      />
      <Cell label="Output Tokens" value={fmt(stats.totalCompletionTokens)} color="var(--color-success)" />
      <Cell
        label="Est. Cost"
        value={`~${fmtCost(stats.totalCost)}`}
        color="var(--color-warning)"
        sub="Estimated, not actual billing"
      />
    </div>
  );
}