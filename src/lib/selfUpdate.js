// Self-update over prebuilt release tarballs (path B: dashboard-driven updates
// for non-technical users — no rebuild, no Docker knowledge required).
//
// Flow: check GitHub Releases (own repo) → download tarball → verify SHA-256 →
// extract to staging under DATA_DIR → spawn a detached apply script that waits
// for this process to exit, swaps the app directory, and relaunches
// custom-server.js. The UI polls /api/update/status; when the server drops and
// comes back healthy, the dashboard reloads itself.
//
// Safety: download is checksum-verified before anything is touched, the current
// app directory is renamed (never deleted) for rollback, and the swap only
// happens after this process has exited cleanly.

import fs from "fs";
import os from "os";
import path from "path";
import https from "https";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import pkg from "../../package.json" with { type: "json" };

const GITHUB_REPO = "benisetiawan1/mayday-router";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "mayday");
  }
  return path.join(os.homedir(), ".mayday");
}

// Install mode drives which update strategy is offered in the UI.
export function detectInstallMode() {
  if (process.env.MAYDAY_INSTALL_MODE) return process.env.MAYDAY_INSTALL_MODE;
  try {
    if (fs.existsSync("/.dockerenv")) return "docker";
  } catch {}
  try {
    // npm-global CLI install: the app lives under a node_modules tree
    if (process.cwd().includes("node_modules")) return "npm";
  } catch {}
  return "tarball";
}

// --- state machine (one update at a time, survives hot reload) ---
const state = (global.__selfUpdateState ??= {
  phase: "idle", // idle | downloading | verifying | installing | restarting | done | error
  progress: 0,
  message: "",
  targetVersion: null,
  error: null,
  startedAt: null,
});

function setState(patch) {
  Object.assign(state, patch);
}

export function getUpdateState() {
  return { ...state, currentVersion: pkg.version, installMode: detectInstallMode() };
}

// --- github helpers ---
function githubGet(url) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "mayday-router", Accept: "application/vnd.github+json" };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(githubGet(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function downloadToFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "mayday-router" };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(res.headers.location, dest, onProgress));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        received += chunk.length;
        if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100));
      });
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    }).on("error", reject);
  });
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

// Find the newest semver release with a linux-x64 tarball asset attached.
export async function fetchLatestTarballRelease() {
  const releases = await githubGet(`https://api.github.com/repos/${GITHUB_REPO}/releases`);
  if (!Array.isArray(releases)) return null;
  for (const rel of releases) {
    const asset = (rel.assets || []).find((a) => /linux-x64\.tar\.gz$/.test(a.name) && !a.name.endsWith(".sha256"));
    const sum = (rel.assets || []).find((a) => a.name.endsWith(".sha256"));
    if (asset) {
      return {
        version: String(rel.tag_name || rel.name || "").replace(/^v/i, ""),
        assetUrl: asset.browser_download_url,
        assetName: asset.name,
        sha256Url: sum ? sum.browser_download_url : null,
        notes: rel.body || "",
      };
    }
  }
  return null;
}

// --- the update itself ---
export async function startTarballUpdate(release) {
  try {
    await _startTarballUpdate(release);
  } catch (e) {
    setState({ phase: "error", message: "Update failed", error: e?.message || String(e) });
    throw e;
  }
}

async function _startTarballUpdate(release) {
  if (state.phase !== "idle" && state.phase !== "done" && state.phase !== "error") {
    throw new Error("An update is already in progress");
  }
  if (detectInstallMode() === "docker") {
    throw new Error("Docker install detected — update the image instead");
  }

  const dataDir = getDataDir();
  const updatesDir = path.join(dataDir, ".updates");
  fs.mkdirSync(updatesDir, { recursive: true });
  const tarballPath = path.join(updatesDir, release.assetName);
  const stageDir = path.join(updatesDir, `app-${release.version}`);

  setState({ phase: "downloading", progress: 0, message: `Downloading v${release.version}…`, targetVersion: release.version, error: null, startedAt: Date.now() });
  await downloadToFile(release.assetUrl, tarballPath, (p) => setState({ progress: p }));

  setState({ phase: "verifying", message: "Verifying checksum…" });
  if (release.sha256Url) {
    const sumText = (await githubGetText(release.sha256Url)).trim().split(/\s+/)[0];
    const actual = sha256File(tarballPath);
    if (sumText && actual !== sumText) {
      throw new Error("Checksum mismatch — download aborted before touching the app");
    }
  }

  setState({ phase: "installing", message: "Extracting…" });
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  execSync(`tar -xzf "${tarballPath}" -C "${stageDir}"`, { stdio: "ignore" });
  // sanity: the bundle must look like the app
  if (!fs.existsSync(path.join(stageDir, "custom-server.js"))) {
    throw new Error("Invalid update bundle (custom-server.js missing)");
  }

  setState({ phase: "restarting", message: "Restarting — the dashboard will reconnect automatically…" });
  spawnApplyScript({ stageDir, appDir: process.cwd(), parentPid: process.pid });
  setTimeout(() => process.exit(0), 500);
}

async function githubGetText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "mayday-router" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(githubGetText(res.headers.location));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

// Detached helper: waits for the server to exit, swaps the app dir, relaunches.
function spawnApplyScript({ stageDir, appDir, parentPid }) {
  const scriptPath = path.join(getDataDir(), ".updates", `apply-${Date.now()}.cjs`);
  const script = `
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const stageDir = ${JSON.stringify(stageDir)};
const appDir = ${JSON.stringify(appDir)};
const parentPid = ${parentPid};
const backupDir = appDir + ".bak-" + Date.now();

function waitForExit(cb) {
  try { process.kill(parentPid, 0); } catch { return cb(); }
  setTimeout(() => waitForExit(cb), 500);
}
waitForExit(() => {
  try {
    fs.renameSync(appDir, backupDir);
    fs.renameSync(stageDir, appDir);
  } catch (e) {
    // best-effort rollback
    try { if (!fs.existsSync(appDir) && fs.existsSync(backupDir)) fs.renameSync(backupDir, appDir); } catch {}
    process.exit(1);
  }
  const child = spawn(process.execPath, ["custom-server.js"], {
    cwd: appDir, detached: true, stdio: "ignore", env: process.env,
  });
  child.unref();
  process.exit(0);
});
`;
  fs.writeFileSync(scriptPath, script, "utf8");
  spawn(process.execPath, [scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  }).unref();
}
