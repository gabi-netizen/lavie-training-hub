/**
 * Opening Dashboard tRPC Router
 *
 * Provides endpoints for the Opening Dashboard:
 * 1. getAgentData — Returns aggregated agent performance data for a given month
 * 2. getCustomersByClassification — Returns customers for a classification across all agents
 * 3. getCustomerDetails — Returns individual customer names for a specific agent/classification
 * 4. getAvailableMonths — Returns months that have data in the opening_trials table
 * 5. getTrialsOverride — Returns the manual trials override for an agent+month (admin)
 * 6. upsertTrialsOverride — Insert or update a trials override (admin)
 * 7. deleteTrialsOverride — Delete a trials override, reverting to Zoho data (admin)
 *
 * Reads from: opening_trials, agent_working_days, agent_daily_hours, agent_trials_override tables.
 *
 * Date range filter: filters by the `created_date` column (when the trial was created in Zoho).
 * Supported values: "all" | "today" | "yesterday" | "this_week" | "last_7_days" | "this_month" | "previous_month" | "last_month" | "last_3_months" | "custom"
 * The date range filter works in conjunction with the month filter (AND logic).
 *
 * Agent filter: optional agentName parameter filters all data to a single agent.
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
import { openingTrials, agentWorkingDays, agentDailyHours, agentTrialsOverride } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";

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
  email: string | null;
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
  "this_week",
  "last_7_days",
  "this_month",
  "previous_month",
  "last_month",
  "last_3_months",
  "custom",
] as const;

export type DateRangeOption = (typeof DATE_RANGE_OPTIONS)[number];

// ─── Date Range Helper ────────────────────────────────────────────────────────

/**
 * Returns a { from, to } date range for the given option.
 * Dates are returned as Date objects (start-of-day / end-of-day) for Drizzle's
 * MySqlDate column comparisons (which expect Date | SQLWrapper).
 * Returns null if the option is "all" (no date filtering needed).
 *
 * For "custom" range, the caller must provide customDateFrom and customDateTo.
 */
function getDateRange(
  range: DateRangeOption,
  customDateFrom?: string,
  customDateTo?: string,
): { from: Date; to: Date } | null {
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

    case "this_week": {
      // Monday to today (ISO week starts on Monday)
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mondayStart = new Date(startOfToday.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
      return { from: mondayStart, to: endOfToday };
    }

    case "last_7_days": {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from: sevenDaysAgo, to: endOfToday };
    }

    case "this_month": {
      // Return null so that "This Month" relies on the month column filter only.
      // This avoids excluding manually-added trials whose createdDate may not
      // fall within the calendar month window.
      return null;
    }

    case "previous_month":
    case "last_month": {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: lastMonthStart, to: lastMonthEnd };
    }

    case "last_3_months": {
      const threeMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: threeMonthsAgoStart, to: endOfToday };
    }

    case "custom": {
      if (!customDateFrom || !customDateTo) return null;
      // Parse YYYY-MM-DD strings into Date objects
      const [fy, fm, fd] = customDateFrom.split("-").map(Number);
      const [ty, tm, td] = customDateTo.split("-").map(Number);
      const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
      const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
      return { from, to };
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
  "james",      // James Huxley — Retention agent
  "julie ann",  // Julie Ann Relox — not an opening agent
  "muhammad",   // Muhammad Usama Waheed — not an opening agent
  "wendy",      // Wendy Calderon — not an opening agent
  "ashley",     // Ashley — duplicate, removed from system
]);

