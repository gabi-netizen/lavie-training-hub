/**
 * Opening Dashboard tRPC Router
 *
 * Provides endpoints for the Opening Dashboard:
 * 1. getAgentData — Returns aggregated agent performance data for a given month
 * 2. getCustomersByClassification — Returns customers for a classification across all agents
 * 3. getCustomerDetails — Returns individual customer names for a specific agent/classification
 * 4. getAvailableMonths — Returns months that have data in the opening_trials table
 *
 * Reads from: opening_trials, agent_working_days, agent_daily_hours tables.
 *
 * Date range filter: filters by the `created_date` column (when the trial was created in Zoho).
 * Supported values: "all" | "today" | "yesterday" | "last_7_days" | "this_month" | "last_month"
 * The date range filter works in conjunction with the month filter (AND logic).
 *
 * Working Days calculation (updated):
 * - When dateRange is active and agent_daily_hours has data for the period, sum working_day_value
 *   from agent_daily_hours for the matching date range.
 * - When dateRange is "all", sum all working_day_values for the selected month.
 * - Falls back to agent_working_days table if no daily data exists for the agent/period.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { openingTrials, agentWorkingDays, agentDailyHours } from "../../drizzle/schema";
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
  dailyOpenings: number;
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

// ─── Working Days Calculation (Legacy fallback) ──────────────────────────────
// Logic: For the summary row approach (one row per agent per month with total hours),
// we simply divide total hours by 8 to get working days.

function calculateWorkingDaysFromHours(totalHours: number): number {
  return totalHours / 8;
}

/// ─── Agent Name Mapping ──────────────────────────────────────────────────────
// Maps opening_trials agent names (first name / short) to agent_daily_hours full names.
// This mapping is used to look up daily hours data for each agent.
// Case-insensitive matching with first-name fallback.

/**
 * Agents who are NOT part of the Opening team and should be excluded from
 * the Opening Dashboard entirely — even if they have Hubstaff hours.
 * Stored as lowercase opening_trials names for case-insensitive matching.
 */
const NON_OPENING_AGENTS = new Set([
  "rob",        // Rob Chidzik — Retention agent
  "guy",        // Guy — Retention agent
  "julie ann",  // Julie Ann Relox — not an opening agent
  "matt",       // Matthew Holman — not an opening agent
  "muhammad",   // Muhammad Usama Waheed — not an opening agent
  "wendy",      // Wendy Calderon — not an opening agent
]);

const HUBSTAFF_TO_TRIALS_MAP: Record<string, string> = {
  "Alan Churchman": "Alan",
  "Ana Alipat": "Ana",
  "Angel Breheny": "Angel",
  "Ashleigh Walker": "Ashleigh",
  "Ava Monroe": "Ava",
  "Carl Bennett": "Carl",
  "Daniel Parker": "Daniel",
  "Darrell Loynes": "Darrel",
  "Debbie Forbes": "Debbie",
  "Dee Richards": "Dee",
  "Harrison Joslin": "Harrison",
  "Julie Ann Relox": "Julie Ann",
  "Matthew Holman": "Matt",
  "Muhammad Usama Waheed": "Muhammad",
  "Paige Taylor": "Paige",
  "Rob Chidzik": "Rob",
  "Shola Marie": "Shola",
  "Wendy Calderon": "Wendy",
};

// Reverse map: opening_trials name → agent_daily_hours name(s)
// Built dynamically for flexible lookup
function buildTrialsToHubstaffMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [hubstaffName, trialsName] of Object.entries(HUBSTAFF_TO_TRIALS_MAP)) {
    const key = trialsName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(hubstaffName);
  }
  return map;
}

const TRIALS_TO_HUBSTAFF_MAP = buildTrialsToHubstaffMap();

/**
 * Given an agent name from opening_trials, find the matching agent_daily_hours name(s).
 * Uses the explicit mapping first, then falls back to case-insensitive first-name matching.
 */
