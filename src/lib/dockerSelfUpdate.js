// Docker self-update (path A): one-click updates for Docker installs.
// The running container drives its own replacement through the Docker API on
// the mounted socket — pull new image, rename self aside, create+start the
// replacement with the captured config, then remove itself once the new one
// is healthy. No helper container, no rebuild on the user side.
//
// REQUIRES (opt-in): ENABLE_DOCKER_SELF_UPDATE=true and
// -v /var/run/docker.sock:/var/run/docker.sock — the socket is root-equivalent
// on the host, so this is off unless the operator explicitly enables it.

import fs from "fs";
import http from "http";
import pkg from "../../package.json" with { type: "json" };

const SOCK = "/var/run/docker.sock";
const SELF_NAME = process.env.MAYDAY_CONTAINER_NAME || "mayday-router";
const IMAGE = process.env.MAYDAY_IMAGE || "mayday-router:latest";

export function dockerSelfUpdateAvailable() {
  if (process.env.ENABLE_DOCKER_SELF_UPDATE !== "true") return false;
  try {
    return fs.existsSync(SOCK);
  } catch {
    return false;
  }
}

// --- state machine (shared shape with the tarball updater) ---
const state = (global.__dockerSelfUpdateState ??= {
  phase: "idle", // idle | pulling | recreating | restarting | done | error
  progress: 0,
  message: "",
  targetVersion: null,
  error: null,
  startedAt: null,
});
function setState(patch) { Object.assign(state, patch); }
export function getDockerUpdateState() {
  return { ...state, currentVersion: pkg.version, installMode: "docker", selfUpdate: dockerSelfUpdateAvailable() };
}