const HUBSTAFF_TO_TRIALS_MAP: Record<string, string> = {
  "Alan Churchman": "Alan",
  "Ana Alipat": "Ana",
  "Angel Breheny": "Angel",
  "Ashleigh Walker": "Ashley",
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
  "Sophie Rose": "Sophie",
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
   *
   * Optional agentName filter narrows results to a single agent.
   */
  getAgentData: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      dateRange: dateRangeInput,
      customDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      customDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      agentName: z.string().optional(),
      agentNames: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { agents: [] as AgentDetail[], month: input.month };
      }

      // Build WHERE conditions for trials
      const conditions = [eq(openingTrials.month, input.month)];

      const dateWindow = getDateRange(input.dateRange, input.customDateFrom, input.customDateTo);
      if (dateWindow) {
        conditions.push(gte(openingTrials.createdDate, dateWindow.from));
        conditions.push(lte(openingTrials.createdDate, dateWindow.to));
      }

      // Agent filter: if specified, filter trials to this agent only
      // Support both legacy single agentName and new multi-select agentNames
      if (input.agentNames && input.agentNames.length > 0) {
        conditions.push(inArray(openingTrials.agentName, input.agentNames));
      } else if (input.agentName && input.agentName !== "all") {
        conditions.push(eq(openingTrials.agentName, input.agentName));
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

      const todayConditions: any[] = [
        gte(openingTrials.createdDate, todayStart),
        lte(openingTrials.createdDate, todayEnd),
      ];

      // If agent filter is active, also filter today's count
      if (input.agentNames && input.agentNames.length > 0) {
        todayConditions.push(inArray(openingTrials.agentName, input.agentNames));
      } else if (input.agentName && input.agentName !== "all") {
        todayConditions.push(eq(openingTrials.agentName, input.agentName));
      }

      const todayRows = await db
        .select({
          agentName: openingTrials.agentName,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(openingTrials)
        .where(and(...todayConditions))
        .groupBy(openingTrials.agentName);

      // Build a map of agent -> today's trial count
      const todayCountMap = new Map<string, number>();
      for (const row of todayRows) {
        todayCountMap.set(row.agentName, Number(row.count));
      }

      // Build agent data — seed from agent_daily_hours first so that agents
      // who worked (have hours) but opened 0 trials in the filtered period
      // still appear in the table with Trials=0.
      //
      // The map is keyed by LOWERCASE name to prevent duplicates when the same
      // agent appears with different capitalisation in different data sources
      // (e.g. "Harrison" from Hubstaff vs "harrison" from opening_trials).
      // The stored agentName uses the first-seen capitalisation; if a later
      // source provides a better-capitalised version it will be preferred.
      const agentMap = new Map<string, AgentDetail>(); // key = name.toLowerCase()

      // Helper: normalise a display name to Title Case (capitalise each word)
      function toTitleCase(name: string): string {
        return name.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      }

      // Helper to ensure an agent entry exists (case-insensitive deduplication)
      function ensureAgent(name: string): AgentDetail {
        const key = name.toLowerCase();
        if (!agentMap.has(key)) {
          agentMap.set(key, {
            agentName: toTitleCase(name), // normalised display name
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
        return agentMap.get(key)!;
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
        // If agent filter is active, skip agents that don't match
        if (input.agentNames && input.agentNames.length > 0) {
          if (!input.agentNames.some(n => n.toLowerCase() === trialsName.toLowerCase())) continue;
        } else if (input.agentName && input.agentName !== "all" && trialsName.toLowerCase() !== input.agentName.toLowerCase()) continue;
        ensureAgent(trialsName);
      }

      // Overlay trial counts from trialRows
      for (const row of trialRows) {
        // Skip non-opening agents
        if (NON_OPENING_AGENTS.has(row.agentName.toLowerCase())) continue;
        ensureAgent(row.agentName);
        const agent = agentMap.get(row.agentName.toLowerCase())!;
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
      // Note: agentMap keys are lowercase; use agent.agentName (proper case) for lookups.
      Array.from(agentMap.values()).forEach((agent) => {
        const displayName = agent.agentName;
        // Matured = all trials that are NOT still_in_trial
        agent.matured = agent.trials - agent.stillInTrial;
        // Daily Openings = trials opened today (from todayCountMap)
        // todayCountMap is keyed by the raw DB name, try both the display name and lowercase
        agent.dailyOpenings =
          todayCountMap.get(displayName) ??
          todayCountMap.get(displayName.toLowerCase()) ??
          0;
        // Try to get working days from agent_daily_hours first
        const hubstaffNames = getHubstaffNamesForTrialsAgent(displayName);;
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
        } else if (dateWindow) {
          // A date range filter is active but no Hubstaff data exists yet for
          // this period (e.g. the n8n sync hasn't run yet for today).
          // Default to 1.0 working day so Ave/Day is meaningful.
          // Once real data is inserted it will automatically take precedence.
          agent.workingDays = 1.0;
        } else {
          // No date range filter ("all" = full month) — fall back to legacy
          // agent_working_days table.
          const legacyHours = legacyHoursMap.get(displayName) || legacyHoursMap.get(displayName.toLowerCase()) || 0;
          agent.workingDays = calculateWorkingDaysFromHours(legacyHours);
        }
      });

      // ── Trials Override: apply manual overrides from agent_trials_override ──
      // The override stores a "bonus" = trialsCount - dbCountAtOverride.
      // Final displayed trials = current DB count + bonus.
      // This way, new trials added after the override are automatically counted.
      // Only applies when dateRange is "all" or "this_month" (full month view) since overrides
      // are per-month, not per date-range slice.
      if (input.dateRange === "all" || input.dateRange === "this_month") {
        let overrideRows: { agentName: string; trialsCount: number; dbCountAtOverride: number }[] = [];
        try {
          overrideRows = await db
            .select({
              agentName: agentTrialsOverride.agentName,
              trialsCount: agentTrialsOverride.trialsCount,
              dbCountAtOverride: agentTrialsOverride.dbCountAtOverride,
            })
            .from(agentTrialsOverride)
            .where(eq(agentTrialsOverride.month, input.month));
        } catch (err) {
          // Table may not exist yet; ignore gracefully
          console.warn("[openingDashboard] agent_trials_override query failed:", err);
        }

        for (const ov of overrideRows) {
          const key = ov.agentName.toLowerCase();
          const agent = agentMap.get(key);
          if (agent) {
            // bonus = what the admin added manually beyond what was in DB at override time
            const bonus = ov.trialsCount - ov.dbCountAtOverride;
            // Final trials = current DB count + bonus (bonus can be negative if admin reduced)
            agent.trials = agent.trials + bonus;
            // Recalculate matured based on adjusted trials
            agent.matured = agent.trials - agent.stillInTrial;
          }
        }
      }

      // Ensure filtered agents always appear even if they have no data at all
      // (no trials, no Hubstaff hours). This allows admins to edit W.Days for agents
      // who haven't closed any trials in the selected period.
      if (input.agentNames && input.agentNames.length > 0) {
        for (const name of input.agentNames) {
          if (!NON_OPENING_AGENTS.has(name.toLowerCase())) {
            ensureAgent(name);
          }
        }
      } else if (input.agentName && input.agentName !== "all") {
        if (!NON_OPENING_AGENTS.has(input.agentName.toLowerCase())) {
          ensureAgent(input.agentName);
        }
      }

      const agents = Array.from(agentMap.values());

      return { agents, month: input.month };
    }),

  /**
   * Get all customers for a specific month and classification across all agents.
   * Used for the summary cards at the top of the dashboard.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   *
   * Optional agentName filter narrows results to a single agent.
   */
  getCustomersByClassification: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      classification: z.string().min(1),
      dateRange: dateRangeInput,
      customDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      customDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      agentName: z.string().optional(),
      agentNames: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { customers: [] as (CustomerDetail & { agentName: string | null })[] };
      }

      // Build date range condition (if any)
      const dateWindow = getDateRange(input.dateRange, input.customDateFrom, input.customDateTo);
      const dateConditions = dateWindow
        ? [gte(openingTrials.createdDate, dateWindow.from), lte(openingTrials.createdDate, dateWindow.to)]
        : [];

      // Agent filter condition — support both legacy single and new multi-select
      const agentConditions = (input.agentNames && input.agentNames.length > 0)
        ? [inArray(openingTrials.agentName, input.agentNames)]
        : (input.agentName && input.agentName !== "all")
          ? [eq(openingTrials.agentName, input.agentName)]
          : [];

      let condition;
      if (input.classification === "matured_all") {
        condition = and(
          eq(openingTrials.month, input.month),
          sql`${openingTrials.classification} != 'still_in_trial'`,
          ...dateConditions,
          ...agentConditions,
        );
      } else if (input.classification === "converted_all") {
        condition = and(
          eq(openingTrials.month, input.month),
          sql`${openingTrials.classification} IN ('live', 'saved_by_retention', 'cancelled_after_payment')`,
          ...dateConditions,
          ...agentConditions,
        );
      } else {
        condition = and(
          eq(openingTrials.month, input.month),
          eq(openingTrials.classification, input.classification),
          ...dateConditions,
          ...agentConditions,
        );
      }

      const rows = await db
        .select({
          subscriptionId: openingTrials.subscriptionId,
          customerName: openingTrials.customerName,
          email: openingTrials.email,
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
        email: r.email ?? null,
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
      customDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      customDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
      ];

      // "all_trials" means show all trials for this agent (no classification filter)
      if (input.classification !== "all_trials") {
        conditions.push(eq(openingTrials.classification, input.classification));
      }

      const dateWindow = getDateRange(input.dateRange, input.customDateFrom, input.customDateTo);
      if (dateWindow) {
        conditions.push(gte(openingTrials.createdDate, dateWindow.from));
        conditions.push(lte(openingTrials.createdDate, dateWindow.to));
      }

      const rows = await db
        .select({
          subscriptionId: openingTrials.subscriptionId,
          customerName: openingTrials.customerName,
          email: openingTrials.email,
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
        email: r.email ?? null,
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

      // Only show months from April 2026 onwards (older months are irrelevant test data)
      const months = rows
        .map((r) => r.month)
        .filter((m) => m >= "2026-04");

      return { months };
    }),

  /**
   * Get distinct agent names from opening_trials for the agent filter dropdown.
   * Excludes non-opening agents (retention, support, etc.).
   */
  getAgentNames: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return { agents: [] as string[] };
      }

      const rows = await db
        .selectDistinct({ agentName: openingTrials.agentName })
        .from(openingTrials)
        .orderBy(openingTrials.agentName);

      // Filter out non-opening agents, empty names, and normalise to title case
      const agents = rows
        .map((r) => r.agentName)
        .filter((name) => name && name.trim() !== '' && !NON_OPENING_AGENTS.has(name.toLowerCase()))
        .map((name) =>
          name.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        );

      // Deduplicate (in case title-case normalisation creates duplicates)
      return { agents: [...new Set(agents)] };
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

  // ─── Admin: Agent Trials Override CRUD ───────────────────────────────────────────

  /**
   * Get the trials override for a specific agent and month.
   * Admin-only. Returns the override row if it exists, or null.
   */
  getTrialsOverride: adminProcedure
    .input(z.object({
      agentName: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { override: null };
      }

      const rows = await db
        .select({
          id: agentTrialsOverride.id,
          agentName: agentTrialsOverride.agentName,
          month: agentTrialsOverride.month,
          trialsCount: agentTrialsOverride.trialsCount,
          updatedAt: agentTrialsOverride.updatedAt,
        })
        .from(agentTrialsOverride)
        .where(and(
          eq(agentTrialsOverride.agentName, input.agentName),
          eq(agentTrialsOverride.month, input.month),
        ));

      return { override: rows.length > 0 ? rows[0] : null };
    }),

  /**
   * Insert or update a trials override for an agent+month.
   * Admin-only. Uses ON DUPLICATE KEY UPDATE on the unique (agent_name, month) constraint.
   */
  upsertTrialsOverride: adminProcedure
    .input(z.object({
      agentName: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      trialsCount: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      // Get current DB count for this agent+month to store as baseline
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(openingTrials)
        .where(and(
          eq(openingTrials.agentName, input.agentName),
          eq(openingTrials.month, input.month),
        ));
      const dbCountNow = Number(countRow?.count ?? 0);

      await db.execute(sql`
        INSERT INTO agent_trials_override (agent_name, month, trials_count, db_count_at_override)
        VALUES (${input.agentName}, ${input.month}, ${input.trialsCount}, ${dbCountNow})
        ON DUPLICATE KEY UPDATE
          trials_count = VALUES(trials_count),
          db_count_at_override = VALUES(db_count_at_override)
      `);

      return { success: true };
    }),

  /**
   * Delete a trials override for an agent+month, reverting to Zoho data.
   * Admin-only.
   */
  deleteTrialsOverride: adminProcedure
    .input(z.object({
      agentName: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      await db.delete(agentTrialsOverride).where(and(
        eq(agentTrialsOverride.agentName, input.agentName),
        eq(agentTrialsOverride.month, input.month),
      ));

      return { success: true };
    }),
});
