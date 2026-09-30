"use client";

import { useState, useEffect, useRef } from "react";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import { Badge, Toggle, Tooltip } from "@/shared/components";
import CooldownTimer from "./CooldownTimer";

function shortErrorLabel(connection) {
  if (!connection) return "";
  const type = connection.lastErrorType;
  if (type === "runtime_error") return "RUNTIME";
  if (type === "upstream_auth_error" || type === "auth_missing" || type === "token_refresh_failed" || type === "token_expired") return "AUTH";
  if (type === "upstream_rate_limited") return "429";
  if (type === "upstream_unavailable") return "5XX";
  if (type === "network_error") return "NET";
  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400) return String(numericCode);
  const bracket = typeof connection.lastError === "string" ? connection.lastError.match(/^\[(\d+)\]/) : null;
  if (bracket) return bracket[1];
  const msg = String(connection.lastError || "").toLowerCase();
  if (msg.includes("invalid api key") || msg.includes("token invalid") || msg.includes("unauthorized") || msg.includes("revoked")) return "AUTH";
  return "ERR";
}

export default function ConnectionRow({ connection, proxyPools, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete, oneByOneStatus = null, autoPing = null, modelAssignmentOptions = null, onModelAssignmentChange = null, strictModelAssignment = false }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const selectedProxyIds = connection.providerSpecificData?.proxyPoolIds || (connection.providerSpecificData?.proxyPoolId ? [connection.providerSpecificData.proxyPoolId] : []);
  const rotationStrategy = connection.providerSpecificData?.proxyRotationStrategy || "none";
  const boundProxyPoolId = selectedProxyIds[0] || connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = selectedProxyIds.length > 1
    ? `${selectedProxyIds.length} pools (${rotationStrategy})`
    : boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId
      ? `Pool: ${boundProxyPoolId} (inactive/missing)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";
  const autoPingTooltip = autoPing?.provider === "codex"
    ? "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota."
    : "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.";

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant = "default";
  if (boundProxyPool?.isActive === true) {
    proxyBadgeVariant = "success";
  } else if (boundProxyPoolId || hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
        setShowProxyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      if (poolId === "__none__") {
        await onUpdateProxy(null);
      } else {
        await onUpdateProxy(poolId);
      }
      setShowProxyDropdown(false);
    } finally {
      setUpdatingProxy(false);
    }
  };

  const handleAdvancedProxy = async (strategy, ids) => {
    const activeIds = ids.filter((id) => proxyPoolMap.get(id)?.isActive === true);
    if (!activeIds.length) return;
    setUpdatingProxy(true);
    try {
      await onUpdateProxy({ proxyPoolIds: activeIds, proxyRotationStrategy: strategy });
      setShowProxyDropdown(false);
    } finally {
      setUpdatingProxy(false);
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
  const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
  const displayName = connection.name?.trim()
    || connection.email?.trim()
    || connection.displayName?.trim()
    || (isOAuthConnection ? "OAuth Account" : isCookieConnection ? "Cookie Account" : "API Key");
  const secondaryDisplayName = connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()
    ? connection.email.trim()
    : connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()
      ? connection.displayName.trim()
      : null;

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState(false);

  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_") && !k.startsWith("modelLock___all"))
    .map(([, v]) => v)
    .filter(v => !!v)
    .sort()[0] || null;

  // Extract exhausted model names from modelExhausted_* fields
  const exhaustedModels = Object.entries(connection)
    .filter(([k, v]) => k.startsWith("modelExhausted_") && v === true)
    .map(([k]) => k.replace("modelExhausted_", ""))
    .sort();

  useEffect(() => {
    let interval = null;
    const checkCooldown = () => {
      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v)
        .filter(v => v && new Date(v).getTime() > Date.now())
        .sort()[0] || null;
      setIsCooldown(!!until);
    };

    checkCooldown();
    if (modelLockUntil) {
      interval = setInterval(checkCooldown, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelLockUntil, connection]);

  // Determine effective status (override unavailable if cooldown expired)
  const effectiveStatus = (connection.testStatus === "unavailable" && !isCooldown)
    ? "active"  // Cooldown expired u2192 treat as active
    : connection.testStatus;

  const getStatusVariant = () => getConnectionStatusVariant(connection.isActive, effectiveStatus);
  const statusVariant = getStatusVariant();
  const statusLed = statusVariant === "success" ? "ok" : statusVariant === "error" ? "down" : "info";

  const getOneByOneVariant = () => {
    if (!oneByOneStatus) return "default";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return "error";
    if (oneByOneStatus.state === "testing") return "primary";
    return "default";
  };

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "queued";
    if (oneByOneStatus.state === "testing") return "testing";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
    return null;
  };

  return (
    <div className="contents">
      {/* Connection name + account */}
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold">{displayName}</div>
        {secondaryDisplayName && (
          <div className="truncate text-[11px] text-text-subtle">{secondaryDisplayName}</div>
        )}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span className="tag">{authLabel}</span>
          {getOneByOneLabel() && (
            <Badge variant={getOneByOneVariant()} size="sm">
              {getOneByOneLabel()}
            </Badge>
          )}
          {connection.lastError && connection.isActive !== false && (
            <span className="max-w-full truncate text-[11px] text-text-muted" title={connection.lastError}>
              {shortErrorLabel(connection)}
            </span>
          )}
          {exhaustedModels.length > 0 && connection.isActive !== false && (
            <span className="max-w-full truncate text-[11px] text-text-muted" title={`Quota exhausted: ${exhaustedModels.join(', ')}`}>
              ⚠️ Limit: {exhaustedModels.slice(0, 3).join(', ')}{exhaustedModels.length > 3 ? ` +${exhaustedModels.length - 3} more` : ''}
            </span>
          )}
        </div>
        {modelAssignmentOptions && onModelAssignmentChange && (
          <select
            value={Object.prototype.hasOwnProperty.call(connection.providerSpecificData || {}, "assignedModel")
              ? (connection.providerSpecificData.assignedModel || "")
              : (connection.providerSpecificData?.freebuffModel || "")}
            onChange={(event) => onModelAssignmentChange(event.target.value)}
            disabled={!strictModelAssignment}
            className="mt-1 max-w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] text-text-main"
            title="Model assignment"
          >
            <option value="">Unassigned</option>
            {modelAssignmentOptions.map((model) => (
              <option key={model.id} value={model.id}>{model.name || model.id}</option>
            ))}
          </select>
        )}
      </div>

      {/* Priority + reorder */}
      <div className="flex items-center gap-1 text-xs text-text-muted">
        <span className="tabular-nums">{connection.priority}</span>
        {connection.globalPriority && (
          <span className="text-[9px] text-text-subtle">Auto: {connection.globalPriority}</span>
        )}
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
        >
          <span className="material-symbols-outlined text-sm leading-none">keyboard_arrow_up</span>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
        >
          <span className="material-symbols-outlined text-sm leading-none">keyboard_arrow_down</span>
        </button>
      </div>

      {/* Last test */}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`led ${statusLed}`}></span>
        <span className="truncate text-[11px] text-text-muted">
          {connection.isActive === false ? "disabled" : (effectiveStatus || "Unknown")}
        </span>
        {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
      </div>

      {/* Pool */}
      <div className="min-w-0">
        {hasAnyProxy ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11px] text-text-muted" title={proxyDisplayText}>
              {proxyDisplayText}
            </span>
            {maskedProxyUrl && (
              <code className="truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5">
                {maskedProxyUrl}
              </code>
            )}
            {noProxyText && (
              <span className="truncate text-[10px] text-text-subtle" title={noProxyText}>
                no_proxy: {noProxyText}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-text-subtle">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        {(proxyPools || []).length > 0 && (
          <div className="relative" ref={proxyDropdownRef}>
             <button
               type="button"
               onClick={() => setShowProxyDropdown((v) => !v)}
              className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`}
              disabled={updatingProxy}
            >
              <span className="material-symbols-outlined text-[18px]">
                {updatingProxy ? "progress_activity" : "lan"}
              </span>
              <span className="text-[10px] leading-tight">Proxy</span>
            </button>
            {showProxyDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1 max-w-[78vw] min-w-[160px] rounded-lg border border-border bg-bg py-1 shadow-lg">
                {rotationStrategy === "smart" && <p className="px-3 py-1 text-[10px] text-text-muted">Smart skips unfit pools for this provider/model.</p>}
                 <button
                   type="button"
                   onClick={() => handleSelectProxy("__none__")}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${!boundProxyPoolId ? "text-primary font-medium" : "text-text-main"}`}
                >
                  None
                </button>
                <p className="px-3 pt-2 text-[10px] font-medium uppercase text-text-muted">Rotation</p>
                {["fill-first", "round-robin", "random", "smart"].map((strategy) => (
                   <button
                     type="button"
                     key={strategy}
                     onClick={() => handleAdvancedProxy(strategy, selectedProxyIds.length > 1 ? selectedProxyIds : (proxyPools || []).filter((pool) => pool.isActive).map((pool) => pool.id))}
                     disabled={updatingProxy}
                     className={`w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 ${rotationStrategy === strategy ? "font-medium text-primary" : "text-text-main"}`}
                  >
                    {strategy === "smart" ? "Smart (provider/model aware)" : strategy}
                  </button>
                ))}
                <p className="px-3 pt-2 text-[10px] font-medium uppercase text-text-muted">Single pool</p>
                {(proxyPools || []).map((pool) => (
                   <button
                     type="button"
                     key={pool.id}
                     onClick={() => handleSelectProxy(pool.id)}
                     disabled={updatingProxy || pool.isActive !== true}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${boundProxyPoolId === pool.id ? "text-primary font-medium" : "text-text-main"}`}
                  >
                    {pool.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {autoPing && (
          <Tooltip text={autoPingTooltip}>
            <button
              onClick={() => autoPing.onToggle(!autoPing.on)}
              className={`flex flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${autoPing.on ? "text-primary" : "text-text-muted hover:text-primary"}`}
            >
              <span className="material-symbols-outlined text-[18px]">bolt</span>
              <span className="text-[10px] leading-tight">Auto-ping</span>
            </button>
          </Tooltip>
        )}
        <button onClick={onEdit} className="text-[11px] uppercase tracking-wide text-text-muted hover:text-primary">
          Edit
        </button>
        <button onClick={onDelete} className="text-[11px] uppercase tracking-wide text-text-muted hover:text-danger">
          Delete
        </button>
        <Toggle
          size="sm"
          checked={connection.isActive ?? true}
          onChange={onToggleActive}
          title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
        />
      </div>
    </div>
  );
}