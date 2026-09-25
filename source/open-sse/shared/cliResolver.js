/**
 * Server-safe CLI binary resolution.
 * Explicit environment overrides win; filesystem probing stays optional.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveCliBin({ envName, command, candidates = [] }) {
  const override = envName && process.env[envName]?.trim();
  if (override) return override;

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return process.platform === "win32" ? `${command}.exe` : command;
}

export function resolveDevinBin() {
  const home = os.homedir();
  const candidates = process.platform === "win32"
    ? [path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "devin", "cli", "bin", "devin.exe")]
    : [
        path.join(home, ".local", "share", "devin", "bin", "devin"),
        path.join(home, ".devin", "bin", "devin"),
      ];
  return resolveCliBin({ envName: "CLI_DEVIN_BIN", command: "devin", candidates });
}

export const __test__ = { resolveCliBin, resolveDevinBin };

export default resolveCliBin;
