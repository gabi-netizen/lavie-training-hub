/**
 * Opening Agents Dashboard tRPC Router
 *
 * Aggregates data from:
 *  1. users DB table — source of truth for Opening agents (team='opening')
 *  2. form_submissions DB table — Free Trials (£4.95 payments with agentName)
 *  3. CloudTalk API — Working Days and Daily Openings (total calls)
 *     Working Day = a day where (last call started_at) - (first call started_at) >= 6 hours
 *  4. Stripe API — Cancelled Trials (subscriptions/payments that were cancelled)
 *
 * Agent matching: by EMAIL across all systems (CloudTalk agent email = users.email)
 * Admin-only endpoints.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { formSubmissions, users } from "../../drizzle/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import Stripe from "stripe";
import { ENV } from "../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRow {
  agentName: string;
  agentEmail: string;
  dailyOpenings: number;   // total calls from CloudTalk
  aveDays: number;         // dailyOpenings / workingDays
  cancelledTrials: number; // from Stripe
  workingDays: number;     // days where first→last call span >= 6 hours
  freeTrials: number;      // count of processed form_submissions
  cancellationPct: number; // cancelledTrials / freeTrials * 100
}

// ─── In-memory cache (5-minute TTL) ──────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── CloudTalk helpers ────────────────────────────────────────────────────────

const CLOUDTALK_BASE = "https://my.cloudtalk.io/api";

function getCloudTalkAuth(): string {
  const keyId = ENV.cloudTalkApiKeyId;
  const keySecret = ENV.cloudTalkApiKeySecret;
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

interface CloudTalkCallRecord {
  agentEmail: string;
  startedAt: string; // ISO 8601 datetime string from CloudTalk
}

/**
 * Fetch all calls from CloudTalk for a given date range.
 * Uses user_id filter per agent for efficiency.
 * Returns raw call records with agent email and started_at timestamp.
 */
