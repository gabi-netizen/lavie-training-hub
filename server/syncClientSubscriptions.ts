/**
 * Zoho Billing → client_subscriptions DB Sync
 *
 * Fetches ALL subscriptions from Zoho Billing API across all statuses,
 * filters by salesperson_name = "Rob" and excludes cf_shipping_type = "Not Shippable",
 * then upserts into the local client_subscriptions table.
 *
 * Runs:
 *  - On server startup (non-blocking, after a delay)
 *  - Every 5 minutes via setInterval
 *  - On-demand via the tRPC triggerSync endpoint (Refresh button)
 */
import { getDb } from "./db";
import { clientSubscriptions, contacts } from "../drizzle/schema";
import { sql, eq, or, like, isNull, and } from "drizzle-orm";
import { getAccessToken, zohoGet } from "./routers/billing";

// ─── Types ──────────────────────────────────────────────────────────────────
interface ZohoSubscriptionListItem {
  subscription_id: string;
  subscription_number: string;
  customer_name: string;
  email: string;
  phone: string;
  plan_name: string;
  amount: number;
  status: string;
  next_billing_at: string;
  last_billing_at: string;
  activated_at: string;
  cancelled_at: string;
  created_time: string;
  salesperson_name: string;
  cf_setup_fee: string;
  cf_recurring_amount: string;
  cf_campaign_id: string;
  cf_current_billing_cycle: string;
  cf_shipping_type: string;
  cf_matinika_20ml: string;
  cf_matinika_60ml: string;
  cf_ashkara_eye_serum_5ml: string;
  cf_bb_oulala_30_ml: string;
  cf_bosem_micro_exploiting_60ml: string;
  cf_bosem_micro_exfoliating_20m: string;
  cf_brightening_gel_30ml: string;
  cf_brightening_gel_dropper_5ml: string;
  cf_brightening_gel_starter: string;
  cf_d_ashkara_15ml: string;
  cf_hydrolift: string;
  cf_skin_immortality_50ml: string;
  cf_oulala_booster_serum_10ml: string;
  [key: string]: any;
}

// ─── Product field mapping ──────────────────────────────────────────────────
const PRODUCT_FIELD_MAP: Record<string, string> = {
  cf_matinika_20ml: "Matinika 20ml",
  cf_matinika_60ml: "Matinika 60ml",
  cf_ashkara_eye_serum_5ml: "Ashkara Eye Serum 5ml",
  cf_bb_oulala_30_ml: "BB oulala 30 ml",
  cf_bosem_micro_exploiting_60ml: "Bosem Micro Exploiting 60ml",
  cf_bosem_micro_exfoliating_20m: "Bosem Micro-Exfoliating 20ml",
  cf_brightening_gel_30ml: "Brightening Gel 30ml",
  cf_brightening_gel_dropper_5ml: "Brightening Gel Dropper 5ml",
  cf_brightening_gel_starter: "Brightening Gel starter",
  cf_d_ashkara_15ml: "D Ashkara 15ml",
  cf_hydrolift: "Hydrolift",
  cf_skin_immortality_50ml: "Skin Immortality 50ml",
  cf_oulala_booster_serum_10ml: "Oulala Booster Serum 10ml",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse billing cycles from plan name.
 * "12 Installments" → 12, "6 Installments" → 6, "One Payment" → 1, "Subscription" → null
 */
function parseBillingCycles(planName: string): number | null {
  if (!planName) return null;
  const match = planName.match(/(\d+)\s*Installment/i);
  if (match) return parseInt(match[1]);
  if (/one\s*payment/i.test(planName)) return 1;
  // "Subscription" or anything else → null (ongoing)
  return null;
}

/**
 * Derive plan type from plan name.
 */
function derivePlanType(planName: string): "installment" | "subscription" | "one_payment" {
  if (!planName) return "subscription";
  if (/install?m/i.test(planName)) return "installment";
  if (/one\s*payment|deposit/i.test(planName)) return "one_payment";
  return "subscription";
}

/**
 * Extract product quantities from Zoho subscription custom fields.
 */
function extractProducts(sub: ZohoSubscriptionListItem): Record<string, number> {
  const products: Record<string, number> = {};
  for (const [cfKey, productName] of Object.entries(PRODUCT_FIELD_MAP)) {
    const val = sub[cfKey];
    if (val) {
      const qty = parseFloat(val);
      if (!isNaN(qty) && qty > 0) {
        products[productName] = qty;
      }
    }
  }
  return products;
}

/**
 * Parse a Zoho date string to YYYY-MM-DD or null.
 * Zoho returns dates as "2024-03-15" or empty string.
 */
function parseZohoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  // Validate it looks like a date
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return dateStr.substring(0, 10); // YYYY-MM-DD
}

