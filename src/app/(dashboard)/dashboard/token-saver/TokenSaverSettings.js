"use client";

import { Button, Toggle, SegmentedControl } from "@/shared/components";

export default function TokenSaverSettings({
  rtkEnabled,
  handleRtkEnabled,
  headroomRunning,
  headroomStatusLabel,
  setShowHeadroomInstallModal,
  headroomEnabled,
  handleHeadroomEnabled,
  headroomStatus,
  headroomExtras,
  pendingExtras,
  codeAware,
  kompress,
  restartingProxy,
  toggleExtraActive,
  handleRemoveExtra,
  removingExtra,
  togglePendingExtra,
  handleInstallExtras,
  extrasActionLoading,
  extrasActionError,
  installLog,
  cavemanEnabled,
  visibleCavemanLevels,
  handleCavemanLevel,
  cavemanLevel,
  cavemanLevels,
  handleCavemanEnabled,
  ponytailEnabled,
  ponytailLevels,
  handlePonytailLevel,
  ponytailLevel,
  handlePonytailEnabled,
  pxpipeStatusLabel,
  setShowPxpipeModal,
  pxpipeStatus,
  pxpipeEnabled,
  handlePxpipeEnabled,
}) {
  const cavemanOptions = visibleCavemanLevels.map((lvl) => ({ value: lvl.id, label: lvl.label }));
  const ponytailOptions = ponytailLevels.map((lvl) => ({ value: lvl.id, label: lvl.label }));

  return (
    <>
      {/* 01 · RTK */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · RTK</span>
          <div className="acts">
            <Toggle
              checked={rtkEnabled}
              onChange={() => handleRtkEnabled(!rtkEnabled)}
              aria-label="RTK"
              title="Compress tool output"
            />
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">
              Compress tool output{" "}
              <a
                href="https://github.com/rtk-ai/rtk"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:opacity-80"
              >
                (RTK)
              </a>
            </div>
            <div className="v muted">git/grep/ls/tree/logs → 60-90% fewer input tokens</div>
          </div>
        </div>
      </div>

      {/* 02 · Headroom */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · Headroom</span>
          <div className="acts">
            <Toggle
              checked={headroomEnabled}
              onChange={() => handleHeadroomEnabled(!headroomEnabled)}
              aria-label="Headroom"
              title="Compress context"
            />
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">Headroom</div>
            <div className="v muted">
              {headroomStatusLabel}
              {headroomStatus.url ? ` · ${headroomStatus.url}` : ""}
            </div>
          </div>
        </div>

        {/* Headroom setup/manage */}
        <div className="frm">
          <span className="fl">
            Compress context{" "}
            <a
              href="https://github.com/chopratejas/headroom"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline hover:opacity-80"
            >
              (Headroom)
            </a>
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`led ${headroomRunning ? "ok" : "warn"}`} />
            <span className="text-xs text-text-muted">{headroomStatusLabel}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHeadroomInstallModal(true)}
            >
              {headroomRunning ? "Manage" : "Setup"}
            </Button>
          </div>
          <span className="dim">Compress prompts via /v1/compress before routing to the model</span>
        </div>

        {/* Headroom compression extras */}
        {headroomStatus.installed && (
          <div className="frm">
            <span className="fl">Compression extras{headroomExtras.version ? ` · v${headroomExtras.version}` : ""}</span>
            <div className="flex items-center gap-2 flex-wrap">
              {headroomExtras.available.map((extra) => {
                const installed = !!headroomExtras.extras[extra];
                const pending = pendingExtras.includes(extra);
                const extraTitle =
                  extra === "code"
                    ? "tree-sitter AST compression for code responses"
                    : "Kompress-v2 HF model for prose/agentic traces (~+1GB)";

                if (installed) {
                  const active = extra === "code" ? codeAware : kompress;
                  return (
                    <div
                      key={extra}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 border border-success/40 bg-success/5 text-text"
                      title={extraTitle}
                    >
                      <Toggle
                        size="sm"
                        checked={active}
                        disabled={restartingProxy}
                        onChange={() => toggleExtraActive(extra, !active)}
                      />
                      <span className="font-medium">[{extra}]</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExtra(extra)}
                        disabled={removingExtra === extra}
                        className="ml-1 text-error underline hover:opacity-80 disabled:opacity-50"
                        title={`Uninstall [${extra}]`}
                      >
                        {removingExtra === extra ? "Uninstalling…" : "Uninstall"}
                      </button>
                    </div>
                  );
                }

                return (
                  <label
                    key={extra}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 border cursor-pointer transition-colors ${
                      pending
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-text-muted hover:bg-surface-2"
                    }`}
                    title={extraTitle}
                  >
                    <input
                      type="checkbox"
                      className="w-3 h-3"
                      checked={pending}
                      onChange={() => togglePendingExtra(extra)}
                    />
                    <span className="font-medium">[{extra}]</span>
                    <span className="opacity-70">not installed</span>
                  </label>
                );
              })}
              {pendingExtras.length > 0 && (
                <button
                  onClick={handleInstallExtras}
                  disabled={extrasActionLoading}
                  className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
                >
                  {extrasActionLoading
                    ? "Installing…"
                    : `Install [proxy,${pendingExtras.join(",")}]`}
                </button>
              )}
            </div>
            {extrasActionError && (
              <p className="text-xs text-error">{extrasActionError}</p>
            )}
            {restartingProxy && (
              <p className="text-xs text-text-muted">Restarting proxy…</p>
            )}
          </div>
        )}
        {(extrasActionLoading || removingExtra) && installLog && (
          <pre className="mx-4 mb-4 max-h-32 overflow-auto bg-surface-2 p-2 text-[10px] leading-tight text-text-muted whitespace-pre-wrap">
            {installLog}
          </pre>
        )}
      </div>

      {/* 03 · Caveman */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>03</b> · Caveman</span>
          <div className="acts">
            <Toggle
              checked={cavemanEnabled}
              onChange={() => handleCavemanEnabled(!cavemanEnabled)}
              aria-label="Caveman"
              title="Compress LLM output"
            />
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">Caveman</div>
            <div className="v muted">
              {cavemanEnabled ? "on" : "off"} · level: {cavemanLevel}
            </div>
          </div>
        </div>

        {/* Caveman level */}
        {cavemanEnabled && (
          <div className="frm">
            <span className="fl">
              Compress LLM output{" "}
              <a
                href="https://github.com/JuliusBrussee/caveman"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:opacity-80"
              >
                (Caveman)
              </a>
            </span>
            <SegmentedControl
              options={cavemanOptions}
              value={cavemanLevel}
              onChange={handleCavemanLevel}
            />
            <span className="sid">
              {cavemanLevels.find((lvl) => lvl.id === cavemanLevel)?.desc}
            </span>
          </div>
        )}
      </div>

      {/* 04 · Ponytail */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>04</b> · Ponytail</span>
          <div className="acts">
            <Toggle
              checked={ponytailEnabled}
              onChange={() => handlePonytailEnabled(!ponytailEnabled)}
              aria-label="Ponytail"
              title="Lazy senior dev"
            />
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">Ponytail</div>
            <div className="v muted">
              {ponytailEnabled ? "on" : "off"} · level: {ponytailLevel}
            </div>
          </div>
        </div>

        {/* Ponytail level */}
        {ponytailEnabled && (
          <div className="frm">
            <span className="fl">
              Lazy senior dev{" "}
              <a
                href="https://github.com/DietrichGebert/ponytail"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:opacity-80"
              >
                (Ponytail)
              </a>
            </span>
            <SegmentedControl
              options={ponytailOptions}
              value={ponytailLevel}
              onChange={handlePonytailLevel}
            />
            <span className="sid">
              {ponytailLevels.find((lvl) => lvl.id === ponytailLevel)?.desc}
            </span>
          </div>
        )}
      </div>

      {/* 05 · PXPIPE */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>05</b> · PXPIPE</span>
          <div className="acts">
            <Toggle
              checked={pxpipeEnabled}
              disabled={!pxpipeStatus.installed}
              onChange={() => handlePxpipeEnabled(!pxpipeEnabled)}
              aria-label="PXPIPE"
              title="Compress prompts as images"
            />
            <Button size="sm" onClick={() => setShowPxpipeModal(true)}>
              Settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (window.location.href = "/dashboard/pxpipe")}
            >
              Dashboard
            </Button>
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">Interface</div>
            <div className="v muted">
              pxpipe{pxpipeStatus.version ? ` · v${pxpipeStatus.version}` : ""}
            </div>
          </div>
          <div className="kv">
            <div className="k">Status</div>
            <div className="v muted">{pxpipeStatusLabel}</div>
          </div>
        </div>
      </div>
    </>
  );
}