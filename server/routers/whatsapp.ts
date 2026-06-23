import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listWhatsAppTemplates, sendWhatsAppMessage, sendWhatsAppFreeText, fetchTemplateBody } from "../twilio";
import { getContact } from "../contacts";
import { normalisePhone } from "../contacts";
import { getDb } from "../db";
import { whatsappMessages, contacts, users, whatsappConversationAssignments, whatsappConversations, leadAssignments } from "../../drizzle/schema";
import { eq, and, desc, sql, count, isNull, ne, inArray } from "drizzle-orm";

/**
 * Auto-assign a WhatsApp conversation to an agent.
 * Creates a new assignment record (latest one wins) if the conversation
 * is not already assigned to this user.
 */
async function autoAssignConversation(contactId: number | null, userId: number): Promise<void> {
  if (!contactId) return;
  try {
    const db = await getDb();
    if (!db) return;
    // Check if already assigned to this user (latest assignment)
    const [latest] = await db
      .select({ assignedUserId: whatsappConversationAssignments.assignedUserId })
      .from(whatsappConversationAssignments)
      .where(eq(whatsappConversationAssignments.contactId, contactId))
      .orderBy(desc(whatsappConversationAssignments.createdAt))
      .limit(1);
    if (latest && latest.assignedUserId === userId) return; // already assigned
    // Create new assignment
    await db.insert(whatsappConversationAssignments).values({
      contactId,
      assignedUserId: userId,
      assignedByUserId: userId, // self-assigned via message activity
    });
    console.log(`[WhatsApp] Auto-assigned conversation for contact #${contactId} to user #${userId}`);
  } catch (err) {
    console.error("[WhatsApp] Auto-assign failed:", err);
  }
}

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

      // Fallback: if contact has no phone, check lead_assignments by email
      let phoneToUse = contact.phone;
      if (!phoneToUse && contact.email) {
        try {
          const db2 = await getDb();
          if (db2) {
            const [lead] = await db2.select({ phone: leadAssignments.phone }).from(leadAssignments).where(eq(leadAssignments.email, contact.email!)).limit(1);
            if (lead?.phone) phoneToUse = lead.phone;
          }
        } catch (_e) { /* ignore */ }
      }
      if (!phoneToUse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact does not have a phone number",
        });
      }

      // Normalise the phone number to E.164 (UK-focused)
      const normalisedPhone = normalisePhone(phoneToUse);
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
          // Auto-assign conversation to the sending agent
          await autoAssignConversation(contactId, ctx.user.id);
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
  // Returns conversations grouped by NORMALIZED PHONE NUMBER with latest message,
  // unread count, assignment info, and status.
  // This ensures the same customer with multiple contact records (e.g. "+447881850622"
  // and "7881850622") appears as ONE conversation.
  // Managers (no team) see ALL conversations.
  // Agents (with team) see conversations assigned to them or unassigned.
  // Supports tab filtering: "all" | "unassigned" | "mine"
  conversations: protectedProcedure
    .input(
      z.object({
        tab: z.enum(["unassigned", "mine", "all"]).default("all"),
        includeResolved: z.boolean().default(false),
        contactIds: z.array(z.number()).optional(),
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

      // ─── Step 1: Fetch all messages and group by NORMALIZED customer phone ───
      const allMessages = await db
        .select({
          id: whatsappMessages.id,
          contactId: whatsappMessages.contactId,
          fromNumber: whatsappMessages.fromNumber,
          toNumber: whatsappMessages.toNumber,
          direction: whatsappMessages.direction,
          createdAt: whatsappMessages.createdAt,
        })
        .from(whatsappMessages);

      // For each message, derive the customer's phone and normalize it
      // inbound → customer is fromNumber; outbound → customer is toNumber
      type PhoneGroup = {
        normalizedPhone: string;
        contactIds: Set<number>;
        latestContactId: number | null;
        latestMessageTime: Date;
      };
      const phoneGroupMap = new Map<string, PhoneGroup>();

      for (const m of allMessages) {
        const customerPhone = m.direction === "inbound" ? m.fromNumber : m.toNumber;
        const normalized = normalisePhone(customerPhone) ?? customerPhone;
        if (!normalized) continue;

        let group = phoneGroupMap.get(normalized);
        if (!group) {
          group = {
            normalizedPhone: normalized,
            contactIds: new Set<number>(),
            latestContactId: null,
            latestMessageTime: m.createdAt,
          };
          phoneGroupMap.set(normalized, group);
        }

        // Track all contactIds associated with this phone
        if (m.contactId !== null) {
          group.contactIds.add(m.contactId);
        }

        // Track the most recent contactId (by message time)
        if (m.createdAt >= group.latestMessageTime) {
          group.latestMessageTime = m.createdAt;
          if (m.contactId !== null) {
            group.latestContactId = m.contactId;
          }
        }
      }

      if (phoneGroupMap.size === 0) {
        return [];
      }

      // For each group, pick the primary contactId: prefer the most recent one
      // (fall back to any contactId in the group)
      type ConvEntry = {
        normalizedPhone: string;
        primaryContactId: number | null;
        allContactIds: number[];
      };
      const allConvEntries: ConvEntry[] = [];
      const phoneGroups = Array.from(phoneGroupMap.values());
      for (const group of phoneGroups) {
        const allCids: number[] = Array.from(group.contactIds);
        const primaryContactId = group.latestContactId ?? (allCids.length > 0 ? allCids[0] : null);
        allConvEntries.push({
          normalizedPhone: group.normalizedPhone,
          primaryContactId,
          allContactIds: allCids,
        });
      }

      // ─── Step 2: Load assignments, statuses, user names ─────────────────────
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
      const assignmentMap = new Map<number, number>();
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

      // ─── Step 3: Determine assignment for each conversation ─────────────────
      // A conversation's assignment = assignment of its primaryContactId,
      // OR any of its allContactIds (check all, pick first found)
      function getConvAssignment(entry: ConvEntry): number | undefined {
        if (entry.primaryContactId !== null && assignmentMap.has(entry.primaryContactId)) {
          return assignmentMap.get(entry.primaryContactId);
        }
        for (const cid of entry.allContactIds) {
          if (assignmentMap.has(cid)) return assignmentMap.get(cid);
        }
        return undefined;
      }

      function getConvStatus(entry: ConvEntry): typeof conversationStatuses[0] | undefined {
        if (entry.primaryContactId !== null && statusMap.has(entry.primaryContactId)) {
          return statusMap.get(entry.primaryContactId);
        }
        for (const cid of entry.allContactIds) {
          if (statusMap.has(cid)) return statusMap.get(cid);
        }
        return undefined;
      }

      // ─── Step 4: Filter conversations by tab and role ───────────────────────
      let filteredEntries: ConvEntry[] = allConvEntries;

      if (seesAll) {
        switch (tab) {
          case "unassigned":
            filteredEntries = allConvEntries.filter((e) => !getConvAssignment(e));
            break;
          case "mine":
            filteredEntries = allConvEntries.filter((e) => getConvAssignment(e) === userId);
            break;
          case "all":
          default:
            filteredEntries = allConvEntries;
            break;
        }
      } else {
        switch (tab) {
          case "unassigned":
            filteredEntries = allConvEntries.filter((e) => !getConvAssignment(e));
            break;
          case "mine":
            filteredEntries = allConvEntries.filter((e) => getConvAssignment(e) === userId);
            break;
          case "all":
          default:
            // Agents see only their own assigned conversations
            filteredEntries = allConvEntries.filter((e) => getConvAssignment(e) === userId);
            break;
        }
      }

      if (filteredEntries.length === 0) {
        return [];
      }

      // Filter by conversation status (exclude resolved unless requested)
      if (!includeResolved) {
        filteredEntries = filteredEntries.filter((e) => {
          const status = getConvStatus(e);
          if (!status) return true;
          return status.status !== "resolved";
        });
      }

      // Filter by specific contactIds (used by Retention Workspace to show only agent's contacts)
      // Match if ANY of the conversation's contactIds overlaps with the filter set,
      // OR if the conversation's normalized phone matches any of the filtered contacts' phones
      const contactIdsFilter = input?.contactIds;
      if (contactIdsFilter && contactIdsFilter.length > 0) {
        // Build a set of normalized phones for the filter contacts
        const filterContactRecords = await db
          .select({ id: contacts.id, phone: contacts.phone })
          .from(contacts)
          .where(inArray(contacts.id, contactIdsFilter));
        const filterNormalizedPhones = new Set<string>();
        for (const c of filterContactRecords) {
          if (c.phone) {
            const np = normalisePhone(c.phone);
            if (np) filterNormalizedPhones.add(np);
          }
        }

        filteredEntries = filteredEntries.filter((e) => {
          // Match by normalized phone
          if (filterNormalizedPhones.has(e.normalizedPhone)) return true;
          // Also match if any contactId in the conversation is in the filter
          const contactIdSet = new Set(contactIdsFilter);
          for (const cid of e.allContactIds) {
            if (contactIdSet.has(cid)) return true;
          }
          return false;
        });
      }

      if (filteredEntries.length === 0) {
        return [];
      }

      // ─── Step 5: Build conversation list with message data ──────────────────
      const conversations = [];

      for (const entry of filteredEntries) {
        const { normalizedPhone, primaryContactId } = entry;

        // Fetch messages by matching normalized phone against fromNumber/toNumber
        // This captures ALL messages regardless of contactId
        const phoneMatchClause = sql`(
          ${whatsappMessages.fromNumber} = ${normalizedPhone} OR ${whatsappMessages.toNumber} = ${normalizedPhone}
          OR ${whatsappMessages.fromNumber} = ${normalizedPhone.startsWith("+") ? normalizedPhone.slice(1) : "+" + normalizedPhone}
          OR ${whatsappMessages.toNumber} = ${normalizedPhone.startsWith("+") ? normalizedPhone.slice(1) : "+" + normalizedPhone}
        )`;

        // Also include messages matched by any of the contactIds in this group
        let whereClause;
        if (entry.allContactIds.length > 0) {
          whereClause = sql`(${phoneMatchClause} OR ${whatsappMessages.contactId} IN (${sql.raw(entry.allContactIds.join(","))}))`;
        } else {
          whereClause = phoneMatchClause;
        }

        const [latestMessage] = await db
          .select()
          .from(whatsappMessages)
          .where(whereClause)
          .orderBy(desc(whatsappMessages.createdAt))
          .limit(1);

        if (!latestMessage) continue;

        // Count unread inbound messages
        const [unreadResult] = await db
          .select({ count: count() })
          .from(whatsappMessages)
          .where(and(
            whereClause,
            eq(whatsappMessages.direction, "inbound"),
            eq(whatsappMessages.isRead, false)
          ));
        const unreadCount = unreadResult?.count ?? 0;

        // Check if customer has ever replied (any inbound message exists)
        const [inboundResult] = await db
          .select({ count: count() })
          .from(whatsappMessages)
          .where(and(
            whereClause,
            eq(whatsappMessages.direction, "inbound")
          ));
        const hasCustomerReplied = (inboundResult?.count ?? 0) > 0;

        // Get contact info from the primary contactId
        let contactInfo = null;
        if (primaryContactId !== null) {
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
            .where(eq(contacts.id, primaryContactId))
            .limit(1);
          contactInfo = contact || null;
        }

        // Get assignment info
        const assignedUserId = getConvAssignment(entry);
        const assignedTo = assignedUserId
          ? { userId: assignedUserId, userName: userNameMap.get(assignedUserId) ?? "Unknown" }
          : null;

        // Get conversation status
        const convStatus = getConvStatus(entry);
        const conversationStatus = convStatus?.status ?? "open";
        const snoozedUntil = convStatus?.snoozedUntil ?? null;

        conversations.push({
          contactId: primaryContactId,
          contact: contactInfo,
          lastMessage: {
            id: latestMessage.id,
            direction: latestMessage.direction,
            body: latestMessage.body,
            status: latestMessage.status,
            createdAt: latestMessage.createdAt,
            channel: latestMessage.channel,
          },
          unreadCount,
          fromNumber: normalizedPhone,
          assignedTo,
          conversationStatus,
          snoozedUntil,
          hasCustomerReplied,
        });
      }

      // Sort by most recent activity (last message date, regardless of direction)
      conversations.sort((a, b) => {
        const dateA = new Date(a.lastMessage.createdAt).getTime();
        const dateB = new Date(b.lastMessage.createdAt).getTime();
        return dateB - dateA;
      });

      return conversations;
    }),

    // ─── Messages: get all messages for a conversation by normalized phone ────────────
  // Fetches ALL messages where the customer phone (normalized) matches,
  // regardless of which contactId they're stored under.
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

      // Determine the normalized phone to query by
      let normalizedPhone: string | undefined;

      if (phoneNumber) {
        normalizedPhone = normalisePhone(phoneNumber) ?? phoneNumber;
      } else if (contactId !== null) {
        // Look up the contact's phone and normalize it
        const [contactRecord] = await db
          .select({ phone: contacts.phone })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        if (contactRecord?.phone) {
          normalizedPhone = normalisePhone(contactRecord.phone);
        }
      }

      let whereClause;
      if (normalizedPhone) {
        // Match messages where the customer phone (fromNumber for inbound, toNumber for outbound)
        // matches the normalized phone — also check the variant with/without + prefix
        const altPhone = normalizedPhone.startsWith("+") ? normalizedPhone.slice(1) : "+" + normalizedPhone;
        whereClause = sql`(
          ${whatsappMessages.fromNumber} = ${normalizedPhone}
          OR ${whatsappMessages.toNumber} = ${normalizedPhone}
          OR ${whatsappMessages.fromNumber} = ${altPhone}
          OR ${whatsappMessages.toNumber} = ${altPhone}
        )`;
      } else if (contactId !== null) {
        // Fallback: if we couldn't resolve a phone, use contactId directly
        whereClause = eq(whatsappMessages.contactId, contactId);
      } else {
        // No phone and no contactId — return nothing meaningful
        whereClause = sql`${whatsappMessages.contactId} IS NULL`;
      }

      const messages = await db
        .select()
        .from(whatsappMessages)
        .where(whereClause)
        .orderBy(whatsappMessages.createdAt);
      return messages;
    }),

  // ─── Mark as Read: mark all inbound messages for a conversation (by normalized phone) as read ─
  // Uses the same phone-based logic as messages endpoint to mark ALL messages
  // for the same customer as read, regardless of contactId.
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

      // Determine the normalized phone to query by
      let normalizedPhone: string | undefined;

      if (phoneNumber) {
        normalizedPhone = normalisePhone(phoneNumber) ?? phoneNumber;
      } else if (contactId !== null) {
        const [contactRecord] = await db
          .select({ phone: contacts.phone })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        if (contactRecord?.phone) {
          normalizedPhone = normalisePhone(contactRecord.phone);
        }
      }

      let whereClause;
      if (normalizedPhone) {
        const altPhone = normalizedPhone.startsWith("+") ? normalizedPhone.slice(1) : "+" + normalizedPhone;
        whereClause = and(
          sql`(
            ${whatsappMessages.fromNumber} = ${normalizedPhone}
            OR ${whatsappMessages.toNumber} = ${normalizedPhone}
            OR ${whatsappMessages.fromNumber} = ${altPhone}
            OR ${whatsappMessages.toNumber} = ${altPhone}
          )`,
          eq(whatsappMessages.direction, "inbound"),
          eq(whatsappMessages.isRead, false)
        );
      } else if (contactId !== null) {
        // Fallback: use contactId directly
        whereClause = and(
          eq(whatsappMessages.contactId, contactId),
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

      // Fallback: if contact has no phone, check lead_assignments by email
      let phoneToUse = contact.phone;
      if (!phoneToUse && contact.email) {
        try {
          const db2 = await getDb();
          if (db2) {
            const [lead] = await db2.select({ phone: leadAssignments.phone }).from(leadAssignments).where(eq(leadAssignments.email, contact.email!)).limit(1);
            if (lead?.phone) phoneToUse = lead.phone;
          }
        } catch (_e) { /* ignore */ }
      }
      if (!phoneToUse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact does not have a phone number",
        });
      }

      // Normalise the phone number to E.164
      const normalisedPhone = normalisePhone(phoneToUse);
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
          // Auto-assign conversation to the sending agent
          await autoAssignConversation(contactId, ctx.user.id);
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
        // Fallback: if contact has no phone, check lead_assignments
        let phoneToUse = contact.phone;
        if (!phoneToUse) {
          try {
            const db2 = await getDb();
            if (db2) {
              const [lead] = await db2.select({ phone: leadAssignments.phone }).from(leadAssignments).where(eq(leadAssignments.email, contact.email!)).limit(1);
              if (lead?.phone) phoneToUse = lead.phone;
            }
          } catch (_e) { /* ignore */ }
        }
        if (!phoneToUse) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
        }
        const normalisedPhone = normalisePhone(phoneToUse);
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
          // Auto-assign conversation to the sending agent
          await autoAssignConversation(resolvedContactId, ctx.user.id);
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
            // Auto-assign conversation to the sending agent
            await autoAssignConversation(resolvedContactId, ctx.user.id);
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
            // Fallback: if contact has no phone, check lead_assignments
      let phoneToUse = contact.phone;
      if (!phoneToUse) {
        try {
          const db2 = await getDb();
          if (db2) {
            const [lead] = await db2.select({ phone: leadAssignments.phone }).from(leadAssignments).where(eq(leadAssignments.email, contact.email!)).limit(1);
            if (lead?.phone) phoneToUse = lead.phone;
          }
        } catch (_e) { /* ignore */ }
      }
      if (!phoneToUse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
      }
      // Normalise to E.164
      const normalisedPhone = normalisePhone(phoneToUse);
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
        // Auto-assign conversation to the sending agent
        await autoAssignConversation(contactId, ctx.user.id);
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
      // Fallback: if contact has no phone, check lead_assignments
      let phoneToUse = contact.phone;
      if (!phoneToUse) {
        try {
          const db2 = await getDb();
          if (db2) {
            const [lead] = await db2.select({ phone: leadAssignments.phone }).from(leadAssignments).where(eq(leadAssignments.email, contact.email!)).limit(1);
            if (lead?.phone) phoneToUse = lead.phone;
          }
        } catch (_e) { /* ignore */ }
      }
      if (!phoneToUse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact does not have a phone number" });
      }
      // Normalise to E.164
      const normalisedPhone = normalisePhone(phoneToUse);
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

      // Fetch template body first to check if it has variables ({{1}}, {{2}})
      // Only send ContentVariables if the template actually uses them
      let templateBody = "";
      try {
        templateBody = await fetchTemplateBody(contentSid);
      } catch (_) { /* ignore */ }
      const hasVariables = /\{\{\d+\}\}/.test(templateBody);
      const contentVariables = hasVariables ? { "1": customerFirstName, "2": agentFirstName } : undefined;
      if (contentVariables) {
        params.append("ContentVariables", JSON.stringify(contentVariables));
      }

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
          const resolvedBody = contentVariables
            ? await fetchTemplateBody(contentSid, contentVariables)
            : (templateBody || await fetchTemplateBody(contentSid));
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
        // Auto-assign conversation to the sending agent
        await autoAssignConversation(contactId, ctx.user.id);
      }

      return { success: true, messageSid: data.sid as string, status: data.status as string };
    }),

  // ─── Delete Message: remove a single message from the database ─────────────────────
  deleteMessage: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ input, ctx }) => {

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const { messageId } = input;

      // Verify the message exists
      const [message] = await db
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.id, messageId))
        .limit(1);

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found",
        });
      }

      // Delete the message
      await db.delete(whatsappMessages).where(eq(whatsappMessages.id, messageId));

      console.log(`[WhatsApp] Message #${messageId} deleted by ${ctx.user.name ?? ctx.user.email}`);
      return { success: true };
    }),

  // ─── Delete Conversation: remove all messages for a contact + clear assignments ───────
  deleteConversation: protectedProcedure
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

      if (contactId !== null) {
        // Delete all messages for this contact
        await db.delete(whatsappMessages).where(eq(whatsappMessages.contactId, contactId));

        // Delete all assignments for this contact
        await db.delete(whatsappConversationAssignments).where(eq(whatsappConversationAssignments.contactId, contactId));

        // Delete conversation status record
        await db.delete(whatsappConversations).where(eq(whatsappConversations.contactId, contactId));

        console.log(`[WhatsApp] Conversation for contact #${contactId} deleted by ${ctx.user.name ?? ctx.user.email}`);
      } else if (phoneNumber) {
        // Delete all messages for this phone number (unmatched conversation)
        await db.delete(whatsappMessages).where(
          and(
            sql`${whatsappMessages.contactId} IS NULL`,
            sql`(${whatsappMessages.fromNumber} = ${phoneNumber} OR ${whatsappMessages.toNumber} = ${phoneNumber})`
          )
        );

        console.log(`[WhatsApp] Conversation for phone ${phoneNumber} deleted by ${ctx.user.name ?? ctx.user.email}`);
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either contactId or phoneNumber must be provided",
        });
      }

      return { success: true };
    }),

  // ─── Poll for new inbound messages (for toast notifications) ─────────────
  // Returns inbound messages received after the given timestamp for the current user's assigned contacts
  pollNewMessages: protectedProcedure
    .input(z.object({ since: z.number() })) // unix timestamp in ms
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { messages: [] };

      const userId = ctx.user.id;
      const sinceDate = new Date(input.since);

      // Get contacts assigned to this user (via conversation assignments or contact.assignedUserId)
      const assignedContacts = await db
        .select({ contactId: whatsappConversationAssignments.contactId })
        .from(whatsappConversationAssignments)
        .where(eq(whatsappConversationAssignments.assignedUserId, userId));

      const contactsFromTable = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.assignedUserId, userId));

      const assignedContactIds = new Set([
        ...assignedContacts.map((r) => r.contactId),
        ...contactsFromTable.map((r) => r.id),
      ]);

      if (assignedContactIds.size === 0) return { messages: [] };

      // Get inbound messages since timestamp for these contacts
      const contactIdArray = Array.from(assignedContactIds);
      const newMessages = await db
        .select({
          id: whatsappMessages.id,
          contactId: whatsappMessages.contactId,
          body: whatsappMessages.body,
          channel: whatsappMessages.channel,
          fromNumber: whatsappMessages.fromNumber,
          createdAt: whatsappMessages.createdAt,
        })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.direction, "inbound"),
            sql`${whatsappMessages.createdAt} > ${sinceDate}`,
            sql`${whatsappMessages.contactId} IN (${sql.join(contactIdArray.map(id => sql`${id}`), sql`, `)})`
          )
        )
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(10);

      // Get contact names for the messages
      const contactIds = [...new Set(newMessages.map(m => m.contactId).filter(Boolean))];
      let contactNames: Record<number, string> = {};
      if (contactIds.length > 0) {
        const nameRows = await db
          .select({ id: contacts.id, name: contacts.name })
          .from(contacts)
          .where(sql`${contacts.id} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
        for (const row of nameRows) {
          contactNames[row.id] = row.name;
        }
      }

      return {
        messages: newMessages.map((m) => ({
          id: m.id,
          contactId: m.contactId,
          contactName: m.contactId ? contactNames[m.contactId] || "Unknown" : "Unknown",
          body: m.body ? m.body.substring(0, 80) : "",
          channel: m.channel,
          fromNumber: m.fromNumber,
          createdAt: m.createdAt.getTime(),
        })),
      };
    }),
});
