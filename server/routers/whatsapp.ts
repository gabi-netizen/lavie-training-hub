import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listWhatsAppTemplates, sendWhatsAppMessage } from "../twilio";
import { getContact } from "../contacts";
import { normalisePhone } from "../contacts";
import { getDb } from "../db";
import { whatsappMessages, contacts } from "../../drizzle/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

export const whatsappRouter = router({
  // ─── List available WhatsApp templates from Twilio Content API ─────────────
  // Opening: only "op_" or "OP:" prefixed templates
  // Retention: "rt_" or "RT:" prefixed + any template without a known prefix (legacy)
  // No team: sees everything
  templates: protectedProcedure.query(async ({ ctx }) => {
    try {
      const templates = await listWhatsAppTemplates();
      const userTeam = ctx.user.team; // "opening" | "retention" | "academy" | null

      if (!userTeam) {
        // No team (admin/unassigned) — show all templates
        return templates;
      }

      const allKnownPrefixes = ["op_", "OP:", "rt_", "RT:"];
      const hasKnownPrefix = (name: string) =>
        allKnownPrefixes.some((p) => name.startsWith(p));

      if (userTeam === "opening" || userTeam === "academy") {
        // Opening/Academy: only templates explicitly tagged for opening
        return templates.filter((t) =>
          t.friendly_name.startsWith("op_") || t.friendly_name.startsWith("OP:")
        );
      }

      if (userTeam === "retention") {
        // Retention: rt_ prefixed + legacy templates (no prefix)
        return templates.filter((t) =>
          t.friendly_name.startsWith("rt_") ||
          t.friendly_name.startsWith("RT:") ||
          !hasKnownPrefix(t.friendly_name)
        );
      }

      return templates;
    } catch (err) {
      console.error("[WhatsApp] Failed to fetch templates:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch WhatsApp templates from Twilio",
      });
    }
  }),

  // ─── Send a WhatsApp message to a contact using a template ─────────────────
  send: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        contentSid: z.string().min(1),
        templateName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, contentSid, templateName } = input;

      // Get the contact
      const contact = await getContact(contactId);
      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      if (!contact.phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact does not have a phone number",
        });
      }

      // Normalise the phone number to E.164 (UK-focused)
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not normalise contact phone number",
        });
      }

      // Ensure it starts with +
      const e164Phone = normalisedPhone.startsWith("+")
        ? normalisedPhone
        : `+${normalisedPhone}`;

      // Build content variables: {{1}} = customer first name, {{2}} = agent first name
      // Use contact.agentName (the assigned agent) not ctx.user (the logged-in user)
      const customerFirstName = (contact.name ?? "").split(" ")[0] || "there";
      const agentFirstName = (contact.agentName ?? ctx.user.name ?? "").split(" ")[0] || "Lavie Labs";

      try {
        const result = await sendWhatsAppMessage({
          to: e164Phone,
          contentSid,
          contentVariables: {
            "1": customerFirstName,
            "2": agentFirstName,
          },
        });

        console.log(
          `[WhatsApp] Message sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${result.sid}`
        );

        // ─── Save outbound message to whatsapp_messages table ──────────────
        const db = await getDb();
        if (db) {
          try {
            // The "from" number is our Twilio WhatsApp number (strip whatsapp: prefix)
            const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");

            await db.insert(whatsappMessages).values({
              contactId,
              direction: "outbound",
              body: templateName ? `[Template: ${templateName}]` : "[Template message]",
              templateName: templateName || contentSid,
              sentByUserId: ctx.user.id,
              fromNumber,
              toNumber: e164Phone,
              twilioMessageSid: result.sid,
              status: "sent",
              isRead: true, // Outbound messages are always "read"
            });

            console.log(`[WhatsApp] Outbound message saved to DB — contact #${contactId}, SID: ${result.sid}`);
          } catch (dbErr) {
            // Don't fail the send if DB save fails — the message was already sent
            console.error("[WhatsApp] Failed to save outbound message to DB:", dbErr);
          }
        }

        return {
          success: true,
          messageSid: result.sid,
          status: result.status,
        };
      } catch (err) {
        console.error("[WhatsApp] Send error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send WhatsApp message: ${(err as Error).message}`,
        });
      }
    }),

  // ─── Conversations: list contacts with WhatsApp messages ───────────────────
  // Returns contacts grouped with latest message and unread count.
  // Agents see only their own conversations; admins see all.
  conversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    // Users with a team only see their own conversations; users without a team (managers/admins) see all
    const seesAll = !ctx.user.team;
    const userId = ctx.user.id;

    // Get all messages, grouped by contactId, with latest message info
    // Strategy: fetch all distinct contactIds from whatsapp_messages,
    // then for each get the latest message and unread count
    let messagesQuery = db
      .select({
        contactId: whatsappMessages.contactId,
      })
      .from(whatsappMessages);

    // Team-assigned users only see conversations assigned to them
    if (!seesAll) {
      messagesQuery = messagesQuery.where(eq(whatsappMessages.sentByUserId, userId)) as any;
    }

    const allMessages = await messagesQuery;

    // Get unique contactIds (including null for unmatched messages)
    const contactIds = Array.from(new Set(allMessages.map((m) => m.contactId)));

    if (contactIds.length === 0) {
      return [];
    }

    // Build conversation list
    const conversations = [];

    for (const contactId of contactIds) {
      // Get the latest message for this contact
      const whereClause = contactId !== null
        ? eq(whatsappMessages.contactId, contactId)
        : sql`${whatsappMessages.contactId} IS NULL`;

      let latestMsgQuery = db
        .select()
        .from(whatsappMessages)
        .where(
          !seesAll
            ? and(whereClause, eq(whatsappMessages.sentByUserId, userId))
            : whereClause
        )
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(1);

      const [latestMessage] = await latestMsgQuery;
      if (!latestMessage) continue;

      // Count unread inbound messages
      const unreadConditions = contactId !== null
        ? and(
            eq(whatsappMessages.contactId, contactId),
            eq(whatsappMessages.direction, "inbound"),
            eq(whatsappMessages.isRead, false)
          )
        : and(
            sql`${whatsappMessages.contactId} IS NULL`,
            eq(whatsappMessages.direction, "inbound"),
            eq(whatsappMessages.isRead, false)
          );

      const [unreadResult] = await db
        .select({ count: count() })
        .from(whatsappMessages)
        .where(
          !seesAll
            ? and(unreadConditions!, eq(whatsappMessages.sentByUserId, userId))
            : unreadConditions
        );

      const unreadCount = unreadResult?.count ?? 0;

      // Get contact info if available
      let contactInfo = null;
      if (contactId) {
        const [contact] = await db
          .select({
            id: contacts.id,
            name: contacts.name,
            phone: contacts.phone,
            email: contacts.email,
            status: contacts.status,
            agentName: contacts.agentName,
          })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        contactInfo = contact || null;
      }

      conversations.push({
        contactId,
        contact: contactInfo,
        lastMessage: {
          id: latestMessage.id,
          direction: latestMessage.direction,
          body: latestMessage.body,
          status: latestMessage.status,
          createdAt: latestMessage.createdAt,
        },
        unreadCount,
        // For unmatched messages, use the fromNumber as identifier
        fromNumber: latestMessage.direction === "inbound" ? latestMessage.fromNumber : latestMessage.toNumber,
      });
    }

    // Sort by latest message date (most recent first)
    conversations.sort((a, b) => {
      const dateA = new Date(a.lastMessage.createdAt).getTime();
      const dateB = new Date(b.lastMessage.createdAt).getTime();
      return dateB - dateA;
    });

    return conversations;
  }),

  // ─── Messages: get all messages for a specific contact ─────────────────────
  messages: protectedProcedure
    .input(
      z.object({
        contactId: z.number().nullable(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId } = input;
      // Users with a team only see their own messages; users without a team see all
      const seesAll = !ctx.user.team;
      const userId = ctx.user.id;

      let whereClause;
      if (contactId !== null) {
        whereClause = seesAll
          ? eq(whatsappMessages.contactId, contactId)
          : and(eq(whatsappMessages.contactId, contactId), eq(whatsappMessages.sentByUserId, userId));
      } else {
        whereClause = seesAll
          ? sql`${whatsappMessages.contactId} IS NULL`
          : and(sql`${whatsappMessages.contactId} IS NULL`, eq(whatsappMessages.sentByUserId, userId));
      }

      const messages = await db
        .select()
        .from(whatsappMessages)
        .where(whereClause)
        .orderBy(whatsappMessages.createdAt);

      return messages;
    }),

  // ─── Mark as Read: mark all inbound messages for a contact as read ─────────
  markAsRead: protectedProcedure
    .input(
      z.object({
        contactId: z.number().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId } = input;
      // Users with a team only mark their own messages as read; users without a team can mark all
      const seesAll = !ctx.user.team;
      const userId = ctx.user.id;

      let whereClause;
      if (contactId !== null) {
        const baseConditions = and(
          eq(whatsappMessages.contactId, contactId),
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
        whereClause = seesAll
          ? baseConditions
          : and(baseConditions, eq(whatsappMessages.sentByUserId, userId));
      } else {
        const baseConditions = and(
          sql`${whatsappMessages.contactId} IS NULL`,
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
        whereClause = seesAll
          ? baseConditions
          : and(baseConditions, eq(whatsappMessages.sentByUserId, userId));
      }

      await db
        .update(whatsappMessages)
        .set({ isRead: true })
        .where(whereClause!);

      return { success: true };
    }),
});
