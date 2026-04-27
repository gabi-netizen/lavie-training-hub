/**
 * Support Tickets tRPC Router
 *
 * Provides CRUD operations for the email-based support ticket system.
 * Tickets are auto-created by the Gmail webhook + categorization engine.
 * This router exposes them to the Command Centre UI.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { supportTickets } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql, like } from "drizzle-orm";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  CUSTOMER_STATUSES,
  CATEGORY_META,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type CustomerStatus,
} from "../emailCategorization";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEmptyStats() {
  return {
    totalOpen: 0,
    highPriority: 0,
    awaitingResponse: 0,
    resolvedToday: 0,
    byCategory: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byCustomerStatus: {} as Record<string, number>,
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const ticketsRouter = router({
  /**
   * Get ticket stats — counts by category, priority, status.
   */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return buildEmptyStats();

    try {
      const rows = await db
        .select({
          category: supportTickets.category,
          priority: supportTickets.priority,
          status: supportTickets.status,
          customerStatus: supportTickets.customerStatus,
          updatedAt: supportTickets.updatedAt,
        })
        .from(supportTickets);

      if (rows.length === 0) return buildEmptyStats();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const byCategory: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byCustomerStatus: Record<string, number> = {};
      let totalOpen = 0;
      let highPriority = 0;
      let awaitingResponse = 0;
      let resolvedToday = 0;

      for (const row of rows) {
        // By category
        byCategory[row.category] = (byCategory[row.category] || 0) + 1;
        // By priority
        byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
        // By status
        byStatus[row.status] = (byStatus[row.status] || 0) + 1;
        // By customer status
        byCustomerStatus[row.customerStatus] = (byCustomerStatus[row.customerStatus] || 0) + 1;

        // Open tickets
        if (row.status === "open" || row.status === "in_progress") {
          totalOpen++;
        }

        // High priority (open only)
        if (row.priority === "HIGH" && (row.status === "open" || row.status === "in_progress")) {
          highPriority++;
        }

        // Awaiting response = open tickets that are not in_progress
        if (row.status === "open") {
          awaitingResponse++;
        }

        // Resolved today
        if (
          (row.status === "resolved" || row.status === "closed") &&
          row.updatedAt &&
          new Date(row.updatedAt).getTime() >= todayStart.getTime()
        ) {
          resolvedToday++;
        }
      }

      return {
        totalOpen,
        highPriority,
        awaitingResponse,
        resolvedToday,
        byCategory,
        byPriority,
        byStatus,
        byCustomerStatus,
      };
    } catch (err) {
      console.error("[Tickets] Error fetching stats:", err);
      return buildEmptyStats();
    }
  }),

  /**
   * List all tickets with filters.
   */
  getTickets: protectedProcedure
    .input(
      z.object({
        page: z.number().default(1),
        perPage: z.number().default(50),
        category: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        customerStatus: z.string().optional(),
        search: z.string().optional(),
        dateRange: z.enum(["today", "7days", "30days", "this_month", "all"]).default("this_month"),
        sortBy: z.enum(["newest", "oldest", "priority"]).default("newest"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { tickets: [], total: 0 };

      try {
        // Fetch all tickets (we'll filter in JS for flexibility)
        let rows = await db
          .select()
          .from(supportTickets)
          .orderBy(desc(supportTickets.id));

        if (rows.length === 0) return { tickets: [], total: 0 };

        // Map to frontend-friendly format
        let tickets = rows.map((row) => ({
          id: row.id,
          gmailEmailId: row.gmailEmailId,
          messageId: row.messageId,
          fromEmail: row.fromEmail,
          fromName: row.fromName ?? "",
          subject: row.subject ?? "(no subject)",
          body: row.body ?? "",
          receivedAt: row.receivedAt ? row.receivedAt.toISOString() : new Date().toISOString(),
          category: row.category as TicketCategory,
          categoryLabel: CATEGORY_META[row.category as TicketCategory]?.label ?? row.category,
          categoryMeta: CATEGORY_META[row.category as TicketCategory] ?? CATEGORY_META.general_inquiry,
          priority: row.priority as TicketPriority,
          customerStatus: row.customerStatus as CustomerStatus,
          status: row.status as TicketStatus,
          assignedTo: row.assignedTo,
          notes: row.notes,
          createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
          updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
        }));

        // Apply filters
        if (input.category && input.category !== "all") {
          tickets = tickets.filter((t) => t.category === input.category);
        }
        if (input.priority && input.priority !== "all") {
          tickets = tickets.filter((t) => t.priority === input.priority);
        }
        if (input.status && input.status !== "all") {
          tickets = tickets.filter((t) => t.status === input.status);
        }
        if (input.customerStatus && input.customerStatus !== "all") {
          tickets = tickets.filter((t) => t.customerStatus === input.customerStatus);
        }

        // Date range filter
        if (input.dateRange !== "all") {
          const now = Date.now();
          let cutoff: number;
          if (input.dateRange === "today") {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            cutoff = todayStart.getTime();
          } else if (input.dateRange === "7days") {
            cutoff = now - 7 * 24 * 60 * 60 * 1000;
          } else if (input.dateRange === "this_month") {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            cutoff = monthStart.getTime();
          } else {
            cutoff = now - 30 * 24 * 60 * 60 * 1000;
          }
          tickets = tickets.filter((t) => new Date(t.receivedAt).getTime() >= cutoff);
        }

        // Search
        if (input.search) {
          const q = input.search.toLowerCase();
          tickets = tickets.filter(
            (t) =>
              t.fromEmail.toLowerCase().includes(q) ||
              t.fromName.toLowerCase().includes(q) ||
              t.subject.toLowerCase().includes(q) ||
              t.body.toLowerCase().includes(q)
          );
        }

        // Sort
        if (input.sortBy === "oldest") {
          tickets.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
        } else if (input.sortBy === "priority") {
          const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          tickets.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
        }
        // Default: newest first (already sorted by desc id)

        const total = tickets.length;

        // Paginate
        const start = (input.page - 1) * input.perPage;
        const paged = tickets.slice(start, start + input.perPage);

        return { tickets: paged, total };
      } catch (err) {
        console.error("[Tickets] Error fetching tickets:", err);
        return { tickets: [], total: 0 };
      }
    }),

  /**
   * Get a single ticket by ID.
   */
  getTicket: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        const rows = await db
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, input.id))
          .limit(1);

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
          id: row.id,
          gmailEmailId: row.gmailEmailId,
          messageId: row.messageId,
          fromEmail: row.fromEmail,
          fromName: row.fromName ?? "",
          subject: row.subject ?? "(no subject)",
          body: row.body ?? "",
          receivedAt: row.receivedAt ? row.receivedAt.toISOString() : new Date().toISOString(),
          category: row.category as TicketCategory,
          categoryLabel: CATEGORY_META[row.category as TicketCategory]?.label ?? row.category,
          categoryMeta: CATEGORY_META[row.category as TicketCategory] ?? CATEGORY_META.general_inquiry,
          priority: row.priority as TicketPriority,
          customerStatus: row.customerStatus as CustomerStatus,
          status: row.status as TicketStatus,
          assignedTo: row.assignedTo,
          notes: row.notes,
          createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
          updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
        };
      } catch (err) {
        console.error("[Tickets] Error fetching ticket:", err);
        return null;
      }
    }),

  /**
   * Update a ticket (status, assignedTo, notes).
   */
  updateTicket: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        assignedTo: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        category: z.string().optional(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const updateData: Record<string, any> = {};
      if (input.status !== undefined) updateData.status = input.status;
      if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.priority !== undefined) updateData.priority = input.priority;

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db
        .update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, input.id));

      return { success: true };
    }),

  /**
   * Get category metadata for the frontend.
   */
  getCategoryMeta: protectedProcedure.query(() => {
    return CATEGORY_META;
  }),
});
