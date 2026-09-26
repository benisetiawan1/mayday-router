// Manifest-driven skill registry (single source of truth on disk: skills/<id>/manifest.json).
// Read-only scan + CRUD of manifests. Never executes shell commands from manifests —
// install/update/uninstall are recorded as metadata only (no exec surface).
import fs from "fs/promises";
import path from "path";

export const VALID_HOOK_TYPES = new Set([
  "system-prompt",
  "install-cli",
  "pre-route",
  "pre-request",
  "post-response",
]);

export function validateManifest(manifest, skillId) {
  const errors = [];
  if (!manifest.id || typeof manifest.id !== "string") errors.push("missing or invalid 'id'");
  if (!manifest.name || typeof manifest.name !== "string") errors.push("missing or invalid 'name'");
  if (manifest.hook && !VALID_HOOK_TYPES.has(manifest.hook)) {
    errors.push(`unknown hook type '${manifest.hook}'`);
  }
  return errors;
}

let cachedManifests = null;

export function getSkillsDir() {
  return process.env.SKILLS_DIR || path.join(process.cwd(), "skills");
}

export function clearSkillCache() {
  cachedManifests = null;
}

async function loadPromptFile(skillsDir, itemName, manifest) {
  const candidates = ["prompt.txt", "prompt.md", "SKILL.md"];
  for (const name of candidates) {
    try {
      const content = await fs.readFile(path.join(skillsDir, itemName, name), "utf8");
      if (content.trim()) return content;
    } catch {}
  }
  return manifest.prompt_template || "";
}

export async function getSkillManifests() {
  if (cachedManifests) return cachedManifests;
  const skillsDir = getSkillsDir();
  let items = [];
  try {
    items = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const manifests = [];
  for (const item of items) {
    if (!item.isDirectory()) continue;
    const manifestPath = path.join(skillsDir, item.name, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      continue; // no manifest.json — skip (legacy SKILL.md-only dirs)
    }
    try {
      manifest.prompt_template = await loadPromptFile(skillsDir, item.name, manifest);
    } catch {}
    const errors = validateManifest(manifest, item.name);
    if (errors.length > 0) {
      console.warn(`[skills] Skipping '${item.name}': ${errors.join("; ")}`);
      continue;
    }
    manifests.push(manifest);
  }
  cachedManifests = manifests;
  return manifests;
}

export async function createCustomSkill(skillData) {
  const skillsDir = getSkillsDir();
  const folder = path.join(skillsDir, skillData.id);
  await fs.mkdir(folder, { recursive: true });

  const manifest = {
    id: skillData.id,
    name: skillData.name,
    description: skillData.description || "",
    version: skillData.version || "1.0.0",
    category: skillData.category || "prompt-injection",
    hook: skillData.hook || "system-prompt",
    default_enabled: skillData.default_enabled !== false,
    source: skillData.source || "custom",
    routable: skillData.routable === true,
  };

  if (Array.isArray(skillData.triggers)) manifest.triggers = skillData.triggers;
  if (Array.isArray(skillData.keywords)) manifest.keywords = skillData.keywords;

  if (Array.isArray(skillData.config_schema) && skillData.config_schema.length > 0) {
    manifest.config_schema = skillData.config_schema;
  }

  await fs.writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  if (skillData.prompt_template) {
    await fs.writeFile(path.join(folder, "prompt.txt"), skillData.prompt_template, "utf8");
    // Also emit SKILL.md so the skill is self-hostable and links on the Skills page work.
    await fs.writeFile(path.join(folder, "SKILL.md"), skillData.prompt_template, "utf8");
  }

  clearSkillCache();
  return { success: true, manifest };
}

export async function updateCustomSkill(skillId, skillData) {
  const skillsDir = getSkillsDir();
  if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) throw new Error("invalid skill id");
  const folder = path.join(skillsDir, skillId);
  const manifestPath = path.join(folder, "manifest.json");

  let existing;
  try {
    existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("skill not found");
  }

  const manifest = {
    ...existing,
    name: skillData.name ?? existing.name,
    description: skillData.description ?? existing.description ?? "",
    hook: skillData.hook || existing.hook || "system-prompt",
    routable: skillData.routable !== undefined ? !!skillData.routable : existing.routable,
  };
  if (Array.isArray(skillData.triggers)) manifest.triggers = skillData.triggers;
  if (Array.isArray(skillData.keywords)) manifest.keywords = skillData.keywords;
  if (Array.isArray(skillData.config_schema) && skillData.config_schema.length > 0) {
    manifest.config_schema = skillData.config_schema;
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  if (skillData.prompt_template) {
    await fs.writeFile(path.join(folder, "prompt.txt"), skillData.prompt_template, "utf8");
    await fs.writeFile(path.join(folder, "SKILL.md"), skillData.prompt_template, "utf8");
  }

  clearSkillCache();
  return { success: true, manifest };
}

export async function deleteCustomSkill(skillId) {
  const skillsDir = getSkillsDir();
  if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) throw new Error("invalid skill id");
  await fs.rm(path.join(skillsDir, skillId), { recursive: true, force: true });
  clearSkillCache();
  return { success: true };
}