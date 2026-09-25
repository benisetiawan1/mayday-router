import fs from "fs";
import path from "path";
import os from "os";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return typeof str === "string" ? str.replace(ANSI_RE, "") : "";
}

/**
 * Reads tail of a file safely up to maxBytes (default 256KB).
 */
function readTailLines(filePath, maxBytes = 256 * 1024, maxLines = 300) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return [];

    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);

    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
    fs.closeSync(fd);

    const content = stripAnsi(buffer.toString("utf8"));
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch (err) {
    return [`[PM2 Reader Error] ${err.message}`];
  }
}

/**
 * Fetch PM2 logs (error log and stdout log) for 9router process.
 */
export function getPm2Logs(maxLinesPerFile = 200) {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
  const pm2LogsDir = path.join(pm2Home, "logs");

  if (!fs.existsSync(pm2LogsDir)) {
    return {
      available: false,
      reason: `PM2 log directory not found at ${pm2LogsDir}`,
      errorLogs: [],
      outLogs: [],
      combined: [],
    };
  }

  // Find candidate log files
  let errorLogFile = null;
  let outLogFile = null;

  try {
    const files = fs.readdirSync(pm2LogsDir);
    // Prefer 9router-error.log or 9router-dev-error.log or 9router-error-0.log
    for (const f of files) {
      if (!errorLogFile && (f.includes("9router") || f.includes("router")) && f.includes("error")) {
        errorLogFile = path.join(pm2LogsDir, f);
      }
      if (!outLogFile && (f.includes("9router") || f.includes("router")) && (f.includes("out") || f.includes("output"))) {
        outLogFile = path.join(pm2LogsDir, f);
      }
    }

    // Fallbacks
    if (!errorLogFile && fs.existsSync(path.join(pm2LogsDir, "9router-error.log"))) {
      errorLogFile = path.join(pm2LogsDir, "9router-error.log");
    }
    if (!outLogFile && fs.existsSync(path.join(pm2LogsDir, "9router-out.log"))) {
      outLogFile = path.join(pm2LogsDir, "9router-out.log");
    }
  } catch {
    // Ignore read errors
  }

  const rawErrorLines = errorLogFile ? readTailLines(errorLogFile, 512 * 1024, maxLinesPerFile) : [];
  const rawOutLines = outLogFile ? readTailLines(outLogFile, 512 * 1024, maxLinesPerFile) : [];

  const errorLogs = rawErrorLines.map((line) => {
    if (line.includes("[PM2]") || line.includes("[ERROR]")) return line;
    return `[PM2-ERROR] ${line}`;
  });

  const outLogs = rawOutLines.map((line) => {
    if (line.includes("[PM2]") || line.includes("[INFO]")) return line;
    return `[PM2-OUT] ${line}`;
  });

  return {
    available: true,
    errorLogFile,
    outLogFile,
    errorLogs,
    outLogs,
    combined: [...errorLogs, ...outLogs].slice(-maxLinesPerFile * 2),
  };
}

/**
 * Fetch Docker / System container logs if available.
 */
export function getDockerLogs(maxLines = 200) {
  const isDocker = fs.existsSync("/.dockerenv") || process.env.DATA_DIR === "/app/data";
  const dockerLogDir = "/app/data/logs";

  if (!isDocker && !fs.existsSync(dockerLogDir)) {
    return {
      isDocker: false,
      available: false,
      logs: [],
    };
  }

  const logs = [];
  if (fs.existsSync(dockerLogDir)) {
    try {
      const files = fs.readdirSync(dockerLogDir).filter((f) => f.endsWith(".log"));
      for (const f of files) {
        const fullPath = path.join(dockerLogDir, f);
        const lines = readTailLines(fullPath, 256 * 1024, maxLines / 2);
        logs.push(...lines.map((l) => `[DOCKER:${f.replace(".log", "")}] ${l}`));
      }
    } catch {
      // Ignore read errors
    }
  }

  return {
    isDocker,
    available: logs.length > 0,
    logs: logs.slice(-maxLines),
  };
}
