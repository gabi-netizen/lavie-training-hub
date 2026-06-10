/**
 * Ensure client_subscriptions table exists.
 * Runs CREATE TABLE IF NOT EXISTS on startup so we don't need
 * to manually run migrations on Railway.
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
        amount decimal(10,2),
        recurringAmount decimal(10,2),
        totalAmount decimal(10,2),
        billingCycles int,
        cyclesCompleted int,
        nextBillingOn date,
        subscriptionNumber varchar(64),
        status varchar(32) NOT NULL,
        campaignId varchar(128),
        activatedOn date,
        createdOn date,
        salesPerson varchar(128) NOT NULL,
        contactId int,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT client_subscriptions_id PRIMARY KEY (id),
        CONSTRAINT client_subscriptions_subscriptionId_unique UNIQUE (subscriptionId)
      )
    `);
    console.log("[DB] client_subscriptions table ensured");
  } catch (err) {
    console.error("[DB] Error ensuring client_subscriptions table:", err);
  }
}
