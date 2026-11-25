import { describe, test, expect } from "vitest";
import {
  shapeFreeLaneBody,
  takeToolNameMap,
  restoreToolNames,
  gatewayHeaders,
  canonicalSession,
} from "../open-sse/providers/opencode-free/index.js";

const OFFICIAL = ["edit", "glob", "grep", "patch", "question", "read", "shell", "skill", "subagent", "todowrite", "webfetch", "websearch", "write"];

function chatBody() {
  return {
    model: "deepseek-v4.1-flash-free",
    stream: true,
    messages: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "read a file" },
    ],
    tools: [
      { type: "function", function: { name: "Read", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } } } },
      { type: "function", function: { name: "Bash", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" } } } } },
    ],
    tool_choice: "none",
    max_tokens: 16,
  };
}

describe("opencode free lane shaping", () => {
  test("declares the 13 official tools and renames caller tools", () => {
    const body = chatBody();
    const map = shapeFreeLaneBody(body, "chat");
    const names = body.tools.map((tool) => tool.function.name);

    for (const name of OFFICIAL) expect(names).toContain(name);
    expect(names).not.toContain("Read");
    expect(names).not.toContain("Bash");
    expect(names.filter((name) => name.startsWith("mcp_"))).toHaveLength(2);
    expect(map.size).toBe(2);
    expect(body.messages[0].content).toContain("You are an AI agent running in OpenCode");
    expect(body.messages[0].content).toContain("You are helpful.");
    expect(body.tool_choice).toBeUndefined();
    expect(body.stream_options).toEqual({ include_usage: true });
    // An explicit caller limit is kept; the 32000 default only fills a gap.
    expect(body.max_tokens).toBe(16);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  test("fills the default completion limit when the caller set none", () => {
    const body = chatBody();
    delete body.max_tokens;
    shapeFreeLaneBody(body, "chat");
    expect(body.max_completion_tokens).toBe(32000);
  });

  test("shaping twice is a no-op and keeps the rename map", () => {
    const body = chatBody();
    shapeFreeLaneBody(body, "chat");
    const once = JSON.stringify(body.tools);
    const firstMap = takeToolNameMap(body);
    shapeFreeLaneBody(body, "chat");
    expect(JSON.stringify(body.tools)).toBe(once);
    expect(takeToolNameMap(body)).toBe(firstMap);
  });

  test("response names are restored to the caller spelling", () => {
    const body = chatBody();
    shapeFreeLaneBody(body, "chat");
    const map = takeToolNameMap(body);
    const wire = body.tools.find((tool) => tool.function.name.startsWith("mcp_")).function.name;
    const restored = restoreToolNames({
      choices: [{ delta: { tool_calls: [{ function: { name: wire, arguments: "{}" } }] } }],
    }, map);
    expect(restored.choices[0].delta.tool_calls[0].function.name).toBe("Read");
  });
});

describe("opencode free lane headers and session", () => {
  test("sends the v2 header set without the v1 request header", () => {
    const headers = gatewayHeaders({ session: canonicalSession("conv-1"), project: "a".repeat(40) });
    expect(headers["user-agent"]).toMatch(/^opencode\/latest\/2\.\d+\.\d+\/cli$/);
    expect(headers["x-opencode-client"]).toBe("cli");
    expect(headers["x-opencode-session-id"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-session-affinity"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-session-id"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-opencode-project"]).toBe("a".repeat(40));
    expect(headers.authorization).toBe("Bearer public");
    expect(headers["x-opencode-request"]).toBeUndefined();
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  test("mints a canonical, stable session per conversation", () => {
    const a = canonicalSession("conv-1");
    expect(a).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(a.slice(4, 16)).toMatch(/^[0-9a-f]{9}f[c-f][0-9a-f]$/);
    expect(canonicalSession("conv-1")).toBe(a);
    expect(canonicalSession("conv-2")).not.toBe(a);
  });
});

describe("OpenCodeExecutor integration", () => {
  test("builds the v2 request through the executor", async () => {
    const { OpenCodeExecutor } = await import("../open-sse/executors/opencode.js");
    const executor = new OpenCodeExecutor();
    const body = chatBody();
    const model = "deepseek-v4.1-flash-free";
    const credentials = executor.prepareRequestCredentials({ model, body, credentials: { accessToken: "public" } });

    executor.transformRequest(model, body, true, credentials);

    expect(executor.buildUrl(model)).toBe("https://opencode.ai/inference/openai/v1/chat/completions");
    const headers = executor.buildHeaders(credentials);
    expect(headers["user-agent"]).toContain("opencode/latest/2.");
    expect(headers["x-opencode-session-id"]).toMatch(/^ses_/);
    expect(headers["x-opencode-project"]).toMatch(/^[0-9a-f]{40}$/);
    expect(headers["x-opencode-request"]).toBeUndefined();
    expect(body.tools.some((tool) => tool.function.name === "read")).toBe(true);
    expect(body.messages[0].content).toContain("You are an AI agent running in OpenCode");
  });
});
