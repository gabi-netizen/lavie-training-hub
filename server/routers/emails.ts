/**
 * Emails tRPC Router
 * Provides procedures for the Workspace Emails tab:
 * - listForContact: Get all emails (sent + received) for a contact
 * - send: Send a new email to a contact with tracking
 * - getContactEmail: Get a contact's email address
 * - getUnreadNotifications: Get unread email notifications for the current user
 * - markNotificationsRead: Mark notifications as read
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  emailLogs,
  contacts,
  gmailIncomingEmails,
  emailNotifications,
  users,
} from "../../drizzle/schema";
import { eq, desc, sql, isNull, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sendViaGmail } from "../gmailTransport";
import { injectTrackingPixel, rewriteLinksForTracking } from "../emailTracking";

export const emailsRouter = router({
  /**
   * List all emails for a contact (sent + received), sorted by date descending.
   */
  listForContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify the agent has access to this contact
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);

      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      // If user has a team (is an agent), check they own this contact
      if (ctx.user.team) {
        const userEmail = ctx.user.email;
        if (contact.agentEmail && userEmail && contact.agentEmail !== userEmail) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your contact" });
        }
      }

      // Get outbound emails from email_logs
      const outbound = await db
        .select({
          id: emailLogs.id,
          subject: emailLogs.subject,
          body: emailLogs.htmlBody,
          fromEmail: emailLogs.fromEmail,
          toEmail: emailLogs.toEmail,
          createdAt: emailLogs.sentAt,
          openedAt: emailLogs.openedAt,
          openCount: emailLogs.openCount,
          clickedAt: emailLogs.clickedAt,
          clickCount: emailLogs.clickCount,
          sentByUserId: emailLogs.sentByUserId,
          sentByName: emailLogs.sentByName,
        })
        .from(emailLogs)
        .where(eq(emailLogs.contactId, input.contactId))
        .orderBy(desc(emailLogs.sentAt));

      // Get inbound emails from gmail_incoming_emails matched by contact email
      let inbound: any[] = [];
      if (contact.email) {
        inbound = await db
          .select({
            id: gmailIncomingEmails.id,
            subject: gmailIncomingEmails.subject,
            body: gmailIncomingEmails.bodyHtml,
            fromEmail: gmailIncomingEmails.fromEmail,
            fromName: gmailIncomingEmails.fromName,
            createdAt: gmailIncomingEmails.emailDate,
          })
          .from(gmailIncomingEmails)
          .where(eq(gmailIncomingEmails.fromEmail, contact.email))
          .orderBy(desc(gmailIncomingEmails.emailDate));
      }

      // Merge and sort by date
      const allEmails = [
        ...outbound.map((e) => ({
          id: e.id,
          direction: "outbound" as const,
          subject: e.subject ?? "(No subject)",
          body: e.body ?? "",
          from: e.fromEmail ?? "trial@lavielabs.com",
          to: e.toEmail ?? contact.email ?? "",
          createdAt: e.createdAt,
          openedAt: e.openedAt,
          openCount: e.openCount,
          clickedAt: e.clickedAt,
          clickCount: e.clickCount,
          sentByUserId: e.sentByUserId,
          sentByUserName: e.sentByName ?? "Agent",
        })),
        ...inbound.map((e) => ({
          id: e.id + 1000000, // Offset to avoid ID collisions
          direction: "inbound" as const,
          subject: e.subject ?? "(No subject)",
          body: e.body ?? "",
          from: e.fromEmail ?? "",
          to: "trial@lavielabs.com",
          createdAt: e.createdAt,
          openedAt: null,
          openCount: 0,
          clickedAt: null,
          clickCount: 0,
          sentByUserId: null,
          sentByUserName: e.fromName ?? e.fromEmail ?? "Customer",
        })),
      ].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      return allEmails;
    }),

  /**
   * Send a new email to a contact with tracking pixel and link tracking.
   */
  send: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        subject: z.string().min(1, "Subject is required"),
        body: z.string().min(1, "Message body is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load contact
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);

      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      if (!contact.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Contact has no email address" });

      // If user has a team (is an agent), check they own this contact
      if (ctx.user.team) {
        const userEmail = ctx.user.email;
        if (contact.agentEmail && userEmail && contact.agentEmail !== userEmail) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your contact" });
        }
      }

      const agentName = ctx.user.name ?? "Lavie Labs";
      const agentEmail = ctx.user.email ?? "trial@lavielabs.com";
      const firstName = (contact.name ?? "").split(" ")[0] || contact.name || "there";

      // Build the HTML email
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(input.body);
      const formattedBody = hasHtmlTags ? input.body : input.body.replace(/\n/g, "<br>");

      const htmlBody = `<!DOCTYPE html>
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
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555555;">Should you need anything please don't hesitate to respond to this email. Alternatively email <a href="mailto:support@lavielabs.com" style="color:#2b5cab;text-decoration:underline;">support@lavielabs.com</a></p>
              <p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${agentName}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // First, insert the email log to get the ID (needed for tracking URLs)
      const [insertResult] = await db.insert(emailLogs).values({
        contactId: input.contactId,
        templateId: 0, // No template — freeform email
        templateName: "Freeform (Emails Tab)",
        sentByUserId: ctx.user.id,
        sentByName: agentName,
        subject: input.subject,
        toEmail: contact.email,
        htmlBody: htmlBody,
        fromEmail: agentEmail,
        postmarkMessageId: null,
      }).$returningId();

      const emailLogId = insertResult.id;

      // Now inject tracking pixel and rewrite links
      let trackedHtml = rewriteLinksForTracking(htmlBody, emailLogId);
      trackedHtml = injectTrackingPixel(trackedHtml, emailLogId);

      // Send via Gmail SMTP
      const fromAddress = `${agentName} <trial@lavielabs.com>`;
      try {
        const result = await sendViaGmail({
          from: fromAddress,
          to: contact.email,
          subject: input.subject,
          htmlBody: trackedHtml,
          replyTo: agentEmail,
        });

        // Update the log with the message ID
        await db
          .update(emailLogs)
          .set({ postmarkMessageId: result.MessageID ?? null })
          .where(eq(emailLogs.id, emailLogId));
      } catch (err) {
        // Delete the log entry since sending failed
        await db.delete(emailLogs).where(eq(emailLogs.id, emailLogId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${(err as Error).message}`,
        });
      }

      return {
        success: true,
        emailLogId,
      };
    }),

  /**
   * Get a contact's email address.
   */
  getContactEmail: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [contact] = await db
        .select({ email: contacts.email, name: contacts.name })
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);

      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      return { email: contact.email, name: contact.name };
    }),

  /**
   * Get unread email notifications for the current user.
   */
  getUnreadNotifications: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const notifications = await db
      .select()
      .from(emailNotifications)
      .where(
        and(
          eq(emailNotifications.userId, ctx.user.id),
          isNull(emailNotifications.readAt)
        )
      )
      .orderBy(desc(emailNotifications.createdAt))
      .limit(50);

    return notifications;
  }),

  /**
   * Mark notifications as read.
   */
  markNotificationsRead: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.ids.length === 0) return { success: true };

      // Mark all specified notifications as read (only if they belong to the user)
      for (const id of input.ids) {
        await db
          .update(emailNotifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(emailNotifications.id, id),
              eq(emailNotifications.userId, ctx.user.id)
            )
          );
      }

      return { success: true };
    }),

  /**
   * Send an email to any address (not just a contact).
   * If a contact with that email exists, logs against them. Otherwise logs with contactId=0.
   */
  sendDirect: protectedProcedure
    .input(
      z.object({
        toEmail: z.string().email("Invalid email address"),
        subject: z.string().min(1, "Subject is required"),
        body: z.string().min(1, "Message body is required"),
        contactId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const agentName = ctx.user.name ?? "Lavie Labs";
      const agentEmail = ctx.user.email ?? "trial@lavielabs.com";

      // Try to find contact by email if contactId not provided
      let resolvedContactId = input.contactId ?? 0;
      if (!input.contactId) {
        const [found] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.email, input.toEmail))
          .limit(1);
        if (found) resolvedContactId = found.id;
      }

      // Build the HTML email
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(input.body);
      const formattedBody = hasHtmlTags ? input.body : input.body.replace(/\n/g, "<br>");

      const htmlBody = `<!DOCTYPE html>
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
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555555;">Should you need anything please don't hesitate to respond to this email. Alternatively email <a href="mailto:support@lavielabs.com" style="color:#2b5cab;text-decoration:underline;">support@lavielabs.com</a></p>
              <p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${agentName}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // Insert email log
      const [insertResult] = await db.insert(emailLogs).values({
        contactId: resolvedContactId,
        templateId: 0,
        templateName: "Freeform (New Email)",
        sentByUserId: ctx.user.id,
        sentByName: agentName,
        subject: input.subject,
        toEmail: input.toEmail,
        htmlBody: htmlBody,
        fromEmail: agentEmail,
        postmarkMessageId: null,
      }).$returningId();

      const emailLogId = insertResult.id;

      // Inject tracking
      let trackedHtml = rewriteLinksForTracking(htmlBody, emailLogId);
      trackedHtml = injectTrackingPixel(trackedHtml, emailLogId);

      // Send via Gmail SMTP
      const fromAddress = `${agentName} <trial@lavielabs.com>`;
      try {
        const result = await sendViaGmail({
          from: fromAddress,
          to: input.toEmail,
          subject: input.subject,
          htmlBody: trackedHtml,
          replyTo: agentEmail,
        });

        await db
          .update(emailLogs)
          .set({ postmarkMessageId: result.MessageID ?? null })
          .where(eq(emailLogs.id, emailLogId));
      } catch (err) {
        await db.delete(emailLogs).where(eq(emailLogs.id, emailLogId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${(err as Error).message}`,
        });
      }

      return { success: true, emailLogId };
    }),
});
