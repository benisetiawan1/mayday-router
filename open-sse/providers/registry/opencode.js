export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://opencode.ai",
    forceStream: true,
    noAuth: true,
  },
  // Fallback catalogue; the live list comes from the fetcher and the free
  // models are whatever upstream marks with zero price.
  models: [
    { id: "deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash Free" },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free" },
    { id: "jev-1.13-free", name: "Jev 1.13 Free" },
  ],
  modelsFetcher: { url: "https://opencode.ai/inference/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
