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
import { leadAssignments, callAttempts, contacts, clientSubscriptions, callAnalyses, supportTickets, whatsappMessages, emailLogs, openingTrials, butlerUsageLog, users, contactCallNotes } from "../../drizzle/schema";
import { addCallNote, updateContact, normalisePhone } from "../contacts";
import { eq, like, or, and, desc, sql, isNull, gte, lte, inArray } from "drizzle-orm";
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
            const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bDate - aDate; // newest first
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
        // Keep status as "new" when assigning — agent sees it as a new lead to work on
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
          workStatus: input.workStatus || "new",
          managerNote: input.managerNote || null,
          callbackAt: input.callbackAt || null,
        });
      }

      const result = await db
        .select()
        .from(leadAssignments)
        .where(eq(leadAssignments.subscriptionId, input.subscriptionId))
        .limit(1);

      // Also save agent note to ContactCard notes (if contactId exists)
      // Logic: if a note from the same agent exists TODAY, update it. Otherwise create new.
      if (input.agentNote && result[0]?.contactId) {
        try {
          const cId = result[0].contactId;
          const agent = result[0].assignedAgent || "Retention Agent";
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          // Check if there's already a note from this agent today for this contact
          const existing = await db.select()
            .from(contactCallNotes)
            .where(and(
              eq(contactCallNotes.contactId, cId),
              eq(contactCallNotes.agentName, agent),
              gte(contactCallNotes.createdAt, todayStart)
            ))
            .limit(1);
          if (existing.length > 0) {
            // Update existing note from today
            await db.update(contactCallNotes)
              .set({ note: input.agentNote, statusAtTime: result[0].workStatus || undefined })
              .where(eq(contactCallNotes.id, existing[0].id));
          } else {
            // Create new note (different day)
            await addCallNote({
              contactId: cId,
              agentName: agent,
              note: input.agentNote,
              statusAtTime: result[0].workStatus || undefined,
            });
          }
        } catch (e) {
          // Don't fail the main mutation if note sync fails
          console.error("[assignLead] Failed to sync note to ContactCard:", e);
        }
      }

      // Sync workStatus to contact.status (if contactId exists)
      if (input.workStatus && result[0]?.contactId) {
        const STATUS_MAP: Record<string, string> = {
          no_answer: "no_answer",
          done_deal: "done_deal",
          retained: "done_deal",
          retained_sub: "done_deal",
          closed: "closed",
          not_interested: "closed",
          callback: "working",
          working: "working",
          assigned: "assigned",
          new: "new",
        };
        const contactStatus = STATUS_MAP[input.workStatus];
        if (contactStatus) {
          try {
            await updateContact(result[0].contactId, { status: contactStatus as any });
          } catch (e) {
            console.error("[assignLead] Failed to sync status to contact:", e);
          }
        }
      }

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

      // First try lead_assignments
      const rows = await db.select().from(leadAssignments).orderBy(desc(leadAssignments.id));
      let filtered = rows.filter((r) => r.assignedAgent === input.agentFilter);

      if (filtered.length > 0) {
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
      }

      // Fallback: use client_subscriptions (My Clients tab data source)
      const csRows = await db
        .select()
        .from(clientSubscriptions)
        .where(
          and(
            eq(clientSubscriptions.salesPerson, input.agentFilter),
            eq(clientSubscriptions.status, "live")
          )
        )
        .orderBy(clientSubscriptions.id);

      const leads = csRows.map((row) => ({
        assignmentId: row.id,
        contactId: row.contactId ?? null,
        subscriptionId: row.subscriptionId,
        customerName: row.customerName ?? "Unknown",
        workStatus: "live" as string,
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

      // ─── EXTRACT CUSTOMER IDENTIFIERS (used by Zoho/Stripe/targeted search) ───
      const questionLower = input.question.toLowerCase();
      let targetContactIds: number[] = [];
      let targetName = "";
      let targetEmail = "";
      let targetPhone = "";

      // Check if question mentions a known customer name from DB
      const allCustomerNames = [
        ...allLeads.map((l) => l.customerName).filter(Boolean),
        ...allSubs.map((s) => s.customerName).filter(Boolean),
      ] as string[];
      const uniqueNames = Array.from(new Set(allCustomerNames));
      for (const name of uniqueNames) {
        if (name && name.length > 2 && questionLower.includes(name.toLowerCase())) {
          targetName = name;
          break;
        }
      }
      // Check for email patterns in the question
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
            .select({ id: contacts.id, email: contacts.email })
            .from(contacts)
            .where(conditions.length > 1 ? or(...conditions) : conditions[0])
            .limit(5);
          targetContactIds = matchedContacts.map((c) => c.id);
          // If we found a contact by name but don't have email yet, grab it
          if (!targetEmail && matchedContacts.length > 0 && matchedContacts[0].email) {
            targetEmail = matchedContacts[0].email;
          }
        } catch (e) { /* contacts table might not exist */ }
      }

      // ─── STRIPE API (real-time) ───────────────────────────────────────────────
      let stripeContext = "";
      const paymentKeywords = ["payment", "card", "stripe", "charge", "paid", "declined", "refund", "transaction", "slik", "slika", "tashlum", "dispute", "chargeback", "invoice", "subscription", "תשלום", "כרטיס", "סליקה", "החזר", "דיספיוט", "חשבונית", "token", "תוקן", "pm_", "payment method", "google pay", "gpay", "apple pay", "pay form", "pay link"];
      if (paymentKeywords.some((kw) => questionLower.includes(kw)) || targetEmail) {
        try {
          const stripeKey = process.env.STRIPE_BILLING_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
            // Customer-specific search by email
            if (targetEmail) {
              try {
                const custRes = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(targetEmail)}&limit=5`, { headers: stripeHeaders });
                if (custRes.ok) {
                  const custData = await custRes.json();
                  const customers = custData.data || [];
                  if (customers.length > 0) {
                    const custId = customers[0].id;
                    const custChargesRes = await fetch(`https://api.stripe.com/v1/charges?customer=${custId}&limit=25`, { headers: stripeHeaders });
                    if (custChargesRes.ok) {
                      const custChargesData = await custChargesRes.json();
                      const custCharges = custChargesData.data || [];
                      if (custCharges.length > 0) {
                        stripeContext += `\n--- STRIPE CHARGES FOR ${targetEmail} (${custCharges.length} found) ---\n${custCharges.map((c: any) => `- \u00a3${(c.amount / 100).toFixed(2)} | ${c.status}${c.refunded ? " (REFUNDED)" : ""} | ${c.billing_details?.name || "Unknown"} | ${c.billing_details?.email || ""} | PaymentMethod: ${c.payment_method || "-"} | ${new Date(c.created * 1000).toLocaleDateString("en-GB")}`).join("\n")}\n`;
                        // Extract payment method token from the most recent succeeded £4.95 charge
                        const trialCharge = custCharges.find((c: any) => c.amount === 495 && c.status === "succeeded" && c.payment_method);
                        if (trialCharge && trialCharge.payment_method) {
                          const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${trialCharge.payment_method}`, { headers: stripeHeaders });
                          if (pmRes.ok) {
                            const pm = await pmRes.json();
                            const bd = trialCharge.billing_details || {};
                            // Try billing_details address first, then fall back to Customer object address
                            let addr = bd.address || {};
                            let fullAddress = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(", ");
                            // If billing_details only has country, pull address from Customer object
                            if (!addr.line1 && customers[0]?.address) {
                              const custAddr = customers[0].address;
                              fullAddress = [custAddr.line1, custAddr.line2, custAddr.city, custAddr.state, custAddr.postal_code, custAddr.country].filter(Boolean).join(", ");
                            }
                            // Customer name: prefer billing_details, fallback to Customer object
                            const custName = bd.name || customers[0]?.name || "Not provided";
                            // Customer email: prefer billing_details, fallback to Customer object, then targetEmail
                            const custEmail = bd.email || customers[0]?.email || targetEmail;
                            stripeContext += `\n--- PAYMENT TOKEN FOR ZOHO BILLING ---\nPayment Method ID (Token): ${pm.id}\nCard: ${pm.card?.brand} ****${pm.card?.last4} (exp ${pm.card?.exp_month}/${pm.card?.exp_year})\nStripe Customer ID: ${custId}\nCustomer Name: ${custName}\nCustomer Email: ${custEmail}\nCustomer Address: ${fullAddress || "Not provided"}\nUse this token + details above to create subscription in Zoho Billing.\n`;
                          }
                        }
                      }
                    }
                  }
                }
              } catch (e) { /* customer search failed */ }
            }

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
      const zohoKeywords = ["zoho", "billing", "subscription", "cancel", "dunning", "plan", "renew", "מנוי", "ביטול", "חיוב", "installment", "cycle", "deal", "deals", "עסקה", "עסקאות", "customer", "לקוח", "לקוחה", "לקוחות", "revenue", "הכנסות", "כמה", "how many", "total", "סהכ", "status", "סטטוס", "active", "פעיל", "live", "sold", "מכר", "close", "סגר"];
      if (zohoKeywords.some((kw) => questionLower.includes(kw))) {
        try {
          const { zohoGet } = await import("./billing");

          // ── Customer-specific search: if question mentions a name, search Zoho directly ──
          let customerSearchDone = false;
          if (targetName) {
            try {
              const searchRes = await zohoGet(`/subscriptions?per_page=50&page=1&search_text=${encodeURIComponent(targetName)}`);
              const searchSubs = searchRes.subscriptions || [];
              if (searchSubs.length > 0) {
                zohoContext += `\n--- ZOHO BILLING - SUBSCRIPTIONS FOR "${targetName}" (${searchSubs.length} found) ---\n${searchSubs.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Status: ${s.status} | Agent: ${s.salesperson_name || "-"} | Shipping Type: ${s.cf_shipping_type || s.custom_field_hash?.cf_shipping_type || "-"} | Total: £${s.cf_total_amount || s.custom_field_hash?.cf_total_amount || s.amount} | Created: ${s.created_time?.split("T")[0] || "-"} | Next: ${s.next_billing_at || "-"} | Cancelled: ${s.cancelled_at || "-"}`).join("\n")}\n`;
                customerSearchDone = true;
              }
            } catch (e) { /* search failed */ }
          }
          if (targetEmail && !customerSearchDone) {
            try {
              const searchRes = await zohoGet(`/subscriptions?per_page=50&page=1&search_text=${encodeURIComponent(targetEmail)}`);
              const searchSubs = searchRes.subscriptions || [];
              if (searchSubs.length > 0) {
                zohoContext += `\n--- ZOHO BILLING - SUBSCRIPTIONS FOR "${targetEmail}" (${searchSubs.length} found) ---\n${searchSubs.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Status: ${s.status} | Agent: ${s.salesperson_name || "-"} | Shipping Type: ${s.cf_shipping_type || s.custom_field_hash?.cf_shipping_type || "-"} | Total: £${s.cf_total_amount || s.custom_field_hash?.cf_total_amount || s.amount} | Created: ${s.created_time?.split("T")[0] || "-"} | Next: ${s.next_billing_at || "-"} | Cancelled: ${s.cancelled_at || "-"}`).join("\n")}\n`;
                customerSearchDone = true;
              }
            } catch (e) { /* search failed */ }
          }

          // ── General: Get recent live subscriptions ──
          if (!customerSearchDone) {
            const liveRes = await zohoGet("/subscriptions?per_page=25&page=1&status=live");
            const liveSubs2 = liveRes.subscriptions || [];
            if (liveSubs2.length > 0) {
              zohoContext += `\n--- ZOHO BILLING - LIVE SUBSCRIPTIONS (last 25) ---\n${liveSubs2.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Agent: ${s.salesperson_name || "-"} | Shipping Type: ${s.cf_shipping_type || s.custom_field_hash?.cf_shipping_type || "-"} | Total: £${s.cf_total_amount || s.custom_field_hash?.cf_total_amount || s.amount} | Created: ${s.created_time?.split("T")[0] || "-"} | Next: ${s.next_billing_at || "-"}`).join("\n")}\n`;
            }
          }

          // If question mentions cancel/dunning, fetch those too
          if (["cancel", "ביטול", "dunning", "cancelled", "מבוטל"].some((kw) => questionLower.includes(kw))) {
            const cancelRes = await zohoGet("/subscriptions?per_page=15&page=1&status=cancelled");
            const cancelledSubs2 = cancelRes.subscriptions || [];
            if (cancelledSubs2.length > 0) {
              zohoContext += `\n--- ZOHO BILLING - RECENTLY CANCELLED (last 15) ---\n${cancelledSubs2.map((s: any) => `- ${s.customer_name} | ${s.email || ""} | Plan: ${s.plan_name} | £${s.amount} | Agent: ${s.salesperson_name || "-"} | Shipping Type: ${s.cf_shipping_type || s.custom_field_hash?.cf_shipping_type || "-"} | Total: £${s.cf_total_amount || s.custom_field_hash?.cf_total_amount || s.amount} | Cancelled: ${s.cancelled_at || "-"}`).join("\n")}\n`;
            }
          }
        } catch (e) {
          // Zoho check failed silently
        }
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

      // ─── ZOHO IMPORT CSV SHORTCUT ─────────────────────────────────────────────
      // If the user asks to generate a Zoho import CSV for a specific email, do it directly
      const zohoImportKeywords = ["zoho import", "zoho csv", "generate csv", "generate zoho", "download csv", "import csv", "תוקן לזוהו", "csv לזוהו", "ייצא csv", "zoho file", "zoho token file"];
      if (zohoImportKeywords.some((kw) => questionLower.includes(kw)) && targetEmail) {
        try {
          const stripeKey = process.env.STRIPE_BILLING_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
            // 1. Find customer by email
            const custRes = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(targetEmail)}&limit=1`, { headers: stripeHeaders });
            const custData = await custRes.json() as any;
            const cust = custData?.data?.[0];
            if (cust) {
              // 2. Get payment methods (attached to customer)
              const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods?customer=${cust.id}&type=card&limit=1`, { headers: stripeHeaders });
              const pmData = await pmRes.json() as any;
              let pm = pmData?.data?.[0];
              let card = pm?.card;
              let billing = pm?.billing_details;

              // 3. If no attached payment method, check latest PaymentIntent
              if (!card) {
                const piRes = await fetch(`https://api.stripe.com/v1/payment_intents?customer=${cust.id}&limit=1`, { headers: stripeHeaders });
                const piData = await piRes.json() as any;
                const pi = piData?.data?.[0];
                const piPmId = pi?.latest_charge ? null : pi?.payment_method;
                // Get card details from the charge's payment_method_details
                const chargeId = pi?.latest_charge;
                if (chargeId) {
                  const chargeRes = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, { headers: stripeHeaders });
                  const chargeData = await chargeRes.json() as any;
                  const pmDetails = chargeData?.payment_method_details?.card;
                  if (pmDetails) {
                    card = pmDetails;
                    pm = { id: chargeData?.payment_method || "from_charge" };
                    billing = chargeData?.billing_details;
                  }
                } else if (piPmId) {
                  // Fallback: fetch the payment method directly
                  const pmDirectRes = await fetch(`https://api.stripe.com/v1/payment_methods/${piPmId}`, { headers: stripeHeaders });
                  const pmDirectData = await pmDirectRes.json() as any;
                  if (pmDirectData?.card) {
                    card = pmDirectData.card;
                    pm = { id: pmDirectData.id };
                    billing = pmDirectData.billing_details;
                  }
                }
              }

              // Merge address: prefer billing address fields, fall back to customer address
              const billingAddr = billing?.address || {};
              const custAddr = cust.address || {};
              const addr = {
                line1: billingAddr.line1 || custAddr.line1 || "",
                city: billingAddr.city || custAddr.city || "",
                state: billingAddr.state || custAddr.state || "",
                country: billingAddr.country || custAddr.country || "GB",
                postal_code: billingAddr.postal_code || custAddr.postal_code || "",
              };
              // Build CSV with exact Zoho Billing field names
              const headers = ["Card ID","Card Last4","Card Exp Month","Card Exp Year","Card Brand","Card Funding","Card Address Line1","Card Address City","Card Address State","Card Address Country","Card Address Zip","id","Email","Card Name"];
              const row = [
                pm?.id || "",
                card?.last4 || "",
                String(card?.exp_month || "").padStart(2, "0"),
                String(card?.exp_year || ""),
                card?.brand || "",
                card?.funding || "credit",
                addr?.line1 || "",
                addr?.city || "",
                addr?.state || "",
                addr?.country || "GB",
                addr?.postal_code || "",
                cust.id,
                cust.email || targetEmail,
                billing?.name || cust.name || "",
              ];
              const csvContent = headers.join(",") + "\n" + row.map((v: string) => v.includes(",") ? `"${v}"` : v).join(",");
              const displayName = billing?.name || cust.name || "Unknown";
              const displayEmail = cust.email || targetEmail;
              return { answer: `✅ **Zoho Import CSV generated for ${targetEmail}**\n\nCustomer: ${displayName}\nEmail: ${displayEmail}\nCard: ${card?.brand || "?"} ****${card?.last4 || "????"} (exp ${card?.exp_month}/${card?.exp_year})\nAddress: ${addr.line1 || "?"}, ${addr.city || "?"}, ${addr.postal_code || "?"}, ${addr.country || "GB"}\nStripe ID: ${cust.id}\nPayment Method: ${pm?.id || "none"}\n\nClick the green button below to download the CSV file.\n\n---CSV_START---\n${csvContent}\n---CSV_END---\n` };
            } else {
              return { answer: `❌ Customer with email **${targetEmail}** was not found in Stripe. Please check the email address and try again.` };
            }
          }
        } catch (e: any) {
          console.error("[ZOHO CSV SHORTCUT ERROR]", e?.message || e);
          // Fall through to normal AI response
        }
      }

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

