import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailTemplates, emailLogs, contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Postmark send helper
async function sendViaPostmark(opts: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
}) {
  const apiKey = process.env.POSTMARK_API_KEY;
  if (!apiKey) throw new Error("POSTMARK_API_KEY not configured");

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": apiKey,
    },
    body: JSON.stringify({
      From: opts.from,
      To: opts.to,
      Subject: opts.subject,
      HtmlBody: opts.htmlBody,
      ReplyTo: opts.replyTo ?? opts.from,
      MessageStream: "outbound",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Postmark error: ${res.status} ${err}`);
  }
  return res.json() as Promise<{ MessageID: string }>;
}

/** Wrap email body in a professional HTML layout with optional header image + footer */
function wrapEmailHtml(opts: {
  bodyHtml: string;
  headerImageUrl?: string | null;
  agentName: string;
}) {
  const logoUrl = "https://lavielabs.com/cdn/shop/files/logo-big.png?v=1761659671&width=300";
  const headerSection = opts.headerImageUrl
    ? `<tr><td align="center" style="padding:20px 20px 10px;">
        <img src="${opts.headerImageUrl}" alt="Lavie Labs" style="max-width:100%;height:auto;max-height:120px;" />
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
    <tr><td align="center" style="padding:20px 0;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        ${headerSection}
        <!-- Body -->
        <tr><td style="padding:20px 30px;font-size:15px;color:#333333;line-height:1.6;">
          ${opts.bodyHtml}
        </td></tr>
        <!-- Agent signature -->
        <tr><td style="padding:0 30px 15px;font-size:13px;color:#555555;">
          Kind regards,<br/><strong>${opts.agentName}</strong><br/>Lavie Labs UK
        </td></tr>
        <!-- Footer -->
        <tr><td style="border-top:1px solid #eeeeee;padding:20px 30px;text-align:center;">
          <img src="${logoUrl}" alt="Lavie Labs" style="max-width:120px;height:auto;margin-bottom:8px;" /><br/>
          <span style="font-size:12px;color:#999999;">Lavie Labs UK &bull; <a href="https://lavielabs.co.uk" style="color:#999999;text-decoration:underline;">www.lavielabs.co.uk</a></span><br/>
          <span style="font-size:11px;color:#bbbbbb;"><a href="mailto:support@lavielabs.com" style="color:#bbbbbb;text-decoration:underline;">support@lavielabs.com</a></span>
        </td></tr>
      </table>
    </td></tr>
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
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        description: emailTemplates.description,
        headerImageUrl: emailTemplates.headerImageUrl,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .orderBy(emailTemplates.name);
    return rows;
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
        htmlBody: z.string().min(1).optional(),
        description: z.string().optional(),
        headerImageUrl: z.string().url().optional().or(z.literal('')),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, headerImageUrl, ...rest } = input;
      const fields: Record<string, unknown> = { ...rest };
      // Allow clearing the field by passing empty string
      if (headerImageUrl !== undefined) {
        fields.headerImageUrl = headerImageUrl || null;
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

      // Wrap in professional email layout with header image + footer + agent signature
      const resolvedHtml = wrapEmailHtml({
        bodyHtml: resolvedBodyHtml,
        headerImageUrl: template.headerImageUrl,
        agentName,
      });

      // Send via Postmark
      const fromAddress = `${agentName} <trial@lavielabs.com>`;
      let postmarkMessageId: string | null = null;
      try {
        const result = await sendViaPostmark({
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
