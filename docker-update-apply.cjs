// One-shot update applier, run inside a throwaway helper container created by
// the dashboard self-updater. Needed because a container cannot stop itself
// mid-swap: the port the replacement needs is held by the running container.
// This helper stops+removes the old container, then creates+starts its
// replacement from the captured config, and exits (AutoRemove cleans it up).
//
// Env: APPLY_TARGET (container name), APPLY_IMAGE, APPLY_CONFIG_JSON
// ({"Env","Labels","ExposedPorts","HostConfig","Networks"}).

const http = require("http");

const SOCK = "/var/run/docker.sock";
const TARGET = process.env.APPLY_TARGET;
const IMAGE = process.env.APPLY_IMAGE;
const CONFIG = JSON.parse(process.env.APPLY_CONFIG_JSON || "{}");

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({ socketPath: SOCK, method, path, headers, timeout: 120000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed || data });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!TARGET || !IMAGE) {
    console.error("[apply-update] APPLY_TARGET/APPLY_IMAGE missing");
    process.exit(1);
  }
  try {
    console.log(`[apply-update] stopping ${TARGET}…`);
    await api("POST", `/containers/${TARGET}/stop?t=10`);
    await api("DELETE", `/containers/${TARGET}?force=true`);

    const createBody = {
      Image: IMAGE,
      Env: CONFIG.Env || [],
      Labels: CONFIG.Labels || {},
      ExposedPorts: CONFIG.ExposedPorts,
      HostConfig: CONFIG.HostConfig || {},
      NetworkingConfig: { EndpointsConfig: CONFIG.Networks || {} },
    };
    console.log(`[apply-update] creating replacement from ${IMAGE}…`);
    const create = await api("POST", `/containers/create?name=${encodeURIComponent(TARGET)}`, createBody);
    if (create.status !== 201) {
      console.error("[apply-update] create failed:", JSON.stringify(create.body).slice(0, 300));
      process.exit(1);
    }
    const newId = create.body.Id;
    const start = await api("POST", `/containers/${newId}/start`);
    if (start.status !== 204 && start.status !== 304) {
      console.error("[apply-update] start failed:", start.status);
      process.exit(1);
    }
    console.log(`[apply-update] ${TARGET} replaced successfully`);

    // Auto-prune: remove the image the OLD container ran on, but only when it
    // is untagged — tagged images (v31, v32, …) stay as rollback options.
    const oldImage = process.env.APPLY_OLD_IMAGE;
    if (oldImage) {
      try {
        const info = await api("GET", `/images/${encodeURIComponent(oldImage)}/json`);
        const tags = info.body?.RepoTags || [];
        const tagged = tags.some((t) => t && !t.endsWith(":<none>"));
        if (info.status === 200 && !tagged) {
          await api("DELETE", `/images/${encodeURIComponent(oldImage)}?force=true`);
          console.log(`[apply-update] pruned old image ${String(oldImage).slice(0, 19)} (untagged)`);
        } else {
          console.log(`[apply-update] kept old image (tagged rollback): ${tags.join(",")}`);
        }
      } catch (e) {
        console.log("[apply-update] image prune skipped:", e && e.message ? e.message : e);
      }
    }
    process.exit(0);
  } catch (e) {
    console.error("[apply-update] failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
