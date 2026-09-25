// DashScope image adapter — translates OpenAI /images/generations to DashScope native format
// DashScope uses /api/v1/services/aigc/multimodal-generation/generation (sync)
// Format: { model, input: { messages: [{ role: "user", content: [{ text: prompt }] }] }, parameters: { size, n } }
// Response: { output: { choices: [{ message: { content: [{ image: "url", type: "image" }] } }] } }

import { urlToBase64 } from "./_base.js";

const IMAGE_BASE = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

// Convert OpenAI size (1024x1024) to DashScope size (1024*1024)
function toDashScopeSize(size) {
  if (!size || typeof size !== "string") return "1024*1024";
  return size.replace("x", "*");
}

export default {
  buildUrl: (model, creds) => IMAGE_BASE,

  buildHeaders: (creds) => {
    const headers = { "Content-Type": "application/json" };
    const key = creds?.apiKey || creds?.accessToken;
    if (key) headers["Authorization"] = `Bearer ${key}`;
    return headers;
  },

  buildBody: (model, body) => {
    const { prompt, n = 1, size = "1024x1024", negative_prompt } = body;
    const req = {
      model,
      input: {
        messages: [
          { role: "user", content: [{ text: prompt }] }
        ]
      },
      parameters: {
        size: toDashScopeSize(size),
        n,
      },
    };
    if (negative_prompt) req.parameters.negative_prompt = negative_prompt;
    return req;
  },

  normalize: (responseBody, originalPrompt) => {
    // DashScope response → OpenAI /images/generations format
    const choices = responseBody?.output?.choices || [];
    const data = choices
      .flatMap(c => c?.message?.content || [])
      .filter(c => c?.image)
      .map(c => ({
        url: c.image,
        revised_prompt: originalPrompt,
      }));

    return {
      created: Math.floor(Date.now() / 1000),
      data,
    };
  },

  // Use executor flow (sync, no async poll needed — multimodal-generation is sync)
  useExecutor: false,
};
