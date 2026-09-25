import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

// Mayday self-hosted update channel — check latest release from OWN GitHub repo,
// NOT from npm registry or upstream mayday/Mayday.
const GITHUB_REPO = "benisetiawan1/mayday-router";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""; // wajib untuk repo private; kosong utk public
const VERSION_CACHE_TTL_MS = 300000; // cache latest lookup for 5m

// Survive hot reload; one cache per process
const versionCache = (global.__githubVersionCache ??= { value: null, fetchedAt: 0 });

// Fetch latest release tag from GitHub API
function fetchLatestVersion() {
  return new Promise((resolve) => {
    const headers = { "User-Agent": "mayday-router", Accept: "application/vnd.github+json" };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const req = https.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { timeout: 4000, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const tag = JSON.parse(data).tag_name;
            resolve(tag ? String(tag).replace(/^v/i, "") : null);
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

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
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
