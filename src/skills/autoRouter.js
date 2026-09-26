// Skill auto-router: TF-IDF classify the user's query against routable
// manifest-driven skills. Default OFF; wired only behind ENABLE_EXTENDED_TFIDF.
import { getSkillManifests } from "@/lib/skillsRegistry.js";
import { buildTfIdfIndex, scoreQuery } from "./tfidf.js";

const MAX_SKILLS_PER_REQUEST = 2;
const DEFAULT_THRESHOLD = 0.35;

let cachedIndex = null;
let cachedSignature = null;

export function extractUserQuery(body) {
  if (!body || typeof body !== "object") return "";
  const messages = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && part.type === "text" && typeof part.text === "string") return part.text;
      }
    }
    if (typeof m.content === "string") return m.content;
    if (typeof m.text === "string") return m.text;
  }
  return "";
}

async function getRoutableSkills() {
  const manifests = await getSkillManifests();
  return manifests.filter(
    (s) =>
      s.hook === "system-prompt" &&
      s.prompt_template &&
      s.default_enabled !== false &&
      (s.routable === true || (Array.isArray(s.config_schema) && s.config_schema.some((c) => c.key === "routing_mode"))),
  );
}

async function getIndex() {
  const routable = await getRoutableSkills();
  const signature = routable.map((s) => `${s.id}:${s.prompt_template.length}`).join("|");
  if (cachedIndex && cachedSignature === signature) return { index: cachedIndex, routable };

  const docs = routable.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || "",
    triggers: s.triggers || [],
    keywords: s.keywords || [],
  }));
  cachedIndex = buildTfIdfIndex(docs);
  cachedSignature = signature;
  return { index: cachedIndex, routable };
}

/**
 * Classify a request body against routable skills.
 * @param {object} body
 * @param {object} chatSettings
 * @returns {Promise<Array<{id, name, score, prompt_template}>>}
 */
export async function classifyRequestSkills(body, chatSettings = {}) {
  const { index, routable } = await getIndex();
  if (!index.docVectors?.length) return [];

  const queryText = extractUserQuery(body);
  if (!queryText || queryText.trim().length < 6) return [];
  if (/^(hi|hello|hey|ok|yes|no|thanks?)\W*$/i.test(queryText.trim())) return [];

  const byId = Object.fromEntries(routable.map((s) => [s.id, s]));
  const all = scoreQuery(index, queryText, { threshold: 0.01, maxSkills: Infinity });
  const lowerQuery = queryText.toLowerCase();

  return routable
    .map((skill) => ({ skill, scored: all.find((m) => m.id === skill.id) }))
    .filter(({ skill, scored }) => {
      // Trigger substring = strong intent signal — accept regardless of TF-IDF score.
      const triggerHit = (skill.triggers || []).some((t) => t && t.length > 2 && lowerQuery.includes(t.toLowerCase()));
      if (triggerHit) return true;
      if (!scored) return false;
      const threshold =
        chatSettings[`${skill.id}RoutingThreshold`] ??
        chatSettings[`${skill.id}_routing_threshold`] ??
        skill.routing_threshold ??
        DEFAULT_THRESHOLD;
      return scored.score >= threshold;
    })
    .slice(0, MAX_SKILLS_PER_REQUEST)
    .map(({ skill, scored }) => ({
      id: skill.id,
      name: skill.name,
      score: scored?.score ?? 1,
      prompt_template: skill.prompt_template,
    }));
}