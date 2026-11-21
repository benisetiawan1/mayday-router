// Curated "suggested" models for providers that don't expose a public
// modelsFetcher endpoint. Surfaced in the provider page's
// "Suggested free models" section so users can one-click add them.
//
// Keyed by providerId. Each entry: { id, name }.
// NVIDIA NIM: all listed models are free for NVIDIA Developer Program members
// (prototyping/testing). Verified callable against integrate.api.nvidia.com
// (in the /v1/models catalog AND returning 200 on a real completion) — models
// that are catalog-listed but 404 "not found for account" (e.g. kimi-k2.6,
// qwen3.5-397b) or EOL/410 (e.g. glm-5.1) are intentionally excluded.
export const SUGGESTED_MODELS = {
  nvidia: [
    { id: "z-ai/glm-5.2", name: "GLM 5.2" },
    { id: "deepseek-ai/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    { id: "deepseek-ai/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
    { id: "minimaxai/minimax-m3", name: "MiniMax M3" },
    { id: "qwen/qwen3-next-80b-a3b-instruct", name: "Qwen3 Next 80B A3B" },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
    { id: "meta/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick 17b" },
    { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120b" },
    { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", name: "Nemotron Super 49b v1.5" },
    { id: "stepfun-ai/step-3.7-flash", name: "Step 3.7 Flash" },
  ],
};

// OpenCode Free models that do NOT use the "-free" id suffix but are still
// served on the free tier. Kept in sync with https://opencode.ai/zen/v1/models.
// Any model here is allowed through the opencode-free modelsFetcher filter even
// though it doesn't end in "-free".
export const KNOWN_FREE_OPENCODE_MODELS = [
  "big-pickle",
  "claude-fable-5",
  "claude-fable-5-1",
  "claude-haiku-4-5",
  "claude-haiku-5-5",
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-opus-5-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-4-argon",
  "glm-5.3",
  "glm-5.3-flash",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-nano",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6-luna",
  "grok-4.5",
  "grok-4.6",
  "grok-4.7",
  "grok-build-0.1",
  "kimi-k2.7-code",
  "kimi-k3",
  "minimax-m2.5",
  "union-alpha",
];
