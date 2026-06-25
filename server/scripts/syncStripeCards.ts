/**
 * One-time sync script: Fetch card info from Stripe for all contacts with email,
 * and update their cardLast4/cardBrand/cardExpMonth/cardExpYear fields.
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx server/scripts/syncStripeCards.ts
 *
 * This script is meant to be run manually once to backfill existing contacts.
 * After this, the Stripe webhook keeps card fields up to date.
 */
import Stripe from "stripe";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env var");
  process.exit(1);
}
if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY env var");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL!);

  // Get all contacts with an email address
  const [rows] = await conn.execute(
    `SELECT id, email FROM contacts WHERE email IS NOT NULL AND email != ''`
  ) as [Array<{ id: number; email: string }>, any];

  console.log(`[SyncStripeCards] Found ${rows.length} contacts with email`);

  // Deduplicate by email to avoid hitting Stripe multiple times for the same customer
  const emailMap = new Map<string, number[]>();
  for (const row of rows) {
    const email = row.email.toLowerCase().trim();
    if (!emailMap.has(email)) {
      emailMap.set(email, []);
    }
    emailMap.get(email)!.push(row.id);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [email, contactIds] of Array.from(emailMap.entries())) {
    try {
      // Find Stripe customer by email
      const customers = await stripe.customers.list({ email, limit: 1 });
      const cust = customers.data[0];
      if (!cust) {
        skipped++;
        continue;
      }

      // Get the default payment method (card)
      const methods = await stripe.paymentMethods.list({
        customer: cust.id,
        type: "card",
        limit: 1,
      });
      const pm = methods.data[0];
      if (!pm?.card) {
        skipped++;
        continue;
      }

      const cardLast4 = pm.card.last4 ?? null;
      const cardBrand = pm.card.brand ?? null;
      const cardExpMonth = pm.card.exp_month ?? null;
      const cardExpYear = pm.card.exp_year ?? null;

      // Update all contacts with this email
      for (const contactId of contactIds) {
        await conn.execute(
          `UPDATE contacts SET cardLast4 = ?, cardBrand = ?, cardExpMonth = ?, cardExpYear = ? WHERE id = ?`,
          [cardLast4, cardBrand, cardExpMonth, cardExpYear, contactId]
        );
      }

      updated += contactIds.length;
      console.log(`[SyncStripeCards] Updated ${contactIds.length} contact(s) for ${email}: ${cardBrand} ****${cardLast4}`);

      // Rate limit: Stripe allows 100 req/s but be conservative
      await new Promise((r) => setTimeout(r, 100));
    } catch (err: any) {
      errors++;
      console.error(`[SyncStripeCards] Error for ${email}:`, err.message);
    }
  }

  console.log(`\n[SyncStripeCards] Done. Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
  await conn.end();
}

main().catch((err) => {
  console.error("[SyncStripeCards] Fatal error:", err);
  process.exit(1);
});