function getHubstaffNamesForTrialsAgent(trialsAgentName: string): string[] {
  // Try explicit mapping first
  const mapped = TRIALS_TO_HUBSTAFF_MAP.get(trialsAgentName.toLowerCase());
  if (mapped && mapped.length > 0) {
    return mapped;
  }
  // Fallback: return the name as-is (might match directly)
  return [trialsAgentName];
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
   * Joins with agent_daily_hours (preferred) or agent_working_days (fallback)
   * to get working days.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   * When a dateRange is active, working days are also filtered to that date range
   * using agent_daily_hours.
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

      // Build WHERE conditions for trials
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

      // Query 2: Get working days from agent_daily_hours
      // Build date conditions for the daily hours query
      const monthYear = input.month; // e.g. "2026-05"
      const [year, monthNum] = monthYear.split("-").map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0); // last day of month

      // Determine the date range for daily hours query
      let dailyHoursFrom: Date;
      let dailyHoursTo: Date;

      if (dateWindow) {
        // Use the date range filter for working days too
        dailyHoursFrom = dateWindow.from;
        dailyHoursTo = dateWindow.to;
      } else {
        // "all" — use the full month
        dailyHoursFrom = monthStart;
        dailyHoursTo = monthEnd;
      }

      // Query agent_daily_hours for the date range
      // Wrapped in try-catch to gracefully handle cases where the table may not
      // exist yet in the deployed database (falls back to legacy table).
      let dailyHoursRows: { agentName: string; totalWorkingDays: string }[] = [];
      try {
        dailyHoursRows = await db
          .select({
            agentName: agentDailyHours.agentName,
            totalWorkingDays: sql<string>`SUM(${agentDailyHours.workingDayValue})`.as("totalWorkingDays"),
          })
          .from(agentDailyHours)
          .where(and(
            gte(agentDailyHours.date, dailyHoursFrom),
            lte(agentDailyHours.date, dailyHoursTo),
          ))
          .groupBy(agentDailyHours.agentName);
      } catch (err) {
        // Table may not exist in this environment; fall back to legacy table
        console.warn("[openingDashboard] agent_daily_hours query failed, using legacy fallback:", err);
      }

      // Build a map of hubstaff agent name -> working days from daily table
      const dailyHoursMap = new Map<string, number>();
      for (const row of dailyHoursRows) {
        dailyHoursMap.set(row.agentName, parseFloat(row.totalWorkingDays || "0"));
      }

      // Query 3 (fallback): Get working hours per agent for the month from legacy table
      // Only used if agent_daily_hours has no data for an agent
      const workRows = await db
        .select({
          agentName: agentWorkingDays.agentName,
          totalHours: sql<string>`SUM(${agentWorkingDays.hours})`.as("totalHours"),
        })
        .from(agentWorkingDays)
        .where(eq(agentWorkingDays.month, input.month))
        .groupBy(agentWorkingDays.agentName);

      // Build a map of agent -> hours (legacy fallback)
      const legacyHoursMap = new Map<string, number>();
      for (const row of workRows) {
        legacyHoursMap.set(row.agentName, parseFloat(row.totalHours || "0"));
      }

      // Query 4: Get today's trial count per agent (for Daily Openings column)
      // Always uses today's date regardless of the month/dateRange filter.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayRows = await db
        .select({
          agentName: openingTrials.agentName,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(openingTrials)
        .where(and(
          gte(openingTrials.createdDate, todayStart),
          lte(openingTrials.createdDate, todayEnd),
        ))
        .groupBy(openingTrials.agentName);

      // Build a map of agent -> today's trial count
      const todayCountMap = new Map<string, number>();
      for (const row of todayRows) {
        todayCountMap.set(row.agentName, Number(row.count));
      }

      // Build agent data — seed from agent_daily_hours first so that agents
      // who worked (have hours) but opened 0 trials in the filtered period
      // still appear in the table with Trials=0.
      const agentMap = new Map<string, AgentDetail>();

      // Helper to ensure an agent entry exists
      function ensureAgent(name: string): AgentDetail {
        if (!agentMap.has(name)) {
          agentMap.set(name, {
            agentName: name,
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
            dailyOpenings: 0,
          });
        }
        return agentMap.get(name)!;
      }

      // Seed from agent_daily_hours: any agent who has hours in the filtered
      // period should appear even if they have no trials.
      // We need to map Hubstaff names back to opening_trials names.
      const TRIALS_NAME_FOR_HUBSTAFF = Object.fromEntries(
        Object.entries(HUBSTAFF_TO_TRIALS_MAP)
      );
      for (const row of dailyHoursRows) {
        // Convert Hubstaff name to trials name (use mapping, fallback to as-is)
        const trialsName = TRIALS_NAME_FOR_HUBSTAFF[row.agentName] ?? row.agentName;
        // Skip non-opening agents (retention agents, support staff, etc.)
        if (NON_OPENING_AGENTS.has(trialsName.toLowerCase())) continue;
        ensureAgent(trialsName);
      }

      // Overlay trial counts from trialRows
      for (const row of trialRows) {
        // Skip non-opening agents
        if (NON_OPENING_AGENTS.has(row.agentName.toLowerCase())) continue;
        ensureAgent(row.agentName);
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

      // Calculate matured, working days, and daily openings for each agent
      Array.from(agentMap.entries()).forEach(([name, agent]) => {
        // Matured = all trials that are NOT still_in_trial
        agent.matured = agent.trials - agent.stillInTrial;
        // Daily Openings = trials opened today (from todayCountMap)
        agent.dailyOpenings = todayCountMap.get(name) || 0;

        // Try to get working days from agent_daily_hours first
        const hubstaffNames = getHubstaffNamesForTrialsAgent(name);
        let dailyWorkingDays = 0;
        let foundInDailyTable = false;

        for (const hubstaffName of hubstaffNames) {
          const days = dailyHoursMap.get(hubstaffName);
          if (days !== undefined) {
            dailyWorkingDays += days;
            foundInDailyTable = true;
          }
        }

        if (foundInDailyTable) {
          // Use the daily hours table (date-range aware)
          agent.workingDays = Math.round(dailyWorkingDays * 100) / 100;
        } else {
          // Fallback to legacy agent_working_days table (always full-month)
          // Try matching by the trials agent name directly (legacy table uses same short names)
          const legacyHours = legacyHoursMap.get(name) || 0;
          agent.workingDays = calculateWorkingDaysFromHours(legacyHours);
        }
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

  // ─── Admin: Agent Daily Hours CRUD ──────────────────────────────────────────

  /**
   * Get all daily hours entries for an agent in a given month.
   * Admin-only. Uses the Hubstaff full name (from agent_daily_hours table).
   */
  getAgentDailyHours: adminProcedure
    .input(z.object({
      agentName: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { days: [] as { id: number; date: string; hoursTracked: number; workingDayValue: number }[] };
      }

      // Get the Hubstaff name(s) for this agent
      const hubstaffNames = getHubstaffNamesForTrialsAgent(input.agentName);

      const [year, monthNum] = input.month.split("-").map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0); // last day of month

      // Query all daily hours for matching agent names in the month
      const rows = await db
        .select({
          id: agentDailyHours.id,
          agentName: agentDailyHours.agentName,
          date: agentDailyHours.date,
          hoursTracked: agentDailyHours.hoursTracked,
          workingDayValue: agentDailyHours.workingDayValue,
        })
        .from(agentDailyHours)
        .where(and(
          sql`${agentDailyHours.agentName} IN (${sql.join(hubstaffNames.map(n => sql`${n}`), sql`, `)})`,
          gte(agentDailyHours.date, monthStart),
          lte(agentDailyHours.date, monthEnd),
        ))
        .orderBy(agentDailyHours.date);

      const days = rows.map(r => ({
        id: r.id,
        agentName: r.agentName,
        date: String(r.date),
        hoursTracked: parseFloat(String(r.hoursTracked)),
        workingDayValue: parseFloat(String(r.workingDayValue)),
      }));

      // Also return the Hubstaff name for use in upsert operations
      const hubstaffName = hubstaffNames[0] || input.agentName;

      return { days, hubstaffName };
    }),

  /**
   * Add or update a day's hours for an agent.
   * Admin-only. Auto-calculates working_day_value.
   * Uses Hubstaff full name (agent_daily_hours.agent_name).
   */
  upsertAgentDailyHours: adminProcedure
    .input(z.object({
      agentName: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      hoursTracked: z.number().min(0).max(24),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      // Calculate working_day_value
      const workingDayValue = input.hoursTracked >= 7
        ? 1.00
        : Math.round((input.hoursTracked / 8) * 100) / 100;

      // Upsert using ON DUPLICATE KEY UPDATE
      await db.execute(sql`
        INSERT INTO agent_daily_hours (agent_name, date, hours_tracked, working_day_value)
        VALUES (${input.agentName}, ${input.date}, ${input.hoursTracked.toFixed(2)}, ${workingDayValue.toFixed(2)})
        ON DUPLICATE KEY UPDATE
          hours_tracked = VALUES(hours_tracked),
          working_day_value = VALUES(working_day_value)
      `);

      return { success: true, workingDayValue };
    }),

  /**
   * Delete a specific day entry from agent_daily_hours.
   * Admin-only.
   */
  deleteAgentDailyHours: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      await db.delete(agentDailyHours).where(eq(agentDailyHours.id, input.id));

      return { success: true };
    }),
});