=== PAYMENT TERMINOLOGY (CRITICAL) ===
"Google Pay form" / "Google Pay link" / "GPay" / "Apple Pay" / "pay form" / "pay link" = the agent is asking if the customer PAID through Stripe. Google Pay and Apple Pay are just payment METHODS — all payments go through OUR Stripe account. When an agent asks "do we have a Google Pay form for X" or "did we get a Google Pay link from X" — they mean "did this customer pay us?" → CHECK STRIPE for charges by that email. Show the payment status (succeeded/incomplete/failed) and if succeeded show: Payment Method Token (pm_xxx), Card details, Customer Name, Customer Email, Customer Address (from Stripe Customer object).

=== PAYMENT STATUS RULES (CRITICAL) ===
CRITICAL DISTINCTION — "נסלק" vs "ביטל":
- "נסלק" / "charged" / "payment went through" = Did the customer PAY? Check STRIPE charges. Look for status "succeeded". If there's a succeeded charge — the customer WAS charged, regardless of Zoho subscription status.
- "ביטל" / "cancelled" / "subscription status" = What is the subscription status in Zoho? This is about the PLAN, not the payment.
EXAMPLE: A customer can have a CANCELLED subscription in Zoho BUT still have a SUCCEEDED payment in Stripe (they paid £4.95 and then cancelled). If agent asks "האם נסלק" — answer based on STRIPE charges, NOT Zoho subscription status!
IMPORTANT: If a customer is NOT FOUND in Zoho Billing at all — do NOT say "cancelled"! Say "Customer not found in Zoho Billing — subscription has not been created yet." This means they may have paid in Stripe but the subscription wasn't set up in Zoho yet.
When agent asks "נסלק" or "charged" — ALWAYS check Stripe first. Only report Zoho status if they specifically ask about subscription/plan status.

