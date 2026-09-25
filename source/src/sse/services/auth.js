import { getProviderConnections, validateApiKey, updateProviderConnection, getSettings, getProxyPools } from "@/lib/localDb";
import { resolveConnectionProxyConfig, pickProxyPoolId } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

/**
 * Extract clean human-readable message from upstream error response.
 * Handles DashScope JSON format: [400]: {"error":{"message":"..."}}
 * Also handles OpenAI standard: {"error":{"message":"..."}}
 * Returns original text if no known pattern matches.
 */
function extractCleanErrorMessage(errorText) {
  if (!errorText || typeof errorText !== "string") return errorText;
  try {
    const text = errorText.replace(/^\[\d+\]:\s*/, "");
    const parsed = JSON.parse(text);
    const msg = parsed?.error?.message || parsed?.message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  } catch {}
  const jsonMatch = errorText.match(/\{\s*"error"\s*:\s*\{\s*"message"\s*:\s*"([\s\S]+?)"(?:\s*[,}]|\s*$)/);
  if (jsonMatch && jsonMatch[1]) return jsonMatch[1];
  return errorText.length > 200 ? errorText.slice(0, 200) : errorText;
}
import { MAX_RATE_LIMIT_COOLDOWN_MS } from "open-sse/config/errorConfig.js";
import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";
import { getAntigravityQuotaCache } from "./antigravityQuota.js";
import * as log from "../utils/logger.js";

// Mutex to prevent race conditions during account selection
let selectionMutex = Promise.resolve();

// Model availability cache: fast-skip fully exhausted models without disabling API keys
const availabilityCache = new Map();
const AVAILABILITY_CACHE_TTL = 10000;
const AVAILABILITY_CACHE_TTL_ZERO = 60000;

function getAvailKey(provider, model) {
  return `${provider}:${model || '*all'}`;
}

function checkCachedAvailable(provider, model) {
  const k = getAvailKey(provider, model);
  const c = availabilityCache.get(k);
  if (c && Date.now() - c.t < (c.avail === 0 ? AVAILABILITY_CACHE_TTL_ZERO : AVAILABILITY_CACHE_TTL)) return c.avail;
  return null;
}

function setCachedAvailable(provider, model, avail) {
  const k = getAvailKey(provider, model);
  availabilityCache.set(k, { avail, t: Date.now() });
  if (availabilityCache.size > 500) {
    const cutoff = Date.now() - AVAILABILITY_CACHE_TTL_ZERO;
    for (const [key, v] of availabilityCache) if (v.t < cutoff) availabilityCache.delete(key);
  }
}

function invalidateAvailability(provider, model) {
  const k = getAvailKey(provider, model);
  availabilityCache.delete(k);
}

const GITHUB_MONTHLY_USAGE_LIMIT = "you've reached your additional usage limit for your plan";

function githubMonthlyResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "github" || Number(status) !== 402) return null;
  if (!String(errorText || "").toLowerCase().includes(GITHUB_MONTHLY_USAGE_LIMIT)) return null;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/**
 * Get provider credentials from localDb
 * Filters out unavailable accounts and returns the selected account based on strategy
 * @param {string} provider - Provider name
 * @param {Set<string>|string|null} excludeConnectionIds - Connection ID(s) to exclude (for retry with next account)
 * @param {string|null} model - Model name for per-model rate limit filtering
 */
