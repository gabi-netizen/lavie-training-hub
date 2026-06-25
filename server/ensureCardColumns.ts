/**
 * Ensure Stripe card columns exist on contacts.
 * Runs on startup — safe to call repeatedly (idempotent).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureCardColumns() {
  const db = await getDb();
  if (!db) return;

  const columns = [
    { name: "cardLast4", ddl: "VARCHAR(4) DEFAULT NULL" },
    { name: "cardBrand", ddl: "VARCHAR(32) DEFAULT NULL" },
    { name: "cardExpMonth", ddl: "INT DEFAULT NULL" },
    { name: "cardExpYear", ddl: "INT DEFAULT NULL" },
  ];

  for (const col of columns) {
    try {
      await db.execute(sql.raw(
        `ALTER TABLE contacts ADD COLUMN ${col.name} ${col.ddl}`
      ));
      console.log(`[DB] ${col.name} column added to contacts`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
        // Column already exists — fine
      } else {
        console.error(`[DB] Error adding ${col.name} column:`, err);
      }
    }
  }
}