When reporting payment/charge status to agents, ALWAYS state the EXACT status from Stripe. Never simplify to just "paid" or "not paid". The statuses are:
- "succeeded" = Payment went through successfully. Customer was charged.
- "incomplete" = Customer started the payment process but did NOT complete it. Card was NOT charged. This is NOT the same as "not paid" — tell the agent: "Payment status is INCOMPLETE — the customer started checkout but didn't finish. They were NOT charged yet."
- "pending" = Payment is being processed, not yet confirmed.
- "failed" = Payment was attempted but the card was declined.
- "refunded" = Payment was made but later refunded.
- "canceled" = Payment was canceled before completion.
IMPORTANT: If a customer has MULTIPLE charges (e.g. two "incomplete" attempts), report ALL of them with dates. This helps the agent understand what happened.

=== PAYMENT TOKEN EXTRACTION ===
When an agent asks for a customer's "token" / "payment method" / "card token" / "pm_" — you have access to it from Stripe.
The token is the Payment Method ID (pm_xxx) from the customer's succeeded £4.95 charge. It is automatically extracted and shown in the data below as "PAYMENT TOKEN FOR ZOHO BILLING".
When showing the token to the agent, ALWAYS include ALL details needed for Zoho Billing:
- Payment Method Token: pm_xxx
- Card: visa ****1234 (exp 8/2027)
- Stripe Customer ID: cus_xxx
- Customer Name: [full name from billing details]
- Customer Email: [email]
- Customer Address: [full address - line1, city, postcode, country]
The agent needs ALL of these to create the subscription in Zoho Billing. Never show just the token without the name, email, and address.

=== ZOHO BILLING BUSINESS LOGIC ===

WHAT COUNTS AS A "DEAL":
- RETENTION DEAL (Rob, Guy, James): A subscription or installment was CREATED in Zoho Billing with Shipping Type = "First Shippable" OR "All Shippable". If Shipping Type = "Not Shippable" → NOT a deal!
- OPENING DEAL (Ava, Debbie, Shola, etc.): Customer paid £4.95 shipping + subscription of £44.90 was created. Every trial counts as a deal for Opening agents.
- RETENTION DEAL in detail: The original £44.90 subscription was cancelled by the customer, and the retention agent created a NEW subscription or installment (or updated salesperson_name to their name on the existing sub).

TOTAL VALUE OF A DEAL:
- Subscription = the recurring amount (e.g. £44.90/month, £29.90/month)
- Installment = the Total Amount of the installment plan (e.g. £420 total)

HOW TO KNOW A DEAL BELONGS TO AN AGENT:
- By the "salesperson_name" field in Zoho Billing subscriptions. This is the ONLY source of truth.

"DEALS TODAY" DEFINITION:
- A subscription or installment was CREATED TODAY (created_time field) with Shipping Type: "First Shippable" OR "All Shippable"
- NOT "status changed today". NOT "payment collected today". It's CREATED today.

CRITICAL FIELD — SHIPPING TYPE:
- "First Shippable" = new deal (first shipment goes out) ✅
- "All Shippable" = new deal (all shipments go out) ✅
- "Not Shippable" = NOT a deal (no physical product shipped) ❌
- ALWAYS check this field before counting something as a deal!

WHEN ROB "SAVES" A CUSTOMER — TWO SCENARIOS:
1. Customer stays with current subscription → salesperson_name is updated to Rob on the existing subscription
2. Customer agrees to reduced amount → original subscription is cancelled → NEW subscription created with reduced recurring amount → Rob set as salesperson

IMPORTANT DATA TERMINOLOGY:
- For OPENING agents: "deals" / "עסקאות" / "sales" / "openings" = total TRIALS opened. Every trial counts as a deal/sale.
- For RETENTION agents: "deals" = subscriptions/installments created with their name as salesperson AND Shipping Type is First/All Shippable
- "Conversion" = only trials that matured AND became live/saved. Different from total trials opened.
- When asked "how many deals did [agent] close today/yesterday" — check Zoho Billing for subscriptions created on that date with that salesperson AND correct Shipping Type.

=== OPENING WORKSPACE — USAGE GUIDE (Answer these questions for Opening agents!) ===

