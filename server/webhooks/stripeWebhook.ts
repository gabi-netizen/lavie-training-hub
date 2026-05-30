/**
 * Stripe Webhook Handler
 *
 * Verifies Stripe webhook signatures, enforces idempotency by checking
 * processed event IDs in the database, and dispatches event-specific handlers.
 *
 * Handled events:
 *  - payment_intent.succeeded
 *  - payment_intent.payment_failed
 *  - customer.subscription.created
 *  - customer.subscription.updated
 *  - customer.subscription.deleted
 *  - invoice.paid
 *  - invoice.payment_failed
 *  - charge.dispute.created
 *
 * Every event is logged to the stripe_audit_log table.
 * Contact status is updated in the DB when applicable.
 */
import type { Request, Response } from "express";
import Stripe from "stripe";
import { getStripeClient } from "../stripe/index";
import { getDb } from "../db";
import { stripeAuditLog, stripeCustomers, contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Signature Verification & Event Construction ─────────────────────────────

function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

// ─── Idempotency Check ───────────────────────────────────────────────────────

/**
 * Returns true if this event has already been processed (exists in audit log).
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const existing = await db
    .select({ id: stripeAuditLog.id })
    .from(stripeAuditLog)
    .where(eq(stripeAuditLog.eventId, eventId))
    .limit(1);

  return existing.length > 0;
}

// ─── Audit Log Insertion ─────────────────────────────────────────────────────

interface AuditLogEntry {
  eventId: string;
  eventType: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: string;
  metadata?: unknown;
}

async function insertAuditLog(entry: AuditLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Stripe Webhook] Cannot write audit log: database not available");
    return;
  }

  await db.insert(stripeAuditLog).values({
    eventId: entry.eventId,
    eventType: entry.eventType,
    customerId: entry.customerId ?? null,
    subscriptionId: entry.subscriptionId ?? null,
    amount: entry.amount ?? null,
    currency: entry.currency ?? null,
    status: entry.status,
    metadata: entry.metadata ?? null,
  });
}

// ─── Contact Status Update Helper ────────────────────────────────────────────

/**
 * Finds the internal contact by Stripe Customer ID and updates their status.
 */
async function updateContactStatus(
  stripeCustomerId: string,
  newStatus: "done_deal" | "retained_sub" | "cancelled_sub" | "working"
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Look up the contact via stripe_customers mapping
  const mapping = await db
    .select({ contactId: stripeCustomers.contactId })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);

  if (mapping.length === 0) return;

  const contactId = mapping[0].contactId;
  await db
    .update(contacts)
    .set({ status: newStatus })
    .where(eq(contacts.id, contactId));
}

// ─── Helper: extract customer ID string from event object ────────────────────

function extractCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id ?? null;
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const customerId = extractCustomerId(pi.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: pi.amount,
    currency: pi.currency,
    status: "processed",
    metadata: { paymentIntentId: pi.id, status: pi.status },
  });

  if (customerId) {
    await updateContactStatus(customerId, "done_deal");
  }
}

async function handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const customerId = extractCustomerId(pi.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: pi.amount,
    currency: pi.currency,
    status: "failed",
    metadata: {
      paymentIntentId: pi.id,
      failureMessage: pi.last_payment_error?.message ?? "Unknown failure",
    },
  });
}

async function handleSubscriptionCreated(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = extractCustomerId(sub.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId: sub.id,
    status: "processed",
    metadata: { subscriptionStatus: sub.status },
  });

  if (customerId) {
    await updateContactStatus(customerId, "retained_sub");
  }
}

async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = extractCustomerId(sub.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId: sub.id,
    status: "processed",
    metadata: { subscriptionStatus: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end },
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = extractCustomerId(sub.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId: sub.id,
    status: "processed",
    metadata: { subscriptionStatus: sub.status },
  });

  if (customerId) {
    await updateContactStatus(customerId, "cancelled_sub");
  }
}

async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = extractCustomerId(invoice.customer as any);

  // In newer Stripe API versions, subscription info is in invoice.parent.subscription_details
  let subscriptionId: string | null = null;
  if (invoice.parent?.subscription_details?.subscription) {
    const sub = invoice.parent.subscription_details.subscription;
    subscriptionId = typeof sub === "string" ? sub : sub.id;
  }

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: "processed",
    metadata: { invoiceId: invoice.id, invoiceStatus: invoice.status },
  });
}

async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = extractCustomerId(invoice.customer as any);

  let subscriptionId: string | null = null;
  if (invoice.parent?.subscription_details?.subscription) {
    const sub = invoice.parent.subscription_details.subscription;
    subscriptionId = typeof sub === "string" ? sub : sub.id;
  }

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: "failed",
    metadata: { invoiceId: invoice.id, attemptCount: invoice.attempt_count },
  });
}

async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as any)?.id ?? null;
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId: null,
    amount: dispute.amount,
    currency: dispute.currency,
    status: "dispute",
    metadata: { disputeId: dispute.id, chargeId, reason: dispute.reason },
  });
}

// ─── Main Webhook Handler ────────────────────────────────────────────────────

/**
 * Express handler for POST /api/webhooks/stripe-billing
 *
 * This route MUST receive raw body (Buffer) for signature verification.
 * Register it BEFORE express.json() middleware.
 */
export async function handleStripeBillingWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const signature = req.headers["stripe-signature"] as string | undefined;

  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  // ── Construct & verify event ───────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = constructEvent(req.body as Buffer, signature);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // ── Idempotency: skip already-processed events ─────────────────────────────
  try {
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      console.log(`[Stripe Webhook] Skipping duplicate event: ${event.id}`);
      res.json({ received: true, duplicate: true });
      return;
    }
  } catch (err) {
    // If we can't check idempotency (DB issue), log but continue processing
    console.warn("[Stripe Webhook] Idempotency check failed, processing anyway:", err);
  }

  // ── Dispatch to event-specific handler ─────────────────────────────────────
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "charge.dispute.created":
        await handleChargeDisputeCreated(event);
        break;
      default:
        // Unhandled event type — still log it for audit purposes
        await insertAuditLog({
          eventId: event.id,
          eventType: event.type,
          status: "unhandled",
          metadata: { note: "Event type not explicitly handled" },
        });
        break;
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing event ${event.id}:`, err);
    // Still return 200 to prevent Stripe from retrying — the event is logged
    try {
      await insertAuditLog({
        eventId: event.id,
        eventType: event.type,
        status: "error",
        metadata: { error: err instanceof Error ? err.message : "Unknown error" },
      });
    } catch {
      // Swallow — we tried our best to log
    }
  }

  res.json({ received: true });
}