export async function getProviderCredentials(provider, excludeConnectionIds = null, model = null, options = {}) {
  // Normalize to Set for consistent handling
  const excludeSet = excludeConnectionIds instanceof Set
    ? excludeConnectionIds
    : (excludeConnectionIds ? new Set([excludeConnectionIds]) : new Set());
  const preferredConnectionId = options?.preferredConnectionId || null;
  // Acquire mutex to prevent race conditions
  const currentMutex = selectionMutex;
  let resolveMutex;
  selectionMutex = new Promise(resolve => { resolveMutex = resolve; });

  try {
    await currentMutex;

    // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
    const providerId = resolveProviderId(provider);

    // Inject a virtual connection for no-auth free providers (with optional proxy pool from settings)
    if (FREE_PROVIDERS[providerId]?.noAuth) {
      const settings = await getSettings();
      const override = (settings.providerStrategies || {})[providerId] || {};
      const strategy = override.rotateStrategy || "none";
      let pickedId = override.proxyPoolId || null;
      if (strategy !== "none") {
        const allPools = await getProxyPools({ isActive: true });
        const poolIds = allPools.filter(p => p.proxyUrl).map(p => p.id);
        pickedId = pickProxyPoolId(poolIds, strategy, providerId);
      }
      const resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: pickedId || "" });
      return {
        id: "noauth",
        connectionName: "Public",
        isActive: true,
        accessToken: "public",
        providerSpecificData: {
          connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
          connectionProxyUrl: resolvedProxy.connectionProxyUrl,
          connectionNoProxy: resolvedProxy.connectionNoProxy,
          connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
          vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
        },
      };
    }

    // Fast-skip: known zero-available model from short-lived cache
    if (model) {
      const cachedAvail = checkCachedAvailable(provider, model);
      if (cachedAvail === 0) {
        log.debug("AUTH", `${provider}/${model} | fast-skip: 0 available (cache)`);
        return { allRateLimited: true, retryAfter: null, retryAfterHuman: null, lastError: "All connections exhausted for this model", lastErrorCode: null };
      }
    }

    const connections = await getProviderConnections({ provider: providerId, isActive: true });
    log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeIds: ${excludeSet.size > 0 ? [...excludeSet].join(",") : "none"}, model: ${model || "any"}`);

    if (connections.length === 0) {
      log.warn("AUTH", `No credentials for ${provider}`);
      return null;
    }

    // Antigravity quota cache is lazy: only populated after that account returns 409/429.
    const isAntigravity = providerId === "antigravity";
    const antigravityQuotaCache = isAntigravity && model ? getAntigravityQuotaCache() : null;

    // Filter out model-locked, excluded, and Antigravity quota-exhausted connections.
    const availableConnections = connections.filter(c => {
      if (excludeSet.has(c.id)) return false;
      if (isModelLockActive(c, model)) return false;
      // Antigravity: skip if live quota exhausted for this model
      if (isAntigravity && model && antigravityQuotaCache) {
        const quota = antigravityQuotaCache.get(c.id)?.[model];
        if (quota && quota.remainingPercentage <= 0 && quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()) {
          const account = c.id?.slice(0, 8) || "unknown";
          log.info("AG_QUOTA", `${account} | CACHE_BLOCK ${model} — skip upstream until ${quota.resetAt}`);
          return false;
        }
      }
      return true;
    });

    // Mayday Patch 36: Self-healing cleanup of expired transient modelLock_* fields.
    // isModelLockActive() above already SKIPS expired locks (so selection is correct at runtime),
    // but the stale field lingers in the DB forever unless that exact key later succeeds a
    // request (clearAccountError only fires on success). Left uncleaned, hundreds of expired
    // modelLock_ entries accumulate and make the dashboard over-report "limit" state.
    // Here we proactively strip expired modelLock_* fields during selection (fire-and-forget,
    // never blocks the request). Permanent modelExhausted_* flags are NEVER touched.
    const nowMs = Date.now();
    for (const c of connections) {
      const expiredLocks = Object.keys(c).filter(k =>
        k.startsWith("modelLock_") && c[k] && new Date(c[k]).getTime() <= nowMs
      );
      if (expiredLocks.length > 0) {
        const clearObj = {};
        for (const k of expiredLocks) clearObj[k] = null;
        updateProviderConnection(c.id, clearObj).catch(() => {});
      }
    }

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    if (model) {
      setCachedAvailable(provider, model, availableConnections.length);
      log.debug("AUTH", `${provider}/${model} | cache-set: ${availableConnections.length}`);
    }
    connections.forEach(c => {
      const excluded = excludeSet.has(c.id);
      const locked = isModelLockActive(c, model);
      if (excluded || locked) {
        const lockUntil = getEarliestModelLockUntil(c);
        log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
      }
    });

    if (availableConnections.length === 0) {
      // Find earliest persistent lock or lazy Antigravity quota-cache reset for retry timing.
      const lockedConns = connections.filter(c => isModelLockActive(c, model));
      const expiries = lockedConns.map(c => getEarliestModelLockUntil(c)).filter(Boolean);
      if (isAntigravity && model && antigravityQuotaCache) {
        connections.forEach((c) => {
          const resetAt = antigravityQuotaCache.get(c.id)?.[model]?.resetAt;
          if (resetAt && new Date(resetAt).getTime() > Date.now()) expiries.push(resetAt);
        });
      }
      const earliest = expiries.sort()[0] || null;
      if (earliest) {
        const earliestConn = lockedConns[0];
        log.warn("AUTH", `${provider} | all ${connections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
        return {
          allRateLimited: true,
          retryAfter: earliest,
          retryAfterHuman: formatRetryAfter(earliest),
          lastError: earliestConn?.lastError || null,
          lastErrorCode: earliestConn?.errorCode || null
        };
      }
      log.warn("AUTH", `${provider} | all ${connections.length} accounts exhausted/unavailable for ${model || "all"}`);
      return {
        allRateLimited: true,
        retryAfter: null,
        retryAfterHuman: null,
        lastError: "All connections exhausted for this model",
        lastErrorCode: null
      };
    }

    const settings = await getSettings();
    // Per-provider strategy overrides global setting
    const providerOverride = (settings.providerStrategies || {})[providerId] || {};
    const strategy = providerOverride.fallbackStrategy || settings.fallbackStrategy || "fill-first";

    let connection;
    // Pin to preferred connection if specified and available
    if (preferredConnectionId) {
      connection = availableConnections.find((c) => c.id === preferredConnectionId);
      if (connection) {
        log.info("AUTH", `${provider} | pinned to ${connection.id?.slice(0, 8)} (${connection.name || connection.email || "unnamed"})`);
      }
    }
    if (connection) {
      // skip strategy
    } else if (strategy === "round-robin") {
      const stickyLimit = providerOverride.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3;

      // Sort by lastUsed (most recent first) to find current candidate
      const byRecency = [...availableConnections].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const current = byRecency[0];
      const currentCount = current?.consecutiveUseCount || 0;

      if (current && current.lastUsedAt && currentCount < stickyLimit) {
        // Stay with current account
        connection = current;
        // Update lastUsedAt and increment count (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: (connection.consecutiveUseCount || 0) + 1
        });
      } else {
        // Pick the least recently used (excluding current if possible)
        const sortedByOldest = [...availableConnections].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        // Update lastUsedAt and reset count to 1 (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: 1
        });
      }
    } else {
      // Default: fill-first (already sorted by priority in getProviderConnections)
      connection = availableConnections[0];
    }

    const resolvedProxy = await resolveConnectionProxyConfig(connection.providerSpecificData || {});

    return {
      authType: connection.authType,
      apiKey: connection.apiKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      idToken: connection.idToken,
      expiresAt: connection.expiresAt,
      expiresIn: connection.expiresIn,
      lastRefreshAt: connection.lastRefreshAt,
      projectId: connection.projectId,
      connectionName: connection.displayName || connection.name || connection.email || connection.id,
      copilotToken: connection.providerSpecificData?.copilotToken,
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
        connectionProxyUrl: resolvedProxy.connectionProxyUrl,
        connectionNoProxy: resolvedProxy.connectionNoProxy,
        connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
        vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
      },
      connectionId: connection.id,
      // Include current status for optimization check
      testStatus: connection.testStatus,
      lastError: connection.lastError,
      // Pass full connection for clearAccountError to read modelLock_* keys
      _connection: connection
    };
  } finally {
    if (resolveMutex) resolveMutex();
  }
}