When an Opening agent asks HOW to do something in their workspace, or asks about features, tools, buttons, tabs — answer from this knowledge base. Match their question even if they phrase it differently (see examples below each topic).

**WHAT IS THE OPENING WORKSPACE?**
This is the personal sales station for Opening agents. Every contact assigned to you appears here. You call them, pitch the product, take payment (£4.95 trial), and move to the next one. Contact list on the left, script on the right, actions in the middle.
(Agent might ask: "what is this page", "how does workspace work", "where do I start", "what do I do here")

**NAVIGATION TABS:**
- My Pitch = main workspace, contact list + script + actions. 90% of your time here.
  - Full Script = inside My Pitch dropdown. Complete sales script in one page.
- My Callbacks = contacts with scheduled callbacks. Overdue ones in red.
- Manager View = (managers only) see any agent's contacts and progress.
- Messages = WhatsApp AND SMS conversations. Unread badge shows new replies.
- Emails = view sent emails and send new ones.
- Maximus = me! Ask me anything — customer info, tips, help during calls.
- Protocol = orange button, opens the full usage guide.
(Agent might ask: "where do I see callbacks", "how do I check messages", "what are the tabs", "where is full script", "how do I find the script")

**CONTACT LIST (LEFT SIDE):**
- Shows all your assigned contacts
- Name & Phone — click to load
- Status Badge — Active (blue), Sold (green), Skip (grey), N/A, No Answer, Callback
- Filter Dropdown — Active, Sold, Skip, Callback, N/A, No Answer, All
- Search Box — type name or phone to find instantly
(Agent might ask: "where are my contacts", "how to search", "how to filter list", "what do the colours mean")

**CONNECTING PHONE (CLOUDTALK):**
1. Download CloudTalk Phone app (mobile or desktop)
2. Log in with credentials from manager
3. Set status to "Available" (green dot)
4. Click "Call" in system → CloudTalk rings YOUR phone first → pick up → connects to customer
- If phone not ringing: check CloudTalk is open + status Available
(Agent might ask: "how to connect phone", "cloudtalk setup", "phone not ringing", "how to call", "call not working")

**MAKING A CALL:**
1. Click contact from list (left side)
2. Details load in middle panel
3. Click big "Call" button
4. Your CloudTalk phone rings — PICK UP!
5. System dials customer automatically
6. Follow script stages on right panel
- Don't hang up! Wait for ring-out or click "End Call"
(Agent might ask: "how do I call", "what happens when I click call", "call button", "how to make a call")

**ACTION BUTTONS (NEXT / SKIP / SOLD / N/A / NO ANSWER):**
- Next = move to next contact. If call ringing, ends it automatically.
- Skip = marks grey "Skip". Can come back later by clicking their name.
- Sold = customer bought! Use AFTER taking payment. Green badge.
- N/A = wrong number, disconnected, not real. Removes from active list.
- No Answer = didn't pick up. Schedule callback or skip.
(Agent might ask: "what does skip do", "how to mark sold", "next button", "what is N/A", "no answer button")

**SCHEDULING A CALLBACK:**
1. Click "Callback" button on contact
2. Pick date: Today, Tomorrow, In 2 Days, Next Week, Custom
3. Pick time (15-minute intervals)
4. Add note (optional) — e.g. "Said call after 3pm"
5. Click Confirm → moves to My Callbacks tab
- Overdue = red with OVERDUE badge
- Notification toast when callback is due
(Agent might ask: "how to schedule callback", "set reminder", "book a call back", "reschedule", "callback overdue")

**WHATSAPP MESSAGES:**
1. Click green WhatsApp icon on contact
2. Pick template from list
3. Click to send — goes instantly
- ⚠️ 24-HOUR RULE: Start with template ONLY. Customer replies → free chat 24h. After 24h silence → template again.
- Simple: Template → Customer replies → Free chat 24h → Silence? Template again.
(Agent might ask: "how to send whatsapp", "whatsapp template", "24 hour rule", "why can't I send", "what is 24 hour window")

**SMS MESSAGES:**
1. Click SMS icon (speech bubble)
2. Pick template OR write own message
3. Click Send
- No 24-hour rule — send anytime
- Use when customer doesn't have WhatsApp
(Agent might ask: "how to send sms", "text message", "difference sms whatsapp", "when to use sms")

**SENDING EMAILS:**
1. Click email icon on contact
2. Big modal: templates left, preview right
3. Click template to preview (name auto-filled)
4. Click "Send Email" — done!
5. OR click "Compose" for custom email
- Disabled if no email address on contact
(Agent might ask: "how to send email", "email template", "write custom email", "compose email")

**TAKING PAYMENT (£4.95 TRIAL):**
1. Customer agrees to try product
2. Select Starter Kit (Matinika, Oulala, Ashkara, or combo)
3. Click "Send Payment Link" OR take card details in payment box
4. Customer gets secure Stripe link via SMS/WhatsApp/Email
5. Once paid → status auto-updates to "Sold" ✅
- ALWAYS confirm full name, email, delivery address BEFORE payment!
(Agent might ask: "how to take payment", "payment link", "starter kit", "how much is trial", "send payment", "card details")

**THE SCRIPT PANEL (RIGHT SIDE):**
7 stages: Introduction → Routine & Education → Magic Wand Question → Product Presentation → Social Proof & Website → The Offer & Close → Confirmation & Usage
- Click each stage to expand
- Follow in order for best results
- Edit icon to customise your version
(Agent might ask: "where is the script", "how many stages", "how to use script", "edit script", "what are the stages")

**SAVING NOTES:**
- After every call, write what happened
- Select outcome: Connected, Sale, No Answer, Voicemail, etc.
- Click "Save Note" — saved and visible to managers
- ALWAYS save a note, even "No answer"
(Agent might ask: "how to save notes", "where are notes", "do I need to save", "manager can see notes")

**DAILY ROUTINE TIPS FOR OPENING:**
1. Start with Callbacks tab — overdue first
2. Then My Pitch — work through active list
3. Check Messages tab every hour for replies
4. Save note after EVERY call
5. If stuck, ask Maximus for help!

=== RETENTION WORKSPACE — USAGE GUIDE (Answer these questions for agents!) ===

When an agent asks HOW to do something in the workspace, or asks about features, tools, buttons, tabs — answer from this knowledge base. Match their question even if they phrase it differently (see examples below each topic).

**NAVIGATION TABS:**
- Incoming Leads = main queue, all new leads land here
- My Callbacks = leads with scheduled callbacks, shows date/time, overdue in red
- My Follow Ups = less urgent than callbacks, scheduled follow-ups
- Messages = WhatsApp AND SMS conversations, unread badge shows new replies
- Emails = view sent emails and send new ones
- My Clients = all active subscriptions with billing details, products, payment history
- Decline / Cancel / End Instalment = filtered views by lead type
- Maximus Aurelius = me! Ask me anything
- My Performance = personal stats, deals, revenue, conversion rates
(Agent might ask: "where do I see my callbacks", "how do I check messages", "what are the tabs", "where is my performance", "where can I see replies")

**LEADS TABLE COLUMNS:**
- Checkbox = select for bulk actions
- Name = click to open contact card
- Email = click to open email app
- Status = coloured badge, click to change (New/Working/Callback/Done Deal/Closed/Not Interested/Retained Sub/No Answer/Custom)
- Date = creation date or term end
- Lead Type = category badge (Pre-Cycle-Decline, Cancel Live Sub, Hot Lead, etc)
- Customer Note = from management, hover to see full text
- Agent Note = your notes, click to edit, click Save
- Actions = Call, WhatsApp, SMS, Email, Schedule Callback, Open Card
(Agent might ask: "what does each column mean", "how do I change status", "what is the note column", "how do I edit my notes")

**FILTERS:**
- Date Filter (Queue) = All Dates, Today, Last 7 Days, This Month, Last Month
- Callback Date Filter (Callbacks tab) = All, Today, Tomorrow, This Week
- Lead Type Filter = show only specific types
- Search = type name, email, or phone to find someone
(Agent might ask: "how do I filter", "how do I find a customer", "how to search", "show only hot leads", "filter by type")

