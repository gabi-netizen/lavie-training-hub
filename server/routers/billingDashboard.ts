/**
 * Billing Dashboard tRPC Router
 *
 * Admin-only endpoints for the /billing page.
 * Queries the local `client_subscriptions` and `stripe_audit_log` tables.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { clientSubscriptions, stripeAuditLog } from "../../drizzle/schema";
import { eq, like, or, and, desc, asc, sql, type SQL } from "drizzle-orm";

export const billingDashboardRouter = router({
  /**
   * getBillingSummary — returns counts and totals for the top summary cards row.
   */
  getBillingSummary: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return {
          scheduledCount: 0,
          activeSubsCount: 0,
          activeInstallmentsCount: 0,
          dueThisWeek: 0,
          failedCount: 0,
          revenueThisMonth: 0,
          totalCustomers: 0,
        };
      }

      const result = await db
        .select({
          scheduledCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('trial','future') THEN 1 ELSE 0 END)`,
          activeSubsCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.planType} = 'subscription' THEN 1 ELSE 0 END)`,
          activeInstallmentsCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.planType} = 'installment' THEN 1 ELSE 0 END)`,
          dueThisWeek: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.nextBillingOn} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)`,
          failedCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('dunning','unpaid') THEN 1 ELSE 0 END)`,
          revenueThisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${clientSubscriptions.lastBilledOn} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ${clientSubscriptions.status} = 'live' THEN CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
          totalCustomers: sql<number>`COUNT(DISTINCT ${clientSubscriptions.customerName})`,
        })
        .from(clientSubscriptions);

      const row = result[0];
      return {
        scheduledCount: Number(row?.scheduledCount ?? 0),
        activeSubsCount: Number(row?.activeSubsCount ?? 0),
        activeInstallmentsCount: Number(row?.activeInstallmentsCount ?? 0),
        dueThisWeek: Number(row?.dueThisWeek ?? 0),
        failedCount: Number(row?.failedCount ?? 0),
        revenueThisMonth: Number(row?.revenueThisMonth ?? 0),
        totalCustomers: Number(row?.totalCustomers ?? 0),
      };
    }),

  /**
   * getExtendedMetrics — returns data for the second row of cards:
   * Revenue Recovered, MRR Trend, Churn Metrics.
   */
  getExtendedMetrics: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return {
          revenueRecovered: 0,
          recoveredCount: 0,
          failedThisMonth: 0,
          recoveryRate: 0,
          mrrCurrent: 0,
          mrrPrevious: 0,
          mrrChangePercent: 0,
          involuntaryChurnCount: 0,
          voluntaryChurnCount: 0,
          totalActiveStartOfMonth: 0,
          involuntaryChurnPct: 0,
          voluntaryChurnPct: 0,
          totalChurnPct: 0,
        };
      }

      // Revenue Recovered: subscriptions that are currently 'live' but were 'dunning'/'unpaid' at some point this month
      // Approximation: live subs that have lastBilledOn this month (recovered payments)
      // For now we count live subs that were previously in dunning — we approximate by counting
      // live subs with lastBilledOn in current month that have amount > 0
      const recoveredResult = await db
        .select({
          revenueRecovered: sql<number>`COALESCE(SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.lastBilledOn} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
          recoveredCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.lastBilledOn} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END)`,
          failedThisMonth: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('dunning','unpaid') THEN 1 ELSE 0 END)`,
        })
        .from(clientSubscriptions);

      const recovered = recoveredResult[0];
      const failedCount = Number(recovered?.failedThisMonth ?? 0);
      const recoveredCount = Number(recovered?.recoveredCount ?? 0);
      const recoveryRate = failedCount + recoveredCount > 0
        ? Math.round((recoveredCount / (failedCount + recoveredCount)) * 100)
        : 0;

      // MRR: sum of amount for all live subscriptions (current month vs last month)
      const mrrResult = await db
        .select({
          mrrCurrent: sql<number>`COALESCE(SUM(CASE WHEN ${clientSubscriptions.status} = 'live' THEN CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        })
        .from(clientSubscriptions);

      // MRR previous month: approximate by counting subs that were active last month
      // (subs with activatedOn before start of current month and not cancelled before start of current month)
      const mrrPrevResult = await db
        .select({
          mrrPrevious: sql<number>`COALESCE(SUM(CASE WHEN ${clientSubscriptions.status} IN ('live','dunning','unpaid') AND ${clientSubscriptions.activatedOn} < DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        })
        .from(clientSubscriptions);

      const mrrCurrent = Number(mrrResult[0]?.mrrCurrent ?? 0);
      const mrrPrevious = Number(mrrPrevResult[0]?.mrrPrevious ?? 0);
      const mrrChangePercent = mrrPrevious > 0
        ? Math.round(((mrrCurrent - mrrPrevious) / mrrPrevious) * 1000) / 10
        : 0;

      // Churn Metrics: cancelled this month / total active
      const churnResult = await db
        .select({
          cancelledThisMonth: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('cancelled','canceled') AND ${clientSubscriptions.cancelledDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END)`,
          dunningCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('dunning','unpaid') THEN 1 ELSE 0 END)`,
          totalActive: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('live','dunning','unpaid') THEN 1 ELSE 0 END)`,
        })
        .from(clientSubscriptions);

      const churn = churnResult[0];
      const involuntaryChurnCount = Number(churn?.dunningCount ?? 0);
      const voluntaryChurnCount = Number(churn?.cancelledThisMonth ?? 0);
      const totalActive = Number(churn?.totalActive ?? 0);
      const involuntaryChurnPct = totalActive > 0
        ? Math.round((involuntaryChurnCount / totalActive) * 1000) / 10
        : 0;
      const voluntaryChurnPct = totalActive > 0
        ? Math.round((voluntaryChurnCount / totalActive) * 1000) / 10
        : 0;
      const totalChurnPct = Math.round((involuntaryChurnPct + voluntaryChurnPct) * 10) / 10;

      return {
        revenueRecovered: Number(recovered?.revenueRecovered ?? 0),
        recoveredCount,
        failedThisMonth: failedCount,
        recoveryRate,
        mrrCurrent,
        mrrPrevious,
        mrrChangePercent,
        involuntaryChurnCount,
        voluntaryChurnCount,
        totalActiveStartOfMonth: totalActive,
        involuntaryChurnPct,
        voluntaryChurnPct,
        totalChurnPct,
      };
    }),

  /**
   * getUpcomingCharges — paginated list sorted by nextBillingOn ASC.
   * Supports filters: status, agent (salesPerson), dateRange, search (name/email).
   * Includes progress (currentBillingCycle / billingCycles) for installments.
   */
  getUpcomingCharges: adminProcedure
    .input(
      z.object({
        status: z.string().optional(),
        planType: z.string().optional(),
        agent: z.string().optional(),
        search: z.string().optional(),
        dateRange: z.enum(["this_week", "next_7_days", "next_30_days", "this_month", "all"]).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(50),
        sortBy: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { rows: [], totalCount: 0, page: input.page, hasMore: false, uniqueAgents: [] };
      }

      const conditions: SQL[] = [];

      // Status filter
      if (input.status && input.status !== "all") {
        const statusVal = input.status.toLowerCase();
        if (statusVal === "cancelled") {
          conditions.push(
            or(
              eq(clientSubscriptions.status, "cancelled"),
              eq(clientSubscriptions.status, "canceled")
            )!
          );
        } else {
          conditions.push(eq(clientSubscriptions.status, statusVal));
        }
      }

      // Plan type filter
      if (input.planType && input.planType !== "all") {
        conditions.push(eq(clientSubscriptions.planType, input.planType as "installment" | "subscription" | "one_payment"));
      }

      // Agent filter
      if (input.agent && input.agent !== "all") {
        conditions.push(eq(clientSubscriptions.salesPerson, input.agent));
      }

      // Search filter (name or email)
      if (input.search) {
        const searchTerm = `%${input.search}%`;
        conditions.push(
          or(
            like(clientSubscriptions.customerName, searchTerm),
            like(clientSubscriptions.email, searchTerm)
          )!
        );
      }

      // Date range filter (for nextBillingOn)
      if (input.dateRange && input.dateRange !== "all") {
        switch (input.dateRange) {
          case "this_week":
            conditions.push(sql`${clientSubscriptions.nextBillingOn} >= CURDATE()`);
            conditions.push(sql`${clientSubscriptions.nextBillingOn} <= DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)`);
            break;
          case "next_7_days":
            conditions.push(sql`${clientSubscriptions.nextBillingOn} >= CURDATE()`);
            conditions.push(sql`${clientSubscriptions.nextBillingOn} <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`);
            break;
          case "next_30_days":
            conditions.push(sql`${clientSubscriptions.nextBillingOn} >= CURDATE()`);
            conditions.push(sql`${clientSubscriptions.nextBillingOn} <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`);
            break;
          case "this_month":
            conditions.push(sql`${clientSubscriptions.nextBillingOn} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`);
            conditions.push(sql`${clientSubscriptions.nextBillingOn} <= LAST_DAY(CURDATE())`);
            break;
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clientSubscriptions)
        .where(whereClause);
      const totalCount = Number(countResult[0]?.count ?? 0);

      // Determine sort
      const offset = (input.page - 1) * input.limit;
      const sortDirection = input.sortDir === "desc" ? desc : asc;
      let orderByCol: any = clientSubscriptions.nextBillingOn;
      switch (input.sortBy) {
        case "customerName": orderByCol = clientSubscriptions.customerName; break;
        case "email": orderByCol = clientSubscriptions.email; break;
        case "salesPerson": orderByCol = clientSubscriptions.salesPerson; break;
        case "amount": orderByCol = clientSubscriptions.amount; break;
        case "status": orderByCol = clientSubscriptions.status; break;
        case "planType": orderByCol = clientSubscriptions.planType; break;
        case "currentBillingCycle": orderByCol = clientSubscriptions.currentBillingCycle; break;
        case "nextBillingOn": orderByCol = clientSubscriptions.nextBillingOn; break;
        default: orderByCol = clientSubscriptions.nextBillingOn; break;
      }

      // Get paginated results
      const rows = await db
        .select({
          subscriptionId: clientSubscriptions.subscriptionId,
          customerName: clientSubscriptions.customerName,
          email: clientSubscriptions.email,
          salesPerson: clientSubscriptions.salesPerson,
          amount: clientSubscriptions.amount,
          nextBillingOn: clientSubscriptions.nextBillingOn,
          status: clientSubscriptions.status,
          planType: clientSubscriptions.planType,
          currentBillingCycle: clientSubscriptions.currentBillingCycle,
          billingCycles: clientSubscriptions.billingCycles,
          contactId: clientSubscriptions.contactId,
        })
        .from(clientSubscriptions)
        .where(whereClause)
        .orderBy(sortDirection(orderByCol))
        .limit(input.limit)
        .offset(offset);

      // Get unique agents for the filter dropdown
      const agentRows = await db
        .selectDistinct({ salesPerson: clientSubscriptions.salesPerson })
        .from(clientSubscriptions);
      const uniqueAgents = agentRows
        .map((r) => r.salesPerson)
        .filter((a): a is string => !!a && a.trim() !== "")
        .sort();

      // Map rows with calculated daysUntilCharge and progress
      const mappedRows = rows.map((row) => {
        let daysUntilCharge: number | null = null;
        if (row.nextBillingOn) {
          const nextDate = new Date(String(row.nextBillingOn));
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          nextDate.setHours(0, 0, 0, 0);
          daysUntilCharge = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
          subscriptionId: row.subscriptionId,
          customerName: row.customerName,
          email: row.email || "",
          salesPerson: row.salesPerson || "",
          amount: row.amount ? parseFloat(String(row.amount)) : 0,
          nextBillingOn: row.nextBillingOn ? String(row.nextBillingOn) : null,
          status: row.status,
          planType: row.planType,
          currentBillingCycle: row.currentBillingCycle,
          billingCycles: row.billingCycles,
          daysUntilCharge,
          contactId: row.contactId ?? null,
        };
      });

      return {
        rows: mappedRows,
        totalCount,
        page: input.page,
        hasMore: offset + input.limit < totalCount,
        uniqueAgents,
      };
    }),

  /**
   * getRecentActivity — last 20 entries from stripe_audit_log ordered by createdAt DESC.
   */
  getRecentActivity: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return { entries: [] };
      }

      const entries = await db
        .select()
        .from(stripeAuditLog)
        .orderBy(desc(stripeAuditLog.createdAt))
        .limit(20);

      return {
        entries: entries.map((e) => ({
          id: e.id,
          eventId: e.eventId,
          eventType: e.eventType,
          customerId: e.customerId,
          subscriptionId: e.subscriptionId,
          amount: e.amount,
          currency: e.currency,
          status: e.status,
          createdAt: e.createdAt ? e.createdAt.toISOString() : null,
        })),
      };
    }),

  /**
   * getQuickStats — returns quick stats for the bottom right panel.
   */
  getQuickStats: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return {
          totalCustomers: 0,
          avgRevenuePerCustomer: 0,
          paymentSuccessRate: 0,
          successCount: 0,
          totalPayments: 0,
        };
      }

      const result = await db
        .select({
          totalCustomers: sql<number>`COUNT(DISTINCT ${clientSubscriptions.customerName})`,
          avgAmount: sql<number>`COALESCE(AVG(CASE WHEN ${clientSubscriptions.status} = 'live' THEN CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) ELSE NULL END), 0)`,
          liveCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' THEN 1 ELSE 0 END)`,
          totalCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} IN ('live','dunning','unpaid') THEN 1 ELSE 0 END)`,
        })
        .from(clientSubscriptions);

      const row = result[0];
      const liveCount = Number(row?.liveCount ?? 0);
      const totalCount = Number(row?.totalCount ?? 0);
      const successRate = totalCount > 0 ? Math.round((liveCount / totalCount) * 100) : 0;

      return {
        totalCustomers: Number(row?.totalCustomers ?? 0),
        avgRevenuePerCustomer: Math.round(Number(row?.avgAmount ?? 0) * 100) / 100,
        paymentSuccessRate: successRate,
        successCount: liveCount,
        totalPayments: totalCount,
      };
    }),
});
