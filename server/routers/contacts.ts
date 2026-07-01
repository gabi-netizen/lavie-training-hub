import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import Stripe from "stripe";

// Stripe restricted key — read from Railway environment variable
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(STRIPE_SECRET_KEY);
import {
  listContacts,
  getContact,
  getContactByPhone,
  updateContact,
  addCallNote,
  importContacts,
  deleteContact,
  bulkDeleteContacts,
  bulkAssignContacts,
  bulkReturnToSystem,
  bulkUpdateStatus,
  normalisePhone,
  getCallbacksDue,
  getAllCallbacks,
  countContacts,
  getDistinctSources,
  LEAD_TYPES,
  CONTACT_STATUSES,
  type CsvContactRow,
} from "../contacts";
import {
  sendCallbackReminder,
  sendStatusChangeNotification,
  sendImportSummary,
  sendAdminAlert,
  sendEmailToContact,
} from "../email";
import { sendViaGmail } from "../gmailTransport";
import {
  syncContactToAC,
  updateContactStatus as updateACStatus,
  getContactByEmail,
  getLists,
  getAutomations,
} from "../activecampaign";
import { clickToCall, getCloudTalkAgents, getCallHistory, fetchRecording, syncContactToCloudTalk } from "../cloudtalk";
import { sendWhatsAppMessage, fetchTemplateBody } from "../twilio";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users, leadAssignments, whatsappMessages, contacts as contactsSchema, stripeAuditLog, stripeCustomers, contactCallNotes, callAnalyses, clientSubscriptions, billingPlans, openingTrials } from "../../drizzle/schema";
import {
  createSubscriptionSchedule,
  getCustomerPaymentMethods,
  getStripeClient as getBillingStripeClient,
} from "../stripe/index";
import { eq, or, and, sql, ne, isNull, isNotNull, inArray, notInArray, count as drizzleCount, gte, lte, desc } from "drizzle-orm";
import { notifyNewContact } from "../n8n";
import { getZohoBillingDataByEmail } from "../zohoBilling";
import { createMintsoftOrder } from "../mintsoft";

// Admin email for notifications
const ADMIN_EMAIL = "gabriel@lavielabs.com";

