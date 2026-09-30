export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onTest, isTesting, onDisable, caps }) {
  const ledTone = testStatus === "ok" ? "ok" : testStatus === "error" ? "down" : "info";
  const contextTag = caps?.contextWindow
    ? (caps.contextWindow >= 1000000
      ? `${(caps.contextWindow / 1000000).toFixed(1).replace(/\.0$/, "")}M`
      : `${Math.round(caps.contextWindow / 1000)}K`)
    : null;

  return (
    <div className="contents">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`led ${ledTone}`}></span>
        <div className="min-w-0">
          <div className="truncate font-mono text-[12.5px] font-bold">{fullModel}</div>
          {model.name && <div className="truncate text-[9px] italic text-text-subtle">{model.name}</div>}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="tag g">CHAT</span>
        {contextTag && <span className="tag">{contextTag}</span>}
        {caps?.reasoning && <span className="tag a">REASONING</span>}
        {caps?.vision && <span className="tag b">VISION</span>}
      </div>
      <div className="truncate font-mono text-xs text-text-muted">{alias || "—"}</div>
      <div className="flex items-center justify-end gap-1">
        {onTest && (
          <div className="relative shrink-0 group/btn">
            <button
              onClick={onTest}
              disabled={isTesting}
              className={`rounded p-0.5 text-text-muted transition-opacity hover:bg-sidebar hover:text-primary ${isTesting ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
            >
              <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                {isTesting ? "progress_activity" : "science"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        <div className="relative shrink-0 group/btn">
          <button
            onClick={() => onCopy(fullModel, `model-${model.id}`)}
            className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">
              {copied === `model-${model.id}` ? "check" : "content_copy"}
            </span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === `model-${model.id}` ? "Copied!" : "Copy"}
          </span>
        </div>
        {isCustom ? (
          <button
            onClick={onDeleteAlias}
            className="ml-auto rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
            title="Remove custom model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : onDisable ? (
          <button
            onClick={onDisable}
            className="ml-auto rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
            title="Disable this model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}