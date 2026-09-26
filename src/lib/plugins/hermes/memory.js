// Safe Hermes memory bridge. Read-only from Hermes' real store, writes go to a
// Mayday-owned snapshot dir — never touches ~/.hermes/memories/*.
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { DATA_DIR } from "@/lib/dataDir.js";

const ENTRY_DELIMITER = "\n§\n";
const MEMORY_LIMIT = 2200;
const USER_LIMIT = 1375;

function hermesHome() {
  const dot = path.join(os.homedir(), ".hermes");
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const appended = path.join(local, "hermes");
    if (fsSync.existsSync(appended)) return appended;
  }
  return dot;
}

function bridgeDir() {
  return path.join(DATA_DIR, "hermes-bridge");
}

function sourcePath(target) {
  return path.join(hermesHome(), "memories", target === "user" ? "USER.md" : "MEMORY.md");
}

function snapshotPath(target) {
  return path.join(bridgeDir(), target === "user" ? "USER.md" : "MEMORY.md");
}

function parseEntries(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(ENTRY_DELIMITER).map((e) => e.trim()).filter(Boolean);
}

function serializeEntries(entries) {
  return entries.map((e) => e.trim()).filter(Boolean).join(ENTRY_DELIMITER);
}

/** Read entries from Mayday's snapshot (read-only import of Hermes store). */
export async function readMemory(target = "memory") {
  try {
    const content = await fs.readFile(snapshotPath(target), "utf8");
    return parseEntries(content);
  } catch {
    return [];
  }
}

/**
 * Copy Hermes' real memory into Mayday's snapshot (read-only import).
 * Never mutates the Hermes source file.
 */
export async function importFromHermes() {
  try {
    const dir = bridgeDir();
    await fs.mkdir(dir, { recursive: true });
    for (const target of ["memory", "user"]) {
      const src = sourcePath(target);
      if (!fsSync.existsSync(src)) continue;
      const content = await fs.readFile(src, "utf8");
      const entries = parseEntries(content).slice(0, target === "user" ? USER_LIMIT : MEMORY_LIMIT);
      await fs.writeFile(snapshotPath(target), serializeEntries(entries), "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

/** Append an entry to the Mayday snapshot only (never Hermes real file). */
export async function appendEntry(target = "memory", text) {
  if (!text || typeof text !== "string") return false;
  try {
    const entry = text.trim().slice(0, 500);
    if (!entry) return false;
    const entries = await readMemory(target);
    if (entries.includes(entry)) return true; // dedup
    const next = [entry, ...entries].slice(0, target === "user" ? USER_LIMIT : MEMORY_LIMIT);
    const dir = bridgeDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(snapshotPath(target), serializeEntries(next), "utf8");
    return true;
  } catch {
    return false;
  }
}