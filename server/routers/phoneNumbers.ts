import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { phoneNumbers } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const CLOUDTALK_API_BASE = "https://my.cloudtalk.io/api";

function getCloudTalkHeaders(): HeadersInit {
  const keyId = process.env.CLOUDTALK_API_KEY_ID ?? "";
  const keySecret = process.env.CLOUDTALK_API_KEY_SECRET ?? "";
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

/** Delete a number from CloudTalk to stop billing. Returns true on success. */
async function deleteCloudTalkNumber(cloudtalkNumberId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${CLOUDTALK_API_BASE}/numbers/delete/${cloudtalkNumberId}.json`,
      {
        method: "DELETE",
        headers: getCloudTalkHeaders(),
        signal: AbortSignal.timeout(15_000),
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[PhonePool] Failed to delete CloudTalk number:", err);
    return false;
  }
}

export interface AgentPhoneSummary {
  agentName: string;
  numbers: Array<{
    id: number;
    number: string;
    assignedAt: Date | null;
    daysActive: number | null;
    cloudtalkNumberId: string | null;
    notes: string | null;
  }>;
}

export const phoneNumbersRouter = router({
  /**
   * Per-agent summary: how many numbers each agent holds + days active per number.
   * Only returns "active" numbers (assigned to someone).
   */
  agentSummary: adminProcedure.query(async (): Promise<AgentPhoneSummary[]> => {
    const db = await getDb();
    const rows = await db!
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.status, "active"))
      .orderBy(phoneNumbers.assignedAgentName);

    const now = Date.now();
    const byAgent = new Map<string, AgentPhoneSummary>();

    for (const row of rows) {
      const name = row.assignedAgentName ?? "Unknown";
      if (!byAgent.has(name)) byAgent.set(name, { agentName: name, numbers: [] });

      const daysActive = row.assignedAt
        ? Math.floor((now - new Date(row.assignedAt).getTime()) / 86_400_000)
        : null;

      byAgent.get(name)!.numbers.push({
        id: row.id,
        number: row.number,
        assignedAt: row.assignedAt,
        daysActive,
        cloudtalkNumberId: row.cloudtalkNumberId ?? null,
        notes: row.notes ?? null,
      });
    }

    return Array.from(byAgent.values()).sort((a, b) =>
      a.agentName.localeCompare(b.agentName)
    );
  }),

  /** List all phone numbers — grouped by status */
  list: adminProcedure.query(async () => {
    const db = await getDb();
    const rows = await db!
      .select()
      .from(phoneNumbers)
      .orderBy(desc(phoneNumbers.createdAt));
    return rows;
  }),

  /** Add a number to the pool (or update its details) */
  add: adminProcedure
    .input(
      z.object({
        number: z.string().min(7).max(32),
        cloudtalkNumberId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.insert(phoneNumbers).values({
        number: input.number,
        status: "pool",
        cloudtalkNumberId: input.cloudtalkNumberId ?? null,
        notes: input.notes ?? null,
        historyJson: "[]",
      });
      return { success: true };
    }),

  /** Assign a pool number to an agent */
  assign: adminProcedure
    .input(
      z.object({
        id: z.number(),
        assignedUserId: z.number(),
        assignedAgentName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db!
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.id, input.id));
      if (!existing) throw new Error("Number not found");
      if (existing.status === "spam") throw new Error("Cannot assign a spam number");

      // Update history
      const history: Array<{ agentName: string; assignedAt: string; releasedAt?: string }> =
        JSON.parse(existing.historyJson ?? "[]");
      history.push({
        agentName: input.assignedAgentName,
        assignedAt: new Date().toISOString(),
      });

      await db!
        .update(phoneNumbers)
        .set({
          status: "active",
          assignedUserId: input.assignedUserId,
          assignedAgentName: input.assignedAgentName,
          assignedAt: new Date(),
          historyJson: JSON.stringify(history),
        })
        .where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),

  /** Release a number back to the pool */
  release: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db!
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.id, input.id));
      if (!existing) throw new Error("Number not found");

      // Close the last history entry
      const history: Array<{ agentName: string; assignedAt: string; releasedAt?: string }> =
        JSON.parse(existing.historyJson ?? "[]");
      if (history.length > 0 && !history[history.length - 1].releasedAt) {
        history[history.length - 1].releasedAt = new Date().toISOString();
      }

      await db!
        .update(phoneNumbers)
        .set({
          status: "pool",
          assignedUserId: null,
          assignedAgentName: null,
          assignedAt: null,
          historyJson: JSON.stringify(history),
        })
        .where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),

  /**
   * Mark a number as spam.
   * CRITICAL: This MUST also call DELETE /numbers/delete/{cloudtalkNumberId}.json
   * to stop CloudTalk billing immediately.
   */
  markAsSpam: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db!
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.id, input.id));
      if (!existing) throw new Error("Number not found");

      let cloudtalkDeleted = false;
      if (existing.cloudtalkNumberId) {
        cloudtalkDeleted = await deleteCloudTalkNumber(existing.cloudtalkNumberId);
      }

      // Close the last history entry if active
      const history: Array<{ agentName: string; assignedAt: string; releasedAt?: string }> =
        JSON.parse(existing.historyJson ?? "[]");
      if (history.length > 0 && !history[history.length - 1].releasedAt) {
        history[history.length - 1].releasedAt = new Date().toISOString();
      }

      await db!
        .update(phoneNumbers)
        .set({
          status: "spam",
          assignedUserId: null,
          assignedAgentName: null,
          assignedAt: null,
          spamMarkedAt: new Date(),
          historyJson: JSON.stringify(history),
        })
        .where(eq(phoneNumbers.id, input.id));

      return { success: true, cloudtalkDeleted };
    }),

  /** Move a spam number back to pool (e.g. if marked spam by mistake) */
  unspam: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!
        .update(phoneNumbers)
        .set({
          status: "pool",
          spamMarkedAt: null,
        })
        .where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),

  /** Update notes or cloudtalkNumberId for a number */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        cloudtalkNumberId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!
        .update(phoneNumbers)
        .set({
          cloudtalkNumberId: input.cloudtalkNumberId,
          notes: input.notes,
        })
        .where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),

  /** Delete a number from the pool entirely (only allowed for pool/spam numbers) */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db!
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.id, input.id));
      if (!existing) throw new Error("Number not found");
      if (existing.status === "active") {
        throw new Error("Cannot delete an active number — release it first");
      }
      await db!.delete(phoneNumbers).where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),
});