function dockerApi(method, apiPath, body, stream = false) {
  return new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    if (body) headers["Content-Length"] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request(
      { socketPath: SOCK, method, path: apiPath, headers, timeout: 600000 },
      (res) => {
        if (stream) return resolve(res); // caller consumes the stream (image pull progress)
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: parsed || data });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("docker api timeout")));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function selfContainerId() {
  try {
    const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
    const m = cgroup.match(/([0-9a-f]{64})/);
    if (m) return m[1];
  } catch {}
  return SELF_NAME;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build the manual update command from THIS running container's real config —
// never a hardcoded name/port — so the guidance is correct for every install.
export async function buildManualDockerCommand() {
  const id = selfContainerId();
  let inspect;
  try {
    inspect = await dockerApi("GET", `/containers/${id}/json`);
  } catch {
    inspect = { status: 0 }; // no docker socket / not in docker — use fallback
  }
  if (inspect.status !== 200) {
    // no docker socket: build from what the process knows (port + optional name)
    const port = process.env.PORT || "20128";
    const name = process.env.MAYDAY_CONTAINER_NAME || "<container-name>";
    return [
      `docker build -t ${IMAGE} .   # or: docker pull ${IMAGE}`,
      `docker stop ${name} && docker rm ${name}`,
      `docker run -d --name ${name} --restart always -p ${port}:${port} -v <your-data-dir>:/app/data ${IMAGE}`,
      `# note: adjust <container-name> and <your-data-dir> to how you installed`,
    ].join(" && \n  ");
  }
  const cfg = inspect.body;
  const name = (cfg.Name || SELF_NAME).replace(/^\//, "");
  const parts = [`docker stop ${name}`, `docker rm ${name}`];
  let run = `docker run -d --name ${name}`;
  const restart = cfg.HostConfig?.RestartPolicy?.Name;
  if (restart) run += ` --restart ${restart}`;
  const ports = cfg.HostConfig?.PortBindings || {};
  for (const [containerPort, bindings] of Object.entries(ports)) {
    for (const b of bindings || []) run += ` -p ${b.HostPort}:${containerPort.replace("/tcp", "")}`;
  }
  const skipEnv = new Set(["PATH", "NODE_VERSION", "YARN_VERSION", "HOSTNAME", "HOME"]);
  for (const e of cfg.Config?.Env || []) {
    const k = e.split("=")[0];
    if (!skipEnv.has(k)) run += ` -e ${k}="..."`;
  }
  for (const m of cfg.Mounts || []) {
    if (m.Type === "bind") run += ` -v ${m.Source}:${m.Destination}`;
  }
  const networks = Object.keys(cfg.NetworkSettings?.Networks || {}).filter((n) => n !== "bridge");
  if (networks.length) run += ` --network ${networks[0]}`;
  run += ` ${IMAGE}`;
  const extra = networks.slice(1).map((n) => `docker network connect ${n} ${name}`);
  return [
    `docker build -t ${IMAGE} .   # or: docker pull ${IMAGE}`,
    ...parts,
    run,
    ...extra,
  ].join(" && \n  ");
}

export async function startDockerSelfUpdate(targetVersion) {
  if (state.phase !== "idle" && state.phase !== "done" && state.phase !== "error") {
    throw new Error("An update is already in progress");
  }
  if (!dockerSelfUpdateAvailable()) {
    throw new Error("Docker self-update is not enabled (set ENABLE_DOCKER_SELF_UPDATE=true and mount /var/run/docker.sock)");
  }

  const id = selfContainerId();
  setState({ phase: "pulling", progress: 5, message: `Pulling new image (${IMAGE})…`, targetVersion: targetVersion || null, error: null, startedAt: Date.now() });

  try {
    // 1 · read own config (this exact container gets recreated on the new image)
    const inspect = await dockerApi("GET", `/containers/${id}/json`);
    if (inspect.status !== 200) throw new Error("Cannot inspect own container");
    const cfg = inspect.body;

    // 2 · pull the new image — registry-first, with a local fallback so
    // self-update also works for images built on this host without a registry
    const [fromImage, tag] = IMAGE.includes(":") ? IMAGE.split(":") : [IMAGE, "latest"];
    try {
      const pull = await dockerApi("POST", `/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`, null, true);
      await new Promise((resolve, reject) => {
        pull.on("data", () => {}); // drain progress stream
        pull.on("error", reject);
        pull.on("end", resolve);
      });
      setState({ progress: 70, message: "Image pulled" });
    } catch (e) {
      const local = await dockerApi("GET", `/images/${encodeURIComponent(IMAGE)}/json`);
      if (local.status !== 200) throw e; // no registry AND no local image — real failure
      setState({ progress: 70, message: "Using locally built image (registry unavailable)" });
    }

    // 3 · hand the swap to a throwaway helper container. A container cannot
    // stop itself mid-swap (the replacement needs the port the old one holds),
    // so the helper does: stop+remove old → create+start new → exit.
    setState({ phase: "recreating", message: "Recreating container…" });
    const applyConfig = {
      Env: cfg.Config.Env,
      Labels: { ...(cfg.Config.Labels || {}), "mayday.self-updated": "true" },
      ExposedPorts: cfg.Config.ExposedPorts,
      HostConfig: cfg.HostConfig,
      Networks: cfg.NetworkSettings?.Networks
        ? Object.fromEntries(Object.keys(cfg.NetworkSettings.Networks).map((n) => [n, {}]))
        : {},
    };
    const helperBody = {
      Image: IMAGE,
      Cmd: ["node", "custom-server.js", "--apply-update"],
      Env: [
        `APPLY_TARGET=${SELF_NAME}`,
        `APPLY_IMAGE=${IMAGE}`,
        `APPLY_CONFIG_JSON=${JSON.stringify(applyConfig)}`,
        `APPLY_OLD_IMAGE=${cfg.Image}`, // image the old container ran on → pruned if untagged
      ],
      Labels: { "mayday.update-helper": "true" },
      HostConfig: {
        Binds: [`${SOCK}:${SOCK}`],
        AutoRemove: true,
      },
    };
    const helper = await dockerApi("POST", "/containers/create", helperBody);
    if (helper.status !== 201) {
      throw new Error(`Failed to create update helper: ${helper.body?.message || helper.status}`);
    }
    const start = await dockerApi("POST", `/containers/${helper.body.Id}/start`);
    if (start.status !== 204 && start.status !== 304) throw new Error("Failed to start update helper");

    // The helper now stops this container — the UI reconnects when the
    // replacement answers /api/health again.
    setState({ phase: "restarting", progress: 90, message: "Replacement is starting — the dashboard will reconnect…" });
  } catch (e) {
    setState({ phase: "error", message: "Docker self-update failed", error: e?.message || String(e) });
    throw e;
  }
}
