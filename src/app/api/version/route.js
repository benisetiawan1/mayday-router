import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

// Mayday self-hosted update channel — check latest release from OWN GitHub repo.
// Uses /releases (list) because /releases/latest never returns prereleases, and
// all Mayday versions are published as prerelease (-beta).
const GITHUB_REPO = "benisetiawan1/mayday-router";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""; // wajib untuk repo private; kosong utk public
const VERSION_CACHE_TTL_MS = 300000; // cache latest lookup for 5m

// Survive hot reload; one cache per process
const versionCache = (global.__githubVersionCache ??= { value: null, fetchedAt: 0 });

// Parse "0.22.0-beta" -> [0,22,0,-1] ; "0.21.0" -> [0,21,0,0] (stabil > prerelease di patch sama)
function parseVersion(v) {
  const m = String(v || "").replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z0-9.]+))?$/);
  if (!m) return null;
  return [
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3], 10),
    m[4] ? -1 : 0,
  ];
}

function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 4; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

// Fetch all releases (prerelease termasuk), pilih tag semver tertinggi
function fetchLatestVersion() {
  return new Promise((resolve) => {
    const headers = { "User-Agent": "mayday-router", Accept: "application/vnd.github+json" };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const req = https.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`,
      { timeout: 4000, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const arr = JSON.parse(data);
            if (!Array.isArray(arr) || arr.length === 0) return resolve(null);
            const tags = arr
              .map((r) => String(r.tag_name || "").replace(/^v/i, ""))
              .filter((t) => parseVersion(t));
            if (tags.length === 0) return resolve(null);
            tags.sort((x, y) => compareVersions(y, x));
            resolve(tags[0] || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function getLatestVersionCached() {
  if (versionCache.value && Date.now() - versionCache.fetchedAt < VERSION_CACHE_TTL_MS) {
    return versionCache.value;
  }
  const latest = await fetchLatestVersion();
  if (latest) {
    versionCache.value = latest;
    versionCache.fetchedAt = Date.now();
  }
  return latest;
}

export async function GET() {
  const latestVersion = await getLatestVersionCached();
  const currentVersion = pkg.version;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

  return Response.json({ currentVersion, latestVersion, hasUpdate });
}