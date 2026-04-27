/**
 * Stripe payment integration for Lavie Labs.
 *
 * Provides:
 *  - createPaymentIntent: creates a Stripe PaymentIntent for £4.95 and returns
 *    the client_secret to the frontend so Stripe Elements can confirm the payment.
 *  - handleStripeWebhook: processes Stripe webhook events (payment_intent.succeeded)
 *    to mark form_submissions as processed, notify the owner, and save the
 *    Stripe Customer ID to the matching CRM contact.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { formSubmissions, contacts } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/** Lazy-init Stripe client so the server starts even without the key configured. */
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

/**
 * POST /api/stripe/create-payment-intent
 *
 * Body: { email: string; agentName?: string }
 *
 * Creates a Stripe PaymentIntent for £4.95 and returns:
 *   { clientSecret: string; paymentIntentId: string }
 *
 * The frontend uses clientSecret to confirm the payment via Stripe Elements
 * (including Apple Pay / Google Pay via Payment Request Button).
 */
export async function createPaymentIntent(req: Request, res: Response): Promise<void> {
  try {
    const { agentName } = req.body as { agentName?: string };

    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 495, // £4.95 in pence
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        agentName: agentName ?? "",
        source: "lavie-training-hub",
      },
      description: "Lavié Labs Trial Package — £4.95 P&P",
    });

    // Pre-create a form_submission record in "new" status so we can link it
    // to the PaymentIntent and update it when the webhook fires.
    const db = await getDb();
    if (db) {
      await db.insert(formSubmissions).values({
        email: "",
        cardholderName: "",
        agentName: agentName ?? "",
        status: "new",
        stripePaymentIntentId: paymentIntent.id,
      });
    }

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("[Stripe] createPaymentIntent error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
}

/**
 * POST /api/webhooks/stripe
 *
 * Stripe sends signed webhook events here.
 * We handle payment_intent.succeeded to:
 *  1. Mark the form_submission as processed with billing details
 *  2. Save the Stripe Customer ID to the matching CRM contact (matched by email)
 *  3. Notify the owner
 *
 * IMPORTANT: This route must receive the raw body (Buffer), not parsed JSON.
 * Register it BEFORE express.json() middleware.
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;

  if (!ENV.stripeWebhookSecret) {
    // Webhook secret not configured — accept but log a warning
    console.warn("[Stripe] STRIPE_WEBHOOK_SECRET not set; skipping signature verification");
    res.json({ received: true });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig ?? "",
      ENV.stripeWebhookSecret
    );
  } catch (err) {
    console.error("[Stripe] Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const email = pi.metadata?.email ?? "";
    const agentName = pi.metadata?.agentName ?? "";

    // Extract billing details from the latest charge if available
    let cardholderName = "";
    let cardLast4: string | undefined;
    let cardExpiry: string | undefined;
    let addressLine1: string | undefined;
    let addressLine2: string | undefined;
    let city: string | undefined;
    let postcode: string | undefined;
    let stripeCustomerId: string | undefined;

    try {
      const stripe = getStripe();
      const charges = await stripe.charges.list({ payment_intent: pi.id, limit: 1 });
      const charge = charges.data[0];
      if (charge) {
        const billing = charge.billing_details;
        cardholderName = billing?.name ?? "";
        addressLine1 = billing?.address?.line1 ?? undefined;
        addressLine2 = billing?.address?.line2 ?? undefined;
        city = billing?.address?.city ?? undefined;
        postcode = billing?.address?.postal_code ?? undefined;
        const pm = charge.payment_method_details;
        if (pm?.card) {
          cardLast4 = pm.card.last4 ?? undefined;
          const expMonth = pm.card.exp_month;
          const expYear = pm.card.exp_year;
          if (expMonth && expYear) {
            cardExpiry = `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
          }
        }
        // Capture Stripe Customer ID from the charge
        if (charge.customer) {
          stripeCustomerId = typeof charge.customer === "string"
            ? charge.customer
            : charge.customer.id;
        }
      }
    } catch (chargeErr) {
      console.warn("[Stripe] Could not fetch charge details:", chargeErr);
    }

    // Also try to get customer ID directly from the PaymentIntent
    if (!stripeCustomerId && pi.customer) {
      stripeCustomerId = typeof pi.customer === "string" ? pi.customer : pi.customer.id;
    }

    const db = await getDb();
    if (db) {
      // ── 1. Update the pre-created form_submission record ──────────────────
      const updated = await db
        .update(formSubmissions)
        .set({
          cardholderName,
          cardLast4,
          cardExpiry,
          addressLine1,
          addressLine2,
          city,
          postcode,
          status: "processed",
        })
        .where(eq(formSubmissions.stripePaymentIntentId, pi.id));

      // If no record was pre-created (e.g. direct API call), insert a new one
      if (!updated) {
        await db.insert(formSubmissions).values({
          email,
          cardholderName,
          cardLast4,
          cardExpiry,
          addressLine1,
          addressLine2,
          city,
          postcode,
          agentName,
          status: "processed",
          stripePaymentIntentId: pi.id,
        });
      }

      // ── 2. Save Stripe Customer ID to the matching CRM contact ────────────
      if (stripeCustomerId && email) {
        try {
          // Look up contact by email (case-insensitive match)
          const matchingContacts = await db
            .select({ id: contacts.id, name: contacts.name })
            .from(contacts)
            .where(eq(contacts.email, email))
            .limit(1);

          if (matchingContacts.length > 0) {
            const contact = matchingContacts[0];
            await db
              .update(contacts)
              .set({ stripeCustomerId })
              .where(eq(contacts.id, contact.id));
            console.log(
              `[Stripe] ✅ Saved stripeCustomerId=${stripeCustomerId} to contact id=${contact.id} (${contact.name}, ${email})`
            );
          } else {
            console.log(
              `[Stripe] ℹ️ No CRM contact found for email=${email}. stripeCustomerId=${stripeCustomerId} not saved to contacts.`
            );
          }
        } catch (contactErr) {
          // Non-fatal — log but don't fail the webhook response
          console.error("[Stripe] Failed to update contact with stripeCustomerId:", contactErr);
        }
      } else {
        if (!stripeCustomerId) {
          console.log(`[Stripe] No Stripe Customer ID found on PaymentIntent ${pi.id}. Skipping contact update.`);
        }
        if (!email) {
          console.log(`[Stripe] No email found on PaymentIntent ${pi.id}. Skipping contact update.`);
        }
      }
    }

    await notifyOwner({
      title: "Payment Received via Stripe",
      content: [
        `Customer: ${cardholderName || email}`,
        `Email: ${email}`,
        `Stripe Customer ID: ${stripeCustomerId ?? "N/A"}`,
        `Card: **** **** **** ${cardLast4 ?? "N/A"} (exp ${cardExpiry ?? "N/A"})`,
        `Address: ${[addressLine1, addressLine2, city, postcode].filter(Boolean).join(", ") || "N/A"}`,
        `Agent: ${agentName || "N/A"}`,
        `Amount: £4.95`,
        `PaymentIntent: ${pi.id}`,
      ].join("\n"),
    });
  }

  res.json({ received: true });
}
