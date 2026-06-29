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
import { stripeAuditLog, stripeCustomers, contacts, clientSubscriptions, billingPlans, openingTrials, retentionDeals } from "../../drizzle/schema";
import { createMintsoftOrder, createMintsoftOrderFromPhase, markOrderPackAndHold } from "../mintsoft";
import { eq, sql } from "drizzle-orm";

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
  source?: string | null;
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
    source: entry.source ?? null,
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
  const contactId = (pi.metadata as Record<string, string>)?.contactId;

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: pi.amount,
    currency: pi.currency,
    status: "processed",
    metadata: { paymentIntentId: pi.id, status: pi.status },
    source: pi.amount === 495 && contactId ? "max_billing" : null,
  });

  if (customerId) {
    await updateContactStatus(customerId, "done_deal");
    // Update card info on successful payment
    await updateContactCardInfo(customerId);
  }

  // ─── Auto-create Subscription Schedule for £4.95 trial payments ──────────
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
          source: "max_billing",
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
        // Safety net: check for existing Mintsoft order for this contact
        const existingOrder = await db
          .select({ id: stripeAuditLog.id })
          .from(stripeAuditLog)
          .where(
            sql`${stripeAuditLog.eventType} = 'mintsoft_order_created' AND JSON_EXTRACT(${stripeAuditLog.metadata}, '$.contactId') = ${contactId}`
          )
          .limit(1);

        if (existingOrder.length > 0) {
          await db.insert(stripeAuditLog).values({
            eventId: `mintsoft-duplicate-${contactId}-${Date.now()}`,
            eventType: "mintsoft_order_duplicate",
            customerId,
            status: "skipped",
            source: "max_billing",
            metadata: {
              contactId,
              reason: "Duplicate order prevented (already exists in audit log)",
            },
          });
          console.log(`[Stripe Webhook] Mintsoft order skipped for contact ${contactId}: already created`);
          return;
        }

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
              eventId: `mintsoft-${contactId}-${Date.now()}`,
              eventType: "mintsoft_order_created",
              customerId,
              status: "processed",
              source: "max_billing",
              metadata: {
                contactId,
                orderId: result.orderId,
                orderNumber: result.orderNumber,
                trialKit: contact.trialKit,
                triggeredBy: "webhook_payment_intent.succeeded",
              },
            });
            console.log(`[Stripe Webhook] Mintsoft trial order created: ${result.orderNumber} for contact ${contactId}`);

            // ─── Insert into opening_trials for Opening Dashboard ──────────
            try {
              // Get agent name (first name only, matching opening_trials format)
              const [contactForAgent] = await db
                .select({ agentName: contacts.agentName })
                .from(contacts)
                .where(eq(contacts.id, Number(contactId)))
                .limit(1);
              const fullAgentName = contactForAgent?.agentName || "Unknown";
              const firstName = fullAgentName.trim().split(/\s+/)[0];
              const today = new Date();
              const createdDate = today.toISOString().split("T")[0]; // YYYY-MM-DD
              const month = createdDate.substring(0, 7); // YYYY-MM

              await db.insert(openingTrials).values({
                subscriptionId: `max_billing_${contactId}`,
                customerName: contact.name || null,
                email: contact.email || null,
                agentName: firstName,
                planName: `Max Billing - ${contact.trialKit || "Trial Kit"}`,
                createdDate,
                status: "trial",
                classification: "still_in_trial",
                month,
              }).onDuplicateKeyUpdate({ set: { status: "trial" } });

              console.log(`[Stripe Webhook] Opening trial recorded for ${contact.name} (agent: ${firstName}, month: ${month})`);
            } catch (otErr) {
              console.error(`[Stripe Webhook] Failed to insert opening_trial for contact ${contactId}:`, otErr);
            }
          } else {
            await db.insert(stripeAuditLog).values({
              eventId: `mintsoft-failed-${contactId}-${Date.now()}`,
              eventType: "mintsoft_order_failed",
              customerId,
              status: "error",
              source: "max_billing",
              metadata: {
                contactId,
                error: result.error,
                trialKit: contact.trialKit,
                triggeredBy: "webhook_payment_intent.succeeded",
              },
            });
            console.error(`[Stripe Webhook] Mintsoft trial order failed for contact ${contactId}: ${result.error}`);
          }
        }
      }
    } catch (mintsoftErr) {
      console.error(`[Stripe Webhook] Mintsoft trial order error for contact ${contactId}:`, mintsoftErr);
    }
  }
}

async function handlePaymentIntentPaymentFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const customerId = extractCustomerId(pi.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: pi.amount,
    currency: pi.currency,
    status: "error",
    metadata: { paymentIntentId: pi.id, status: pi.status, lastError: pi.last_payment_error?.message },
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
            address: contacts.address,
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

          let currentCycle = 1;
          if (existingSub) {
            // Update existing subscription
            currentCycle = (existingSub.currentBillingCycle || 0) + 1;
            await db
              .update(clientSubscriptions)
              .set({
                status: 'live',
                lastBilledOn: todayStr as any,
                currentBillingCycle: currentCycle,
                nextBillingOn: nextBillingStr as any,
                updatedAt: new Date()
              })
              .where(eq(clientSubscriptions.subscriptionId, subscriptionId));
            
            console.log(`[Stripe Webhook] Updated existing client_subscription ${subscriptionId} to live (cycle ${currentCycle}) for contact ${mapping.contactId}`);
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

          // ─── Billing Plan Phase-based Mintsoft Order ──────────────────────
          // Look up contact's billingPlanId and create Mintsoft order based on the appropriate phase
          try {
            const [contactFull] = await db
              .select({
                billingPlanId: contacts.billingPlanId,
                address: contacts.address,
                name: contacts.name,
                email: contacts.email,
                phone: contacts.phone,
              })
              .from(contacts)
              .where(eq(contacts.id, mapping.contactId))
              .limit(1);

            if (contactFull?.billingPlanId && contactFull.address) {
              const [plan] = await db
                .select()
                .from(billingPlans)
                .where(eq(billingPlans.id, contactFull.billingPlanId))
                .limit(1);

              if (plan && Array.isArray(plan.phases)) {
                const phases = plan.phases as Array<{
                  phase: number;
                  productName: string;
                  sku: string;
                  price: number;
                  triggerType: string;
                  triggerDays: number;
                  mintsoftItems: { SKU: string; Quantity: number }[];
                }>;

                // Determine which phase to use based on billing cycle:
                // Phase 1 = immediate (trial kit, handled elsewhere)
                // Phase 2 = first subscription payment (cycle 1)
                // Phase 3+ = recurring (cycle 2+)
                let matchedPhase = null;

                // First, look for a phase that matches this exact cycle
                // Cycle 1 of subscription = Phase 2 (days_after_start)
                // Cycle 2+ = Phase 3 (recurring)
                if (currentCycle === 1) {
                  // First subscription payment — find phase with triggerType "days_after_start"
                  matchedPhase = phases.find(p => p.triggerType === "days_after_start");
                }
                if (!matchedPhase && currentCycle >= 2) {
                  // Recurring payments — find phase with triggerType "recurring"
                  matchedPhase = phases.find(p => p.subscription_type === "recurring" || p.triggerType === "recurring");
                }
                // Fallback: if no specific match, use the last non-immediate phase
                if (!matchedPhase) {
                  matchedPhase = phases.filter(p => p.triggerType !== "immediate").pop();
                }

                if (matchedPhase && matchedPhase.mintsoftItems && matchedPhase.mintsoftItems.length > 0) {
                  const nameParts = (contactFull.name || "").trim().split(/\s+/);
                  const firstName = nameParts[0] || "";
                  const lastName = nameParts.slice(1).join(" ") || "";

                  const orderResult = await createMintsoftOrderFromPhase({
                    contactId: mapping.contactId,
                    firstName,
                    lastName,
                    email: contactFull.email || "",
                    phone: contactFull.phone || "",
                    address: contactFull.address,
                    mintsoftItems: matchedPhase.mintsoftItems,
                    orderValue: matchedPhase.price,
                  });

                  if (orderResult.success) {
                    await db.insert(stripeAuditLog).values({
                      eventId: `mintsoft-sub-${mapping.contactId}-cycle${currentCycle}-${Date.now()}`,
                      eventType: "mintsoft_order_created",
                      customerId,
                      subscriptionId,
                      status: "processed",
                      source: "max_billing",
                      metadata: {
                        contactId: mapping.contactId,
                        mintsoftOrderId: orderResult.orderId,
                        orderNumber: orderResult.orderNumber,
                        billingCycle: currentCycle,
                        phase: matchedPhase.phase,
                        productName: matchedPhase.productName,
                        triggeredBy: "invoice_paid_webhook",
                      },
                    });
                    console.log(`[Stripe Webhook] Mintsoft subscription order created: ${orderResult.orderNumber} for contact ${mapping.contactId} (cycle ${currentCycle}, phase ${matchedPhase.phase})`);
                  } else {
                    await db.insert(stripeAuditLog).values({
                      eventId: `mintsoft-sub-failed-${mapping.contactId}-cycle${currentCycle}-${Date.now()}`,
                      eventType: "mintsoft_order_failed",
                      customerId,
                      subscriptionId,
                      status: "error",
                      source: "max_billing",
                      metadata: {
                        contactId: mapping.contactId,
                        error: orderResult.error,
                        billingCycle: currentCycle,
                        phase: matchedPhase.phase,
                        triggeredBy: "invoice_paid_webhook",
                      },
                    });
                    console.error(`[Stripe Webhook] Mintsoft subscription order failed for contact ${mapping.contactId} (cycle ${currentCycle}): ${orderResult.error}`);
                  }
                } else {
                  console.log(`[Stripe Webhook] No matching phase with Mintsoft items for contact ${mapping.contactId} (cycle ${currentCycle}, plan ${contactFull.billingPlanId})`);
                }
              }
            }
          } catch (phaseErr) {
            console.error(`[Stripe Webhook] Error processing billing plan phase for contact ${mapping.contactId}:`, phaseErr);
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
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    subscriptionId,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: "error",
    metadata: { invoiceId: invoice.id, invoiceStatus: invoice.status },
  });
}

