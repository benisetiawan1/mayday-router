#!/usr/bin/env python3
"""
Mayday Auto-Patcher for 9router
Auto-applies custom patches after upstream update & before Docker build.

Usage:
  python3 scripts/auto-patch.py        # Apply all patches
  python3 scripts/auto-patch.py --check # Check if patches would apply cleanly
"""

import os
import re
import sys
import json

SRC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PATCHES = []

APPLIED_SENTINELS = {
    "account-level-lock-for-payg": "const isAccountLevel = connPrefix === \"mm\"",
    "register-dashscope-intl-registry": "./dashscope-intl.js",
    "add-dashscope-intl-to-exports": "./dashscope-intl.js",
    "dashscope-per-model-quota-lock": "modelExhausted_${model}",
    "dashscope-context-window-capabilities": '"dashscope-intl": {',
    "markaccountunavailable-full-guard": "extractCleanErrorMessage",
    "chatjs-context-window-guard": "estimateInputTokens",
    "authjs-self-heal-expired-locks": "expiredLocks",
}


# ── Patch 1: Remove "only one connection" guard for compatible nodes ──
PATCHES.append({
    "id": "remove-connection-guard",
    "file": "src/app/api/providers/route.js",
    "description": "Remove 'only one connection' guard for openai-compatible/anthropic/embedding nodes (bulk key pool support)",
    "find": """      const existingConnections = await getProviderConnections({ provider });
      if (existingConnections.length > 0) {
        return NextResponse.json({ error: "Only one connection is allowed for this OpenAI Compatible node" }, { status: 400 });
      }""",
    "replace": "",
})

PATCHES.append({
    "id": "remove-connection-guard-anthropic",
    "file": "src/app/api/providers/route.js",
    "description": "Remove 'only one connection' guard for anthropic-compatible nodes",
    "find": """      const existingConnections = await getProviderConnections({ provider });
      if (existingConnections.length > 0) {
        return NextResponse.json({ error: "Only one connection is allowed for this Anthropic Compatible node" }, { status: 400 });
      }""",
    "replace": "",
})

PATCHES.append({
    "id": "remove-connection-guard-embedding",
    "file": "src/app/api/providers/route.js",
    "description": "Remove 'only one connection' guard for custom embedding nodes",
    "find": """      const existingConnections = await getProviderConnections({ provider });
      if (existingConnections.length > 0) {
        return NextResponse.json({ error: "Only one connection is allowed for this Custom Embedding node" }, { status: 400 });
      }""",
    "replace": "",
})

# ── Patch 2: Show Add API Key button in connections footer for compatible ──
PATCHES.append({
    "id": "show-add-apikey-for-compatible",
    "file": "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    "description": "Show 'Add API Key' button in connections footer for openai-compatible providers",
    "find": """              {connectionsList}
              {!isCompatible && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">""",
    "replace": """              {connectionsList}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">
                {isCompatible && (
                  <Button
                    size="sm"
                    icon="add"
                    onClick={() => {
                      setAddConnectionError("");
                      setShowAddApiKeyModal(true);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Add API Key
                  </Button>
                )}
                {!isCompatible && (<>""",
})

PATCHES.append({
    "id": "close-show-add-apikey-for-compatible",
    "file": "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    "description": "Close fragment and div for compatible Add API Key button",
    "find": """                  )}
                </div>
              )}
            </>
          )}
        </Card>""",
    "replace": """                  )}
                </>)}
              </div>
            </>
          )}
        </Card>""",
})

# ── Patch 3-6: (DISABLED) connectionsCount — see comments below ──
# DISABLED: v0.5.45+ uses planBulkAdd() + existingNames which handles collision
# detection natively. The connectionsCount-based naming offset is legacy.
# Applying these REMOVED existingNames from the modal signature while
# handleBulkSubmit still references it → ReferenceError on Bulk Add.

# ── Patch 10+23+23c+34+35: markAccountUnavailable full guard (composite) ──
# This replaces the old separate patch 10 and patch 23 which had stale find strings.
# Applies to v0.5.59+ upstream which has:
#   buildModelLockUpdate(githubResetAtMs ? null : model, cooldownMs)
#   const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
# Includes: extractCleanErrorMessage, account-level-lock, DashScope quota lock,
# context-overflow guard, range-of-input-length guard, content-filter guard,
# model name in logs, skip lastError/errorCode for quota exhaustion.
PATCHES.append({
    "id": "markaccountunavailable-full-guard",
    "file": "src/sse/services/auth.js",
    "description": "Composite patch: extractCleanErrorMessage + account-level-lock + DashScope quota/context-overflow/content-filter guards + model name in logs",
    "find": """  const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
  const lockUpdate = buildModelLockUpdate(githubResetAtMs ? null : model, cooldownMs);

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    testStatus: "unavailable",
    lastError: reason,
    errorCode: status,
    lastErrorAt: new Date().toISOString(),
    backoffLevel: newBackoffLevel ?? backoffLevel
  });

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}""",
    "replace": """  const reason = typeof errorText === "string" ? extractCleanErrorMessage(errorText).slice(0, 100) : "Provider error";

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
}""",
})

# ── Patch 10a: Add body parameter to markAccountUnavailable signature ──
PATCHES.append({
    "id": "markaccountunavailable-body-param",
    "file": "src/sse/services/auth.js",
    "description": "Add body parameter to markAccountUnavailable for token estimation (DashScope context-overflow guard)",
    "find": """export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null) {""",
    "replace": """export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null, body = null) {""",
})

