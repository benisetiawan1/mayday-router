"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

// One-click dashboard update (tarball path). Polls /api/update/status while the
// server downloads/verifies/installs, then waits for the restart and reloads.
// stage tracker — driven by the real server phase, no synthetic animation
const STAGES = [
  { label: "Downloading update", keys: ["downloading", "pulling"] },
  { label: "Verifying package", keys: ["verifying"] },
  { label: "Installing", keys: ["installing", "recreating"] },
  { label: "Restarting server", keys: ["restarting"] },
  { label: "Done", keys: ["done"] },
];
function stageIndex(phase) {
  const i = STAGES.findIndex((s) => s.keys.includes(phase));
  return i === -1 ? 0 : i;
}

export default function UpdateModal({ isOpen, onClose, latestVersion }) {
  const [phase, setPhase] = useState("confirm"); // confirm | running | restarting | done | error
  const [serverPhase, setServerPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const polling = useRef(null);

  const reset = () => {
    setPhase("confirm");
    setProgress(0);
    setMessage("");
    setError(null);
    if (polling.current) clearInterval(polling.current);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => () => polling.current && clearInterval(polling.current), []);

  const waitForRestart = () => {
    setPhase("restarting");
    setServerPhase("restarting");
    setMessage("Restarting — the dashboard will reload automatically…");
    if (polling.current) clearInterval(polling.current);
    polling.current = setInterval(async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) {
          clearInterval(polling.current);
          // verify the version actually changed before declaring success —
          // a swap onto an unchanged bundle/image must not look like an update
          try {
            const v = await (await fetch("/api/version", { cache: "no-store" })).json();
            if (latestVersion && v.currentVersion && v.currentVersion !== latestVersion) {
              setPhase("error");
              setError(`Restarted, but still on v${v.currentVersion} — the v${latestVersion} bundle/image was not available to install. Build or pull it first, then retry.`);
              return;
            }
          } catch { /* version probe failed — fall through to done */ }
          setPhase("done");
          setMessage("Update complete — reloading…");
          setTimeout(() => globalThis.location.reload(), 800);
        }
      } catch { /* still restarting */ }
    }, 1500);
  };

  const start = async () => {
    setPhase("running");
    setError(null);
    try {
      const res = await fetch("/api/update/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Update failed to start");
    } catch (e) {
      setPhase("error");
      setError(e.message);
      return;
    }
    polling.current = setInterval(async () => {
      try {
        const res = await fetch("/api/update/status", { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        setServerPhase(s.phase || "");
        setProgress(s.progress || 0);
        setMessage(s.message || "");
        // completion: the replacement container answers with the target version
        // (fresh idle state) — the swap is fast, so don't rely on catching a
        // "restarting" phase or a dropped connection
        if (latestVersion && s.currentVersion === latestVersion && (s.phase === "idle" || s.phase === "done")) {
          clearInterval(polling.current);
          setPhase("done");
          setMessage("Update complete — reloading…");
          setTimeout(() => globalThis.location.reload(), 800);
        } else if (s.phase === "error") {
          clearInterval(polling.current);
          setPhase("error");
          setError(s.error || "Update failed");
        } else if (s.phase === "restarting") {
          waitForRestart();
        }
      } catch {
        // server is going down for the swap → restart phase
        waitForRestart();
      }
    }, 1000);
  };

  return (
    <Modal isOpen={isOpen} onClose={phase === "running" || phase === "restarting" ? () => {} : handleClose} title="Update Mayday" size="sm">
      {phase === "confirm" && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Update to <span className="text-text-main font-semibold">v{latestVersion}</span>? Everything happens
            automatically — download, verify, install, restart. Your data and keys are untouched.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={start}>Update now</Button>
          </div>
        </div>
      )}
      {(phase === "running" || phase === "restarting") && (
        <div className="space-y-4">
          <div className="upd-stages">
            {STAGES.map((st, i) => {
              const current = stageIndex(serverPhase);
              const state = i < current ? "done" : i === current ? "active" : "pending";
              return (
                <div key={st.label} className={`upd-stage ${state}`}>
                  <span className={`led ${state === "done" ? "ok" : state === "active" ? "warn pulse" : ""}`} />
                  <span className="upd-stage-label">{st.label}</span>
                  {state === "done" && <span className="upd-check">✓</span>}
                  {state === "active" && <span className="upd-dots"><i /><i /><i /></span>}
                </div>
              );
            })}
          </div>
          {(serverPhase === "downloading" || serverPhase === "pulling") && (
            <div className="crbar"><i style={{ width: `${progress}%` }} /></div>
          )}
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">{message || "Working…"} — do not close this tab</p>
        </div>
      )}
      {phase === "done" && (
        <p className="text-sm text-success">{message}</p>
      )}
      {phase === "error" && (
        <div className="space-y-4">
          <p className="text-sm text-danger">Update failed: {error}</p>
          <p className="text-xs text-text-muted">Your current installation was left untouched.</p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
