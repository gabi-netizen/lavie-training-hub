/**
 * One-time sync script: Fetch card expiry data from Stripe for all customers
 * who have an active (status='live') subscription or installment plan in the DB.
 *
 * Approach:
 *   1. Query DB for DISTINCT emails from client_subscriptions WHERE status='live'
 *   2. For each email, look up the Stripe customer and get their default card
 *   3. Update contacts table (cardLast4, cardBrand, cardExpMonth, cardExpYear)
 *
 * Uses raw fetch to Stripe API — no SDK (dynamic import fails on Railway).
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx server/scripts/syncStripeCardsFull.ts
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_BILLING_SECRET_KEY;

if (!DATABASE_URL) {
  console.error("[SyncStripeCards] Missing DATABASE_URL env var");
  process.exit(1);
}
if (!STRIPE_KEY) {
  console.error("[SyncStripeCards] Missing STRIPE_SECRET_KEY env var");
  process.exit(1);
}

const STRIPE_HEADERS = {
  Authorization: `Bearer ${STRIPE_KEY}`,
};

// ─── Stripe helpers ──────────────────────────────────────────────────────────

interface StripeCard {
  last4: string;
  brand: string;
  exp_month: number;
  exp_year: number;
}

async function fetchPaymentMethodCard(pmId: string): Promise<StripeCard | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
      headers: STRIPE_HEADERS,
    });
    if (!res.ok) return null;
    const pm = await res.json() as any;
    if (pm?.card) {
      return {
        last4: pm.card.last4,
        brand: pm.card.brand,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      };
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** Find the best card for a Stripe customer ID */
async function getCardForCustomerId(customerId: string): Promise<StripeCard | null> {
  // 1. Fetch customer to get invoice_settings.default_payment_method
  try {
    const custRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: STRIPE_HEADERS,
    });
    if (custRes.ok) {
      const cust = await custRes.json() as any;

      // Try default payment method first
      const defaultPmId = cust.invoice_settings?.default_payment_method;
      if (defaultPmId && typeof defaultPmId === "string") {
        const card = await fetchPaymentMethodCard(defaultPmId);
        if (card) return card;
      }

      // Try legacy default_source (card_xxx)
      const defaultSourceId = cust.default_source;
      if (defaultSourceId && typeof defaultSourceId === "string" && defaultSourceId.startsWith("card_")) {
        const srcRes = await fetch(
          `https://api.stripe.com/v1/customers/${customerId}/sources/${defaultSourceId}`,
          { headers: STRIPE_HEADERS }
        );
        if (srcRes.ok) {
          const src = await srcRes.json() as any;
          if (src.object === "card" && src.last4) {
            return {
              last4: src.last4,
              brand: src.brand,
              exp_month: src.exp_month,
              exp_year: src.exp_year,
            };
          }
        }
      }
    }
  } catch (_) { /* ignore */ }

  // 2. Fall back: list attached payment methods (type=card)
  try {
    const pmListRes = await fetch(
      `https://api.stripe.com/v1/payment_methods?customer=${customerId}&type=card&limit=1`,
      { headers: STRIPE_HEADERS }
    );
    if (pmListRes.ok) {
      const pmData = await pmListRes.json() as { data: any[] };
      const pm = pmData.data[0];
      if (pm?.card) {
        return {
          last4: pm.card.last4,
          brand: pm.card.brand,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    }
  } catch (_) { /* ignore */ }

  return null;
}

/** Find a Stripe customer ID by email (returns first match) */
async function findStripeCustomerByEmail(email: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
      { headers: STRIPE_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json() as { data: any[] };
    return data.data[0]?.id ?? null;
  } catch (_) {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL!);
  console.log("[SyncStripeCards] Connected to DB");

  // Step 1: Get all distinct emails from live subscriptions/installments
  const [emailRows] = await conn.execute(
    `SELECT DISTINCT email FROM client_subscriptions
     WHERE status = 'live'
       AND email IS NOT NULL
       AND email != ''`
  ) as [Array<{ email: string }>, any];

  console.log(`[SyncStripeCards] Found ${emailRows.length} distinct live-customer emails to sync`);

  let updated = 0;
  let skipped = 0;
  let noCard = 0;
  let errors = 0;

  for (let i = 0; i < emailRows.length; i++) {
    const email = emailRows[i].email.toLowerCase().trim();
    console.log(`[SyncStripeCards] [${i + 1}/${emailRows.length}] Processing ${email}`);

    try {
      // Step 2: Find Stripe customer by email
      const customerId = await findStripeCustomerByEmail(email);
      if (!customerId) {
        console.log(`  → No Stripe customer found, skipping`);
        skipped++;
        continue;
      }

      // Step 3: Get card data
      const card = await getCardForCustomerId(customerId);
      if (!card) {
        console.log(`  → No card found in Stripe for ${customerId}, skipping`);
        noCard++;
        continue;
      }

      // Step 4: Update contacts table (all rows matching this email)
      const [result] = await conn.execute(
        `UPDATE contacts
         SET cardLast4 = ?, cardBrand = ?, cardExpMonth = ?, cardExpYear = ?
         WHERE LOWER(email) = ?`,
        [card.last4, card.brand, card.exp_month, card.exp_year, email]
      ) as [mysql.ResultSetHeader, any];

      const affected = result.affectedRows ?? 0;
      updated += affected;
      console.log(
        `  → ✓ ${card.brand} ****${card.last4} exp ${card.exp_month}/${card.exp_year} — updated ${affected} contact(s)`
      );

      // Small delay to stay within Stripe rate limits
      await new Promise((r) => setTimeout(r, 100));
    } catch (err: any) {
      errors++;
      console.error(`  → ✗ Error for ${email}:`, err.message);
    }
  }

  console.log(`
[SyncStripeCards] ─── DONE ───────────────────────────────────────────
  Live emails processed           : ${emailRows.length}
  Contacts updated                : ${updated}
  Skipped (no Stripe customer)    : ${skipped}
  No card found in Stripe         : ${noCard}
  Errors                          : ${errors}
`);

  await conn.end();
}

main().catch((err) => {
  console.error("[SyncStripeCards] Fatal error:", err);
  process.exit(1);
});