# ── Patch 10b+10c: Add getCapabilitiesForModel import + extractCleanErrorMessage ──
PATCHES.append({
    "id": "authjs-import-capabilities-and-extract-error",
    "file": "src/sse/services/auth.js",
    "description": "Import getCapabilitiesForModel + add extractCleanErrorMessage helper for DashScope JSON error parsing",
    "find": """import { formatRetryAfter, checkFallbackError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";""",
    "replace": """import { formatRetryAfter, checkFallbackError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
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
    const text = errorText.replace(/^\\[\\d+\\]:\\s*/, "");
    const parsed = JSON.parse(text);
    const msg = parsed?.error?.message || parsed?.message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  } catch {}
  const jsonMatch = errorText.match(/\\{\\s*"error"\\s*:\\s*\\{\\s*"message"\\s*:\\s*"([\\s\\S]+?)"(?:\\s*[,}]|\\s*$)/);
  if (jsonMatch && jsonMatch[1]) return jsonMatch[1];
  return errorText.length > 200 ? errorText.slice(0, 200) : errorText;
}""",
})

# ── Patch 11: Register dashscope-intl in registry index.js ──
# NOTE: Handled by ensure_dashscope_registry() adaptive helper below.
# Static patch kept as fallback for --check mode.
PATCHES.append({
    "id": "register-dashscope-intl-registry",
    "file": "open-sse/providers/registry/index.js",
    "description": "Import dashscope-intl registry entry (adaptive — see ensure_dashscope_registry)",
    "find": """import p99 from "./alims-intl.js";

export default [
  p0,""",
    "replace": """import p99 from "./alims-intl.js";
import p100 from "./dashscope-intl.js";

export default [
  p0,""",
})

# ── Patch 12: Add dashscope-intl to registry exports array ──
# NOTE: Also handled adaptively by ensure_dashscope_registry.
PATCHES.append({
    "id": "add-dashscope-intl-to-exports",
    "file": "open-sse/providers/registry/index.js",
    "description": "Add dashscope-intl to the registry exports array",
    "find": """  p99,
];""",
    "replace": """  p99,
  p100,
];""",
})

# ── Patch 13: Register dashscope image adapter ──
PATCHES.append({
    "id": "register-dashscope-image-adapter",
    "file": "open-sse/handlers/imageProviders/index.js",
    "description": "Import and register dashscope image adapter",
    "find": """import antigravity from "./antigravity.js";

const ADAPTERS""",
    "replace": """import antigravity from "./antigravity.js";
import dashscope from "./dashscope.js";

const ADAPTERS""",
})

# ── Patch 14: Add dashscope to ADAPTERS map ──
PATCHES.append({
    "id": "add-dashscope-to-adapters",
    "file": "open-sse/handlers/imageProviders/index.js",
    "description": "Add dashscope-intl to the ADAPTERS map",
    "find": """  antigravity,
  "fal-ai": falAi,""",
    "replace": """  antigravity,
  "dashscope-intl": dashscope,
  "fal-ai": falAi,""",
})

# ── Patch 15: Add dashscope-intl to embedding adapters ──
PATCHES.append({
    "id": "add-dashscope-to-embedding-adapters",
    "file": "open-sse/handlers/embeddingProviders/index.js",
    "description": "Add dashscope-intl to OpenAI-compatible embedding adapters",
    "find": """  "vercel-ai-gateway",
];

const ADAPTERS = {""",
    "replace": """  "vercel-ai-gateway",
  "dashscope-intl",  // DashScope: OpenAI-compatible embeddings
];

const ADAPTERS = {""",
})

# ── Patch 16: Add dashscope-intl test endpoint to provider test utils ──
PATCHES.append({
    "id": "add-dashscope-test-endpoint",
    "file": "src/app/api/providers/[id]/test/testUtils.js",
    "description": "Add dashscope-intl test endpoint (OpenAI-compatible /v1/models)",
    "find": """      case "alicode":
      case "alicode-intl":
      case "alims-intl": {
        // Aliyun Coding Plan uses OpenAI-compatible API; alims-intl uses Model Studio compatible-mode
        const aliBaseUrl = connection.provider === "alicode-intl"
          ? "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions"
          : connection.provider === "alims-intl"
          ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
          : "https://coding.dashscope.aliyuncs.com/v1/chat/completions";
        const res = await fetchWithConnectionProxy(aliBaseUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${connection.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: getDefaultModel(connection.provider), max_tokens: 1, messages: [{ role: "user", content: "test" }] }),
        }, effectiveProxy);
        const valid = res.status !== 401 && res.status !== 403;
        return { valid, error: valid ? null : "Invalid API key" };
      }""",
    "replace": """      case "alicode":
      case "alicode-intl": {
        // Aliyun Coding Plan uses OpenAI-compatible API
        const aliBaseUrl = connection.provider === "alicode-intl"
          ? "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions"
          : "https://coding.dashscope.aliyuncs.com/v1/chat/completions";
        const res = await fetchWithConnectionProxy(aliBaseUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${connection.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: getDefaultModel(connection.provider), max_tokens: 1, messages: [{ role: "user", content: "test" }] }),
        }, effectiveProxy);
        const valid = res.status !== 401 && res.status !== 403;
        return { valid, error: valid ? null : "Invalid API key" };
      }
      case "dashscope-intl": {
        // DashScope Intl — OpenAI-compatible /v1/models endpoint for connection test
        const dsBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models";
        const res = await fetchWithConnectionProxy(dsBaseUrl, {
          headers: { "Authorization": `Bearer ${connection.apiKey}` },
        }, effectiveProxy);
        return { valid: res.ok, error: res.ok ? null : "Invalid API key" };
      }""",
})

