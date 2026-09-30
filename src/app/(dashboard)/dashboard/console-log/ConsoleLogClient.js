"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Toggle } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

function detectLogLevel(line) {
  if (!line || typeof line !== "string") return "INFO";
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("EXCEPTION") || upper.includes("FAIL") || upper.includes("PM2-ERROR") || upper.includes("ERR_")) {
    return "ERROR";
  }
  if (upper.includes("WARN") || upper.includes("WARNING")) {
    return "WARN";
  }
  if (upper.includes("DEBUG")) {
    return "DEBUG";
  }
  if (upper.includes("LOG") || upper.includes("INFO") || upper.includes("[PM2-OUT]")) {
    return "INFO";
  }
  return "INFO";
}

function renderFormattedLine(line, key) {
  const level = detectLogLevel(line);
  const upper = line ? String(line).toUpperCase() : "";

  let cls = "ln";
  if (level === "ERROR") cls = "ln er";
  else if (level === "WARN") cls = "ln wa";
  else if (upper.includes("[ROUTING]") || upper.includes("[AUTH]")) cls = "ln ac";
  else if (upper.includes("[DB]") || level === "DEBUG") cls = "ln lg";

  return (
    <div key={key} className={cls}>
      {line}
    </div>
  );
}

export default function ConsoleLogClient() {
  const [appLogs, setAppLogs] = useState([]);
  const [pm2Logs, setPm2Logs] = useState([]);
  const [dockerLogs, setDockerLogs] = useState([]);
  const [pm2Info, setPm2Info] = useState({ available: false, errorCount: 0 });
  const [dockerInfo, setDockerInfo] = useState({ isDocker: false, available: false });

  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'app' | 'pm2' | 'docker'
  const [levelFilter, setLevelFilter] = useState("ALL"); // 'ALL' | 'ERROR' | 'WARN' | 'INFO'
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const logRef = useRef(null);

  // Fetch initial PM2, Docker, and App logs
  const fetchSystemLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/translator/console-logs");
      const data = await res.json();
      if (data.success) {
        if (data.logs) setAppLogs(data.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
        if (data.pm2Logs) setPm2Logs(data.pm2Logs);
        if (data.pm2Info) setPm2Info(data.pm2Info);
        if (data.dockerLogs) setDockerLogs(data.dockerLogs);
        if (data.dockerInfo) setDockerInfo(data.dockerInfo);
      }
    } catch (err) {
      console.error("Failed to fetch system logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAppLogs = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      setAppLogs([]);
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    // Intentional initial synchronization with the external log stream.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSystemLogs();

    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setAppLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        setAppLogs((prev) => {
          const next = [...prev, msg.line];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "lines") {
        setAppLogs((prev) => {
          const next = [...prev, ...msg.lines];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setAppLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Combine logs based on active tab
  const combinedLogs = useMemo(() => {
    let sourceList = [];
    if (activeTab === "all") {
      sourceList = [...appLogs, ...pm2Logs, ...dockerLogs];
    } else if (activeTab === "app") {
      sourceList = appLogs;
    } else if (activeTab === "pm2") {
      sourceList = pm2Logs;
    } else if (activeTab === "docker") {
      sourceList = dockerLogs;
    }

    return sourceList.filter((line) => {
      if (!line) return false;
      const level = detectLogLevel(line);

      if (levelFilter === "ERROR" && level !== "ERROR") return false;
      if (levelFilter === "WARN" && level !== "WARN") return false;
      if (levelFilter === "INFO" && level !== "INFO" && level !== "LOG") return false;

      if (searchQuery.trim()) {
        return line.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [activeTab, levelFilter, searchQuery, appLogs, pm2Logs, dockerLogs]);

  // Compute error count across active tab logs
  const totalErrorCount = useMemo(() => {
    const sourceList = activeTab === "all" ? [...appLogs, ...pm2Logs, ...dockerLogs] :
                       activeTab === "app" ? appLogs :
                       activeTab === "pm2" ? pm2Logs : dockerLogs;
    return sourceList.filter((line) => detectLogLevel(line) === "ERROR").length;
  }, [activeTab, appLogs, pm2Logs, dockerLogs]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [combinedLogs, autoScroll]);

  const handleCopyLogs = () => {
    const text = combinedLogs.join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="t"><b>01</b> · Console log</span>
        <div className="acts">
          <div className="seg">
            <button type="button" className={activeTab === "all" ? "on" : ""} onClick={() => setActiveTab("all")}>
              All Logs <span className="opacity-70">{appLogs.length + pm2Logs.length + dockerLogs.length}</span>
            </button>
            <button type="button" className={activeTab === "app" ? "on" : ""} onClick={() => setActiveTab("app")}>
              App Console <span className="opacity-70">{appLogs.length}</span>
            </button>
            <button type="button" className={activeTab === "pm2" ? "on" : ""} onClick={() => setActiveTab("pm2")}>
              PM2 Server Logs{pm2Info.errorCount > 0 ? ` ${pm2Info.errorCount} Err` : ""}
            </button>
            {(dockerInfo.available || dockerLogs.length > 0) && (
              <button type="button" className={activeTab === "docker" ? "on" : ""} onClick={() => setActiveTab("docker")}>
                Docker Logs <span className="opacity-70">{dockerLogs.length}</span>
              </button>
            )}
          </div>
          <span className={`st ${connected ? "ok" : "down"}`}>
            <span className={`led ${connected ? "ok pulse" : "down"}`} />
            {connected ? "Live Stream" : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted">Filter Level:</span>
        <button
          type="button"
          onClick={() => setLevelFilter("ALL")}
          className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded-[3px] border transition-colors ${
            levelFilter === "ALL"
              ? "bg-primary text-white border-primary"
              : "bg-bg border-border text-text-muted hover:text-text-main"
          }`}
        >
          ALL
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter("ERROR")}
          className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded-[3px] border transition-colors flex items-center gap-1 ${
            levelFilter === "ERROR"
              ? "bg-primary text-white border-primary"
              : "bg-bg border-border text-text-muted hover:text-text-main"
          }`}
        >
          <span>ERROR ONLY</span>
          {totalErrorCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-bold">
              {totalErrorCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter("WARN")}
          className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded-[3px] border transition-colors ${
            levelFilter === "WARN"
              ? "bg-primary text-white border-primary"
              : "bg-bg border-border text-text-muted hover:text-text-main"
          }`}
        >
          WARN
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter("INFO")}
          className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded-[3px] border transition-colors ${
            levelFilter === "INFO"
              ? "bg-primary text-white border-primary"
              : "bg-bg border-border text-text-muted hover:text-text-main"
          }`}
        >
          INFO
        </button>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="relative w-48">
            <input
              className="inp"
              placeholder="Search log text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" icon="sync" onClick={fetchSystemLogs} loading={loading}>
            Refresh
          </Button>
          <Button size="sm" variant="outline" icon="content_copy" onClick={handleCopyLogs}>
            Copy
          </Button>
          <Button size="sm" variant="outline" icon="delete" onClick={handleClearAppLogs}>
            Clear App Logs
          </Button>
          <span className="flex items-center gap-2">
            <Toggle checked={autoScroll} onChange={(next) => setAutoScroll(next)} />
            <span className="text-[11px] text-text-muted">{autoScroll ? "Auto-scroll" : "Paused"}</span>
          </span>
        </span>
      </div>

      <div className="term" ref={logRef}>
        {combinedLogs.length === 0 ? (
          <div className="empty">
            <p className="sub">No console or system logs match your filter criteria.</p>
            {levelFilter !== "ALL" && (
              <Button size="sm" variant="ghost" onClick={() => setLevelFilter("ALL")}>
                Reset level filter
              </Button>
            )}
          </div>
        ) : (
          combinedLogs.map((line, i) => renderFormattedLine(line, i))
        )}
      </div>
    </div>
  );
}
