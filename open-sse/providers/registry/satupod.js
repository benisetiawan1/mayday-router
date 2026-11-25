export default {
  id: "satupod",
  alias: "satupod",
  uiAlias: "satupod",
  display: {
    name: "Satupod",
    icon: "hub",
    color: "#0EA5E9",
    textIcon: "SP",
    website: "https://satupod.com",
    notice: {
      apiKeyUrl: "https://app.satupod.com/?ref=4E5FE629DF",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasOAuth: false,
  authModes: ["apikey"],
  serviceKinds: ["llm"],
  transport: {
    baseUrl: "https://api.satupod.com/v1/chat/completions",
    validateUrl: "https://api.satupod.com/v1/models",
    // Generic OpenAI-compatible gateway: vendor-native thinking fields
    // (thinking / enable_thinking) drawn from model-name patterns can 400.
    thinkingFormat: "openai",
  },
  modelsFetcher: { url: "https://api.satupod.com/v1/models", type: "openai" },
  passthroughModels: true,
  models: [
    { id: "deepseek-flash", name: "DeepSeek Flash", contextWindow: 1000000, vision: true, pricing: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 } },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, vision: true, pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash", contextWindow: 1000000, vision: true, pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { id: "MiniMax-M3.1-Flash", name: "MiniMax M3.1 Flash", contextWindow: 1000000, vision: true, pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { id: "mimo-v2.6-flash", name: "MiMo v2.6 Flash", contextWindow: 1000000, vision: true, pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
  ],

};