# ── Patch 17: Make /api/models/custom a public API endpoint ──
PATCHES.append({
    "id": "public-custom-models-api",
    "file": "src/dashboardGuard.js",
    "description": "Add /api/models/custom to PUBLIC_API_PATHS so dashboard can fetch custom models without auth token",
    "find": """  "/api/settings/require-login",
];

// Public top-level prefixes (LLM API endpoints with their own API key auth).""",
    "replace": """  "/api/settings/require-login",
  "/api/models/custom",
];

// Public top-level prefixes (LLM API endpoints with their own API key auth).""",
})

# ── Patch 18: Branding — rename app to Mayday ──
PATCHES.append({
    "id": "mayday-branding",
    "file": "src/shared/constants/config.js",
    "description": "Rename app from '9Router Proxy' to 'Mayday'",
    "find": """  name: "9Router Proxy",""",
    "replace": """  name: "Mayday",""",
})

# ── Patch 19: Branding — update page title to Mayday ──
PATCHES.append({
    "id": "mayday-page-title",
    "file": "src/app/layout.js",
    "description": "Change page title from '9Router' to 'Mayday'",
    "find": """  title: "9Router - AI Infrastructure Management",""",
    "replace": """  title: "Mayday - AI Infrastructure Management",""",
})

# ── Patch 20: Branding — update login page heading to Mayday ──
PATCHES.append({
    "id": "mayday-login-heading",
    "file": "src/app/login/page.js",
    "description": "Change login page heading from '9Router' to 'Mayday'",
    "find": """<h1 className="text-3xl font-bold text-primary mb-2">9Router</h1>""",
    "replace": """<h1 className="text-3xl font-bold text-primary mb-2">Mayday</h1>""",
})

# ── Patch 22: (NO-OP) Remove TTS/ASR from dashscope-intl ──
# dashscope-intl.js already has correct serviceKinds (no TTS/ASR) in the
# custom file we copied. This patch is kept as a no-op sentinel so
# --check mode shows it as "applied" instead of "file_missing".
PATCHES.append({
    "id": "remove-tts-asr-from-dashscope",
    "file": "open-sse/providers/registry/dashscope-intl.js",
    "description": "Remove TTS/STT service kinds from dashscope-intl (already correct in custom file)",
    "find": """  serviceKinds: ["llm", "embedding", "image", "imageToText"],""",
    "replace": """  serviceKinds: ["llm", "embedding", "image", "imageToText"],""",
})

# ── Patch 24: clearAccountError always reset testStatus ──
PATCHES.append({
    "id": "clear-account-error-always-active",
    "file": "src/sse/services/auth.js",
    "description": "Always reset testStatus to active when any model succeeds, even if other modelLocks remain",
    "find": """  // Only reset error state if no active locks remain
  if (remainingActiveLocks.length === 0) {
    Object.assign(clearObj, {
      testStatus: "active",
      lastError: null,
      errorCode: null,
      lastErrorAt: null,
      backoffLevel: 0
    });
  }""",
    "replace": """  // Always reset testStatus — connection IS healthy even if other modelLocks remain active.
  // Never clear modelExhausted_* flags (permanent quota exhaustion).
  Object.assign(clearObj, { testStatus: "active" });
  if (remainingActiveLocks.length === 0) {
    Object.assign(clearObj, { lastError: null, lastErrorAt: null, errorCode: null, backoffLevel: 0 });
  }""",
})

# ── Patch 25: isModelLockActive also check modelExhausted_ ──
PATCHES.append({
    "id": "model-exhausted-active-check",
    "file": "open-sse/services/accountFallback.js",
    "description": "isModelLockActive() also returns true when modelExhausted_${model} flag is set (permanent quota lock)",
    "find": """export function isModelLockActive(connection, model) {
  const key = getModelLockKey(model);
  const expiry = connection[key] || connection[MODEL_LOCK_ALL];
  if (!expiry) return false;
  return new Date(expiry).getTime() > Date.now();
}""",
    "replace": """export function isModelLockActive(connection, model) {
  // Permanent model exhaustion (DashScope quota exhausted)
  if (model && connection[`modelExhausted_${model}`]) return true;
  // Check temporary modelLock_ expiry
  const key = getModelLockKey(model);
  const expiry = connection[key] || connection[MODEL_LOCK_ALL];
  if (!expiry) return false;
  return new Date(expiry).getTime() > Date.now();
}""",
})

# ── Patch 26: ConnectionRow exhausted models indicator ──
PATCHES.append({
    "id": "connection-row-exhausted-indicator",
    "file": "src/app/(dashboard)/dashboard/providers/[id]/ConnectionRow.js",
    "description": "Show amber indicator when models are permanently exhausted (quota limit hit) on a connection",
    "find": """  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v)
    .filter(v => !!v)
    .sort()[0] || null;""",
    "replace": """  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_") && !k.startsWith("modelLock___all"))
    .map(([, v]) => v)
    .filter(v => !!v)
    .sort()[0] || null;

  // Extract exhausted model names from modelExhausted_* fields
  const exhaustedModels = Object.entries(connection)
    .filter(([k, v]) => k.startsWith("modelExhausted_") && v === true)
    .map(([k]) => k.replace("modelExhausted_", ""))
    .sort();""",
})

