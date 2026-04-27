/**
 * Manager Command Centre tRPC Router
 *
 * Provides CRUD operations for retention lead management.
 * Reads from the local lead_assignments table (populated via CSV import or Zoho sync).
 * Adapted from the laviecrm reference project to use Drizzle ORM + tRPC patterns
 * already established in lavie-training-hub.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadAssignments, callAttempts } from "../../drizzle/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AGENTS = ["Guy", "Rob"] as const;

export const WORK_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "retained",
  "done_deal",
  "future_deal",
  "dont_assign",
  "not_interested",
  "no_answer",
  "callback",
  "follow_up",
  "whatsapp_queue",
  "cancelled_sub",
  "archived",
] as const;

export const CALL_RESULTS = [
  "retained",
  "done_deal",
  "future_deal",
  "no_answer",
  "callback",
  "follow_up",
  "not_interested",
  "voicemail",
  "wrong_number",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmptyStats() {
  return {
    totalAssigned: 0,
    totalUnassigned: 0,
    totalWhatsappQueue: 0,
    totalRetained: 0,
    byAgent: {} as Record<string, number>,
    byWorkStatus: {} as Record<string, number>,
    byLeadType: {} as Record<string, number>,
    byCategory: { installment: 0, subscription: 0 },
    callbacksDueToday: 0,
    urgencyBreakdown: { critical: 0, high: 0, medium: 0, low: 0 },
  };
}

function buildStats(leads: any[]) {
  const byAgent: Record<string, number> = {};
  const byWorkStatus: Record<string, number> = {};
  const byLeadType: Record<string, number> = {};
  const byCategory = { installment: 0, subscription: 0 };
  const urgencyBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  let callbacksDueToday = 0;

  for (const l of leads) {
    if (l.assignedAgent) byAgent[l.assignedAgent] = (byAgent[l.assignedAgent] || 0) + 1;
    const ws = l.workStatus || "new";
    byWorkStatus[ws] = (byWorkStatus[ws] || 0) + 1;
    if (l.leadType) byLeadType[l.leadType] = (byLeadType[l.leadType] || 0) + 1;
    if (l.leadCategory === "installment") byCategory.installment++;
    else byCategory.subscription++;

    const score = l.urgencyScore ?? 0;
    if (score >= 80) urgencyBreakdown.critical++;
    else if (score >= 60) urgencyBreakdown.high++;
    else if (score >= 40) urgencyBreakdown.medium++;
    else urgencyBreakdown.low++;

    if (l.callbackAt && l.callbackAt >= todayStart.getTime() && l.callbackAt <= todayEnd.getTime()) {
      callbacksDueToday++;
    }
  }

  return {
    totalAssigned: leads.filter((l) => l.assignedAgent).length,
    totalUnassigned: leads.filter((l) => !l.assignedAgent).length,
    totalWhatsappQueue: leads.filter((l) => l.workStatus === "whatsapp_queue").length,
    totalRetained: leads.filter((l) => l.workStatus === "retained").length,
    byAgent,
    byWorkStatus,
    byLeadType,
    byCategory,
    callbacksDueToday,
    urgencyBreakdown,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const managerRouter = router({
  /**
   * Fetch leads from local DB.
   * Returns leads sorted by date (newest first) with filters applied.
   */
  getLeads: protectedProcedure
    .input(
      z.object({
        page: z.number().default(1),
        perPage: z.number().default(200),
        categoryFilter: z.enum(["installment", "subscription", "all"]).default("all"),
        leadTypeFilter: z.string().optional(),
        agentFilter: z.string().optional(),
        workStatusFilter: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["urgency", "totalSpend", "daysSinceEvent", "customerName", "leadStatus"]).default("leadStatus"),
        dateRangeFilter: z.enum(["today", "yesterday", "7days", "this_month", "custom", "all"]).default("this_month"),
        customDateFrom: z.string().optional(),
        customDateTo: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { leads: [], total: 0, stats: buildEmptyStats() };

      const rows = await db.select().from(leadAssignments).orderBy(desc(leadAssignments.id));

      if (rows.length === 0) {
        return { leads: [], total: 0, stats: buildEmptyStats() };
      }

      // Map DB rows to the lead shape the frontend expects
      let leads = rows.map((row) => {
        let daysSinceEvent = 0;
        if (row.cancelledAt) {
          const d = new Date(row.cancelledAt);
          if (!isNaN(d.getTime())) {
            daysSinceEvent = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
          }
        }

        return {
          subscriptionId: row.subscriptionId,
          customerId: row.customerId ?? null,
          customerName: row.customerName ?? "Unknown",
          email: row.email ?? "",
          phone: row.phone ?? null,
          planName: row.planName ?? null,
          billingStatus: row.billingStatus ?? null,
          cyclesCompleted: row.cyclesCompleted ?? 0,
          totalSpend: row.totalSpend ?? 0,
          monthlyAmount: row.monthlyAmount ?? 0,
          currencyCode: row.currencyCode ?? "GBP",
          retryAttempts: row.retryAttempts ?? 0,
          nextBillingAt: null,
          currentTermEndsAt: row.eventDate ?? row.cancelledAt ?? null,
          leadCategory: row.leadCategory ?? "subscription",
          leadType: row.leadType ?? "pre_cycle_cancelled",
          urgencyScore: row.urgencyScore ?? 0,
          urgencyFlags: row.urgencyFlags ? JSON.parse(row.urgencyFlags) : [],
          urgencyLabel: (row.urgencyScore ?? 0) >= 80 ? "Critical" : (row.urgencyScore ?? 0) >= 60 ? "High" : (row.urgencyScore ?? 0) >= 40 ? "Medium" : "Low",
          daysSinceEvent,
          valueScore: row.urgencyScore ?? 0,
          reachabilityScore: 50,
          queuePriority: row.urgencyScore ?? 0,
          callPurpose: null,
          callPurposeNote: null,
          actionRequired: null,
          maxCallAttempts: 3,
          assignmentId: row.id,
          assignedAgent: row.assignedAgent ?? null,
          workStatus: row.workStatus ?? "new",
          managerNote: row.managerNote ?? null,
          agentNote: row.agentNote ?? null,
          attemptCount: row.attemptCount ?? 0,
          noAnswerCount: row.noAnswerCount ?? 0,
          lastCallAt: row.lastCallAt ?? null,
          lastCallResult: row.lastCallResult ?? null,
          callbackAt: row.callbackAt ?? null,
          followUpAt: row.followUpAt ?? null,
          followUpNote: row.followUpNote ?? null,
          assignedAt: row.assignedAt ?? null,
          statusChangedAt: row.statusChangedAt ?? null,
          lastTransactionDate: row.lastTransactionDate ?? null,
          lastShipmentDate: row.lastShipmentDate ?? null,
        };
      });

      // Apply date range filter
      if (input.dateRangeFilter !== "all") {
        const now = new Date();
        let startTs: number;
        let endTs: number = Date.now();

        if (input.dateRangeFilter === "today") {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          startTs = start.getTime();
        } else if (input.dateRangeFilter === "yesterday") {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          startTs = start.getTime();
          endTs = end.getTime();
        } else if (input.dateRangeFilter === "7days") {
          startTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        } else if (input.dateRangeFilter === "this_month") {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          startTs = start.getTime();
        } else if (input.dateRangeFilter === "custom") {
          startTs = input.customDateFrom ? new Date(input.customDateFrom).getTime() : 0;
          if (input.customDateTo) {
            const endDay = new Date(input.customDateTo);
            endDay.setHours(23, 59, 59, 999);
            endTs = endDay.getTime();
          }
        } else {
          startTs = 0;
        }

        leads = leads.filter((l) => {
          const ts = l.currentTermEndsAt ? new Date(l.currentTermEndsAt).getTime() : null;
          if (!ts) return false;
          return ts >= startTs! && ts <= endTs;
        });
      }

      // Apply filters
      if (input.categoryFilter !== "all") {
        leads = leads.filter((l) => l.leadCategory === input.categoryFilter);
      }
      if (input.leadTypeFilter) {
        leads = leads.filter((l) => l.leadType === input.leadTypeFilter);
      }
      if (input.agentFilter) {
        leads = leads.filter((l) => l.assignedAgent === input.agentFilter);
      }
      if (input.workStatusFilter) {
        leads = leads.filter((l) => l.workStatus === input.workStatusFilter);
      }
      if (input.search) {
        const q = input.search.toLowerCase();
        leads = leads.filter(
          (l) =>
            (l.customerName || "").toLowerCase().includes(q) ||
            (l.email || "").toLowerCase().includes(q) ||
            (l.phone || "").toLowerCase().includes(q) ||
            (l.planName || "").toLowerCase().includes(q)
        );
      }

      // Sort
      leads.sort((a, b) => {
        switch (input.sortBy) {
          case "leadStatus": {
            const aDate = a.currentTermEndsAt ? new Date(a.currentTermEndsAt).getTime() : 0;
            const bDate = b.currentTermEndsAt ? new Date(b.currentTermEndsAt).getTime() : 0;
            return bDate - aDate;
          }
          case "urgency":
            return b.urgencyScore - a.urgencyScore;
          case "totalSpend":
            return b.totalSpend - a.totalSpend;
          case "daysSinceEvent":
            return a.daysSinceEvent - b.daysSinceEvent;
          case "customerName":
            return (a.customerName || "").localeCompare(b.customerName || "");
          default:
            return b.urgencyScore - a.urgencyScore;
        }
      });

      return {
        leads,
        total: leads.length,
        stats: buildStats(leads),
      };
    }),

  /**
   * Assign a lead to an agent (or update assignment data).
   */
  assignLead: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        customerId: z.string().optional(),
        customerName: z.string().optional(),
        assignedAgent: z.string().nullable().optional(),
        managerNote: z.string().nullable().optional(),
        agentNote: z.string().nullable().optional(),
        workStatus: z.string().optional(),
        callbackAt: z.number().nullable().optional(),
        followUpAt: z.number().nullable().optional(),
        followUpNote: z.string().nullable().optional(),
        leadCategory: z.string().optional(),
        leadType: z.string().optional(),
        planName: z.string().optional(),
        urgencyScore: z.number().optional(),
        urgencyFlags: z.string().optional(),
        totalSpend: z.number().optional(),
        monthlyAmount: z.number().optional(),
        cyclesCompleted: z.number().optional(),
        billingCycles: z.number().optional(),
        billingStatus: z.string().optional(),
        retryAttempts: z.number().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db
        .select()
        .from(leadAssignments)
        .where(eq(leadAssignments.subscriptionId, input.subscriptionId))
        .limit(1);

      const updateData: Record<string, any> = {};
      if (input.assignedAgent !== undefined) {
        updateData.assignedAgent = input.assignedAgent;
        updateData.assignedAt = input.assignedAgent ? Date.now() : null;
        if (input.assignedAgent && (!existing[0]?.workStatus || existing[0]?.workStatus === "new")) {
          updateData.workStatus = "assigned";
        }
      }
      if (input.managerNote !== undefined) updateData.managerNote = input.managerNote;
      if (input.agentNote !== undefined) updateData.agentNote = input.agentNote;
      if (input.workStatus !== undefined) {
        updateData.workStatus = input.workStatus;
        updateData.statusChangedAt = Date.now();
      }
      if (input.callbackAt !== undefined) updateData.callbackAt = input.callbackAt;
      if (input.followUpAt !== undefined) updateData.followUpAt = input.followUpAt;
      if (input.followUpNote !== undefined) updateData.followUpNote = input.followUpNote;
      if (input.leadCategory !== undefined) updateData.leadCategory = input.leadCategory;
      if (input.leadType !== undefined) updateData.leadType = input.leadType;
      if (input.planName !== undefined) updateData.planName = input.planName;
      if (input.urgencyScore !== undefined) updateData.urgencyScore = input.urgencyScore;
      if (input.urgencyFlags !== undefined) updateData.urgencyFlags = input.urgencyFlags;
      if (input.totalSpend !== undefined) updateData.totalSpend = input.totalSpend;
      if (input.monthlyAmount !== undefined) updateData.monthlyAmount = input.monthlyAmount;
      if (input.cyclesCompleted !== undefined) updateData.cyclesCompleted = input.cyclesCompleted;
      if (input.billingCycles !== undefined) updateData.billingCycles = input.billingCycles;
      if (input.billingStatus !== undefined) updateData.billingStatus = input.billingStatus;
      if (input.retryAttempts !== undefined) updateData.retryAttempts = input.retryAttempts;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.phone !== undefined) updateData.phone = input.phone;

      if (existing.length > 0) {
        await db
          .update(leadAssignments)
          .set(updateData)
          .where(eq(leadAssignments.subscriptionId, input.subscriptionId));
      } else {
        await db.insert(leadAssignments).values({
          subscriptionId: input.subscriptionId,
          customerId: input.customerId || null,
          customerName: input.customerName || null,
          email: input.email || null,
          phone: input.phone || null,
          leadCategory: input.leadCategory || "subscription",
          leadType: input.leadType || null,
          planName: input.planName || null,
          urgencyScore: input.urgencyScore || 0,
          urgencyFlags: input.urgencyFlags || null,
          totalSpend: input.totalSpend || 0,
          monthlyAmount: input.monthlyAmount || 0,
          cyclesCompleted: input.cyclesCompleted || 0,
          billingCycles: input.billingCycles || 0,
          billingStatus: input.billingStatus || null,
          retryAttempts: input.retryAttempts || 0,
          assignedAgent: input.assignedAgent || null,
          assignedAt: input.assignedAgent ? Date.now() : null,
          workStatus: input.workStatus || (input.assignedAgent ? "assigned" : "new"),
          managerNote: input.managerNote || null,
          callbackAt: input.callbackAt || null,
        });
      }

      const result = await db
        .select()
        .from(leadAssignments)
        .where(eq(leadAssignments.subscriptionId, input.subscriptionId))
        .limit(1);

      return { success: true, assignment: result[0] };
    }),

  /**
   * Log a call attempt and update lead status.
   * After 3 no-answers -> auto-move to whatsapp_queue.
   */
  logCallAttempt: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        agentName: z.string(),
        result: z.enum(CALL_RESULTS),
        note: z.string().optional(),
        callbackAt: z.number().optional(),
        followUpAt: z.number().optional(),
        followUpNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(callAttempts).values({
        subscriptionId: input.subscriptionId,
        agentName: input.agentName,
        result: input.result,
        note: input.note || null,
        callbackAt: input.callbackAt || null,
        followUpAt: input.followUpAt || null,
      });

      const existing = await db
        .select()
        .from(leadAssignments)
        .where(eq(leadAssignments.subscriptionId, input.subscriptionId))
        .limit(1);

      const current = existing[0];
      const newAttemptCount = (current?.attemptCount ?? 0) + 1;
      const newNoAnswerCount =
        input.result === "no_answer" || input.result === "voicemail"
          ? (current?.noAnswerCount ?? 0) + 1
          : 0;

      let newWorkStatus: string;
      if (input.result === "retained") {
        newWorkStatus = "retained";
      } else if (input.result === "done_deal") {
        newWorkStatus = "done_deal";
      } else if (input.result === "future_deal") {
        newWorkStatus = "future_deal";
      } else if (input.result === "not_interested") {
        newWorkStatus = "not_interested";
      } else if (input.result === "callback") {
        newWorkStatus = "callback";
      } else if (input.result === "follow_up") {
        newWorkStatus = "follow_up";
      } else if (newNoAnswerCount >= 3) {
        newWorkStatus = "whatsapp_queue";
      } else {
        newWorkStatus = "no_answer";
      }

      const updateData: Record<string, any> = {
        attemptCount: newAttemptCount,
        noAnswerCount: newNoAnswerCount,
        lastCallAt: Date.now(),
        lastCallResult: input.result,
        workStatus: newWorkStatus,
        statusChangedAt: Date.now(),
      };
      if (input.result === "callback" && input.callbackAt) {
        updateData.callbackAt = input.callbackAt;
      }
      if (input.result === "follow_up") {
        updateData.followUpAt = input.followUpAt || null;
        updateData.followUpNote = input.followUpNote || null;
      }

      if (current) {
        await db
          .update(leadAssignments)
          .set(updateData)
          .where(eq(leadAssignments.subscriptionId, input.subscriptionId));
      } else {
        await db.insert(leadAssignments).values({
          subscriptionId: input.subscriptionId,
          assignedAgent: input.agentName,
          ...updateData,
        });
      }

      return {
        success: true,
        movedToWhatsApp: newWorkStatus === "whatsapp_queue",
        attemptCount: newAttemptCount,
        noAnswerCount: newNoAnswerCount,
        workStatus: newWorkStatus,
      };
    }),

  /**
   * Get call history for a specific subscription.
   */
  getCallHistory: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { attempts: [] };

      const attempts = await db
        .select()
        .from(callAttempts)
        .where(eq(callAttempts.subscriptionId, input.subscriptionId))
        .orderBy(desc(callAttempts.id));

      return { attempts };
    }),

  /**
   * Bulk assign multiple leads to one agent.
   */
  bulkAssign: protectedProcedure
    .input(
      z.object({
        subscriptionIds: z.array(z.string()),
        assignedAgent: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let updated = 0;
      for (const subscriptionId of input.subscriptionIds) {
        const existing = await db
          .select()
          .from(leadAssignments)
          .where(eq(leadAssignments.subscriptionId, subscriptionId))
          .limit(1);

        const updateData: Record<string, any> = {
          assignedAgent: input.assignedAgent,
          assignedAt: input.assignedAgent ? Date.now() : null,
        };

        if (input.assignedAgent && (!existing[0]?.workStatus || existing[0]?.workStatus === "new")) {
          updateData.workStatus = "assigned";
        }

        if (existing.length > 0) {
          await db
            .update(leadAssignments)
            .set(updateData)
            .where(eq(leadAssignments.subscriptionId, subscriptionId));
        }
        updated++;
      }

      return { success: true, updated };
    }),

  /**
   * Get agent workload summary.
   */
  getAgentWorkload: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { workload: [], unassigned: 0 };

    const allAssignments = await db.select().from(leadAssignments);

    const workload = AGENTS.map((agent) => {
      const agentLeads = allAssignments.filter((a) => a.assignedAgent === agent);
      const active = agentLeads.filter((l) =>
        ["assigned", "in_progress", "callback", "follow_up", "no_answer"].includes(l.workStatus || "")
      ).length;
      const retained = agentLeads.filter((l) => l.workStatus === "retained").length;
      const doneDeal = agentLeads.filter((l) => l.workStatus === "done_deal").length;
      const whatsapp = agentLeads.filter((l) => l.workStatus === "whatsapp_queue").length;
      const total = agentLeads.length;

      return { agent, total, active, retained, doneDeal, whatsapp };
    });

    const unassigned = allAssignments.filter((a) => !a.assignedAgent).length;

    return { workload, unassigned };
  }),

  /**
   * Create a new lead manually.
   */
  createLead: adminProcedure
    .input(
      z.object({
        customerName: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        leadType: z.string().optional(),
        leadCategory: z.string().default("subscription"),
        planName: z.string().optional(),
        totalSpend: z.number().default(0),
        monthlyAmount: z.number().default(0),
        urgencyScore: z.number().default(50),
        assignedAgent: z.string().nullable().optional(),
        managerNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const subscriptionId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(leadAssignments).values({
        subscriptionId,
        customerName: input.customerName,
        email: input.email || null,
        phone: input.phone || null,
        leadType: input.leadType || "pre_cycle_cancelled",
        leadCategory: input.leadCategory,
        planName: input.planName || null,
        totalSpend: input.totalSpend,
        monthlyAmount: input.monthlyAmount,
        urgencyScore: input.urgencyScore,
        assignedAgent: input.assignedAgent || null,
        assignedAt: input.assignedAgent ? Date.now() : null,
        workStatus: input.assignedAgent ? "assigned" : "new",
        managerNote: input.managerNote || null,
        eventDate: new Date().toISOString().split("T")[0],
      });

      return { success: true, subscriptionId };
    }),

  /**
   * Delete a lead.
   */
  deleteLead: adminProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(callAttempts).where(eq(callAttempts.subscriptionId, input.subscriptionId));
      await db.delete(leadAssignments).where(eq(leadAssignments.subscriptionId, input.subscriptionId));

      return { success: true };
    }),

  /**
   * Import leads from CSV data (array of lead objects).
   */
  importLeads: adminProcedure
    .input(
      z.object({
        leads: z.array(
          z.object({
            customerName: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            leadType: z.string().optional(),
            leadCategory: z.string().default("subscription"),
            planName: z.string().optional(),
            totalSpend: z.number().default(0),
            monthlyAmount: z.number().default(0),
            urgencyScore: z.number().default(50),
            eventDate: z.string().optional(),
            billingStatus: z.string().optional(),
            cyclesCompleted: z.number().default(0),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let inserted = 0;
      let skipped = 0;

      for (const lead of input.leads) {
        const subscriptionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          // Check for duplicate by email
          if (lead.email) {
            const existing = await db
              .select({ id: leadAssignments.id })
              .from(leadAssignments)
              .where(eq(leadAssignments.email, lead.email))
              .limit(1);
            if (existing.length > 0) {
              skipped++;
              continue;
            }
          }

          await db.insert(leadAssignments).values({
            subscriptionId,
            customerName: lead.customerName,
            email: lead.email || null,
            phone: lead.phone || null,
            leadType: lead.leadType || "pre_cycle_cancelled",
            leadCategory: lead.leadCategory,
            planName: lead.planName || null,
            totalSpend: lead.totalSpend,
            monthlyAmount: lead.monthlyAmount,
            urgencyScore: lead.urgencyScore,
            eventDate: lead.eventDate || new Date().toISOString().split("T")[0],
            billingStatus: lead.billingStatus || null,
            cyclesCompleted: lead.cyclesCompleted,
            workStatus: "new",
          });
          inserted++;
        } catch (e) {
          console.error(`[importLeads] Error importing ${lead.customerName}:`, e);
          skipped++;
        }
      }

      return { success: true, inserted, skipped };
    }),

  /**
   * Get constants for UI dropdowns.
   */
  getConstants: protectedProcedure.query(() => {
    return {
      agents: AGENTS as unknown as string[],
      workStatuses: WORK_STATUSES as unknown as string[],
      callResults: CALL_RESULTS as unknown as string[],
    };
  }),
});
