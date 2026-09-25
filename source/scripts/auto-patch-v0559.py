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

# ── Patch 3: (DISABLED) Add connectionsCount prop to AddApiKeyModal ──
# DISABLED: v0.5.45+ uses planBulkAdd() + existingNames which handles collision
# detection natively. The connectionsCount-based naming offset is legacy.
# Applying this + Patch 4 previously REMOVED existingNames from the modal
# signature while handleBulkSubmit still references it → ReferenceError:
# "existingNames is not defined" on Bulk Add. page.js passes existingNames
# (upstream) — do NOT touch it.
# PATCHES.append({
#     "id": "add-connectionscount-prop",
#     "file": "src/app/(dashboard)/dashboard/providers/[id]/page.js",
#     "description": "Pass connectionsCount to AddApiKeyModal for bulk import naming offset",
#     "find": """        onClose={() => {
#           setAddConnectionError("");
#           setShowAddApiKeyModal(false);
#         }}
#       />""",
#     "replace": """        onClose={() => {
#           setAddConnectionError("");
#           setShowAddApiKeyModal(false);
#         }}
#         connectionsCount={connections.length}
#       />""",
# })

# ── Patch 4: (DISABLED) Accept connectionsCount in modal ──
# DISABLED: same reason as Patch 3. This patch deleted `existingNames` from the
# AddApiKeyModal props signature — breaking planBulkAdd(lines, existingNames, ...)
# in handleBulkSubmit. Keep upstream signature (existingNames included).
# PATCHES.append({
#     "id": "accept-connectionscount-prop",
#     "file": "src/app/(dashboard)/dashboard/providers/[id]/AddApiKeyModal.js",
#     "description": "Accept connectionsCount prop in AddApiKeyModal",
#     "find": "export default function AddApiKeyModal({ isOpen, provider, providerName, isCompatible, isAnthropic, authType, authHint, website, proxyPools, error, existingNames, onSave, onBulkDone, onClose }) {",
#     "replace": "export default function AddApiKeyModal({ isOpen, provider, providerName, isCompatible, isAnthropic, authType, authHint, website, proxyPools, error, onSave, onBulkDone, onClose, connectionsCount }) {",
# })

# ── Patch 5: (DISABLED) Use connectionsCount for naming offset ──
# DISABLED: v0.5.45+ uses planBulkAdd() + existingNames which handles collision detection natively.
# The connectionsCount-based naming offset is no longer needed.

# ── Patch 6: (DISABLED) Add connectionsCount PropTypes ──
# DISABLED: same reason as Patch 3/4. connectionsCount is unused; propTypes
# must keep upstream shape (existingNames included).
# PATCHES.append({
#     "id": "add-connectionscount-proptypes",
#     "file": "src/app/(dashboard)/dashboard/providers/[id]/AddApiKeyModal.js",
#     "description": "Add connectionsCount to propTypes",
#     "find": """  onSave: PropTypes.func.isRequired,
#   onBulkDone: PropTypes.func,
#   onClose: PropTypes.func.isRequired,
# };""",
#     "replace": """  onSave: PropTypes.func.isRequired,
#   onBulkDone: PropTypes.func,
#   onClose: PropTypes.func.isRequired,
#   connectionsCount: PropTypes.number,
# };""",
# })

# ── Patch 10: Include model name in error log for precise diagnostics ──
# NOTE: This patch is now baked into the account-level lock patch below.
# The find pattern includes the old log format; the replace includes both
# the account-level lock logic AND the model-name-in-log enhancement.
PATCHES.append({
    "id": "account-level-lock-for-payg",
    "file": "src/sse/services/auth.js",
    "description": "Account-level lock for pay-as-you-go providers (Mimo: limit per API key, not per model) + model name in error logs",
    "find": """  const lockUpdate = buildModelLockUpdate(model, cooldownMs);

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    testStatus: \"unavailable\",
    lastError: reason,
    errorCode: status,
    lastErrorAt: new Date().toISOString(),
    backoffLevel: newBackoffLevel ?? backoffLevel
  });

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);""",
    "replace": """  // Account-level lock for pay-as-you-go providers (limit per API key, not per model)
  const connPrefix = conn?.providerSpecificData?.prefix;
  const isAccountLevel = connPrefix === "mm"; // Mimo: pay-as-you-go, limit per key
  const lockUpdate = buildModelLockUpdate(isAccountLevel ? null : model, cooldownMs);

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
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${model ? model + ' ' : ''}${status}]`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${model ? model + ' - ' : ''}${status}]: ${reason}`);""",
})


