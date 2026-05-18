/**
 * Ensure the brands column exists on contacts.
 * Runs on startup — safe to call repeatedly (idempotent).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureBrandsColumn() {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql`
      ALTER TABLE contacts ADD COLUMN brands VARCHAR(512) DEFAULT NULL
    `);
    console.log("[DB] brands column added to contacts");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
      // Column already exists — fine
    } else {
      console.error("[DB] Error adding brands column:", err);
    }
  }
}
