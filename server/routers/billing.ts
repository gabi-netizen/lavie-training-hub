/**
 * Billing tRPC Router
 *
 * Provides admin-only procedures for fetching subscription data from Zoho Billing API.
 * Includes in-memory caching (5 minutes) to avoid rate limits.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { clientSubscriptions, leadAssignments, contacts } from "../../drizzle/schema";
import { eq, like, or, and, sql, desc, getTableColumns, isNull } from "drizzle-orm";
import { syncClientSubscriptionsFromZoho, getSyncStatus } from "../syncClientSubscriptions";

// ─── Zoho Billing API Credentials ────────────────────────────────────────────
const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_CLIENT_ID = "1000.LT0I1HRJ1Z5J4A034U1XSLIBF61G1C";
const ZOHO_CLIENT_SECRET = "0964a666099d5c283d6d15ee7c92c0d3eb824f7072";
const ZOHO_REFRESH_TOKEN = "1000.df6ed9287f217afd6a105e3c369427f0.5658ec18f37b29b7395dd2ff47db81c7";
const ZOHO_API_BASE = "https://www.zohoapis.com/billing/v1";
const ZOHO_ORG_ID = "778500587";

// ─── Token Cache ─────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAccessToken(): Promise<string> {
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
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

// ─── Zoho API Helper ─────────────────────────────────────────────────────────
export async function zohoGet(path: string): Promise<any> {
  const token = await getAccessToken();
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

// ─── Subscription Data Cache (5 minutes) ────────────────────────────────────
interface ZohoSubscription {
  subscription_id: string;
  subscription_number: string;
  customer_id: string;
  customer_name: string;
  email: string;
  phone: string;
  plan_name: string;
  amount: number;
  status: string;
  interval: number;
  interval_unit: string;
  next_billing_at: string;
  last_billing_at: string;
  activated_at: string;
  cancelled_at: string;
  expires_at: string;
  salesperson_name: string;
  created_time: string;
  cf_recurring_amount: string;
  cf_next_renewal_amount: string;
  cf_setup_fee: string;
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
  current_term_starts_at: string;
  current_term_ends_at: string;
  trial_ends_at: string;
  [key: string]: any;
}

// Helper: determine if a plan is an installment
function isInstallmentPlan(planName: string): boolean {
  return /installment/i.test(planName);
}

// Helper: determine if a subscription is a Live Trial (status=live, amount=4.95, not installment)
function isTrialSub(sub: ZohoSubscription): boolean {
  return sub.status?.toLowerCase() === "live" && sub.amount === 4.95 && !isInstallmentPlan(sub.plan_name || "");
}

interface CacheEntry {
  data: ZohoSubscription[];
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let subscriptionCache: CacheEntry | null = null;

/**
 * Fetch active subscriptions from Zoho (live + trial only).
 * Uses in-memory cache unless forceRefresh is true.
 */
async function fetchAllSubscriptions(forceRefresh = false): Promise<ZohoSubscription[]> {
  if (!forceRefresh && subscriptionCache && Date.now() - subscriptionCache.timestamp < CACHE_TTL) {
    return subscriptionCache.data;
  }

  const allSubscriptions: ZohoSubscription[] = [];

  // Fetch live and unpaid subscriptions
  for (const status of ["live", "unpaid"]) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await zohoGet(`/subscriptions?per_page=200&page=${page}&status=${status}`);
      const subscriptions = response.subscriptions ?? [];
      allSubscriptions.push(...subscriptions);
      if (subscriptions.length < 200 || !response.page_context?.has_more_page) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  subscriptionCache = { data: allSubscriptions, timestamp: Date.now() };
  return allSubscriptions;
}

// ─── My Clients: All-Status Cache (5 minutes) ──────────────────────────────
interface AllStatusCacheEntry {
  data: ZohoSubscription[];
  timestamp: number;
}

let allStatusCache: AllStatusCacheEntry | null = null;

/**
 * Fetch ALL subscriptions from Zoho across all statuses for My Clients tab.
 * Statuses: live, unpaid, dunning, cancelled, future, expired
 * Uses separate cache from the billing dashboard cache.
 */
async function fetchAllStatusSubscriptions(forceRefresh = false): Promise<ZohoSubscription[]> {
  if (!forceRefresh && allStatusCache && Date.now() - allStatusCache.timestamp < CACHE_TTL) {
    return allStatusCache.data;
  }

  const allSubscriptions: ZohoSubscription[] = [];
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
        // If a status returns error (e.g. no results), skip it
        console.error(`Failed to fetch subscriptions with status=${status}: ${err.message}`);
        hasMore = false;
      }
    }
  }

  allStatusCache = { data: allSubscriptions, timestamp: Date.now() };
  return allSubscriptions;
}

