// DashScope Intl — native provider for Alibaba Cloud Model Studio (international endpoint)
// Supports: LLM chat, vision, TTS (omni), ASR, embeddings, image generation, translate
// Prefix: md/
// Endpoints:
//   chat/vision/ASR/TTS-omni/translate: compatible-mode/v1/chat/completions (OpenAI format)
//   embeddings: compatible-mode/v1/embeddings (OpenAI format)
//   image gen/edit: api/v1/services/aigc/multimodal-generation/generation (DashScope native, sync)
//   models: compatible-mode/v1/models (auto-discover 148+ models)

export default {
  id: "dashscope-intl",
  priority: 15,
  alias: "md",
  display: {
    name: "DashScope Intl",
    icon: "cloud",
    color: "#FF6A00",
    textIcon: "DS",
    website: "https://modelstudio.console.alibabacloud.com",
    notice: {
      apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    headers: {},
  },
  // Multi-endpoint config for non-chat services
  serviceKinds: ["llm", "embedding", "image", "imageToText"],
  embeddingConfig: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings",
    authType: "apikey",
    authHeader: "bearer",
  },
  imageConfig: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  },
  // Auto-discover models from DashScope /models endpoint
  modelsFetcher: {
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    type: "openai",
  },
  passthroughModels: true,
  // Hardcode known models for UI display (auto-discover will add the rest)
  models: [
    // LLM
    { id: "qwen3.7-max", name: "Qwen3.7 Max" },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus" },
    { id: "qwen3-max", name: "Qwen3 Max" },
    { id: "qwen-plus", name: "Qwen Plus" },
    { id: "qwen-flash", name: "Qwen Flash" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxOutput: 384000 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxOutput: 384000 },
    { id: "glm-5.1", name: "GLM 5.1" },
    { id: "glm-5.2", name: "GLM 5.2" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", description: "Kimi K2.7 Code — MoE coding model with 256K context, native vision & video input, built-in reasoning. Strong at end-to-end software tasks, code generation, and long-horizon agentic work.", contextWindow: 262144, maxOutput: 65536, pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { id: "qwq-plus", name: "QwQ Plus" },
    { id: "ccai-pro", name: "CCAI Pro" },
    // Vision
    { id: "qwen-vl-plus", name: "Qwen VL Plus", kind: "imageToText" },
    { id: "qwen-vl-max", name: "Qwen VL Max", kind: "imageToText" },
    { id: "qwen3-vl-flash", name: "Qwen3 VL Flash", kind: "imageToText" },
    { id: "qwen3.5-omni-flash", name: "Qwen3.5 Omni Flash", kind: "imageToText" },
    // Embeddings
    { id: "text-embedding-v4", name: "Text Embedding V4", kind: "embedding" },
    { id: "text-embedding-v3", name: "Text Embedding V3", kind: "embedding" },
    // Image gen
    { id: "wan2.7-image", name: "Wan2.7 Image", kind: "image" },
    { id: "wan2.7-image-pro", name: "Wan2.7 Image Pro", kind: "image" },
    { id: "qwen-image-2.0", name: "Qwen Image 2.0", kind: "image" },
    { id: "qwen-image-2.0-pro", name: "Qwen Image 2.0 Pro", kind: "image" },
    { id: "qwen-image-max", name: "Qwen Image Max", kind: "image" },
    { id: "z-image-turbo", name: "Z Image Turbo", kind: "image" },
    // Translate
    { id: "qwen-mt-flash", name: "Qwen MT Flash" },
    { id: "qwen-mt-plus", name: "Qwen MT Plus" },
  ],
};