async function fetchCloudTalkCallsForAgents(
  dateFrom: string,
  dateTo: string,
  agentUserIds: Map<string, string> // email -> cloudtalk user_id
): Promise<CloudTalkCallRecord[]> {
  const cacheKey = `cloudtalk:calls:v2:${dateFrom}:${dateTo}`;
  const cached = getCached<CloudTalkCallRecord[]>(cacheKey);
  if (cached) return cached;

  const auth = getCloudTalkAuth();
  const results: CloudTalkCallRecord[] = [];

  // Fetch calls per agent using user_id filter (much more efficient than scanning all calls)
  for (const [email, userId] of Array.from(agentUserIds.entries())) {
    let page = 1;
    try {
      while (true) {
        const url = new URL(`${CLOUDTALK_BASE}/calls/index.json`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("page", String(page));
        url.searchParams.set("date_from", dateFrom);
        url.searchParams.set("date_to", dateTo);
        url.searchParams.set("user_id", userId);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url.toString(), {
          headers: { Authorization: auth, "Content-Type": "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          console.error(`[OpeningDashboard] CloudTalk calls error for ${email}: ${res.status}`);
          break;
        }

        const json = (await res.json()) as any;
        const calls: any[] = json?.responseData?.data ?? [];

        for (const item of calls) {
          const cdr = item?.Cdr ?? {};
          const startedAt = cdr?.started_at ?? "";
          if (startedAt) {
            results.push({ agentEmail: email, startedAt });
          }
        }

        if (calls.length < 100) break;
        page++;
        if (page > 300) break; // safety limit
      }
    } catch (err: any) {
      console.error(`[OpeningDashboard] CloudTalk fetch error for ${email}:`, err?.message ?? err);
    }
  }

  setCached(cacheKey, results);
  return results;
}

/**
 * Fetch all CloudTalk agents and return a map of email (lowercase) -> user_id.
 */
async function fetchCloudTalkAgentIds(): Promise<Map<string, string>> {
  const cacheKey = "cloudtalk:agents:v2";
  const cached = getCached<Map<string, string>>(cacheKey);
  if (cached) return cached;

  const auth = getCloudTalkAuth();
  const emailToId = new Map<string, string>();

  try {
    const res = await fetch(`${CLOUDTALK_BASE}/agents/index.json?limit=200`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const agents: any[] = json?.responseData?.data ?? [];
      for (const agent of agents) {
        const email = (agent?.Agent?.email ?? agent?.email ?? "").toLowerCase().trim();
        const id = String(agent?.Agent?.id ?? agent?.id ?? "");
        if (email && id) emailToId.set(email, id);
      }
    }
  } catch (err: any) {
    console.error("[OpeningDashboard] CloudTalk agents fetch error:", err?.message ?? err);
  }

  setCached(cacheKey, emailToId);
  return emailToId;
}

/**
 * Calculate working days per agent from call records.
 * Working Day = a day where (last call started_at) - (first call started_at) >= 6 hours.
 * Returns a map of agentEmail -> { workingDays, totalCalls }
 */
function calculateWorkingDays(
  calls: CloudTalkCallRecord[]
): Map<string, { workingDays: number; totalCalls: number }> {
  // Group calls by agent email, then by date
  const byAgentByDay = new Map<string, Map<string, Date[]>>();

  for (const call of calls) {
    const email = call.agentEmail.toLowerCase();
    let dt: Date;
    try {
      dt = new Date(call.startedAt);
      if (isNaN(dt.getTime())) continue;
    } catch {
      continue;
    }

    // Use UTC date as the day key to be consistent
    const dateKey = dt.toISOString().substring(0, 10);

    if (!byAgentByDay.has(email)) byAgentByDay.set(email, new Map());
    const agentDays = byAgentByDay.get(email)!;
    if (!agentDays.has(dateKey)) agentDays.set(dateKey, []);
    agentDays.get(dateKey)!.push(dt);
  }

  const result = new Map<string, { workingDays: number; totalCalls: number }>();

  for (const [agentEmail, dayMap] of Array.from(byAgentByDay.entries())) {
    let workingDays = 0;
    let totalCalls = 0;

    for (const [, timestamps] of Array.from(dayMap.entries())) {
      totalCalls += timestamps.length;
      const sorted = timestamps.slice().sort((a: Date, b: Date) => a.getTime() - b.getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const spanHours = (last.getTime() - first.getTime()) / (1000 * 60 * 60);
      if (spanHours >= 6) {
        workingDays++;
      }
    }

    result.set(agentEmail, { workingDays, totalCalls });
  }

  return result;
}

// ─── Stripe helpers ───────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-04-22.dahlia" });
  }
  return _stripe;
}

/**
 * Count cancelled Stripe subscriptions in the date range.
 * Returns a map of agentEmail (lowercase) -> cancelledCount.
 */
async function fetchStripeCancellations(
  dateFrom: string,
  dateTo: string
): Promise<Record<string, number>> {
  const cacheKey = `stripe:cancellations:v2:${dateFrom}:${dateTo}`;
  const cached = getCached<Record<string, number>>(cacheKey);
  if (cached) return cached;

  const stripe = getStripe();
  const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000);
  const toTs = Math.floor(new Date(dateTo + "T23:59:59Z").getTime() / 1000);

  const agentCancellations: Record<string, number> = {};

  try {
    // Fetch cancelled subscriptions in the period
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        status: "canceled",
        limit: 100,
        created: { gte: fromTs, lte: toTs },
      };
      if (startingAfter) params.starting_after = startingAfter;

      const subs = await stripe.subscriptions.list(params);

      for (const sub of subs.data) {
        // Try agentEmail first, fall back to agentName
        const agentEmail = (sub.metadata?.agentEmail ?? "").toLowerCase().trim();
        const agentName = (sub.metadata?.agentName ?? "").trim();
        const key = agentEmail || agentName;
        if (key) {
          agentCancellations[key] = (agentCancellations[key] ?? 0) + 1;
        }
      }

      hasMore = subs.has_more;
      if (subs.data.length > 0) {
        startingAfter = subs.data[subs.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    // Also check PaymentIntents for £4.95 that were canceled
    hasMore = true;
    startingAfter = undefined;
    while (hasMore) {
      const params: Stripe.PaymentIntentListParams = {
        limit: 100,
        created: { gte: fromTs, lte: toTs },
      };
      if (startingAfter) params.starting_after = startingAfter;

      const pis = await stripe.paymentIntents.list(params);

      for (const pi of pis.data) {
        if (pi.amount === 495 && pi.status === "canceled") {
          const agentEmail = (pi.metadata?.agentEmail ?? "").toLowerCase().trim();
          const agentName = (pi.metadata?.agentName ?? "").trim();
          const key = agentEmail || agentName;
          if (key) {
            agentCancellations[key] = (agentCancellations[key] ?? 0) + 1;
          }
        }
      }

      hasMore = pis.has_more;
      if (pis.data.length > 0) {
        startingAfter = pis.data[pis.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }
  } catch (err: any) {
    console.error("[OpeningDashboard] Stripe fetch error:", err?.message ?? err);
  }

  setCached(cacheKey, agentCancellations);
  return agentCancellations;
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function getDateRange(
  timeline: string,
  customFrom?: string,
  customTo?: string
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (timeline) {
    case "today": {
      const s = fmt(now);
      return { dateFrom: s, dateTo: s };
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = fmt(y);
      return { dateFrom: s, dateTo: s };
    }
    case "this_week": {
      const day = now.getDay(); // 0=Sun
      const diff = day === 0 ? 6 : day - 1; // Mon as start
      const start = new Date(now);
      start.setDate(now.getDate() - diff);
      return { dateFrom: fmt(start), dateTo: fmt(now) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: fmt(start), dateTo: fmt(now) };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    }
    case "last_3_months": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { dateFrom: fmt(start), dateTo: fmt(now) };
    }
    case "custom": {
      return {
        dateFrom: customFrom ?? fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        dateTo: customTo ?? fmt(now),
      };
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: fmt(start), dateTo: fmt(now) };
    }
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const openingDashboardRouter = router({
  /**
   * Get Opening Dashboard data — aggregated per agent.
   * Agents are sourced from the users table (team='opening').
   * Matched to CloudTalk by email. Display name from users.name.
   */
  getDashboardData: adminProcedure
    .input(
      z.object({
        timeline: z
          .enum([
            "today",
            "yesterday",
            "this_week",
            "this_month",
            "last_month",
            "last_3_months",
            "custom",
          ])
          .default("this_month"),
        agentFilter: z.string().optional(), // agent email or undefined for all
        customDateFrom: z.string().optional(),
        customDateTo: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = getDateRange(
        input.timeline,
        input.customDateFrom,
        input.customDateTo
      );

      // ── 1. Load Opening agents from users table ──────────────────────────
      const db = await getDb();
      let openingAgents: { name: string; email: string }[] = [];

      if (db) {
        try {
          const agentRows = await db
            .select({ name: users.name, email: users.email })
            .from(users)
            .where(eq(users.team, "opening"));

          openingAgents = agentRows
            .filter((r) => r.email)
            .map((r) => ({
              name: r.name ?? r.email ?? "Unknown",
              email: (r.email ?? "").toLowerCase().trim(),
            }));
        } catch (err: any) {
          console.error("[OpeningDashboard] Users query error:", err?.message ?? err);
        }
      }

      // ── 2. Free Trials from form_submissions DB ──────────────────────────
      // form_submissions has agentName (not email), so we match by name
      // Build a name→email map from openingAgents for reverse lookup
      const nameToEmail = new Map<string, string>();
      for (const agent of openingAgents) {
        nameToEmail.set(agent.name.toLowerCase().trim(), agent.email);
      }

      const trialsByEmail: Record<string, number> = {};

      if (db) {
        try {
          const fromDate = new Date(dateFrom + "T00:00:00.000Z");
          const toDate = new Date(dateTo + "T23:59:59.999Z");

          const rows = await db
            .select({
              agentName: formSubmissions.agentName,
              count: sql<number>`COUNT(*)`,
            })
            .from(formSubmissions)
            .where(
              and(
                gte(formSubmissions.createdAt, fromDate),
                lte(formSubmissions.createdAt, toDate)
              )
            )
            .groupBy(formSubmissions.agentName);

          for (const row of rows) {
            const rawName = (row.agentName ?? "").trim();
            if (!rawName) continue;

            // Try exact match first, then case-insensitive
            let email =
              nameToEmail.get(rawName.toLowerCase()) ??
              // Fuzzy: check if any agent name starts with the submission name or vice versa
              (() => {
                for (const [agentName, agentEmail] of Array.from(nameToEmail.entries())) {
                  if (
                    agentName.includes(rawName.toLowerCase()) ||
                    rawName.toLowerCase().includes(agentName)
                  ) {
                    return agentEmail;
                  }
                }
                return null;
              })();

            if (email) {
              trialsByEmail[email] = (trialsByEmail[email] ?? 0) + Number(row.count);
            }
          }
        } catch (err: any) {
          console.error("[OpeningDashboard] DB query error:", err?.message ?? err);
        }
      }

      // ── 3. CloudTalk: fetch agent IDs and calls ───────────────────────────
      const cloudTalkAgentIds = await fetchCloudTalkAgentIds();

      // Build email→userId map for opening agents only
      const openingAgentUserIds = new Map<string, string>();
      for (const agent of openingAgents) {
        const userId = cloudTalkAgentIds.get(agent.email);
        if (userId) {
          openingAgentUserIds.set(agent.email, userId);
        }
      }

      // Fetch calls for all opening agents
      const allCalls = await fetchCloudTalkCallsForAgents(
        dateFrom,
        dateTo,
        openingAgentUserIds
      );

      // Calculate working days with 6-hour span rule
      const ctStats = calculateWorkingDays(allCalls);

      // ── 4. Stripe cancellations ───────────────────────────────────────────
      const cancellationsByKey = await fetchStripeCancellations(dateFrom, dateTo);

      // ── 5. Merge all data per agent ───────────────────────────────────────
      const rows: AgentRow[] = [];

      for (const agent of openingAgents) {
        const email = agent.email;

        const freeTrials = trialsByEmail[email] ?? 0;
        const ctData = ctStats.get(email);
        const dailyOpenings = ctData?.totalCalls ?? 0;
        const workingDays = ctData?.workingDays ?? 0;
        const aveDays =
          workingDays > 0
            ? Math.round((dailyOpenings / workingDays) * 100) / 100
            : 0;

        // Stripe cancellations: try by email first, then by agent name
        const cancelledTrials =
          cancellationsByKey[email] ??
          cancellationsByKey[agent.name.toLowerCase()] ??
          cancellationsByKey[agent.name] ??
          0;

        const cancellationPct =
          freeTrials > 0
            ? Math.round((cancelledTrials / freeTrials) * 1000) / 10
            : 0;

        rows.push({
          agentName: agent.name,
          agentEmail: email,
          dailyOpenings,
          aveDays,
          cancelledTrials,
          workingDays,
          freeTrials,
          cancellationPct,
        });
      }

      // Sort by freeTrials descending
      rows.sort((a, b) => b.freeTrials - a.freeTrials);

      // Apply agent filter (by email)
      const filteredRows =
        input.agentFilter && input.agentFilter !== "all"
          ? rows.filter((r) => r.agentEmail === input.agentFilter)
          : rows;

      const totalTrials = filteredRows.reduce((sum, r) => sum + r.freeTrials, 0);

      return {
        rows: filteredRows,
        totalTrials,
        dateFrom,
        dateTo,
        allAgents: rows.map((r) => ({ name: r.agentName, email: r.agentEmail })),
      };
    }),
});
