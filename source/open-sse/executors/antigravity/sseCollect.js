// Pure SSE-payload -> collected-stream parsing for the Antigravity executor.

const OPENAI_FINISH_REASONS = new Set([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call",
]);

const SAFETY_FINISH_REASONS = new Set([
  "safety",
  "recitation",
  "blocklist",
  "prohibited_content",
  "content_filtered",
  "policy_violation",
  "malformed_response",
]);

export function normalizeOpenAICompatibleFinishReason(value) {
  if (typeof value !== "string") return value;

  const normalized = value.toLowerCase();
  if (OPENAI_FINISH_REASONS.has(normalized)) return normalized;
  if (normalized === "max_tokens") return "length";
  if (SAFETY_FINISH_REASONS.has(normalized)) return "content_filter";

  return normalized;
}

export function normalizeOpenAICompatibleFinishReasonString(value, fallback = "stop") {
  const normalized = normalizeOpenAICompatibleFinishReason(value);
  return typeof normalized === "string" && normalized ? normalized : fallback;
}

export function stripZeroWidth(value) {
  if (typeof value === "string") {
    return value.replace(/[\u200B-\u200D\uFEFF]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripZeroWidth(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        stripZeroWidth(item),
      ])
    );
  }
  return value;
}

export function parseAntigravityTextualToolCall(text) {
  if (typeof text !== "string") return null;
  const normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const match = normalized.match(
    /^[\s\S]*?\[Tool call:\s*([^\]\n]+)\]\s*\nArguments:\s*([\s\S]+?)\s*$/
  );
  if (!match) return null;
  const name = match[1]?.trim();
  const rawArgs = match[2]?.trim();
  if (!name || !rawArgs) return null;
  try {
    return { name, args: stripZeroWidth(JSON.parse(rawArgs)) };
  } catch {
    return null;
  }
}

export function addAntigravityTextualToolCall(collected, parsed) {
  collected.toolCalls.push({
    id: `${parsed.name}-${Date.now()}-${collected.toolCalls.length}`,
    index: collected.toolCalls.length,
    type: "function",
    function: {
      name: parsed.name,
      arguments: JSON.stringify(parsed.args || {}),
    },
  });
  collected.finishReason = "tool_calls";
}

export function processAntigravitySSEPayload(payload, collected, log) {
  if (!payload || payload === "[DONE]") return;
  try {
    const parsed = JSON.parse(payload);
    const markdown =
      typeof parsed?.markdown === "string"
        ? parsed.markdown
        : typeof parsed?.response?.markdown === "string"
          ? parsed.response.markdown
          : null;
    if (markdown) {
      collected.textContent += markdown;
    }
    const candidate = parsed?.response?.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (typeof part.text === "string" && !part.thought && !part.thoughtSignature) {
          const textualToolCall = parseAntigravityTextualToolCall(part.text);
          if (textualToolCall) {
            addAntigravityTextualToolCall(collected, textualToolCall);
          } else {
            collected.textContent += part.text;
          }
        }
      }
    }
    if (candidate?.finishReason) {
      collected.finishReason = normalizeOpenAICompatibleFinishReasonString(
        String(candidate.finishReason).toLowerCase()
      );
    }
    if (parsed?.response?.usageMetadata) {
      const um = parsed.response.usageMetadata;
      collected.usage = {
        prompt_tokens: um.promptTokenCount || 0,
        completion_tokens: um.candidatesTokenCount || 0,
        total_tokens: um.totalTokenCount || 0,
      };
    }
    if (Array.isArray(parsed?.remainingCredits)) {
      collected.remainingCredits = parsed.remainingCredits;
    }
  } catch {
    log?.debug?.("SSE_PARSE", `Skipping malformed SSE line: ${payload.slice(0, 80)}`);
  }
}

export function processAntigravitySSEText(text, partialLine, collected, log) {
  partialLine.value += text;
  const lines = partialLine.value.split("\n");
  partialLine.value = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    processAntigravitySSEPayload(trimmed.slice(5).trim(), collected, log);
  }
}

export function flushAntigravitySSEText(partialLine, collected, log) {
  const trimmed = partialLine.value.trim();
  partialLine.value = "";
  if (!trimmed.startsWith("data:")) return;
  processAntigravitySSEPayload(trimmed.slice(5).trim(), collected, log);
}
