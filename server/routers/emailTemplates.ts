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
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...fields } = input;
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
      const resolvedHtml = fillPlaceholders(template.htmlBody, vars);

      // Send via Postmark
      const fromAddress = `${agentName} <support@lavielabs.com>`;
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
