/**
 * Opening Dashboard tRPC Router
 *
 * Provides endpoints for the Opening Dashboard:
 * 1. getAgentData — Returns aggregated agent performance data for a given month
 * 2. getCustomerDetails — Returns individual customer names for a specific agent/classification
 *
 * Reads from: opening_trials, agent_working_days tables.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { openingTrials, agentWorkingDays } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

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

// ─── Working Days Calculation ─────────────────────────────────────────────────
// Logic: For the summary row approach (one row per agent per month with total hours),
// we simply divide total hours by 8 to get working days.
// For future daily rows: 7+ hours = 1.0 day, <7 hours = hours/8

function calculateWorkingDaysFromHours(totalHours: number): number {
  // For the current migration data, we store total hours = workingDays * 8
  // So dividing by 8 gives back the original working days value
  return totalHours / 8;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const openingDashboardRouter = router({
  /**
   * Get aggregated agent performance data for a given month.
   * Groups opening_trials by agent_name and counts each classification.
   * Joins with agent_working_days to get total hours.
   */
  getAgentData: adminProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { agents: [] as AgentDetail[], month: input.month };
      }

      // Query 1: Get trial counts grouped by agent and classification
      const trialRows = await db
        .select({
          agentName: openingTrials.agentName,
          classification: openingTrials.classification,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(openingTrials)
        .where(eq(openingTrials.month, input.month))
        .groupBy(openingTrials.agentName, openingTrials.classification);

      // Query 2: Get working hours per agent for the month
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

        // Working days from Hubstaff hours
        const totalHours = hoursMap.get(name) || 0;
        agent.workingDays = calculateWorkingDaysFromHours(totalHours);
      });

      const agents = Array.from(agentMap.values());

      return { agents, month: input.month };
    }),

  /**
   * Get individual customer details for a specific agent, month, and classification.
   * Used when clicking on a category count (e.g., "Live Sub: 10") to see the customer list.
   */
  getCustomerDetails: adminProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
      agentName: z.string().min(1),
      classification: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { customers: [] as CustomerDetail[] };
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
        .where(
          and(
            eq(openingTrials.month, input.month),
            eq(openingTrials.agentName, input.agentName),
            eq(openingTrials.classification, input.classification),
          )
        );

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
  getAvailableMonths: adminProcedure
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
