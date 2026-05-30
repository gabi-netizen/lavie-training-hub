/**
 * Stripe Service Layer
 *
 * Centralised Stripe SDK access and helper functions for the Lavie Labs Training Hub.
 * All functions accept flexible parameters so billing logic can be composed freely.
 *
 * The Stripe secret key is read from process.env.STRIPE_BILLING_SECRET_KEY, making it trivial
 * to swap Stripe accounts by changing the environment variable.
 */
import Stripe from "stripe";

// ─── Stripe Client Singleton ─────────────────────────────────────────────────

let _stripe: Stripe | null = null;

/**
 * Returns the lazily-initialised Stripe client.
 * Throws if STRIPE_BILLING_SECRET_KEY is not set.
 */
export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_BILLING_SECRET_KEY;
    if (!key) {
      throw new Error(
        "[Stripe] STRIPE_BILLING_SECRET_KEY is not configured. Set it in environment variables."
      );
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// ─── Customer Management ─────────────────────────────────────────────────────

export interface CreateCustomerParams {
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, string>;
}

/**
 * Creates a Stripe Customer and returns the full customer object.
 */
export async function createCustomer(
  params: CreateCustomerParams,
  idempotencyKey?: string
): Promise<Stripe.Customer> {
  const stripe = getStripeClient();
  return stripe.customers.create(
    {
      email: params.email,
      name: params.name,
      phone: params.phone,
      metadata: params.metadata ?? {},
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

// ─── Payment Methods ─────────────────────────────────────────────────────────

/**
 * Attaches a PaymentMethod to a Customer and optionally sets it as default.
 */
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  setAsDefault = true,
  idempotencyKey?: string
): Promise<Stripe.PaymentMethod> {
  const stripe = getStripeClient();

  const pm = await stripe.paymentMethods.attach(
    paymentMethodId,
    { customer: customerId },
    idempotencyKey ? { idempotencyKey: `${idempotencyKey}-attach` } : undefined
  );

  if (setAsDefault) {
    await stripe.customers.update(
      customerId,
      {
        invoice_settings: { default_payment_method: paymentMethodId },
      },
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-default` } : undefined
    );
  }

  return pm;
}

/**
 * Lists all payment methods for a customer.
 */
export async function getCustomerPaymentMethods(
  customerId: string,
  type: Stripe.PaymentMethodListParams.Type = "card"
): Promise<Stripe.PaymentMethod[]> {
  const stripe = getStripeClient();
  const result = await stripe.paymentMethods.list({
    customer: customerId,
    type,
  });
  return result.data;
}

// ─── Subscription Schedules ──────────────────────────────────────────────────

/**
 * Represents a single phase in a subscription schedule.
 * Supports variable amounts and intervals per phase.
 */
export interface SubscriptionPhase {
  /** Amount in smallest currency unit (e.g. pence for GBP) */
  amount: number;
  /** Billing interval: day, week, month, year */
  interval: "day" | "week" | "month" | "year";
  /** Number of intervals between billings (e.g. 1 = every month, 3 = every 3 months) */
  intervalCount?: number;
  /** How many billing cycles this phase lasts */
  iterations: number;
  /** Optional product/price description */
  description?: string;
}

export interface CreateSubscriptionScheduleParams {
  customerId: string;
  /** Array of phases with variable amounts/intervals */
  phases: SubscriptionPhase[];
  /** Currency code (default: gbp) */
  currency?: string;
  /** Default payment method to use */
  defaultPaymentMethod?: string;
  /** Metadata to attach to the schedule */
  metadata?: Record<string, string>;
  /** Existing product ID to use (if not provided, inline product_data is used) */
  productId?: string;
  /** Unix timestamp for when the schedule should start. If omitted, defaults to "now". */
  startDate?: number;
}

/**
 * Creates a Subscription Schedule with variable phases.
 * Each phase can have a different amount and billing interval.
 *
 * Example: £99 month 1, £199 month 2, £99 month 3
 * phases: [
 *   { amount: 9900, interval: "month", iterations: 1 },
 *   { amount: 19900, interval: "month", iterations: 1 },
 *   { amount: 9900, interval: "month", iterations: 1 },
 * ]
 */
export async function createSubscriptionSchedule(
  params: CreateSubscriptionScheduleParams,
  idempotencyKey?: string
): Promise<Stripe.SubscriptionSchedule> {
  const stripe = getStripeClient();
  const currency = params.currency ?? "gbp";

  // First, ensure we have a product to attach prices to.
  // Stripe's SubscriptionSchedule requires `product` (ID) in price_data, not product_data.
  let productId = params.productId;
  if (!productId) {
    // Create a generic product for this schedule
    const product = await stripe.products.create(
      { name: "Lavié Labs Subscription" },
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-product` } : undefined
    );
    productId = product.id;
  }

  // Build Stripe phases from our simplified interface
  const stripePhases = params.phases.map((phase) => ({
    items: [
      {
        price_data: {
          currency,
          product: productId!,
          unit_amount: phase.amount,
          recurring: {
            interval: phase.interval as "day" | "week" | "month" | "year",
            interval_count: phase.intervalCount ?? 1,
          },
        },
        quantity: 1,
      },
    ],
    iterations: phase.iterations,
    ...(params.defaultPaymentMethod
      ? { default_payment_method: params.defaultPaymentMethod }
      : {}),
  }));

  return stripe.subscriptionSchedules.create(
    {
      customer: params.customerId,
      start_date: params.startDate ?? ("now" as unknown as number),
      end_behavior: "cancel",
      phases: stripePhases,
      metadata: params.metadata ?? {},
    } as any,
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

/**
 * Updates an existing subscription schedule with new phases.
 * Replaces all future phases with the provided ones.
 */
export async function updateSubscriptionSchedule(
  scheduleId: string,
  phases: SubscriptionPhase[],
  options?: {
    currency?: string;
    defaultPaymentMethod?: string;
    metadata?: Record<string, string>;
    productId?: string;
  },
  idempotencyKey?: string
): Promise<Stripe.SubscriptionSchedule> {
  const stripe = getStripeClient();
  const currency = options?.currency ?? "gbp";

  // Ensure we have a product
  let productId = options?.productId;
  if (!productId) {
    const product = await stripe.products.create(
      { name: "Lavié Labs Subscription" },
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-product` } : undefined
    );
    productId = product.id;
  }

  const stripePhases = phases.map((phase) => ({
    items: [
      {
        price_data: {
          currency,
          product: productId!,
          unit_amount: phase.amount,
          recurring: {
            interval: phase.interval as "day" | "week" | "month" | "year",
            interval_count: phase.intervalCount ?? 1,
          },
        },
        quantity: 1,
      },
    ],
    iterations: phase.iterations,
    ...(options?.defaultPaymentMethod
      ? { default_payment_method: options.defaultPaymentMethod }
      : {}),
  }));

  return stripe.subscriptionSchedules.update(
    scheduleId,
    {
      phases: stripePhases,
      metadata: options?.metadata,
    } as any,
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

// ─── Subscription Cancellation ───────────────────────────────────────────────

/**
 * Cancels a subscription immediately or at period end.
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd = false,
  idempotencyKey?: string
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();

  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  return stripe.subscriptions.cancel(
    subscriptionId,
    undefined,
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

// ─── Checkout Sessions ───────────────────────────────────────────────────────

export interface CreateCheckoutSessionParams {
  customerId: string;
  /** Line items for the checkout */
  lineItems: Array<{
    amount: number;
    currency?: string;
    name: string;
    quantity?: number;
  }>;
  /** URL to redirect to on success */
  successUrl: string;
  /** URL to redirect to on cancel */
  cancelUrl: string;
  /** Payment mode: payment (one-off), subscription, setup */
  mode?: "payment" | "subscription" | "setup";
  /** Metadata to attach */
  metadata?: Record<string, string>;
}

/**
 * Creates a Stripe Checkout Session (payment link).
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
  idempotencyKey?: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();

  const lineItems = params.lineItems.map((item) => ({
    price_data: {
      currency: item.currency ?? "gbp",
      product_data: { name: item.name },
      unit_amount: item.amount,
    },
    quantity: item.quantity ?? 1,
  }));

  return stripe.checkout.sessions.create(
    {
      customer: params.customerId,
      line_items: lineItems,
      mode: params.mode ?? "payment",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata ?? {},
    } as any,
    idempotencyKey ? { idempotencyKey } : undefined
  );
}
