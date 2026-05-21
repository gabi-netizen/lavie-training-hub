import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailTemplates, emailLogs, contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sendViaGmail } from "../gmailTransport";

// ─── DEPRECATED: Postmark send helper (kept for reference) ───────────────────
// async function sendViaPostmark(opts: {
//   from: string;
//   to: string;
//   subject: string;
//   htmlBody: string;
//   replyTo?: string;
// }) {
//   const apiKey = process.env.POSTMARK_API_KEY;
//   if (!apiKey) throw new Error("POSTMARK_API_KEY not configured");
//
//   const res = await fetch("https://api.postmarkapp.com/email", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Postmark-Server-Token": apiKey,
//     },
//     body: JSON.stringify({
//       From: opts.from,
//       To: opts.to,
//       Subject: opts.subject,
//       HtmlBody: opts.htmlBody,
//       ReplyTo: opts.replyTo ?? opts.from,
//       MessageStream: "outbound",
//     }),
//   });
//
//   if (!res.ok) {
//     const err = await res.text();
//     throw new Error(`Postmark error: ${res.status} ${err}`);
//   }
//   return res.json() as Promise<{ MessageID: string }>;
// }

/** Wrap email body in a professional HTML layout with optional header image + footer */
function wrapEmailHtml(opts: {
  bodyHtml: string;
  headerImageUrl?: string | null;
  agentName: string;
  contactName: string;
}) {
  const headerSection = opts.headerImageUrl
    ? `<img src="${opts.headerImageUrl}" alt="Lavie Labs" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto 24px;border-radius:8px;" />`
    : "";

  // Convert plain-text newlines to <br> if body doesn't already contain HTML tags
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(opts.bodyHtml);
  const formattedBody = hasHtmlTags
    ? opts.bodyHtml
    : opts.bodyHtml.replace(/\n/g, "<br>");

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
          ${opts.headerImageUrl ? `<tr><td style="padding:0;"><img src="${opts.headerImageUrl}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>` : ""}
          <tr>
            <td style="padding:32px 32px 24px;">
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

/** Replace all known placeholders in a template string */
function fillPlaceholders(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    // Support both ${key} and {{key}} syntax
    result = result.replaceAll(`\${${key}}`, value ?? "");
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

export const emailTemplatesRouter = router({
  /** List all templates (name, subject, description — no full HTML for perf) */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        description: emailTemplates.description,
        headerImageUrl: emailTemplates.headerImageUrl,
        visibility: emailTemplates.visibility,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .orderBy(emailTemplates.name);

    // Admin sees all templates
    if (ctx.user.role === "admin") return rows;

    // Non-admin: filter by visibility
    return rows.filter((t) => {
      if (!t.visibility) return true; // null = everyone
      try {
        const vis = JSON.parse(t.visibility) as { type: string; value?: string; ids?: number[] };
        if (vis.type === "everyone") return true;
        if (vis.type === "team") return ctx.user.team === vis.value;
        if (vis.type === "agents") return vis.ids?.includes(ctx.user.id) ?? false;
        return true;
      } catch {
        return true; // invalid JSON = show to everyone
      }
    });
  }),

  /** Get a single template including full HTML (for preview/edit) */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return row;
    }),

  /** Create a new template (admin only) */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        htmlBody: z.string().min(1),
        description: z.string().optional(),
        headerImageUrl: z.string().url().optional().or(z.literal('')),
        visibility: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.insert(emailTemplates).values({
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        description: input.description ?? null,
        headerImageUrl: input.headerImageUrl || null,
        visibility: input.visibility || null,
      });
      return { success: true };
    }),

  /** Update an existing template (admin only) */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        htmlBody: z.string().optional(),
        description: z.string().optional(),
        headerImageUrl: z.string().url().optional().or(z.literal('')),
        visibility: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, headerImageUrl, visibility, htmlBody, ...rest } = input;
      const fields: Record<string, unknown> = { ...rest };
      // Only update htmlBody if it's non-empty (don't overwrite with blank)
      if (htmlBody) {
        fields.htmlBody = htmlBody;
      }
      // Allow clearing the field by passing empty string
      if (headerImageUrl !== undefined) {
        fields.headerImageUrl = headerImageUrl || null;
      }
      if (visibility !== undefined) {
        fields.visibility = visibility || null;
      }
      await db
        .update(emailTemplates)
        .set(fields)
        .where(eq(emailTemplates.id, id));
      return { success: true };
    }),

  /** Delete a template (admin only) */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(emailTemplates).where(eq(emailTemplates.id, input.id));
      return { success: true };
    }),

  /**
   * Send an email to a contact using a template.
   * Placeholders are auto-filled from contact + agent data.
   */
  send: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        contactId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load template
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, input.templateId));
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      // Load contact
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.contactId));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      if (!contact.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact has no email address" });
      }

      // Build placeholder map
      const agentName = ctx.user.name ?? "Lavié Labs";
      const agentEmail = ctx.user.email ?? "support@lavielabs.com";
      const firstName = (contact.name ?? "").split(" ")[0] || contact.name || "";
      const ownerName = contact.agentName ?? agentName;

      const vars: Record<string, string> = {
        "Customers.First Name": firstName,
        "Customers.Customers Owner": ownerName,
        agentName,
        agentEmail,
        // common aliases
        name: firstName,
        firstName,
        fullName: contact.name || "",
        agentOwner: ownerName,
      };

      const resolvedSubject = fillPlaceholders(template.subject, vars);
      const resolvedBodyHtml = fillPlaceholders(template.htmlBody, vars);

      // Only wrap simple templates; skip wrapping if template already contains full HTML
      const isFullHtml = /<html[\s>]/i.test(resolvedBodyHtml);
      const resolvedHtml = isFullHtml
        ? resolvedBodyHtml
        : wrapEmailHtml({
            bodyHtml: resolvedBodyHtml,
            headerImageUrl: template.headerImageUrl,
            agentName,
            contactName: contact.name || firstName,
          });

      // Send via Gmail SMTP (replaced Postmark 2024-05)
      const fromAddress = `${agentName} <trial@lavielabs.com>`;
      let postmarkMessageId: string | null = null;
      try {
        const result = await sendViaGmail({
          from: fromAddress,
          to: contact.email,
          subject: resolvedSubject,
          htmlBody: resolvedHtml,
          replyTo: agentEmail,
        });
        postmarkMessageId = result.MessageID ?? null;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${(err as Error).message}`,
        });
      }

      // Log the send
      await db.insert(emailLogs).values({
        contactId: input.contactId,
        templateId: input.templateId,
        templateName: template.name,
        sentByUserId: ctx.user.id,
        sentByName: agentName,
        subject: resolvedSubject,
        toEmail: contact.email,
        postmarkMessageId,
      });

      return { success: true, messageId: postmarkMessageId };
    }),

  /** Get email send history for a contact */
  getContactLogs: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select()
        .from(emailLogs)
        .where(eq(emailLogs.contactId, input.contactId))
        .orderBy(emailLogs.sentAt);
      return rows;
    }),
});
