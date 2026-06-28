/**
 * One-time backfill script: Populate missing shipping addresses for retention contacts.
 *
 * Strategy (in order):
 *   1. Query all contacts WHERE department = 'retention' AND (address IS NULL OR address = '')
 *   2. For each contact, check the local `customers` table by email (fast, no API call)
 *   3. If not found locally, call the Zoho Billing API to find the customer and extract
 *      their shipping_address (falls back to billing_address if shipping is empty)
 *   4. Format the address as "line1, line2, city, postcode, country" (skip empty parts)
 *   5. Update contacts.address — NEVER overwrites an existing address
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/syncRetentionAddresses.ts
 *
 * The DATABASE_URL and Zoho credentials are hardcoded from zohoBilling.ts.
 * Run this script once to backfill existing contacts. Future imports are handled
 * by the fixed importLeads mutation in server/routers/manager.ts.
 */

import mysql from "mysql2/promise";

// ─── Zoho Billing credentials (same as server/zohoBilling.ts) ────────────────
const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_CLIENT_ID = "1000.LT0I1HRJ1Z5J4A034U1XSLIBF61G1C";
const ZOHO_CLIENT_SECRET = "0964a666099d5c283d6d15ee7c92c0d3eb824f7072";
const ZOHO_REFRESH_TOKEN = "1000.df6ed9287f217afd6a105e3c369427f0.5658ec18f37b29b7395dd2ff47db81c7";
const ZOHO_API_BASE = "https://www.zohoapis.com/billing/v1";
const ZOHO_ORG_ID = "778500587";

// ─── Database ────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[syncRetentionAddresses] Missing DATABASE_URL env var.");
  console.error("  Usage: DATABASE_URL=... npx tsx server/scripts/syncRetentionAddresses.ts");
  process.exit(1);
}

// ─── Zoho token cache ─────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });
  const res = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 5 minutes before actual expiry for safety
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

async function zohoGet(path: string): Promise<any> {
  const token = await getZohoAccessToken();
  const url = `${ZOHO_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "X-com-zoho-subscriptions-organizationid": ZOHO_ORG_ID,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho API error (${res.status}) ${path}: ${text}`);
  }
  return res.json();
}

// ─── Address formatting ───────────────────────────────────────────────────────
function formatAddress(parts: (string | null | undefined)[]): string | null {
  const clean = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return clean.length > 0 ? clean.join(", ") : null;
}