# ── Patch 27: ConnectionRow JSX exhausted indicator ──
PATCHES.append({
    "id": "connection-row-exhausted-jsx",
    "file": "src/app/(dashboard)/dashboard/providers/[id]/ConnectionRow.js",
    "description": "Show amber ⚠️ Limit tag after lastError when models are quota-exhausted",
    "find": """{connection.lastError && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            <span className="text-xs text-text-muted">#{connection.priority}</span>""",
    "replace": """{connection.lastError && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            {exhaustedModels.length > 0 && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-amber-500 sm:max-w-[300px]" title={`Quota exhausted: ${exhaustedModels.join(', ')}`}>
                ⚠️ Limit: {exhaustedModels.slice(0, 3).join(', ')}{exhaustedModels.length > 3 ? ` +${exhaustedModels.length - 3} more` : ''}
              </span>
            )}
            <span className="text-xs text-text-muted">#{connection.priority}</span>""",
})

# ── Patch 28: (NO-OP) Add contextWindow to deepseek models ──
# Already present in the custom dashscope-intl.js file we copied.
PATCHES.append({
    "id": "dashscope-deepseek-context-window",
    "file": "open-sse/providers/registry/dashscope-intl.js",
    "description": "Add contextWindow (1M) and maxOutput (384K) to deepseek-v4-pro/flash (already in custom file)",
    "find": """    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxOutput: 384000 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxOutput: 384000 },""",
    "replace": """    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxOutput: 384000 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxOutput: 384000 },""",
})

# ── Patch 29: Models info route — forward combo names to first sub-model ──
PATCHES.append({
    "id": "models-info-combo-context-window",
    "file": "src/app/api/v1/models/info/route.js",
    "description": "Handle combo model names in info endpoint: forward to first sub-model, preserve contextWindow",
    "find": """  const info = lookup(id, kind);
  if (!info) {""",
    "replace": """  // If this is a combo name (no provider prefix), resolve via first sub-model
  let info = lookup(id, kind);
  if (!info && !id.includes("/")) {
    try {
      const { getComboByName } = await import("@/lib/localDb");
      const combo = await getComboByName(id);
      if (combo?.models?.length > 0) {
        const firstModel = combo.models[0];
        const subInfo = lookup(firstModel, kind);
        if (subInfo) {
          info = { ...subInfo, id, name: id, owned_by: "combo" };
        }
      }
    } catch (_) { /* ignore, fall through */ }
  }
  if (!info) {""",
})

# ── Patch 30: (SKIP) Forward combo contextWindow to /v1/models response ──
# v0.5.59 restructured route.js — no "lookup(id, kind)" pattern exists.
# The ensure_context_window_check adaptive helper handles chat.js instead.
# Combo model resolution is handled natively by v0.5.59+ buildModelsList.

# ── Patch 31: Strip stream_options for non-streaming requests ──
# v0.5.59 already strips stream_options for non-streaming. Add DashScope streaming case.
PATCHES.append({
    "id": "strip-stream-options-non-streaming",
    "file": "open-sse/executors/default.js",
    "description": "Also strip stream_options for DashScope streaming requests (doesn't support it)",
    "find": """      // Strip stream_options when not streaming — some providers (DashScope) reject it
      if (!transformed.stream) {
        delete transformed.stream_options;
      }""",
    "replace": """      // Strip stream_options when not streaming — some providers (DashScope) reject it
      if (!transformed.stream) {
        delete transformed.stream_options;
      }
      // Mayday: also strip for DashScope streaming (doesn't support stream_options)
      if (transformed.stream && this.provider?.includes("dashscope")) {
        delete transformed.stream_options;
      }""",
})

# ── Patch 32: Media providers — count exhausted models (already in source) ──
# This patch adds exhaustedModels counting to ConnectionsCard.js
# Source already has this from container copy; updating find to match upstream v0.5.59
PATCHES.append({
    "id": "media-provider-exhausted-models",
    "file": "src/app/(dashboard)/dashboard/providers/components/ConnectionsCard.js",
    "description": "Add exhaustedModels extraction for media providers (v0.5.59+ compatible)",
    "find": """  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;""",
    "replace": """  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;

  // Extract exhausted model names from modelExhausted_* fields
  const exhaustedModels = Object.entries(connection)
    .filter(([k, v]) => k.startsWith("modelExhausted_") && v === true)
    .map(([k]) => k.replace("modelExhausted_", ""))
    .sort();""",
})

# ── Patch 33: Media providers — display exhausted models (already in source) ──
# This patch makes the lock check also consider modelExhausted_ flags
PATCHES.append({
    "id": "media-provider-exhausted-models-display",
    "file": "src/app/(dashboard)/dashboard/providers/components/ConnectionsCard.js",
    "description": "Update lock check to include modelExhausted_ flags (v0.5.59+ compatible)",
    "find": """      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v).filter(v => v && new Date(v).getTime() > Date.now()).sort()[0] || null;""",
    "replace": """      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_") || k.startsWith("modelExhausted_"))
        .some(([k, v]) => k.startsWith("modelExhausted_") ? v === true : (v && new Date(v).getTime() > Date.now())) ? new Date(8640000000000000).toISOString() : 
        Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v).filter(v => v && new Date(v).getTime() > Date.now()).sort()[0] || null;""",
})