**BULK ACTIONS (messaging multiple customers):**
1. Tick checkboxes next to leads (or select all with top checkbox)
2. Blue bar appears at bottom with count
3. Click WhatsApp, SMS, or Email on that bar
4. Choose a template
5. Confirm — sent to all selected
- "Clear Selection" deselects everyone
(Agent might ask: "how do I message everyone", "bulk send", "send to multiple", "how to select all", "mass message", "send template to all")

**CONTACT CARD (opening a lead):**
- Click name or arrow to open
- Edit details (name, phone, email, address) + Save
- Call, Schedule Callback, Mark as Sold, Not Interested, N/A
- Send Payment (Stripe), Send Email, Send WhatsApp, Send SMS
- Free Notes (remember to click Save Notes!)
- Previous/Next arrows to navigate between leads
(Agent might ask: "how do I open a lead", "how to edit customer details", "where is the call button", "how to mark as sold")

**CALLBACKS & FOLLOW-UPS:**
1. Click calendar icon or "Callback" button
2. Pick date (Today/Tomorrow/In 2 Days/Next Week/Custom)
3. Pick time (15-min intervals)
4. Add optional note
5. Click Confirm — lead moves to Callbacks tab
- Overdue = red with OVERDUE badge
- Actions: Reschedule, Close, Call Now
- You get a notification toast when callback is due
(Agent might ask: "how do I schedule a callback", "set reminder", "book a call back", "reschedule", "what happens when callback is due")

**WHATSAPP MESSAGES:**
1. Click green WhatsApp icon
2. See list of templates (filtered for your team)
3. Click template to send instantly
4. Button goes grey briefly to prevent double-send
- ⚠️ 24-HOUR RULE: You can ONLY start with a template. Once customer replies, you have 24 hours to chat freely. After 24 hours of silence, must use template again.
- Simple: Template first → Customer replies → Free chat for 24h → Silence? Template again.
(Agent might ask: "how to send whatsapp", "whatsapp template", "24 hour rule", "why can't I send", "how does whatsapp work", "what is the 24 hour window")

**SMS MESSAGES:**
1. Click SMS icon (speech bubble) or "Send SMS" in contact card
2. Pick a template OR write your own message
3. Click Send
- No 24-hour rule — send anytime
- Use when customer doesn't have WhatsApp or for quick personal messages
(Agent might ask: "how to send sms", "text message", "difference between sms and whatsapp", "when to use sms")

**EMAILS:**
1. Click email icon
2. Large modal: templates on left, preview on right
3. Click template to preview (name auto-filled)
4. Click Send
5. OR click "Compose" for custom email (own subject + message)
- Disabled if customer has no email
(Agent might ask: "how to send email", "email template", "write custom email", "compose email")

**STATUS MANAGEMENT:**
Click the coloured badge to change. Options: New, Working, Callback, No Answer, Done Deal, Retained Sub, Closed, Not Interested, + Custom Status
- Custom: type your own (e.g. "Waiting for husband")
- Some actions auto-update status (scheduling callback → "Callback")
(Agent might ask: "how to change status", "what statuses are there", "custom status", "mark as done")

**NOTES:**
- Customer Note = read-only, from management, hover to see full text
- Agent Note = editable, click to edit in table, click Save
- Contact Card Notes = larger area, must click "Save Notes"
- Auto-notes = system adds notes when you schedule callbacks etc.
(Agent might ask: "how to add notes", "where are my notes", "save notes", "manager note")

**MY CLIENTS TAB:**
- Filters: Date range, Status (Live/Dunning/Cancelled), Plan Type, Search
- Columns: Name, Email, Plan, Setup Fee, Monthly, Total, Billing Cycle progress, Status, Next Billing, Actions
- Expand row = product breakdown + progress bar
- Bulk actions same as leads table
- 50 per page with pagination
(Agent might ask: "where are my clients", "billing details", "subscription info", "how many clients do I have")

**TIPS FOR AGENTS:**
- Start your day with Callbacks tab — overdue first
- Use bulk messaging for all "No Answer" leads
- Always add a note after every call
- Check Messages tab for customer replies
- Use search to find anyone instantly
- Performance tab — check weekly

Format: Keep responses short and actionable. Use bold (**text**) for key numbers. If agent is on a live call, give bullet-point quick answers they can read instantly.

=== SUPPORT TICKETS — USAGE GUIDE (Answer these questions for CS agents!) ===

When a customer service agent asks HOW to do something in Support Tickets, or asks about features, buttons, statuses — answer from this knowledge base.

**WHAT IS SUPPORT TICKETS?**
Email inbox for customer support. Every email from customers arrives here automatically. Read, reply, resolve. Every open ticket needs attention.
(Agent might ask: "what is this page", "how does support tickets work", "where do I start", "what do I do here")

**NAVIGATION TABS:**
- Tickets = main inbox, all customer emails
- Retention = form to send a cancellation lead to retention team (Rob/Guy/James)
- Maximus Aurelius = AI assistant, ask about customer info
- Messages = (managers) WhatsApp conversations
- Senders = (admin) blocked email addresses
- Subjects = (admin) blocked subject keywords
(Agent might ask: "where do I see messages", "what are the tabs", "where is retention", "how to block sender")

**SUMMARY CARDS:**
- Open Tickets = total waiting. Goal: keep LOW
- High Priority = urgent (complaints, refunds). Handle FIRST
- Awaiting Response = you replied, waiting for customer
- Resolved Today = your daily score
(Agent might ask: "what do the numbers mean", "what is high priority", "what is awaiting response")

**FILTERS:**
- Search = name, email, or subject keywords
- Categories = Cancellation, Payment Issue, Product Question, Complaint, Shipping, Address Change, General, Refund Request, Positive Feedback, System/Automated
- Priorities = All / High / Medium / Low
- Status = Active (excl. Closed), Open, In Progress, Awaiting Response, Customer Replied, Resolved, Closed
- Time = All Time, Today, Last 7 Days, This Month, Last Month
(Agent might ask: "how to filter", "how to find a customer", "how to search", "show only complaints", "filter by category")

**TICKET STATUSES:**
- Open (blue) = new, nobody touched it
- In Progress (purple) = you're working on it
- Awaiting Response (yellow) = you replied, waiting for customer
- Customer Replied (orange) = customer answered! Handle NOW. Goes to top of list.
- Resolved (green) = done
- Closed (grey) = permanently closed
(Agent might ask: "what do the colours mean", "what is customer replied", "how to change status", "what statuses are there")

**READING A TICKET:**
1. Click any ticket row to expand
2. See: sender, email, priority, date, category
3. Conversation thread below (customer left, your replies right in blue)
(Agent might ask: "how to open a ticket", "how to read emails", "where is the conversation")

**REPLYING TO A TICKET:**
1. Expand ticket → click "← Reply" button
2. Text box appears at bottom
3. Type reply → click "Send Reply"
4. Sent from trial@lavielabs.com. Status → Awaiting Response
(Agent might ask: "how to reply", "how to send email back", "how to respond", "where is reply button")

**BULK ACTIONS:**
1. Tick checkboxes on tickets (or select all)
2. Bar appears: Resolve / Close / Delete / Cancel
- Use bulk Resolve for system/automated emails
(Agent might ask: "how to select all", "bulk resolve", "delete multiple", "close all")

**BLOCK SENDER / BLOCK SUBJECT:**
- Block Sender (red button in ticket) = blocks email address forever
- Block Subject (orange button) = blocks keyword in subject
- Use Block Sender for spam. Block Subject for recurring system emails.
(Agent might ask: "how to block", "stop getting emails from", "block spam", "how to unblock")

**SENDING TO RETENTION:**
1. Click Retention tab (green)
2. Fill: Name, Email, Phone, Note (reason for cancellation)
3. Click "Send to Retention"
- Use when customer wants to cancel. DON'T cancel yourself — send to Retention!
(Agent might ask: "customer wants to cancel", "how to send to retention", "where is retention form", "cancel subscription")

