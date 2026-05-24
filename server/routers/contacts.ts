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
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users, leadAssignments } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import { notifyNewContact } from "../n8n";
import { getZohoBillingDataByEmail } from "../zohoBilling";

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
      const result = await updateContact(id, updates);

      // Get contact for downstream operations
      const contact = await getContact(id);

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
      })
    )
    .mutation(async ({ input }) => {
      return bulkAssignContacts(input.ids, input.agentName, input.agentEmail);
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
      })
    )
    .mutation(async ({ input }) => {
      const { contactId, name, email } = input;

      // Create a Stripe Customer
      const customer = await stripe.customers.create({
        name,
        email,
        metadata: { contactId: String(contactId) },
      });

      // Create a PaymentIntent for £4.95 (495 pence) attached to the customer
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 495,
        currency: "gbp",
        customer: customer.id,
        metadata: { contactId: String(contactId) },
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
    .mutation(async ({ input }) => {
      const { contactId, stripeCustomerId } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { contacts: contactsTable } = await import("../../drizzle/schema");

      // Save Stripe Customer ID and mark as sold (done_deal)
      await db
        .update(contactsTable)
        .set({
          stripeCustomerId,
          status: "done_deal",
        })
        .where(eq(contactsTable.id, contactId));

      return { success: true };
    }),

  // ─── Send Payment Email via Gmail SMTP (replaced Postmark 2024-05) ─────────
  sendPaymentEmail: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        name: z.string().min(1),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const { contactId, name, email } = input;

      const PAYMENT_LINK = "https://buy.stripe.com/cNi3cvgcR4879BDgSSb3q0r";

      // Build HTML email body (replaces Postmark template)
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

      // ─── DEPRECATED Postmark version (kept for reference) ───
      // const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || process.env.POSTMARK_API_KEY;
      // if (!POSTMARK_TOKEN) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "POSTMARK token not configured" });
      // const TEMPLATE_ID = 45041782;
      // const res = await fetch("https://api.postmarkapp.com/email/withTemplate", { ... });

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

  // ─── Get retention data from lead_assignments linked to a contact ───────────
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
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }));

      return { leads };
    }),

  // ─── Get live Zoho Billing data for a contact by email ──────────────────
  getZohoBillingData: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      if (!input.email) return { found: false } as any;
      return getZohoBillingDataByEmail(input.email);
    }),
});