# ── Patch 33b: DashScope context window capabilities ──
PATCHES.append({
    "id": "dashscope-context-window-capabilities",
    "file": "open-sse/providers/capabilities.js",
    "description": "Update dashscope-intl capabilities: fix kimi contextWindow/maxOutput/vision",
    "find": """    "kimi-k2.7-code":     { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
  },""",
    "replace": """    "kimi-k2.7-code":     { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 262144, maxOutput: 65536, vision: true },
  },""",
})

# ── Patch 33c: DashScope Qwen3.7 vision capabilities ──
PATCHES.append({
    "id": "dashscope-qwen37-vision",
    "file": "open-sse/providers/capabilities.js",
    "description": "Add vision:true to qwen3.7-max and qwen3.7-plus (multimodal models)",
    "find": """    "qwen3.7-max":        { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "qwen3.7-plus":       { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },""",
    "replace": """    "qwen3.7-max":        { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "qwen3.7-plus":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },""",
})

# ── Patch 37: SQLite busy_timeout → 30s ──
PATCHES.append({
    "id": "sqlite-busy-timeout-30s",
    "file": "src/lib/db/schema.js",
    "description": "Raise PRAGMA busy_timeout 5000→30000 to eliminate SQLITE_BUSY under concurrent writes",
    "find": "PRAGMA busy_timeout = 5000;",
    "replace": "PRAGMA busy_timeout = 30000;",
})

# ── Patch 38a: import dbCleanupCron in migrate.js ──
PATCHES.append({
    "id": "db-cleanup-cron-import",
    "file": "src/lib/db/migrate.js",
    "description": "Import the age-based DB cleanup cron module (custom file)",
    "find": """import { stringifyJson } from "./helpers/jsonCol.js";""",
    "replace": """import { stringifyJson } from "./helpers/jsonCol.js";
import { startDbCleanupCron } from "./repos/dbCleanupCron.js";""",
})

# ── Patch 38b: start dbCleanupCron at DB init ──
PATCHES.append({
    "id": "db-cleanup-cron-start",
    "file": "src/lib/db/migrate.js",
    "description": "Start periodic age-based cleanup of requestDetails/usageHistory/usageDaily",
    "find": """export async function runMigrationOnce(adapter) {
  if (_migratedAdapters.has(adapter)) return;
  _migratedAdapters.add(adapter);""",
    "replace": """export async function runMigrationOnce(adapter) {
  if (_migratedAdapters.has(adapter)) return;
  _migratedAdapters.add(adapter);
  startDbCleanupCron();""",
})

# ── Patch 39: (DISABLED) hard cap on chat fallback retries ──
# Upstream v0.5.40+ removed this cap (loop exhausts naturally via allRateLimited).

# ── Patch 39b: Safety maxAttempts — already in source from previous patch session ──
# The safety cap with dynamic maxAttempts calculation is already present in v0.5.59 source.
# This patch is kept as a sentinel for --check mode.
PATCHES.append({
    "id": "dynamic-fallback-max-attempts",
    "file": "src/sse/handlers/chat.js",
    "description": "Safety cap already present in v0.5.59 source (sentinel)",
    "find": """  // Safety cap maxAttempts = total active connections for this provider
  // On v0.5.40+ the loop already terminates naturally via allRateLimited.
  // This is just a safety net for edge cases.
  let maxAttempts = 0;""",
    "replace": """  // Safety cap maxAttempts = total active connections for this provider
  // On v0.5.40+ the loop already terminates naturally via allRateLimited.
  // This is just a safety net for edge cases.
  let maxAttempts = 0;""",
})

# ── Patch 39c: Import getProviderConnections ──
PATCHES.append({
    "id": "dynamic-fallback-import-getProviderConnections",
    "file": "src/sse/handlers/chat.js",
    "description": "Add getProviderConnections to localDb import for safety maxAttempts",
    "find": """import { getSettings } from "@/lib/localDb";""",
    "replace": """import { getSettings, getProviderConnections } from "@/lib/localDb";""",
})

# ── Patch 40a: bound refreshDedupCache (prevent unbounded growth) ──
PATCHES.append({
    "id": "token-dedup-cache-cap",
    "file": "open-sse/services/tokenRefresh/dedup.js",
    "description": "Cap refreshDedupCache size to avoid slow memory leak",
    "find": """const REFRESH_RESULT_TTL_MS = 10_000;
const refreshDedupCache = new Map();

export async function dedupRefresh(provider, oldToken, fn, log) {""",
    "replace": """const REFRESH_RESULT_TTL_MS = 10_000;
const refreshDedupCache = new Map();
const REFRESH_DEDUP_MAX_ENTRIES = 1000;

function evictRefreshDedupIfNeeded() {
  if (refreshDedupCache.size <= REFRESH_DEDUP_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of refreshDedupCache) {
    if (!v.promise && v.expiresAt <= now) refreshDedupCache.delete(k);
  }
  while (refreshDedupCache.size > REFRESH_DEDUP_MAX_ENTRIES) {
    const oldest = refreshDedupCache.keys().next().value;
    if (oldest === undefined) break;
    refreshDedupCache.delete(oldest);
  }
}

export async function dedupRefresh(provider, oldToken, fn, log) {""",
})

