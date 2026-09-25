// Agent Skills metadata — single source of truth for /dashboard/skills page.
// Each skill = 1 URL the user copies and pastes to any AI agent.
// Skills are SELF-HOSTED: SKILL.md files live in the image at /public/skills/*

const SKILL_PATH = "skills";

export const SKILLS_REPO_URL = `https://github.com/benisetiawan1/mayday-router`;
const SKILLS_BASE = typeof window !== "undefined"
  ? `${window.location.origin}/${SKILL_PATH}`
  : `/skills`;

export const SKILLS = [
  {
    id: "mayday",
    name: "Mayday (Entry)",
    description: "Setup + index of all capabilities. Start here — covers base URL, auth, model discovery, and links to every capability skill.",
    endpoint: null,
    icon: "hub",
    isEntry: true,
  },
  {
    id: "mayday-chat",
    name: "Chat",
    description: "Chat / code-gen via OpenAI or Anthropic format with streaming.",
    endpoint: "/v1/chat/completions",
    icon: "chat",
  },
  {
    id: "mayday-image",
    name: "Image Generation",
    description: "Text-to-image via DALL-E, Imagen, FLUX, MiniMax, SDWebUI…",
    endpoint: "/v1/images/generations",
    icon: "image",
  },
  {
    id: "mayday-tts",
    name: "Text-to-Speech",
    description: "OpenAI / ElevenLabs / Edge / Google / Deepgram voices.",
    endpoint: "/v1/audio/speech",
    icon: "record_voice_over",
  },
  {
    id: "mayday-stt",
    name: "Speech-to-Text",
    description: "Transcribe audio via OpenAI Whisper, Groq, Gemini, Deepgram, AssemblyAI…",
    endpoint: "/v1/audio/transcriptions",
    icon: "mic",
  },
  {
    id: "mayday-embeddings",
    name: "Embeddings",
    description: "Vectors for RAG / semantic search via OpenAI, Gemini, Mistral…",
    endpoint: "/v1/embeddings",
    icon: "scatter_plot",
  },
  {
      id: "mayday-web-search",
      name: "Web Search",
      description: "Tavily / Exa / Brave / Serper / SearXNG / Google PSE / You.com.",
      endpoint: "/v1/search",
      icon: "search",
    },
    {
      id: "mayday-video",
      name: "Video Generation",
      description: "Video via xAI Grok Imagine.",
      endpoint: "/v1/video/generations",
      icon: "movie",
    },
    {
      id: "mayday-web-fetch",
      name: "Web Fetch",
      description: "URL → markdown / text / HTML via Firecrawl, Jina, Tavily, Exa.",
      endpoint: "/v1/web/fetch",
      icon: "language",
    },
  ];

  export function getSkillRawUrl(id) {
    return `${SKILLS_BASE}/${id}/SKILL.md`;
  }

  export function getSkillBlobUrl(id) {
    return `${SKILLS_BASE}/${id}/SKILL.md`;
  }