// ─── Main Sync Function ─────────────────────────────────────────────────────

let isSyncing = false;
let lastSyncAt: Date | null = null;
let lastSyncCount = 0;

export function getSyncStatus() {
  return { isSyncing, lastSyncAt, lastSyncCount };
}

/**
 * Fetch all subscriptions from Zoho Billing across all statuses,
 * filter by salesperson and shipping type, then upsert into DB.
 */
export async function syncClientSubscriptionsFromZoho(): Promise<{ synced: number; errors: number }> {
  if (isSyncing) {
    console.log("[ZohoSync] Sync already in progress, skipping.");
    return { synced: 0, errors: 0 };
  }

  isSyncing = true;
  console.log("[ZohoSync] Starting sync from Zoho Billing...");

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[ZohoSync] Database not available, skipping sync.");
      return { synced: 0, errors: 0 };
    }

    // Fetch all subscriptions across all statuses
    const allSubscriptions: ZohoSubscriptionListItem[] = [];
    const statuses = ["live", "unpaid", "dunning", "cancelled", "future", "expired"];

    for (const status of statuses) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const response = await zohoGet(`/subscriptions?per_page=200&page=${page}&status=${status}`);
          const subscriptions = response.subscriptions ?? [];
          allSubscriptions.push(...subscriptions);
          if (subscriptions.length < 200 || !response.page_context?.has_more_page) {
            hasMore = false;
          } else {
            page++;
          }
        } catch (err: any) {
          console.error(`[ZohoSync] Failed to fetch status=${status} page=${page}: ${err.message}`);
          hasMore = false;
        }
      }
    }

    console.log(`[ZohoSync] Fetched ${allSubscriptions.length} total subscriptions from Zoho.`);

    // Filter by retention agents (Rob, Guy, James) for non-live-sub records
    const RETENTION_AGENTS = ["rob", "guy", "james", "james huxley", "mitch"];

    // Live Subs (status=live + planType=subscription): ALL agents, no salesperson filter
    // Everything else: retention agents only
    let filtered = allSubscriptions.filter((sub) => {
      const status = (sub.status || "").toLowerCase();
      const planName = sub.plan_name || "";
      const isSubscriptionPlan = !(/install?m/i.test(planName)) && !(/one\s*payment|deposit/i.test(planName));
      const isLiveSub = status === "live" && isSubscriptionPlan;
      if (isLiveSub) return true; // All live subs - no agent filter
      return RETENTION_AGENTS.includes((sub.salesperson_name || "").toLowerCase());
    });

    // Filter OUT "Not Shippable"
    filtered = filtered.filter((sub) => {
      const shippingType = (sub.cf_shipping_type || "").toLowerCase();
      return shippingType !== "not shippable";
    });

    console.log(`[ZohoSync] After filtering: ${filtered.length} subscriptions to upsert.`);

    // Upsert into DB
    let synced = 0;
    let errors = 0;

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      for (const sub of batch) {
        try {
          const planName = sub.plan_name || "";
          const billingCycles = parseBillingCycles(planName);
          const planType = derivePlanType(planName);

          // Parse setup fee
          const setupFeeStr = sub.cf_setup_fee || "";
          const setupFee = setupFeeStr ? parseFloat(setupFeeStr) : null;

          // Recurring amount from cf_recurring_amount or amount
          const recurringAmountStr = sub.cf_recurring_amount || "";
          const recurringAmount = recurringAmountStr ? parseFloat(recurringAmountStr) : (sub.amount || null);

          // Total amount: setupFee + (recurringAmount × billingCycles). If billingCycles is null → null
          let totalAmount: number | null = null;
          if (billingCycles !== null && recurringAmount !== null) {
            totalAmount = (setupFee || 0) + (recurringAmount * billingCycles);
            totalAmount = Math.round(totalAmount * 100) / 100;
          }

          // Current billing cycle
          const currentBillingCycleStr = sub.cf_current_billing_cycle || "";
          const currentBillingCycle = currentBillingCycleStr ? parseInt(currentBillingCycleStr) : null;

          // Products
          const products = extractProducts(sub);

          // Build the row values
          const row = {
            subscriptionId: sub.subscription_id,
            planName: sub.plan_name || null,
            planType,
            customerName: sub.customer_name || "",
            email: (sub.email || "").toLowerCase() || null,
            phone: sub.phone || null,
            amount: sub.amount != null ? String(sub.amount) : null,
            setupFee: setupFee != null && !isNaN(setupFee) ? String(setupFee) : null,
            recurringAmount: recurringAmount != null && !isNaN(recurringAmount) ? String(recurringAmount) : null,
            totalAmount: totalAmount != null ? String(totalAmount) : null,
            billingCycles: billingCycles,
            currentBillingCycle: currentBillingCycle != null && !isNaN(currentBillingCycle) ? currentBillingCycle : null,
            cyclesCompleted: currentBillingCycle != null && !isNaN(currentBillingCycle) ? currentBillingCycle : null,
            nextBillingOn: parseZohoDate(sub.next_billing_at),
            lastBilledOn: parseZohoDate(sub.last_billing_at),
            subscriptionNumber: sub.subscription_number || null,
            status: (sub.status || "").toLowerCase(),
            campaignId: sub.cf_campaign_id || null,
            activatedOn: parseZohoDate(sub.activated_at),
            createdOn: parseZohoDate(sub.created_time),
            cancelledDate: parseZohoDate(sub.cancelled_at),
            salesPerson: sub.salesperson_name || "Rob",
            products: Object.keys(products).length > 0 ? products : null,
          };

          // Upsert using INSERT ... ON DUPLICATE KEY UPDATE
          await db.insert(clientSubscriptions).values(row as any).onDuplicateKeyUpdate({
            set: {
              planName: sql`VALUES(planName)`,
              planType: sql`VALUES(planType)`,
              customerName: sql`VALUES(customerName)`,
              email: sql`VALUES(email)`,
              phone: sql`VALUES(phone)`,
              amount: sql`VALUES(amount)`,
              setupFee: sql`VALUES(setupFee)`,
              recurringAmount: sql`VALUES(recurringAmount)`,
              totalAmount: sql`VALUES(totalAmount)`,
              billingCycles: sql`VALUES(billingCycles)`,
              currentBillingCycle: sql`VALUES(currentBillingCycle)`,
              cyclesCompleted: sql`VALUES(cyclesCompleted)`,
              nextBillingOn: sql`VALUES(nextBillingOn)`,
              lastBilledOn: sql`VALUES(lastBilledOn)`,
              subscriptionNumber: sql`VALUES(subscriptionNumber)`,
              status: sql`VALUES(status)`,
              campaignId: sql`VALUES(campaignId)`,
              activatedOn: sql`VALUES(activatedOn)`,
              createdOn: sql`VALUES(createdOn)`,
              cancelledDate: sql`VALUES(cancelledDate)`,
              salesPerson: sql`VALUES(salesPerson)`,
              products: sql`VALUES(products)`,
            },
          });

          synced++;
        } catch (err: any) {
          errors++;
          if (errors <= 5) {
            console.error(`[ZohoSync] Error upserting ${sub.subscription_id}: ${err.message}`);
          }
        }
      }
    }

    lastSyncAt = new Date();
    lastSyncCount = synced;
    console.log(`[ZohoSync] Sync complete: ${synced} upserted, ${errors} errors.`);

    // ─── Auto-link subscriptions to contacts ─────────────────────────────
    try {
      await autoLinkSubscriptionsToContacts(db);
    } catch (linkErr: any) {
      console.error(`[ZohoSync] Auto-link error: ${linkErr.message}`);
    }

    return { synced, errors };
  } catch (err: any) {
    console.error(`[ZohoSync] Fatal sync error: ${err.message}`);
    return { synced: 0, errors: 0 };
  } finally {
    isSyncing = false;
  }
}