# ── Patch 40b: evict after caching a result ──
PATCHES.append({
    "id": "token-dedup-cache-cap-result",
    "file": "open-sse/services/tokenRefresh/dedup.js",
    "description": "Run eviction after storing a refreshed result",
    "find": """      refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });""",
    "replace": """      refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });
      evictRefreshDedupIfNeeded();""",
})

# ── Patch 40c: evict after registering an in-flight promise ──
PATCHES.append({
    "id": "token-dedup-cache-cap-promise",
    "file": "open-sse/services/tokenRefresh/dedup.js",
    "description": "Run eviction after registering an in-flight refresh promise",
    "find": """  refreshDedupCache.set(key, { promise });
  return promise;""",
    "replace": """  refreshDedupCache.set(key, { promise });
  evictRefreshDedupIfNeeded();
  return promise;""",
})


# ═══════════════════════════════════════════════════════════════════
# ADAPTIVE HELPERS — resilient to upstream changes
# ═══════════════════════════════════════════════════════════════════

def apply_patch(patch):
    filepath = os.path.join(SRC_DIR, patch["file"])
    if not os.path.exists(filepath):
        print(f"  ⚠ SKIP: {patch['file']} — file not found")
        return False

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Sentinel-based skip: dashscope capabilities block already present
    if patch["id"] == "dashscope-context-window-capabilities" and '"dashscope-intl": {' in content:
        print(f"  ✓ SKIP: {patch['id']} — already applied (dashscope-intl block present)")
        return False

    # Idempotency: check if replacement already applied
    if patch["replace"] in content:
        print(f"  ✓ SKIP: {patch['id']} — already applied")
        return False

    if patch["find"] not in content:
        print(f"  ⚠ SKIP: {patch['id']} — pattern not found (already patched or upstream changed)")
        return False

    new_content = content.replace(patch["find"], patch["replace"], 1)
    if new_content == content:
        print(f"  ⚠ SKIP: {patch['id']} — replace produced no change")
        return False

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  ✅ Applied: {patch['id']} — {patch['description']}")
    return True


def check_patch(patch):
    """Check if patch is applied, ready, or needs review."""
    filepath = os.path.join(SRC_DIR, patch["file"])
    if not os.path.exists(filepath):
        return "file_missing"

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    sentinel = APPLIED_SENTINELS.get(patch["id"])
    if patch["replace"] in content or (sentinel and sentinel in content):
        return "applied"
    if patch["find"] in content:
        return "ready"
    return "review"


