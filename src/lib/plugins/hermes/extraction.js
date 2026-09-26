// Safe auto-extraction: keyword-triggered, LLM-only, default OFF, cooldown-gated.
// Writes only to Mayday's snapshot (via memory.js). No rule-based raw dump.
import { appendEntry } from "./memory.js";

const DEFAULT_COOLDOWN_MS = 60_000;
const EXTRACTION_TIMEOUT_MS = 15_000;

export const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the user's latest message and extract important persistent facts.
Return a JSON object with this EXACT structure:
{ "user": ["preferences, styles, tools, constraints"], "memory": ["project facts, repo conventions, setup steps, decisions"] }
Rules:
- If nothing worth remembering, return {"user": [], "memory": []}.
- Keep each fact under 200 characters.
- Do not extract greetings, temporary queries, or questions.
- Respond with valid JSON only. No markdown fences.`;

const TRIGGERS = /remember|preference|prefer|always|never|rule|convention|my name is|i use|i work on|project uses|stack is|database is/i;

function shouldExtract(text, lastExtractionAt, cooldownMs) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim();
  if (clean.length < 25) return false;
  if (!TRIGGERS.test(clean)) return false;
  if (lastExtractionAt && Date.now() - lastExtractionAt < cooldownMs) return false;
  return true;
}

function parseExtraction(rawText) {
  if (!rawText || typeof rawText !== "string") return { user: [], memory: [] };
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    const clean = (arr) =>
      Array.isArray(arr) ? arr.filter((e) => typeof e === "string" && e.trim()).map((e) => e.trim()) : [];
    return { user: clean(parsed.user), memory: clean(parsed.memory) };
  } catch {
    return { user: [], memory: [] };
  }
}

/**
 * Trigger a background Hermes extraction if enabled and warranted.
 * @param {object} opts
 * @param {string} opts.text - user message text
 * @param {number|null} opts.lastExtractionAt
 * @param {object} opts.settings
 * @param {Function} [opts.runChat] - async (model, systemPrompt, userText) => string
 * @param {Function} [opts.log]
 */
export async function maybeExtractHermesMemory({ text, lastExtractionAt, settings = {}, runChat, log }) {
  const enabled = settings.hermesBridgeEnabled === true;
  if (!enabled) return null;

  const cooldownMs = (settings.hermes_extraction_cooldown_seconds || 60) * 1000;
  if (!shouldExtract(text, lastExtractionAt, cooldownMs)) return null;
  if (typeof runChat !== "function") return null;

  try {
    const model = settings.hermes_extraction_model || "gpt-4o-mini";
    const raw = await Promise.race([
      runChat(model, EXTRACTION_SYSTEM_PROMPT, text),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), EXTRACTION_TIMEOUT_MS)),
    ]);
    const { user, memory } = parseExtraction(typeof raw === "string" ? raw : "");
    let appended = 0;
    for (const e of user.slice(0, 3)) if (await appendEntry("user", e)) appended++;
    for (const e of memory.slice(0, 3)) if (await appendEntry("memory", e)) appended++;
    return { appended, lastExtractionAt: Date.now() };
  } catch (err) {
    log?.warn?.("HERMES", `extraction failed: ${err.message}`);
    return null;
  }
}