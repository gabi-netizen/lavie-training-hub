/**
 * Ensure Stripe billing tables exist in the database.
 * Runs on server startup — idempotent (safe to run repeatedly).
 *
 * Creates:
 *  - stripe_audit_log: records every Stripe webhook event
 *  - stripe_customers: maps internal contact IDs to Stripe Customer IDs
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureStripeTables(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] Cannot ensure Stripe tables: database not available");
    return;
  }

  // ── stripe_audit_log table ─────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stripe_audit_log (
        id int AUTO_INCREMENT NOT NULL,
        eventId varchar(128) NOT NULL,
        eventType varchar(128) NOT NULL,
        customerId varchar(128) NULL,
        subscriptionId varchar(128) NULL,
        amount int NULL,
        currency varchar(8) NULL,
        status varchar(32) NOT NULL DEFAULT 'received',
        metadata json NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT stripe_audit_log_id PRIMARY KEY(id),
        CONSTRAINT stripe_audit_log_eventId_unique UNIQUE(eventId)
      )
    `);
    console.log("[DB] stripe_audit_log table ensured");
  } catch (err) {
    console.error("[DB] Error creating stripe_audit_log table:", err);
  }

  // ── stripe_customers table ─────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stripe_customers (
        id int AUTO_INCREMENT NOT NULL,
        contactId int NOT NULL,
        stripeCustomerId varchar(128) NOT NULL,
        paymentMethodId varchar(128) NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT stripe_customers_id PRIMARY KEY(id),
        CONSTRAINT stripe_customers_contactId_unique UNIQUE(contactId),
        CONSTRAINT stripe_customers_stripeCustomerId_unique UNIQUE(stripeCustomerId)
      )
    `);
    console.log("[DB] stripe_customers table ensured");
  } catch (err) {
    console.error("[DB] Error creating stripe_customers table:", err);
  }

  // ── Add agentName / agentEmail columns to stripe_customers (idempotent) ────
  const agentColumns = [
    { name: "agentName", definition: "varchar(256) NULL" },
    { name: "agentEmail", definition: "varchar(320) NULL" },
  ];
  for (const col of agentColumns) {
    try {
      await db.execute(sql.raw(
        `ALTER TABLE stripe_customers ADD COLUMN ${col.name} ${col.definition}`
      ));
      console.log(`[DB] Added column stripe_customers.${col.name}`);
    } catch (err: any) {
      if (err?.message?.includes("Duplicate column")) {
        // Already exists, skip
      } else {
        console.warn(`[DB] Could not add stripe_customers.${col.name}:`, err);
      }
    }
  }

  // ── Add index on stripe_audit_log for faster lookups by eventType ──────────
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_stripe_audit_log_eventType
      ON stripe_audit_log (eventType)
    `);
  } catch (err) {
    // Ignore if index already exists (some MySQL versions don't support IF NOT EXISTS for indexes)
    if (!(err instanceof Error && err.message.includes("Duplicate"))) {
      console.warn("[DB] Could not create eventType index (may already exist):", err);
    }
  }

  // ── Add index on stripe_audit_log for faster lookups by customerId ─────────
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_stripe_audit_log_customerId
      ON stripe_audit_log (customerId)
    `);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Duplicate"))) {
      console.warn("[DB] Could not create customerId index (may already exist):", err);
    }
  }
}
