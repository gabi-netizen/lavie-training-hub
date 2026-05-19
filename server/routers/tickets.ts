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
import { supportTickets, supportTicketReplies } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, asc, sql, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
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
        dateRange: z.enum(["today", "7days", "30days", "all"]).default("all"),
        sortBy: z.enum(["newest", "oldest", "priority"]).default("newest"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { tickets: [], total: 0 };

      try {
        // Fetch all tickets ordered by most recently updated first
        let rows = await db
          .select()
          .from(supportTickets)
          .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id));

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
          tickets.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        } else if (input.sortBy === "priority") {
          const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          tickets.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
        }
        // Default: most recently updated first (already sorted by desc updatedAt)

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
        status: z.enum(["open", "in_progress", "awaiting_response", "customer_replied", "resolved", "closed"]).optional(),
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

  /**
   * Get all replies for a ticket (conversation history).
   */
  getReplies: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      try {
        const replies = await db
          .select()
          .from(supportTicketReplies)
          .where(eq(supportTicketReplies.ticketId, input.ticketId))
          .orderBy(asc(supportTicketReplies.sentAt));

        return replies.map((r) => ({
          id: r.id,
          ticketId: r.ticketId,
          direction: r.direction,
          body: r.body,
          sentAt: r.sentAt?.toISOString() ?? new Date().toISOString(),
          sentBy: r.sentBy,
        }));
      } catch (err) {
        console.error("[Tickets] Error fetching replies:", err);
        return [];
      }
    }),

  /**
   * Reply to a ticket — sends email via Postmark and saves the reply.
   */
  replyToTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
        replyText: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Load the ticket
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.ticketId))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }

      const agentName = ctx.user.name ?? "Lavie Labs Support";
      const toEmail = ticket.fromEmail;
      const subject = `Re: ${ticket.subject || "(no subject)"}`;

      // Build professional HTML email
      const htmlBody = buildReplyEmailHtml({
        bodyText: input.replyText,
        agentName,
        customerName: ticket.fromName || toEmail,
      });

      // Send via Postmark
      const apiKey = process.env.POSTMARK_API_KEY;
      if (!apiKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "POSTMARK_API_KEY not configured" });
      }

      try {
        const response = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": apiKey,
          },
          body: JSON.stringify({
            From: `Lavie Labs Support <trial@lavielabs.com>`,
            To: toEmail,
            Subject: subject,
            HtmlBody: htmlBody,
            TextBody: `Hi ${ticket.fromName || ""},\n\n${input.replyText}\n\nWarm regards,\n${agentName}\nLavie Labs Support`,
            ReplyTo: "trial@lavielabs.com",
            Tag: "support-ticket-reply",
            MessageStream: "outbound",
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error("[Tickets] Postmark error:", errBody);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to send email: ${response.status}`,
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Tickets] Email send failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${(err as Error).message}`,
        });
      }

      // Save the reply
      await db.insert(supportTicketReplies).values({
        ticketId: input.ticketId,
        direction: "outbound",
        body: input.replyText,
        sentBy: agentName,
      });

      // Update ticket status to awaiting_response
      await db
        .update(supportTickets)
        .set({ status: "awaiting_response" })
        .where(eq(supportTickets.id, input.ticketId));

      return { success: true };
    }),
});

// ─── Reply Email HTML Template ──────────────────────────────────────────────

function buildReplyEmailHtml(opts: {
  bodyText: string;
  agentName: string;
  customerName: string;
}): string {
  const HEADER_IMAGE_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663435925457/reKWqPefnHZHXJpv.png";
  const formattedBody = opts.bodyText.replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr><td style="padding:0;"><img src="${HEADER_IMAGE_URL}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">Hi ${opts.customerName.split(" ")[0] || "there"},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555555;">Should you need anything please don't hesitate to respond to this email. Alternatively email <a href="mailto:support@lavielabs.com" style="color:#2b5cab;text-decoration:underline;">support@lavielabs.com</a></p>
              <p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${opts.agentName}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e8e8e8;text-align:center;">
              <a href="mailto:support@lavielabs.com" style="display:inline-block;padding:10px 28px;font-size:13px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:20px;font-weight:bold;background-color:#6f9fea;">Contact Us</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