**USING MAXIMUS:**
- Click Maximus Aurelius tab (purple)
- Ask in plain English: "Did Jane Smith pay?", "What subscription does john@email.com have?"
- He checks Stripe, Zoho Billing, WhatsApp, emails automatically
(Agent might ask: "how to check payment", "did customer pay", "subscription info", "how to use AI")

**CATEGORIES EXPLAINED:**
- Cancellation → Send to Retention!
- Payment Issue → Card declined, double charge
- Complaint → Handle with care, be empathetic
- Shipping → Where is my order?
- Refund Request → Check with manager first!
- System/Automated → Usually bulk-resolve
(Agent might ask: "what category is this", "what does cancellation mean", "how to handle complaint")

**PRIORITY RULES:**
- High = complaints, refunds, "scam", "fraud". Handle IMMEDIATELY
- Medium = cancellations, payment issues. Same day
- Low = general questions, system emails. When you can
(Agent might ask: "what is high priority", "which ones first", "priority order")

**DAILY ROUTINE:**
1. High Priority first
2. Customer Replied next
3. Open tickets oldest first
4. Bulk-resolve System/Automated
5. Cancellations → Send to Retention
6. Unsure? Ask Maximus or manager
7. Aim: 20+ resolved per day
(Agent might ask: "what should I do first", "daily routine", "how to start my day", "what order")

=== CONTACTS PAGE — USAGE GUIDE (Answer these questions for all agents!) ===

When an agent asks HOW to do something in the Contacts page or asks about searching finding importing or managing contacts — answer from this knowledge base.

**WHAT IS THE CONTACTS PAGE?**
Master database of ALL customer leads. Every person ever imported or added lives here. Search filter view details assign agents import new data.
(Agent might ask: "what is contacts" "where are all my leads" "how to find a customer" "master list")

**DEPARTMENT TABS:**
- Opening = contacts for sales team (cold calling new leads)
- Retention = contacts for retention team (customers wanting to cancel)
- Data Management = unassigned pool waiting to be distributed
- Billing = contacts with payment/billing info
(Agent might ask: "what are the tabs" "where is retention" "what is data management" "which tab am I")

**SEARCH:**
Type name phone or email in the search box. Finds instantly. Works across all contacts in current department.
(Agent might ask: "how to search" "find a customer" "look up phone number" "search by email")

**FILTERS:**
- Lead Type = Pre-Cycle-Cancelled / Cancel Live Sub / Hot Lead / Decline etc
- Status = New / Working / Callback / Done Deal / Closed / Not Interested / No Answer / Skip
- Agent = filter by assigned agent
- Source = where data came from (40-60 premium / Facebook / Website)
- Lead Date = when contact was created (from/to)
- Status Date = when status last changed
- Show = how many per page (50 / 100 / 200 / 500)
(Agent might ask: "how to filter" "show only new" "filter by agent" "filter by source" "date filter")

**TABLE COLUMNS:**
- NAME = customer name + email. Click to open Contact Card
- LEAD TYPE = category badge
- STATUS = coloured badge. Click to change
- PHONE = click to call
- ADDRESS = delivery address
- AGENT = who is assigned
- SOURCE = where data came from
- NA = number of No Answer attempts
- LEAD DATE = when created/imported
(Agent might ask: "what do the columns mean" "what is NA" "what is lead date" "what is source")

**IMPORTING CONTACTS (CSV/XLSX):**
1. Click Import CSV/XLSX (purple button)
2. Choose department: Opening or Retention
3. Enter Source name (REQUIRED! e.g. "40-60 premium")
4. Select file
5. Auto-imports. Shows count of imported + skipped
CSV must have: name (required) phone (required) email (optional) address (optional)
(Agent might ask: "how to import" "upload csv" "add data" "import spreadsheet" "what format")

**ADDING A CONTACT MANUALLY:**
1. Click Add Contact (green button)
2. Fill in: Name Phone Email Address Lead Type Status Notes
3. Click Save
(Agent might ask: "add new contact" "create contact" "add manually" "new lead")

**BULK ACTIONS:**
1. Tick checkboxes on contacts (or select all)
2. Action bar appears: Assign Agent / Send WhatsApp / Send SMS / Send Email / Delete
(Agent might ask: "select all" "bulk assign" "send to everyone" "mass message" "delete multiple")

**OPENING A CONTACT CARD:**
Click any name to open full details. Inside: edit details / call / WhatsApp / SMS / Email / message history / transactions / notes / callbacks / status change / subscription info
(Agent might ask: "how to open contact" "see details" "contact card" "view customer")

**STATUSES:**
- New (blue) = fresh not yet called
- Working (purple) = actively working
- Callback (amber) = callback scheduled
- Done Deal (green) = sold!
- Closed (grey) = won't buy
- Not Interested (red) = said no
- No Answer (orange) = didn't pick up
- Skip (light grey) = skipped for now
(Agent might ask: "what statuses" "change status" "what does new mean" "what is working")

LANGUAGE: Respond in the same language the user asks in. If they ask in Hebrew — answer in Hebrew. If they ask in English — answer in English. However when quoting scripts pitches or objection responses — ALWAYS keep those in English (because agents use them in English with customers). Only translate your explanations not the scripts themselves.

=== ZOHO IMPORT CSV GENERATION (CRITICAL) ===
When the user asks to "generate zoho import" or "download csv" or "zoho csv" for a customer email:
1. Find the customer in the Stripe data provided below
2. Show a summary of the customer details
3. ALWAYS include a CSV block in EXACTLY this format (the frontend uses these markers to show a download button):

---CSV_START---
Card ID,Card Last4,Card Exp Month,Card Exp Year,Card Brand,Card Funding,Card Address Line1,Card Address City,Card Address State,Card Address Country,Card Address Zip,id,Email,Customer Name
[pm_xxx],[last4],[exp_month],[exp_year],[brand],credit,[line1],[city],[state],[country],[postal_code],[cus_xxx],[email],[name]
---CSV_END---

