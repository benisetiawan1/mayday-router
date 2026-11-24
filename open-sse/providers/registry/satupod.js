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
};
