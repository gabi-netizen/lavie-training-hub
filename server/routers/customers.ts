/**
 * Customers tRPC Router
 *
 * Manages old Zoho CRM customers (~50K) who previously paid more than £4.95
 * but no longer have an active subscription. Separate from the contacts/leads table.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { customers, contacts } from "../../drizzle/schema";
import { eq, like, or, and, sql, desc, inArray, isNull, isNotNull } from "drizzle-orm";

// ─── Agent Name Mapping (Zoho full names → system short names) ───────────────
const AGENT_NAME_MAP: Record<string, string> = {
  "rob chidzik": "Rob",
  "rob chidzick": "Rob",
  "guy eli": "Guy",
  "matthew holman": "Matthew",
  "james huxley": "James",
  "ashleigh walker": "Ashleigh",
  "debbie forbes": "Debbie",
  "shola marie": "Shola",
  "andrea": "Andrea",
  "ava monroe": "Ava",
  "paige taylor": "Paige",
  "darrell loynes": "Darrel",
  "darrel loynes": "Darrel",
  "cat mckay": "Cat",
  "catriona mckay": "Cat",
  "ryan spence": "Ryan",
  "nisha greenwood": "Nisha",
  "harrison joslin": "Harrison",
  "carl": "Carl",
  "kai": "Kai",
  "tristan": "Tristan",
  "alan": "Alan",
  "bethany": "Bethany",
  "gabi lavie": "Gabi",
  "sara lavie": "Sara",
};

function normalizeAgentName(fullName: string | undefined | null): string | null {
  if (!fullName || !fullName.trim()) return null;
  const lower = fullName.trim().toLowerCase();
  // Direct match
  if (AGENT_NAME_MAP[lower]) return AGENT_NAME_MAP[lower];
  // Try first name only
  const firstName = lower.split(" ")[0];
  const match = Object.entries(AGENT_NAME_MAP).find(([key]) => key.startsWith(firstName));
  if (match) return match[1];
  // If no match found, capitalize first letter of first name and return as-is
  return fullName.trim().split(" ")[0].charAt(0).toUpperCase() + fullName.trim().split(" ")[0].slice(1).toLowerCase();
}

export const customersRouter = router({
  /**
   * getCustomers — paginated list with filters
   */
  getCustomers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        assignedAgent: z.string().optional(),
        department: z.enum(["opening", "retention"]).optional(),
        status: z.string().optional(),
        source: z.string().optional(),
        page: z.number().default(1),
        perPage: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { customers: [], totalCount: 0, summary: { total: 0, assigned: 0, unassigned: 0, opening: 0, retention: 0 } };

      const conditions: any[] = [];

      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            like(customers.name, term),
            like(customers.email, term),
            like(customers.phone, term)
          )
        );
      }

      if (input.assignedAgent) {
        conditions.push(eq(customers.assignedAgent, input.assignedAgent));
      }

      if (input.department) {
        conditions.push(eq(customers.department, input.department));
      }

      if (input.status) {
        conditions.push(eq(customers.status, input.status));
      }

      if (input.source) {
        conditions.push(eq(customers.source, input.source));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(customers)
        .where(where);
      const totalCount = Number(countResult[0]?.count ?? 0);

      // Get paginated results
      const offset = (input.page - 1) * input.perPage;
      const rows = await db
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.importedAt))
        .limit(input.perPage)
        .offset(offset);

      // Get summary stats (unfiltered)
      const summaryResult = await db
        .select({
          total: sql<number>`COUNT(*)`,
          assigned: sql<number>`SUM(CASE WHEN assignedAgent IS NOT NULL AND assignedAgent != '' THEN 1 ELSE 0 END)`,
          unassigned: sql<number>`SUM(CASE WHEN assignedAgent IS NULL OR assignedAgent = '' THEN 1 ELSE 0 END)`,
          opening: sql<number>`SUM(CASE WHEN department = 'opening' THEN 1 ELSE 0 END)`,
          retention: sql<number>`SUM(CASE WHEN department = 'retention' THEN 1 ELSE 0 END)`,
        })
        .from(customers);

      const summary = {
        total: Number(summaryResult[0]?.total ?? 0),
        assigned: Number(summaryResult[0]?.assigned ?? 0),
        unassigned: Number(summaryResult[0]?.unassigned ?? 0),
        opening: Number(summaryResult[0]?.opening ?? 0),
        retention: Number(summaryResult[0]?.retention ?? 0),
      };

      return { customers: rows, totalCount, summary };
    }),

  /**
   * importCustomers — bulk insert, skip duplicates by email
   */
  importCustomers: adminProcedure
    .input(
      z.object({
        customers: z.array(
          z.object({
            name: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
            totalSpent: z.string().optional(),
            lastPurchaseDate: z.string().optional(),
            source: z.string().optional(),
            notes: z.string().optional(),
            assignedAgent: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let imported = 0;
      let skipped = 0;

      // Get existing emails for dedup
      const existingEmailRows = await db
        .select({ email: customers.email })
        .from(customers)
        .where(isNotNull(customers.email));
      const existingEmails = new Set(
        existingEmailRows
          .map((r) => r.email?.toLowerCase())
          .filter(Boolean)
      );

      // Batch insert (chunks of 500)
      const toInsert: any[] = [];
      // Normalize UK phone numbers to +44 format
      function normalizePhone(phone: string | undefined | null): string | null {
        if (!phone) return null;
        let p = phone.replace(/[\s\-()]/g, ""); // strip spaces, dashes, parens
        if (p.startsWith("07")) p = "+44" + p.slice(1);
        else if (p.startsWith("447") && !p.startsWith("+")) p = "+" + p;
        else if (/^7\d{9}$/.test(p)) p = "+44" + p;
        return p;
      }

      for (const row of input.customers) {
        if (row.email && existingEmails.has(row.email.toLowerCase())) {
          skipped++;
          continue;
        }
        // Also track within this import batch
        if (row.email) {
          existingEmails.add(row.email.toLowerCase());
        }
        toInsert.push({
          name: row.name,
          email: row.email || null,
          phone: normalizePhone(row.phone),
          address: row.address || null,
          totalSpent: row.totalSpent || null,
          lastPurchaseDate: row.lastPurchaseDate || null,
          source: row.source || null,
          notes: row.notes || null,
          assignedAgent: normalizeAgentName((row as any).assignedAgent) || null,
        });
      }

      // Insert in chunks into customers table
      const CHUNK_SIZE = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
          await db.insert(customers).values(chunk);
          imported += chunk.length;
        }
      }

      // Also insert into contacts table so agents see them in Workspace
      // Look up agent emails from users table
      const agentEmailMap: Record<string, string> = {};
      try {
        const usersRows = await db.execute(sql`SELECT name, email FROM users WHERE active = 1 AND email IS NOT NULL`);
        for (const u of usersRows[0] as any[]) {
          if (u.name && u.email) {
            // Map normalized short name to email
            const shortName = normalizeAgentName(u.name);
            if (shortName) agentEmailMap[shortName] = u.email;
          }
        }
      } catch (_e) { /* ignore if users table not accessible */ }

      const contactsToInsert: any[] = [];
      for (const row of toInsert) {
        const agentName = row.assignedAgent;
        const agentEmail = agentName ? agentEmailMap[agentName] || null : null;
        contactsToInsert.push({
          name: row.name,
          email: row.email,
          phone: row.phone,
          address: row.address || null,
          source: row.source || "CSV Import",
          importedNotes: row.notes || null,
          agentName: agentName || null,
          agentEmail: agentEmail || "trial@lavielabs.com",
          status: "new",
          department: "opening",
          leadDate: new Date(),
        });
      }

      // Insert contacts in chunks
      for (let i = 0; i < contactsToInsert.length; i += CHUNK_SIZE) {
        const chunk = contactsToInsert.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
          try {
            await db.insert(contacts).values(chunk);
          } catch (_e) { /* ignore duplicates */ }
        }
      }

      return { imported, skipped };
    }),

  /**
   * assignCustomer — assign a single customer to an agent + department
   */
  assignCustomer: adminProcedure
    .input(
      z.object({
        id: z.number(),
        assignedAgent: z.string(),
        department: z.enum(["opening", "retention"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(customers)
        .set({ assignedAgent: input.assignedAgent, department: input.department })
        .where(eq(customers.id, input.id));

      return { success: true };
    }),

  /**
   * bulkAssign — assign multiple customers at once
   */
  bulkAssign: adminProcedure
    .input(
      z.object({
        ids: z.array(z.number()),
        assignedAgent: z.string(),
        department: z.enum(["opening", "retention"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(customers)
        .set({ assignedAgent: input.assignedAgent, department: input.department })
        .where(inArray(customers.id, input.ids));

      return { success: true, count: input.ids.length };
    }),

  /**
   * updateCustomerStatus — update status of a single customer
   */
  updateCustomerStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(customers)
        .set({ status: input.status })
        .where(eq(customers.id, input.id));

      return { success: true };
    }),

  /**
   * deleteCustomer — delete a single customer
   */
  deleteCustomer: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(customers).where(eq(customers.id, input.id));

      return { success: true };
    }),

  /**
   * bulkDelete — delete multiple customers
   */
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(customers).where(inArray(customers.id, input.ids));

      return { success: true, count: input.ids.length };
    }),

  /**
   * getCustomerByEmail — find a single customer by email
   */
  getCustomerByEmail: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(customers)
        .where(eq(customers.email, input.email))
        .limit(1);

      return rows[0] ?? null;
    }),

  /**
   * getCustomerSources — distinct source values for filter dropdown
   */
  getCustomerSources: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .selectDistinct({ source: customers.source })
      .from(customers)
      .where(isNotNull(customers.source));

    return rows
      .map((r) => r.source)
      .filter((s): s is string => s !== null && s !== "");
  }),
});
