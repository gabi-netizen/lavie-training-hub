/**
 * Billing tRPC Router
 *
 * Provides admin-only procedures for fetching subscription data from Zoho Billing API.
 * Includes in-memory caching (5 minutes) to avoid rate limits.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";

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

async function getAccessToken(): Promise<string> {
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
async function zohoGet(path: string): Promise<any> {
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
  salesperson_name: string;
  created_time: string;
  cf_recurring_amount: string;
  cf_next_renewal_amount: string;
  current_term_starts_at: string;
  current_term_ends_at: string;
  trial_ends_at: string;
}

// Helper: determine if a plan is an installment
function isInstallmentPlan(planName: string): boolean {
  return /installment/i.test(planName);
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

  // Fetch only live subscriptions (active)
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await zohoGet(`/subscriptions?per_page=200&page=${page}&status=live`);
    const subscriptions = response.subscriptions ?? [];
    allSubscriptions.push(...subscriptions);
    if (subscriptions.length < 200 || !response.page_context?.has_more_page) {
      hasMore = false;
    } else {
      page++;
    }
  }

  subscriptionCache = { data: allSubscriptions, timestamp: Date.now() };
  return allSubscriptions;
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

        // Count UNIQUE customers with active subscriptions vs installments
        const subCustomers = new Set<string>();
        const installmentCustomers = new Set<string>();

        for (const sub of subscriptions) {
          const customerId = sub.customer_id || sub.email || sub.customer_name;
          if (isInstallmentPlan(sub.plan_name || "")) {
            installmentCustomers.add(customerId);
          } else {
            subCustomers.add(customerId);
          }
        }

        // By salesperson - count unique customers per agent
        const agentMap = new Map<string, { subscriptions: Set<string>; installments: Set<string>; revenue: number }>();
        for (const sub of subscriptions) {
          const agent = sub.salesperson_name || "Unassigned";
          if (!agentMap.has(agent)) {
            agentMap.set(agent, { subscriptions: new Set(), installments: new Set(), revenue: 0 });
          }
          const entry = agentMap.get(agent)!;
          const customerId = sub.customer_id || sub.email || sub.customer_name;
          if (isInstallmentPlan(sub.plan_name || "")) {
            entry.installments.add(customerId);
          } else {
            entry.subscriptions.add(customerId);
          }
          entry.revenue += sub.amount || 0;
        }
        const bySalesperson = Array.from(agentMap.entries())
          .map(([agent, data]) => ({
            agent,
            subscriptions: data.subscriptions.size,
            installments: data.installments.size,
            total: data.subscriptions.size + data.installments.size,
            revenue: data.revenue,
          }))
          .sort((a, b) => b.total - a.total);

        // MRR: sum of all live non-installment subscription amounts
        let mrr = 0;
        for (const sub of subscriptions) {
          if (sub.status?.toLowerCase() === "live" && !isInstallmentPlan(sub.plan_name || "")) {
            mrr += sub.amount || 0;
          }
        }

        return {
          uniqueSubCustomers: subCustomers.size,
          uniqueInstallmentCustomers: installmentCustomers.size,
          totalActiveCustomers: new Set([...Array.from(subCustomers), ...Array.from(installmentCustomers)]).size,
          bySalesperson,
          mrr,
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
});