def ensure_dashscope_registry():
    """Keep DashScope registry patch resilient to upstream provider count changes."""
    path = os.path.join(SRC_DIR, "open-sse/providers/registry/index.js")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    # Idempotency: dashscope-intl already imported AND present in exports array
    imported = re.search(r'^import p\d+ from "\.\/dashscope-intl\.js";$', content, re.M)
    exported = re.search(r'^import p(\d+) from "\.\/dashscope-intl\.js";$', content, re.M)
    if imported and exported:
        pid = exported.group(1)
        if re.search(rf'^\s*p{pid},?$', content, re.M):
            return False
    imports = re.findall(r'^import p(\d+) from "\.\/[^"]+\.js";$', content, re.M)
    if not imports:
        return False
    next_id = max(map(int, imports)) + 1
    if not re.search(r'^import p\d+ from "\.\/dashscope-intl\.js";$', content, re.M):
        content = re.sub(
            r'(import p\d+ from "\.\/[^"]+\.js";\n)(\nexport default \[)',
            rf'\1import p{next_id} from "./dashscope-intl.js";\n\2',
            content,
            count=1,
        )
    if not re.search(rf'^\s*p{next_id},?$', content, re.M):
        content = re.sub(r'(\n\s*p\d+\s*,?)(\n\s*\];)', rf'\1,\n  p{next_id}\2', content, count=1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("  ✅ Applied: ensure-dashscope-registry — adaptive registry insert")
    return True


def ensure_caveman_ponytail_tts_skip():
    """Adaptive TTS guard: skip caveman/ponytail injection when body.modalities includes audio."""
    path = os.path.join(SRC_DIR, "open-sse/handlers/chatCore.js")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "!body?.modalities?.include" in content:
        return False
    changed = False
    new_content = re.sub(
        r"(?m)^(\s*)if \((tokenSaverEnabled\s*&&\s*)?cavemanEnabled\s*&&\s*cavemanLevel\) \{",
        r'\1if (\2cavemanEnabled && cavemanLevel && !body?.modalities?.includes("audio")) {',
        content,
    )
    new_content = re.sub(
        r"(?m)^(\s*)if \((tokenSaverEnabled\s*&&\s*)?ponytailEnabled\s*&&\s*ponytailLevel\) \{",
        r'\1if (\2ponytailEnabled && ponytailLevel && !body?.modalities?.includes("audio")) {',
        new_content,
    )
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("  ✅ Applied: ensure-caveman-ponytail-tts-skip — adaptive audio guard")
        changed = True
    return changed


def ensure_context_window_check():
    """Adaptive context-window enforcement in src/sse/handlers/chat.js."""
    path = os.path.join(SRC_DIR, "src/sse/handlers/chat.js")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    changed = False

    if "getCapabilitiesForModel" not in content:
        last_import_end = 0
        for m in re.finditer(r"(?m)^import .+?;", content):
            last_import_end = m.end()
        if last_import_end:
            content = content[:last_import_end] + '\nimport { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";' + content[last_import_end:]
            changed = True

    if "function estimateInputTokens" not in content:
        helper = '\n// Rough token estimate (chars / 3.5) — good enough to detect context-window overflow\n// before marking an API key permanently exhausted.\nfunction estimateInputTokens(body) {\n  if (!body || !Array.isArray(body.messages)) return 0;\n  let chars = 0;\n  for (const msg of body.messages) {\n    const c = typeof msg.content === "string"\n      ? msg.content.length\n      : Array.isArray(msg.content)\n        ? msg.content.reduce((s, p) => s + (typeof p.text === "string" ? p.text.length : 0), 0)\n        : 0;\n    chars += c;\n  }\n  if (body.system && typeof body.system === "string") chars += body.system.length;\n  return Math.ceil(chars / 3.5);\n}\n'
        last_import_end = 0
        for m in re.finditer(r"(?m)^import .+?;", content):
            last_import_end = m.end()
        if last_import_end:
            content = content[:last_import_end] + helper + content[last_import_end:]
            changed = True

    # Insert context-window check before the fallback loop's markAccountUnavailable call
    routing_marker = '  // Routing shown in the unified "▶" line (client model -> provider/model)'
    if 'const caps = getCapabilitiesForModel(provider, model);' not in content and routing_marker in content:
        content = content.replace(
            routing_marker,
            """  const caps = getCapabilitiesForModel(provider, model);
  const contextWindow = caps?.contextWindow || 0;
  if (contextWindow > 0) {
    const inputTokens = estimateInputTokens(body);
    if (inputTokens > contextWindow) {
      log.warn("CHAT", `Input ${inputTokens} tokens exceeds ${model} context window ${contextWindow}`);
      return errorResponse(HTTP_STATUS.BAD_REQUEST,
        `Input too long: ${inputTokens} tokens exceeds ${model} context window of ${contextWindow} tokens. Reduce input or switch to a model with a larger context window.`);
    }
  }

  // Routing shown in the unified "▶" line (client model -> provider/model)""",
        )
        changed = True

    # Also add context-overflow guard inside the fallback loop (DashScope "free quota" false positive)
    loop_guard_marker = '    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)'
    if 'const isContextOverflow = result.status === 400 &&' not in content and loop_guard_marker in content:
        content = content.replace(
            loop_guard_marker,
            """    // Mayday guard: DashScope returns the SAME "free quota has been exhausted" text for BOTH
    // real quota exhaustion AND context-window overflow (e.g. kimi-k2.7-code with huge input).
    // If the request's estimated input tokens clearly exceed the model's context window, this is
    // a client-side context overflow — NOT an API-key limit. We must NOT mark the key permanently
    // exhausted (that would wrongly disable a still-usable key). Stop here and surface the error.
    const caps = getCapabilitiesForModel(provider, model);
    const ctxWindow = caps?.contextWindow ? Math.round(caps.contextWindow / 1000) + "K" : "model";
    const estTokens = estimateInputTokens(body);
    const isContextOverflow = result.status === 400 &&
      result.error?.toLowerCase?.().includes("free quota has been exhausted") &&
      caps?.contextWindow && estTokens > caps.contextWindow;
    if (isContextOverflow) {
      log.warn("CHAT", `⚠️ [${provider}/${model}] context window exceeded (~${estTokens} est. tokens > ${ctxWindow}) — NOT marking key (still usable for normal requests)`);
      return errorResponse(result.status || 400, `Context window exceeded (~${ctxWindow} tokens) for ${model}. Reduce input size — this is a request limit, not an API key limit.`);
    }

    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)""",
        )
        changed = True

    # Pass body to markAccountUnavailable so auth.js can estimate tokens
    if 'markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs, body)' not in content:
        content = re.sub(
            r'await markAccountUnavailable\(credentials\.connectionId,\s*result\.status,\s*result\.error,\s*provider,\s*model,\s*result\.resetsAtMs\)',
            'await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs, body)',
            content,
        )
        changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("  ✅ Applied: ensure-context-window-check — adaptive context enforcement")
    return changed


def ensure_vertex_token_dedup():
    """Adaptive Vertex token in-flight dedup for open-sse/services/tokenRefresh.js."""
    path = os.path.join(SRC_DIR, "open-sse/services/tokenRefresh.js")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    changed = False

    if "const vertexRefreshInFlight = new Map();" not in content:
        content = content.replace(
            "// Cache Vertex tokens keyed by service account email { token, expiresAt }\nconst vertexTokenCache = new Map();",
            "// Cache Vertex tokens keyed by service account email { token, expiresAt }\nconst vertexTokenCache = new Map();\n// In-flight mints per service account — prevent concurrent double-mint\nconst vertexRefreshInFlight = new Map();",
        )
        changed = True

    if "const inflight = vertexRefreshInFlight.get(cacheKey);" not in content:
        pattern = re.compile(
            r"(export\s+async\s+function\s+refreshVertexToken\(saJson,\s*log\)\s*\{)\n(.*?)\n(\})(?=\n\nfunction\s+vertexRefreshHandler)",
            re.S,
        )
        def _repl(m):
            return f"""{m.group(1)}
  // Share a single in-flight mint across concurrent callers for this SA
  const inflight = vertexRefreshInFlight.get(cacheKey);
  if (inflight) return inflight;

  const mintPromise = (async () => {{
{m.group(2)}
  }}).finally(() => {{
    vertexRefreshInFlight.delete(cacheKey);
  }});

  vertexRefreshInFlight.set(cacheKey, mintPromise);
  return mintPromise;
}}"""
        new_content, count = pattern.subn(_repl, content)
        if count:
            content = new_content
            changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("  ✅ Applied: ensure-vertex-token-dedup — adaptive Vertex dedup")
    return changed


def ensure_model_availability_cache():
    """Keep model availability fast-skip patch across upstream updates."""
    path = os.path.join(SRC_DIR, "src/sse/services/auth.js")
    if not os.path.exists(path):
        return False
    content = open(path, "r", encoding="utf-8").read()
    changed = False

    if "const availabilityCache = new Map();" not in content:
        content = content.replace(
            "// Mutex to prevent race conditions during account selection\nlet selectionMutex = Promise.resolve();",
            """// Mutex to prevent race conditions during account selection
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
}"""
        )
        changed = True

    if "fast-skip: 0 available (cache)" not in content:
        content = content.replace(
            "const connections = await getProviderConnections({ provider: providerId, isActive: true });",
            """// Fast-skip: known zero-available model from short-lived cache
    if (model) {
      const cachedAvail = checkCachedAvailable(provider, model);
      if (cachedAvail === 0) {
        log.debug("AUTH", `${provider}/${model} | fast-skip: 0 available (cache)`);
        return { allRateLimited: true, retryAfter: null, retryAfterHuman: null, lastError: "All connections exhausted for this model", lastErrorCode: null };
      }
    }

    const connections = await getProviderConnections({ provider: providerId, isActive: true });""",
            1,
        )
        changed = True

    if "cache-set" not in content:
        content = content.replace(
            'log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);',
            """log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    if (model) {
      setCachedAvailable(provider, model, availableConnections.length);
      log.debug("AUTH", `${provider}/${model} | cache-set: ${availableConnections.length}`);
    }""",
            1,
        )
        changed = True

    if "all ${connections.length} accounts exhausted/unavailable" not in content:
        content = content.replace(
            """log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
      return null;""",
            """log.warn("AUTH", `${provider} | all ${connections.length} accounts exhausted/unavailable for ${model || "all"}`);
      return {
        allRateLimited: true,
        retryAfter: null,
        retryAfterHuman: null,
        lastError: "All connections exhausted for this model",
        lastErrorCode: null
      };""",
            1,
        )
        changed = True

    if "invalidateAvailability(provider, model);" not in content:
        content = content.replace(
            """  // Only set testStatus/lastError for account-level errors
  const isAccountError = !model || (status === 401 && !isQuotaExhausted);""",
            """  // Invalidate availability cache for this provider+model
  if (provider && model) invalidateAvailability(provider, model);

  // Only set testStatus/lastError for account-level errors
  const isAccountError = !model || (status === 401 && !isQuotaExhausted);""",
            1,
        )
        changed = True

    # Mayday Patch 36: Self-healing cleanup of expired transient modelLock_* fields
    if "expiredLocks" not in content:
        content = content.replace(
            """    // Filter out model-locked and excluded connections
    const availableConnections = connections.filter(c => {""",
            """    // Filter out model-locked and excluded connections
    const availableConnections = connections.filter(c => {""",
        )
        # Insert self-heal block after the available connections filter, before the log.debug
        content = content.replace(
            """    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);""",
            """    // Mayday Patch 36: Self-healing cleanup of expired transient modelLock_* fields.
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

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);""",
            1,
        )
        changed = True

    if changed:
        open(path, "w", encoding="utf-8").write(content)
        print("  ✅ Applied: ensure-model-availability-cache + self-heal expired locks")
    return changed


def main():
    check_only = "--check" in sys.argv

    if check_only:
        print("🔍 Patch Check Report\n")
        all_ready = True
        for patch in PATCHES:
            status = check_patch(patch)
            icon = "✅" if status in ("applied", "ready") else "⚠️"
            print(f"  {icon} [{status}] {patch['id']}")
            if status not in ("applied", "ready"):
                all_ready = False
        if ensure_dashscope_registry():
            print("  ✅ [applied] ensure-dashscope-registry")
        if ensure_model_availability_cache():
            print("  ✅ [applied] ensure-model-availability-cache")
        print(f"\n{'✅ All patches applied/current or ready' if all_ready else '⚠️ Some patches need attention'}")
        return 0

    print("🔧 Applying 9router Mayday Patches\n")
    applied = 0
    skipped = 0
    for patch in PATCHES:
        if apply_patch(patch):
            applied += 1
        else:
            skipped += 1
    if ensure_dashscope_registry():
        applied += 1
    else:
        skipped += 1
    if ensure_caveman_ponytail_tts_skip():
        applied += 1
    else:
        skipped += 1
    if ensure_context_window_check():
        applied += 1
    else:
        skipped += 1
    if ensure_vertex_token_dedup():
        applied += 1
    else:
        skipped += 1
    if ensure_model_availability_cache():
        applied += 1
    else:
        skipped += 1

    print(f"\n📊 Results: {applied} applied, {skipped} skipped (already done or upstream changed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
