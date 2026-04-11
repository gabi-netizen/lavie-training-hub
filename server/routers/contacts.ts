import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
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

export const contactsRouter = router({
  // ─── List contacts with search/filter ─────────────────────────────────────
  list: publicProcedure
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
      const rows = await listContacts(input);
      return rows;
    }),

  // ─── Get single contact with call notes ───────────────────────────────────
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getContact(input.id);
    }),

  // ─── Update contact status / agent / lead type / callback ─────────────────
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(CONTACT_STATUSES).optional(),
        agentName: z.string().optional(),
        leadType: z.string().optional(),
        callbackAt: z.date().optional(),
        importedNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return updateContact(id, updates);
    }),

  // ─── Add a call note ──────────────────────────────────────────────────────
  addNote: publicProcedure
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
  import: publicProcedure
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
    .mutation(async ({ input }) => {
      return importContacts(input.rows as CsvContactRow[]);
    }),

  // ─── Return metadata (lead types, statuses) ───────────────────────────────
  meta: publicProcedure.query(() => ({
    leadTypes: LEAD_TYPES,
    statuses: CONTACT_STATUSES,
  })),
});
