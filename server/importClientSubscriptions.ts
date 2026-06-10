/**
 * Import Client Subscriptions from JSON data.
 * This module provides:
 * 1. A function to import subscription data into the client_subscriptions table
 * 2. Used by the tRPC admin endpoint for future imports
 * 3. Can be called at startup to seed initial data from the JSON file
 */
import { getDb } from "./db";
import { clientSubscriptions, contacts } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ClientSubscriptionImportRow {
  subscriptionId: string;
  planName: string | null;
  planType: "installment" | "subscription" | "one_payment";
  customerName: string;
  email: string | null;
  amount: number | null;
  recurringAmount: number | null;
  totalAmount: number | null;
  billingCycles: number | null;
  cyclesCompleted: number | null;
  nextBillingOn: string | null; // YYYY-MM-DD
  subscriptionNumber: string | null;
  status: string;
  campaignId: string | null;
  activatedOn: string | null; // YYYY-MM-DD
  salesPerson: string;
}

/**
 * Import an array of subscription records into the database.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotent imports.
 */
export async function importClientSubscriptionsData(
  rows: ClientSubscriptionImportRow[]
): Promise<{ imported: number; errors: number }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  let imported = 0;
  let errors = 0;

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    for (const row of batch) {
      try {
        await db
          .insert(clientSubscriptions)
          .values({
            subscriptionId: row.subscriptionId,
            planName: row.planName,
            planType: row.planType,
            customerName: row.customerName,
            email: row.email,
            amount: row.amount != null ? String(row.amount) : null,
            recurringAmount: row.recurringAmount != null ? String(row.recurringAmount) : null,
            totalAmount: row.totalAmount != null ? String(row.totalAmount) : null,
            billingCycles: row.billingCycles,
            cyclesCompleted: row.cyclesCompleted,
            nextBillingOn: row.nextBillingOn ? new Date(row.nextBillingOn) : null,
            subscriptionNumber: row.subscriptionNumber,
            status: row.status,
            campaignId: row.campaignId,
            activatedOn: row.activatedOn ? new Date(row.activatedOn) : null,
            salesPerson: row.salesPerson,
          })
          .onDuplicateKeyUpdate({
            set: {
              planName: row.planName,
              planType: row.planType,
              customerName: row.customerName,
              email: row.email,
              amount: row.amount != null ? String(row.amount) : null,
              recurringAmount: row.recurringAmount != null ? String(row.recurringAmount) : null,
              totalAmount: row.totalAmount != null ? String(row.totalAmount) : null,
              billingCycles: row.billingCycles,
              cyclesCompleted: row.cyclesCompleted,
              nextBillingOn: row.nextBillingOn ? new Date(row.nextBillingOn) : null,
              subscriptionNumber: row.subscriptionNumber,
              status: row.status,
              campaignId: row.campaignId,
              activatedOn: row.activatedOn ? new Date(row.activatedOn) : null,
              salesPerson: row.salesPerson,
            },
          });
        imported++;
      } catch (err) {
        console.error(`[Import] Error importing subscription ${row.subscriptionId}:`, err);
        errors++;
      }
    }
  }

  return { imported, errors };
}

/**
 * Auto-link client subscriptions to contacts by matching email.
 * Updates contactId on client_subscriptions where a matching contact exists.
 */
export async function linkClientSubscriptionsToContacts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const result = await db.execute(sql`
      UPDATE client_subscriptions cs
      INNER JOIN contacts c ON LOWER(cs.email) = LOWER(c.email)
      SET cs.contactId = c.id
      WHERE cs.contactId IS NULL AND cs.email IS NOT NULL
    `);
    const affected = (result as any)?.[0]?.affectedRows ?? 0;
    console.log(`[Import] Linked ${affected} subscriptions to contacts`);
    return affected;
  } catch (err) {
    console.error("[Import] Error linking subscriptions to contacts:", err);
    return 0;
  }
}

/**
 * Seed the database from the bundled JSON file (one-time import).
 * Safe to call multiple times — uses upsert.
 */
export async function seedClientSubscriptionsFromFile(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Import] Cannot seed: database not available");
    return;
  }

  // Check if data already exists
  const existing = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(clientSubscriptions);
  const count = existing[0]?.count ?? 0;

  if (count > 0) {
    console.log(`[Import] client_subscriptions already has ${count} rows, skipping seed`);
    return;
  }

  // Load JSON data
  const jsonPath = path.resolve(__dirname, "data", "client_subscriptions_import.json");
  if (!fs.existsSync(jsonPath)) {
    console.warn(`[Import] Seed file not found at ${jsonPath}`);
    return;
  }

  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const rows: ClientSubscriptionImportRow[] = JSON.parse(rawData);

  console.log(`[Import] Seeding ${rows.length} client subscriptions...`);
  const result = await importClientSubscriptionsData(rows);
  console.log(`[Import] Seed complete: ${result.imported} imported, ${result.errors} errors`);

  // Auto-link to contacts
  await linkClientSubscriptionsToContacts();
}
