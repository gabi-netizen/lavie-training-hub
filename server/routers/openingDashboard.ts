/**
 * Opening Dashboard tRPC Router
 *
 * Provides endpoints for the Opening Dashboard:
 * 1. getAgentData — Returns aggregated agent performance data for a given month
 * 2. getCustomersByClassification — Returns customers for a classification across all agents
 * 3. getCustomerDetails — Returns individual customer names for a specific agent/classification
 * 4. getAvailableMonths — Returns months that have data in the opening_trials table
 *
 * Reads from: opening_trials, agent_working_days tables.
 *
 * Date range filter: filters by the `created_date` column (when the trial was created in Zoho).
 * Supported values: "all" | "today" | "yesterday" | "last_7_days" | "this_month" | "last_month"
 * The date range filter works in conjunction with the month filter (AND logic).
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { openingTrials, agentWorkingDays } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentDetail {
  agentName: string;
  trials: number;
  stillInTrial: number;
  matured: number;
  live: number;
  saved: number;
  cancelledAfterPayment: number;
  cancelledBeforePayment: number;
  dunning: number;
  futureDeal: number;
  workingDays: number;
}

interface CustomerDetail {
  subscriptionId: string;
  customerName: string | null;
  planName: string | null;
  createdDate: string;
  status: string;
  classification: string;
}

// ─── Date Range Enum ──────────────────────────────────────────────────────────

export const DATE_RANGE_OPTIONS = [
  "all",
  "today",
  "yesterday",
  "last_7_days",
  "this_month",
  "last_month",
] as const;

export type DateRangeOption = (typeof DATE_RANGE_OPTIONS)[number];

// ─── Date Range Helper ────────────────────────────────────────────────────────

/**
 * Returns a { from, to } date range for the given option.
 * Dates are returned as Date objects (start-of-day / end-of-day) for Drizzle's
 * MySqlDate column comparisons (which expect Date | SQLWrapper).
 * Returns null if the option is "all" (no date filtering needed).
 */
function getDateRange(range: DateRangeOption): { from: Date; to: Date } | null {
  if (range === "all") return null;

  const now = new Date();
  // Start of today (midnight local time)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // End of today (23:59:59.999 local time)
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (range) {
    case "today":
      return { from: startOfToday, to: endOfToday };

    case "yesterday": {
      const yStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      const yEnd = new Date(startOfToday.getTime() - 1);
      return { from: yStart, to: yEnd };
    }

    case "last_7_days": {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from: sevenDaysAgo, to: endOfToday };
    }

    case "this_month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: firstOfMonth, to: endOfToday };
    }

    case "last_month": {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: lastMonthStart, to: lastMonthEnd };
    }

    default:
      return null;
  }
}

// ─── Working Days Calculation ─────────────────────────────────────────────────
// Logic: For the summary row approach (one row per agent per month with total hours),
// we simply divide total hours by 8 to get working days.
// For future daily rows: 7+ hours = 1.0 day, <7 hours = hours/8

function calculateWorkingDaysFromHours(totalHours: number): number {
  // For the current migration data, we store total hours = workingDays * 8
  // So dividing by 8 gives back the original working days value
  return totalHours / 8;
}

// ─── Shared Input Schema ──────────────────────────────────────────────────────

const dateRangeInput = z
  .enum(DATE_RANGE_OPTIONS)
  .optional()
  .default("all");

// ─── Router ───────────────────────────────────────────────────────────────────

