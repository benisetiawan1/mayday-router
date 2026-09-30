"use client";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-1 rounded shrink-0 min-w-[76px] text-center border ${
          (badge === "CF" || badge === "TS") ? "bg-primary/10 text-primary border-primary/30" : "bg-surface-2 text-text-muted border-border"
        }`}>{label}</span>
      <div className="flex items-center flex-1 min-w-0 px-3 h-9 rounded border border-border bg-input/50">
        <code className="flex-1 truncate text-[13px] text-text-main font-mono">{url}</code>
        <button
          onClick={() => onCopy(url, copyId)}
          className="p-1.5 hover:text-primary transition-colors shrink-0 text-text-muted"
          title="Copy"
        >
          <span className="material-symbols-outlined text-[17px]">{copied === copyId ? "check" : "content_copy"}</span>
        </button>
      </div>
      {actions}
    </div>
  );
}
