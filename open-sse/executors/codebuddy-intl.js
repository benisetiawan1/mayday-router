import { createHash, randomUUID } from "node:crypto";
import { DefaultExecutor } from "./default.js";

const REQUIRED_SYSTEM_PROMPT = "You are CodeBuddy Code.";

// Deterministic RFC-4122-v5-shaped UUID derived from a session key, mirroring
// the official client's per-conversation id (uuid5 over the session key).
function stableUuidFrom(key) {
  const hash = createHash("sha1").update(key).digest("hex");
  const timeHigh = ((parseInt(hash.slice(12, 16), 16) & 0x0fff) | 0x5000)
    .toString(16)
    .padStart(4, "0");
  const clockSeq = ((parseInt(hash.slice(16, 20), 16) & 0x3fff) | 0x8000)
    .toString(16)
    .padStart(4, "0");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    timeHigh,
    clockSeq,
    hash.slice(20, 32),
  ].join("-");
}

/**
 * CodeBuddyIntlExecutor — talks to https://www.codebuddy.ai/v2/chat/completions
 *
 * Same OpenAI-compatible-but-stream-only gateway behavior as codebuddy-cn:
 * non-stream requests are rejected, and reasoning is surfaced only when the
 * request carries the IDE's OpenAI-style reasoning params. Force stream and
 * mirror reasoning_summary exactly like CodeBuddyExecutor.
 */
export class CodeBuddyIntlExecutor extends DefaultExecutor {
  constructor() {
    super("codebuddy-intl");
  }

  // Upstream "channel verification" (HTTP 400 code 11128 "conversation id
  // missing"): the intl gateway now rejects any request that does not carry the
  // X-Conversation-* header family the official IDE sends on every turn — a
  // conversation id derived stably from the session key, plus fresh UUIDs for
  // the request and the message. BaseExecutor.execute() calls transformRequest
  // then buildHeaders back-to-back with no await between them (base.js) and
  // passes no body to buildHeaders, so transformRequest stashes these headers
  // for buildHeaders to merge.
  buildHeaders(credentials, stream = true) {
    const headers = super.buildHeaders(credentials, stream);
    return { ...headers, ...this._codebuddyConversationHeaders };
  }

  _computeConversationHeaders(body) {
    // Stable per-conversation id: prefer whatever session key the client sent,
    // else derive from the opening user message (stable across retries of the
    // same turn and across accounts), else fall back to a random UUID.
    const sessionKey =
      (typeof body?.session_id === "string" && body.session_id) ||
      (typeof body?.prompt_cache_key === "string" && body.prompt_cache_key) ||
      (typeof body?.conversation_id === "string" && body.conversation_id) ||
      null;
    const firstUser = Array.isArray(body?.messages)
      ? body.messages.find((m) => m?.role === "user")
      : null;
    const userText =
      typeof firstUser?.content === "string"
        ? firstUser.content
        : Array.isArray(firstUser?.content)
          ? firstUser.content
              .map((b) => (b && typeof b.text === "string" ? b.text : ""))
              .join("\n")
          : "";
    const conversationKey = sessionKey || (userText ? `cbai:${userText}` : null);

    return {
      "X-Conversation-ID": conversationKey
        ? stableUuidFrom(conversationKey)
        : randomUUID(),
      "X-Conversation-Request-ID": randomUUID(),
      "X-Conversation-Message-ID": randomUUID(),
    };
  }

  transformRequest(model, body, stream, credentials) {
    // Derive headers from the pre-transform body — before the injected system
    // prompt / typed-block conversion below alters the message shape.
    this._codebuddyConversationHeaders = this._computeConversationHeaders(body);

    const input = body && typeof body === "object" ? structuredClone(body) : body;
    const transformed = super.transformRequest(model, input, stream, credentials);
    transformed.stream = true;

    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort;
    } else if (eff) {
      transformed.reasoning_summary = "auto";
    }

    // CodeBuddy rejects plain OpenAI shape (11101 invalid request): needs a
    // leading system prompt + user content as typed blocks, not a bare string.
    const source = Array.isArray(transformed.messages) ? transformed.messages : [];
    const messages = [{ role: "system", content: REQUIRED_SYSTEM_PROMPT }];
    let requiredPromptSeen = false;
    for (const message of source) {
      if (!message || typeof message !== "object") continue;
      if (message.role === "system" && message.content === REQUIRED_SYSTEM_PROMPT) {
        if (requiredPromptSeen) continue;
        requiredPromptSeen = true;
        continue;
      }
      if (message.role === "user" && typeof message.content === "string") {
        messages.push({ ...message, content: [{ type: "text", text: message.content }] });
      } else {
        messages.push({ ...message });
      }
    }
    transformed.messages = messages;

    return transformed;
  }
}

export default CodeBuddyIntlExecutor;