// ─── Subscription Detail Cache (individual subscription details) ────────────
interface ZohoSubscriptionDetail {
  subscription_id: string;
  subscription_number: string;
  customer_name: string;
  email: string;
  phone: string;
  plan: {
    plan_code: string;
    name: string;
    setup_fee: number;
    quantity: number;
    billing_cycles: number | null;
  };
  plan_name: string;
  amount: number;
  status: string;
  interval: number;
  interval_unit: string;
  next_billing_at: string;
  activated_at: string;
  created_time: string;
  last_billing_at: string;
  cancelled_at: string;
  salesperson_name: string;
  current_term_starts_at: string;
  current_term_ends_at: string;
  custom_fields: Array<{
    customfield_id: string;
    label: string;
    value: string;
    value_formatted: string;
    index: number;
  }>;
  addons: Array<{
    addon_code: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  contactpersons: Array<{
    contactperson_id: string;
    email: string;
    phone: string;
  }>;
  child_invoice_id: string;
  currency_code: string;
  card: {
    card_id: string;
    last_four_digits: string;
    payment_gateway: string;
  };
}

interface DetailCacheEntry {
  data: ZohoSubscriptionDetail;
  timestamp: number;
}

const detailCache = new Map<string, DetailCacheEntry>();

/**
 * Fetch individual subscription detail from Zoho.
 * Caches for 5 minutes.
 */
async function fetchSubscriptionDetail(subscriptionId: string): Promise<ZohoSubscriptionDetail | null> {
  const cached = detailCache.get(subscriptionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await zohoGet(`/subscriptions/${subscriptionId}`);
    const detail = response.subscription;
    if (detail) {
      detailCache.set(subscriptionId, { data: detail, timestamp: Date.now() });
    }
    return detail ?? null;
  } catch (err: any) {
    console.error(`Failed to fetch detail for ${subscriptionId}: ${err.message}`);
    return null;
  }
}

// ─── Product names list (from the export) ───────────────────────────────────
const PRODUCT_NAMES = [
  "Ashkara Eye Serum 5ml",
  "BB oulala 30 ml",
  "Bosem Micro Exploiting 60ml",
  "Bosem Micro-Exfoliating 20ml",
  "Brightening Gel 30ml",
  "Brightening Gel Dropper 5ml",
  "Brightening Gel starter",
  "D Ashkara 15ml",
  "Eye Serum 15ml",
  "Facial Cleanser 125ml",
  "Hydrolift",
  "Matinika 20ml",
  "Matinika 60ml",
  "Skin Immortality 50ml",
];

/**
 * Extract custom field value from a subscription detail's custom_fields array.
 */
function getCustomFieldValue(detail: ZohoSubscriptionDetail, label: string): string {
  const field = detail.custom_fields?.find(
    (f) => f.label?.toLowerCase() === label.toLowerCase()
  );
  return field?.value ?? "";
}

/**
 * Extract products from subscription detail custom fields.
 * Product quantities are stored as custom fields with product names as labels.
 */
function extractProducts(detail: ZohoSubscriptionDetail): Record<string, number> {
  const products: Record<string, number> = {};
  if (!detail.custom_fields) return products;

  for (const field of detail.custom_fields) {
    // Check if this custom field matches a known product name
    const matchedProduct = PRODUCT_NAMES.find(
      (p) => p.toLowerCase() === field.label?.toLowerCase()
    );
    if (matchedProduct) {
      const qty = parseFloat(field.value);
      if (!isNaN(qty) && qty > 0) {
        products[matchedProduct] = qty;
      }
    }
  }
  return products;
}

// ─── My Clients Data Interface ──────────────────────────────────────────────
interface MyClientSubscription {
  subscriptionId: string;
  customerName: string;
  email: string;
  planName: string;
  setupFee: number | null;
  recurringAmount: number | null;
  totalAmount: number | null;
  billingCycles: number | null;
  currentBillingCycle: number | null;
  nextBillingOn: string | null;
  status: string;
  campaignId: string | null;
  createdOn: string | null;
  activatedOn: string | null;
  lastBilledOn: string | null;
  cancelledDate: string | null;
  phone: string | null;
  products: Record<string, number>;
  subscriptionNumber: string | null;
  contactId: number | null;
  salesPerson: string | null;
  retentionAgent: string | null;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const billingRouter = router({
  /**
   * Get billing summary: counts by status, by salesperson, by plan, and MRR.
   */
  getBillingSummary: adminProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const subscriptions = await fetchAllSubscriptions(input?.forceRefresh ?? false);

        // Count UNIQUE customers: trials (live, £4.95), live subs (live, >£4.95), and installments
        const trialCustomers = new Set<string>();
        const liveSubCustomers = new Set<string>();
        const installmentCustomers = new Set<string>();

        for (const sub of subscriptions) {
          const customerId = sub.customer_id || sub.email || sub.customer_name;
          if (isInstallmentPlan(sub.plan_name || "")) {
            installmentCustomers.add(customerId);
          } else if (isTrialSub(sub)) {
            trialCustomers.add(customerId);
          } else if (sub.status?.toLowerCase() === "live" && (sub.amount || 0) > 4.95) {
            liveSubCustomers.add(customerId);
          }
        }

        // subCustomers = all non-installment customers (trials + live subs) for backward compat
        const subCustomers = new Set<string>([...Array.from(trialCustomers), ...Array.from(liveSubCustomers)]);

        // By salesperson - count unique customers per agent (trials, live subs, installments)
        const agentMap = new Map<string, { subscriptions: Set<string>; trials: Set<string>; installments: Set<string>; revenue: number }>();
        for (const sub of subscriptions) {
          const agent = sub.salesperson_name || "Unassigned";
          if (!agentMap.has(agent)) {
            agentMap.set(agent, { subscriptions: new Set(), trials: new Set(), installments: new Set(), revenue: 0 });
          }
          const entry = agentMap.get(agent)!;
          const customerId = sub.customer_id || sub.email || sub.customer_name;
          if (isInstallmentPlan(sub.plan_name || "")) {
            entry.installments.add(customerId);
          } else if (isTrialSub(sub)) {
            entry.trials.add(customerId);
          } else if (sub.status?.toLowerCase() === "live" && (sub.amount || 0) > 4.95) {
            entry.subscriptions.add(customerId);
          }
          entry.revenue += sub.amount || 0;
        }
        const bySalesperson = Array.from(agentMap.entries())
          .map(([agent, data]) => ({
            agent,
            subscriptions: data.subscriptions.size,
            trials: data.trials.size,
            installments: data.installments.size,
            total: data.subscriptions.size + data.trials.size + data.installments.size,
            revenue: data.revenue,
          }))
          .sort((a, b) => b.total - a.total);

        // MRR: sum of all live non-installment subscription amounts EXCLUDING trials (amount > 4.95)
        let mrr = 0;
        let unpaidCount = 0;
        for (const sub of subscriptions) {
          if (sub.status?.toLowerCase() === "live" && !isInstallmentPlan(sub.plan_name || "") && (sub.amount || 0) > 4.95) {
            mrr += sub.amount || 0;
          }
          if (sub.status?.toLowerCase() === "unpaid") {
            unpaidCount++;
          }
        }

        return {
          uniqueTrialCustomers: trialCustomers.size,
          uniqueLiveSubCustomers: liveSubCustomers.size,
          uniqueSubCustomers: subCustomers.size, // backward compat: trial + live sub
          uniqueInstallmentCustomers: installmentCustomers.size,
          totalActiveCustomers: new Set([...Array.from(subCustomers), ...Array.from(installmentCustomers)]).size,
          bySalesperson,
          mrr,
          unpaidCount,
          totalSubscriptions: subscriptions.length,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch billing summary: ${err.message}`,
        });
      }
    }),

  /**
   * Get paginated subscriptions list with filters.
   */
  getSubscriptionsList: adminProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        perPage: z.number().int().positive().max(200).default(50),
        status: z.string().optional(),
        salesperson: z.string().optional(),
        planType: z.string().optional(),
        search: z.string().optional(),
        forceRefresh: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const allSubscriptions = await fetchAllSubscriptions(input.forceRefresh ?? false);

        // Apply filters
        let filtered = [...allSubscriptions];

        if (input.status) {
          const statusFilter = input.status.toLowerCase();
          filtered = filtered.filter((sub) => {
            const s = sub.status?.toLowerCase();
            if (statusFilter === "trial") return s === "trial" || s === "trialing";
            if (statusFilter === "cancelled") return s === "cancelled" || s === "canceled";
            return s === statusFilter;
          });
        }

        if (input.salesperson) {
          filtered = filtered.filter(
            (sub) => (sub.salesperson_name || "Unassigned") === input.salesperson
          );
        }

        if (input.planType) {
          if (input.planType === "subscription") {
            filtered = filtered.filter((sub) => !isInstallmentPlan(sub.plan_name || ""));
          } else if (input.planType === "installment") {
            filtered = filtered.filter((sub) => isInstallmentPlan(sub.plan_name || ""));
          } else {
            filtered = filtered.filter((sub) => sub.plan_name === input.planType);
          }
        }

        if (input.search) {
          const searchLower = input.search.toLowerCase();
          filtered = filtered.filter(
            (sub) =>
              sub.customer_name?.toLowerCase().includes(searchLower) ||
              sub.email?.toLowerCase().includes(searchLower)
          );
        }

        // Paginate
        const total = filtered.length;
        const start = (input.page - 1) * input.perPage;
        const end = start + input.perPage;
        const pageData = filtered.slice(start, end);

        const subscriptions = pageData.map((sub) => ({
          subscriptionId: sub.subscription_id,
          name: sub.customer_name || "",
          email: sub.email || "",
          phone: sub.phone || "",
          plan: sub.plan_name || "",
          amount: sub.amount || 0,
          status: sub.status || "",
          nextBilling: sub.next_billing_at || "",
          salesperson: sub.salesperson_name || "Unassigned",
          createdAt: sub.created_time || "",
          interval: sub.interval,
          intervalUnit: sub.interval_unit || "",
        }));

        return {
          subscriptions,
          total,
          hasMore: end < total,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch subscriptions list: ${err.message}`,
        });
      }
    }),

  /**
   * Get My Clients data from the local DB (synced from Zoho Billing).
   * Used by the My Clients tab in Retention Workspace.
   * Reads from client_subscriptions table with pagination, search, and status filter.
   * Background sync keeps the data fresh (every 30 min + on startup).
   */
  getMyClientsData: protectedProcedure
    .input(
      z.object({
        salesperson: z.string().optional(),
        status: z.string().optional(),
        planType: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(), // YYYY-MM-DD format
        dateTo: z.string().optional(),   // YYYY-MM-DD format
        page: z.number().int().positive().default(1),
        perPage: z.number().int().positive().max(100).default(50),
        forceRefresh: z.boolean().optional(),
        sortBy: z.enum(["createdOn", "lastBilledOn", "cancelledDate"]).optional(),
        dateFilterColumn: z.enum(["createdOn", "lastBilledOn", "cancelledDate"]).optional(),
        cycleFilter: z.string().optional(),
        subAgeFilter: z.string().optional(),
        daysLeftFilter: z.string().optional(),
        daysLeftDateFrom: z.string().optional(), // YYYY-MM-DD for custom days-left range
        daysLeftDateTo: z.string().optional(),   // YYYY-MM-DD for custom days-left range
      })
    )
    .query(async ({ input }) => {
      try {
        // If forceRefresh, trigger a sync in the background (non-blocking)
        if (input.forceRefresh) {
          syncClientSubscriptionsFromZoho().catch((err) =>
            console.error("[ZohoSync] Manual refresh error:", err)
          );
        }

        const db = await getDb();
        if (!db) {
          return {
            subscriptions: [],
            summary: { total: 0, live: 0, dunning: 0, cancelled: 0, future: 0, expired: 0, unpaid: 0 },
            totalCount: 0,
            page: input.page,
            perPage: input.perPage,
            hasMore: false,
          };
        }

        // Build WHERE conditions
        const conditions: any[] = [];
        if (input.salesperson) {
          const agents = input.salesperson.split(",").map(a => a.trim()).filter(Boolean);
          if (agents.length === 1) {
            conditions.push(eq(clientSubscriptions.salesPerson, agents[0]));
          } else if (agents.length > 1) {
            conditions.push(sql`${clientSubscriptions.salesPerson} IN (${sql.join(agents.map(a => sql`${a}`), sql`, `)})`);
          }
        }

        if (input.status) {
          const statusFilter = input.status.toLowerCase();
          if (statusFilter === "cancelled") {
            // Match both "cancelled" and "canceled"
            conditions.push(
              or(
                eq(clientSubscriptions.status, "cancelled"),
                eq(clientSubscriptions.status, "canceled")
              )
            );
          } else if (statusFilter === "expired") {
            // End Installments: only installment plans (not Starter Kit/subscriptions)
            conditions.push(eq(clientSubscriptions.status, "expired"));
            conditions.push(
              or(
                eq(clientSubscriptions.planType, "installment"),
                sql`(${clientSubscriptions.planType} = 'subscription' AND (${clientSubscriptions.planName} LIKE '%stall%' OR ${clientSubscriptions.planName} REGEXP '^[0-9]+ [Dd]ays' OR ${clientSubscriptions.planName} LIKE '%payment%'))`
              )
            );
            // Exclude customers who have another live/future subscription
            conditions.push(
              sql`${clientSubscriptions.email} NOT IN (SELECT email FROM client_subscriptions WHERE status IN ('live','future') AND email IS NOT NULL AND email != '')`
            );
          } else {
            conditions.push(eq(clientSubscriptions.status, statusFilter));
          }
        }

        if (input.planType) {
          if (input.planType === "trial") {
            // Trials: subscription plans with amount <= 4.95
            conditions.push(eq(clientSubscriptions.planType, "subscription"));
            conditions.push(sql`CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) <= 4.95`);
            // Exclude customers who have another active non-trial subscription (live/future only)
            conditions.push(
              sql`${clientSubscriptions.email} NOT IN (SELECT email FROM client_subscriptions WHERE CAST(amount AS DECIMAL(10,2)) > 4.95 AND status IN ('live','future') AND email IS NOT NULL AND email != '')`
            );
          } else if (input.planType === "subscription") {
            // Live Sub: subscription plans with amount > 4.95, excluding installment-named plans
            conditions.push(eq(clientSubscriptions.planType, "subscription"));
            conditions.push(sql`CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) > 4.95`);
            conditions.push(sql`${clientSubscriptions.planName} NOT LIKE '%stall%'`);
            conditions.push(sql`${clientSubscriptions.planName} NOT REGEXP '^[0-9]+ [Dd]ays'`);
          } else if (input.planType === "installment" || input.planType === "one_payment") {
            conditions.push(eq(clientSubscriptions.planType, input.planType));
          } else if (input.planType === "installment_and_deposit") {
            // Installment plans + Deposit (one_payment with planName='Deposit')
            conditions.push(
              or(
                eq(clientSubscriptions.planType, "installment"),
                and(
                  eq(clientSubscriptions.planType, "one_payment"),
                  eq(clientSubscriptions.planName, "Deposit")
                )
              )
            );
          }
        }

        if (input.search) {
          const searchTerm = `%${input.search}%`;
          conditions.push(
            or(
              like(clientSubscriptions.customerName, searchTerm),
              like(clientSubscriptions.email, searchTerm)
            )
          );
        }

        if (input.dateFrom || input.dateTo) {
          const dateCol = input.dateFilterColumn === "lastBilledOn"
            ? clientSubscriptions.lastBilledOn
            : input.dateFilterColumn === "cancelledDate"
              ? clientSubscriptions.cancelledDate
              : clientSubscriptions.createdOn;
          if (input.dateFrom) {
            conditions.push(sql`${dateCol} >= ${input.dateFrom}`);
          }
          if (input.dateTo) {
            conditions.push(sql`${dateCol} <= ${input.dateTo}`);
          }
        }

        // Cycle filter: filter by currentBillingCycle
        if (input.cycleFilter) {
          if (input.cycleFilter === "10+") {
            conditions.push(sql`${clientSubscriptions.currentBillingCycle} >= 10`);
          } else {
            const cycleNum = parseInt(input.cycleFilter, 10);
            if (!isNaN(cycleNum)) {
              conditions.push(eq(clientSubscriptions.currentBillingCycle, cycleNum));
            }
          }
        }

        // Sub Age filter: filter by days since lastBilledOn
        if (input.subAgeFilter) {
          if (input.subAgeFilter === "0-7") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 0 AND 7`);
          } else if (input.subAgeFilter === "8-14") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 8 AND 14`);
          } else if (input.subAgeFilter === "15-30") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 15 AND 30`);
          } else if (input.subAgeFilter === "31-60") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 31 AND 60`);
          } else if (input.subAgeFilter === "61-90") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 61 AND 90`);
          } else if (input.subAgeFilter === "91-180") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) BETWEEN 91 AND 180`);
          } else if (input.subAgeFilter === "180+") {
            conditions.push(sql`DATEDIFF(CURDATE(), ${clientSubscriptions.lastBilledOn}) > 180`);
          }
        }

        // Days Left filter: filter by days until next billing
        // Use COALESCE(nextBillingOn, activatedOn + 21 days) since trials have NULL nextBillingOn
        if (input.daysLeftFilter) {
          const billingDateExpr = sql`COALESCE(${clientSubscriptions.nextBillingOn}, DATE_ADD(${clientSubscriptions.activatedOn}, INTERVAL 21 DAY))`;
          if (input.daysLeftFilter === "today") {
            conditions.push(sql`${billingDateExpr} = CURDATE()`);
          } else if (input.daysLeftFilter === "tomorrow") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`);
          } else if (input.daysLeftFilter === "2days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 2 DAY)`);
          } else if (input.daysLeftFilter === "3days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 3 DAY)`);
          } else if (input.daysLeftFilter === "4days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 4 DAY)`);
          } else if (input.daysLeftFilter === "5days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 5 DAY)`);
          } else if (input.daysLeftFilter === "6days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 6 DAY)`);
          } else if (input.daysLeftFilter === "7days") {
            conditions.push(sql`${billingDateExpr} = DATE_ADD(CURDATE(), INTERVAL 7 DAY)`);
          } else if (input.daysLeftFilter === "this_week") {
            // From today to end of current week (Sunday)
            conditions.push(sql`${billingDateExpr} >= CURDATE()`);
            conditions.push(sql`${billingDateExpr} <= DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)`);
          } else if (input.daysLeftFilter === "next_week") {
            // Next week: Monday to Sunday
            conditions.push(sql`${billingDateExpr} >= DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE()) + 1) DAY)`);
            conditions.push(sql`${billingDateExpr} <= DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE()) + 7) DAY)`);
          } else if (input.daysLeftFilter === "this_month") {
            // From today to end of current month
            conditions.push(sql`${billingDateExpr} >= CURDATE()`);
            conditions.push(sql`${billingDateExpr} <= LAST_DAY(CURDATE())`);
          } else if (input.daysLeftFilter === "custom") {
            // Custom date range using daysLeftDateFrom / daysLeftDateTo params
            if (input.daysLeftDateFrom) {
              conditions.push(sql`${billingDateExpr} >= ${input.daysLeftDateFrom}`);
            }
            if (input.daysLeftDateTo) {
              conditions.push(sql`${billingDateExpr} <= ${input.daysLeftDateTo}`);
            }
          } else if (input.daysLeftFilter === "overdue") {
            conditions.push(sql`DATEDIFF(${billingDateExpr}, CURDATE()) < 0`);
          }
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get unique agents for the current filter set (excluding agent filter itself)
        const agentConditions = conditions.filter((c: any) => c !== eq(clientSubscriptions.salesPerson, input.salesperson || ""));
        const agentWhereClause = agentConditions.length > 0 ? and(...agentConditions) : undefined;
        const agentRows = await db
          .selectDistinct({ salesPerson: clientSubscriptions.salesPerson })
          .from(clientSubscriptions)
          .where(input.salesperson ? agentWhereClause : whereClause);
        const uniqueAgents = agentRows
          .map((r: any) => r.salesPerson)
          .filter((a: any) => a && a.trim() !== "")
          .sort();

        // Get total count for pagination + expected income (sum of recurringAmount for all matching)
        const countResult = await db
          .select({
            count: sql<number>`COUNT(*)`,
            expectedIncome: sql<number>`COALESCE(SUM(CAST(${clientSubscriptions.recurringAmount} AS DECIMAL(10,2))), 0)`,
          })
          .from(clientSubscriptions)
          .where(whereClause);
        const totalCount = Number(countResult[0]?.count ?? 0);
        const expectedIncome = Number(countResult[0]?.expectedIncome ?? 0);

        // Get paginated results sorted by the requested column descending
        const offset = (input.page - 1) * input.perPage;
        const sortColumn = input.sortBy === "lastBilledOn"
          ? clientSubscriptions.lastBilledOn
          : input.sortBy === "cancelledDate"
            ? clientSubscriptions.cancelledDate
            : clientSubscriptions.createdOn;
        const rows = await db
          .select({
            ...getTableColumns(clientSubscriptions),
            retentionAgent: leadAssignments.assignedAgent,
          })
          .from(clientSubscriptions)
          .leftJoin(leadAssignments, eq(clientSubscriptions.subscriptionId, leadAssignments.subscriptionId))
          .where(whereClause)
          .orderBy(desc(sortColumn))
          .limit(input.perPage)
          .offset(offset);

        // Get summary counts — scoped to agent filter (multi-select)
        let summaryAgentCondition: any = undefined;
        if (input.salesperson) {
          const sAgents = input.salesperson.split(",").map(a => a.trim()).filter(Boolean);
          if (sAgents.length === 1) {
            summaryAgentCondition = eq(clientSubscriptions.salesPerson, sAgents[0]);
          } else if (sAgents.length > 1) {
            summaryAgentCondition = sql`${clientSubscriptions.salesPerson} IN (${sql.join(sAgents.map(a => sql`${a}`), sql`, `)})`;
          }
        }
        const summaryResult = await db
          .select({
            total: sql<number>`COUNT(*)`,
            live: sql<number>`SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END)`,
            dunning: sql<number>`SUM(CASE WHEN status = 'dunning' THEN 1 ELSE 0 END)`,
            cancelled: sql<number>`SUM(CASE WHEN status IN ('cancelled','canceled') THEN 1 ELSE 0 END)`,
            future: sql<number>`SUM(CASE WHEN status = 'future' THEN 1 ELSE 0 END)`,
            expired: sql<number>`SUM(CASE WHEN status = 'expired' AND (planType = 'installment' OR (planType = 'subscription' AND (planName LIKE '%stall%' OR planName REGEXP '^[0-9]+ [Dd]ays' OR planName LIKE '%payment%'))) THEN 1 ELSE 0 END)`,
            unpaid: sql<number>`SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END)`,
            liveInstallment: sql<number>`SUM(CASE WHEN status = 'live' AND (planType = 'installment' OR (planType = 'subscription' AND CAST(amount AS DECIMAL(10,2)) > 4.95 AND (planName LIKE '%stall%' OR planName REGEXP '^[0-9]+ [Dd]ays'))) THEN 1 ELSE 0 END)`,
            liveSub: sql<number>`SUM(CASE WHEN status = 'live' AND planType = 'subscription' AND CAST(amount AS DECIMAL(10,2)) > 4.95 AND planName NOT LIKE '%stall%' AND planName NOT REGEXP '^[0-9]+ [Dd]ays' THEN 1 ELSE 0 END)`,
            trials: sql<number>`SUM(CASE WHEN status = 'live' AND planType = 'subscription' AND CAST(amount AS DECIMAL(10,2)) <= 4.95 AND email NOT IN (SELECT email FROM client_subscriptions WHERE CAST(amount AS DECIMAL(10,2)) > 4.95 AND status IN ('live','future') AND email IS NOT NULL AND email != '') THEN 1 ELSE 0 END)`,
          })
          .from(clientSubscriptions)
          .where(summaryAgentCondition);

        const summary = {
          total: Number(summaryResult[0]?.total ?? 0),
          live: Number(summaryResult[0]?.live ?? 0),
          dunning: Number(summaryResult[0]?.dunning ?? 0),
          cancelled: Number(summaryResult[0]?.cancelled ?? 0),
          future: Number(summaryResult[0]?.future ?? 0),
          expired: Number(summaryResult[0]?.expired ?? 0),
          unpaid: Number(summaryResult[0]?.unpaid ?? 0),
          liveInstallment: Number(summaryResult[0]?.liveInstallment ?? 0),
          liveSub: Number(summaryResult[0]?.liveSub ?? 0),
          trials: Number(summaryResult[0]?.trials ?? 0),
        };

        // ─── Auto-link unlinked subscriptions to contacts (synchronous) ───
        const unlinkedRows = rows.filter((r: any) => !r.contactId && (r.email || r.phone));
        if (unlinkedRows.length > 0) {
          for (const sub of unlinkedRows) {
            try {
              let existingContact: { id: number } | undefined;
              if (sub.email) {
                const byEmail = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, sub.email)).limit(1);
                existingContact = byEmail[0];
              }
              if (!existingContact && sub.phone) {
                const normalizedPhone = (sub.phone as string).replace(/[\s\-().+]/g, "");
                const byPhone = await db.select({ id: contacts.id }).from(contacts).where(or(like(contacts.phone, `%${normalizedPhone}%`), like(contacts.phone, `%${sub.phone}%`))).limit(1);
                existingContact = byPhone[0];
              }
              if (existingContact) {
                await db.update(clientSubscriptions).set({ contactId: existingContact.id }).where(eq(clientSubscriptions.subscriptionId, sub.subscriptionId));
                sub.contactId = existingContact.id;
              } else {
                const [result] = await db.insert(contacts).values({ name: sub.customerName || "Unknown", email: sub.email || null, phone: sub.phone || null, department: "retention", status: "new" });
                const newContactId = (result as any).insertId as number;
                if (newContactId) {
                  await db.update(clientSubscriptions).set({ contactId: newContactId }).where(eq(clientSubscriptions.subscriptionId, sub.subscriptionId));
                  sub.contactId = newContactId;
                }
              }
            } catch (e) { /* non-fatal */ }
          }
        }

        // Map DB rows to the MyClientSubscription response format
        const subscriptions: MyClientSubscription[] = rows.map((row: any) => ({
          subscriptionId: row.subscriptionId,
          customerName: row.customerName,
          email: row.email || "",
          planName: row.planName || "",
          setupFee: row.setupFee ? parseFloat(row.setupFee) : null,
          recurringAmount: row.recurringAmount ? parseFloat(row.recurringAmount) : null,
          totalAmount: row.totalAmount ? parseFloat(row.totalAmount) : null,
          billingCycles: row.billingCycles,
          currentBillingCycle: row.currentBillingCycle,
          nextBillingOn: row.nextBillingOn ? String(row.nextBillingOn) : null,
          status: row.status,
          campaignId: row.campaignId,
          createdOn: row.createdOn ? String(row.createdOn) : null,
          activatedOn: row.activatedOn ? String(row.activatedOn) : null,
          lastBilledOn: row.lastBilledOn ? String(row.lastBilledOn) : null,
          cancelledDate: row.cancelledDate ? String(row.cancelledDate) : null,
          phone: row.phone,
          products: (row.products as Record<string, number>) ?? {},
          subscriptionNumber: row.subscriptionNumber,
          contactId: row.contactId ?? null,
          salesPerson: row.salesPerson || null,
          retentionAgent: row.retentionAgent || null,
        }));

        const end = offset + input.perPage;

        return {
          subscriptions,
          summary,
          totalCount,
          expectedIncome,
          page: input.page,
          perPage: input.perPage,
          hasMore: end < totalCount,
          uniqueAgents,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch My Clients data: ${err.message}`,
        });
      }
    }),

  /**
   * Manually trigger a Zoho → DB sync for client subscriptions.
   * Used by the Refresh button in My Clients tab.
   */
  triggerClientSubscriptionsSync: protectedProcedure
    .mutation(async () => {
      const result = await syncClientSubscriptionsFromZoho();
      const status = getSyncStatus();
      return {
        ...result,
        lastSyncAt: status.lastSyncAt?.toISOString() ?? null,
      };
    }),

  /**
   * Assign live sub customers to a retention agent.
   * Creates lead_assignments entries with leadType="Live Sub".
   */
  assignToRetention: adminProcedure
    .input(
      z.object({
        subscriptionIds: z.array(z.string()),
        assignedAgent: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get subscription details from client_subscriptions
      const subs = await db
        .select()
        .from(clientSubscriptions)
        .where(
          or(...input.subscriptionIds.map((id) => eq(clientSubscriptions.subscriptionId, id)))
        );

      let created = 0;
      let skipped = 0;

      for (const sub of subs) {
        // Check if lead already exists for this subscription
        const existing = await db
          .select({ id: leadAssignments.id })
          .from(leadAssignments)
          .where(eq(leadAssignments.subscriptionId, sub.subscriptionId))
          .limit(1);

        if (existing.length > 0) {
          // Update the assigned agent if already exists
          await db
            .update(leadAssignments)
            .set({
              assignedAgent: input.assignedAgent,
              assignedAt: Date.now(),
              workStatus: "assigned",
            })
            .where(eq(leadAssignments.subscriptionId, sub.subscriptionId));
          skipped++;
          continue;
        }

        // Create new lead assignment
        const detectedLeadType = isInstallmentPlan(sub.planName || "") ? "End of Instalment" : "Live Sub";
        await db.insert(leadAssignments).values({
          subscriptionId: sub.subscriptionId,
          customerId: null,
          customerName: sub.customerName,
          email: sub.email || null,
          phone: sub.phone || null,
          leadCategory: "subscription",
          leadType: detectedLeadType,
          planName: sub.planName || null,
          billingCycles: sub.billingCycles || 0,
          cyclesCompleted: sub.currentBillingCycle || 0,
          monthlyAmount: sub.recurringAmount ? parseFloat(String(sub.recurringAmount)) : 0,
          billingStatus: sub.status || null,
          assignedAgent: input.assignedAgent,
          assignedAt: Date.now(),
          workStatus: "assigned",
          eventDate: new Date().toISOString().split("T")[0],
        });
        created++;
      }

      return { success: true, created, updated: skipped };
    }),

  /**
   * Reassign a lead to a different retention agent, or unassign.
   */
  reassignRetention: adminProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        assignedAgent: z.string().nullable(),
        leadType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.assignedAgent === null) {
        // Unassign — remove the lead assignment entirely
        await db
          .delete(leadAssignments)
          .where(eq(leadAssignments.subscriptionId, input.subscriptionId));
        return { success: true, action: "unassigned" };
      } else {
        // Reassign — update the agent
        const existing = await db
          .select({ id: leadAssignments.id })
          .from(leadAssignments)
          .where(eq(leadAssignments.subscriptionId, input.subscriptionId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(leadAssignments)
            .set({
              assignedAgent: input.assignedAgent,
              assignedAt: Date.now(),
              workStatus: "assigned",
            })
            .where(eq(leadAssignments.subscriptionId, input.subscriptionId));
        } else {
          // Lead not in lead_assignments yet — create a new assignment from client_subscriptions data
          const subData = await db
            .select({
              customerName: clientSubscriptions.customerName,
              email: clientSubscriptions.email,
              phone: clientSubscriptions.phone,
            })
            .from(clientSubscriptions)
            .where(eq(clientSubscriptions.subscriptionId, input.subscriptionId))
            .limit(1);
          const sub = subData[0];
          await db.insert(leadAssignments).values({
            subscriptionId: input.subscriptionId,
            customerName: sub?.customerName || "Unknown",
            email: sub?.email || null,
            phone: sub?.phone || null,
            leadType: input.leadType || "Live Sub",
            assignedAgent: input.assignedAgent,
            assignedAt: Date.now(),
            workStatus: "assigned",
          });
        }
        return { success: true, action: "reassigned" };
      }
    }),
});
