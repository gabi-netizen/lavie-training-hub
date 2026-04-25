import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { callAnalyses, users, contacts } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, like, or, desc, inArray } from "drizzle-orm";
import { getCallHistory } from "../cloudtalk";
import { storagePut } from "../storage";
import {
  createCallAnalysisRecord,
  processCallAnalysis,
} from "../callAnalysis";

// ─── Date range helper ───────────────────────────────────────────────────────
function getDateRange(range: string): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (range) {
    case "today":
      return { from: startOfDay, to: endOfDay };
    case "yesterday": {
      const yStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
      const yEnd = new Date(startOfDay.getTime() - 1);
      return { from: yStart, to: yEnd };
    }
    case "this_week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      const weekStart = new Date(startOfDay.getTime() - diff * 24 * 60 * 60 * 1000);
      return { from: weekStart, to: endOfDay };
    }
    case "last_7_days": {
      const from = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from, to: endOfDay };
    }
    case "this_month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: monthStart, to: endOfDay };
    }
    case "last_3_months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return { from, to: endOfDay };
    }
    case "this_year": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { from: yearStart, to: endOfDay };
    }
    case "previous_month": {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: prevMonthStart, to: prevMonthEnd };
    }
    default:
      // Default to all time — very wide range
      return { from: new Date(2020, 0, 1), to: endOfDay };
  }
}

// ─── Call type grouping for "Retention" tab filter ───────────────────────────
const OPENING_CALL_TYPES = ["cold_call", "follow_up"];
const RETENTION_CALL_TYPES = ["live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "retention_win_back"];

// ─── Map callType to display label ──────────────────────────────────────────
function callTypeLabel(ct: string | null): string {
  switch (ct) {
    case "cold_call": return "Cold Call";
    case "follow_up": return "Follow Up";
    case "live_sub": return "Retention";
    case "pre_cycle_cancelled": return "Retention";
    case "pre_cycle_decline": return "Retention";
    case "end_of_instalment": return "Retention";
    case "from_cat": return "Retention";
    case "retention_win_back": return "Retention";
    case "other": return "Other";
    case "opening": return "Opening";
    default: return ct ?? "Unknown";
  }
}

// ─── Normalize phone for matching ─────────────────────────────────────────────
function normalizePhone(phone: string | number): string {
  return String(phone).replace(/[\s\-().+]/g, "");
}

// ─── Find user by CloudTalk agent ID ─────────────────────────────────────────
async function findUserByCloudtalkAgentId(agentId: string | number) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  const results = await db
    .select()
    .from(users)
    .where(eq(users.cloudtalkAgentId, agentIdStr))
    .limit(1);
  return results[0] ?? null;
}

// ─── Find user by email ───────────────────────────────────────────────────────
async function findUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return results[0] ?? null;
}

// ─── Auto-create user from CloudTalk agent data ───────────────────────────────
async function findOrCreateAgentUser(agentId: string | number, agentName: string | null, agentEmail: string | null) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);

  // 1. Try by cloudtalkAgentId
  let user = await findUserByCloudtalkAgentId(agentIdStr);
  if (user) return user;

  // 2. Try by email
  if (agentEmail) {
    user = await findUserByEmail(agentEmail);
    if (user) {
      await db.update(users)
        .set({ cloudtalkAgentId: agentIdStr })
        .where(eq(users.id, user.id));
      return { ...user, cloudtalkAgentId: agentIdStr };
    }
  }

  // 3. Auto-create a new user account
  const name = agentName ?? `Agent ${agentIdStr}`;
  const openId = `cloudtalk-${agentIdStr}`;
  try {
    const [result] = await db.insert(users).values({
      openId,
      name,
      email: agentEmail ?? null,
      cloudtalkAgentId: agentIdStr,
      role: "user",
    });
    const newId = (result as any).insertId as number;
    const newUsers = await db.select().from(users).where(eq(users.id, newId)).limit(1);
    return newUsers[0] ?? null;
  } catch (err: any) {
    const existing = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return existing[0] ?? null;
  }
}

