/**
 * Nightly Cooling Pool Cron
 * Runs at 23:00 every day.
 * Moves all leads with status "no_answer" that are assigned to an agent → unassigned (Cooling Pool).
 * The lead keeps its status (no_answer) and updatedAt is NOT manually changed.
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export async function runNightlyCoolingPool() {
  const db = await getDb();
  if (!db) {
    console.error("[CoolingPool] No DB connection");
    return;
  }

  try {
    const [result] = await db.execute(sql`
      UPDATE contacts 
      SET agentName = NULL, agentEmail = NULL, assignedUserId = NULL
      WHERE status = 'no_answer' 
      AND agentName IS NOT NULL 
      AND agentName != ''
    `);

    const affected = (result as any).affectedRows ?? 0;
    console.log(`[CoolingPool] Nightly run: moved ${affected} N/A leads to Cooling Pool`);
  } catch (err) {
    console.error("[CoolingPool] Error during nightly run:", err);
  }
}

/**
 * Starts the nightly cron using setInterval.
 * Calculates ms until next 23:00 UTC, then runs every 24h.
 */
export function startNightlyCron() {
  const HOUR = 23; // 23:00 UTC (close to UK midnight)

  function msUntilNext(hour: number): number {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  const msToFirst = msUntilNext(HOUR);
  console.log(`[CoolingPool] Nightly cron scheduled. First run in ${Math.round(msToFirst / 60000)} minutes (23:00 UTC)`);

  // First run
  setTimeout(() => {
    runNightlyCoolingPool();
    // Then every 24 hours
    setInterval(runNightlyCoolingPool, 24 * 60 * 60 * 1000);
  }, msToFirst);
}