async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const customerId = extractCustomerId(dispute.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: dispute.amount,
    currency: dispute.currency,
    status: "error",
    metadata: { disputeId: dispute.id, reason: dispute.reason, status: dispute.status },
  });
}

async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const customerId = extractCustomerId(charge.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: charge.amount_refunded,
    currency: charge.currency,
    status: "processed",
    metadata: { chargeId: charge.id, refundStatus: charge.status },
  });
}

// ─── Retention Deal: handle first successful payment for future deals ───────────────────────────

/**
 * When a Stripe invoice is paid for a subscription/schedule that belongs to a
 * retention deal, create the Mintsoft order (Pack and Hold) and update
 * the retention_deals status to 'active'.
 *
 * Triggered by: invoice.paid
 * Condition: deal status is 'future' or 'pending' (first payment not yet confirmed)
 * This handles BOTH immediate and future deals — Mintsoft order is always created after payment.
 */
async function handleRetentionFutureDealPayment(
  subscriptionId: string,
  customerId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Find the retention deal by stripeScheduleId or stripeSubscriptionIds containing this ID
    // Match deals that are still waiting for first payment (status = 'future' or 'pending')
    const deals = await db
      .select()
      .from(retentionDeals)
      .where(
        sql`(
          ${retentionDeals.stripeScheduleId} = ${subscriptionId}
          OR JSON_CONTAINS(${retentionDeals.stripeSubscriptionIds}, JSON_QUOTE(${subscriptionId}))
        ) AND ${retentionDeals.status} IN ('future', 'pending')`
      )
      .limit(1);

    const deal = deals[0];
    if (!deal) return; // Not a retention deal waiting for first payment

    console.log(`[Stripe Webhook] Retention future deal payment received for deal ${deal.id}, contact ${deal.contactId}`);

    // Fetch contact details for Mintsoft order
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, deal.contactId))
      .limit(1);

    if (!contact?.address) {
      console.error(`[SHIPMENT_FAILED] Retention deal ${deal.id} (contact ${deal.contactId}): no address on file — Mintsoft order skipped`);
      await db
        .update(retentionDeals)
        .set({ status: "active", shipmentStatus: "skipped", updatedAt: Date.now() })
        .where(eq(retentionDeals.id, deal.id));
      return;
    }

    // Build SKU list from stored products + free gifts
    const products = (deal.products as any[]) ?? [];
    const gifts = (deal.freeGifts as any[]) ?? [];
    const mintsoftItems: { SKU: string; Quantity: number }[] = [
      ...products.map((p: any) => ({ SKU: p.sku, Quantity: p.quantity })),
      ...gifts.map((g: any) => ({ SKU: g.sku, Quantity: g.quantity })),
    ];

    if (mintsoftItems.length === 0) {
      console.error(`[SHIPMENT_FAILED] Retention deal ${deal.id} (contact ${deal.contactId}): no items — Mintsoft order skipped`);
      await db
        .update(retentionDeals)
        .set({ status: "active", shipmentStatus: "skipped", updatedAt: Date.now() })
        .where(eq(retentionDeals.id, deal.id));
      return;
    }

    const nameParts = (contact.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const totalAmount = parseFloat(String(deal.totalAmount)) || 0;

    const orderResult = await createMintsoftOrderFromPhase({
      contactId: deal.contactId,
      firstName,
      lastName,
      email: contact.email || "",
      phone: contact.phone || "",
      address: contact.address,
      mintsoftItems,
      orderValue: totalAmount,
    });

    if (orderResult.success && orderResult.orderId) {
      // Put on Pack and Hold
      const holdResult = await markOrderPackAndHold(orderResult.orderId);
      if (!holdResult.success) {
        console.error(`[SHIPMENT_FAILED] MarkPackAndHold failed for retention deal ${deal.id}: ${holdResult.error}`);
      }

      await db
        .update(retentionDeals)
        .set({
          status: "active",
          shipmentStatus: "created",
          mintsoftOrderId: orderResult.orderId,
          mintsoftOrderNumber: orderResult.orderNumber ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(retentionDeals.id, deal.id));

      console.log(`[Stripe Webhook] Retention deal ${deal.id}: Mintsoft order ${orderResult.orderNumber} created (Pack and Hold)`);
    } else {
      console.error(`[SHIPMENT_FAILED] Retention deal ${deal.id} (contact ${deal.contactId}): Mintsoft order failed — ${orderResult.error}`);
      await db
        .update(retentionDeals)
        .set({ status: "active", shipmentStatus: "failed", updatedAt: Date.now() })
        .where(eq(retentionDeals.id, deal.id));
    }
  } catch (err: any) {
    console.error(`[Stripe Webhook] handleRetentionFutureDealPayment error: ${err.message}`);
  }
}