// ─── Zoho: look up a customer's shipping address by email ─────────────────────
async function getZohoAddressByEmail(email: string): Promise<string | null> {
  try {
    // Search for customer by email
    const searchRes = await zohoGet(`/customers?email_contains=${encodeURIComponent(email)}`);
    const customers: any[] = searchRes.customers ?? [];
    if (customers.length === 0) return null;

    const customerId = customers[0].customer_id;
    if (!customerId) return null;

    // Fetch the customer detail to get full address (list endpoint returns null for addresses)
    const detailRes = await zohoGet(`/customers/${customerId}`);
    const customer = detailRes?.customer;
    if (!customer) return null;

    // Prefer shipping_address, fall back to billing_address
    const addr = customer.shipping_address || customer.billing_address;
    if (!addr) return null;

    return formatAddress([
      addr.street,
      addr.street2,
      addr.city,
      addr.state,
      addr.zip,
      addr.country,
    ]);
  } catch (err: any) {
    // Non-fatal: log and return null so we skip this contact
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await mysql.createConnection(DATABASE_URL!);
  console.log("[syncRetentionAddresses] Connected to database.");

  // 1. Fetch all retention contacts with a missing address
  const [contacts] = await conn.execute(
    `SELECT id, email, name FROM contacts
     WHERE department = 'retention'
       AND (address IS NULL OR address = '')
       AND email IS NOT NULL AND email != ''
     ORDER BY id ASC`
  ) as [Array<{ id: number; email: string; name: string }>, any];

  console.log(`[syncRetentionAddresses] Found ${contacts.length} retention contacts with missing address.`);

  // 2. Build a local lookup map from the customers table (email → address)
  const [customerRows] = await conn.execute(
    `SELECT email, address FROM customers
     WHERE address IS NOT NULL AND address != ''
       AND email IS NOT NULL AND email != ''`
  ) as [Array<{ email: string; address: string }>, any];

  const localAddressMap = new Map<string, string>();
  for (const row of customerRows) {
    localAddressMap.set(row.email.toLowerCase().trim(), row.address);
  }
  console.log(`[syncRetentionAddresses] Loaded ${localAddressMap.size} addresses from local customers table.`);

  // ─── Counters ────────────────────────────────────────────────────────────────
  let updatedFromLocal = 0;
  let updatedFromZoho = 0;
  let notFound = 0;
  let errors = 0;

  // Deduplicate by email so we don't call Zoho multiple times for the same customer
  // (a customer can have multiple contact rows)
  const emailToContactIds = new Map<string, number[]>();
  for (const contact of contacts) {
    const email = contact.email.toLowerCase().trim();
    if (!emailToContactIds.has(email)) {
      emailToContactIds.set(email, []);
    }
    emailToContactIds.get(email)!.push(contact.id);
  }

  console.log(`[syncRetentionAddresses] Processing ${emailToContactIds.size} unique emails...\n`);

  let processed = 0;
  const total = emailToContactIds.size;

  for (const [email, contactIds] of Array.from(emailToContactIds.entries())) {
    processed++;

    try {
      let address: string | null = null;
      let source: "local" | "zoho" | null = null;

      // ── Step A: Check local customers table first ──────────────────────────
      const localAddress = localAddressMap.get(email);
      if (localAddress) {
        address = localAddress;
        source = "local";
      }

      // ── Step B: Fall back to Zoho Billing API ─────────────────────────────
      if (!address) {
        address = await getZohoAddressByEmail(email);
        if (address) source = "zoho";
        // Polite rate limiting: Zoho allows ~100 req/min on the free tier
        await new Promise((r) => setTimeout(r, 700));
      }

      if (!address) {
        notFound++;
        if (processed % 50 === 0 || processed === total) {
          console.log(`  [${processed}/${total}] ${email} → not found`);
        }
        continue;
      }

      // ── Step C: Update all contact rows with this email ───────────────────
      for (const contactId of contactIds) {
        try {
          await conn.execute(
            `UPDATE contacts SET address = ? WHERE id = ? AND (address IS NULL OR address = '')`,
            [address, contactId]
          );
        } catch (dbErr: any) {
          // If connection dropped, try to reconnect once
          if (dbErr.message.includes("closed state") || dbErr.message.includes("lost connection")) {
            console.log("  [DB] Connection lost. Reconnecting...");
            await conn.end().catch(() => {});
            conn = await mysql.createConnection(DATABASE_URL!);
            await conn.execute(
              `UPDATE contacts SET address = ? WHERE id = ? AND (address IS NULL OR address = '')`,
              [address, contactId]
            );
          } else {
            throw dbErr;
          }
        }
      }

      if (source === "local") {
        updatedFromLocal += contactIds.length;
      } else {
        updatedFromZoho += contactIds.length;
      }

      console.log(
        `  [${processed}/${total}] ${email} (${contactIds.length} contact(s)) → [${source}] ${address}`
      );
    } catch (err: any) {
      errors++;
      console.error(`  [${processed}/${total}] ERROR for ${email}: ${err.message}`);
      // Brief pause after an error to avoid hammering the API
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────");
  console.log("[syncRetentionAddresses] DONE");
  console.log(`  Updated from local customers table : ${updatedFromLocal}`);
  console.log(`  Updated from Zoho Billing API      : ${updatedFromZoho}`);
  console.log(`  Not found (no address anywhere)    : ${notFound}`);
  console.log(`  Errors                             : ${errors}`);
  console.log(`  Total contacts updated             : ${updatedFromLocal + updatedFromZoho}`);
  console.log("─────────────────────────────────────────────────────────");

  await conn.end();
}

main().catch((err) => {
  console.error("[syncRetentionAddresses] Fatal error:", err);
  process.exit(1);
});
