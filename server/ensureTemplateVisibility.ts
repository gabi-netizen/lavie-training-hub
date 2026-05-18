/**
 * Ensure the visibility column exists on email_templates.
 * Runs on startup — safe to call repeatedly (idempotent).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureTemplateVisibilityColumn() {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql`
      ALTER TABLE email_templates ADD COLUMN visibility TEXT DEFAULT NULL
    `);
    console.log("[DB] visibility column added to email_templates");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
      // Column already exists — fine
    } else {
      console.error("[DB] Error adding visibility column:", err);
    }
  }
}
