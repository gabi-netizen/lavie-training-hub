import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { callAnalyses, users, contacts } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, like, or, desc, inArray } from "drizzle-orm";

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
        // We'll handle this via a subquery
        const teamUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.team, team));
        const teamUserIds = teamUsers.map((u) => u.id);
        if (teamUserIds.length > 0) {
          conditions.push(inArray(callAnalyses.userId, teamUserIds));
        } else {
          // No users in this team — return empty
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

      // If search includes phone, also try to match via contacts
      let enrichedRows = rows.map((row) => ({
        ...row,
        contactPhone: null as string | null,
      }));

      // Enrich with contact phone numbers if contacts are linked
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
        // Get user names
        const agentUserIds = agentStatsToday.map((a) => a.userId);
        const agentUsers = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, agentUserIds));
        const userNameMap = new Map(agentUsers.map((u) => [u.id, u.name ?? "Unknown"]));

        // Sort by avg score
        const sorted = agentStatsToday
          .map((a) => ({
            userId: a.userId,
            name: userNameMap.get(a.userId) ?? "Unknown",
            avgScore: Number(a.avgScore),
          }))
          .sort((a, b) => a.avgScore - b.avgScore);

        weakestAgent = sorted[0] ?? null;
        strongestAgent = sorted[sorted.length - 1] ?? null;

        // If only one agent, they are both weakest and strongest
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
   * Includes team info for filtering.
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
});