IMPORTANT: The ---CSV_START--- and ---CSV_END--- markers MUST be on their own lines. Without them, the download button will NOT appear. ALWAYS include them when the user asks for zoho import/csv.`,
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

  /**
   * Get upcoming callbacks due in the next 10 minutes for the current user.
   * Frontend polls this every 30 seconds to show toast notifications.
   */
  getUpcomingCallbacks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const userName = ctx.user.name;
    if (!userName) return [];

    const now = Date.now();
    const tenMinutesFromNow = now + 10 * 60 * 1000;

    const result = await db.execute(sql`
      SELECT id, customerName, phone, callbackAt, assignedAgent
      FROM lead_assignments
      WHERE callbackAt IS NOT NULL
        AND callbackAt > ${now}
        AND callbackAt <= ${tenMinutesFromNow}
        AND assignedAgent = ${userName}
    `);

    const rows = (result as unknown as any[][])[0] as any[];
    return (rows || []).map((r) => ({
      id: r.id,
      customerName: r.customerName || "Unknown",
      phone: r.phone || null,
      callbackAt: r.callbackAt,
    }));
  }),

  // ─── Performance Dashboard ──────────────────────────────────────────────────
  getPerformanceData: protectedProcedure
    .input(
      z.object({
        dateRange: z.enum(["today", "yesterday", "7days", "this_month", "last_month", "custom"]).default("this_month"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        agents: z.array(z.string()).optional(),
        planType: z.enum(["all", "installment", "subscription", "one_payment"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          summary: { totalLeads: 0, doneDeals: 0, conversionRate: 0, totalRevenue: 0, futureDeals: 0, aov: 0 },
          summaryDelta: { totalLeads: 0, doneDeals: 0, conversionRate: 0, totalRevenue: 0, futureDeals: 0, aov: 0 },
          agentCards: [],
          conversionByLeadType: [],
          conversionByAgent: [],
          drillDown: [],
        };
      }

      // ── Date Range Calculation ──────────────────────────────────────────────
      function getDateRange(range: string, customFrom?: string, customTo?: string): { from: string; to: string } {
        const now = new Date();
        let from: Date;
        let to: Date;

        switch (range) {
          case "today":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
          case "yesterday":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
            break;
          case "7days":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
          case "this_month":
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
          case "last_month":
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
          case "custom":
            from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
            to = customTo ? new Date(customTo + "T23:59:59") : now;
            break;
          default:
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = now;
        }
        return {
          from: from.toISOString().split("T")[0],
          to: to.toISOString().split("T")[0],
        };
      }

      function getPreviousPeriod(range: string, customFrom?: string, customTo?: string): { from: string; to: string } {
        const now = new Date();
        let from: Date;
        let to: Date;

        switch (range) {
          case "today":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
            break;
          case "yesterday":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 59, 59);
            break;
          case "7days":
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 23, 59, 59);
            break;
          case "this_month":
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
          case "last_month":
            from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            to = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59);
            break;
          case "custom": {
            const cFrom = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
            const cTo = customTo ? new Date(customTo) : now;
            const days = Math.ceil((cTo.getTime() - cFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            to = new Date(cFrom.getTime() - 1000 * 60 * 60 * 24);
            from = new Date(to.getTime() - (days - 1) * 1000 * 60 * 60 * 24);
            break;
          }
          default:
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        }
        return {
          from: from.toISOString().split("T")[0],
          to: to.toISOString().split("T")[0],
        };
      }

      const currentPeriod = getDateRange(input.dateRange, input.dateFrom, input.dateTo);
      const previousPeriod = getPreviousPeriod(input.dateRange, input.dateFrom, input.dateTo);

      // ── Fetch lead_assignments for current period ──────────────────────────
      const allLeads = await db.select().from(leadAssignments);

      function filterLeadsByPeriod(leads: typeof allLeads, period: { from: string; to: string }) {
        return leads.filter((l) => {
          if (!l.eventDate) return false;
          const ed = l.eventDate.substring(0, 10);
          return ed >= period.from && ed <= period.to;
        });
      }

      function filterLeadsByAgents(leads: typeof allLeads, agents?: string[]) {
        if (!agents || agents.length === 0) return leads;
        return leads.filter((l) => l.assignedAgent && agents.includes(l.assignedAgent));
      }

      let currentLeads = filterLeadsByPeriod(allLeads, currentPeriod);
      let previousLeads = filterLeadsByPeriod(allLeads, previousPeriod);

      if (input.agents && input.agents.length > 0) {
        currentLeads = filterLeadsByAgents(currentLeads, input.agents);
        previousLeads = filterLeadsByAgents(previousLeads, input.agents);
      }

      // ── Fetch client_subscriptions for retention agents ──────────────────────
      const allSubs = await db.select().from(clientSubscriptions).where(
        sql`${clientSubscriptions.salesPerson} IN ('Guy','Rob','James')`
      );
      console.log(`[Performance] Fetched ${allSubs.length} subs for retention agents`);

      function filterSubsByPeriod(subs: typeof allSubs, period: { from: string; to: string }) {
        return subs.filter((s) => {
          if (!s.createdOn) return false;
          // Drizzle date() may return Date object or string — normalize to YYYY-MM-DD
          let cd: string;
          if (s.createdOn instanceof Date) {
            cd = s.createdOn.toISOString().substring(0, 10);
          } else {
            cd = String(s.createdOn).substring(0, 10);
          }
          return cd >= period.from && cd <= period.to;
        });
      }

      function filterSubsByAgents(subs: typeof allSubs, agents?: string[]) {
        if (!agents || agents.length === 0) return subs;
        return subs.filter((s) => agents.includes(s.salesPerson));
      }

      function filterSubsByPlanType(subs: typeof allSubs, planType: string) {
        if (planType === "all") return subs;
        return subs.filter((s) => s.planType === planType);
      }

      let currentSubs = filterSubsByPeriod(allSubs, currentPeriod);
      let previousSubs = filterSubsByPeriod(allSubs, previousPeriod);

      if (input.agents && input.agents.length > 0) {
        currentSubs = filterSubsByAgents(currentSubs, input.agents);
        previousSubs = filterSubsByAgents(previousSubs, input.agents);
      }

      currentSubs = filterSubsByPlanType(currentSubs, input.planType);
      previousSubs = filterSubsByPlanType(previousSubs, input.planType);

      // ── Helper: compute metrics from subs ─────────────────────────────────
      function computeMetrics(subs: typeof allSubs, leads: typeof allLeads) {
        const totalLeads = leads.length;
        const doneDeals = subs.length;
        // Conversion rate = only leads from Incoming Leads that were closed (done_deal)
        // NOT comparing Zoho deals vs incoming leads (many deals are upsells unrelated to incoming)
        const leadsClosedAsDeal = leads.filter((l) => l.workStatus === "done_deal").length;
        const conversionRate = totalLeads > 0 ? (leadsClosedAsDeal / totalLeads) * 100 : 0;

        let totalRevenue = 0;
        let futureRevenue = 0;
        let futureDeals = 0;
        let deposit = 0;

        for (const s of subs) {
          const totalAmt = s.totalAmount ? parseFloat(String(s.totalAmount)) : 0;
          const amt = s.amount ? parseFloat(String(s.amount)) : 0;
          const fee = s.setupFee ? parseFloat(String(s.setupFee)) : 0;

          deposit += fee;
          if (s.status !== "future") {
            if (s.planType === "installment") {
              deposit += amt; // first instalment payment collected
            } else if (s.planType === "one_payment") {
              deposit += totalAmt; // full one-time payment collected
            }
          }
          // Future deals = any planType with status 'future'
          if (s.status === "future") {
            futureDeals++;
            futureRevenue += totalAmt;
            totalRevenue += totalAmt;
          } else if (s.planType === "installment" || s.planType === "one_payment") {
            totalRevenue += totalAmt;
          } else if (s.planType === "subscription") {
            totalRevenue += amt;
          }
        }

        const netRevenue = totalRevenue - futureRevenue;
        const netDeals = doneDeals - futureDeals;
        const aov = netDeals > 0 ? netRevenue / netDeals : 0;

        return { totalLeads, doneDeals, conversionRate, totalRevenue, futureDeals, futureRevenue, netRevenue, aov, deposit };
      }

      const current = computeMetrics(currentSubs, currentLeads);
      const previous = computeMetrics(previousSubs, previousLeads);

      // ── Percentage delta calculation ──────────────────────────────────────
      function pctDelta(curr: number, prev: number): number {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / Math.abs(prev)) * 100;
      }

      const summaryDelta = {
        totalLeads: pctDelta(current.totalLeads, previous.totalLeads),
        doneDeals: pctDelta(current.doneDeals, previous.doneDeals),
        conversionRate: pctDelta(current.conversionRate, previous.conversionRate),
        totalRevenue: pctDelta(current.totalRevenue, previous.totalRevenue),
        futureDeals: pctDelta(current.futureDeals, previous.futureDeals),
        aov: pctDelta(current.aov, previous.aov),
      };

      // ── Agent Performance Cards ───────────────────────────────────────────
      const agentNames = ["Guy", "Rob", "James"];
      const agentCards = agentNames.map((agent) => {
        const agentSubs = currentSubs.filter((s) => s.salesPerson === agent);
        const totalDeals = agentSubs.length;
        const installments = agentSubs.filter((s) => s.planType === "installment").length;
        const future = agentSubs.filter((s) => s.status === "future").length;
        const oneTime = agentSubs.filter((s) => s.planType === "one_payment").length;
        const subscriptions = agentSubs.filter((s) => s.planType === "subscription" && s.status !== "future").length;

        let deposit = 0;
        let totalTurnOver = 0;
        let futureTurnOver = 0;

        for (const s of agentSubs) {
          const totalAmt = s.totalAmount ? parseFloat(String(s.totalAmount)) : 0;
          const amt = s.amount ? parseFloat(String(s.amount)) : 0;
          const fee = s.setupFee ? parseFloat(String(s.setupFee)) : 0;
          deposit += fee;
          if (s.status !== "future") {
            if (s.planType === "installment") {
              deposit += amt; // first instalment payment collected
            } else if (s.planType === "one_payment") {
              deposit += totalAmt; // full one-time payment collected
            }
          }

          if (s.status === "future") {
            futureTurnOver += totalAmt;
            totalTurnOver += totalAmt;
          } else if (s.planType === "installment" || s.planType === "one_payment") {
            totalTurnOver += totalAmt;
          } else if (s.planType === "subscription") {
            totalTurnOver += amt;
          }
        }

        // Declines for this agent (calculated before netTurnOver)
        const declineTypes = ["Pre-Cycle-Decline", "Decline Live Sub"];
        const agentDeclines = currentLeads.filter(
          (l) => l.assignedAgent === agent && l.leadType && declineTypes.includes(l.leadType)
        );
        const declinesCount = agentDeclines.length;

        // Calculate remaining amount for declines
        let declineRemaining = 0;
        for (const d of agentDeclines) {
          // Try to find matching subscription by email
          const matchingSub = d.email
            ? allSubs.find((s) => s.email === d.email && s.subscriptionId !== d.subscriptionId)
            : null;
          if (matchingSub && matchingSub.totalAmount && matchingSub.currentBillingCycle && matchingSub.amount) {
            const total = parseFloat(String(matchingSub.totalAmount));
            const paid = matchingSub.currentBillingCycle * parseFloat(String(matchingSub.amount));
            declineRemaining += Math.max(0, total - paid);
          } else {
            // Fallback to monthlyAmount from lead_assignments
            declineRemaining += d.monthlyAmount ?? 0;
          }
        }

        // Net Turn Over = Total T/O - Future T/O - Decline Amount
        const netTurnOver = totalTurnOver - futureTurnOver - declineRemaining;
        const netDeals = totalDeals - future;
        const aov = netDeals > 0 ? netTurnOver / netDeals : 0;

        return {
          agent,
          totalDeals,
          installments,
          subscriptions,
          future,
          oneTime,
          deposit: Math.round(deposit * 100) / 100,
          totalTurnOver: Math.round(totalTurnOver * 100) / 100,
          futureTurnOver: Math.round(futureTurnOver * 100) / 100,
          netTurnOver: Math.round(netTurnOver * 100) / 100,
          aov: Math.round(aov * 100) / 100,
          declinesCount,
          declineRemaining: Math.round(declineRemaining * 100) / 100,
        };
      });

      // ── Conversion by Lead Type ───────────────────────────────────────────
      const leadTypes = [
        "Cat to Rob",
        "Pre-Cycle-Cancelled",
        "Cancel Live Sub (Cycle 1)",
        "Cancel Live Sub (Cycle 2+)",
        "Pre-Cycle-Decline",
        "Decline Live Sub",
        "Hot Lead",
      ];

      const conversionByLeadType = leadTypes.map((lt) => {
        const leadsOfType = currentLeads.filter((l) => l.leadType === lt);
        const leadsIn = leadsOfType.length;
        const doneDeal = leadsOfType.filter((l) => l.workStatus === "done_deal" || l.workStatus === "future_deal").length;
        const lost = leadsOfType.filter(
          (l) => l.workStatus === "not_interested" || l.workStatus === "cancelled_sub" || l.workStatus === "archived"
        ).length;
        const conversionPct = leadsIn > 0 ? (doneDeal / leadsIn) * 100 : 0;

        return {
          leadType: lt,
          leadsIn,
          doneDeal,
          lost,
          conversionPct: Math.round(conversionPct * 10) / 10,
        };
      });

      // ── Conversion by Agent ───────────────────────────────────────────────
      const conversionByAgent = agentNames.map((agent) => {
        const agentLeads = currentLeads.filter((l) => l.assignedAgent === agent);
        const assigned = agentLeads.length;
        const deals = agentLeads.filter((l) => l.workStatus === "done_deal" || l.workStatus === "future_deal").length;
        const convPct = assigned > 0 ? (deals / assigned) * 100 : 0;

        return {
          agent,
          assigned,
          deals,
          conversionPct: Math.round(convPct * 10) / 10,
        };
      });

      // ── Drill-down data (all leads + subs for the period, for modal) ──────
      const drillDown = currentLeads.map((l) => ({
        id: l.id,
        customerName: l.customerName || "Unknown",
        email: l.email || "",
        phone: l.phone || null,
        leadType: l.leadType || "",
        planName: l.planName || "",
        amount: l.totalSpend ?? l.monthlyAmount ?? 0,
        eventDate: l.eventDate || "",
        workStatus: l.workStatus || "new",
        assignedAgent: l.assignedAgent || "",
      }));

      const drillDownSubs = currentSubs.map((s) => ({
        id: s.id,
        customerName: s.customerName || "Unknown",
        email: s.email || "",
        phone: s.phone || null,
        leadType: "",
        planType: s.planType,
        planName: s.planName || "",
        amount: s.totalAmount ? parseFloat(String(s.totalAmount)) : (s.amount ? parseFloat(String(s.amount)) : 0),
        eventDate: s.createdOn ? String(s.createdOn) : "",
        activatedOn: s.activatedOn ? String(s.activatedOn) : "",
        status: s.status,
        salesPerson: s.salesPerson,
      }));

      return {
        summary: {
          totalLeads: current.totalLeads,
          doneDeals: current.doneDeals,
          conversionRate: Math.round(current.conversionRate * 10) / 10,
          totalRevenue: Math.round(current.totalRevenue * 100) / 100,
          futureDeals: current.futureDeals,
          aov: Math.round(current.aov * 100) / 100,
          futureRevenue: Math.round(current.futureRevenue ?? 0),
        },
        summaryDelta: {
          totalLeads: Math.round(summaryDelta.totalLeads * 10) / 10,
          doneDeals: Math.round(summaryDelta.doneDeals * 10) / 10,
          conversionRate: Math.round(summaryDelta.conversionRate * 10) / 10,
          totalRevenue: Math.round(summaryDelta.totalRevenue * 10) / 10,
          futureDeals: Math.round(summaryDelta.futureDeals * 10) / 10,
          aov: Math.round(summaryDelta.aov * 10) / 10,
        },
        agentCards,
        conversionByLeadType,
        conversionByAgent,
        drillDown,
        drillDownSubs,
        periodLabel: input.dateRange === "today" ? "vs yesterday"
          : input.dateRange === "yesterday" ? "vs day before"
          : input.dateRange === "7days" ? "vs previous 7 days"
          : input.dateRange === "this_month" ? "vs last month"
          : input.dateRange === "last_month" ? "vs month before"
          : "vs previous period",
      };
    }),

  // ─── Get lead_assignment by phone number (for WhatsApp callback booking) ──
  getLeadByPhone: protectedProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // Normalize the phone using the shared normalisePhone helper
      const phone = normalisePhone(input.phone) ?? input.phone;

      // 1. Try lead_assignments first (existing behaviour)
      const leadResults = await db
        .select({ subscriptionId: leadAssignments.subscriptionId, customerName: leadAssignments.customerName })
        .from(leadAssignments)
        .where(eq(leadAssignments.phone, phone))
        .limit(1);
      if (leadResults[0]) return leadResults[0];

      // 2. Fallback: look up in contacts table
      const contactResults = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          email: contacts.email,
          agentName: contacts.agentName,
        })
        .from(contacts)
        .where(eq(contacts.phone, phone))
        .limit(1);
      if (!contactResults[0]) return null;

      const contact = contactResults[0];

      // 3. Create a lead_assignment on the fly so the callback can be booked
      const subscriptionId = `msg_callback_${contact.id}_${Date.now()}`;
      await db.insert(leadAssignments).values({
        subscriptionId,
        customerName: contact.name,
        email: contact.email ?? undefined,
        phone,
        assignedAgent: contact.agentName ?? undefined,
        contactId: contact.id,
        workStatus: "new",
      });

      return { subscriptionId, customerName: contact.name };
    }),
});
