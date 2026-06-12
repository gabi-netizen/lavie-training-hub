/**
 * Billing tRPC Router
 *
 * Provides admin-only procedures for fetching subscription data from Zoho Billing API.
 * Includes in-memory caching (5 minutes) to avoid rate limits.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

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
   * Get My Clients data from Zoho Billing API (all statuses).
   * Used by the My Clients tab in Retention Workspace.
   * Fetches all statuses, filters by salesperson, excludes "Not Shippable",
   * and returns detailed subscription data with summary counts.
   */
  getMyClientsData: protectedProcedure
    .input(
      z.object({
        salesperson: z.string().default("Rob"),
        status: z.string().optional(),
        planType: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().positive().default(1),
        perPage: z.number().int().positive().max(100).default(50),
        forceRefresh: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const allSubscriptions = await fetchAllStatusSubscriptions(input.forceRefresh ?? false);

        // Filter by salesperson
        let filtered = allSubscriptions.filter(
          (sub) => (sub.salesperson_name || "").toLowerCase() === input.salesperson.toLowerCase()
        );

        // Apply status filter
        if (input.status) {
          const statusFilter = input.status.toLowerCase();
          filtered = filtered.filter((sub) => {
            const s = sub.status?.toLowerCase();
            if (statusFilter === "cancelled") return s === "cancelled" || s === "canceled";
            return s === statusFilter;
          });
        }

        // Apply plan type filter
        if (input.planType) {
          if (input.planType === "subscription") {
            filtered = filtered.filter((sub) => !isInstallmentPlan(sub.plan_name || "") && !/one\s*payment/i.test(sub.plan_name || ""));
          } else if (input.planType === "installment") {
            filtered = filtered.filter((sub) => isInstallmentPlan(sub.plan_name || ""));
          } else if (input.planType === "one_payment") {
            filtered = filtered.filter((sub) => /one\s*payment|deposit/i.test(sub.plan_name || ""));
          }
        }

        // Apply search filter
        if (input.search) {
          const searchLower = input.search.toLowerCase();
          filtered = filtered.filter(
            (sub) =>
              sub.customer_name?.toLowerCase().includes(searchLower) ||
              sub.email?.toLowerCase().includes(searchLower)
          );
        }

        // Compute summary counts BEFORE pagination (but after salesperson filter, before other filters)
        // We use the full salesperson-filtered list for summary
        const allForSalesperson = allSubscriptions.filter(
          (sub) => (sub.salesperson_name || "").toLowerCase() === input.salesperson.toLowerCase()
        );

        const summary = {
          total: allForSalesperson.length,
          live: allForSalesperson.filter((s) => s.status?.toLowerCase() === "live").length,
          dunning: allForSalesperson.filter((s) => s.status?.toLowerCase() === "dunning").length,
          cancelled: allForSalesperson.filter((s) => s.status?.toLowerCase() === "cancelled" || s.status?.toLowerCase() === "canceled").length,
          future: allForSalesperson.filter((s) => s.status?.toLowerCase() === "future").length,
          expired: allForSalesperson.filter((s) => s.status?.toLowerCase() === "expired").length,
          unpaid: allForSalesperson.filter((s) => s.status?.toLowerCase() === "unpaid").length,
        };

        // Filter out "Not Shippable" using cf_shipping_type from list data
        filtered = filtered.filter((sub) => {
          const shippingType = (sub.cf_shipping_type || "").toLowerCase();
          return shippingType !== "not shippable";
        });

        // Sort by created_time descending (newest first)
        filtered.sort((a, b) => {
          const dateA = a.created_time ? new Date(a.created_time).getTime() : 0;
          const dateB = b.created_time ? new Date(b.created_time).getTime() : 0;
          return dateB - dateA;
        });

        // Paginate
        const totalFiltered = filtered.length;
        const start = (input.page - 1) * input.perPage;
        const end = start + input.perPage;
        const pageData = filtered.slice(start, end);

        // Build subscriptions directly from list data (all fields available)
        const subscriptions: MyClientSubscription[] = [];

        for (const listSub of pageData) {
          // Parse setup fee from cf_setup_fee
          const setupFeeStr = listSub.cf_setup_fee || "";
          const setupFee = setupFeeStr ? parseFloat(setupFeeStr) : null;

          // Recurring amount from cf_recurring_amount or amount
          const recurringAmountStr = listSub.cf_recurring_amount || "";
          const recurringAmount = recurringAmountStr ? parseFloat(recurringAmountStr) : (listSub.amount || null);

          // Total amount: for installments, calculate from setup_fee + (recurring * billing_cycles)
          // Billing cycles: derive from expires_at and activated_at, or from plan_name
          let billingCycles: number | null = null;
          const planName = listSub.plan_name || "";
          const cyclesMatch = planName.match(/(\d+)\s*Installment/i);
          if (cyclesMatch) {
            billingCycles = parseInt(cyclesMatch[1]);
          }

          // Total amount calculation
          let totalAmount: number | null = null;
          if (billingCycles && recurringAmount) {
            totalAmount = (setupFee || 0) + (recurringAmount * billingCycles);
            totalAmount = Math.round(totalAmount * 100) / 100;
          }

          // Current billing cycle from cf_current_billing_cycle
          const currentBillingCycleStr = listSub.cf_current_billing_cycle || "";
          const currentBillingCycle = currentBillingCycleStr ? parseInt(currentBillingCycleStr) : null;

          // Campaign ID
          const campaignId = listSub.cf_campaign_id || null;

          // Extract products from cf_ fields on the list object
          const products: Record<string, number> = {};
          const productFieldMap: Record<string, string> = {
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
          for (const [cfKey, productName] of Object.entries(productFieldMap)) {
            const val = listSub[cfKey];
            if (val) {
              const qty = parseFloat(val);
              if (!isNaN(qty) && qty > 0) {
                products[productName] = qty;
              }
            }
          }

          subscriptions.push({
            subscriptionId: listSub.subscription_id,
            customerName: listSub.customer_name || "",
            email: listSub.email || "",
            planName: listSub.plan_name || "",
            setupFee: setupFee !== null && !isNaN(setupFee) ? setupFee : null,
            recurringAmount: recurringAmount !== null && !isNaN(recurringAmount) ? recurringAmount : null,
            totalAmount,
            billingCycles,
            currentBillingCycle: currentBillingCycle !== null && !isNaN(currentBillingCycle) ? currentBillingCycle : null,
            nextBillingOn: listSub.next_billing_at || null,
            status: listSub.status?.toLowerCase() || "",
            campaignId,
            createdOn: listSub.created_time || null,
            activatedOn: listSub.activated_at || null,
            lastBilledOn: listSub.last_billing_at || null,
            cancelledDate: listSub.cancelled_at || null,
            phone: listSub.phone || null,
            products,
            subscriptionNumber: listSub.subscription_number || null,
          });
        }

        return {
          subscriptions,
          summary,
          totalCount: totalFiltered,
          page: input.page,
          perPage: input.perPage,
          hasMore: end < totalFiltered,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch My Clients data: ${err.message}`,
        });
      }
    }),
});
