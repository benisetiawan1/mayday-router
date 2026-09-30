"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

// One-click dashboard update (tarball path). Polls /api/update/status while the
// server downloads/verifies/installs, then waits for the restart and reloads.
export default function UpdateModal({ isOpen, onClose, latestVersion }) {
  const [phase, setPhase] = useState("confirm"); // confirm | running | restarting | done | error
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
    setMessage("Restarting — the dashboard will reload automatically…");
    if (polling.current) clearInterval(polling.current);
    polling.current = setInterval(async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) {
          clearInterval(polling.current);
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
        setProgress(s.progress || 0);
        setMessage(s.message || "");
        if (s.phase === "error") {
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
          <div className="flex items-center gap-3">
            <span className="led ok pulse" />
            <p className="text-sm text-text-main">{message || "Working…"}</p>
          </div>
          <div className="crbar"><i style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">Do not close this tab</p>
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
