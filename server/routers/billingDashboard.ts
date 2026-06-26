/**
 * Billing Dashboard tRPC Router
 *
 * Admin-only endpoints for the /billing page.
 * Queries the local `client_subscriptions` and `stripe_audit_log` tables.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { clientSubscriptions, stripeAuditLog, billingNotes, shipments, contacts } from "../../drizzle/schema";
import { eq, like, or, and, desc, asc, sql, inArray, type SQL } from "drizzle-orm";
import { syncMintsoftShipments } from "../scripts/syncMintsoftShipments";

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
          activeSubsCount: sql<number>`SUM(CASE WHEN ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.planType} = 'subscription' AND CAST(${clientSubscriptions.amount} AS DECIMAL(10,2)) > 4.95 AND ${clientSubscriptions.planName} NOT LIKE '%stall%' AND ${clientSubscriptions.planName} NOT REGEXP '^[0-9]+ [Dd]ays' AND (${clientSubscriptions.campaignId} IS NULL OR ${clientSubscriptions.campaignId} NOT LIKE '%INSTALLM%') THEN 1 ELSE 0 END)`,
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
          id: clientSubscriptions.id,
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
          id: row.id,
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
   * getFailedPayments — returns dunning/unpaid subscriptions for the Failed Payments table.
   */
  getFailedPayments: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return { rows: [], totalCount: 0 };
      }

      const rows = await db
        .select({
          subscriptionId: clientSubscriptions.subscriptionId,
          customerName: clientSubscriptions.customerName,
          email: clientSubscriptions.email,
          amount: clientSubscriptions.amount,
          status: clientSubscriptions.status,
          nextBillingOn: clientSubscriptions.nextBillingOn,
          currentBillingCycle: clientSubscriptions.currentBillingCycle,
          billingCycles: clientSubscriptions.billingCycles,
          salesPerson: clientSubscriptions.salesPerson,
        })
        .from(clientSubscriptions)
        .where(
          or(
            eq(clientSubscriptions.status, "dunning"),
            eq(clientSubscriptions.status, "unpaid")
          )
        )
        .orderBy(asc(clientSubscriptions.nextBillingOn))
        .limit(50);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clientSubscriptions)
        .where(
          or(
            eq(clientSubscriptions.status, "dunning"),
            eq(clientSubscriptions.status, "unpaid")
          )
        );
      const totalCount = Number(countResult[0]?.count ?? 0);

      const mappedRows = rows.map((row) => {
        let daysUntilRetry: number | null = null;
        if (row.nextBillingOn) {
          const nextDate = new Date(String(row.nextBillingOn));
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          nextDate.setHours(0, 0, 0, 0);
          daysUntilRetry = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
          subscriptionId: row.subscriptionId,
          customerName: row.customerName,
          email: row.email || "",
          amount: row.amount ? parseFloat(String(row.amount)) : 0,
          status: row.status,
          nextBillingOn: row.nextBillingOn ? String(row.nextBillingOn) : null,
          failureReason: row.status === "dunning" ? "Insufficient funds" : "Card declined",
          daysUntilRetry,
          salesPerson: row.salesPerson || "",
        };
      });

      return { rows: mappedRows, totalCount };
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
          nextBatchDate: null as string | null,
          nextBatchCustomers: 0,
          nextBatchAmount: 0,
          avgDaysBetweenCharge: 0,
          installmentPlans: [] as { name: string; current: number; total: number }[],
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

      // Next Batch Charge
      const nextBatchResult = await db
        .select({
          nextDate: sql<string>`MIN(${clientSubscriptions.nextBillingOn})`,
        })
        .from(clientSubscriptions)
        .where(sql`${clientSubscriptions.status} IN ('live','scheduled') AND ${clientSubscriptions.nextBillingOn} >= CURDATE()`);

      const nextDate = nextBatchResult[0]?.nextDate ?? null;
      let nextBatchCustomers = 0;
      let nextBatchAmount = 0;

      if (nextDate) {
        const batchResult = await db
          .select({
            count: sql<number>`COUNT(*)`,
            total: sql<number>`COALESCE(SUM(CAST(${clientSubscriptions.amount} AS DECIMAL(10,2))), 0)`,
          })
          .from(clientSubscriptions)
          .where(sql`${clientSubscriptions.nextBillingOn} = ${nextDate} AND ${clientSubscriptions.status} IN ('live','scheduled')`);
        nextBatchCustomers = Number(batchResult[0]?.count ?? 0);
        nextBatchAmount = Math.round(Number(batchResult[0]?.total ?? 0) * 100) / 100;
      }

      // Avg Days Between Charge
      const avgDaysResult = await db
        .select({
          avgDays: sql<number>`COALESCE(AVG(DATEDIFF(${clientSubscriptions.nextBillingOn}, CURDATE())), 0)`,
        })
        .from(clientSubscriptions)
        .where(sql`${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.nextBillingOn} >= CURDATE()`);
      const avgDaysBetweenCharge = Math.round(Number(avgDaysResult[0]?.avgDays ?? 0) * 10) / 10;

      // Installment Plans (in progress)
      const installmentResult = await db
        .select({
          customerName: clientSubscriptions.customerName,
          currentBillingCycle: clientSubscriptions.currentBillingCycle,
          billingCycles: clientSubscriptions.billingCycles,
        })
        .from(clientSubscriptions)
        .where(sql`${clientSubscriptions.planType} = 'installment' AND ${clientSubscriptions.status} = 'live' AND ${clientSubscriptions.billingCycles} > 0 AND ${clientSubscriptions.currentBillingCycle} < ${clientSubscriptions.billingCycles}`)
        .orderBy(sql`${clientSubscriptions.nextBillingOn} ASC`)
        .limit(4);

      const installmentPlans = installmentResult.map((r) => ({
        name: r.customerName ?? "Unknown",
        current: Number(r.currentBillingCycle ?? 0),
        total: Number(r.billingCycles ?? 0),
      }));

      return {
        totalCustomers: Number(row?.totalCustomers ?? 0),
        avgRevenuePerCustomer: Math.round(Number(row?.avgAmount ?? 0) * 100) / 100,
        paymentSuccessRate: successRate,
        successCount: liveCount,
        totalPayments: totalCount,
        nextBatchDate: nextDate,
        nextBatchCustomers,
        nextBatchAmount,
        avgDaysBetweenCharge,
        installmentPlans,
      };
    }),

  /**
   * getCustomerDetail — returns full subscription detail for a customer + all their other subscriptions + payment history.
   * Input: { id: number } — the client_subscriptions row id.
   */
  getCustomerDetail: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Fetch the primary subscription row by id
      const [primary] = await db
        .select()
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.id, input.id))
        .limit(1);

      if (!primary) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
      }

      // Fetch all subscriptions for the same customer (by customerName or email)
      const conditions: SQL[] = [];
      if (primary.customerName) {
        conditions.push(eq(clientSubscriptions.customerName, primary.customerName));
      }
      if (primary.email) {
        conditions.push(eq(clientSubscriptions.email, primary.email));
      }

      const allSubscriptions = await db
        .select()
        .from(clientSubscriptions)
        .where(conditions.length > 0 ? or(...conditions) : eq(clientSubscriptions.id, input.id))
        .orderBy(desc(clientSubscriptions.activatedOn));

      // Collect all subscriptionIds for payment history lookup
      const subscriptionIds = allSubscriptions
        .map((s) => s.subscriptionId)
        .filter((id): id is string => !!id);

      // Fetch payment history from stripe_audit_log
      let payments: any[] = [];
      if (subscriptionIds.length > 0) {
        payments = await db
          .select()
          .from(stripeAuditLog)
          .where(inArray(stripeAuditLog.subscriptionId, subscriptionIds))
          .orderBy(desc(stripeAuditLog.createdAt))
          .limit(100);
      }

      // Map data for the frontend
      const mapSubscription = (s: typeof primary) => ({
        id: s.id,
        subscriptionId: s.subscriptionId,
        planName: s.planName,
        planType: s.planType,
        customerName: s.customerName,
        email: s.email,
        phone: s.phone,
        amount: s.amount ? parseFloat(String(s.amount)) : 0,
        setupFee: s.setupFee ? parseFloat(String(s.setupFee)) : 0,
        recurringAmount: s.recurringAmount ? parseFloat(String(s.recurringAmount)) : 0,
        totalAmount: s.totalAmount ? parseFloat(String(s.totalAmount)) : 0,
        billingCycles: s.billingCycles,
        currentBillingCycle: s.currentBillingCycle,
        cyclesCompleted: s.cyclesCompleted,
        nextBillingOn: s.nextBillingOn ? String(s.nextBillingOn) : null,
        lastBilledOn: s.lastBilledOn ? String(s.lastBilledOn) : null,
        subscriptionNumber: s.subscriptionNumber,
        status: s.status,
        campaignId: s.campaignId,
        activatedOn: s.activatedOn ? String(s.activatedOn) : null,
        createdOn: s.createdOn ? String(s.createdOn) : null,
        cancelledDate: s.cancelledDate ? String(s.cancelledDate) : null,
        salesPerson: s.salesPerson,
        products: s.products,
        contactId: s.contactId,
        callbackAt: s.callbackAt ? s.callbackAt.toISOString() : null,
        callbackNote: s.callbackNote,
        retentionAgent: s.retentionAgent,
      });

      // Fetch card data from contacts table by email
      let cardData: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } = { brand: null, last4: null, expMonth: null, expYear: null };
      if (primary.email) {
        const [contact] = await db
          .select({
            cardBrand: contacts.cardBrand,
            cardLast4: contacts.cardLast4,
            cardExpMonth: contacts.cardExpMonth,
            cardExpYear: contacts.cardExpYear,
          })
          .from(contacts)
          .where(eq(contacts.email, primary.email))
          .limit(1);
        if (contact) {
          cardData = { brand: contact.cardBrand, last4: contact.cardLast4, expMonth: contact.cardExpMonth, expYear: contact.cardExpYear };
        }
      }

      return {
        primary: mapSubscription(primary),
        allSubscriptions: allSubscriptions.map(mapSubscription),
        cardData,
        payments: payments.map((p) => ({
          id: p.id,
          eventId: p.eventId,
          eventType: p.eventType,
          customerId: p.customerId,
          subscriptionId: p.subscriptionId,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          metadata: p.metadata,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        })),
      };
    }),

  /**
   * getBillingNotes — returns all notes for a given subscription (by client_subscriptions.id).
   */
  getBillingNotes: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { notes: [] };

      const notes = await db
        .select()
        .from(billingNotes)
        .where(eq(billingNotes.subscriptionId, input.subscriptionId))
        .orderBy(desc(billingNotes.createdAt));

      return {
        notes: notes.map((n) => ({
          id: n.id,
          subscriptionId: n.subscriptionId,
          customerName: n.customerName,
          agentName: n.agentName,
          note: n.note,
          createdAt: n.createdAt ? n.createdAt.toISOString() : null,
        })),
      };
    }),

  /**
   * addBillingNote — inserts a new note for a subscription.
   */
  addBillingNote: protectedProcedure
    .input(z.object({
      subscriptionId: z.number(),
      customerName: z.string().optional(),
      agentName: z.string(),
      note: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      await db.insert(billingNotes).values({
        subscriptionId: input.subscriptionId,
        customerName: input.customerName ?? null,
        agentName: input.agentName,
        note: input.note,
      });

      return { success: true };
    }),

  /**
   * getShipmentHistory — reads shipment history from local DB (synced from Mintsoft).
   * Same response format as before so the frontend doesn't break.
   */
  getShipmentHistory: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(shipments)
        .where(eq(shipments.customerEmail, input.email.toLowerCase().trim()))
        .orderBy(desc(shipments.orderDate));

      return rows.map((row: any) => ({
        orderNumber: row.orderNumber,
        orderDate: row.orderDate ?? null,
        despatchDate: row.despatchDate ?? null,
        deliveryDate: row.deliveryDate ?? null,
        status: row.status ?? "Unknown",
        courierService: row.courier ?? "",
        trackingNumber: row.trackingNumber ?? null,
        trackingUrl: row.trackingUrl ?? null,
        totalItems: row.numberOfItems ?? 0,
        orderValue: row.orderValue ? Number(row.orderValue) : 0,
        items: Array.isArray(row.items)
          ? (row.items as Array<{ sku: string; quantity: number; price: number }>)
          : [],
      }));
    }),

  /**
   * getLastShipmentBatch — given a list of customer emails, returns the most recent
   * non-cancelled shipment for each email. Used by the Billing Dashboard table to
   * show a "Last Shipment" column without N+1 queries.
   *
   * Returns a map: { [email]: { orderDate, status, orderNumber } | null }
   */
  getLastShipmentBatch: adminProcedure
    .input(z.object({ emails: z.array(z.string()).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};

      const normalised = input.emails
        .map((e) => e.toLowerCase().trim())
        .filter(Boolean);

      if (normalised.length === 0) return {};

      // For each email, fetch the most recent non-cancelled shipment via a
      // single query using ROW_NUMBER() window function.
      const rows = await db.execute(
        sql`
          SELECT customerEmail, orderDate, status, orderNumber
          FROM (
            SELECT
              customerEmail,
              orderDate,
              status,
              orderNumber,
              ROW_NUMBER() OVER (
                PARTITION BY customerEmail
                ORDER BY orderDate DESC
              ) AS rn
            FROM shipments
            WHERE customerEmail IN (${sql.join(normalised.map((e) => sql`${e}`), sql`, `)})
              AND status != 'cancelled'
          ) ranked
          WHERE rn = 1
        `
      );

      const result: Record<string, { orderDate: string; status: string; orderNumber: string } | null> = {};
      for (const email of normalised) {
        result[email] = null;
      }
      for (const row of rows as any[]) {
        const email = String(row.customerEmail ?? "").toLowerCase().trim();
        if (email) {
          result[email] = {
            orderDate: row.orderDate ? String(row.orderDate) : "",
            status: row.status ?? "",
            orderNumber: row.orderNumber ?? "",
          };
        }
      }
      return result;
    }),

  /**
   * syncShipments — admin-only endpoint that triggers a full Mintsoft → DB sync.
   */
  syncShipments: adminProcedure
    .input(z.object({}).optional())
    .mutation(async () => {
      const result = await syncMintsoftShipments();
      return result;
    }),

  /**
   * getCardExpiry — returns counts of contacts with expiring cards who have an
   * active subscription (status='live' in client_subscriptions).
   *
   * Returns:
   *   expireThisMonth: contacts whose card expires this calendar month AND have a live sub
   *   expireNextMonth: same but for next calendar month
   */
  getCardExpiry: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return { expireThisMonth: 0, expireNextMonth: 0 };
      }

      // Current month / year
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth() + 1; // 1-based

      // Next month / year (handle December → January wrap)
      const nextMonthDate = new Date(thisYear, now.getMonth() + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth() + 1;

      // Count contacts that:
      //   1. Have cardExpYear / cardExpMonth matching the target period
      //   2. Have at least one live subscription (joined via email, case-insensitive)
      const result = await db
        .select({
          expireThisMonth: sql<number>`SUM(CASE WHEN
            ${contacts.cardExpYear} = ${thisYear}
            AND ${contacts.cardExpMonth} = ${thisMonth}
            AND EXISTS (
              SELECT 1 FROM client_subscriptions cs
              WHERE LOWER(cs.email) = LOWER(${contacts.email})
              AND cs.status = 'live'
            )
          THEN 1 ELSE 0 END)`,
          expireNextMonth: sql<number>`SUM(CASE WHEN
            ${contacts.cardExpYear} = ${nextYear}
            AND ${contacts.cardExpMonth} = ${nextMonth}
            AND EXISTS (
              SELECT 1 FROM client_subscriptions cs
              WHERE LOWER(cs.email) = LOWER(${contacts.email})
              AND cs.status = 'live'
            )
          THEN 1 ELSE 0 END)`,
        })
        .from(contacts)
        .where(
          and(
            sql`${contacts.cardExpYear} IS NOT NULL`,
            sql`${contacts.cardExpMonth} IS NOT NULL`,
            sql`${contacts.email} IS NOT NULL`,
          )
        );

      const row = result[0];
      return {
        expireThisMonth: Number(row?.expireThisMonth ?? 0),
        expireNextMonth: Number(row?.expireNextMonth ?? 0),
      };
    }),

  /**
   * getCardExpiryCustomers — returns the list of customers whose cards are
   * expiring this month or next month and who have at least one live subscription.
   *
   * Input:
   *   period: "this_month" | "next_month"
   *
   * Returns an array of customer objects with card and subscription details.
   */
  getCardExpiryCustomers: adminProcedure
    .input(
      z.object({
        period: z.enum(["this_month", "next_month"]),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth() + 1;

      const nextMonthDate = new Date(thisYear, now.getMonth() + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth() + 1;

      const targetYear = input.period === "this_month" ? thisYear : nextYear;
      const targetMonth = input.period === "this_month" ? thisMonth : nextMonth;

      // Fetch contacts whose card expires in the target period and have a live subscription
      const contactRows = await db
        .select({
          name: contacts.name,
          email: contacts.email,
          cardLast4: contacts.cardLast4,
          cardBrand: contacts.cardBrand,
          cardExpMonth: contacts.cardExpMonth,
          cardExpYear: contacts.cardExpYear,
        })
        .from(contacts)
        .where(
          and(
            sql`${contacts.cardExpYear} = ${targetYear}`,
            sql`${contacts.cardExpMonth} = ${targetMonth}`,
            sql`${contacts.email} IS NOT NULL`,
            sql`EXISTS (
              SELECT 1 FROM client_subscriptions cs
              WHERE LOWER(cs.email) = LOWER(${contacts.email})
              AND cs.status = 'live'
            )`,
          )
        );

      // For each contact, fetch their live subscription details
      const results = await Promise.all(
        contactRows.map(async (contact) => {
          const subs = await db
            .select({
              salesPerson: clientSubscriptions.salesPerson,
              amount: clientSubscriptions.amount,
              planName: clientSubscriptions.planName,
            })
            .from(clientSubscriptions)
            .where(
              and(
                sql`LOWER(${clientSubscriptions.email}) = LOWER(${contact.email})`,
                eq(clientSubscriptions.status, "live"),
              )
            )
            .limit(1);

          const sub = subs[0];
          const planName = sub?.planName ?? "";
          const planType = planName.toLowerCase().includes("installment")
            ? "Installment"
            : "Subscription";

          return {
            customerName: contact.name ?? "",
            email: contact.email ?? "",
            cardLast4: contact.cardLast4 ?? "",
            cardBrand: contact.cardBrand ?? "",
            cardExpMonth: contact.cardExpMonth ?? null,
            cardExpYear: contact.cardExpYear ?? null,
            agent: sub?.salesPerson ?? "",
            amount: sub?.amount ? parseFloat(String(sub.amount)) : null,
            planType,
          };
        })
      );

      return results;
    }),
});