export const contactsRouter = router({
  // ─── Create a single contact ──────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        phone: z.string().max(32).optional(),
        email: z.string().max(320).optional(),
        leadType: z.string().max(64).optional(),
        status: z.enum(CONTACT_STATUSES).default("new"),
        agentName: z.string().max(256).optional(),
        agentEmail: z.string().max(320).optional(),
        source: z.string().max(128).optional(),
        leadDate: z.string().optional(),
        notes: z.string().max(2000).optional(),
        address: z.string().optional(),
        department: z.enum(["opening", "retention"]).default("opening"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // ── Duplicate prevention ─────────────────────────────────────────────
      const { contacts: contactsTable } = await import("../../drizzle/schema");
      const normalisedPhone = normalisePhone(input.phone) || undefined;

      if (input.email?.trim()) {
        const [existingByEmail] = await db
          .select({ id: contactsTable.id })
          .from(contactsTable)
          .where(eq(contactsTable.email, input.email.trim()))
          .limit(1);
        if (existingByEmail) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A contact with this email already exists",
          });
        }
      }

      if (normalisedPhone) {
        const [existingByPhone] = await db
          .select({ id: contactsTable.id })
          .from(contactsTable)
          .where(eq(contactsTable.phone, normalisedPhone))
          .limit(1);
        if (existingByPhone) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A contact with this phone number already exists",
          });
        }
      }
      // ────────────────────────────────────────────────────────────────────

      const leadDate = input.leadDate ? new Date(input.leadDate) : undefined;
      const [result] = await db.insert(contactsTable).values({
        name: input.name.trim(),
        phone: normalisedPhone,
        email: input.email?.trim() || undefined,
        leadType: input.leadType?.trim() || undefined,
        status: input.status,
        agentName: input.agentName?.trim() || undefined,
        agentEmail: input.agentEmail?.trim() || "trial@lavielabs.com",
        source: input.source?.trim() || undefined,
        leadDate,
        importedNotes: input.notes?.trim() || undefined,
        address: input.address?.trim() || undefined,
        department: input.department,
      });
      const newId = (result as any).insertId as number;

      // ── n8n: notify new contact created (fire-and-forget) ───────────────
      notifyNewContact({
        id: newId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        leadType: input.leadType?.trim() || null,
        status: input.status,
        agentName: input.agentName?.trim() || null,
        agentEmail: input.agentEmail?.trim() || null,
        source: input.source?.trim() || null,
        createdAt: new Date().toISOString(),
      });

      // ── CloudTalk: sync contact so dialer shows name/email/phone ────────
      syncContactToCloudTalk({
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
      }).then(async (cloudtalkId) => {
        if (cloudtalkId) {
          const db2 = await getDb();
          const { contacts: ct } = await import("../../drizzle/schema");
          if (db2) await db2.update(ct).set({ cloudtalkId }).where(eq(ct.id, newId));
        }
      }).catch(() => {});
      return { id: newId };
    }),
  // ─── Count contacts matching filters (for pagination) ─────────────────────────────────────────────────
  count: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        leadType: z.string().optional(),
        status: z.string().optional(),
        agentName: z.string().optional(),
        agentEmail: z.string().optional(),
        department: z.enum(["opening", "retention"]).optional(),
        source: z.string().optional(),
        leadDateFrom: z.string().optional(),
        leadDateTo: z.string().optional(),
        statusDateFrom: z.string().optional(),
        statusDateTo: z.string().optional(),
        naCountFilter: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Non-admin agents only count their own assigned contacts
      // Admin can optionally filter by agentEmail (e.g. Agent filter on Contacts page)
      const agentEmail = ctx.user.role !== 'admin'
        ? (ctx.user.email ?? undefined)
        : input.agentEmail ?? undefined;
      return countContacts({
        ...input,
        agentEmail,
      });
    }),
  // ─── List contacts with search/filter ─────────────────────────────────────────────────
  list: protectedProcedure  .input(z.object({
        search: z.string().optional(),
        leadType: z.string().optional(),
        status: z.string().optional(),
        agentName: z.string().optional(),
        agentEmail: z.string().optional(),
        department: z.enum(["opening", "retention"]).optional(),
        source: z.string().optional(),
        leadDateFrom: z.string().optional(),
        leadDateTo: z.string().optional(),
        statusDateFrom: z.string().optional(),
        statusDateTo: z.string().optional(),
        naCountFilter: z.string().optional(),
        sortBy: z.string().optional(),
        limit: z.number().min(1).max(5000).default(5000),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Non-admin agents only see contacts assigned to them
      // Admin can optionally filter by agentEmail (e.g. Manager View)
      const agentEmail = ctx.user.role !== 'admin'
        ? (ctx.user.email ?? undefined)
        : input.agentEmail ?? undefined;
      return listContacts({
        ...input,
        agentEmail,
      });
    }),
  // ─── Get single contact with call notes ──────────────────────────────────────
  get: protectedProcedure   .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getContact(input.id);
    }),

  // ─── Update contact status / agent / lead type / callback ─────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        status: z.enum(CONTACT_STATUSES).optional(),
        agentName: z.string().optional(),
        leadType: z.string().optional(),
        agentEmail: z.string().optional(),
        callbackAt: z.date().nullable().optional(),
        importedNotes: z.string().optional(),
        skinType: z.string().optional(),
        concern: z.string().optional(),
        routine: z.string().optional(),
        trialKit: z.string().optional(),
        callNotes: z.string().optional(),
        address: z.string().optional(),
        brands: z.string().optional(),
        // For email notifications
        notifyEmail: z.string().optional(),
        previousStatus: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, notifyEmail, previousStatus, ...updates } = input;

      // If agentName is being changed, capture the old value for the timeline note
      let oldAgentName: string | null = null;
      if (updates.agentName !== undefined) {
        const [currentContact] = await db.select({ agentName: contactsSchema.agentName }).from(contactsSchema).where(eq(contactsSchema.id, id)).limit(1);
        oldAgentName = currentContact?.agentName ?? null;
      }

      const result = await updateContact(id, updates);

      // Get contact for downstream operations
      const contact = await getContact(id);

      // ── Timeline note: log agent reassignment ─────────────────────────────────────────────────────────────────────────────────
      if (updates.agentName !== undefined && oldAgentName !== updates.agentName) {
        try {
          await addCallNote({
            contactId: id,
            agentName: ctx.user.name ?? "Manager",
            note: `Reassigned from ${oldAgentName || "(unassigned)"} to ${updates.agentName || "(unassigned)"} by ${ctx.user.name ?? "Manager"}`,
          });
        } catch (_e) { /* non-fatal */ }
      }

      // ── ActiveCampaign: update status tags ──────────────────────────────
      if (contact && updates.status && previousStatus && updates.status !== previousStatus) {
        if (contact.email) {
          const acContact = await getContactByEmail(contact.email).catch(() => null);
          if (acContact) {
            await updateACStatus(acContact.id, previousStatus, updates.status).catch(() => {});
          }
        }
      }

      // ── Postmark: status change notification ────────────────────────────
      if (
        updates.status &&
        previousStatus &&
        updates.status !== previousStatus &&
        notifyEmail &&
        contact
      ) {
        await sendStatusChangeNotification({
          agentEmail: notifyEmail,
          agentName: ctx.user.name ?? "Agent",
          customerName: contact.name,
          customerPhone: contact.phone ?? "N/A",
          oldStatus: previousStatus,
          newStatus: updates.status,
          changedBy: ctx.user.name ?? "Admin",
        }).catch(() => {});
      }

      // ── WhatsApp: auto-send N/A template (Opening team) ── DISABLED ──────
      // Disabled on 2026-06-08: automatic sending of op_no_answer_cold_data stopped per Gabriel's request.
      // if (
      //   updates.status === "no_answer" &&
      //   previousStatus &&
      //   previousStatus !== "no_answer" &&
      //   contact &&
      //   contact.phone
      // ) {
      //   ... auto WhatsApp template removed ...
      // }

      // ── New Sale email notification to support@lavielabs.com ─────────────
      if (
        updates.status === "done_deal" &&
        previousStatus &&
        previousStatus !== "done_deal" &&
        contact
      ) {
        const agentName = ctx.user.name ?? contact.agentName ?? "Unknown Agent";
        const customerName = contact.name ?? "Unknown";
        const phone = contact.phone ?? "N/A";
        const email = contact.email ?? "N/A";
        const address = contact.address ?? "N/A";
        const starterKit = contact.trialKit ?? "N/A";

        const htmlBody = `
          <h2>🎉 New Sale!!!!</h2>
          <table style="border-collapse:collapse; font-size:15px;">
            <tr><td style="padding:6px 12px; font-weight:bold;">Agent Name:</td><td style="padding:6px 12px;">${agentName}</td></tr>
            <tr><td style="padding:6px 12px; font-weight:bold;">Customer Name:</td><td style="padding:6px 12px;">${customerName}</td></tr>
            <tr><td style="padding:6px 12px; font-weight:bold;">Phone Number:</td><td style="padding:6px 12px;">${phone}</td></tr>
            <tr><td style="padding:6px 12px; font-weight:bold;">Email Address:</td><td style="padding:6px 12px;">${email}</td></tr>
            <tr><td style="padding:6px 12px; font-weight:bold;">Delivery Address:</td><td style="padding:6px 12px;">${address}</td></tr>
            <tr><td style="padding:6px 12px; font-weight:bold;">Starter Kit:</td><td style="padding:6px 12px;">${starterKit}</td></tr>
          </table>
        `;

        sendViaGmail({
          from: "Lavie Labs <trial@lavielabs.com>",
          to: "support@lavielabs.com",
          subject: "🎉 New Sale!!!!",
          htmlBody,
        }).catch((err) => console.error("[New Sale Email] Failed:", err));
      }

      // ── Auto-unassign: done & do_not_call leave the agent immediately ─────
      if (updates.status && (updates.status === "done" || updates.status === "do_not_call")) {
        await updateContact(id, { agentName: null as any, agentEmail: null as any });
        // Also clear assignedUserId
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.execute(sql`UPDATE contacts SET assignedUserId = NULL WHERE id = ${id}`);
        }
      }

      // ── Postmark: callback reminder ─────────────────────────────────────
      if (updates.callbackAt && notifyEmail && contact) {
        const callbackTime = new Date(updates.callbackAt).toLocaleString("en-GB", {
          dateStyle: "full",
          timeStyle: "short",
        });
        await sendCallbackReminder({
          agentEmail: notifyEmail,
          agentName: ctx.user.name ?? "Agent",
          customerName: contact.name,
          customerPhone: contact.phone ?? "N/A",
          callbackTime,
        }).catch(() => {});
      }

      return result;
    }),

  // ─── Add a call note ──────────────────────────────────────────────────────
  addNote: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        agentName: z.string().optional(),
        note: z.string().min(1),
        statusAtTime: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await addCallNote(input);
      return { success: true };
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
        note: z.string().min(1),
        statusAtTime: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { noteId, note, statusAtTime } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(contactCallNotes)
        .set({ note, ...(statusAtTime !== undefined ? { statusAtTime } : {}) })
        .where(eq(contactCallNotes.id, noteId));
      return { success: true };
    }),

  deleteNote: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .delete(contactCallNotes)
        .where(eq(contactCallNotes.id, input.noteId));
      return { success: true };
    }),

  // ─── Bulk CSV import ──────────────────────────────────────────────────────
  import: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            name: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            leadType: z.string().optional(),
            status: z.string().optional(),
            agentName: z.string().optional(),
            agentEmail: z.string().optional(),
            notes: z.string().optional(),
            source: z.string().optional(),
            leadDate: z.string().optional(),
            address: z.string().optional(),
          })
        ),
        department: z.enum(["opening", "retention"]).default("opening"),
        source: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // If a source was provided at import-level, override all row sources
      const rows = input.source
        ? input.rows.map(r => ({ ...r, source: input.source }))
        : input.rows;
      const result = await importContacts(rows as CsvContactRow[], input.department);

      // ── CloudTalk: sync all imported contacts so dialer shows name/email/phone ──
      Promise.all(
        rows.map((row) =>
          syncContactToCloudTalk({
            name: row.name,
            email: row.email || null,
            phone: row.phone || null,
          }).catch(() => {})
        )
      ).catch(() => {});

      // ── ActiveCampaign: sync all imported contacts (fire-and-forget) ────
      Promise.all(
        rows.map((row) =>
          syncContactToAC({
            name: row.name,
            email: row.email,
            phone: row.phone,
            leadType: row.leadType,
            status: row.status,
            agentName: row.agentName,
            source: row.source,
          }).catch(() => {})
        )
      ).catch(() => {});

      // ── Postmark: import summary to admin ───────────────────────────────
      await sendImportSummary({
        adminEmail: ADMIN_EMAIL,
        importedBy: ctx.user.name ?? "Admin",
        totalImported: result.imported,
        totalUpdated: 0,
        totalSkipped: result.skipped,
      }).catch(() => {});

      return result;
    }),

  // ─── Return metadata (lead types, statuses) ───────────────────────────────
  meta: protectedProcedure.query(async () => {
    const sources = await getDistinctSources();
    return {
      leadTypes: LEAD_TYPES,
      statuses: CONTACT_STATUSES,
      sources,
    };
  }),

  // ─── ActiveCampaign: get lists ────────────────────────────────────────────
  acLists: protectedProcedure.query(async () => {
    return getLists();
  }),

  // ─── ActiveCampaign: get automations ─────────────────────────────────────
  acAutomations: protectedProcedure.query(async () => {
    return getAutomations();
  }),

  // ─── Send test email (admin only) ─────────────────────────────────────────
  sendTestEmail: adminProcedure
    .input(z.object({ to: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const ok = await sendAdminAlert({
        adminEmail: input.to,
        subject: "✅ Lavie Labs CRM — Email Integration Working",
        message: `Hello! This is a test email from the Lavie Labs CRM system, sent by ${ctx.user.name ?? "Admin"}.`,
        details: {
          "Sent By": ctx.user.name ?? "Admin",
          "System": "Lavie Labs Training Hub",
          "Email Provider": "Postmark",
          "Status": "Connected ✅",
        },
      });
      return { success: ok };
    }),

  // ─── Send email from agent to contact ──────────────────────────────────────
  sendEmail: adminProcedure
    .input(
      z.object({
        contactId: z.number(),
        subject: z.string().min(1, "Subject is required"),
        body: z.string().min(1, "Message body is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const contact = await getContact(input.contactId);
      if (!contact) return { success: false, error: "Contact not found" };
      if (!contact.email) return { success: false, error: "Contact has no email address" };

      // Derive agent slug from name (lowercase, first name only)
      const agentName = ctx.user.name ?? "Lavie Labs";
      const agentSlug = agentName.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "");

      const ok = await sendEmailToContact({
        agentName,
        agentSlug,
        contactEmail: contact.email,
        contactName: contact.name,
        subject: input.subject,
        body: input.body,
      });

      if (ok) {
        // Log the email as a call note
        await addCallNote({
          contactId: input.contactId,
          userId: ctx.user.id,
          agentName,
          note: `📧 Email sent — Subject: "${input.subject}"`,
          statusAtTime: contact.status ?? undefined,
        });
      }

      return { success: ok };
    }),

    // ─── Sync a single contact to ActiveCampaign manually ────────────────────
  syncToAC: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const contact = await getContact(input.id);
      if (!contact) return { success: false, error: "Contact not found" };
      const result = await syncContactToAC({
        name: contact.name,
        email: contact.email ?? undefined,
        phone: contact.phone ?? undefined,
        leadType: contact.leadType ?? undefined,
        status: contact.status ?? undefined,
        agentName: contact.agentName ?? undefined,
        source: contact.source ?? undefined,
      });
      return { success: result.success, contactId: result.contactId };
    }),

  // ─── Click-to-Call via CloudTalk API ─────────────────────────────────────
  // Initiates an outbound call: CloudTalk calls the agent first, then the customer.
  clickToCall: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Always read fresh from DB to avoid stale session data
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [freshUser] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const agentId = freshUser?.cloudtalkAgentId;

      if (!agentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NO_CLOUDTALK_AGENT_ID",
        });
      }

      // Get the contact's phone number
      const contact = await getContact(input.contactId);
      if (!contact?.phone) {
        return { success: false, message: "Contact has no phone number" };
      }

      // Block calling a contact that was already marked N/A today (Opening only)
      // Retention agents can call multiple times per day
      const isRetentionAgent = freshUser?.team === "retention";
      if (!isRetentionAgent && contact.status === "no_answer" && contact.updatedAt) {
        const updatedDate = new Date(contact.updatedAt);
        const today = new Date();
        if (
          updatedDate.getFullYear() === today.getFullYear() &&
          updatedDate.getMonth() === today.getMonth() &&
          updatedDate.getDate() === today.getDate()
        ) {
          return { success: false, message: "This lead was already marked N/A today. You cannot call them again until tomorrow." };
        }
      }

      // Normalize phone: ensure it starts with + and contains only digits
      const rawPhone = contact.phone.replace(/[\s\-().]/g, "");
      const phone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

      return clickToCall(agentId, phone);
    }),

  // ─── Get CloudTalk agents list (for profile setup) ───────────────────────
  cloudtalkAgents: protectedProcedure.query(async () => {
    return getCloudTalkAgents();
  }),

  // ─── Update current user's CloudTalk Agent ID ─────────────────────────────
  setCloudtalkAgentId: protectedProcedure
    .input(z.object({ cloudtalkAgentId: z.string().max(32) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(users)
        .set({ cloudtalkAgentId: input.cloudtalkAgentId || null })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // ─── Get current user's profile (including cloudtalkAgentId) ─────────────
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return ctx.user;
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return user ?? ctx.user;
  }),

  // ─── CloudTalk: Get call history (optionally filtered by phone) ───────────
  callHistory: protectedProcedure
    .input(
      z.object({
        phone: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        page: z.number().min(1).default(1),
        status: z.enum(["answered", "missed"]).optional(),
      })
    )
    .query(async ({ input }) => {
      return getCallHistory({
        phone: input.phone,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
        page: input.page,
        status: input.status,
      });
    }),

  // ─── CloudTalk: Stream a call recording (proxied to avoid CORS) ──────────
  streamRecording: adminProcedure
    .input(z.object({ callId: z.number() }))
    .mutation(async ({ input }) => {
      const buffer = await fetchRecording(input.callId);
      if (!buffer) return { success: false, data: null, mimeType: null };
      return { success: true, data: buffer.toString("base64"), mimeType: "audio/wav" };
    }),

  // ─── CloudTalk: Global call log (all calls, not per contact) ─────────────
  callLog: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        page: z.number().min(1).default(1),
        status: z.enum(["answered", "missed"]).optional(),
        agentId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      // Fetch calls from CloudTalk
      const result = await getCallHistory({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
        page: input.page,
        status: input.status,
      });

      // Try to match phone numbers to existing contacts
      const db = await getDb();
      const { contacts } = await import("../../drizzle/schema");
      const allContacts = db
        ? await db.select({ id: contacts.id, phone: contacts.phone, name: contacts.name }).from(contacts)
        : [];
      const phoneMap = new Map(
        (allContacts as Array<{ id: number; phone: string | null; name: string }>)
          .map((c) => [c.phone?.replace(/\s/g, ""), { id: c.id, name: c.name }])
      );

      const enrichedCalls = result.calls.map((call) => {
        // Use the contact.number from CloudTalk to match
        const ctPhone = (call.contact?.number ?? "").replace(/\s/g, "");
        const internalPhone = (call.internal_number?.number ?? "").replace(/\s/g, "");
        const matched = phoneMap.get(ctPhone) ?? phoneMap.get(internalPhone) ?? null;
        return { ...call, matchedContact: matched };
      });

      return { ...result, calls: enrichedCalls };
    }),

  // ─── Lookup contact by phone number (for CloudTalk live call matching) ───────
  lookupByPhone: protectedProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      return getContactByPhone(input.phone);
    }),

  // ─── Delete a contact ─────────────────────────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteContact(input.id);
      return { success: true };
    }),
  // ─── Bulk delete contacts ─────────────────────────────────────────────────────────────────────────────────────
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      return bulkDeleteContacts(input.ids);
    }),

  // ─── Bulk assign contacts to an agent ──────────────────────────────────────────────
  bulkAssign: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
        agentName: z.string().min(1),
        agentEmail: z.string().email(),
        leadType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await bulkAssignContacts(input.ids, input.agentName, input.agentEmail);
      // If leadType provided, also create lead_assignments for retention workspace
      if (input.leadType) {
        const db = await getDb();
        if (db) {
          const assignedContacts = await db.select().from(contactsSchema).where(inArray(contactsSchema.id, input.ids));
          for (const c of assignedContacts) {
            const subscriptionId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.insert(leadAssignments).values({
              subscriptionId,
              customerName: c.name || "Unknown",
              email: c.email || null,
              phone: c.phone || null,
              leadType: input.leadType,
              leadCategory: "subscription",
              assignedAgent: input.agentName,
              assignedAt: Date.now(),
              workStatus: "new",
              eventDate: new Date().toISOString().split("T")[0],
              contactId: c.id,
            });
          }
        }
      }
      return result;
    }),

  // ─── Bulk Return to System (unassign + set status new) ──────────────────
  bulkReturnToSystem: adminProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
      })
    )
        .mutation(async ({ input }) => {
      return bulkReturnToSystem(input.ids);
    }),

  // ─── Bulk Change Status ────────────────────────────────────────────────────
  bulkUpdateStatus: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
        status: z.enum(CONTACT_STATUSES),
      })
    )
    .mutation(async ({ input }) => {
      return bulkUpdateStatus(input.ids, input.status);
    }),

  // ─── Get overdue callbacks (callbackAt <= now) ────────────────────────────
  callbacksDue: protectedProcedure.query(async ({ ctx }) => {
    // Everyone sees only their own overdue callbacks
    const agentEmail = ctx.user.email ?? undefined;
    return getCallbacksDue(agentEmail);
  }),

  // ─── Get ALL scheduled callbacks (future + overdue) for the current agent ──
  allCallbacks: protectedProcedure.query(async ({ ctx }) => {
    // Everyone sees only their own callbacks (by email)
    const agentEmail = ctx.user.email ?? undefined;
    return getAllCallbacks(agentEmail);
  }),

  // ─── Stripe: Create PaymentIntent for £4.95 ──────────────────────────────
  createPaymentIntent: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        name: z.string().min(1),
        email: z.string().email(),
        address: z.string().optional(),
      })
    )
        .mutation(async ({ input, ctx }) => {
      const { contactId, name, email, address } = input;
      const agentName = ctx.user.name ?? "Agent";
      // Parse address into Stripe format — handles both comma-separated and free text with UK postcode
      let stripeAddress: { line1?: string; city?: string; postal_code?: string; country?: string } | undefined;
      if (address) {
        const parts = address.split(",").map((p: string) => p.trim());
        if (parts.length >= 3) {
          // Comma-separated: "line1, city, postcode"
          stripeAddress = { line1: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], postal_code: parts[parts.length - 1], country: "GB" };
        } else if (parts.length === 2) {
          stripeAddress = { line1: parts[0], postal_code: parts[1], country: "GB" };
        } else {
          // No commas — try to extract UK postcode from the end (e.g. "40 Everready Creasent TF4 3GL" or "TF43GL")
          const ukPostcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i;
          const match = address.trim().match(ukPostcodeRegex);
          if (match) {
            const postcode = match[1].trim();
            const line1 = address.slice(0, address.length - match[0].length).trim();
            stripeAddress = { line1: line1 || address, postal_code: postcode, country: "GB" };
          } else {
            stripeAddress = { line1: address, country: "GB" };
          }
        }
      }

      // Auto-lookup postcode via Google Geocoding if missing
      if (stripeAddress && !stripeAddress.postal_code && address) {
        try {
          const geoKey = process.env.GOOGLE_GEOCODING_API_KEY;
          if (geoKey) {
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + " UK")}&key=${geoKey}`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json() as any;
            if (geoData.status === "OK" && geoData.results?.[0]) {
              const components = geoData.results[0].address_components || [];
              const postcodeComp = components.find((c: any) => c.types?.includes("postal_code"));
              if (postcodeComp) {
                stripeAddress.postal_code = postcodeComp.long_name;
                console.log(`[Geocoding] Found postcode ${postcodeComp.long_name} for address: ${address}`);
              }
            }
          }
        } catch (geoErr) {
          console.error("[Geocoding] Error looking up postcode:", geoErr);
        }
      }

            // Create a Stripe Customer with address (needed for Zoho Billing token)
      const customer = await stripe.customers.create({
        name,
        email,
        ...(stripeAddress ? { address: stripeAddress } : {}),
        metadata: { contactId: String(contactId), agentName },
      });
      // Create a PaymentIntent for £4.95 (495 pence) attached to the customer
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 495,
        currency: "gbp",
        customer: customer.id,
        metadata: { contactId: String(contactId), agentName },
        payment_method_types: ["card"],
      });

      return {
        clientSecret: paymentIntent.client_secret,
        customerId: customer.id,
      };
    }),

  // ─── Stripe: Confirm payment success — save customer ID & mark sold ───────
  confirmPayment: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        stripeCustomerId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, stripeCustomerId } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { contacts: contactsTable } = await import("../../drizzle/schema");

      // Save Stripe Customer ID (don't auto-mark as sold — agent does it manually)
      await db
        .update(contactsTable)
        .set({
          stripeCustomerId,
        })
        .where(eq(contactsTable.id, contactId));

      // ─── Auto-create Subscription Schedule after £4.95 trial payment ─────────
      try {
        const billingStripe = getBillingStripeClient();

        // Get customer's payment methods and set the first card as default
        const paymentMethods = await getCustomerPaymentMethods(stripeCustomerId, "card");
        let defaultPaymentMethodId: string | undefined;

        if (paymentMethods.length > 0) {
          defaultPaymentMethodId = paymentMethods[0].id;
          // Set as default payment method on the customer
          await billingStripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: defaultPaymentMethodId },
          });
        }

        // Agent attribution from ctx.user (the logged-in agent taking payment)
        const agentName = ctx.user?.name ?? "Unknown";
        const agentEmail = ctx.user?.email ?? "unknown@lavielabs.com";

        // Calculate start date: 21 days from now (unix timestamp)
        const startDate = Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60;

        // Create Subscription Schedule: £44.95 every 60 days, starting 21 days from now
        const schedule = await createSubscriptionSchedule(
          {
            customerId: stripeCustomerId,
            phases: [
              {
                amount: 4495,
                interval: "day",
                intervalCount: 60,
                iterations: undefined as unknown as number, // ongoing
              },
            ],
            startDate,
            defaultPaymentMethod: defaultPaymentMethodId,
            metadata: {
              contactId: String(contactId),
              createdBy: "confirmPayment",
              trialAmount: "495",
              agentName,
              agentEmail,
            },
          },
          `auto-sub-confirm-${contactId}-${Date.now()}`
        );

        // Upsert stripe_customers mapping with agent info
        const existingMapping = await db
          .select()
          .from(stripeCustomers)
          .where(eq(stripeCustomers.contactId, contactId))
          .limit(1);

        if (existingMapping.length > 0) {
          await db
            .update(stripeCustomers)
            .set({
              paymentMethodId: defaultPaymentMethodId ?? null,
              agentName,
              agentEmail,
            })
            .where(eq(stripeCustomers.contactId, contactId));
        } else {
          await db.insert(stripeCustomers).values({
            contactId,
            stripeCustomerId,
            paymentMethodId: defaultPaymentMethodId ?? null,
            agentName,
            agentEmail,
          });
        }

        // Audit log
        await db.insert(stripeAuditLog).values({
          eventId: `auto-sub-created-${contactId}-${Date.now()}`,
          eventType: "subscription_schedule.auto_created",
          customerId: stripeCustomerId,
          subscriptionId: schedule.id,
          amount: 4495,
          currency: "gbp",
          status: "processed",
          metadata: {
            source: "confirmPayment",
            trialAmount: 495,
            subscriptionAmount: 4495,
            intervalDays: 60,
            startDate,
            agentName,
            agentEmail,
            paymentMethodId: defaultPaymentMethodId,
          },
        });

        console.log(`[Stripe] Auto-created subscription schedule ${schedule.id} for contact ${contactId} (agent: ${agentName})`);
      } catch (err) {
        // Log the error but don't fail the payment confirmation
        console.error(`[Stripe] Failed to auto-create subscription for contact ${contactId}:`, err);
        try {
          await db.insert(stripeAuditLog).values({
            eventId: `auto-sub-failed-${contactId}-${Date.now()}`,
            eventType: "subscription_schedule.auto_create_failed",
            customerId: stripeCustomerId,
            status: "error",
            metadata: {
              source: "confirmPayment",
              error: err instanceof Error ? err.message : "Unknown error",
              contactId,
            },
          });
        } catch {
          // Swallow — best effort audit
        }
      }

      return { success: true };
    }),

  // ─── Send Payment Email via Gmail SMTP (replaced Postmark 2024-05) ─────────
  sendPaymentEmail: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        name: z.string().min(1),
        email: z.string().email(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, name, email, address } = input;
      const agentName = ctx.user.name ?? "Agent";

      // Parse address into Stripe format
      let stripeAddress: { line1?: string; city?: string; postal_code?: string; country?: string } | undefined;
      if (address) {
        const parts = address.split(",").map((p: string) => p.trim());
        if (parts.length >= 3) {
          stripeAddress = { line1: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], postal_code: parts[parts.length - 1], country: "GB" };
        } else if (parts.length === 2) {
          stripeAddress = { line1: parts[0], postal_code: parts[1], country: "GB" };
        } else {
          const ukPostcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i;
          const match = address.trim().match(ukPostcodeRegex);
          if (match) {
            const postcode = match[1].trim();
            const line1 = address.slice(0, address.length - match[0].length).trim();
            stripeAddress = { line1: line1 || address, postal_code: postcode, country: "GB" };
          } else {
            stripeAddress = { line1: address, country: "GB" };
          }
        }
      }

      // Auto-lookup postcode via Google Geocoding if missing
      if (stripeAddress && !stripeAddress.postal_code && address) {
        try {
          const geoKey = process.env.GOOGLE_GEOCODING_API_KEY;
          if (geoKey) {
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + " UK")}&key=${geoKey}`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json() as any;
            if (geoData.status === "OK" && geoData.results?.[0]) {
              const components = geoData.results[0].address_components || [];
              const postcodeComp = components.find((c: any) => c.types?.includes("postal_code"));
              if (postcodeComp) {
                stripeAddress.postal_code = postcodeComp.long_name;
                console.log(`[Geocoding] Found postcode ${postcodeComp.long_name} for address: ${address}`);
              }
            }
          }
        } catch (geoErr) {
          console.error("[Geocoding] Error looking up postcode:", geoErr);
        }
      }

      // Create a Stripe Customer with address so the payment method will include it
      const customer = await stripe.customers.create({
        name,
        email,
        ...(stripeAddress ? { address: stripeAddress } : {}),
        metadata: { contactId: String(contactId), agentName },
      });

      // Create a Checkout Session tied to this customer (£4.95)
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: { name: "Lavie Labs Starter Kit" },
              unit_amount: 495,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: { contactId: String(contactId), agentName },
          setup_future_usage: "off_session",
        },
        success_url: "https://training.lavielabs.com/payment-success",
        cancel_url: "https://training.lavielabs.com/payment-cancelled",
      });

      const PAYMENT_LINK = session.url!;

      // Build HTML email body
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
              <h2 style="margin:0 0 16px;color:#333;">Your Secure Payment Link</h2>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">Hi ${name},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333;">Please use the secure link below to complete your payment:</p>
              <p style="text-align:center;margin:0 0 24px;">
                <a href="${PAYMENT_LINK}" style="display:inline-block;padding:14px 32px;font-size:15px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;background-color:#0F1923;">Complete Payment</a>
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;">If you have any questions, please don't hesitate to reply to this email or contact us at <a href="mailto:support@lavielabs.com" style="color:#2b5cab;">support@lavielabs.com</a>.</p>
              <p style="margin:0;font-size:15px;color:#333;">Warm regards,<br/><strong>Lavie Labs</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        await sendViaGmail({
          from: "Lavie Labs <trial@lavielabs.com>",
          to: email,
          subject: "Your Secure Payment Link from Lavi\u00E9 Labs",
          htmlBody,
        });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send email: " + (err as Error).message });
      }

      return { success: true };
    }),

  // ─── Check Payment Status via Stripe (by contactId metadata first, then email fallback) ─────────────────────────
  checkPaymentStatus: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        contactId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const { email, contactId } = input;

      // 1. Search Checkout Sessions (check all recent ones for contactId match)
      const sessions = await stripe.checkout.sessions.list({
        limit: 50,
      });

      // First priority: match by contactId in metadata
      if (contactId) {
        const paidByContactId = sessions.data.find(
          (s) => s.payment_status === "paid" && s.metadata?.contactId === String(contactId)
        );
        if (paidByContactId) {
          return {
            paid: true,
            amount: paidByContactId.amount_total ? (paidByContactId.amount_total / 100).toFixed(2) : "4.95",
            currency: paidByContactId.currency || "gbp",
            paidAt: paidByContactId.created ? new Date(paidByContactId.created * 1000).toISOString() : null,
          };
        }
      }

      // 2. Fallback: match by email in checkout session
      const paidByEmail = sessions.data.find(
        (s) => s.payment_status === "paid" && s.customer_details?.email === email
      );
      if (paidByEmail) {
        return {
          paid: true,
          amount: paidByEmail.amount_total ? (paidByEmail.amount_total / 100).toFixed(2) : "4.95",
          currency: paidByEmail.currency || "gbp",
          paidAt: paidByEmail.created ? new Date(paidByEmail.created * 1000).toISOString() : null,
        };
      }

      // 3. Fallback: check PaymentIntents by contactId metadata
      const paymentIntents = await stripe.paymentIntents.list({
        limit: 30,
      });

      if (contactId) {
        const paidIntentById = paymentIntents.data.find(
          (pi) => pi.status === "succeeded" && pi.metadata?.contactId === String(contactId)
        );
        if (paidIntentById) {
          return {
            paid: true,
            amount: (paidIntentById.amount / 100).toFixed(2),
            currency: paidIntentById.currency || "gbp",
            paidAt: paidIntentById.created ? new Date(paidIntentById.created * 1000).toISOString() : null,
          };
        }
      }

      // 4. Final fallback: PaymentIntent by receipt_email
      const paidIntent = paymentIntents.data.find(
        (pi) => pi.status === "succeeded" && pi.receipt_email === email
      );
      if (paidIntent) {
        return {
          paid: true,
          amount: (paidIntent.amount / 100).toFixed(2),
          currency: paidIntent.currency || "gbp",
          paidAt: paidIntent.created ? new Date(paidIntent.created * 1000).toISOString() : null,
        };
      }

      return { paid: false, amount: null, currency: null, paidAt: null };
    }),

  // ─── Confirm Sold: verify Stripe payment + create Mintsoft order ────────────
  confirmSold: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        billingPlanId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { contactId, billingPlanId: inputBillingPlanId } = input;
      // Default to billing plan 1 (Trial Campaign) if not specified
      const billingPlanId = inputBillingPlanId ?? 1;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get contact details
      const [contact] = await db
        .select()
        .from(contactsSchema)
        .where(eq(contactsSchema.id, contactId))
        .limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      if (!contact.trialKit || !contact.address) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Missing trialKit or address" });
      }

      // ── Check Stripe for £4.95 payment ──
      let paymentFound = false;
      let paymentId: string | null = null;

      // Search by contactId in metadata first (most reliable)
      const paymentIntents = await stripe.paymentIntents.list({ limit: 50 });
      const piByContactId = paymentIntents.data.find(
        (pi) => pi.status === "succeeded" && pi.metadata?.contactId === String(contactId)
      );
      if (piByContactId) {
        paymentFound = true;
        paymentId = piByContactId.id;
      }

      // Fallback: search by email
      if (!paymentFound && contact.email) {
        const piByEmail = paymentIntents.data.find(
          (pi) => pi.status === "succeeded" && pi.receipt_email === contact.email
        );
        if (piByEmail) {
          paymentFound = true;
          paymentId = piByEmail.id;
        }
        // Also check checkout sessions
        if (!paymentFound) {
          const sessions = await stripe.checkout.sessions.list({ limit: 50 });
          const sessionByEmail = sessions.data.find(
            (s) => s.payment_status === "paid" && s.customer_details?.email === contact.email
          );
          if (sessionByEmail) {
            paymentFound = true;
            paymentId = sessionByEmail.payment_intent as string || sessionByEmail.id;
          }
        }
      }

      // Fallback: search by phone in customer metadata
      if (!paymentFound && contact.phone) {
        const normalizedPhone = contact.phone.replace(/[\s\-\+\(\)]/g, "");
        const piByPhone = paymentIntents.data.find(
          (pi) => pi.status === "succeeded" && pi.metadata?.phone?.replace(/[\s\-\+\(\)]/g, "")?.includes(normalizedPhone.slice(-10))
        );
        if (piByPhone) {
          paymentFound = true;
          paymentId = piByPhone.id;
        }
      }

      if (!paymentFound) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No payment of \u00a34.95 found for this customer. Please process payment first.",
        });
      }

      // ── Check for duplicate Mintsoft order ──
      const existingOrder = await db
        .select({ id: stripeAuditLog.id })
        .from(stripeAuditLog)
        .where(
          sql`${stripeAuditLog.eventType} = 'mintsoft_order_created' AND JSON_EXTRACT(${stripeAuditLog.metadata}, '$.contactId') = ${contactId}`
        )
        .limit(1);
      if (existingOrder.length > 0) {
        // Order already exists — just mark as sold without creating duplicate
        const updateData: any = { status: "done_deal", billingPlanId };
        await db.update(contactsSchema).set(updateData).where(eq(contactsSchema.id, contactId));
        return { success: true, alreadyShipped: true, message: "Deal confirmed (shipment already created)" };
      }

      // ── Create Mintsoft order ──
      // DISABLED: Mintsoft orders now handled manually via Zoho Billing
      // Removed automatic Mintsoft order creation from confirmSold
      // to allow manual control via Zoho Billing
      /*
      const nameParts = (contact.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const result = await createMintsoftOrder({
        contactId,
        firstName,
        lastName,
        email: contact.email || "",
        phone: contact.phone || "",
        address: contact.address,
        trialKit: contact.trialKit,
      });
      */
      // END DISABLED: Mintsoft order creation from confirmSold
      // Skip Mintsoft order creation and proceed with status update
      const result = { success: true, orderId: null, orderNumber: null };

      if (result.success) {
        // Log success (Mintsoft order creation disabled, but still log for audit)
        await db.insert(stripeAuditLog).values({
          eventId: `mintsoft-sold-${contactId}-${Date.now()}`,
          eventType: "mintsoft_order_skipped",
          customerId: paymentId || "",
          status: "processed",
          source: "max_billing",
          metadata: {
            contactId,
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            trialKit: contact.trialKit,
            triggeredBy: "sold_button",
            note: "Mintsoft order creation disabled - handle via Zoho Billing",
          },
        });
        // Mark as done_deal + assign billing plan
        const updateData2: any = { status: "done_deal", billingPlanId };
        await db.update(contactsSchema).set(updateData2).where(eq(contactsSchema.id, contactId));

        // ─── Insert into opening_trials for Opening Dashboard ──────────
        try {
          const fullAgentName = contact.agentName || "Unknown";
          const agentFirstName = fullAgentName.trim().split(/\s+/)[0];
          const today = new Date();
          const createdDate = today.toISOString().split("T")[0];
          const month = createdDate.substring(0, 7);

          await db.insert(openingTrials).values({
            subscriptionId: `max_billing_${contactId}`,
            customerName: contact.name || null,
            email: contact.email || null,
            agentName: agentFirstName,
            planName: `Max Billing - ${contact.trialKit || "Trial Kit"}`,
            createdDate,
            status: "trial",
            classification: "still_in_trial",
            month,
          }).onDuplicateKeyUpdate({ set: { status: "trial" } });
          console.log(`[confirmSold] Opening trial recorded for ${contact.name} (agent: ${agentFirstName}, month: ${month})`);
        } catch (otErr) {
          console.error(`[confirmSold] Failed to insert opening_trial for contact ${contactId}:`, otErr);
        }

        // ─── Send New Sale email notification to support and trial ──────────
        try {
          const agentName = contact.agentName || "Unknown Agent";
          const customerName = contact.name || "Unknown";
          const phone = contact.phone || "N/A";
          const email = contact.email || "N/A";
          const address = contact.address || "N/A";
          const starterKit = contact.trialKit || "N/A";

          const htmlBody = `
            <h2>🎉 New Sale!!!!</h2>
            <table style="border-collapse:collapse; font-size:15px;">
              <tr><td style="padding:6px 12px; font-weight:bold;">Agent Name:</td><td style="padding:6px 12px;">${agentName}</td></tr>
              <tr><td style="padding:6px 12px; font-weight:bold;">Customer Name:</td><td style="padding:6px 12px;">${customerName}</td></tr>
              <tr><td style="padding:6px 12px; font-weight:bold;">Phone Number:</td><td style="padding:6px 12px;">${phone}</td></tr>
              <tr><td style="padding:6px 12px; font-weight:bold;">Email Address:</td><td style="padding:6px 12px;">${email}</td></tr>
              <tr><td style="padding:6px 12px; font-weight:bold;">Delivery Address:</td><td style="padding:6px 12px;">${address}</td></tr>
              <tr><td style="padding:6px 12px; font-weight:bold;">Starter Kit:</td><td style="padding:6px 12px;">${starterKit}</td></tr>
            </table>
          `;

          sendViaGmail({
            from: "Lavie Labs <trial@lavielabs.com>",
            to: "support@lavielabs.com, trial@lavielabs.com",
            subject: "🎉 New Sale!!!!",
            htmlBody,
          }).catch((err) => console.error("[confirmSold Email] Failed:", err));
        } catch (emailErr) {
          console.error(`[confirmSold] Failed to send sale email for contact ${contactId}:`, emailErr);
        }

        return { success: true, alreadyShipped: false, orderId: result.orderId, orderNumber: result.orderNumber };
      }
      // else block removed: result.success is always true now since Mintsoft creation is disabled
    }),

  // ─── Get retention data from lead_assignments linked to a contact ───────────────
  getRetentionData: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { leads: [] };

      const rows = await db
        .select()
        .from(leadAssignments)
        .where(eq(leadAssignments.contactId, input.contactId));

      const leads = rows.map((row) => ({
        id: row.id,
        subscriptionId: row.subscriptionId,
        customerName: row.customerName ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        totalSpend: row.totalSpend ?? 0,
        cyclesCompleted: row.cyclesCompleted ?? 0,
        planName: row.planName ?? null,
        leadType: row.leadType ?? null,
        leadCategory: row.leadCategory ?? null,
        managerNote: row.managerNote ?? null,
        agentNote: row.agentNote ?? null,
        billingStatus: row.billingStatus ?? null,
        assignedAgent: row.assignedAgent ?? null,
        workStatus: row.workStatus ?? null,
        eventDate: row.eventDate ?? null,
        cancelledAt: row.cancelledAt ?? null,
        monthlyAmount: row.monthlyAmount ?? 0,
        callbackAt: row.callbackAt ?? null,
        callbackNote: row.callbackNote ?? null,
        followUpAt: row.followUpAt ?? null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }));

      return { leads };
    }),

  // ─── Get client transactions (subscriptions) by email ───────────────────
  getClientTransactions: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      if (!input.email) return [];
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(clientSubscriptions)
        .where(sql`LOWER(${clientSubscriptions.email}) = LOWER(${input.email})`)
        .orderBy(sql`${clientSubscriptions.createdOn} DESC`);

      return rows;
    }),

  // ─── Get live Zoho Billing data for a contact by email ──────────────────
  getZohoBillingData: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      if (!input.email) return { found: false } as any;
      return getZohoBillingDataByEmail(input.email);
    }),

  // ─── Duplicate Payment Check ────────────────────────────────────────────────
  checkDuplicatePayment: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { isDuplicate: false };

      // Check for successful trial payments (£4.95) for this contact
      const existing = await db
        .select({ createdAt: stripeAuditLog.createdAt })
        .from(stripeAuditLog)
        .where(
          sql`${stripeAuditLog.eventType} = 'payment_intent.succeeded' 
          AND ${stripeAuditLog.amount} = 495 
          AND JSON_EXTRACT(${stripeAuditLog.metadata}, '$.contactId') = ${String(input.contactId)}`
        )
        .orderBy(desc(stripeAuditLog.createdAt))
        .limit(1);

      if (existing.length > 0) {
        return {
          isDuplicate: true,
          existingPaymentDate: existing[0].createdAt.toISOString(),
        };
      }

      return { isDuplicate: false };
    }),

  // ─── Data Management Dashboard (admin only) ─────────────────────────────────
  dataManagement: adminProcedure
    .input(
      z.object({
        dateFilter: z.enum(["today", "this_week", "this_month", "all"]).default("all"),
        customFrom: z.string().optional(),
        customTo: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // ── Calculate date boundaries ──────────────────────────────────────────
      const now = new Date();
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;

      if (input.dateFilter === "today") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (input.dateFilter === "this_week") {
        // Monday start
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0);
        dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (input.dateFilter === "this_month") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (input.dateFilter === "all" && input.customFrom) {
        dateFrom = new Date(input.customFrom);
        dateTo = input.customTo ? new Date(input.customTo + "T23:59:59") : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      }
      // "all" with no custom range = no date filter

      // ── Build base conditions ──────────────────────────────────────────────
      const baseConditions = [
        eq(contactsSchema.department, "opening"),
        isNotNull(contactsSchema.agentName),
        ne(contactsSchema.agentName, ""),
      ];

      if (dateFrom && dateTo) {
        baseConditions.push(gte(contactsSchema.updatedAt, dateFrom));
        baseConditions.push(lte(contactsSchema.updatedAt, dateTo));
      }

      // ── Fetch all relevant contacts in one query ───────────────────────────
      const allContacts = await db
        .select({
          agentName: contactsSchema.agentName,
          status: contactsSchema.status,
          callbackAt: contactsSchema.callbackAt,
          agentEmail: contactsSchema.agentEmail,
        })
        .from(contactsSchema)
        .where(and(...baseConditions));

      // ── Group by agent and compute stats ───────────────────────────────────
      const agentMap = new Map<string, {
        assigned: number;
        worked: number;
        na: number;
        sold: number;
        done: number;
        callback: number;
        remaining: number;
        burnRate: number;
      }>();

      for (const row of allContacts) {
        const agent = row.agentName!;
        if (!agentMap.has(agent)) {
          agentMap.set(agent, { assigned: 0, worked: 0, na: 0, sold: 0, done: 0, callback: 0, remaining: 0, burnRate: 0 });
        }
        const stats = agentMap.get(agent)!;
        stats.assigned++;

        // "Worked" = any status NOT in ('new', 'assigned')
        const isWorked = row.status !== "new" && row.status !== "assigned";
        if (isWorked) stats.worked++;

        if (row.status === "no_answer") stats.na++;
        if (row.status === "done_deal") stats.sold++;
        if (row.status === "done") stats.done++;
        if (row.callbackAt !== null) stats.callback++;
      }

      // Calculate derived fields
      const agents: Array<{
        agentName: string;
        assigned: number;
        worked: number;
        na: number;
        sold: number;
        done: number;
        callback: number;
        remaining: number;
        burnRate: number;
      }> = [];

      for (const [agentName, stats] of Array.from(agentMap.entries())) {
        stats.remaining = stats.assigned - stats.worked;
        stats.burnRate = stats.worked > 0 ? Math.round((stats.na / stats.worked) * 100) : 0;
        agents.push({ agentName, ...stats });
      }

      // Sort by burn rate descending
      agents.sort((a, b) => b.burnRate - a.burnRate);

      // ── Summary totals (these are NOT filtered by date — they show overall state) ──
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

      // Total data in opening department (no date filter)
      const [totalDataResult] = await db
        .select({ count: drizzleCount() })
        .from(contactsSchema)
        .where(eq(contactsSchema.department, "opening"));
      const totalData = totalDataResult?.count ?? 0;

      // Unassigned: agentName is null/empty OR agentEmail = trial@lavielabs.com
      const [unassignedResult] = await db
        .select({ count: drizzleCount() })
        .from(contactsSchema)
        .where(
          and(
            eq(contactsSchema.department, "opening"),
            or(
              isNull(contactsSchema.agentName),
              eq(contactsSchema.agentName, ""),
              eq(contactsSchema.agentEmail, "trial@lavielabs.com")
            )
          )
        );
      const unassigned = unassignedResult?.count ?? 0;

      // Deals today
      const [dealsTodayResult] = await db
        .select({ count: drizzleCount() })
        .from(contactsSchema)
        .where(
          and(
            eq(contactsSchema.department, "opening"),
            eq(contactsSchema.status, "done_deal"),
            gte(contactsSchema.updatedAt, todayStart),
            lte(contactsSchema.updatedAt, todayEnd)
          )
        );
      const dealsToday = dealsTodayResult?.count ?? 0;

      // Deals this week
      const [dealsWeekResult] = await db
        .select({ count: drizzleCount() })
        .from(contactsSchema)
        .where(
          and(
            eq(contactsSchema.department, "opening"),
            eq(contactsSchema.status, "done_deal"),
            gte(contactsSchema.updatedAt, weekStart),
            lte(contactsSchema.updatedAt, todayEnd)
          )
        );
      const dealsThisWeek = dealsWeekResult?.count ?? 0;

      // Deals this month
      const [dealsMonthResult] = await db
        .select({ count: drizzleCount() })
        .from(contactsSchema)
        .where(
          and(
            eq(contactsSchema.department, "opening"),
            eq(contactsSchema.status, "done_deal"),
            gte(contactsSchema.updatedAt, monthStart),
            lte(contactsSchema.updatedAt, todayEnd)
          )
        );
      const dealsThisMonth = dealsMonthResult?.count ?? 0;

      // Overall burn rate from the filtered agent data
      const totalWorked = agents.reduce((sum, a) => sum + a.worked, 0);
      const totalNA = agents.reduce((sum, a) => sum + a.na, 0);
      const overallBurnRate = totalWorked > 0 ? Math.round((totalNA / totalWorked) * 100) : 0;

      return {
        agents,
        summary: {
          totalData,
          unassigned,
          dealsToday,
          dealsThisWeek,
          dealsThisMonth,
          overallBurnRate,
        },
      };
    }),

  // ─── Request More Leads (self-serve allocation for agents) ────────────────
  requestMoreLeads: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const agentEmail = ctx.user.email;
    const agentName = ctx.user.name;
    if (!agentEmail || !agentName) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "User profile incomplete (missing name or email)" });
    }

    const BATCH_SIZE = 100;

    // 1. Fetch up to 100 unassigned NEW leads (department = opening, oldest first)
    const [newLeadsResult]: any = await db.execute(
      sql`SELECT id FROM contacts
          WHERE status = 'new'
            AND (agentName IS NULL OR agentName = '')
            AND department = 'opening'
          ORDER BY createdAt ASC
          LIMIT ${BATCH_SIZE}`
    );
    const newLeadIds: number[] = (newLeadsResult as any[]).map((r: any) => r.id);
    const fromNew = newLeadIds.length;

    // 2. If not enough, fill from cooling pool (no_answer, unassigned, updatedAt >= 7 days ago)
    let coolingLeadIds: number[] = [];
    if (fromNew < BATCH_SIZE) {
      const remaining = BATCH_SIZE - fromNew;
      const [coolingResult]: any = await db.execute(
        sql`SELECT id FROM contacts
            WHERE status = 'no_answer'
              AND (agentName IS NULL OR agentName = '')
              AND department = 'opening'
              AND updatedAt <= NOW() - INTERVAL 7 DAY
            ORDER BY updatedAt ASC
            LIMIT ${remaining}`
      );
      coolingLeadIds = (coolingResult as any[]).map((r: any) => r.id);
    }
    const fromCoolingPool = coolingLeadIds.length;

    // 3. Combine all IDs and bulk-update
    const allIds = [...newLeadIds, ...coolingLeadIds];
    if (allIds.length === 0) {
      return { allocated: 0, fromNew: 0, fromCoolingPool: 0 };
    }

    await db.execute(
      sql`UPDATE contacts
          SET agentName = ${agentName},
              agentEmail = ${agentEmail},
              status = 'assigned'
          WHERE id IN (${sql.join(allIds.map(id => sql`${id}`), sql`, `)})`
    );

    return { allocated: allIds.length, fromNew, fromCoolingPool };
  }),

  // ─── Get AI Retention Notes for a contact (from call analyses) ──────────────
  getRetentionNotes: protectedProcedure
    .input(z.object({ contactId: z.number().optional(), phone: z.string().optional(), email: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { notes: [] };

      // Build conditions to find call analyses for this contact
      const conditions: any[] = [];
      if (input.contactId) conditions.push(eq(callAnalyses.contactId, input.contactId));
      if (input.phone) {
        const normalized = input.phone.replace(/[^0-9]/g, "").slice(-10);
        conditions.push(sql`REPLACE(REPLACE(REPLACE(${callAnalyses.externalNumber}, ' ', ''), '+', ''), '-', '') LIKE ${"%" + normalized}`);
      }

      if (conditions.length === 0) return { notes: [] };

      const rows = await db
        .select({
          id: callAnalyses.id,
          repName: callAnalyses.repName,
          callDate: callAnalyses.callDate,
          callType: callAnalyses.callType,
          analysisJson: callAnalyses.analysisJson,
          customerName: callAnalyses.customerName,
          overallScore: callAnalyses.overallScore,
          durationSeconds: callAnalyses.durationSeconds,
        })
        .from(callAnalyses)
        .where(sql`(${sql.join(conditions, sql` OR `)}) AND ${callAnalyses.status} = 'done'`)
        .orderBy(sql`${callAnalyses.callDate} DESC`)
        .limit(20);

      const notes = rows
        .map((row) => {
          try {
            const report = row.analysisJson ? JSON.parse(row.analysisJson) : {};
            return {
              id: row.id,
              repName: row.repName,
              callDate: row.callDate ? row.callDate.toISOString() : null,
              callType: row.callType,
              customerName: row.customerName,
              overallScore: row.overallScore ?? report.overallScore ?? null,
              durationSeconds: row.durationSeconds,
              retentionNotes: report.retentionNotes || null,
              summary: report.summary || report.managerReview?.title || null,
            };
          } catch { return null; }
        })
        .filter(Boolean);

      return { notes };
    }),

  // ─── Get call history from DB (call_analyses table) ─────────────────────────
  getCallHistoryFromDb: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: callAnalyses.id,
          callDate: callAnalyses.callDate,
          durationSeconds: callAnalyses.durationSeconds,
          repName: callAnalyses.repName,
          callType: callAnalyses.callType,
          audioFileUrl: callAnalyses.audioFileUrl,
          cloudtalkCallId: callAnalyses.cloudtalkCallId,
          status: callAnalyses.status,
          overallScore: callAnalyses.overallScore,
        })
        .from(callAnalyses)
        .where(eq(callAnalyses.contactId, input.contactId))
        .orderBy(desc(callAnalyses.callDate));
    }),
});