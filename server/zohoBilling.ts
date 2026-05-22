/**
 * Zoho Billing API integration helper.
 * Handles OAuth token refresh and provides typed API calls.
 */

// ─── Credentials (hardcoded for now, will move to env vars later) ────────────
const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_CLIENT_ID = "1000.LT0I1HRJ1Z5J4A034U1XSLIBF61G1C";
const ZOHO_CLIENT_SECRET = "0964a666099d5c283d6d15ee7c92c0d3eb824f7072";
const ZOHO_REFRESH_TOKEN = "1000.df6ed9287f217afd6a105e3c369427f0.5658ec18f37b29b7395dd2ff47db81c7";
const ZOHO_API_BASE = "https://www.zohoapis.com/billing/v1";
const ZOHO_ORG_ID = "778500587";

// ─── Token cache ─────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a fresh access token using the refresh token.
 * Caches the token until it expires.
 */
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
  // Expire 5 minutes before actual expiry for safety
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

/**
 * Make an authenticated GET request to Zoho Billing API.
 */
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

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ZohoBillingData {
  found: boolean;
  customerId: string | null;
  phone: string | null;
  trialStartDate: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  billingCycleCount: number;
  monthlyAmount: number;
  ltvPlan: number;
  ltvPaid: number;
  nextBillingDate: string | null;
  cancellationDate: string | null;
  shippingAddress: string | null;
}

/**
 * Fetch billing data for a customer by email.
 */
export async function getZohoBillingDataByEmail(email: string): Promise<ZohoBillingData> {
  const empty: ZohoBillingData = {
    found: false,
    customerId: null,
    phone: null,
    trialStartDate: null,
    planName: null,
    subscriptionStatus: null,
    billingCycleCount: 0,
    monthlyAmount: 0,
    ltvPlan: 0,
    ltvPaid: 0,
    nextBillingDate: null,
    cancellationDate: null,
    shippingAddress: null,
  };

  if (!email) return empty;

  try {
    // 1. Find customer by email
    const customerRes = await zohoGet(`/customers?email_contains=${encodeURIComponent(email)}`);
    const customers = customerRes.customers ?? [];
    if (customers.length === 0) return empty;

    const customer = customers[0];
    const customerId = customer.customer_id;

    // Extract phone
    const phone = customer.phone || customer.mobile || null;

    // Extract shipping address
    let shippingAddress: string | null = null;
    const addr = customer.shipping_address;
    if (addr) {
      const parts = [addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
      shippingAddress = parts.length > 0 ? parts.join(", ") : null;
    }

    // 2. Get subscriptions
    const subsRes = await zohoGet(`/subscriptions?customer_id=${customerId}`);
    const subscriptions = subsRes.subscriptions ?? [];

    // Find the most relevant subscription (prefer active, then most recent)
    const sortedSubs = [...subscriptions].sort((a: any, b: any) => {
      // Active first
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      // Then by created_time descending
      return new Date(b.created_time ?? 0).getTime() - new Date(a.created_time ?? 0).getTime();
    });

    const primarySub = sortedSubs[0] ?? null;

    // Plan name and status from primary subscription
    const planName = primarySub?.plan?.name ?? primarySub?.product_name ?? null;
    const subscriptionStatus = primarySub?.status ?? null;
    const monthlyAmount = primarySub?.amount ?? 0;
    const nextBillingDate = primarySub?.next_billing_at ?? null;
    const cancellationDate = primarySub?.cancelled_at ?? null;

    // LTV Plan = total plan value (interval price * billing cycles, or sub_total if available)
    let ltvPlan = 0;
    if (primarySub) {
      if (primarySub.sub_total) {
        ltvPlan = primarySub.sub_total;
      } else if (primarySub.amount && primarySub.billing_cycles) {
        ltvPlan = primarySub.amount * primarySub.billing_cycles;
      } else {
        ltvPlan = primarySub.amount ?? 0;
      }
    }

    // Billing cycle count from subscription
    const billingCycleCount = primarySub?.paid_invoices_count
      ?? primarySub?.billing_cycles_completed
      ?? primarySub?.current_term_number
      ?? 0;

    // 3. Get invoices
    const invoicesRes = await zohoGet(`/invoices?customer_id=${customerId}`);
    const invoices = invoicesRes.invoices ?? [];

    // LTV Paid = sum of all paid invoice amounts
    let ltvPaid = 0;
    for (const inv of invoices) {
      if (inv.status === "paid") {
        ltvPaid += inv.total ?? inv.invoice_total ?? 0;
      }
    }

    // Trial start date = earliest of: first subscription created_date or first invoice date
    let trialStartDate: string | null = null;
    const dates: Date[] = [];

    if (subscriptions.length > 0) {
      for (const sub of subscriptions) {
        if (sub.created_date) dates.push(new Date(sub.created_date));
        if (sub.created_time) dates.push(new Date(sub.created_time));
      }
    }
    if (invoices.length > 0) {
      for (const inv of invoices) {
        if (inv.invoice_date) dates.push(new Date(inv.invoice_date));
        if (inv.date) dates.push(new Date(inv.date));
      }
    }

    const validDates = dates.filter((d) => !isNaN(d.getTime()));
    if (validDates.length > 0) {
      validDates.sort((a, b) => a.getTime() - b.getTime());
      trialStartDate = validDates[0].toISOString().split("T")[0];
    }

    return {
      found: true,
      customerId,
      phone,
      trialStartDate,
      planName,
      subscriptionStatus,
      billingCycleCount,
      monthlyAmount,
      ltvPlan,
      ltvPaid,
      nextBillingDate,
      cancellationDate,
      shippingAddress,
    };
  } catch (err) {
    console.error(`[ZohoBilling] Error fetching data for ${email}:`, err);
    return empty;
  }
}
