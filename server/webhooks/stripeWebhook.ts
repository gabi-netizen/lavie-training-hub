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
 *  - charge.refunded
 *  - charge.succeeded
 *
 * Every event is logged to the stripe_audit_log table.
 * Contact status is updated in the DB when applicable.
 */
import type { Request, Response } from "express";
import Stripe from "stripe";
import { getStripeClient, getCustomerPaymentMethods, createSubscriptionSchedule } from "../stripe/index";
import { getDb } from "../db";
import { stripeAuditLog, stripeCustomers, contacts, clientSubscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createMintsoftOrder } from "../mintsoft";

// ─── Signature Verification & Event Construction ─────────────────────────────

function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("[Stripe Webhook] STRIPE_BILLING_WEBHOOK_SECRET is not configured");
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

// ─── Card Info Update Helper ────────────────────────────────────────────────

/**
 * Updates the contact's card fields (cardLast4, cardBrand, cardExpMonth, cardExpYear)
 * by looking up the Stripe customer's default payment method.
 */
async function updateContactCardInfo(stripeCustomerId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const stripe = getStripeClient();

    // Get the customer's payment methods
    const methods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });
    const pm = methods.data[0];
    if (!pm?.card) return;

    const cardLast4 = pm.card.last4 ?? null;
    const cardBrand = pm.card.brand ?? null;
    const cardExpMonth = pm.card.exp_month ?? null;
    const cardExpYear = pm.card.exp_year ?? null;

    // Find contact(s) via stripe_customers mapping
    const mappings = await db
      .select({ contactId: stripeCustomers.contactId })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId));

    for (const mapping of mappings) {
      await db
        .update(contacts)
        .set({ cardLast4, cardBrand, cardExpMonth, cardExpYear })
        .where(eq(contacts.id, mapping.contactId));
    }

    if (mappings.length > 0) {
      console.log(`[Stripe Webhook] Updated card info for ${mappings.length} contact(s): ${cardBrand} ****${cardLast4}`);
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error updating card info for customer ${stripeCustomerId}:`, err);
  }
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
    // Update card info on successful payment
    await updateContactCardInfo(customerId);
  }

  // ─── Auto-create Subscription Schedule for £4.95 trial payments ──────────
  const contactId = (pi.metadata as Record<string, string>)?.contactId;
  if (pi.amount === 495 && contactId && customerId) {
    try {
      const db = await getDb();
      const billingStripe = getStripeClient();

      // Get customer's payment methods and set the first card as default
      const paymentMethods = await getCustomerPaymentMethods(customerId, "card");
      let defaultPaymentMethodId: string | undefined;

      if (paymentMethods.length > 0) {
        defaultPaymentMethodId = paymentMethods[0].id;
        await billingStripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: defaultPaymentMethodId },
        });
      }

      // Look up agent attribution from the contact record
      let agentName = "Unknown";
      let agentEmail = "unknown@lavielabs.com";
      if (db) {
        const [contact] = await db
          .select({ agentName: contacts.agentName, agentEmail: contacts.agentEmail })
          .from(contacts)
          .where(eq(contacts.id, Number(contactId)))
          .limit(1);
        if (contact) {
          agentName = contact.agentName ?? "Unknown";
          agentEmail = contact.agentEmail ?? "unknown@lavielabs.com";
        }
      }

      // Calculate start date: 21 days from now (unix timestamp)
      const startDate = Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60;

      // Create Subscription Schedule: £44.95 every 60 days, starting 21 days from now
      const schedule = await createSubscriptionSchedule(
        {
          customerId,
          phases: [
            {
              amount: 4495,
              interval: "day",
              intervalCount: 60,
              iterations: undefined as unknown as number, // ongoing
            },
          ],
          startDate,
          defaultPaymentMethod: defaultPaymentMethodId,
          metadata: {
            contactId,
            createdBy: "webhook_payment_intent.succeeded",
            trialAmount: "495",
            agentName,
            agentEmail,
          },
        },
        `auto-sub-webhook-${contactId}-${Date.now()}`
      );

      // Upsert stripe_customers mapping with agent info
      if (db) {
        const existingMapping = await db
          .select()
          .from(stripeCustomers)
          .where(eq(stripeCustomers.contactId, Number(contactId)))
          .limit(1);

        if (existingMapping.length > 0) {
          await db
            .update(stripeCustomers)
            .set({
              paymentMethodId: defaultPaymentMethodId ?? null,
              agentName,
              agentEmail,
            })
            .where(eq(stripeCustomers.contactId, Number(contactId)));
        } else {
          await db.insert(stripeCustomers).values({
            contactId: Number(contactId),
            stripeCustomerId: customerId,
            paymentMethodId: defaultPaymentMethodId ?? null,
            agentName,
            agentEmail,
          });
        }

        // Audit log for subscription creation
        await db.insert(stripeAuditLog).values({
          eventId: `auto-sub-created-webhook-${contactId}-${Date.now()}`,
          eventType: "subscription_schedule.auto_created",
          customerId,
          subscriptionId: schedule.id,
          amount: 4495,
          currency: "gbp",
          status: "processed",
          metadata: {
            source: "webhook_payment_intent.succeeded",
            trialAmount: 495,
            subscriptionAmount: 4495,
            intervalDays: 60,
            startDate,
            agentName,
            agentEmail,
            paymentMethodId: defaultPaymentMethodId,
          },
        });
      }

      console.log(`[Stripe Webhook] Auto-created subscription schedule ${schedule.id} for contact ${contactId} (agent: ${agentName})`);
    } catch (err) {
      console.error(`[Stripe Webhook] Failed to auto-create subscription for contact ${contactId}:`, err);
      try {
        const db = await getDb();
        if (db) {
          await db.insert(stripeAuditLog).values({
            eventId: `auto-sub-failed-webhook-${contactId}-${Date.now()}`,
            eventType: "subscription_schedule.auto_create_failed",
            customerId,
            status: "error",
            metadata: {
              source: "webhook_payment_intent.succeeded",
              error: err instanceof Error ? err.message : "Unknown error",
              contactId,
            },
          });
        }
      } catch {
        // Swallow — best effort audit
      }
    }

    // ─── Auto-create Mintsoft order for trial kit shipment ──────────────────
    try {
      const db = await getDb();
      if (db) {
        const [contact] = await db
          .select({
            name: contacts.name,
            email: contacts.email,
            phone: contacts.phone,
            address: contacts.address,
            trialKit: contacts.trialKit,
          })
          .from(contacts)
          .where(eq(contacts.id, Number(contactId)))
          .limit(1);

        if (!contact) {
          console.warn(`[Stripe Webhook] Mintsoft order skipped: contact ${contactId} not found`);
        } else if (!contact.trialKit || !contact.address) {
          // Missing required fields — log and skip
          await db.insert(stripeAuditLog).values({
            eventId: `mintsoft-skipped-${contactId}-${Date.now()}`,
            eventType: "mintsoft_order_skipped",
            customerId,
            status: "skipped",
            metadata: {
              contactId,
              reason: !contact.trialKit
                ? "Missing trialKit"
                : "Missing address",
              hasTrialKit: !!contact.trialKit,
              hasAddress: !!contact.address,
            },
          });
          console.warn(
            `[Stripe Webhook] Mintsoft order skipped for contact ${contactId}: missing ${!contact.trialKit ? "trialKit" : "address"}`
          );
        } else {
          // Parse name into first/last
          const nameParts = (contact.name || "").trim().split(/\s+/);
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          const result = await createMintsoftOrder({
            contactId: Number(contactId),
            firstName,
            lastName,
            email: contact.email || "",
            phone: contact.phone || "",
            address: contact.address,
            trialKit: contact.trialKit,
          });

          if (result.success) {
            await db.insert(stripeAuditLog).values({
              eventId: `mintsoft-created-${contactId}-${Date.now()}`,
              eventType: "mintsoft_order_created",
              customerId,
              status: "processed",
              metadata: {
                contactId,
                mintsoftOrderId: result.orderId,
                orderNumber: result.orderNumber,
                trialKit: contact.trialKit,
              },
            });
            console.log(
              `[Stripe Webhook] Mintsoft order created: ${result.orderNumber} (ID: ${result.orderId}) for contact ${contactId}`
            );
          } else {
            await db.insert(stripeAuditLog).values({
              eventId: `mintsoft-failed-${contactId}-${Date.now()}`,
              eventType: "mintsoft_order_failed",
              customerId,
              status: "error",
              metadata: {
                contactId,
                error: result.error,
                trialKit: contact.trialKit,
              },
            });
            console.error(
              `[Stripe Webhook] Mintsoft order failed for contact ${contactId}: ${result.error}`
            );
          }
        }
      }
    } catch (mintsoftErr) {
      // Mintsoft failure must NOT break the webhook response
      console.error(
        `[Stripe Webhook] Mintsoft order error for contact ${contactId}:`,
        mintsoftErr
      );
      try {
        const db = await getDb();
        if (db) {
          await db.insert(stripeAuditLog).values({
            eventId: `mintsoft-error-${contactId}-${Date.now()}`,
            eventType: "mintsoft_order_failed",
            customerId,
            status: "error",
            metadata: {
              contactId,
              error: mintsoftErr instanceof Error ? mintsoftErr.message : "Unknown error",
            },
          });
        }
      } catch {
        // Swallow — best effort audit
      }
    }
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
  } else if ((invoice as any).subscription) {
    // Fallback for older Stripe API structure
    const sub = (invoice as any).subscription;
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

  // Handle client_subscriptions update for paid invoices > £4.95
  if (invoice.amount_paid > 495 && customerId && subscriptionId) {
    try {
      const db = await getDb();
      if (!db) return;

      // 1. Look up the contact via stripe_customers table
      const [mapping] = await db
        .select({
          contactId: stripeCustomers.contactId,
          agentName: stripeCustomers.agentName,
          agentEmail: stripeCustomers.agentEmail
        })
        .from(stripeCustomers)
        .where(eq(stripeCustomers.stripeCustomerId, customerId))
        .limit(1);

      if (mapping) {
        // 2. Look up contact details
        const [contact] = await db
          .select({
            name: contacts.name,
            email: contacts.email,
            phone: contacts.phone,
            trialKit: contacts.trialKit,
            agentName: contacts.agentName
          })
          .from(contacts)
          .where(eq(contacts.id, mapping.contactId))
          .limit(1);

        if (contact) {
          const todayStr = new Date().toISOString().split('T')[0];
          const nextBillingDate = new Date();
          nextBillingDate.setDate(nextBillingDate.getDate() + 60);
          const nextBillingStr = nextBillingDate.toISOString().split('T')[0];
          
          const amountInPounds = (invoice.amount_paid / 100).toString();
          const salesPerson = mapping.agentName || contact.agentName || "Unknown";

          // 3. Check if client_subscriptions record exists
          const [existingSub] = await db
            .select()
            .from(clientSubscriptions)
            .where(eq(clientSubscriptions.subscriptionId, subscriptionId))
            .limit(1);

          if (existingSub) {
            // Update existing subscription
            await db
              .update(clientSubscriptions)
              .set({
                status: 'live',
                lastBilledOn: todayStr as any,
                currentBillingCycle: (existingSub.currentBillingCycle || 0) + 1,
                nextBillingOn: nextBillingStr as any,
                updatedAt: new Date()
              })
              .where(eq(clientSubscriptions.subscriptionId, subscriptionId));
            
            console.log(`[Stripe Webhook] Updated existing client_subscription ${subscriptionId} to live for contact ${mapping.contactId}`);
          } else {
            // Create new subscription
            await db.insert(clientSubscriptions).values({
              subscriptionId: subscriptionId,
              planName: '1 x Matinika 60 ML',
              planType: 'subscription',
              customerName: contact.name || 'Unknown',
              email: contact.email,
              phone: contact.phone,
              amount: amountInPounds,
              recurringAmount: amountInPounds,
              billingCycles: null,
              currentBillingCycle: 1,
              nextBillingOn: nextBillingStr as any,
              lastBilledOn: todayStr as any,
              status: 'live',
              salesPerson: salesPerson,
              activatedOn: todayStr as any,
              createdOn: todayStr as any,
              contactId: mapping.contactId
            });
            
            console.log(`[Stripe Webhook] Created new client_subscription ${subscriptionId} for contact ${mapping.contactId}`);
          }
        }
      }
    } catch (err) {
      console.error(`[Stripe Webhook] Error updating client_subscriptions on invoice.paid for sub ${subscriptionId}:`, err);
    }
  }
}

async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = extractCustomerId(invoice.customer as any);

  let subscriptionId: string | null = null;
  if (invoice.parent?.subscription_details?.subscription) {
    const sub = invoice.parent.subscription_details.subscription;
    subscriptionId = typeof sub === "string" ? sub : sub.id;
  } else if ((invoice as any).subscription) {
    const sub = (invoice as any).subscription;
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

  if (subscriptionId) {
    try {
      const db = await getDb();
      if (!db) return;

      const [existingSub] = await db
        .select()
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.subscriptionId, subscriptionId))
        .limit(1);

      if (existingSub) {
        await db
          .update(clientSubscriptions)
          .set({
            status: 'dunning',
            updatedAt: new Date()
          })
          .where(eq(clientSubscriptions.subscriptionId, subscriptionId));
          
        console.log(`[Stripe Webhook] Updated client_subscription ${subscriptionId} to dunning`);
      }
    } catch (err) {
      console.error(`[Stripe Webhook] Error updating client_subscriptions on invoice.payment_failed for sub ${subscriptionId}:`, err);
    }
  }
}

async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const customerId = extractCustomerId(charge.customer as any);

  // Try to extract subscription ID from payment_intent metadata or invoice
  let subscriptionId: string | null = null;
  if ((charge as any).invoice) {
    const inv = (charge as any).invoice;
    subscriptionId = typeof inv === "string" ? inv : inv?.id ?? null;
  }

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId,
    amount: charge.amount_refunded,
    currency: charge.currency,
    status: "refunded",
    metadata: {
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded,
      refundReason: (charge as any).refunds?.data?.[0]?.reason ?? "unknown",
    },
  });
}

async function handleChargeSucceeded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const customerId = extractCustomerId(charge.customer as any);

  let subscriptionId: string | null = null;
  if ((charge as any).invoice) {
    const inv = (charge as any).invoice;
    subscriptionId = typeof inv === "string" ? inv : inv?.id ?? null;
  }

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId,
    amount: charge.amount,
    currency: charge.currency,
    status: "processed",
    metadata: {
      chargeId: charge.id,
      paymentMethod: charge.payment_method,
      receiptUrl: charge.receipt_url,
    },
  });

  // Update card info on successful charge
  if (customerId) {
    await updateContactCardInfo(customerId);
  }
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
      case "charge.refunded":
        await handleChargeRefunded(event);
        break;
      case "charge.succeeded":
        await handleChargeSucceeded(event);
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
