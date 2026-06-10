/**
 * Client Subscriptions tRPC Router
 *
 * Provides endpoints for the "My Clients" tab in the Retention Workspace.
 * Includes filtered listing with pagination, summary counts, and admin import.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { clientSubscriptions, contacts } from "../../drizzle/schema";
import { eq, like, or, and, sql, desc, asc, gte, lte, isNull, isNotNull } from "drizzle-orm";
import {
  importClientSubscriptionsData,
  linkClientSubscriptionsToContacts,
  ClientSubscriptionImportRow,
} from "../importClientSubscriptions";

export const clientSubscriptionsRouter = router({
  /**
   * Get client subscriptions with filters, pagination, and summary counts.
   */
  getClientSubscriptions: protectedProcedure
    .input(
      z.object({
        salesPerson: z.string(),
        search: z.string().optional(),
        status: z.string().optional(),
        planType: z.enum(["installment", "subscription", "one_payment"]).optional(),
        nextBillingRange: z.enum(["this_week", "this_month", "overdue"]).optional(),
        activatedRange: z.enum(["this_month", "last_month", "last_3_months"]).optional(),
        amountMin: z.number().optional(),
        amountMax: z.number().optional(),
        page: z.number().default(1),
        perPage: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          subscriptions: [],
          summary: { total: 0, live: 0, dunning: 0, cancelled: 0, billingThisWeek: 0 },
          totalCount: 0,
          page: input.page,
          perPage: input.perPage,
        };
      }

      // Build conditions
      const conditions: any[] = [
        eq(clientSubscriptions.salesPerson, input.salesPerson),
      ];

      if (input.search) {
        const searchTerm = `%${input.search}%`;
        conditions.push(
          or(
            like(clientSubscriptions.customerName, searchTerm),
            like(clientSubscriptions.email, searchTerm)
          )
        );
      }

      if (input.status) {
        conditions.push(eq(clientSubscriptions.status, input.status));
      }

      if (input.planType) {
        conditions.push(eq(clientSubscriptions.planType, input.planType));
      }

      if (input.amountMin !== undefined) {
        conditions.push(gte(clientSubscriptions.amount, String(input.amountMin)));
      }

      if (input.amountMax !== undefined) {
        conditions.push(lte(clientSubscriptions.amount, String(input.amountMax)));
      }

      // Activated date range filter
      if (input.activatedRange) {
        const now = new Date();
        if (input.activatedRange === "this_month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          conditions.push(gte(clientSubscriptions.activatedOn, startOfMonth));
        } else if (input.activatedRange === "last_month") {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
          conditions.push(gte(clientSubscriptions.activatedOn, startOfLastMonth));
          conditions.push(lte(clientSubscriptions.activatedOn, endOfLastMonth));
        } else if (input.activatedRange === "last_3_months") {
          const start3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          conditions.push(gte(clientSubscriptions.activatedOn, start3Months));
        }
      }

      // Next billing range filter
      if (input.nextBillingRange) {
        const now = new Date();
        if (input.nextBillingRange === "overdue") {
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          conditions.push(lte(clientSubscriptions.nextBillingOn, today));
          conditions.push(isNotNull(clientSubscriptions.nextBillingOn));
        } else if (input.nextBillingRange === "this_week") {
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(today);
          endOfWeek.setDate(endOfWeek.getDate() + 7);
          conditions.push(gte(clientSubscriptions.nextBillingOn, today));
          conditions.push(lte(clientSubscriptions.nextBillingOn, endOfWeek));
        } else if (input.nextBillingRange === "this_month") {
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          conditions.push(gte(clientSubscriptions.nextBillingOn, today));
          conditions.push(lte(clientSubscriptions.nextBillingOn, endOfMonth));
        }
      }

      const whereClause = and(...conditions);

      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clientSubscriptions)
        .where(whereClause);
      const totalCount = countResult[0]?.count ?? 0;

      // Get paginated results
      const offset = (input.page - 1) * input.perPage;
      const subscriptionRows = await db
        .select()
        .from(clientSubscriptions)
        .where(whereClause)
        .orderBy(desc(clientSubscriptions.id))
        .limit(input.perPage)
        .offset(offset);

      // Get summary counts (always for the full agent, not filtered)
      const agentCondition = eq(clientSubscriptions.salesPerson, input.salesPerson);

      const summaryResult = await db
        .select({
          total: sql<number>`COUNT(*)`,
          live: sql<number>`SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END)`,
          dunning: sql<number>`SUM(CASE WHEN status = 'dunning' THEN 1 ELSE 0 END)`,
          cancelled: sql<number>`SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(clientSubscriptions)
        .where(agentCondition);

      // Billing this week count
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const billingWeekResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clientSubscriptions)
        .where(
          and(
            agentCondition,
            gte(clientSubscriptions.nextBillingOn, today),
            lte(clientSubscriptions.nextBillingOn, endOfWeek)
          )
        );

      const summary = {
        total: summaryResult[0]?.total ?? 0,
        live: summaryResult[0]?.live ?? 0,
        dunning: summaryResult[0]?.dunning ?? 0,
        cancelled: summaryResult[0]?.cancelled ?? 0,
        billingThisWeek: billingWeekResult[0]?.count ?? 0,
      };

      return {
        subscriptions: subscriptionRows,
        summary,
        totalCount,
        page: input.page,
        perPage: input.perPage,
      };
    }),

  /**
   * Get subscriptions for a specific contact (by contactId).
   * Used in the ContactCard to show subscription data.
   */
  getByContactId: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.contactId, input.contactId))
        .orderBy(desc(clientSubscriptions.id));
    }),

  /**
   * Get subscriptions by email (fallback when no contactId link exists).
   * Used in ContactCard when the contact has an email.
   */
  getByEmail: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.email, input.email.toLowerCase()))
        .orderBy(desc(clientSubscriptions.id));
    }),

  /**
   * Admin endpoint to import subscription data (JSON array).
   * Accepts parsed subscription records for bulk import.
   */
  importClientSubscriptions: adminProcedure
    .input(
      z.object({
        data: z.array(
          z.object({
            subscriptionId: z.string(),
            planName: z.string().nullable(),
            planType: z.enum(["installment", "subscription", "one_payment"]),
            customerName: z.string(),
            email: z.string().nullable(),
            amount: z.number().nullable(),
            recurringAmount: z.number().nullable(),
            totalAmount: z.number().nullable(),
            billingCycles: z.number().nullable(),
            cyclesCompleted: z.number().nullable(),
            nextBillingOn: z.string().nullable(),
            subscriptionNumber: z.string().nullable(),
            status: z.string(),
            campaignId: z.string().nullable(),
            activatedOn: z.string().nullable(),
            salesPerson: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const result = await importClientSubscriptionsData(input.data);
      // Auto-link to contacts after import
      await linkClientSubscriptionsToContacts();
      return result;
    }),
});
