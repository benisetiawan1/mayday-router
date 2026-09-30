"use client";

import { useState, useEffect } from "react";

export default function RequestLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /* eslint-disable react-hooks/immutability --
     One-time bootstrap fetch on mount; fetchLogs is declared below. */
  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs(false);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchLogs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch("/api/usage/request-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="t">Request Logs</span>
        <div className="acts">
          <span className="dim" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Auto Refresh (3s)</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            aria-label="Auto Refresh (3s)"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`sw${autoRefresh ? " on" : ""}`}
          />
        </div>
      </div>

      <div className="term">
        {loading && logs.length === 0 ? (
          <div className="ln lg">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="ln lg">No logs recorded yet.</div>
        ) : (
          logs.map((log, i) => {
            const parts = log.split(" | ");
            if (parts.length < 7) return null;

            const status = parts[6];
            const isPending = status.includes("PENDING");
            const isFailed = status.includes("FAILED");

            return (
              <div
                key={`${parts[0]}-${parts[1]}-${parts[3]}-${i}`}
                className={`ln ${isFailed ? "er" : isPending ? "wa" : ""}`}
              >
                {log}
              </div>
            );
          })
        )}
      </div>
      <div className="faint" style={{ padding: "8px 16px", fontSize: 10 }}>
        Logs are loaded from the request history database.
      </div>
    </div>
  );
}
