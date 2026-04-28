/**
 * Ensure the shareToken column exists on call_analyses.
 * Runs on startup — safe to call repeatedly (idempotent).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureShareTokenColumn() {
  const db = await getDb();
  if (!db) return;

  // Add column
  try {
    await db.execute(sql`
      ALTER TABLE call_analyses ADD COLUMN shareToken varchar(64) DEFAULT NULL
    `);
    console.log("[DB] shareToken column added to call_analyses");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
      // Column already exists — fine
    } else {
      console.error("[DB] Error adding shareToken column:", err);
    }
  }

  // Add unique index
  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX call_analyses_shareToken_unique ON call_analyses(shareToken)
    `);
    console.log("[DB] shareToken unique index created");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME" || err?.message?.includes("Duplicate key name")) {
      // Index already exists — fine
    } else {
      console.error("[DB] Error creating shareToken index:", err);
    }
  }
}
