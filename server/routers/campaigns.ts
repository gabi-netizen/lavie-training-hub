import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { campaigns, campaignSends, contacts } from "../../drizzle/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { normalisePhone } from "../contacts";

// ─── Twilio Config (reads from environment, same as server/twilio.ts) ──────────
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298",
    smsFrom: process.env.TWILIO_SMS_FROM || "+447888868298",
    statusCallbackUrl:
      process.env.TWILIO_STATUS_CALLBACK_URL ||
      "https://lavie-training-hub-production.up.railway.app/api/whatsapp/status",
  };
}

function getTwilioAuthHeader(): string {
  const { accountSid, authToken } = getTwilioConfig();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${credentials}`;
}

// ─── Audience Filter Schema ──────────────────────────────────────────────────
const audienceFilterSchema = z.object({
  department: z.enum(["opening", "retention"]).optional(),
  leadType: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  agentName: z.string().optional(),
}).passthrough();

// ─── Helper: Send a single message via Twilio ────────────────────────────────
async function sendTwilioMessage(opts: {
  to: string;
  channel: "whatsapp" | "sms";
  templateName?: string | null;
  messageBody?: string | null;
}): Promise<{ sid: string; status: string }> {
  const { accountSid, whatsappFrom, smsFrom, statusCallbackUrl } = getTwilioConfig();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    StatusCallback: statusCallbackUrl,
  });

  if (opts.channel === "whatsapp") {
    params.append("From", whatsappFrom);
    params.append("To", `whatsapp:${opts.to}`);
    if (opts.templateName) {
      // templateName is actually the ContentSid for WhatsApp templates
      params.append("ContentSid", opts.templateName);
    } else if (opts.messageBody) {
      params.append("Body", opts.messageBody);
    }
  } else {
    // SMS
    params.append("From", smsFrom);
    params.append("To", opts.to);
    if (opts.messageBody) {
      params.append("Body", opts.messageBody);
    }
  }

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
    throw new Error(`Twilio API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return { sid: data.sid, status: data.status };
}

// ─── Helper: Get contacts matching an audience filter ────────────────────────
async function getFilteredContacts(filter: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];

  if (filter.department) {
    conditions.push(eq(contacts.department, filter.department));
  }
  if (filter.leadType) {
    conditions.push(eq(contacts.leadType, filter.leadType));
  }
  if (filter.status) {
    conditions.push(eq(contacts.status, filter.status));
  }
  if (filter.source) {
    conditions.push(eq(contacts.source, filter.source));
  }
  if (filter.agentName) {
    conditions.push(eq(contacts.agentName, filter.agentName));
  }

  // Only include contacts that have a phone number
  conditions.push(sql`${contacts.phone} IS NOT NULL`);
  conditions.push(sql`${contacts.phone} != ''`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(contacts)
    .where(whereClause);

  return results;
}

