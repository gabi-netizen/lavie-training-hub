import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listWhatsAppTemplates, fetchTemplateBody } from "../twilio";
import { sendViaGmail } from "../gmailTransport";
import { getDb } from "../db";
import { emailTemplates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Twilio Config ──────────────────────────────────────────────────────────────
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298",
    smsFrom: process.env.TWILIO_SMS_FROM || "+447888868298",
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "MG29451bf7a284aeaf68bdb0ebba5184fa",
  };
}

function getTwilioAuthHeader(): string {
  const { accountSid, authToken } = getTwilioConfig();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${credentials}`;
}

// ─── Normalise Phone ────────────────────────────────────────────────────────────
function normalisePhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-().]/g, "");
  // UK numbers without country code
  if (cleaned.startsWith("0") && cleaned.length >= 10) {
    cleaned = "+44" + cleaned.slice(1);
  }
  // Already has +
  if (cleaned.startsWith("+")) return cleaned;
  // Has country code without +
  if (cleaned.startsWith("44") && cleaned.length >= 11) return "+" + cleaned;
  // Default: prepend +
  if (cleaned.length >= 10) return "+" + cleaned;
  return null;
}

// ─── Send single WhatsApp via Twilio ────────────────────────────────────────────
async function sendWhatsApp(opts: {
  to: string;
  contentSid: string;
  customerFirstName?: string;
  agentFirstName?: string;
}): Promise<{ success: boolean; sid?: string; error?: string }> {
  const { accountSid, whatsappFrom } = getTwilioConfig();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    From: whatsappFrom,
    To: `whatsapp:${opts.to}`,
    ContentSid: opts.contentSid,
  });

  // Add content variables if we have names
  if (opts.customerFirstName || opts.agentFirstName) {
    const vars: Record<string, string> = {};
    if (opts.customerFirstName) vars["1"] = opts.customerFirstName;
    if (opts.agentFirstName) vars["2"] = opts.agentFirstName;
    params.append("ContentVariables", JSON.stringify(vars));
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `${res.status}: ${errText}` };
    }
    const data = await res.json();
    return { success: true, sid: data.sid };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Send single SMS via Twilio ─────────────────────────────────────────────────
async function sendSms(opts: {
  to: string;
  contentSid: string;
  customerFirstName?: string;
  agentFirstName?: string;
}): Promise<{ success: boolean; sid?: string; error?: string }> {
  const { accountSid, smsFrom } = getTwilioConfig();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    From: smsFrom,
    To: opts.to,
    ContentSid: opts.contentSid,
  });

  // Add content variables if we have names
  if (opts.customerFirstName || opts.agentFirstName) {
    const vars: Record<string, string> = {};
    if (opts.customerFirstName) vars["1"] = opts.customerFirstName;
    if (opts.agentFirstName) vars["2"] = opts.agentFirstName;
    params.append("ContentVariables", JSON.stringify(vars));
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `${res.status}: ${errText}` };
    }
    const data = await res.json();
    return { success: true, sid: data.sid };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Placeholder filler for email templates ─────────────────────────────────────
function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    return vars[trimmed] ?? _match;
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────────
export const bulkMessagingRouter = router({
  /**
   * Bulk send messages via WhatsApp, SMS, or Email.
   * Accepts a list of recipients and a template ID.
   */
  bulkSendMessage: protectedProcedure
    .input(
      z.object({
        recipients: z.array(
          z.object({
            phone: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
          })
        ),
        channel: z.enum(["whatsapp", "sms", "email"]),
        templateId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { recipients, channel, templateId } = input;
      const agentName = ctx.user.name ?? "Lavie Labs";
      const agentFirstName = agentName.split(" ")[0] || "Lavie Labs";
      const agentEmail = ctx.user.email ?? "support@lavielabs.com";

      const results: { recipient: string; success: boolean; error?: string }[] = [];

      if (channel === "whatsapp") {
        for (const r of recipients) {
          if (!r.phone) {
            results.push({ recipient: r.name || "Unknown", success: false, error: "No phone number" });
            continue;
          }
          const normalised = normalisePhone(r.phone);
          if (!normalised) {
            results.push({ recipient: r.name || r.phone, success: false, error: "Invalid phone number" });
            continue;
          }
          const customerFirstName = (r.name ?? "").split(" ")[0] || "there";
          const result = await sendWhatsApp({
            to: normalised,
            contentSid: templateId,
            customerFirstName,
            agentFirstName,
          });
          results.push({
            recipient: r.name || r.phone,
            success: result.success,
            error: result.error,
          });
        }
      } else if (channel === "sms") {
        for (const r of recipients) {
          if (!r.phone) {
            results.push({ recipient: r.name || "Unknown", success: false, error: "No phone number" });
            continue;
          }
          const normalised = normalisePhone(r.phone);
          if (!normalised) {
            results.push({ recipient: r.name || r.phone, success: false, error: "Invalid phone number" });
            continue;
          }
          const customerFirstName = (r.name ?? "").split(" ")[0] || "there";
          const result = await sendSms({
            to: normalised,
            contentSid: templateId,
            customerFirstName,
            agentFirstName,
          });
          results.push({
            recipient: r.name || r.phone,
            success: result.success,
            error: result.error,
          });
        }
      } else if (channel === "email") {
        // Email: templateId is the numeric ID of an email template
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }
        const templateIdNum = parseInt(templateId, 10);
        if (isNaN(templateIdNum)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email template ID" });
        }
        const [template] = await db
          .select()
          .from(emailTemplates)
          .where(eq(emailTemplates.id, templateIdNum));
        if (!template) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found" });
        }

        for (const r of recipients) {
          if (!r.email) {
            results.push({ recipient: r.name || "Unknown", success: false, error: "No email address" });
            continue;
          }
          const firstName = (r.name ?? "").split(" ")[0] || r.name || "";
          const vars: Record<string, string> = {
            "Customers.First Name": firstName,
            "Customers.Customers Owner": agentName,
            agentName,
            agentEmail,
            name: firstName,
            firstName,
            fullName: r.name || "",
            agentOwner: agentName,
          };
          const resolvedSubject = fillPlaceholders(template.subject, vars);
          const resolvedBodyHtml = fillPlaceholders(template.htmlBody, vars);

          // Wrap in HTML layout if not already full HTML
          const isFullHtml = /<html[\s>]/i.test(resolvedBodyHtml);
          const hasHtmlTags = /<[a-z][\s\S]*>/i.test(resolvedBodyHtml);
          const formattedBody = hasHtmlTags ? resolvedBodyHtml : resolvedBodyHtml.replace(/\n/g, "<br>");

          const resolvedHtml = isFullHtml
            ? resolvedBodyHtml
            : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">${template.headerImageUrl ? `<tr><td style="padding:0;"><img src="${template.headerImageUrl}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>` : ""}<tr><td style="padding:32px 32px 24px;"><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p></td></tr><tr><td style="padding:0 32px 24px;"><p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${agentName}</strong></p></td></tr></table></td></tr></table></body></html>`;

          const fromAddress = `${agentName} <trial@lavielabs.com>`;
          try {
            await sendViaGmail({
              from: fromAddress,
              to: r.email,
              subject: resolvedSubject,
              htmlBody: resolvedHtml,
              replyTo: "support@lavielabs.com",
              bcc: "support@lavielabs.com",
            });
            results.push({ recipient: r.name || r.email, success: true });
          } catch (err) {
            results.push({
              recipient: r.name || r.email,
              success: false,
              error: (err as Error).message,
            });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      console.log(
        `[BulkMessaging] ${channel.toUpperCase()} sent by ${ctx.user.name ?? ctx.user.email}: ${successCount} success, ${failCount} failed out of ${recipients.length} recipients`
      );

      return {
        success: true,
        sent: successCount,
        failed: failCount,
        total: recipients.length,
        results,
      };
    }),
});
