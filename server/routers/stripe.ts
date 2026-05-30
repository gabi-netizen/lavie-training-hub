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
});