// ─── Auto-Link Subscriptions to Contacts ───────────────────────────────────

/**
 * For all client_subscriptions without a contactId, try to find a matching
 * contact by email or phone. If no match, create a new contact (department: retention)
 * and link it. This mirrors autoLinkLeadsToContacts() in manager.ts.
 */
async function autoLinkSubscriptionsToContacts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
) {
  // Get all unlinked subscriptions that have email or phone
  const unlinked = await db
    .select({
      subscriptionId: clientSubscriptions.subscriptionId,
      customerName: clientSubscriptions.customerName,
      email: clientSubscriptions.email,
      phone: clientSubscriptions.phone,
    })
    .from(clientSubscriptions)
    .where(
      and(
        isNull(clientSubscriptions.contactId),
        or(
          sql`${clientSubscriptions.email} IS NOT NULL AND ${clientSubscriptions.email} != ''`,
          sql`${clientSubscriptions.phone} IS NOT NULL AND ${clientSubscriptions.phone} != ''`
        )
      )
    );

  if (unlinked.length === 0) return;
  console.log(`[ZohoSync] Auto-linking ${unlinked.length} unlinked subscriptions to contacts...`);

  let linked = 0;
  let created = 0;

  for (const sub of unlinked) {
    try {
      let existingContact: { id: number } | undefined;

      // 1. Match by email
      if (sub.email) {
        const byEmail = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.email, sub.email))
          .limit(1);
        existingContact = byEmail[0];
      }

      // 2. Fall back to phone
      if (!existingContact && sub.phone) {
        const normalizedPhone = sub.phone.replace(/[\s\-().+]/g, "");
        const byPhone = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            or(
              like(contacts.phone, `%${normalizedPhone}%`),
              like(contacts.phone, `%${sub.phone}%`)
            )
          )
          .limit(1);
        existingContact = byPhone[0];
      }

      if (existingContact) {
        // Link to existing contact
        await db
          .update(clientSubscriptions)
          .set({ contactId: existingContact.id })
          .where(eq(clientSubscriptions.subscriptionId, sub.subscriptionId));
        linked++;
      } else {
        // Create a new contact and link it
        const [result] = await db.insert(contacts).values({
          name: sub.customerName || "Unknown",
          email: sub.email || null,
          phone: sub.phone || null,
          department: "retention",
          status: "new",
        });
        const newContactId = (result as any).insertId as number;
        if (newContactId) {
          await db
            .update(clientSubscriptions)
            .set({ contactId: newContactId })
            .where(eq(clientSubscriptions.subscriptionId, sub.subscriptionId));
          created++;
        }
      }
    } catch (e: any) {
      // Non-fatal: log and continue
      if (linked + created <= 3) {
        console.error(`[ZohoSync] Auto-link error for ${sub.subscriptionId}: ${e.message}`);
      }
    }
  }

  console.log(`[ZohoSync] Auto-link complete: ${linked} linked to existing, ${created} new contacts created.`);
}

// ─── Interval Management ────────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background sync: runs immediately + every 5 minutes.
 * Call this from server startup (non-blocking).
 */
export function startClientSubscriptionsSync() {
  // Run initial sync after a short delay (don't block startup)
  setTimeout(() => {
    syncClientSubscriptionsFromZoho().catch((err) =>
      console.error("[ZohoSync] Initial sync error:", err)
    );
  }, 10000); // 10s after startup

  // Schedule every 5 minutes
  syncInterval = setInterval(() => {
    syncClientSubscriptionsFromZoho().catch((err) =>
      console.error("[ZohoSync] Scheduled sync error:", err)
    );
  }, 5 * 60 * 1000); // 5 minutes

  console.log("[ZohoSync] Background sync scheduled (every 5 minutes).");
}

/**
 * Stop the background sync interval (for graceful shutdown).
 */
export function stopClientSubscriptionsSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