/**
 * Mark account+model as unavailable — locks modelLock_${model} in DB.
 * All errors (429, 401, 5xx, etc.) lock per model, not per account.
 * @param {string} connectionId
 * @param {number} status - HTTP status code from upstream
 * @param {string} errorText
 * @param {string|null} provider
 * @param {string|null} model - The specific model that triggered the error
 * @returns {{ shouldFallback: boolean, cooldownMs: number }}
 */
export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null, body = null) {
  if (!connectionId || connectionId === "noauth") return { shouldFallback: false, cooldownMs: 0 };
  const connections = await getProviderConnections({ provider });
  const conn = connections.find(c => c.id === connectionId);
  const backoffLevel = conn?.backoffLevel || 0;

  // GitHub premium-request exhaustion is account-wide until the next UTC month.
  const githubResetAtMs = githubMonthlyResetMs(status, errorText, provider);

  // Provider-specific precise cooldown (e.g. codex usage_limit_reached resets_at) overrides backoff
  let shouldFallback, cooldownMs, newBackoffLevel;
  if (githubResetAtMs) {
    shouldFallback = true;
    cooldownMs = githubResetAtMs - Date.now();
    newBackoffLevel = 0;
  } else if (resetsAtMs && resetsAtMs > Date.now()) {
    shouldFallback = true;
    // Antigravity quota API provides exact per-model resetAt. Do not truncate it.
    cooldownMs = resolveProviderId(provider) === "antigravity"
      ? resetsAtMs - Date.now()
      : Math.min(resetsAtMs - Date.now(), MAX_RATE_LIMIT_COOLDOWN_MS);
    newBackoffLevel = 0;
  } else {
    ({ shouldFallback, cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel));
  }
  if (!shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  const reason = typeof errorText === "string" ? extractCleanErrorMessage(errorText).slice(0, 100) : "Provider error";

  // Mayday Patch 10: Account-level lock for pay-as-you-go providers (Mimo: limit per API key, not per model)
  const connPrefix = conn?.providerSpecificData?.prefix;
  const isAccountLevel = connPrefix === "mm"; // Mimo: pay-as-you-go, limit per key
  const lockUpdate = buildModelLockUpdate(githubResetAtMs ? null : (isAccountLevel ? null : model), cooldownMs);

  // Mayday Patch 23: DashScope free quota exhaustion → permanent modelExhausted_ flag only.
  // Match by prefix ("md") OR resolved provider id ("dashscope-intl") so keys added via the
  // built-in registry (no providerSpecificData.prefix) still lock.
  // NOTE: DashScope returns 403 for some models (deepseek-v4-pro) but 400 for others
  // (kimi-k2.7-code) on quota exhaustion — accept both status codes.
  // GUARD: DashScope ALSO returns the SAME "free quota has been exhausted" text for
  // context-window overflow (e.g. kimi with a huge prompt). That is NOT an API-key limit —
  // the key stays usable for normal requests. Per user request, context-window overflow must
  // NOT leave any permanent marker on the API-provider page. So if the estimated input tokens
  // exceed the model's context window, skip the permanent modelExhausted_ mark entirely.
  const isDashscope = connPrefix === "md" || provider === "dashscope-intl";
  const isQuotaExhausted = isDashscope && (status === 403 || status === 400) &&
    typeof errorText === 'string' &&
    errorText.toLowerCase().includes('free quota has been exhausted');
  if (isQuotaExhausted && model) {
    // Rough token estimate (chars / 3.5) — detect context-window overflow before marking.
    let estTokens = 0;
    if (body && Array.isArray(body.messages)) {
      let chars = 0;
      for (const msg of body.messages) {
        const c = typeof msg.content === "string"
          ? msg.content.length
          : Array.isArray(msg.content)
            ? msg.content.reduce((s, p) => s + (typeof p.text === "string" ? p.text.length : 0), 0)
            : 0;
        chars += c;
      }
      if (body.system && typeof body.system === "string") chars += body.system.length;
      estTokens = Math.ceil(chars / 3.5);
    }
    const caps = getCapabilitiesForModel(provider, model);
    const isContextOverflow = caps?.contextWindow && estTokens > caps.contextWindow;
    if (isContextOverflow) {
      const ctxWindow = Math.round(caps.contextWindow / 1000) + 'K';
      const connNameCtx = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
      log.warn("AUTH", `⚠️ ${connNameCtx} ${model} — "free quota" text but est. ${estTokens} tokens > ${ctxWindow} context window → treating as context overflow, NOT marking key (still usable)`);
      // Do NOT mark modelExhausted_. Let the upstream error reach the client.
      return { shouldFallback: false, cooldownMs: 0 };
    }
    lockUpdate[`modelExhausted_${model}`] = true;
    delete lockUpdate[`modelLock_${model}`];
    const connNameExhaust = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `⚠️ ${connNameExhaust} modelExhausted_${model} [PERMANENT quota exhausted]`);
  }

  // Mayday Patch 23c: Context window exceeded → STOP fallback loop + clear error to client.
  // DashScope returns 400 "Range of input length should..." when request exceeds the model's
  // context window. Without this, every key gets a 30s transient lock and 9router loops all
  // ~600 keys (15-30 min "stuck") before returning the error to the client.
  // IMPORTANT: This is NOT an API-key limit — the key is still usable for normal-size requests.
  // So we do NOT mark modelExhausted_ (that would permanently skip the key). We just stop the
  // fallback loop immediately and let the upstream error reach the client with a clear cause.
  const isContextTooLong = isDashscope && status === 400 &&
    typeof errorText?.toLowerCase?.() === 'string' &&
    errorText.toLowerCase().includes('range of input length');
  if (isContextTooLong && model) {
    const caps = getCapabilitiesForModel(provider, model);
    const ctxWindow = caps?.contextWindow ? Math.round(caps.contextWindow / 1000) + 'K' : 'model';
    const connNameCtx = conn?.displayName || conn?.name || conn?.email || connectionId?.slice(0, 8);
    log.warn("AUTH", `⚠️ ${connNameCtx} context window exceeded (~${ctxWindow}) for ${model} — stopping fallback loop (key still usable)`);
    return { shouldFallback: false, cooldownMs: 0 };
  }

  // Mayday Patch 23d/35: Content-safety filter (DashScope DataInspectionFailed) → STOP fallback,
  // do NOT mark the key. This 400 "Input text data may contain inappropriate content" is an
  // INPUT problem (the user's prompt tripped the safety filter), NOT an API-key/quota limit.
  // Previously it fell through to the default transient lock and marked testStatus=unavailable,
  // which could permanently skip a perfectly usable key. So we stop the loop and let the
  // upstream error reach the client unchanged — the key stays usable for other prompts.
  const isContentFiltered = isDashscope && status === 400 &&
    typeof errorText?.toLowerCase?.() === 'string' && (
      errorText.toLowerCase().includes('data_inspection_failed') ||
      errorText.toLowerCase().includes('inappropriate content') ||
      errorText.toLowerCase().includes('DataInspectionFailed')
    );
  if (isContentFiltered && model) {
    const connNameCf = conn?.displayName || conn?.name || conn?.email || connectionId?.slice(0, 8);
    log.warn("AUTH", `⚠️ ${connNameCf} content-filter hit (${model}) — NOT marking key (input problem, key still usable)`);
    return { shouldFallback: false, cooldownMs: 0 };
  }

  // Persist lock: modelExhausted_ flag is in lockUpdate (set by isQuotaExhausted block above).
  // For DashScope quota exhaustion, skip lastError/errorCode — the "Limit: model_name" marker
  // is the only signal needed. Showing a verbose "free quota" message risks false impression
  // that the entire API key is dead, when only the marked model is exhausted.
  const updateData = {
    ...lockUpdate,
    testStatus: "unavailable",
    backoffLevel: newBackoffLevel ?? backoffLevel
  };
  if (!isQuotaExhausted) {
    updateData.lastError = reason;
    updateData.errorCode = status;
    updateData.lastErrorAt = new Date().toISOString();
  }
  await updateProviderConnection(connectionId, updateData);

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${model ? model + ' ' : ''}${status}]`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${model ? model + ' - ' : ''}${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

/**
 * Clear account error status on successful request.
 * - Clears modelLock_${model} (the model that just succeeded)
 * - Lazy-cleans any other expired modelLock_* keys
 * - Resets error state only if no active locks remain
 * @param {string} connectionId
 * @param {object} currentConnection - credentials object (has _connection) or raw connection
 * @param {string|null} model - model that succeeded
 */
export async function clearAccountError(connectionId, currentConnection, model = null) {
  if (!connectionId || connectionId === "noauth") return;
  const conn = currentConnection._connection || currentConnection;
  const now = Date.now();
  const allLockKeys = Object.keys(conn).filter(k => k.startsWith("modelLock_"));

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  // Keys to clear: current model's lock + all expired locks
  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    if (model && k === "modelLock___all") return true;    // account-level lock
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  if (keysToClear.length === 0 && conn.testStatus !== "unavailable" && !conn.lastError) return;

  // Check if any active locks remain after clearing
  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  // Always reset testStatus — connection IS healthy even if other modelLocks remain active.
  // Never clear modelExhausted_* flags (permanent quota exhaustion).
  Object.assign(clearObj, { testStatus: "active" });
  if (remainingActiveLocks.length === 0) {
    Object.assign(clearObj, { lastError: null, lastErrorAt: null, errorCode: null, backoffLevel: 0 });
  }

  await updateProviderConnection(connectionId, clearObj);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check Anthropic x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key (optional - for local use can skip)
 */
export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}
