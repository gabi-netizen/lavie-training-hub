/**
 * Stripe tRPC Router
 *
 * Provides authenticated procedures for managing Stripe customers, subscriptions,
 * checkout sessions, payment methods, and audit log access.
 */
import { z } from "zod";
import Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { stripeCustomers, stripeAuditLog, contacts } from "../../drizzle/schema";
import { eq, desc, and, type SQL } from "drizzle-orm";
import {
  createCustomer,
  attachPaymentMethod,
  createSubscriptionSchedule,
  updateSubscriptionSchedule,
  cancelSubscription,
  createCheckoutSession,
  getCustomerPaymentMethods,
  getStripeClient,
  type SubscriptionPhase,
} from "../stripe/index";

// ─── Input Schemas ───────────────────────────────────────────────────────────

const subscriptionPhaseSchema = z.object({
  amount: z.number().int().positive(),
  interval: z.enum(["day", "week", "month", "year"]),
  intervalCount: z.number().int().positive().optional(),
  iterations: z.number().int().positive(),
  description: z.string().optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const stripeRouter = router({
  /**
   * Creates a Stripe Customer from an existing contact and saves the mapping.
   */
  createCustomerForContact: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Fetch the contact
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      // Check if already mapped
      const existing = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: true,
          stripeCustomerId: existing[0].stripeCustomerId,
          alreadyExisted: true,
        };
      }

      // Create Stripe customer
      const customer = await createCustomer(
        {
          email: contact.email ?? "",
          name: contact.name,
          phone: contact.phone ?? undefined,
          metadata: {
            contactId: String(contact.id),
            source: "lavie-training-hub",
          },
        },
        `create-customer-contact-${input.contactId}`
      );

      // Save mapping
      await db.insert(stripeCustomers).values({
        contactId: input.contactId,
        stripeCustomerId: customer.id,
      });

      // Also update the contact record with the Stripe customer ID
      await db
        .update(contacts)
        .set({ stripeCustomerId: customer.id })
        .where(eq(contacts.id, input.contactId));

      return {
        success: true,
        stripeCustomerId: customer.id,
        alreadyExisted: false,
      };
    }),

  /**
   * Creates a subscription schedule with flexible phases (variable amounts per phase).
   */
  createSubscription: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
        phases: z.array(subscriptionPhaseSchema).min(1),
        currency: z.string().length(3).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Look up the Stripe customer mapping
      const [mapping] = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (!mapping) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Contact does not have a Stripe customer. Create one first.",
        });
      }

      const schedule = await createSubscriptionSchedule(
        {
          customerId: mapping.stripeCustomerId,
          phases: input.phases as SubscriptionPhase[],
          currency: input.currency,
          defaultPaymentMethod: mapping.paymentMethodId ?? undefined,
          metadata: {
            contactId: String(input.contactId),
            source: "lavie-training-hub",
          },
        },
        `create-schedule-contact-${input.contactId}-${Date.now()}`
      );

      return {
        success: true,
        scheduleId: schedule.id,
        subscriptionId: typeof schedule.subscription === "string"
          ? schedule.subscription
          : schedule.subscription?.id ?? null,
      };
    }),

  /**
   * Creates a Stripe Checkout Session (payment link) for a contact.
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
        lineItems: z.array(
          z.object({
            amount: z.number().int().positive(),
            currency: z.string().length(3).optional(),
            name: z.string().min(1),
            quantity: z.number().int().positive().optional(),
          })
        ).min(1),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
        mode: z.enum(["payment", "subscription", "setup"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Look up the Stripe customer mapping
      const [mapping] = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (!mapping) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Contact does not have a Stripe customer. Create one first.",
        });
      }

      const session = await createCheckoutSession(
        {
          customerId: mapping.stripeCustomerId,
          lineItems: input.lineItems,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          mode: input.mode,
          metadata: {
            contactId: String(input.contactId),
            source: "lavie-training-hub",
          },
        },
        `checkout-contact-${input.contactId}-${Date.now()}`
      );

      return {
        success: true,
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Lists saved payment methods (cards) for a contact's Stripe customer.
   */
  getCustomerPaymentMethods: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [mapping] = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (!mapping) {
        return { paymentMethods: [] };
      }

      const methods = await getCustomerPaymentMethods(mapping.stripeCustomerId);

      return {
        paymentMethods: methods.map((pm: Stripe.PaymentMethod) => ({
          id: pm.id,
          brand: pm.card?.brand ?? "unknown",
          last4: pm.card?.last4 ?? "****",
          expMonth: pm.card?.exp_month ?? 0,
          expYear: pm.card?.exp_year ?? 0,
          isDefault: pm.id === mapping.paymentMethodId,
        })),
      };
    }),

  /**
   * Get card info by email — searches Stripe directly by customer email.
   * Fallback for contacts not in stripe_customers table.
   */
  getCardByEmail: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      if (!input.email) return { card: null };
      try {
        const stripe = getStripeClient();
        const customers = await stripe.customers.list({ email: input.email, limit: 1 });
        const cust = customers.data[0];
        if (!cust) return { card: null };
        const methods = await stripe.paymentMethods.list({ customer: cust.id, type: "card", limit: 1 });
        const pm = methods.data[0];
        if (!pm?.card) return { card: null };
        return {
          card: {
            brand: pm.card.brand ?? "unknown",
            last4: pm.card.last4 ?? "****",
            expMonth: pm.card.exp_month ?? 0,
            expYear: pm.card.exp_year ?? 0,
          },
        };
      } catch (err) {
        console.error("[Stripe] getCardByEmail error:", err);
        return { card: null };
      }
    }),

  /**
   * Updates the default payment method for a contact's Stripe customer.
   */
  updatePaymentMethod: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
        paymentMethodId: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [mapping] = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (!mapping) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Contact does not have a Stripe customer.",
        });
      }

      // Attach and set as default
      await attachPaymentMethod(
        mapping.stripeCustomerId,
        input.paymentMethodId,
        true,
        `update-pm-contact-${input.contactId}-${Date.now()}`
      );

      // Update our local mapping
      await db
        .update(stripeCustomers)
        .set({ paymentMethodId: input.paymentMethodId })
        .where(eq(stripeCustomers.contactId, input.contactId));

      return { success: true };
    }),

  /**
   * Cancels a subscription and logs the action.
   */
  cancelSubscription: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string().min(1),
        cancelAtPeriodEnd: z.boolean().optional(),
        contactId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await cancelSubscription(
        input.subscriptionId,
        input.cancelAtPeriodEnd ?? false,
        `cancel-sub-${input.subscriptionId}-${Date.now()}`
      );

      // Write to audit log
      const db = await getDb();
      if (db) {
        await db.insert(stripeAuditLog).values({
          eventId: `manual-cancel-${input.subscriptionId}-${Date.now()}`,
          eventType: "subscription.manually_cancelled",
          customerId: typeof result.customer === "string" ? result.customer : null,
          subscriptionId: result.id,
          status: "processed",
          metadata: {
            cancelledBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
            cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
            contactId: input.contactId,
          },
        });
      }

      return {
        success: true,
        subscriptionId: result.id,
        status: result.status,
        cancelAtPeriodEnd: result.cancel_at_period_end,
      };
    }),

  /**
   * Returns recent audit log entries. Admin only.
   */
  getAuditLog: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        eventType: z.string().optional(),
        customerId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;

      // Build dynamic where conditions
      const conditions: SQL[] = [];
      if (input.eventType) {
        conditions.push(eq(stripeAuditLog.eventType, input.eventType));
      }
      if (input.customerId) {
        conditions.push(eq(stripeAuditLog.customerId, input.customerId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await db
        .select()
        .from(stripeAuditLog)
        .where(whereClause)
        .orderBy(desc(stripeAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      return { entries, count: entries.length };
    }),

  /**
   * Updates the agent attribution on a subscription record.
   * Admin only — used for corrections or transfers.
   */
  updateSubscriptionAgent: adminProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
        agentName: z.string().min(1),
        agentEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Update local stripe_customers record
      const [mapping] = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.contactId, input.contactId))
        .limit(1);

      if (!mapping) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Stripe customer mapping found for this contact.",
        });
      }

      await db
        .update(stripeCustomers)
        .set({
          agentName: input.agentName,
          agentEmail: input.agentEmail,
        })
        .where(eq(stripeCustomers.contactId, input.contactId));

      // Also update Stripe subscription schedule metadata if one exists
      try {
        const stripe = getStripeClient();
        const schedules = await stripe.subscriptionSchedules.list({
          customer: mapping.stripeCustomerId,
          limit: 5,
        });

        // Update metadata on all active/not_started schedules
        for (const schedule of schedules.data) {
          if (schedule.status === "active" || schedule.status === "not_started") {
            await stripe.subscriptionSchedules.update(schedule.id, {
              metadata: {
                ...((schedule.metadata as Record<string, string>) ?? {}),
                agentName: input.agentName,
                agentEmail: input.agentEmail,
              },
            });
          }
        }
      } catch (err) {
        console.warn(`[Stripe] Could not update subscription metadata for contact ${input.contactId}:`, err);
        // Don't fail — local DB is already updated
      }

      return { success: true, agentName: input.agentName, agentEmail: input.agentEmail };
    }),

  /**
   * Generate CSV for Zoho Billing Stripe Customer Import.
   * Pulls customer + payment method + address from Stripe and returns CSV string.
   * Can generate for a single customer or all recent customers (today/this week).
   */
  generateZohoImportCsv: protectedProcedure
    .input(
      z.object({
        /** Single Stripe Customer ID — if provided, generates CSV for just this customer */
        stripeCustomerId: z.string().optional(),
        /** Or generate for all customers created in the last N days (default: 1 = today) */
        daysBack: z.number().int().min(1).max(30).optional(),
      })
    )
    .query(async ({ input }) => {
      const stripe = getStripeClient();
      let customers: Stripe.Customer[] = [];

      if (input.stripeCustomerId) {
        // Single customer
        const cust = await stripe.customers.retrieve(input.stripeCustomerId);
        if (!cust.deleted) customers = [cust as Stripe.Customer];
      } else {
        // All customers from last N days
        const daysBack = input.daysBack ?? 1;
        const since = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;
        const list = await stripe.customers.list({ created: { gte: since }, limit: 100 });
        customers = list.data.filter((c) => !c.deleted) as Stripe.Customer[];
      }

      if (customers.length === 0) {
        return { csv: "", count: 0 };
      }

      // CSV header matching Zoho Billing Stripe Customer Import format
      const headers = [
        "Customer ID",
        "Customer Email",
        "Stripe Customer ID",
        "Card Last Four Digits",
        "Name on Card",
        "Expiry Month",
        "Expiry Year",
        "Card Type",
        "Card Address Line1",
        "Card Address City",
        "Card Address State",
        "Address Country",
        "Card Address Zip",
      ];

      const rows: string[][] = [];

      for (const cust of customers) {
        // Get payment methods for this customer
        const pms = await stripe.paymentMethods.list({
          customer: cust.id,
          type: "card",
          limit: 1,
        });

        const pm = pms.data[0];
        const card = pm?.card;
        const billing = pm?.billing_details;
        const custAddress = cust.address;

        // Use billing_details address from PM, fallback to customer address
        const addr = billing?.address || custAddress;

        rows.push([
          cust.id, // Customer ID (Stripe cus_xxx)
          cust.email || "",
          cust.id, // Stripe Customer ID
          card?.last4 || "",
          billing?.name || cust.name || "",
          card?.exp_month?.toString().padStart(2, "0") || "",
          card?.exp_year?.toString() || "",
          card?.brand || "",
          addr?.line1 || "",
          addr?.city || "",
          addr?.state || "",
          addr?.country || "GB",
          addr?.postal_code || "",
        ]);
      }

      // Build CSV string
      const escapeCsv = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const csvLines = [
        headers.map(escapeCsv).join(","),
        ...rows.map((row) => row.map(escapeCsv).join(",")),
      ];

      return { csv: csvLines.join("\n"), count: rows.length };
    }),
});
