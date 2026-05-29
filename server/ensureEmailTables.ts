/**
 * Ensure email tracking tables and columns exist.
 * Runs on startup — idempotent (safe to run repeatedly).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureEmailTrackingTables() {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] Cannot ensure email tracking tables: database not available");
    return;
  }

  // ── Add new columns to email_logs if they don't exist ──────────────────────
  const columnsToAdd = [
    { name: "htmlBody", definition: "text NULL" },
    { name: "fromEmail", definition: "varchar(320) NULL" },
    { name: "openedAt", definition: "timestamp NULL" },
    { name: "openCount", definition: "int NOT NULL DEFAULT 0" },
    { name: "clickedAt", definition: "timestamp NULL" },
    { name: "clickCount", definition: "int NOT NULL DEFAULT 0" },
  ];

  for (const col of columnsToAdd) {
    try {
      await db.execute(sql.raw(
        `ALTER TABLE email_logs ADD COLUMN ${col.name} ${col.definition}`
      ));
      console.log(`[DB] Added column email_logs.${col.name}`);
    } catch (err: any) {
      // Ignore "Duplicate column name" error (column already exists)
      if (err?.message?.includes("Duplicate column")) {
        // Already exists, skip
      } else {
        console.error(`[DB] Error adding email_logs.${col.name}:`, err);
      }
    }
  }

  // ── email_link_clicks table ────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_link_clicks (
        id int AUTO_INCREMENT NOT NULL,
        emailLogId int NOT NULL,
        linkIndex int NOT NULL,
        originalUrl text NOT NULL,
        clickedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT email_link_clicks_id PRIMARY KEY(id)
      )
    `);
    console.log("[DB] email_link_clicks table ensured");
  } catch (err) {
    console.error("[DB] Error creating email_link_clicks table:", err);
  }

  // ── email_notifications table ──────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_notifications (
        id int AUTO_INCREMENT NOT NULL,
        userId int NOT NULL,
        emailLogId int NOT NULL,
        type enum('opened','clicked') NOT NULL,
        contactId int NOT NULL,
        contactName varchar(256),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        readAt timestamp NULL,
        CONSTRAINT email_notifications_id PRIMARY KEY(id)
      )
    `);
    console.log("[DB] email_notifications table ensured");
  } catch (err) {
    console.error("[DB] Error creating email_notifications table:", err);
  }

  // ── whatsapp_messages: channel column ──────────────────────────────────────
  try {
    const [msgColumns] = await db.execute(sql`SHOW COLUMNS FROM whatsapp_messages LIKE 'channel'`);
    if (Array.isArray(msgColumns) && msgColumns.length === 0) {
      console.log("[DB] Adding 'channel' column to whatsapp_messages...");
      await db.execute(sql`ALTER TABLE whatsapp_messages ADD COLUMN channel ENUM('whatsapp', 'sms') DEFAULT 'whatsapp' NOT NULL`);
    }
  } catch (err) {
    console.error("[DB] Error adding channel column to whatsapp_messages:", err);
  }
}