export const openingDashboardRouter = router({
  /**
   * Get aggregated agent performance data for a given month.
   * Groups opening_trials by agent_name and counts each classification.
   * Joins with agent_working_days to get total hours.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   */
  getAgentData: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      dateRange: dateRangeInput,
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { agents: [] as AgentDetail[], month: input.month };
      }

      // Build WHERE conditions
      const conditions = [eq(openingTrials.month, input.month)];

      const dateWindow = getDateRange(input.dateRange);
      if (dateWindow) {
        conditions.push(gte(openingTrials.createdDate, dateWindow.from));
        conditions.push(lte(openingTrials.createdDate, dateWindow.to));
      }

      // Query 1: Get trial counts grouped by agent and classification
      const trialRows = await db
        .select({
          agentName: openingTrials.agentName,
          classification: openingTrials.classification,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(openingTrials)
        .where(and(...conditions))
        .groupBy(openingTrials.agentName, openingTrials.classification);

      // Query 2: Get working hours per agent for the month
      // Note: working days are always fetched for the full month regardless of date range
      const workRows = await db
        .select({
          agentName: agentWorkingDays.agentName,
          totalHours: sql<string>`SUM(${agentWorkingDays.hours})`.as("totalHours"),
        })
        .from(agentWorkingDays)
        .where(eq(agentWorkingDays.month, input.month))
        .groupBy(agentWorkingDays.agentName);

      // Build a map of agent -> hours
      const hoursMap = new Map<string, number>();
      for (const row of workRows) {
        hoursMap.set(row.agentName, parseFloat(row.totalHours || "0"));
      }

      // Build agent data from trial rows
      const agentMap = new Map<string, AgentDetail>();

      for (const row of trialRows) {
        if (!agentMap.has(row.agentName)) {
          agentMap.set(row.agentName, {
            agentName: row.agentName,
            trials: 0,
            stillInTrial: 0,
            matured: 0,
            live: 0,
            saved: 0,
            cancelledAfterPayment: 0,
            cancelledBeforePayment: 0,
            dunning: 0,
            futureDeal: 0,
            workingDays: 0,
          });
        }

        const agent = agentMap.get(row.agentName)!;
        const count = Number(row.count);
        agent.trials += count;

        switch (row.classification) {
          case "still_in_trial":
            agent.stillInTrial += count;
            break;
          case "live":
            agent.live += count;
            break;
          case "saved_by_retention":
            agent.saved += count;
            break;
          case "cancelled_after_payment":
            agent.cancelledAfterPayment += count;
            break;
          case "cancelled_before_payment":
            agent.cancelledBeforePayment += count;
            break;
          case "dunning":
            agent.dunning += count;
            break;
          case "future_deal":
            agent.futureDeal += count;
            break;
        }
      }

      // Calculate matured and working days for each agent
      Array.from(agentMap.entries()).forEach(([name, agent]) => {
        // Matured = all trials that are NOT still_in_trial
        agent.matured = agent.trials - agent.stillInTrial;

        // Working days from Hubstaff hours (always full-month)
        const totalHours = hoursMap.get(name) || 0;
        agent.workingDays = calculateWorkingDaysFromHours(totalHours);
      });

      const agents = Array.from(agentMap.values());

      return { agents, month: input.month };
    }),

  /**
   * Get all customers for a specific month and classification across all agents.
   * Used for the summary cards at the top of the dashboard.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   */
  getCustomersByClassification: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      classification: z.string().min(1),
      dateRange: dateRangeInput,
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { customers: [] as (CustomerDetail & { agentName: string | null })[] };
      }

      // Build date range condition (if any)
      const dateWindow = getDateRange(input.dateRange);
      const dateConditions = dateWindow
        ? [gte(openingTrials.createdDate, dateWindow.from), lte(openingTrials.createdDate, dateWindow.to)]
        : [];

      let condition;
      if (input.classification === "matured_all") {
        condition = and(
          eq(openingTrials.month, input.month),
          sql`${openingTrials.classification} != 'still_in_trial'`,
          ...dateConditions
        );
      } else if (input.classification === "converted_all") {
        condition = and(
          eq(openingTrials.month, input.month),
          sql`${openingTrials.classification} IN ('live', 'saved_by_retention', 'cancelled_after_payment')`,
          ...dateConditions
        );
      } else {
        condition = and(
          eq(openingTrials.month, input.month),
          eq(openingTrials.classification, input.classification),
          ...dateConditions
        );
      }

      const rows = await db
        .select({
          subscriptionId: openingTrials.subscriptionId,
          customerName: openingTrials.customerName,
          planName: openingTrials.planName,
          createdDate: openingTrials.createdDate,
          status: openingTrials.status,
          classification: openingTrials.classification,
          agentName: openingTrials.agentName,
        })
        .from(openingTrials)
        .where(condition);

      const customers = rows.map((r) => ({
        subscriptionId: r.subscriptionId,
        customerName: r.customerName,
        planName: r.planName,
        createdDate: String(r.createdDate),
        status: r.status,
        classification: r.classification,
        agentName: r.agentName,
      }));

      return { customers };
    }),

  /**
   * Get individual customer details for a specific agent, month, and classification.
   * Used when clicking on a category count (e.g., "Live Sub: 10") to see the customer list.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   */
  getCustomerDetails: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      agentName: z.string().min(1),
      classification: z.string().min(1),
      dateRange: dateRangeInput,
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { customers: [] as CustomerDetail[] };
      }

      // Build WHERE conditions
      const conditions = [
        eq(openingTrials.month, input.month),
        eq(openingTrials.agentName, input.agentName),
        eq(openingTrials.classification, input.classification),
      ];

      const dateWindow = getDateRange(input.dateRange);
      if (dateWindow) {
        conditions.push(gte(openingTrials.createdDate, dateWindow.from));
        conditions.push(lte(openingTrials.createdDate, dateWindow.to));
      }

      const rows = await db
        .select({
          subscriptionId: openingTrials.subscriptionId,
          customerName: openingTrials.customerName,
          planName: openingTrials.planName,
          createdDate: openingTrials.createdDate,
          status: openingTrials.status,
          classification: openingTrials.classification,
        })
        .from(openingTrials)
        .where(and(...conditions));

      const customers: CustomerDetail[] = rows.map((r) => ({
        subscriptionId: r.subscriptionId,
        customerName: r.customerName,
        planName: r.planName,
        createdDate: String(r.createdDate),
        status: r.status,
        classification: r.classification,
      }));

      return { customers };
    }),

  /**
   * Get available months that have data in the opening_trials table.
   * Used to populate the timeline dropdown.
   */
  getAvailableMonths: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return { months: [] as string[] };
      }

      const rows = await db
        .selectDistinct({ month: openingTrials.month })
        .from(openingTrials)
        .orderBy(openingTrials.month);

      return { months: rows.map((r) => r.month) };
    }),
});
