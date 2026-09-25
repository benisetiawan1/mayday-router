// Mayday custom: periodic age-based DB cleanup.
// requestDetails is also count-pruned by requestDetailsRepo, but usageHistory
// and usageDaily grow unbounded — this bounds them by AGE so the SQLite
// file never balloons. Self-starts on import (startDbCleanupCron).
import { getAdapter } from "../driver.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h
const REQUEST_DETAILS_MAX_AGE_DAYS = 7;
const USAGE_HISTORY_MAX_AGE_DAYS = 30;
const USAGE_DAILY_MAX_AGE_DAYS = 180;

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function runCleanup() {
  try {
    const db = await getAdapter();
    const cutoffDetails = daysAgoIso(REQUEST_DETAILS_MAX_AGE_DAYS);
    const cutoffHistory = daysAgoIso(USAGE_HISTORY_MAX_AGE_DAYS);
    const cutoffDaily = daysAgoIso(USAGE_DAILY_MAX_AGE_DAYS).slice(0, 10); // YYYY-MM-DD
    db.transaction(() => {
      db.run(`DELETE FROM requestDetails WHERE timestamp < ?`, [cutoffDetails]);
      db.run(`DELETE FROM usageHistory WHERE timestamp < ?`, [cutoffHistory]);
      db.run(`DELETE FROM usageDaily WHERE dateKey < ?`, [cutoffDaily]);
    });
    try { db.checkpoint(); } catch {}
    console.log(
      `[dbCleanupCron] purged records older than ${REQUEST_DETAILS_MAX_AGE_DAYS}d/${USAGE_HISTORY_MAX_AGE_DAYS}d/${USAGE_DAILY_MAX_AGE_DAYS}d`
    );
  } catch (e) {
    console.error("[dbCleanupCron] cleanup failed:", e);
  }
}

export function startDbCleanupCron() {
  if (global._dbCleanupCronStarted) return;
  global._dbCleanupCronStarted = true;
  const first = setTimeout(runCleanup, 60000); // kick off ~1min after boot
  if (typeof first.unref === "function") first.unref();
  const t = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  if (typeof t.unref === "function") t.unref();
}
