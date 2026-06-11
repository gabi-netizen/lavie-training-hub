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
import { leadAssignments, callAttempts, contacts, clientSubscriptions, callAnalyses, supportTickets, whatsappMessages, emailLogs, openingTrials, butlerUsageLog } from "../../drizzle/schema";
import { eq, like, or, and, desc, sql, isNull, gte, lte } from "drizzle-orm";
import { stripHtml } from "../utils/stripHtml";
import OpenAI from "openai";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AGENTS = ["Guy", "Rob", "James"] as const;

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

// ─── Auto-link helper ────────────────────────────────────────────────────────

/**
 * For each lead in `rows` that has no contactId, find or create a contact and
 * write the contactId back to lead_assignments. Runs fire-and-forget.
 */
async function autoLinkLeadsToContacts(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: (typeof leadAssignments.$inferSelect)[]
) {
  if (!db) return;

  const unlinked = rows.filter((r) => !r.contactId && (r.email || r.phone));
  if (unlinked.length === 0) return;

  for (const lead of unlinked) {
    try {
      let existingContact: { id: number } | undefined;

      // 1. Match by email
      if (lead.email) {
        const byEmail = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.email, lead.email))
          .limit(1);
        existingContact = byEmail[0];
      }

      // 2. Fall back to phone
      if (!existingContact && lead.phone) {
        const normalizedPhone = lead.phone.replace(/[\s\-().+]/g, "");
        const byPhone = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            or(
              like(contacts.phone, `%${normalizedPhone}%`),
              like(contacts.phone, `%${lead.phone}%`)
            )
          )
          .limit(1);
        existingContact = byPhone[0];
      }

      if (existingContact) {
        await db
          .update(leadAssignments)
          .set({ contactId: existingContact.id })
          .where(eq(leadAssignments.id, lead.id));
      } else {
        // Create a new contact and link it
        const [result] = await db.insert(contacts).values({
          name: lead.customerName || "Unknown",
          email: lead.email || null,
          phone: lead.phone || null,
          department: "retention",
          leadType: lead.leadType || null,
          status: "new",
        });
        const newContactId = (result as any).insertId as number;
        if (newContactId) {
          await db
            .update(leadAssignments)
            .set({ contactId: newContactId })
            .where(eq(leadAssignments.id, lead.id));
        }
      }
    } catch (e) {
      console.error(`[autoLink] Error linking lead ${lead.id}:`, e);
    }
  }
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

      // Auto-link any unlinked leads to contacts (fire-and-forget, non-blocking)
      // Runs in the background every time the Command Centre loads
      autoLinkLeadsToContacts(db, rows).catch((err) =>
        console.error("[getLeads] Auto-link error:", err)
      );

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
          managerNote: row.managerNote ? stripHtml(row.managerNote) : null,
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
          contactId: row.contactId ?? null,
          createdAt: row.createdAt ? row.createdAt.toISOString() : null,
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
        customerNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const subscriptionId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Accept either managerNote or customerNote (n8n may send either field name)
      const rawNote = input.customerNote ?? input.managerNote;
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
        managerNote: rawNote ? stripHtml(rawNote) : null,
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
   * Bulk delete leads by list of DB IDs (primary key).
   * Admin only.
   */
  bulkDeleteLeads: adminProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1, "At least one ID required"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let deleted = 0;
      for (const id of input.ids) {
        // Delete call attempts for this lead first (FK safety)
        // Using raw SQL because DB column is 'leadId' but Drizzle schema has 'subscriptionId'
        await db.execute(sql`DELETE FROM call_attempts WHERE leadId = ${id}`);
        // Delete the lead itself
        await db
          .delete(leadAssignments)
          .where(eq(leadAssignments.id, id));
        deleted++;
      }

      return { success: true, deleted };
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
            customerNote: z.string().optional(),
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
            managerNote: lead.customerNote ? stripHtml(lead.customerNote) : null,
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
   * Link all unlinked leads to contacts.
   * For each lead_assignment where contactId IS NULL:
   *   - Look up contacts by email (or phone)
   *   - If found → set contactId
   *   - If not found → create a new contact with department="retention" and link it
   */
  linkLeadsToContacts: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Find all leads without a contactId
    const unlinkedLeads = await db
      .select()
      .from(leadAssignments)
      .where(isNull(leadAssignments.contactId));

    let linked = 0;
    let created = 0;
    let skipped = 0;

    for (const lead of unlinkedLeads) {
      // Skip leads with no email and no phone — can't match
      if (!lead.email && !lead.phone) {
        skipped++;
        continue;
      }

      try {
        // Try to find existing contact by email first, then phone
        let existingContact: { id: number } | undefined;

        if (lead.email) {
          const byEmail = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.email, lead.email))
            .limit(1);
          existingContact = byEmail[0];
        }

        if (!existingContact && lead.phone) {
          const normalizedPhone = lead.phone.replace(/[\s\-().+]/g, "");
          const byPhone = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              or(
                like(contacts.phone, `%${normalizedPhone}%`),
                like(contacts.phone, `%${lead.phone}%`)
              )
            )
            .limit(1);
          existingContact = byPhone[0];
        }

        if (existingContact) {
          // Link existing contact
          await db
            .update(leadAssignments)
            .set({ contactId: existingContact.id })
            .where(eq(leadAssignments.id, lead.id));
          linked++;
        } else {
          // Create new contact and link it
          const [result] = await db.insert(contacts).values({
            name: lead.customerName || "Unknown",
            email: lead.email || null,
            phone: lead.phone || null,
            department: "retention",
            leadType: lead.leadType || null,
            status: "new",
          });
          const newContactId = (result as any).insertId as number;
          if (newContactId) {
            await db
              .update(leadAssignments)
              .set({ contactId: newContactId })
              .where(eq(leadAssignments.id, lead.id));
            created++;
          }
        }
      } catch (e) {
        console.error(`[linkLeadsToContacts] Error processing lead ${lead.id}:`, e);
        skipped++;
      }
    }

    return { success: true, linked, created, skipped, total: unlinkedLeads.length };
  }),

  /**
   * Get adjacent leads for prev/next navigation on ContactCard.
   * Returns the ordered list of leads for a given agent, sorted by assignmentId ascending,
   * along with the current lead index.
   */
  getAdjacentLeads: protectedProcedure
    .input(
      z.object({
        agentFilter: z.string(),
        currentContactId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { leads: [], currentIndex: -1, total: 0 };

      const rows = await db.select().from(leadAssignments).orderBy(desc(leadAssignments.id));

      // Filter by agent (same as RetentionWorkspace)
      let filtered = rows.filter((r) => r.assignedAgent === input.agentFilter);

      // Sort by assignmentId ascending (same as RetentionWorkspace frontend)
      filtered.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

      const leads = filtered.map((row) => ({
        assignmentId: row.id,
        contactId: row.contactId ?? null,
        subscriptionId: row.subscriptionId,
        customerName: row.customerName ?? "Unknown",
        workStatus: row.workStatus ?? "new",
      }));

      const currentIndex = leads.findIndex((l) => l.contactId === input.currentContactId);

      return { leads, currentIndex, total: leads.length };
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

  /**
   * AI Personal Butler — answers agent questions using their lead data + subscriptions + Stripe.
   */
  askButler: protectedProcedure
    .input(z.object({
      question: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userName = ctx.user!.name || "Agent";

      // Fetch ALL leads (no agent filter - butler sees everything)
      const allLeads = await db
        .select()
        .from(leadAssignments)
        .orderBy(desc(leadAssignments.id))
        .limit(500);

      const totalLeads = allLeads.length;
      const doneDeals = allLeads.filter((l) => l.workStatus === "done_deal").length;
      const newLeads = allLeads.filter((l) => l.workStatus === "new").length;
      const workingLeads = allLeads.filter((l) => l.workStatus === "working").length;
      const callbackLeads = allLeads.filter((l) => l.workStatus === "callback").length;
      const closedLeads = allLeads.filter((l) => l.workStatus === "closed").length;

      // Per-agent breakdown
      const agentNames = Array.from(new Set(allLeads.map((l) => l.assignedAgent).filter(Boolean))) as string[];
      const agentBreakdown = agentNames.map((agent) => {
        const agentLeads = allLeads.filter((l) => l.assignedAgent === agent);
        return `${agent}: ${agentLeads.length} leads (${agentLeads.filter((l) => l.workStatus === "done_deal").length} deals, ${agentLeads.filter((l) => l.workStatus === "new").length} new, ${agentLeads.filter((l) => l.workStatus === "working").length} working, ${agentLeads.filter((l) => l.workStatus === "callback").length} callbacks, ${agentLeads.filter((l) => l.workStatus === "closed").length} closed)`;
      }).join("\n");

      // Get ALL recent call attempts
      const recentCalls = await db
        .select()
        .from(callAttempts)
        .orderBy(desc(callAttempts.id))
        .limit(50);

      // Fetch ALL client subscriptions
      const allSubs = await db
        .select()
        .from(clientSubscriptions)
        .orderBy(desc(clientSubscriptions.id))
        .limit(300);

      const liveSubs = allSubs.filter((s) => s.status === "live").length;
      const dunningSubs = allSubs.filter((s) => s.status === "dunning").length;
      const cancelledSubs = allSubs.filter((s) => s.status === "cancelled").length;
      const totalSubsAmount = allSubs.filter((s) => s.status === "live").reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);

      // ─── STRIPE API (real-time) ───────────────────────────────────────────────
      let stripeContext = "";
      const questionLower = input.question.toLowerCase();
      const paymentKeywords = ["payment", "card", "stripe", "charge", "paid", "declined", "refund", "transaction", "slik", "slika", "tashlum", "dispute", "chargeback", "invoice", "subscription"];
      if (paymentKeywords.some((kw) => questionLower.includes(kw))) {
        try {
          const stripeKey = process.env.STRIPE_BILLING_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };

            // Recent charges (last 15)
            const chargesRes = await fetch("https://api.stripe.com/v1/charges?limit=15", { headers: stripeHeaders });
            if (chargesRes.ok) {
              const chargesData = await chargesRes.json();
              const charges = chargesData.data || [];
              if (charges.length > 0) {
                stripeContext += `\n--- STRIPE RECENT CHARGES (last 15) ---\n${charges.map((c: any) => `- £${(c.amount / 100).toFixed(2)} | ${c.status}${c.refunded ? " (REFUNDED)" : ""} | ${c.billing_details?.name || "Unknown"} | ${c.billing_details?.email || ""} | ${new Date(c.created * 1000).toLocaleDateString("en-GB")}`).join("\n")}\n`;
              }
            }

            // Recent disputes
            const disputesRes = await fetch("https://api.stripe.com/v1/disputes?limit=10", { headers: stripeHeaders });
            if (disputesRes.ok) {
              const disputesData = await disputesRes.json();
              const disputes = disputesData.data || [];
              if (disputes.length > 0) {
                stripeContext += `\n--- STRIPE DISPUTES (last 10) ---\n${disputes.map((d: any) => `- £${(d.amount / 100).toFixed(2)} | Status: ${d.status} | Reason: ${d.reason} | ${new Date(d.created * 1000).toLocaleDateString("en-GB")}`).join("\n")}\n`;
              }
            }

            // Recent refunds
            const refundsRes = await fetch("https://api.stripe.com/v1/refunds?limit=10", { headers: stripeHeaders });
            if (refundsRes.ok) {
              const refundsData = await refundsRes.json();
              const refunds = refundsData.data || [];
              if (refunds.length > 0) {
                stripeContext += `\n--- STRIPE REFUNDS (last 10) ---\n${refunds.map((r: any) => `- £${(r.amount / 100).toFixed(2)} | Status: ${r.status} | Reason: ${r.reason || "-"} | ${new Date(r.created * 1000).toLocaleDateString("en-GB")}`).join("\n")}\n`;
              }
            }
          }
        } catch (e) {
          // Stripe check failed silently
        }
      }

      // ─── ZOHO BILLING API (real-time) ──────────────────────────────────────────
      let zohoContext = "";
      const zohoKeywords = ["zoho", "billing", "subscription", "cancel", "dunning", "plan", "renew", "מנוי", "ביטול", "חיוב", "installment", "cycle"];
      if (zohoKeywords.some((kw) => questionLower.includes(kw))) {
        try {
          const { zohoGet } = await import("./billing");

          // Get recent subscriptions (live + cancelled)
          const liveRes = await zohoGet("/subscriptions?per_page=25&page=1&status=live");
          const liveSubs2 = liveRes.subscriptions || [];

          if (liveSubs2.length > 0) {
            zohoContext += `\n--- ZOHO BILLING - LIVE SUBSCRIPTIONS (last 25) ---\n${liveSubs2.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Agent: ${s.salesperson_name || "-"} | Created: ${s.created_time?.split("T")[0] || "-"} | Next: ${s.next_billing_at || "-"}`).join("\n")}\n`;
          }

          // If question mentions cancel/dunning, fetch those too
          if (["cancel", "ביטול", "dunning"].some((kw) => questionLower.includes(kw))) {
            const cancelRes = await zohoGet("/subscriptions?per_page=15&page=1&status=cancelled");
            const cancelledSubs2 = cancelRes.subscriptions || [];
            if (cancelledSubs2.length > 0) {
              zohoContext += `\n--- ZOHO BILLING - RECENTLY CANCELLED (last 15) ---\n${cancelledSubs2.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Agent: ${s.salesperson_name || "-"} | Cancelled: ${s.cancelled_at || "-"}`).join("\n")}\n`;
            }
          }
        } catch (e) {
          // Zoho check failed silently
        }
      }

      // ─── SMART TARGETED SEARCH ───────────────────────────────────────────────
      // Instead of loading all messages/emails, we detect if the question mentions
      // a specific customer (name/email/phone) and load ONLY their history.
      // For general questions, we load summary counts only.

      // Extract potential customer identifiers from the question
      const questionWords = input.question.toLowerCase();
      // Try to find a customer name in the question by matching against known leads/subs
      let targetContactIds: number[] = [];
      let targetName = "";
      let targetEmail = "";
      let targetPhone = "";

      // Check if question mentions a known customer name
      const allCustomerNames = [
        ...allLeads.map((l) => l.customerName).filter(Boolean),
        ...allSubs.map((s) => s.customerName).filter(Boolean),
      ] as string[];
      const uniqueNames = Array.from(new Set(allCustomerNames));
      for (const name of uniqueNames) {
        if (name && questionWords.includes(name.toLowerCase())) {
          targetName = name;
          break;
        }
      }

      // Also check for email patterns in the question
      const emailMatch = input.question.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
      if (emailMatch) targetEmail = emailMatch[0];

      // Check for phone patterns
      const phoneMatch = input.question.match(/\+?[\d\s-]{10,15}/);
      if (phoneMatch) targetPhone = phoneMatch[0].replace(/\s/g, "");

      // If we found a target, look up their contactId(s)
      if (targetName || targetEmail || targetPhone) {
        try {
          const conditions = [];
          if (targetName) conditions.push(like(contacts.name, `%${targetName}%`));
          if (targetEmail) conditions.push(eq(contacts.email, targetEmail));
          if (targetPhone) conditions.push(like(contacts.phone, `%${targetPhone}%`));
          const matchedContacts = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(conditions.length > 1 ? or(...conditions) : conditions[0])
            .limit(5);
          targetContactIds = matchedContacts.map((c) => c.id);
        } catch (e) { /* contacts table might not exist */ }
      }

      // Fetch AI Coach call analyses (recent 50)
      let callAnalysesContext = "";
      try {
        const analyses = await db
          .select()
          .from(callAnalyses)
          .orderBy(desc(callAnalyses.id))
          .limit(50);
        if (analyses.length > 0) {
          callAnalysesContext = `\n--- AI COACH - RECENT CALL ANALYSES (last 50) ---\n${analyses.map((a) => `- ${a.repName || "Unknown"} | ${a.customerName || "?"} | Score: ${a.overallScore || "-"}/10 | Close: ${a.closeStatus || "-"} | Type: ${a.callType || "-"} | Duration: ${a.durationSeconds ? Math.round(a.durationSeconds / 60) + "min" : "-"} | Date: ${a.callDate ? new Date(a.callDate).toLocaleDateString("en-GB") : "-"}`).join("\n")}\n`;
        }
      } catch (e) { /* table might not exist */ }

      // Fetch Support Tickets — targeted if customer found, otherwise recent 30
      let ticketsContext = "";
      try {
        let tickets;
        if (targetEmail || targetName) {
          const tConditions = [];
          if (targetEmail) tConditions.push(eq(supportTickets.fromEmail, targetEmail));
          if (targetName) tConditions.push(like(supportTickets.fromName, `%${targetName}%`));
          tickets = await db
            .select()
            .from(supportTickets)
            .where(tConditions.length > 1 ? or(...tConditions) : tConditions[0])
            .orderBy(desc(supportTickets.id))
            .limit(50);
        } else {
          tickets = await db
            .select()
            .from(supportTickets)
            .orderBy(desc(supportTickets.id))
            .limit(30);
        }
        if (tickets.length > 0) {
          ticketsContext = `\n--- SUPPORT TICKETS${targetName ? " for " + targetName : ""} (${tickets.length}) ---\n${tickets.map((t) => `- ${t.fromName || t.fromEmail || "Unknown"} | Subject: ${t.subject || "-"} | Category: ${t.category || "-"} | Status: ${t.status || "open"} | Date: ${t.receivedAt ? new Date(t.receivedAt).toLocaleDateString("en-GB") : "-"}`).join("\n")}\n`;
        }
      } catch (e) { /* table might not exist */ }

      // Fetch WhatsApp messages — targeted if customer found, otherwise recent summary
      let whatsappContext = "";
      try {
        let messages;
        if (targetContactIds.length > 0) {
          // Get ALL messages for this specific customer
          messages = await db
            .select()
            .from(whatsappMessages)
            .where(sql`${whatsappMessages.contactId} IN (${sql.join(targetContactIds.map(id => sql`${id}`), sql`, `)})`)
            .orderBy(desc(whatsappMessages.id))
            .limit(100);
        } else if (targetPhone) {
          // Search by phone number
          messages = await db
            .select()
            .from(whatsappMessages)
            .where(or(
              like(whatsappMessages.fromNumber, `%${targetPhone}%`),
              like(whatsappMessages.toNumber, `%${targetPhone}%`)
            ))
            .orderBy(desc(whatsappMessages.id))
            .limit(100);
        } else {
          // General: just count + last 10 for overview
          messages = await db
            .select()
            .from(whatsappMessages)
            .orderBy(desc(whatsappMessages.id))
            .limit(10);
        }
        if (messages.length > 0) {
          const label = targetName || targetPhone ? ` for ${targetName || targetPhone}` : " (recent 10)";
          whatsappContext = `\n--- WHATSAPP MESSAGES${label} (${messages.length}) ---\n${messages.map((m) => `- ${m.direction === "inbound" ? "FROM" : "TO"} ${m.toNumber || m.fromNumber || "?"} | ${(m.body || "").substring(0, 120)} | ${m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-GB") : "-"}`).join("\n")}\n`;
        }
      } catch (e) { /* table might not exist */ }

      // Fetch Email logs — targeted if customer found, otherwise recent summary
      let emailContext = "";
      try {
        let emails;
        if (targetContactIds.length > 0) {
          // Get ALL emails for this specific customer
          emails = await db
            .select()
            .from(emailLogs)
            .where(sql`${emailLogs.contactId} IN (${sql.join(targetContactIds.map(id => sql`${id}`), sql`, `)})`)
            .orderBy(desc(emailLogs.id))
            .limit(50);
        } else if (targetEmail) {
          emails = await db
            .select()
            .from(emailLogs)
            .where(eq(emailLogs.toEmail, targetEmail))
            .orderBy(desc(emailLogs.id))
            .limit(50);
        } else {
          // General: just last 10 for overview
          emails = await db
            .select()
            .from(emailLogs)
            .orderBy(desc(emailLogs.id))
            .limit(10);
        }
        if (emails.length > 0) {
          const label = targetName || targetEmail ? ` for ${targetName || targetEmail}` : " (recent 10)";
          emailContext = `\n--- SENT EMAILS${label} (${emails.length}) ---\n${emails.map((em) => `- To: ${em.toEmail || "?"} | Template: ${em.templateName || "-"} | Subject: ${em.subject || "-"} | Sent by: ${em.sentByName || "-"} | Opened: ${em.openCount > 0 ? "Yes (" + em.openCount + "x)" : "No"} | Date: ${em.sentAt ? new Date(em.sentAt).toLocaleDateString("en-GB") : "-"}`).join("\n")}\n`;
        }
      } catch (e) { /* table might not exist */ }

      // ─── OPENING TRIALS DATA (from opening_trials table — synced from Zoho) ───
      let openingContext = "";
      try {
        // Get current month in YYYY-MM format
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        const todayStr = now.toISOString().split("T")[0];

        // Fetch all opening trials for current month
        const monthTrials = await db
          .select()
          .from(openingTrials)
          .where(eq(openingTrials.month, currentMonth));

        if (monthTrials.length > 0) {
          // Per-agent summary for the month
          const openingAgentMap = new Map<string, { total: number; today: number; yesterday: number; classifications: Record<string, number> }>();
          for (const t of monthTrials) {
            const agent = t.agentName || "Unknown";
            if (!openingAgentMap.has(agent)) {
              openingAgentMap.set(agent, { total: 0, today: 0, yesterday: 0, classifications: {} });
            }
            const entry = openingAgentMap.get(agent)!;
            entry.total++;
            const tDate = typeof t.createdDate === "string" ? t.createdDate : (t.createdDate as Date)?.toISOString?.().split("T")[0] || "";
            if (tDate === todayStr) entry.today++;
            if (tDate === yesterdayStr) entry.yesterday++;
            const cls = t.classification || "unknown";
            entry.classifications[cls] = (entry.classifications[cls] || 0) + 1;
          }

          const openingAgentBreakdown = Array.from(openingAgentMap.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .map(([agent, data]) => {
              const clsStr = Object.entries(data.classifications).map(([k, v]) => `${k}:${v}`).join(", ");
              return `${agent}: ${data.total} trials this month (today: ${data.today}, yesterday: ${data.yesterday}) [${clsStr}]`;
            }).join("\n");

          // Total summary
          const totalTrialsMonth = monthTrials.length;
          const totalToday = monthTrials.filter((t) => { const d = typeof t.createdDate === "string" ? t.createdDate : (t.createdDate as Date)?.toISOString?.().split("T")[0] || ""; return d === todayStr; }).length;
          const totalYesterday = monthTrials.filter((t) => { const d = typeof t.createdDate === "string" ? t.createdDate : (t.createdDate as Date)?.toISOString?.().split("T")[0] || ""; return d === yesterdayStr; }).length;
          const stillInTrial = monthTrials.filter((t) => t.classification === "still_in_trial").length;
          const matured = totalTrialsMonth - stillInTrial;
          const converted = monthTrials.filter((t) => ["live", "saved_by_retention", "cancelled_after_payment"].includes(t.classification)).length;

          openingContext = `\n--- OPENING TRIALS (${currentMonth}) — from Zoho Subscriptions ---\nTotal Trials This Month: ${totalTrialsMonth}\nToday (${todayStr}): ${totalToday}\nYesterday (${yesterdayStr}): ${totalYesterday}\nStill in Trial: ${stillInTrial}\nMatured: ${matured}\nConverted: ${converted}\nConversion Rate: ${matured > 0 ? ((converted / matured) * 100).toFixed(1) + "%" : "N/A"}\n\nPer Opening Agent:\n${openingAgentBreakdown}\n\nRecent Trials (last 20):\n${monthTrials.slice(-20).map((t) => `- ${t.agentName} | ${t.customerName || "?"} | ${t.createdDate} | ${t.classification} | Plan: ${t.planName || "-"}`).join("\n")}\n`;
        }
      } catch (e) { /* opening_trials table might not exist */ }

      // Build context for the AI
      const dataContext = `
User asking: ${userName}
Date: ${new Date().toLocaleDateString("en-GB")}

--- OVERALL RETENTION LEAD SUMMARY ---
Total Leads: ${totalLeads}
New (untouched): ${newLeads}
Working: ${workingLeads}
Callbacks Pending: ${callbackLeads}
Done Deals: ${doneDeals}
Closed (lost): ${closedLeads}

--- RETENTION PER-AGENT BREAKDOWN ---
${agentBreakdown}
${openingContext}
--- CLIENT SUBSCRIPTIONS SUMMARY ---
Total Clients: ${allSubs.length}
Live: ${liveSubs}
Dunning: ${dunningSubs}
Cancelled: ${cancelledSubs}
Total Monthly Revenue (live): £${totalSubsAmount.toFixed(2)}

--- ALL RETENTION LEADS (last 100) ---
${allLeads.slice(0, 100).map((l) => `- ${l.customerName || "Unknown"} | ${l.email || ""} | Phone: ${l.phone || ""} | Type: ${l.leadType || ""} | Status: ${l.workStatus || "new"} | Agent: ${l.assignedAgent || "unassigned"} | Note: ${l.agentNote || "-"}`).join("\n")}

--- CLIENT SUBSCRIPTIONS (last 50) ---
${allSubs.slice(0, 50).map((s) => `- ${s.customerName} | ${s.email || ""} | Plan: ${s.planName || s.planType} | £${s.amount || "0"}/cycle | Total: £${s.totalAmount || "-"} | Status: ${s.status} | Cycles: ${s.cyclesCompleted || 0}/${s.billingCycles || "∞"} | Next: ${s.nextBillingOn || "-"} | Agent: ${s.salesPerson || "-"}`).join("\n")}

--- RECENT CALL ATTEMPTS (last 30) ---
${recentCalls.slice(0, 30).map((c) => `- Agent: ${c.agentName || "?"} | Result: ${c.result || "unknown"} | Note: ${c.note || "-"} | Date: ${c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB") : "-"}`).join("\n")}
${stripeContext}${zohoContext}${callAnalysesContext}${ticketsContext}${whatsappContext}${emailContext}`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        messages: [
          {
            role: "system",
            content: `You are a personal sales & retention assistant (butler) for an agent at Lavie Labs, a UK medical-grade skincare company. You have access to their lead data, client subscriptions, call history, and payment information.

Your job:
1. Answer data questions quickly and accurately (stats, customer info, payment status)
2. Help during live calls — give quick tips, objection handling, upsell suggestions
3. Provide retention strategies based on the customer's history
4. Help with sales techniques and scripts when asked
5. Coach the agent in real-time during calls

=== PRODUCTS ===
- Matinika (Day & Night Cream): 32% Hyaluronic Acid — 6x more than high-street. Medical-grade hydration. Replaces moisturiser + serum + anti-ageing. Silky, lightweight. Instant hydration and glow. Worth £59.
- Oulala (Retinol Serum): Face & Neck. Gold standard anti-ageing. Sweeps dead cells. Tighter, smoother, lines soften. Plump, youthful radiance.
- Ashkara (Eye Serum): Dark circles, puffiness, fine lines. Like 8 hours of sleep in a bottle. Apply mornings & evenings.

=== PRICING & OFFER ===
- Trial: £4.95 (covers premium 48-hour tracked delivery with signature)
- Product is FREE for 21 days
- After 21 days: subscription begins at £44.95/60 days (30% VIP discount locked in forever)
- Cancel, pause, or change anytime with one click or email
- Installment plans: various (split payments)

=== LIVE CALL SCRIPT — OPENING ===
"Hi [Name], my name is [Your Name] calling from Lavie Labs — how are you today? I'm calling because you recently expressed interest in our skincare range, and I just wanted to have a quick chat to find out a little more about you and your skin."

Magic Wand Question: "If you could wave a magic wand and change one thing about your skin — just one thing — what would it be?"
Note: Write down her exact answer. Every pitch and close must tie back to this.

Qualify: "How long have you been dealing with that? And have you tried anything before to help with it?"
Note: Let her talk. The more she describes the problem, the more she wants the solution.

=== CHEAT SHEET — QUICK OPENING (HIGH ENERGY) ===
"Hi [Name], it's [Your Name] from Lavie Labs. We're a medical-grade skincare company working in partnership with UK Best Offers. We're calling today to send you a complimentary Anti-Ageing Starter Kit to try!"
"Because our products are medical-grade and highly active, I just need to ask a few quick questions to make sure we send you the perfect match for your skin. Would you say your skin is more on the dry side, combination, or oily?"

If Dry: "Have you always had drier skin, or is this a recent change? Do you get that tight, uncomfortable feeling after showering?"
If Combination: "Has it always been combination? Does your T-zone get shiny while cheeks feel tight?"
If Oily: "Have you always struggled with oily skin? Do you blot throughout the day? Prone to breakouts?"

=== PRODUCT PITCH — MATINIKA ===
"So based on what you've told me about [her concern], I want to tell you about something that will genuinely change how your skin feels. This isn't just another moisturiser."
"Matinika is a medical-grade formula with the highest concentration of Hyaluronic Acid available without a prescription. That tight, dry feeling is going to disappear. You're going to wake up with skin that feels plump, bouncy, and genuinely hydrated."
"High-street creams contain around 5% Hyaluronic Acid. Matinika contains 32%. That is the difference between surface hydration and deep, lasting change."

=== PRODUCT PITCH — OULALA & ASHKARA ===
"Alongside Matinika, we also have Oulala — our medical-grade retinol serum. Retinol is clinically proven to smooth fine lines and improve skin texture. You'll wake up looking genuinely refreshed."
"For the eye area — the first place we see tiredness and ageing — we have Ashkara. It's like eight hours of sleep in a bottle. Wide awake, bright-eyed, refreshed every morning."

=== THE CLOSE ===
"Here is what I'd love to do for you today. I want to send you the full Matinika cream — worth £59 — completely free. All I ask is £4.95 to cover our premium 48-hour tracked delivery with signature on arrival. No catch, no commitment."
"After your 21 days, if you love it — it automatically continues as a subscription so you never run out. But you are in complete control. Cancel, pause, or change at any time."
"Brilliant! Let me take your details. Can I start with your full name?"
IMPORTANT: After the close — STOP TALKING. Do not add anything. Just take the details.
"Will you be using Visa, Mastercard, or Amex for the £4.95 postage?"

=== CONFIRMATION SCRIPT ===
"Today it is just £4.95 for the premium tracked shipping. You are receiving your Matinika and your starter [Oulala/Ashkara]."
"In 21 days, if you're loving your results — your subscription will begin at your exclusive 30% VIP discount."
"For best results, use Matinika morning and night on clean skin. A little goes a long way."
"I'm your personal skincare concierge — if you ever need anything, I'm right here."

=== OBJECTION HANDLING ===

1. "It's a subscription?"
→ "Yes, after your 21-day free trial it transitions into a subscription — so you never run out. But you are in complete control. Cancel, pause, or change anytime with one click or email. Most ladies keep it because they fall in love with their skin — and it locks in your 30% VIP discount forever."

2. "I don't trust giving my card details"
→ "I respect that — it tells me you're smart. Lavie Labs is a fully regulated UK company. Thousands of happy customers on Trustpilot. Fully encrypted, secure payment processing. You can cancel anytime with one email or one click. The £4.95 covers our premium 48-hour tracked delivery with signature on arrival — so your package is always safe."

3. "Too many products already"
→ "I hear that all the time. If your cabinet is full, those products probably promised results and didn't deliver. That's exactly why Matinika replaces them all. It's completely free for 21 days — just try it and let it prove itself against everything else. No commitment, no pressure."

4. "Need to think about it"
→ "The trial is completely risk-free. You're not committing — just trying. Cancel with one click, any time."

5. "Is it really medical-grade?"
→ "32% active Hyaluronic Acid — 6x more than anything on the high street. Formulated by dermatologists. Not available in shops — only direct from Lavie Labs."

=== RAPPORT RULES ===
- The first 3 seconds decide everything. Smile physically before you speak.
- Speak 20% slower than feels natural. Drop your pitch lower — calm, warm voice builds trust.
- Echo her exact words back. She said "tired" = use "tired", not "lack of radiance".
- Let her talk. The more she describes the problem, the more she wants the solution.
- After the close, SILENCE. Don't fill it. Silence is part of the close.

Rapport Killers (AVOID):
1. Jumping to the pitch before she's finished talking
2. Saying "I understand" without proving it (repeat what she said)
3. Talking about the product before talking about HER
4. Using words she didn't use
5. Talking after the close — STOP after asking for card type

=== RETENTION STRATEGIES ===
- Downsell: offer reduced price, skip a month, or smaller package
- Education: skincare takes 4-6 weeks to show full results
- Empathy: acknowledge concern BEFORE offering solutions
- Urgency: "I can offer this discount only on this call"
- Saved by Retention: customer cancelled but we saved them with a better offer
- Win-back: customer left, calling to bring them back with special offer

=== IMPORTANT DATA TERMINOLOGY ===
- For OPENING agents: "deals" / "עסקאות" / "sales" / "openings" = the total number of TRIALS opened (all classifications: still_in_trial + cancelled_before_payment + live + saved_by_retention etc). Every trial counts as a deal/sale for Opening agents.
- For RETENTION agents: "deals" = leads with workStatus='done_deal' or 'retained_sub'
- When asked "how many deals did [Opening agent] close yesterday" — count ALL their trials from that date in opening_trials table, regardless of classification.
- "Conversion" = only trials that matured AND became live/saved. This is different from total trials opened.

Format: Keep responses short and actionable. Use bold (**text**) for key numbers. If agent is on a live call, give bullet-point quick answers they can read instantly.

LANGUAGE: Respond in the same language the user asks in. If they ask in Hebrew — answer in Hebrew. If they ask in English — answer in English. However, when quoting scripts, pitches, or objection responses — ALWAYS keep those in English (because agents use them in English with customers). Only translate your explanations, not the scripts themselves.`,
          },
          // Include conversation history for context continuity
          ...(input.history || []).map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
          {
            role: "user" as const,
            content: `Here is my current data:\n${dataContext}\n\nMy question: ${input.question}`,
          },
        ],
      });

      const answer = response.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

      // ─── Log usage to butler_usage_log ───────────────────────────────────────
      try {
        const usage = response.usage;
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const totalTokens = usage?.total_tokens || 0;
        // GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output
        const costUsd = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);

        await db.insert(butlerUsageLog).values({
          userId: ctx.user.id,
          userName: userName,
          question: input.question.substring(0, 500),
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd: costUsd.toFixed(6),
        });
      } catch (e) {
        // Usage logging failed silently — don't break the response
      }

      return { answer };
    }),

  // ─── Butler Usage Stats (admin only) ─────────────────────────────────────────
  getButlerUsage: adminProcedure
    .input(z.object({
      period: z.enum(["today", "7days", "thisMonth", "lastMonth", "30days", "all"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const period = input?.period || "30days";

      let dateFilter = "";
      let dateFilterEnd = "";
      const now = new Date();
      if (period === "today") {
        dateFilter = now.toISOString().split("T")[0];
      } else if (period === "7days") {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        dateFilter = d.toISOString().split("T")[0];
      } else if (period === "thisMonth") {
        dateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      } else if (period === "lastMonth") {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateFilter = lm.toISOString().split("T")[0];
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        dateFilterEnd = lmEnd.toISOString().split("T")[0];
      } else if (period === "30days") {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        dateFilter = d.toISOString().split("T")[0];
      }

      let rows: any[];
      if (dateFilter && dateFilterEnd) {
        rows = await db
          .select()
          .from(butlerUsageLog)
          .where(and(gte(butlerUsageLog.createdAt, new Date(dateFilter)), lte(butlerUsageLog.createdAt, new Date(dateFilterEnd + "T23:59:59"))))
          .orderBy(desc(butlerUsageLog.createdAt));
      } else if (dateFilter) {
        rows = await db
          .select()
          .from(butlerUsageLog)
          .where(gte(butlerUsageLog.createdAt, new Date(dateFilter)))
          .orderBy(desc(butlerUsageLog.createdAt));
      } else {
        rows = await db
          .select()
          .from(butlerUsageLog)
          .orderBy(desc(butlerUsageLog.createdAt));
      }

      // Aggregate per agent
      const agentMap = new Map<string, { questions: number; totalTokens: number; totalCost: number; lastUsed: Date | null }>();
      for (const row of rows) {
        const agent = row.userName || "Unknown";
        if (!agentMap.has(agent)) {
          agentMap.set(agent, { questions: 0, totalTokens: 0, totalCost: 0, lastUsed: null });
        }
        const entry = agentMap.get(agent)!;
        entry.questions++;
        entry.totalTokens += row.totalTokens || 0;
        entry.totalCost += parseFloat(row.estimatedCostUsd || "0");
        if (!entry.lastUsed || (row.createdAt && row.createdAt > entry.lastUsed)) {
          entry.lastUsed = row.createdAt;
        }
      }

      const perAgent = Array.from(agentMap.entries())
        .map(([name, data]) => ({
          name,
          questions: data.questions,
          totalTokens: data.totalTokens,
          totalCost: data.totalCost.toFixed(4),
          lastUsed: data.lastUsed?.toISOString() || null,
        }))
        .sort((a, b) => b.questions - a.questions);

      const totalQuestions = rows.length;
      const totalTokensAll = rows.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
      const totalCostAll = rows.reduce((sum, r) => sum + parseFloat(r.estimatedCostUsd || "0"), 0);

      return {
        perAgent,
        totals: {
          questions: totalQuestions,
          tokens: totalTokensAll,
          cost: totalCostAll.toFixed(4),
        },
        recentQuestions: rows.slice(0, 50).map((r) => ({
          userName: r.userName,
          question: r.question,
          tokens: r.totalTokens,
          cost: r.estimatedCostUsd,
          date: r.createdAt?.toISOString() || null,
        })),
      };
    }),
});
