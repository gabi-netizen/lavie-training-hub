import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listWhatsAppTemplates, sendWhatsAppMessage, sendWhatsAppFreeText, fetchTemplateBody } from "../twilio";
import { getContact } from "../contacts";
import { normalisePhone } from "../contacts";
import { getDb } from "../db";
import { whatsappMessages, contacts, users, whatsappConversationAssignments, whatsappConversations } from "../../drizzle/schema";
import { eq, and, desc, sql, count, isNull, ne } from "drizzle-orm";

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
            // Fetch the actual template body text (with variables substituted)
            const resolvedBody = await fetchTemplateBody(contentSid, {
              "1": customerFirstName,
              "2": agentFirstName,
            });

            // The "from" number is our Twilio WhatsApp number (strip whatsapp: prefix)
            const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");

            await db.insert(whatsappMessages).values({
              contactId,
              direction: "outbound",
              body: resolvedBody,
              templateName: templateName || contentSid,
              sentByUserId: ctx.user.id,
              fromNumber,
              toNumber: e164Phone,
              twilioMessageSid: result.sid,
              status: "sent",
              isRead: true, // Outbound messages are always "read"
            });

            console.log(`[WhatsApp] Outbound message saved to DB — contact #${contactId}, SID: ${result.sid}, body: "${resolvedBody.substring(0, 60)}..."`);
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
  // Returns contacts grouped with latest message, unread count, assignment info, and status.
  // Managers (no team) see ALL conversations.
  // Agents (with team) see conversations assigned to them or unassigned.
  // Supports tab filtering: "all" | "unassigned" | "mine"
  conversations: protectedProcedure
    .input(
      z.object({
        tab: z.enum(["unassigned", "mine", "all"]).default("all"),
        includeResolved: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const tab = input?.tab ?? "all";
      const includeResolved = input?.includeResolved ?? false;

      // Users with a team only see their own conversations; users without a team (managers/admins) see all
      const seesAll = !ctx.user.team;
      const userId = ctx.user.id;

      // Get all distinct contactIds and phone numbers from whatsapp_messages
      const allMessages = await db
        .select({
          contactId: whatsappMessages.contactId,
          fromNumber: whatsappMessages.fromNumber,
          toNumber: whatsappMessages.toNumber,
          direction: whatsappMessages.direction,
        })
        .from(whatsappMessages);

      // Matched contacts (have contactId)
      const matchedContactIds = Array.from(new Set(
        allMessages.filter((m) => m.contactId !== null).map((m) => m.contactId!)
      ));

      // Unmatched messages: group by phone number (the other party)
      const unmatchedPhones = new Set<string>();
      for (const m of allMessages) {
        if (m.contactId === null) {
          const phone = m.direction === "inbound" ? m.fromNumber : m.toNumber;
          if (phone) unmatchedPhones.add(phone);
        }
      }

      // Combined conversation keys
      type ConvKey = { type: "contact"; contactId: number } | { type: "phone"; phone: string };
      const allKeys: ConvKey[] = [
        ...matchedContactIds.map((id) => ({ type: "contact" as const, contactId: id })),
        ...Array.from(unmatchedPhones).map((p) => ({ type: "phone" as const, phone: p })),
      ];

      if (allKeys.length === 0) {
        return [];
      }

      // Get all assignments (latest per contact) — build a map
      const assignments = await db
        .select({
          contactId: whatsappConversationAssignments.contactId,
          assignedUserId: whatsappConversationAssignments.assignedUserId,
          id: whatsappConversationAssignments.id,
          createdAt: whatsappConversationAssignments.createdAt,
        })
        .from(whatsappConversationAssignments)
        .orderBy(desc(whatsappConversationAssignments.createdAt));

      // Build a map of contactId → latest assignedUserId
      const assignmentMap = new Map<number | null, number>();
      for (const a of assignments) {
        if (!assignmentMap.has(a.contactId)) {
          assignmentMap.set(a.contactId, a.assignedUserId);
        }
      }

      // Get all conversation status records
      const conversationStatuses = await db
        .select()
        .from(whatsappConversations);

      const statusMap = new Map<number, typeof conversationStatuses[0]>();
      for (const cs of conversationStatuses) {
        statusMap.set(cs.contactId, cs);
      }

      // Get all user names for assignment display
      const allUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users);
      const userNameMap = new Map<number, string>();
      for (const u of allUsers) {
        userNameMap.set(u.id, u.name ?? "Unknown");
      }

      // Filter keys based on tab and role
      let filteredKeys: ConvKey[] = allKeys;

      if (seesAll) {
        switch (tab) {
          case "unassigned":
            filteredKeys = allKeys.filter((k) => {
              if (k.type === "phone") return true; // unmatched = unassigned
              return !assignmentMap.has(k.contactId);
            });
            break;
          case "mine":
            filteredKeys = allKeys.filter((k) => {
              if (k.type === "phone") return false;
              return assignmentMap.get(k.contactId) === userId;
            });
            break;
          case "all":
          default:
            filteredKeys = allKeys;
            break;
        }
      } else {
        switch (tab) {
          case "unassigned":
            filteredKeys = allKeys.filter((k) => {
              if (k.type === "phone") return true;
              return !assignmentMap.has(k.contactId);
            });
            break;
          case "mine":
            filteredKeys = allKeys.filter((k) => {
              if (k.type === "phone") return false;
              return assignmentMap.get(k.contactId) === userId;
            });
            break;
          case "all":
          default:
            filteredKeys = allKeys.filter((k) => {
              if (k.type === "phone") return false;
              return assignmentMap.get(k.contactId) === userId;
            });
            break;
        }
      }

      if (filteredKeys.length === 0) {
        return [];
      }

      // Filter by conversation status (exclude resolved unless requested)
      if (!includeResolved) {
        filteredKeys = filteredKeys.filter((k) => {
          if (k.type === "phone") return true; // unmatched always show
          const status = statusMap.get(k.contactId);
          if (!status) return true;
          return status.status !== "resolved";
        });
      }

      if (filteredKeys.length === 0) {
        return [];
      }

      // Build conversation list
      const conversations = [];

      for (const key of filteredKeys) {
        let whereClause;
        let contactId: number | null;
        let phoneIdentifier: string | null = null;

        if (key.type === "contact") {
          contactId = key.contactId;
          whereClause = eq(whatsappMessages.contactId, key.contactId);
        } else {
          contactId = null;
          phoneIdentifier = key.phone;
          whereClause = and(
            sql`${whatsappMessages.contactId} IS NULL`,
            sql`(${whatsappMessages.fromNumber} = ${key.phone} OR ${whatsappMessages.toNumber} = ${key.phone})`
          );
        }

        const [latestMessage] = await db
          .select()
          .from(whatsappMessages)
          .where(whereClause)
          .orderBy(desc(whatsappMessages.createdAt))
          .limit(1);

        if (!latestMessage) continue;

        // Count unread inbound messages
        let unreadConditions;
        if (key.type === "contact") {
          unreadConditions = and(
            eq(whatsappMessages.contactId, key.contactId),
            eq(whatsappMessages.direction, "inbound"),
            eq(whatsappMessages.isRead, false)
          );
        } else {
          unreadConditions = and(
            sql`${whatsappMessages.contactId} IS NULL`,
            eq(whatsappMessages.fromNumber, key.phone),
            eq(whatsappMessages.direction, "inbound"),
            eq(whatsappMessages.isRead, false)
          );
        }

        const [unreadResult] = await db
          .select({ count: count() })
          .from(whatsappMessages)
          .where(unreadConditions);

        const unreadCount = unreadResult?.count ?? 0;

        // Get contact info if available
        let contactInfo = null;
        if (key.type === "contact") {
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
            .where(eq(contacts.id, key.contactId))
            .limit(1);
          contactInfo = contact || null;
        }

        // Get assignment info
        const assignedUserId = key.type === "contact" ? assignmentMap.get(key.contactId) : undefined;
        const assignedTo = assignedUserId
          ? { userId: assignedUserId, userName: userNameMap.get(assignedUserId) ?? "Unknown" }
          : null;

        // Get conversation status
        const convStatus = key.type === "contact" ? statusMap.get(key.contactId) : undefined;
        const conversationStatus = convStatus?.status ?? "open";
        const snoozedUntil = convStatus?.snoozedUntil ?? null;

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
          fromNumber: phoneIdentifier ?? (latestMessage.direction === "inbound" ? latestMessage.fromNumber : latestMessage.toNumber),
          assignedTo,
          conversationStatus,
          snoozedUntil,
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

    // ─── Messages: get all messages for a specific contact or phone ────────────
  messages: protectedProcedure
    .input(
      z.object({
        contactId: z.number().nullable(),
        phoneNumber: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const { contactId, phoneNumber } = input;
      let whereClause;
      if (contactId !== null) {
        whereClause = eq(whatsappMessages.contactId, contactId);
      } else if (phoneNumber) {
        // Unmatched conversation: get messages by phone number
        whereClause = and(
          sql`${whatsappMessages.contactId} IS NULL`,
          sql`(${whatsappMessages.fromNumber} = ${phoneNumber} OR ${whatsappMessages.toNumber} = ${phoneNumber})`
        );
      } else {
        whereClause = sql`${whatsappMessages.contactId} IS NULL`;
      }
      const messages = await db
        .select()
        .from(whatsappMessages)
        .where(whereClause)
        .orderBy(whatsappMessages.createdAt);
      return messages;
    }),

  // ─── Mark as Read: mark all inbound messages for a contact or phone as read ─
  markAsRead: protectedProcedure
    .input(
      z.object({
        contactId: z.number().nullable(),
        phoneNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId, phoneNumber } = input;

      let whereClause;
      if (contactId !== null) {
        whereClause = and(
          eq(whatsappMessages.contactId, contactId),
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
      } else if (phoneNumber) {
        whereClause = and(
          sql`${whatsappMessages.contactId} IS NULL`,
          eq(whatsappMessages.fromNumber, phoneNumber),
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
      } else {
        whereClause = and(
          sql`${whatsappMessages.contactId} IS NULL`,
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
      }

      await db
        .update(whatsappMessages)
        .set({ isRead: true })
        .where(whereClause!);

      return { success: true };
    }),

  // ─── Send free-text WhatsApp reply (within 24h conversation window) ─────────
  sendFreeText: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        body: z.string().min(1).max(4096),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, body } = input;

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

      // Normalise the phone number to E.164
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not normalise contact phone number",
        });
      }

      const e164Phone = normalisedPhone.startsWith("+")
        ? normalisedPhone
        : `+${normalisedPhone}`;

      try {
        const result = await sendWhatsAppFreeText({
          to: e164Phone,
          body,
        });

        console.log(
          `[WhatsApp] Free-text sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${result.sid}`
        );

        // Save outbound message to DB
        const db = await getDb();
        if (db) {
          try {
            const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");

            await db.insert(whatsappMessages).values({
              contactId,
              direction: "outbound",
              body,
              templateName: null,
              sentByUserId: ctx.user.id,
              fromNumber,
              toNumber: e164Phone,
              twilioMessageSid: result.sid,
              status: "sent",
              isRead: true,
            });
          } catch (dbErr) {
            console.error("[WhatsApp] Failed to save free-text message to DB:", dbErr);
          }
        }

        return {
          success: true,
          messageSid: result.sid,
          status: result.status,
        };
      } catch (err) {
        console.error("[WhatsApp] Free-text send error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send WhatsApp message: ${(err as Error).message}`,
        });
      }
    }),

  // ─── Assign Conversation: assign a WhatsApp conversation to an agent ───────
  assignConversation: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        assignedUserId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Only managers (users without a team) can assign conversations
      if (ctx.user.team !== null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can assign conversations",
        });
      }

      const { contactId, assignedUserId } = input;

      // Verify the target user exists
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, assignedUserId))
        .limit(1);

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user not found",
        });
      }

      // Create a new assignment record (latest one wins)
      await db.insert(whatsappConversationAssignments).values({
        contactId,
        assignedUserId,
        assignedByUserId: ctx.user.id,
      });

      console.log(
        `[WhatsApp] Conversation for contact #${contactId} assigned to user #${assignedUserId} by ${ctx.user.name ?? ctx.user.email}`
      );

      return { success: true };
    }),

  // ─── Get Agents: list all users for the assign dropdown ────────────────────
  getAgents: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        team: users.team,
        active: users.active,
      })
      .from(users)
      .where(eq(users.active, true));

    // Return all active users with a name
    return allUsers
      .filter((u) => u.name)
      .map((u) => ({
        id: u.id,
        name: u.name!,
        team: u.team,
      }));
  }),

  // ─── Get Assignment: get current assignment for a contact ──────────────────
  getAssignment: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [assignment] = await db
        .select({
          id: whatsappConversationAssignments.id,
          contactId: whatsappConversationAssignments.contactId,
          assignedUserId: whatsappConversationAssignments.assignedUserId,
          assignedByUserId: whatsappConversationAssignments.assignedByUserId,
          createdAt: whatsappConversationAssignments.createdAt,
        })
        .from(whatsappConversationAssignments)
        .where(eq(whatsappConversationAssignments.contactId, input.contactId))
        .orderBy(desc(whatsappConversationAssignments.createdAt))
        .limit(1);

      if (!assignment) return null;

      // Get the assigned user's name
      const [assignedUser] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, assignment.assignedUserId))
        .limit(1);

      return {
        ...assignment,
        assignedUserName: assignedUser?.name ?? "Unknown",
      };
    }),

  // ─── Resolve Conversation: mark a conversation as resolved ─────────────────
  resolveConversation: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId } = input;

      // Check if conversation record exists
      const [existing] = await db
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.contactId, contactId))
        .limit(1);

      if (existing) {
        await db
          .update(whatsappConversations)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            snoozedUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(whatsappConversations.contactId, contactId));
      } else {
        await db.insert(whatsappConversations).values({
          contactId,
          status: "resolved",
          resolvedAt: new Date(),
        });
      }

      console.log(`[WhatsApp] Conversation for contact #${contactId} resolved by ${ctx.user.name ?? ctx.user.email}`);
      return { success: true };
    }),

  // ─── Reopen Conversation: set status back to open ──────────────────────────
  reopenConversation: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId } = input;

      const [existing] = await db
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.contactId, contactId))
        .limit(1);

      if (existing) {
        await db
          .update(whatsappConversations)
          .set({
            status: "open",
            resolvedAt: null,
            snoozedUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(whatsappConversations.contactId, contactId));
      } else {
        await db.insert(whatsappConversations).values({
          contactId,
          status: "open",
        });
      }

      console.log(`[WhatsApp] Conversation for contact #${contactId} reopened by ${ctx.user.name ?? ctx.user.email}`);
      return { success: true };
    }),

  // ─── Snooze Conversation: set status to snoozed with duration ──────────────
  snoozeConversation: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      durationHours: z.number().min(0.5).max(168), // 30 min to 7 days
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { contactId, durationHours } = input;
      const snoozedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

      const [existing] = await db
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.contactId, contactId))
        .limit(1);

      if (existing) {
        await db
          .update(whatsappConversations)
          .set({
            status: "snoozed",
            snoozedUntil,
            resolvedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(whatsappConversations.contactId, contactId));
      } else {
        await db.insert(whatsappConversations).values({
          contactId,
          status: "snoozed",
          snoozedUntil,
        });
      }

      console.log(`[WhatsApp] Conversation for contact #${contactId} snoozed until ${snoozedUntil.toISOString()} by ${ctx.user.name ?? ctx.user.email}`);
      return { success: true, snoozedUntil };
    }),

  // ─── Bulk Send Template: send a template to multiple contacts ──────────────
  bulkSendTemplate: protectedProcedure
    .input(z.object({
      contactIds: z.array(z.number()).min(1),
      contentSid: z.string().min(1),
      templateName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Only managers (seesAll) can use bulk send
      if (ctx.user.team !== null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can use bulk send",
        });
      }

      const { contactIds, contentSid, templateName } = input;
      const results = { sent: 0, failed: 0, errors: [] as string[] };

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");

      for (const contactId of contactIds) {
        try {
          const contact = await getContact(contactId);
          if (!contact || !contact.phone) {
            results.failed++;
            results.errors.push(`Contact #${contactId}: no phone number`);
            continue;
          }

          const normalisedPhone = normalisePhone(contact.phone);
          if (!normalisedPhone) {
            results.failed++;
            results.errors.push(`Contact #${contactId}: could not normalise phone`);
            continue;
          }

          const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;
          const customerFirstName = (contact.name ?? "").split(" ")[0] || "there";
          const agentFirstName = (contact.agentName ?? ctx.user.name ?? "").split(" ")[0] || "Lavie Labs";

          const result = await sendWhatsAppMessage({
            to: e164Phone,
            contentSid,
            contentVariables: {
              "1": customerFirstName,
              "2": agentFirstName,
            },
          });

          // Save to whatsapp_messages
          try {
            const resolvedBody = await fetchTemplateBody(contentSid, {
              "1": customerFirstName,
              "2": agentFirstName,
            });

            await db.insert(whatsappMessages).values({
              contactId,
              direction: "outbound",
              body: resolvedBody,
              templateName: templateName || contentSid,
              sentByUserId: ctx.user.id,
              fromNumber,
              toNumber: e164Phone,
              twilioMessageSid: result.sid,
              status: "sent",
              isRead: true,
            });
          } catch (dbErr) {
            console.error(`[WhatsApp Bulk] Failed to save message for contact #${contactId}:`, dbErr);
          }

          results.sent++;
        } catch (err) {
          results.failed++;
          results.errors.push(`Contact #${contactId}: ${(err as Error).message}`);
        }
      }

      console.log(`[WhatsApp Bulk] Sent ${results.sent}, failed ${results.failed} by ${ctx.user.name ?? ctx.user.email}`);
      return results;
    }),

  // ─── Reply: unified reply procedure with channel selection (WhatsApp or SMS) ──────────
  reply: protectedProcedure
    .input(
      z.object({
        contactId: z.number().optional(),
        phoneNumber: z.string().optional(),
        body: z.string().min(1).max(4096),
        channel: z.enum(["whatsapp", "sms"]),
      }).refine((d) => d.contactId != null || (d.phoneNumber && d.phoneNumber.trim().length > 0), {
        message: "Either contactId or phoneNumber must be provided",
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, phoneNumber: rawPhoneNumber, body, channel } = input;

      // ─── Resolve the destination phone number ────────────────────────────
      let e164Phone: string;
      let resolvedContactId: number | null = contactId ?? null;

      if (contactId != null) {
        // Normal path: look up contact by ID
        const contact = await getContact(contactId);
        if (!contact) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }
        if (!contact.phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
        }
        const normalisedPhone = normalisePhone(contact.phone);
        if (!normalisedPhone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not normalise contact phone number" });
        }
        e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;
      } else {
        // Unmatched path: use the raw phone number directly
        const normalisedPhone = normalisePhone(rawPhoneNumber!);
        if (!normalisedPhone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not normalise phone number" });
        }
        e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;
        resolvedContactId = null;
      }

      if (channel === "sms") {
        // ─── Send via SMS ─────────────────────────────────────────────────
        const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
        const authToken = process.env.TWILIO_AUTH_TOKEN || "";
        const smsFrom = process.env.SMS_FROM_NUMBER || process.env.TWILIO_SMS_FROM || "+447700139589";

        if (!accountSid || !authToken) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Twilio credentials not configured" });
        }

        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const params = new URLSearchParams({
          From: smsFrom,
          To: e164Phone,
          Body: body,
        });

        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(`[Reply/SMS] Twilio error: ${res.status} ${errText}`);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to send SMS: ${res.status} — ${errText}`,
          });
        }

        const data = await res.json();
        console.log(`[Reply/SMS] Sent by ${ctx.user.name ?? ctx.user.email} to ${resolvedContactId != null ? `contact #${resolvedContactId}` : "unmatched"} (${e164Phone}): ${data.sid}`);

        // Save outbound message to DB
        const db = await getDb();
        if (db) {
          try {
            await db.insert(whatsappMessages).values({
              contactId: resolvedContactId,
              direction: "outbound",
              body,
              templateName: null,
              sentByUserId: ctx.user.id,
              fromNumber: smsFrom,
              toNumber: e164Phone,
              twilioMessageSid: data.sid,
              status: "sent",
              isRead: true,
              channel: "sms",
            });
          } catch (dbErr) {
            console.error("[Reply/SMS] Failed to save outbound message to DB:", dbErr);
          }
        }

        return { success: true, messageSid: data.sid as string, status: data.status as string };
      } else {
        // ─── Send via WhatsApp ────────────────────────────────────────────
        try {
          const result = await sendWhatsAppFreeText({ to: e164Phone, body });

          console.log(
            `[Reply/WhatsApp] Sent by ${ctx.user.name ?? ctx.user.email} to ${resolvedContactId != null ? `contact #${resolvedContactId}` : "unmatched"} (${e164Phone}): ${result.sid}`
          );

          // Save outbound message to DB
          const db = await getDb();
          if (db) {
            try {
              const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");

              await db.insert(whatsappMessages).values({
                contactId: resolvedContactId,
                direction: "outbound",
                body,
                templateName: null,
                sentByUserId: ctx.user.id,
                fromNumber,
                toNumber: e164Phone,
                twilioMessageSid: result.sid,
                status: "sent",
                isRead: true,
                channel: "whatsapp",
              });
            } catch (dbErr) {
              console.error("[Reply/WhatsApp] Failed to save outbound message to DB:", dbErr);
            }
          }

          return { success: true, messageSid: result.sid, status: result.status };
        } catch (err) {
          console.error("[Reply/WhatsApp] Send error:", err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to send WhatsApp message: ${(err as Error).message}`,
          });
        }
      }
    }),

  // ─── Send SMS: send a plain SMS (not WhatsApp) to a contact's phone number ──────────
  sendSms: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        body: z.string().min(1).max(1600),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, body } = input;

      // Look up the contact
      const contact = await getContact(contactId);
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      if (!contact.phone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
      }

      // Normalise to E.164
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not normalise contact phone number" });
      }
      const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;

      // Twilio credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      const authToken = process.env.TWILIO_AUTH_TOKEN || "";
      const smsFrom = process.env.TWILIO_SMS_FROM || "+447700139589";

      if (!accountSid || !authToken) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Twilio credentials not configured" });
      }

      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams({
        From: smsFrom,
        To: e164Phone,
        Body: body,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[SMS] Twilio error: ${res.status} ${errText}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send SMS: ${res.status} — ${errText}`,
        });
      }

      const data = await res.json();
      console.log(`[SMS] Sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${data.sid}`);

      // ─── Save outbound message to whatsapp_messages table ──────────────
      const db = await getDb();
      if (db) {
        try {
          await db.insert(whatsappMessages).values({
            contactId,
            direction: "outbound",
            body: body,
            templateName: null,
            sentByUserId: ctx.user.id,
            fromNumber: smsFrom,
            toNumber: e164Phone,
            twilioMessageSid: data.sid,
            status: "sent",
            isRead: true,
            channel: "sms",
          });
          console.log(`[SMS] Outbound message saved to DB — contact #${contactId}, SID: ${data.sid}`);
        } catch (dbErr) {
          console.error("[SMS] Failed to save outbound message to DB:", dbErr);
        }
      }

      return { success: true, messageSid: data.sid as string, status: data.status as string };
    }),

  // ─── List SMS templates from Twilio Content API (same source as WhatsApp) ──────────
  smsTemplates: protectedProcedure.query(async ({ ctx }) => {
    try {
      const templates = await listWhatsAppTemplates();
      const userTeam = ctx.user.team;

      if (!userTeam) {
        return templates;
      }

      const allKnownPrefixes = ["op_", "OP:", "rt_", "RT:"];
      const hasKnownPrefix = (name: string) =>
        allKnownPrefixes.some((p) => name.startsWith(p));

      if (userTeam === "opening" || userTeam === "academy") {
        return templates.filter((t) =>
          t.friendly_name.startsWith("op_") || t.friendly_name.startsWith("OP:")
        );
      }

      if (userTeam === "retention") {
        return templates.filter((t) =>
          t.friendly_name.startsWith("rt_") ||
          t.friendly_name.startsWith("RT:") ||
          !hasKnownPrefix(t.friendly_name)
        );
      }

      return templates;
    } catch (err) {
      console.error("[SMS] Failed to fetch SMS templates:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch SMS templates from Twilio",
      });
    }
  }),

  // ─── Send SMS using a Twilio Content Template (ContentSid) ──────────────────
  sendSmsTemplate: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        contentSid: z.string().min(1),
        templateName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, contentSid, templateName } = input;

      const contact = await getContact(contactId);
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      if (!contact.phone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
      }

      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not normalise contact phone number" });
      }
      const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;

      // Build content variables: {{1}} = customer first name, {{2}} = agent first name
      const customerFirstName = (contact.name ?? "").split(" ")[0] || "there";
      const agentFirstName = (contact.agentName ?? ctx.user.name ?? "").split(" ")[0] || "Lavie Labs";

      const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      const authToken = process.env.TWILIO_AUTH_TOKEN || "";
      const smsFrom = process.env.TWILIO_SMS_FROM || "+447700139589";

      if (!accountSid || !authToken) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Twilio credentials not configured" });
      }

      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams({
        From: smsFrom,
        To: e164Phone,
        ContentSid: contentSid,
      });

      const contentVariables = { "1": customerFirstName, "2": agentFirstName };
      params.append("ContentVariables", JSON.stringify(contentVariables));

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[SMS Template] Twilio error: ${res.status} ${errText}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send SMS template: ${res.status} — ${errText}`,
        });
      }

      const data = await res.json();
      console.log(`[SMS Template] Sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${data.sid}`);

      // Save outbound message to DB
      const db = await getDb();
      if (db) {
        try {
          const resolvedBody = await fetchTemplateBody(contentSid, contentVariables);
          await db.insert(whatsappMessages).values({
            contactId,
            direction: "outbound",
            body: resolvedBody,
            templateName: templateName || contentSid,
            sentByUserId: ctx.user.id,
            fromNumber: smsFrom,
            toNumber: e164Phone,
            twilioMessageSid: data.sid,
            status: "sent",
            isRead: true,
            channel: "sms",
          });
          console.log(`[SMS Template] Outbound message saved to DB — contact #${contactId}, SID: ${data.sid}`);
        } catch (dbErr) {
          console.error("[SMS Template] Failed to save outbound message to DB:", dbErr);
        }
      }

      return { success: true, messageSid: data.sid as string, status: data.status as string };
    }),
});