async function handleChargeSucceeded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const customerId = extractCustomerId(charge.customer as any);
  await insertAuditLog({
    eventId: event.id,
    eventType: event.type,
    customerId,
    amount: charge.amount,
    currency: charge.currency,
    status: "processed",
    metadata: { chargeId: charge.id, status: charge.status },
  });
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    event = constructEvent(req.body, sig as string);
  } catch (err) {
    console.error(`[Stripe Webhook] Signature verification failed:`, err);
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  // Idempotency check
  if (await isEventProcessed(event.id)) {
    console.log(`[Stripe Webhook] Event ${event.id} already processed, skipping.`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentPaymentFailed(event);
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
      case "invoice.paid": {
        await handleInvoicePaid(event);
        // Also check if this is a retention future deal first payment
        const invoicePaid = event.data.object as Stripe.Invoice;
        const retentionSubId = (invoicePaid as any).subscription as string | null;
        const retentionCustId = extractCustomerId((invoicePaid as any).customer);
        if (retentionSubId && retentionCustId) {
          await handleRetentionFutureDealPayment(retentionSubId, retentionCustId);
        }
        break;
      }
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
        // Log unhandled events
        await insertAuditLog({
          eventId: event.id,
          eventType: event.type,
          status: "ignored",
          metadata: { type: event.type },
        });
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing event ${event.id}:`, err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

// Named export alias for index.ts import
export { handler as handleStripeBillingWebhook };
