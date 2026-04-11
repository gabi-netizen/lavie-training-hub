import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  listContacts,
  getContact,
  updateContact,
  addCallNote,
  importContacts,
  LEAD_TYPES,
  CONTACT_STATUSES,
  type CsvContactRow,
} from "../contacts";
import {
  sendCallbackReminder,
  sendStatusChangeNotification,
  sendImportSummary,
  sendAdminAlert,
} from "../email";
import {
  syncContactToAC,
  updateContactStatus as updateACStatus,
  getContactByEmail,
  getLists,
  getAutomations,
} from "../activecampaign";

// Admin email for notifications
const ADMIN_EMAIL = "gabriel@lavielabs.com";

export const contactsRouter = router({
  // ─── List contacts with search/filter ─────────────────────────────────────
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        leadType: z.string().optional(),
        status: z.string().optional(),
        agentName: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return listContacts(input);
    }),

  // ─── Get single contact with call notes ───────────────────────────────────
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getContact(input.id);
    }),

  // ─── Update contact status / agent / lead type / callback ─────────────────
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(CONTACT_STATUSES).optional(),
        agentName: z.string().optional(),
        leadType: z.string().optional(),
        callbackAt: z.date().optional(),
        importedNotes: z.string().optional(),
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
  addNote: adminProcedure
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
  import: adminProcedure
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
            notes: z.string().optional(),
            source: z.string().optional(),
            leadDate: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await importContacts(input.rows as CsvContactRow[]);

      // ── ActiveCampaign: sync all imported contacts (fire-and-forget) ────
      Promise.all(
        input.rows.map((row) =>
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
  meta: adminProcedure.query(() => ({
    leadTypes: LEAD_TYPES,
    statuses: CONTACT_STATUSES,
  })),

  // ─── ActiveCampaign: get lists ────────────────────────────────────────────
  acLists: adminProcedure.query(async () => {
    return getLists();
  }),

  // ─── ActiveCampaign: get automations ─────────────────────────────────────
  acAutomations: adminProcedure.query(async () => {
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
});