// ─── Campaigns Router ────────────────────────────────────────────────────────
export const campaignsRouter = router({
  // ─── List all campaigns ─────────────────────────────────────────────────────
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    const allCampaigns = await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt));

    return allCampaigns;
  }),

  // ─── Get a single campaign with all its sends ───────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      const sends = await db
        .select()
        .from(campaignSends)
        .where(eq(campaignSends.campaignId, input.id))
        .orderBy(desc(campaignSends.createdAt));

      return { ...campaign, sends };
    }),

  // ─── Create a new campaign ──────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        channel: z.enum(["whatsapp", "sms"]),
        templateName: z.string().optional(),
        messageBody: z.string().optional(),
        audienceFilter: audienceFilterSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Validate: WhatsApp needs templateName, SMS needs messageBody
      if (input.channel === "whatsapp" && !input.templateName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "WhatsApp campaigns require a templateName (ContentSid)",
        });
      }
      if (input.channel === "sms" && !input.messageBody) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SMS campaigns require a messageBody",
        });
      }

      const [result] = await db.insert(campaigns).values({
        name: input.name,
        channel: input.channel,
        templateName: input.templateName || null,
        messageBody: input.messageBody || null,
        audienceFilter: input.audienceFilter || null,
        createdByUserId: ctx.user.id,
      }).$returningId();

      console.log(`[Campaigns] Created campaign #${result.id} "${input.name}" by user #${ctx.user.id}`);

      return { id: result.id };
    }),

  // ─── Send a campaign ────────────────────────────────────────────────────────
  send: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Load the campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      if (campaign.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campaign is already "${campaign.status}" — can only send draft campaigns`,
        });
      }

      // Get contacts matching the filter
      const filter = (campaign.audienceFilter as Record<string, any>) || {};
      const matchedContacts = await getFilteredContacts(filter);

      if (matchedContacts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No contacts match the audience filter",
        });
      }

      // Update campaign status to 'sending'
      await db
        .update(campaigns)
        .set({
          status: "sending",
          totalRecipients: matchedContacts.length,
          sentAt: new Date(),
        })
        .where(eq(campaigns.id, input.id));

      console.log(`[Campaigns] Sending campaign #${input.id} to ${matchedContacts.length} contacts...`);

      let sentCount = 0;
      let failedCount = 0;

      // Send to each contact
      for (const contact of matchedContacts) {
        const normalisedPhone = normalisePhone(contact.phone);
        if (!normalisedPhone) {
          // Skip contacts with invalid phone numbers
          failedCount++;
          await db.insert(campaignSends).values({
            campaignId: input.id,
            contactId: contact.id,
            phoneNumber: contact.phone || "unknown",
            channel: campaign.channel,
            status: "failed",
            errorMessage: "Could not normalise phone number",
          });
          continue;
        }

        const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;

        try {
          const result = await sendTwilioMessage({
            to: e164Phone,
            channel: campaign.channel,
            templateName: campaign.templateName,
            messageBody: campaign.messageBody,
          });

          await db.insert(campaignSends).values({
            campaignId: input.id,
            contactId: contact.id,
            phoneNumber: e164Phone,
            channel: campaign.channel,
            status: "sent",
            twilioMessageSid: result.sid,
            sentAt: new Date(),
          });

          sentCount++;
          console.log(`[Campaigns] ✓ Sent to ${e164Phone} (SID: ${result.sid})`);
        } catch (err) {
          failedCount++;
          const errorMsg = (err as Error).message || "Unknown error";

          await db.insert(campaignSends).values({
            campaignId: input.id,
            contactId: contact.id,
            phoneNumber: e164Phone,
            channel: campaign.channel,
            status: "failed",
            errorMessage: errorMsg,
          });

          console.error(`[Campaigns] ✗ Failed to send to ${e164Phone}: ${errorMsg}`);
        }
      }

      // Update campaign to completed
      await db
        .update(campaigns)
        .set({
          status: "completed",
          sentCount,
          completedAt: new Date(),
        })
        .where(eq(campaigns.id, input.id));

      console.log(`[Campaigns] Campaign #${input.id} completed: ${sentCount} sent, ${failedCount} failed`);

      return {
        success: true,
        totalRecipients: matchedContacts.length,
        sentCount,
        failedCount,
      };
    }),

  // ─── Cancel a draft campaign ────────────────────────────────────────────────
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      if (campaign.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel a campaign with status "${campaign.status}" — only draft campaigns can be cancelled`,
        });
      }

      await db
        .update(campaigns)
        .set({ status: "cancelled" })
        .where(eq(campaigns.id, input.id));

      console.log(`[Campaigns] Campaign #${input.id} cancelled`);

      return { success: true };
    }),

  // ─── Push "read but no reply" contacts to Opening ───────────────────────────
  // Takes contacts who read the campaign message but didn't reply,
  // and creates them as leads in the contacts table with source "WhatsApp Campaign".
  pushToOpening: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      // Get sends that were read but NOT replied
      const readNotReplied = await db
        .select()
        .from(campaignSends)
        .where(
          and(
            eq(campaignSends.campaignId, input.id),
            eq(campaignSends.status, "read")
          )
        );

      if (readNotReplied.length === 0) {
        return { success: true, created: 0, message: "No read-but-not-replied contacts found" };
      }

      // Get the contact IDs that already exist
      const contactIds = readNotReplied
        .filter((s) => s.contactId !== null)
        .map((s) => s.contactId!);

      // Load existing contacts to get their details
      let existingContacts: any[] = [];
      if (contactIds.length > 0) {
        existingContacts = await db
          .select()
          .from(contacts)
          .where(inArray(contacts.id, contactIds));
      }

      const existingContactMap = new Map(existingContacts.map((c) => [c.id, c]));

      let createdCount = 0;

      for (const send of readNotReplied) {
        const existingContact = send.contactId ? existingContactMap.get(send.contactId) : null;

        if (existingContact) {
          // Update the existing contact: set source and department to opening
          await db
            .update(contacts)
            .set({
              source: "WhatsApp Campaign",
              department: "opening",
              status: "new",
            })
            .where(eq(contacts.id, existingContact.id));
          createdCount++;
        } else {
          // Create a new contact for unmatched phone numbers
          await db.insert(contacts).values({
            name: `Campaign Lead (${send.phoneNumber})`,
            phone: send.phoneNumber,
            source: "WhatsApp Campaign",
            department: "opening",
            status: "new",
          });
          createdCount++;
        }
      }

      console.log(`[Campaigns] pushToOpening for campaign #${input.id}: ${createdCount} contacts pushed`);

      return { success: true, created: createdCount };
    }),
});
