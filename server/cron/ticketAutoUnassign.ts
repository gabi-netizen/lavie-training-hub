/**
 * Ticket Auto-Unassign Cron
 * Runs every 30 minutes.
 * Finds tickets where:
 *   - firstAgentReplyAt is NOT NULL
 *   - firstAgentReplyAt is more than 48 hours ago
 *   - assignedTo is NOT NULL
 * Sets assignedTo = NULL for those tickets.
 * Thread/history is preserved — only the assignment is removed.
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export async function runTicketAutoUnassign() {
  const db = await getDb();
  if (!db) {
    console.error("[TicketAutoUnassign] No DB connection");
    return;
  }
  try {
    const [result] = await db.execute(sql`
      UPDATE support_tickets
      SET assignedTo = NULL
      WHERE firstAgentReplyAt IS NOT NULL
      AND firstAgentReplyAt < DATE_SUB(NOW(), INTERVAL 48 HOUR)
      AND assignedTo IS NOT NULL
      AND ticketStatus NOT IN ('resolved', 'closed')
    `);
    const affected = (result as any).affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[TicketAutoUnassign] Unassigned ${affected} tickets (48h expired)`);
    }
  } catch (err) {
    console.error("[TicketAutoUnassign] Error:", err);
  }
}

export function startTicketAutoUnassignCron() {
  console.log("[TicketAutoUnassign] Cron started — runs every 30 minutes");
  // Run immediately on startup
  runTicketAutoUnassign();
  // Then every 30 minutes
  setInterval(runTicketAutoUnassign, 30 * 60 * 1000);
}
