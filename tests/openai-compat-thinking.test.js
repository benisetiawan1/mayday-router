import { describe, expect, it } from "vitest";
import { translateRequest } from "../open-sse/translator/index.js";
import { FORMATS } from "../open-sse/translator/formats.js";

const compat = "openai-compatible-chat-e094e2f9";
const body = (extra = {}) => ({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], ...extra });

describe("thinking on dynamic OpenAI-compatible nodes", () => {
  it("sends only reasoning_effort, never the native thinking object", () => {
    const out = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "deepseek-v4-flash", body({ reasoning_effort: "high" }), false, null, compat);
    expect(out.thinking).toBeUndefined();
    expect(out.reasoning_effort).toBe("high");
  });

  it("converts a native thinking intent to reasoning_effort", () => {
    const out = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "deepseek-v4-flash", body({ thinking: { type: "enabled", budget_tokens: 8192 } }), false, null, compat);
    expect(out.thinking).toBeUndefined();
    expect(typeof out.reasoning_effort).toBe("string");
  });

  it("keeps the native thinking object for a registered provider", () => {
    const out = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "deepseek-v4-flash", body({ reasoning_effort: "high" }), false, null, "deepseek");
    expect(out.thinking).toEqual({ type: "enabled" });
  });
});
