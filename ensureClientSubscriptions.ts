/**
 * Ensure client_subscriptions table exists with all required columns.
 * Runs CREATE TABLE IF NOT EXISTS on startup so we don't need
 * to manually run migrations on Railway.
 * Also adds new columns if the table already exists (ALTER TABLE).
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureClientSubscriptionsTable() {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] Cannot ensure client_subscriptions table: database not available");
    return;
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_subscriptions (
        id int AUTO_INCREMENT NOT NULL,
        subscriptionId varchar(128) NOT NULL,
        planName varchar(256),
        planType enum('installment','subscription','one_payment') NOT NULL,
        customerName varchar(256) NOT NULL,
        email varchar(320),
        phone varchar(64),
        amount decimal(10,2),
        setupFee decimal(10,2),
        recurringAmount decimal(10,2),
        totalAmount decimal(10,2),
        billingCycles int,
        currentBillingCycle int,
        cyclesCompleted int,
        nextBillingOn date,
        lastBilledOn date,
        subscriptionNumber varchar(64),
        status varchar(32) NOT NULL,
        campaignId varchar(128),
        activatedOn date,
        createdOn date,
        cancelledDate date,
        salesPerson varchar(128) NOT NULL,
        products json,
        contactId int,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT client_subscriptions_id PRIMARY KEY (id),
        CONSTRAINT client_subscriptions_subscriptionId_unique UNIQUE (subscriptionId)
      )
    `);
    console.log("[DB] client_subscriptions table ensured");

    // Add new columns if table already existed without them
    const newColumns = [
      { name: "phone", def: "varchar(64) DEFAULT NULL AFTER email" },
      { name: "currentBillingCycle", def: "int DEFAULT NULL AFTER billingCycles" },
      { name: "lastBilledOn", def: "date DEFAULT NULL AFTER nextBillingOn" },
      { name: "cancelledDate", def: "date DEFAULT NULL AFTER createdOn" },
      { name: "products", def: "json DEFAULT NULL AFTER salesPerson" },
    ];
    for (const col of newColumns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE client_subscriptions ADD COLUMN ${col.name} ${col.def}`));
      } catch (_e: any) {
        // Column already exists — ignore "Duplicate column name" error
      }
    }
  } catch (err) {
    console.error("[DB] Error ensuring client_subscriptions table:", err);
  }
}