// ─── Find contact by phone number ─────────────────────────────────────────────
async function findContactByPhone(phone: string | number) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone(phone);
  const results = await db
    .select()
    .from(contacts)
    .where(
      or(
        like(contacts.phone, `%${normalized}%`),
        like(contacts.phone, `%${phone}%`)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

// ─── Check if call already processed (deduplication) ─────────────────────────
async function isCallAlreadyProcessed(cloudtalkCallId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const results = await db
    .select({ id: callAnalyses.id })
    .from(callAnalyses)
    .where(eq(callAnalyses.cloudtalkCallId, cloudtalkCallId))
    .limit(1);
  return results.length > 0;
}

// ─── Download recording and upload to S3 ─────────────────────────────────────
async function downloadAndStoreRecording(
  recordingUrl: string,
  callId: string
): Promise<{ fileKey: string; fileUrl: string }> {
  const response = await fetch(recordingUrl);
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const fileKey = `call-recordings/sync-${callId}-${Date.now()}.${ext}`;
  const { url } = await storagePut(fileKey, buffer, contentType);
  return { fileKey, fileUrl: url };
}

// ─── Stripe customer name lookup ─────────────────────────────────────────────
async function lookupStripeCustomerName(phone: string | number): Promise<string | null> {
  const stripeKey = process.env.STRIPE_API_KEY;
  if (!stripeKey) return null;
  const raw = String(phone).trim();
  const candidates: string[] = [raw];
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) candidates.push(`+44${digits.slice(1)}`, `0${digits.slice(1)}`);
  if (digits.length === 11 && digits.startsWith("0")) candidates.push(`+44${digits.slice(1)}`);
  if (digits.length === 12 && digits.startsWith("44")) candidates.push(`+${digits}`, `0${digits.slice(2)}`);
  for (const candidate of candidates) {
    try {
      const query = encodeURIComponent(`phone:"${candidate}"`);
      const res = await fetch(`https://api.stripe.com/v1/customers/search?query=${query}&limit=1`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const json = await res.json() as any;
      if (json?.data?.length > 0) {
        const customer = json.data[0];
        const name = customer.name ?? customer.description ?? null;
        if (name) return name;
      }
    } catch {
      // continue
    }
  }
  return null;
}

export const dashboardRouter = router({
  /**
   * getDashboardCalls — paginated, filtered query on call_analyses joined with users.
   */
  getDashboardCalls: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(16),
        tab: z.enum(["opening", "retention", "all"]).default("all"),
        agentId: z.number().optional(),
        team: z.enum(["opening", "retention"]).optional(),
        scoreMin: z.number().min(0).max(100).optional(),
        scoreMax: z.number().min(0).max(100).optional(),
        dateRange: z.string().optional(),
        callType: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { page, limit, tab, agentId, team, scoreMin, scoreMax, dateRange, callType, search } = input;
      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions: any[] = [];

      // Tab filter
      if (tab === "opening") {
        conditions.push(inArray(callAnalyses.callType, OPENING_CALL_TYPES as any));
      } else if (tab === "retention") {
        conditions.push(inArray(callAnalyses.callType, RETENTION_CALL_TYPES as any));
      }

      // Agent filter
      if (agentId) {
        conditions.push(eq(callAnalyses.userId, agentId));
      }

      // Team filter — join with users to filter by team
      if (team) {
        const teamUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.team, team));
        const teamUserIds = teamUsers.map((u) => u.id);
        if (teamUserIds.length > 0) {
          conditions.push(inArray(callAnalyses.userId, teamUserIds));
        } else {
          return { calls: [], totalCount: 0, page, limit };
        }
      }

      // Score range
      if (scoreMin !== undefined && scoreMin > 0) {
        conditions.push(gte(callAnalyses.overallScore, scoreMin));
      }
      if (scoreMax !== undefined && scoreMax < 100) {
        conditions.push(lte(callAnalyses.overallScore, scoreMax));
      }

      // Date range
      if (dateRange && dateRange !== "all") {
        const { from, to } = getDateRange(dateRange);
        conditions.push(gte(callAnalyses.createdAt, from));
        conditions.push(lte(callAnalyses.createdAt, to));
      }

      // Call type filter
      if (callType && callType !== "all") {
        if (callType === "retention") {
          conditions.push(inArray(callAnalyses.callType, RETENTION_CALL_TYPES as any));
        } else {
          conditions.push(eq(callAnalyses.callType, callType as any));
        }
      }

      // Search by customer name or contact phone
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        conditions.push(
          or(
            like(callAnalyses.customerName, searchTerm),
            like(callAnalyses.repName, searchTerm),
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Count total
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(callAnalyses)
        .where(whereClause);
      const totalCount = Number(countResult[0]?.count ?? 0);

      // Fetch paginated calls with user join
      const rows = await db
        .select({
          id: callAnalyses.id,
          userId: callAnalyses.userId,
          repName: callAnalyses.repName,
          audioFileUrl: callAnalyses.audioFileUrl,
          fileName: callAnalyses.fileName,
          durationSeconds: callAnalyses.durationSeconds,
          status: callAnalyses.status,
          overallScore: callAnalyses.overallScore,
          callType: callAnalyses.callType,
          customerName: callAnalyses.customerName,
          contactId: callAnalyses.contactId,
          createdAt: callAnalyses.createdAt,
          source: callAnalyses.source,
          // User fields
          agentName: users.name,
          agentEmail: users.email,
          agentTeam: users.team,
        })
        .from(callAnalyses)
        .leftJoin(users, eq(callAnalyses.userId, users.id))
        .where(whereClause)
        .orderBy(desc(callAnalyses.createdAt))
        .limit(limit)
        .offset(offset);

      // Enrich with contact phone numbers
      let enrichedRows = rows.map((row) => ({
        ...row,
        contactPhone: null as string | null,
      }));

      const contactIds = rows.filter((r) => r.contactId).map((r) => r.contactId!);
      if (contactIds.length > 0) {
        const contactRows = await db
          .select({ id: contacts.id, phone: contacts.phone, name: contacts.name })
          .from(contacts)
          .where(inArray(contacts.id, contactIds));
        const contactMap = new Map(contactRows.map((c) => [c.id, c]));
        enrichedRows = rows.map((row) => {
          const contact = row.contactId ? contactMap.get(row.contactId) : null;
          return {
            ...row,
            contactPhone: contact?.phone ?? null,
            customerName: row.customerName || contact?.name || null,
          };
        });
      }

      return {
        calls: enrichedRows.map((r) => ({
          id: r.id,
          userId: r.userId,
          repName: r.repName,
          audioFileUrl: r.audioFileUrl,
          fileName: r.fileName,
          durationSeconds: r.durationSeconds,
          status: r.status,
          overallScore: r.overallScore != null ? Math.round(r.overallScore) : null,
          callType: r.callType,
          callTypeLabel: callTypeLabel(r.callType),
          customerName: r.customerName,
          contactId: r.contactId,
          contactPhone: r.contactPhone,
          createdAt: r.createdAt,
          source: r.source,
          agentName: r.agentName ?? r.repName,
          agentEmail: r.agentEmail,
          agentTeam: r.agentTeam,
        })),
        totalCount,
        page,
        limit,
      };
    }),

  /**
   * getDashboardStats — returns the 4 summary card values.
   */
  getDashboardStats: protectedProcedure
    .input(
      z.object({
        tab: z.enum(["opening", "retention", "all"]).default("all"),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tab = input?.tab ?? "all";

      // Today's date range
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

      // Base tab condition
      const tabConditions: any[] = [];
      if (tab === "opening") {
        tabConditions.push(inArray(callAnalyses.callType, OPENING_CALL_TYPES as any));
      } else if (tab === "retention") {
        tabConditions.push(inArray(callAnalyses.callType, RETENTION_CALL_TYPES as any));
      }

      // 1. Calls below 40 score today
      const belowFortyResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(callAnalyses)
        .where(
          and(
            ...tabConditions,
            gte(callAnalyses.createdAt, todayStart),
            lte(callAnalyses.createdAt, todayEnd),
            lte(callAnalyses.overallScore, 40),
            eq(callAnalyses.status, "done"),
          )
        );
      const callsBelowForty = Number(belowFortyResult[0]?.count ?? 0);

      // 2 & 3. Weakest and strongest agent today
      const agentStatsToday = await db
        .select({
          userId: callAnalyses.userId,
          avgScore: sql<number>`ROUND(AVG(${callAnalyses.overallScore}))`,
          callCount: sql<number>`count(*)`,
        })
        .from(callAnalyses)
        .where(
          and(
            ...tabConditions,
            gte(callAnalyses.createdAt, todayStart),
            lte(callAnalyses.createdAt, todayEnd),
            eq(callAnalyses.status, "done"),
            sql`${callAnalyses.overallScore} IS NOT NULL`,
          )
        )
        .groupBy(callAnalyses.userId);

      let weakestAgent: { name: string; avgScore: number; userId: number } | null = null;
      let strongestAgent: { name: string; avgScore: number; userId: number } | null = null;

      if (agentStatsToday.length > 0) {
        const agentUserIds = agentStatsToday.map((a) => a.userId);
        const agentUsers = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, agentUserIds));
        const userNameMap = new Map(agentUsers.map((u) => [u.id, u.name ?? "Unknown"]));

        const sorted = agentStatsToday
          .map((a) => ({
            userId: a.userId,
            name: userNameMap.get(a.userId) ?? "Unknown",
            avgScore: Number(a.avgScore),
          }))
          .sort((a, b) => a.avgScore - b.avgScore);

        weakestAgent = sorted[0] ?? null;
        strongestAgent = sorted[sorted.length - 1] ?? null;

        if (sorted.length === 1) {
          strongestAgent = sorted[0];
        }
      }

      // 4. Pending analysis count
      const pendingResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(callAnalyses)
        .where(
          and(
            ...tabConditions,
            inArray(callAnalyses.status, ["pending", "transcribing", "analyzing"] as any),
          )
        );
      const pendingCount = Number(pendingResult[0]?.count ?? 0);

      return {
        callsBelowForty,
        weakestAgent,
        strongestAgent,
        pendingCount,
      };
    }),

  /**
   * getAgentsList — returns list of agents for the dropdown filter.
   */
  getAgentsList: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        team: users.team,
      })
      .from(users)
      .orderBy(users.name);

    return rows.filter((r) => r.name);
  }),

  /**
   * syncCalls — Fetch recent calls from CloudTalk (last 24 hours, with recordings,
   * duration > 2 minutes) and process them through the existing analysis pipeline.
   * Deduplicates by cloudtalkCallId.
   */
  syncCalls: protectedProcedure
    .mutation(async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dateFrom = yesterday.toISOString().split("T")[0];
      const dateTo = now.toISOString().split("T")[0];

      console.log(`[Dashboard Sync] Starting sync for ${dateFrom} to ${dateTo}`);

      // Fetch call history from CloudTalk — paginate through all pages
      let allCalls: any[] = [];
      let page = 1;
      let pageCount = 1;

      while (page <= pageCount) {
        const result = await getCallHistory({
          dateFrom,
          dateTo,
          status: "answered",
          limit: 100,
          page,
        });
        allCalls = allCalls.concat(result.calls);
        pageCount = result.pageCount;
        page++;
      }

      console.log(`[Dashboard Sync] Fetched ${allCalls.length} total calls from CloudTalk`);

      // Filter: must have recording, duration > 120 seconds (2 minutes)
      const eligibleCalls = allCalls.filter((call) => {
        const duration = call.call_times?.talking_time ?? 0;
        const hasRecording = call.recorded === true;
        return hasRecording && duration > 120;
      });

      console.log(`[Dashboard Sync] ${eligibleCalls.length} calls eligible (recorded + >2min)`);

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const call of eligibleCalls) {
        const callId = String(call.cdr_id || call.uuid || "");
        if (!callId) {
          skipped++;
          continue;
        }

        // Deduplicate
        if (await isCallAlreadyProcessed(callId)) {
          skipped++;
          continue;
        }

        try {
          // Get recording URL from CloudTalk
          const recordingUrl = `https://my.cloudtalk.io/api/calls/recording/${call.cdr_id}.json`;

          // Fetch the actual recording URL via the API
          const keyId = process.env.CLOUDTALK_API_KEY_ID;
          const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;
          if (!keyId || !keySecret) throw new Error("CloudTalk API credentials not configured");
          const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

          const recRes = await fetch(recordingUrl, {
            headers: { Authorization: authHeader },
          });

          if (!recRes.ok) {
            console.warn(`[Dashboard Sync] Failed to get recording for call ${callId}: ${recRes.status}`);
            skipped++;
            continue;
          }

          // Check content type — if it's audio, download directly; if JSON, extract URL
          const contentType = recRes.headers.get("content-type") ?? "";
          let audioBuffer: Buffer;
          let audioContentType: string;

          if (contentType.includes("audio") || contentType.includes("wav") || contentType.includes("mpeg")) {
            audioBuffer = Buffer.from(await recRes.arrayBuffer());
            audioContentType = contentType;
          } else {
            // JSON response with redirect URL
            const recJson = await recRes.json() as any;
            const audioUrl = recJson?.responseData?.url ?? recJson?.url ?? null;
            if (!audioUrl) {
              console.warn(`[Dashboard Sync] No audio URL in recording response for call ${callId}`);
              skipped++;
              continue;
            }
            const audioRes = await fetch(audioUrl);
            if (!audioRes.ok) {
              console.warn(`[Dashboard Sync] Failed to download audio for call ${callId}`);
              skipped++;
              continue;
            }
            audioBuffer = Buffer.from(await audioRes.arrayBuffer());
            audioContentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
          }

          // Upload to S3
          const ext = audioContentType.includes("wav") ? "wav" : "mp3";
          const fileKey = `call-recordings/sync-${callId}-${Date.now()}.${ext}`;
          const { url: fileUrl } = await storagePut(fileKey, audioBuffer, audioContentType);

          // Find or create the agent user
          const agentId = call.agent?.id;
          const agentName = call.agent?.name ?? null;
          const agentEmail = call.agent?.email ?? null;
          let agent = agentId
            ? await findOrCreateAgentUser(agentId, agentName, agentEmail)
            : null;

          if (!agent) {
            const db = await getDb();
            if (db) {
              const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
              agent = admins[0] ?? null;
            }
          }

          if (!agent) {
            console.warn(`[Dashboard Sync] No agent found for call ${callId} — skipping`);
            skipped++;
            continue;
          }

          // Find contact by phone
          const callerPhone = call.contact?.number ?? null;
          const contact = callerPhone ? await findContactByPhone(callerPhone) : null;

          // Stripe customer name lookup
          let customerName: string | undefined;
          if (callerPhone) {
            const stripeName = await lookupStripeCustomerName(callerPhone);
            if (stripeName) customerName = stripeName;
          }

          // Determine initial callType based on agent team
          const isRetentionAgent = (agent as any).team === "retention";
          const initialCallType = isRetentionAgent ? "other" : "cold_call";

          const repName = agentName || (agent as any).name || null;

          // Create analysis record
          const analysisId = await createCallAnalysisRecord({
            userId: agent.id,
            repName,
            audioFileKey: fileKey,
            audioFileUrl: fileUrl,
            fileName: `cloudtalk-sync-${callId}.mp3`,
            callDate: call.date ? new Date(call.date) : new Date(),
            source: "webhook",
            cloudtalkCallId: callId,
            contactId: contact?.id ?? null,
            callType: initialCallType,
          } as any);

          console.log(`[Dashboard Sync] Created analysis #${analysisId} for call ${callId}`);

          // Kick off async analysis (don't await)
          processCallAnalysis(analysisId, fileUrl).catch((err) => {
            console.error(`[Dashboard Sync] Analysis #${analysisId} failed:`, err);
          });

          synced++;
        } catch (err: any) {
          console.error(`[Dashboard Sync] Error processing call ${callId}:`, err?.message ?? err);
          errors++;
        }
      }

      console.log(`[Dashboard Sync] Done. Synced: ${synced}, Skipped: ${skipped}, Errors: ${errors}`);

      return {
        totalFetched: allCalls.length,
        eligible: eligibleCalls.length,
        synced,
        skipped,
        errors,
      };
    }),
});
