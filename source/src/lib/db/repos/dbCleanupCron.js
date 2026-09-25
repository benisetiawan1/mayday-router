/**
 * Mayday: Periodic cleanup of aged data from requestDetails/usageHistory tables
 * Runs every 24 hours, removes entries older than 30 days
 */

import { getAdapterSync } from "../driver.js";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_AGE_DAYS = 30;

let cleanupStarted = false;

export function startDbCleanupCron() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  console.log("[DB][cleanup] Starting periodic cleanup cron (every 24h, max age 30d)");

  // Run first cleanup after 5 minutes
  setTimeout(runCleanup, 5 * 60 * 1000);

  // Then every 24 hours
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

async function runCleanup() {
  try {
    const adapter = getAdapterSync();
    const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Cleanup requestDetails
    const deletedRequests = adapter.run(
      "DELETE FROM requestDetails WHERE timestamp < ?",
      [cutoffDate]
    );

    // Cleanup usageHistory
    const deletedUsage = adapter.run(
      "DELETE FROM usageHistory WHERE timestamp < ?",
      [cutoffDate]
    );

    const totalDeleted = (deletedRequests?.changes || 0) + (deletedUsage?.changes || 0);
    if (totalDeleted > 0) {
      console.log(`[DB][cleanup] Removed ${totalDeleted} aged entries (>${MAX_AGE_DAYS} days old)`);
    }
  } catch (err) {
    console.error("[DB][cleanup] Error during cleanup:", err.message);
  }
}
