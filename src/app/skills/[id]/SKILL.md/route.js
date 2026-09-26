import fs from "fs/promises";
import path from "path";
import { getSkillsDir } from "@/lib/skillsRegistry.js";

export const dynamic = "force-dynamic";

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

async function readSkillFile(id, name) {
  const candidates = [
    path.join(getSkillsDir(), id, name), // runtime volume (custom skills)
    path.join(process.cwd(), "public", "skills", id, name), // image baked (built-ins)
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {}
  }
  return null;
}

export async function GET(_request, { params }) {
  const id = params?.id;
  if (!id || !VALID_ID.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const content = await readSkillFile(id, "SKILL.md");
  if (content === null) return new Response("Not found", { status: 404 });
  return new Response(content, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}