# ── Patch 11: Register dashscope-intl in registry index.js ──
PATCHES.append({
    "id": "register-dashscope-intl-registry",
    "file": "open-sse/providers/registry/index.js",
    "description": "Import dashscope-intl registry entry (v0.5.40+: p100 after alims-intl)",
    "find": """import p99 from "./alims-intl.js";

export default [
  p0,""",
    "replace": """import p99 from "./alims-intl.js";
import p100 from "./dashscope-intl.js";

export default [
  p0,""",
})

# ── Patch 12: Add dashscope-intl to registry exports array ──
PATCHES.append({
    "id": "add-dashscope-intl-to-exports",
    "file": "open-sse/providers/registry/index.js",
    "description": "Add dashscope-intl to the registry exports array (v0.5.40+: p100 after p99)",
    "find": """  p98,
  p99,
];""",
    "replace": """  p98,
  p99,
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
    "find": """      case \"alicode\":
      case \"alicode-intl\":
      case \"alims-intl\": {
        // Aliyun Coding Plan uses OpenAI-compatible API; alims-intl uses Model Studio compatible-mode
        const aliBaseUrl = connection.provider === \"alicode-intl\"
          ? \"https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions\"
          : connection.provider === \"alims-intl\"
          ? \"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions\"
          : \"https://coding.dashscope.aliyuncs.com/v1/chat/completions\";
        const res = await fetchWithConnectionProxy(aliBaseUrl, {
          method: \"POST\",
          headers: { \"Authorization\": `Bearer ${connection.apiKey}`, \"content-type\": \"application/json\" },
          body: JSON.stringify({ model: getDefaultModel(connection.provider), max_tokens: 1, messages: [{ role: \"user\", content: \"test\" }] }),
        }, effectiveProxy);
        const valid = res.status !== 401 && res.status !== 403;
        return { valid, error: valid ? null : \"Invalid API key\" };
      }""",
    "replace": """      case \"alicode\":
      case \"alicode-intl\": {
        // Aliyun Coding Plan uses OpenAI-compatible API
        const aliBaseUrl = connection.provider === \"alicode-intl\"
          ? \"https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions\"
          : \"https://coding.dashscope.aliyuncs.com/v1/chat/completions\";
        const res = await fetchWithConnectionProxy(aliBaseUrl, {
          method: \"POST\",
          headers: { \"Authorization\": `Bearer ${connection.apiKey}`, \"content-type\": \"application/json\" },
          body: JSON.stringify({ model: getDefaultModel(connection.provider), max_tokens: 1, messages: [{ role: \"user\", content: \"test\" }] }),
        }, effectiveProxy);
        const valid = res.status !== 401 && res.status !== 403;
        return { valid, error: valid ? null : \"Invalid API key\" };
      }
      case \"dashscope-intl\": {
        // DashScope Intl — OpenAI-compatible /v1/models endpoint for connection test
        const dsBaseUrl = \"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models\";
        const res = await fetchWithConnectionProxy(dsBaseUrl, {
          headers: { \"Authorization\": `Bearer ${connection.apiKey}` },
        }, effectiveProxy);
        return { valid: res.ok, error: res.ok ? null : \"Invalid API key\" };
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

# ── Patch 21: Skip caveman/ponytail for TTS (legacy static; now handled by adaptive helper below) ──


# ── Patch 22: Remove TTS/ASR from dashscope-intl registry ──
PATCHES.append({
    "id": "remove-tts-asr-from-dashscope",
    "file": "open-sse/providers/registry/dashscope-intl.js",
    "description": "Remove TTS/STT service kinds and hardcoded TTS/ASR models from dashscope-intl (not available on intl endpoint)",
    "find": """  serviceKinds: ["llm", "embedding", "image", "imageToText"],""",
    "replace": """  serviceKinds: ["llm", "embedding", "image", "imageToText"],""",
})


# ── Patch 23: DashScope per-model permanent quota exhaustion lock ──
PATCHES.append({
    "id": "dashscope-per-model-quota-lock",
    "file": "src/sse/services/auth.js",
    "description": "DashScope 403 quota exhausted → permanent modelExhausted_ + modelLock_ (2099), never set testStatus/lastError/errorCode for per-model errors",
    "find": """  const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
  // Account-level lock for pay-as-you-go providers (limit per API key, not per model)
  const connPrefix = conn?.providerSpecificData?.prefix;
  const isAccountLevel = connPrefix === "mm"; // Mimo: pay-as-you-go, limit per key
  const lockUpdate = buildModelLockUpdate(isAccountLevel ? null : model, cooldownMs);

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    testStatus: "unavailable",
    lastError: reason,
    errorCode: status,
    lastErrorAt: new Date().toISOString(),
    backoffLevel: newBackoffLevel ?? backoffLevel
  });

  const lockKey = Object.keys(lockUpdate)[0];""",
    "replace": """  const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
  // Account-level lock for pay-as-you-go providers (limit per API key, not per model)
  const connPrefix = conn?.providerSpecificData?.prefix;
  const isAccountLevel = connPrefix === "mm"; // Mimo: pay-as-you-go, limit per key
  const lockUpdate = buildModelLockUpdate(isAccountLevel ? null : model, cooldownMs);

  // DashScope free quota exhaustion → permanent modelExhausted_ flag only.
  // Match by prefix ("md") OR resolved provider id ("dashscope-intl") so keys
  // added via the built-in registry (no providerSpecificData.prefix) still lock.
  const isDashscope = connPrefix === "md" || provider === "dashscope-intl";
  const isQuotaExhausted = isDashscope && status === 403 &&
    typeof errorText === 'string' &&
    errorText.toLowerCase().includes('free quota has been exhausted');
  // isModelLockActive checks modelExhausted_ before modelLock_, so no timer needed
  if (isQuotaExhausted && model) {
    lockUpdate[`modelExhausted_${model}`] = true;
    delete lockUpdate[`modelLock_${model}`];
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `⚠️ ${connName} modelExhausted_${model} [PERMANENT quota exhausted]`);
  }

  // Only set testStatus/lastError for account-level errors
  const isAccountError = !model || (status === 401 && !isQuotaExhausted);

  if (isAccountError) {
    await updateProviderConnection(connectionId, {
      ...lockUpdate,
      testStatus: "unavailable",
      lastError: reason,
      errorCode: status,
      lastErrorAt: new Date().toISOString(),
      backoffLevel: newBackoffLevel ?? backoffLevel
    });
  } else {
    await updateProviderConnection(connectionId, lockUpdate);
  }

  const lockKey = Object.keys(lockUpdate)[0];""",
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

# ── Patch 28: Add contextWindow to deepseek models in dashscope-intl registry ──
PATCHES.append({
    "id": "dashscope-deepseek-context-window",
    "file": "open-sse/providers/registry/dashscope-intl.js",
    "description": "Add contextWindow (1M) and maxOutput (384K) to deepseek-v4-pro/flash",
    "find": "    { id: \"deepseek-v4-flash\", name: \"DeepSeek V4 Flash\" },\n    { id: \"deepseek-v4-pro\", name: \"DeepSeek V4 Pro\" },",
    "replace": "    { id: \"deepseek-v4-flash\", name: \"DeepSeek V4 Flash\", contextWindow: 1000000, maxOutput: 384000 },\n    { id: \"deepseek-v4-pro\", name: \"DeepSeek V4 Pro\", contextWindow: 1000000, maxOutput: 384000 },",
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

# ── Patch 30: Forward combo contextWindow to /v1/models response ──
PATCHES.append({
    "id": "v1-models-combo-context-window",
    "file": "src/app/api/v1/models/route.js",
    "description": "Forward contextWindow/maxOutput from first sub-model to combo entry in /v1/models",
    "find": """    if (combo.kind === "webSearch" || combo.kind === "webFetch") {
      entry.kind = combo.kind;
    }
    models.push(entry);
  }

  if (connections.length === 0) {""",
    "replace": """    // Forward contextWindow/maxOutput from first sub-model when available
    if (Array.isArray(combo.models) && combo.models.length > 0) {
      const firstModelId = combo.models[0];
      const slashIdx = firstModelId.indexOf("/");
      if (slashIdx > 0) {
        const providerAlias = firstModelId.slice(0, slashIdx);
        const modelId = firstModelId.slice(slashIdx + 1);
        const providerModels = PROVIDER_MODELS[providerAlias];
        if (Array.isArray(providerModels)) {
          const subModel = providerModels.find(m => m.id === modelId);
          if (subModel?.contextWindow) entry.contextWindow = subModel.contextWindow;
          if (subModel?.maxOutput) entry.maxOutput = subModel.maxOutput;
        }
      }
    }
    if (combo.kind === "webSearch" || combo.kind === "webFetch") {
      entry.kind = combo.kind;
    }
    models.push(entry);
  }

  if (connections.length === 0) {""",
})

# ── Patch 31: Strip stream_options when not streaming ──
PATCHES.append({
    "id": "strip-stream-options-non-streaming",
    "file": "open-sse/executors/default.js",
    "description": "Strip stream_options from request body when stream is not true (DashScope rejects it with 400)",
    "find": """      stripUnsupportedParams(this.provider, model, transformed);
    }

    return injectReasoningContent({ provider: this.provider, model, body: transformed });""",
    "replace": """      // Strip stream_options when not streaming — some providers (DashScope) reject it
      if (!transformed.stream) {
        delete transformed.stream_options;
      }
      stripUnsupportedParams(this.provider, model, transformed);
    }

    return injectReasoningContent({ provider: this.provider, model, body: transformed });""",
})


# ── Patch 32: Show exhausted model names in ConnectionsCard (media providers) ──
PATCHES.append({
    "id": "media-provider-exhausted-models",
    "file": "src/app/(dashboard)/dashboard/providers/components/ConnectionsCard.js",
    "description": "Show ⚠️ Limit: model names in media provider connections (like regular provider page)",
    "find": """  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;

  useEffect(() => {""",
    "replace": """  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;

  // Extract exhausted model names from modelExhausted_* fields
  const exhaustedModels = Object.entries(connection)
    .filter(([k, v]) => k.startsWith("modelExhausted_") && v === true)
    .map(([k]) => k.replace("modelExhausted_", ""))
    .sort();

  useEffect(() => {""",
})

PATCHES.append({
    "id": "media-provider-exhausted-models-display",
    "file": "src/app/(dashboard)/dashboard/providers/components/ConnectionsCard.js",
    "description": "Render exhausted model names in ConnectionRow (media providers)",
    "find": """            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <span className=\"text-xs text-red-500 truncate max-w-[300px]\" title={connection.lastError}>{connection.lastError}</span>
            )}""",
    "replace": """            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {exhaustedModels.length > 0 && connection.isActive !== false && (
              <span className=\"max-w-full truncate text-xs text-amber-500 sm:max-w-[300px]\" title={`Quota exhausted: ${exhaustedModels.join(', ')}`}>
                ⚠️ Limit: {exhaustedModels.slice(0, 3).join(', ')}{exhaustedModels.length > 3 ? ` +${exhaustedModels.length - 3} more` : ''}
              </span>
            )}
            {connection.lastError && connection.isActive !== false && (
              <span className=\"text-xs text-red-500 truncate max-w-[300px]\" title={connection.lastError}>{connection.lastError}</span>
            )}""",
})




# ── Patch 33: DashScope context window capabilities ──
PATCHES.append({
    "id": "dashscope-context-window-capabilities",
    "file": "open-sse/providers/capabilities.js",
    "description": "Add dashscope-intl provider capabilities with context window limits for known models",
    "find": """  // CodeBuddy.cn — authoritative per-model metadata from the gateway's model
  // config (contextWindow=maxInputTokens, maxOutput=maxOutputTokens, vision=
  // supportsImages). Every model reasons via OpenAI-style reasoning_effort
  // (see registry thinkingFormat). `onlyReasoning` models can't turn thinking
  // off → thinkingCanDisable:false (clamped to minimal instead of disabled).
  "codebuddy-cn": {
    "glm-5.2":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 48000 },
    "glm-5.1":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "glm-5.0":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "glm-5.0-turbo":      { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "glm-5v-turbo":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 38000 },
    "glm-4.7":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "minimax-m3":         { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 512000, maxOutput: 48000 },
    "minimax-m2.7":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "kimi-k2.7":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.6":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.5":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 164000, maxOutput: 32000 },
    "hy3-preview":        { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 192000, maxOutput: 64000 },
    "deepseek-v4-pro":    { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 50000 },
    "deepseek-v4-flash":  { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 50000 },
    "deepseek-v3-2-volc": { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 96000, maxOutput: 32000 },
  },""",
    "replace": """  // CodeBuddy.cn — authoritative per-model metadata from the gateway's model
  // config (contextWindow=maxInputTokens, maxOutput=maxOutputTokens, vision=
  // supportsImages). Every model reasons via OpenAI-style reasoning_effort
  // (see registry thinkingFormat). `onlyReasoning` models can't turn thinking
  // off → thinkingCanDisable:false (clamped to minimal instead of disabled).
  "codebuddy-cn": {
    "glm-5.2":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 48000 },
    "glm-5.1":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "glm-5.0":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "glm-5.0-turbo":      { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "glm-5v-turbo":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 38000 },
    "glm-4.7":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "minimax-m3":         { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 512000, maxOutput: 48000 },
    "minimax-m2.7":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "kimi-k2.7":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.6":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.5":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 164000, maxOutput: 32000 },
    "hy3-preview":        { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 192000, maxOutput: 64000 },
    "deepseek-v4-pro":    { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 50000 },
    "deepseek-v4-flash":  { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 50000 },
    "deepseek-v3-2-volc": { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 96000, maxOutput: 32000 },
  },
  // DashScope Intl — context window limits from upstream /v1/models & error messages.
  // Prevents "Range of input length" 400 errors by rejecting oversized requests early.
  "dashscope-intl": {
    "qwen3.7-max":        { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "qwen3.7-plus":       { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "qwen3-max":          { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "qwen-plus":          { contextWindow: 131072, maxOutput: 6144 },
    "qwen-flash":         { contextWindow: 131072, maxOutput: 6144 },
    "qwen-turbo":         { contextWindow: 131072, maxOutput: 6144 },
    "qwen-max":           { contextWindow: 131072, maxOutput: 6144 },
    "qwq-plus":           { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "deepseek-v4-flash":  { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 1000000, maxOutput: 384000 },
    "deepseek-v4-pro":    { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 1000000, maxOutput: 384000 },
    "deepseek-v3.2":      { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "glm-5.1":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "glm-5.2":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "ccai-pro":           { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
    "kimi-k2.7-code":     { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true,  contextWindow: 131072, maxOutput: 8192 },
  },
};""",
})

# ── Patch 34/35: Context window check (legacy static; now handled by adaptive helper below) ──

# ── Patch 37: SQLite busy_timeout → 30s (writer contention) ──
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
# These patches are disabled because they re-introduced a hardcoded maxAttempts=2 cap.
# Upstream v0.5.40+ removed this cap entirely (loop exhausts naturally via allRateLimited).
# For v0.5.35, the fix was baked directly into chat.js in our source.

# ── Patch 39b: Safety maxAttempts + calculation (merged pre-loop + loop) ──
# On v0.5.40+, the while loop has no hard cap - it exhausts naturally via allRateLimited.
# This patch adds both the maxAttempts calculation before the loop AND the safety check
# inside it. Combined into one patch to avoid ordering issues.
PATCHES.append({
    "id": "dynamic-fallback-max-attempts",
    "file": "src/sse/handlers/chat.js",
    "description": "Add safety maxAttempts = total connections for the provider (fallback guard, not hard cap)",
    "find": """  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);""",
    "replace": """  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  // Safety cap maxAttempts = total active connections for this provider
  // On v0.5.40+ the loop already terminates naturally via allRateLimited.
  // This is just a safety net for edge cases.
  let maxAttempts = 0;
  try {
    const allConns = await getProviderConnections({ provider, isActive: true });
    maxAttempts = allConns.length;
  } catch {
    maxAttempts = 2;
  }

  while (true) {
    // Safety cap: max retries = total connections for this provider.
    if (excludeConnectionIds.size > maxAttempts) {
      log.warn("CHAT", `Safety cap (${maxAttempts}) reached for ${provider}/${model}`);
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "Max retry attempts reached");
    }

    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);""",
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

# ── Patch 41: Vertex token in-flight dedup (legacy static; now handled by adaptive helper below) ──

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
        # Verify the import id appears in the exports array
        pid = exported.group(1)
        if re.search(rf'^\s*p{pid},?$', content, re.M):
            return False
    imports = re.findall(r'^import p(\d+) from "\.\/[^"]+\.js";$', content, re.M)
    if not imports:
        return False
    next_id = max(map(int, imports)) + 1
    # Only add import if not already present
    if not re.search(r'^import p\d+ from "\.\/dashscope-intl\.js";$', content, re.M):
        content = re.sub(
            r'(import p\d+ from "\.\/[^"]+\.js";\n)(\nexport default \[)',
            rf'\1import p{next_id} from "./dashscope-intl.js";\n\2',
            content,
            count=1,
        )
    # Add to exports array (handle trailing comma + comments before closing bracket)
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
            content = content[:last_import_end] + "\nimport { getCapabilitiesForModel } from \"open-sse/providers/capabilities.js\";" + content[last_import_end:]
            changed = True

    if "function estimateInputTokens" not in content:
        helper = "\nfunction estimateInputTokens(body) {\n  if (!body || !Array.isArray(body.messages)) return 0;\n  let chars = 0;\n  for (const msg of body.messages) {\n    const c = typeof msg.content === \"string\" ? msg.content.length\n      : Array.isArray(msg.content) ? msg.content.reduce((s, p) => s + (typeof p.text === \"string\" ? p.text.length : typeof p.image_url === \"object\" ? 1000 : 0), 0)\n      : 0;\n    chars += c;\n  }\n  if (body.system && typeof body.system === \"string\") chars += body.system.length;\n  return Math.ceil(chars / 3.5);\n}\n"
        last_import_end = 0
        for m in re.finditer(r"(?m)^import .+?;", content):
            last_import_end = m.end()
        if last_import_end:
            content = content[:last_import_end] + helper + content[last_import_end:]
            changed = True

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
            "log.debug(\"AUTH\", `${provider} | available: ${availableConnections.length}/${connections.length}`);",
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

    if changed:
        open(path, "w", encoding="utf-8").write(content)
        print("  ✅ Applied: ensure-model-availability-cache")
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
        return 0  # Check mode reports status but doesn't fail build

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
    if ensure_model_availability_cache():
        applied += 1

    print(f"\n📊 Results: {applied} applied, {skipped} skipped (already done or upstream changed)")
    return 0  # Non-zero only on actual errors, not when already patched


if __name__ == "__main__":
    sys.exit(main())
