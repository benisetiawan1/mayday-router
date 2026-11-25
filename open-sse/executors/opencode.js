import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import {
  canonicalSession,
  endpointFor,
  gatewayHeaders,
  randomProjectID,
  shapeFreeLaneBody,
} from "../providers/opencode-free/index.js";

const SESSION_FIELD = "_opencodeSession";

const SESSION_HEADERS = [
  "x-opencode-session-id",
  "x-opencode-session",
  "x-session-id",
  "x-session-affinity",
];

function lowerHeaders(source) {
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const [key, value] of Object.entries(source)) out[key.toLowerCase()] = value;
  return out;
}

function identityKey(credentials) {
  const connectionId = credentials?.connectionId || credentials?.id;
  if (connectionId) return `opencode:conn:${String(connectionId).slice(0, 128)}`;
  const raw = lowerHeaders(credentials?.rawHeaders);
  const auth = raw.authorization || raw["x-api-key"] || "";
  if (auth) {
    return `opencode:auth:${crypto.createHash("sha256").update(String(auth)).digest("hex").slice(0, 32)}`;
  }
  return "opencode:default";
}

function bodyHasSessionHints(body) {
  try {
    if (!body || typeof body !== "object") return false;
    if (typeof body.session_id === "string" && body.session_id.trim()) return true;
    if (typeof body.conversation_id === "string" && body.conversation_id.trim()) return true;
    if (typeof body.prompt_cache_key === "string" && body.prompt_cache_key.trim()) return true;
    if (body.metadata && typeof body.metadata.user_id === "string" && body.metadata.user_id.trim()) return true;
    if (body.request && body.request.sessionId != null && String(body.request.sessionId) !== "") return true;
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.input)
        ? body.input
        : null;
    if (arr) {
      let assistantText = "";
      for (const msg of arr) {
        if (msg?.role === "assistant") {
          const content = msg.content;
          if (typeof content === "string") assistantText += content;
          else if (Array.isArray(content)) {
            for (const part of content) assistantText += part?.text || part?.output || "";
          }
          if (assistantText.length >= 50) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * One upstream session per conversation, matching the free tier's accounting:
 * the quota is metered per (project, session) pair, so re-minting per request
 * multiplies the bucket. A canonical, recent id is kept; anything else is
 * re-minted through the slow clock the 2.2.3 client uses.
 */
function resolveSession(body, credentials) {
  const raw = lowerHeaders(credentials?.rawHeaders);
  for (const key of SESSION_HEADERS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return canonicalSession(value);
  }

  if (credentials?.connectionId || bodyHasSessionHints(body)) {
    try {
      const viaManager = resolveSessionId({
        headers: raw,
        body,
        connectionId: credentials?.connectionId,
        scope: "opencode",
      });
      if (viaManager) return canonicalSession(viaManager);
    } catch {
      // fall through to the identity-based seed
    }
  }

  return canonicalSession(identityKey(credentials));
}

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  prepareRequestCredentials({ model, body, credentials } = {}) {
    return {
      ...(credentials || {}),
      [SESSION_FIELD]: resolveSession(body, credentials),
    };
  }

  transformRequest(model, body, stream, credentials) {
    if (!body || typeof body !== "object") return body;
    if (model && !body.model) body.model = model;
    // Free models are served as SSE only; the handler layer aggregates for
    // non-streaming clients.
    body.stream = true;
    // ponytail: chat line only — the free tier no longer lists Responses or
    // Messages models. Add those endpoint families back if upstream reintroduces
    // them (endpointFor() in providers/opencode-free owns the wire constants).
    shapeFreeLaneBody(body, "chat");
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  async execute(args) {
    return super.execute({ ...args, credentials: this.prepareRequestCredentials(args) });
  }

  buildUrl() {
    return `${this.config.baseUrl}${endpointFor()}`;
  }

  buildHeaders(credentials) {
    const raw = lowerHeaders(credentials?.rawHeaders);
    // The upstream used to bucket quota under the literal `global`; anything
    // else is hashed to a 40-hex project id by the header builder.
    const project = raw["x-opencode-project"] && raw["x-opencode-project"] !== "global"
      ? raw["x-opencode-project"]
      : randomProjectID();
    return gatewayHeaders({ session: credentials?.[SESSION_FIELD], project });
  }
}
