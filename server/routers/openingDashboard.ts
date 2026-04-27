/**
 * Opening Agents Dashboard tRPC Router
 *
 * Aggregates data from:
 *  1. form_submissions DB table — Free Trials (£4.95 payments with agentName)
 *  2. CloudTalk API — Working Days (days with ≥1 call) and Daily Openings (total calls)
 *  3. Stripe API — Cancelled Trials (subscriptions/payments that were cancelled)
 *
 * Agent matching strategy:
 *  - Load all users with team='opening' from the DB (these are the real agent records)
 *  - Match CloudTalk agents by EMAIL (reliable identifier — CloudTalk names are nicknames)
 *  - Match form_submissions by agentName (case-insensitive fuzzy match against users.name)
 *  - Display the user's real name from the users table
 *
 * Admin-only endpoints.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { formSubmissions, users } from "../../drizzle/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { ENV } from "../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRow {
  agentName: string;       // real name from users table
  agentEmail: string;      // email from users table
  dailyOpenings: number;   // total calls from CloudTalk
  aveDays: number;         // dailyOpenings / workingDays
  cancelledTrials: number; // from Stripe
  workingDays: number;     // days with ≥1 call from CloudTalk
  freeTrials: number;      // count of processed form_submissions
  cancellationPct: number; // cancelledTrials / freeTrials * 100
}

interface OpeningAgent {
  id: number;
  name: string;
  email: string;
  cloudtalkAgentId: string | null;
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

interface CloudTalkCallSummary {
  agentEmail: string;       // reliable identifier
  agentFullName: string;    // CloudTalk display name (may be nickname)
  date: string;             // YYYY-MM-DD (local date from timestamp)
}

/**
 * Fetch all calls from CloudTalk for a given date range.
 * Paginates through all pages with limit=100.
 * Uses user_id filter per-agent when possible (much faster).
 */
async function fetchCloudTalkCalls(
  dateFrom: string,
  dateTo: string
): Promise<CloudTalkCallSummary[]> {
  const cacheKey = `cloudtalk:calls:${dateFrom}:${dateTo}`;
  const cached = getCached<CloudTalkCallSummary[]>(cacheKey);
  if (cached) return cached;

  const auth = getCloudTalkAuth();
  const results: CloudTalkCallSummary[] = [];
  let page = 1;
  const limit = 100;

  try {
    while (true) {
      const params = new URLSearchParams({
        limit: String(limit),
        page: String(page),
        date_from: `${dateFrom} 00:00:00`,
        date_to: `${dateTo} 23:59:59`,
      });

      const url = `${CLOUDTALK_BASE}/calls/index.json?${params.toString()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        headers: { Authorization: auth, "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error(`[OpeningDashboard] CloudTalk calls page ${page} error: ${res.status}`);
        break;
      }

      const json = (await res.json()) as any;
      const data = json?.responseData ?? {};
      const calls = data?.data ?? [];
      const pageCount = data?.pageCount ?? 1;

      for (const item of calls) {
        const agent = item?.Agent ?? {};
        const cdr = item?.Cdr ?? {};
        const startedAt: string = cdr?.started_at ?? "";
        // Extract date portion — CloudTalk returns ISO with timezone offset
        // e.g. "2026-04-01T09:30:00+02:00" → take first 10 chars
        const date = startedAt ? startedAt.substring(0, 10) : "";
        const email = (agent.email ?? "").toLowerCase().trim();
        if (date && email) {
          results.push({
            agentEmail: email,
            agentFullName: (agent.fullname ?? `${agent.firstname ?? ""} ${agent.lastname ?? ""}`).trim(),
            date,
          });
        }
      }

      if (page >= pageCount || calls.length === 0) break;
      page++;
    }
  } catch (err: any) {
    console.error("[OpeningDashboard] CloudTalk fetch error:", err?.message ?? err);
  }

  setCached(cacheKey, results);
  return results;
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
 * Falls back to agentName if email not in metadata.
 */
async function fetchStripeCancellations(
  dateFrom: string,
  dateTo: string
): Promise<{ byEmail: Record<string, number>; byName: Record<string, number> }> {
  const cacheKey = `stripe:cancellations:v2:${dateFrom}:${dateTo}`;
  const cached = getCached<{ byEmail: Record<string, number>; byName: Record<string, number> }>(cacheKey);
  if (cached) return cached;

  const stripe = getStripe();
  const fromTs = Math.floor(new Date(dateFrom + "T00:00:00Z").getTime() / 1000);
  const toTs = Math.floor(new Date(dateTo + "T23:59:59Z").getTime() / 1000);

  const byEmail: Record<string, number> = {};
  const byName: Record<string, number> = {};

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
        const agentEmail = (sub.metadata?.agentEmail ?? "").toLowerCase().trim();
        const agentName = (sub.metadata?.agentName ?? "").trim();
        if (agentEmail) {
          byEmail[agentEmail] = (byEmail[agentEmail] ?? 0) + 1;
        } else if (agentName) {
          byName[agentName] = (byName[agentName] ?? 0) + 1;
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
          if (agentEmail) {
            byEmail[agentEmail] = (byEmail[agentEmail] ?? 0) + 1;
          } else if (agentName) {
            byName[agentName] = (byName[agentName] ?? 0) + 1;
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

  const result = { byEmail, byName };
  setCached(cacheKey, result);
  return result;
}

// ─── Name matching helper ─────────────────────────────────────────────────────

/**
 * Fuzzy-match a name from form_submissions against a list of known agent names.
 * Returns the matched agent's email, or null if no match.
 *
 * Strategy:
 *  1. Exact match (case-insensitive)
 *  2. First name match (e.g. "Debbie" matches "Debbie Holmes")
 *  3. Partial match (one name contains the other)
 */
function matchAgentNameToEmail(
  submittedName: string,
  agents: OpeningAgent[]
): string | null {
  const norm = (s: string) => s.toLowerCase().trim();
  const sn = norm(submittedName);
  if (!sn) return null;

  // 1. Exact match
  for (const a of agents) {
    if (norm(a.name) === sn) return a.email;
  }

  // 2. First name match
  const sFirst = sn.split(/\s+/)[0];
  for (const a of agents) {
    const aFirst = norm(a.name).split(/\s+/)[0];
    if (aFirst === sFirst) return a.email;
  }

  // 3. Partial containment
  for (const a of agents) {
    const an = norm(a.name);
    if (an.includes(sn) || sn.includes(an)) return a.email;
  }

  return null;
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
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
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
   * CloudTalk data is matched by agent email (reliable identifier).
   * form_submissions data is matched by agentName (fuzzy match to users.name).
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
        agentFilter: z.string().optional(), // "all" or specific agent email
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

      const db = await getDb();

      // ── 0. Load opening agents from users table ──────────────────────────
      let openingAgents: OpeningAgent[] = [];
      if (db) {
        try {
          const rows = await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              cloudtalkAgentId: users.cloudtalkAgentId,
            })
            .from(users)
            .where(eq(users.team, "opening"));

          openingAgents = rows
            .filter((r) => r.name && r.email)
            .map((r) => ({
              id: r.id,
              name: (r.name ?? "").trim(),
              email: (r.email ?? "").toLowerCase().trim(),
              cloudtalkAgentId: r.cloudtalkAgentId ?? null,
            }));
        } catch (err: any) {
          console.error("[OpeningDashboard] Users query error:", err?.message ?? err);
        }
      }

      // ── 1. Free Trials from form_submissions DB ──────────────────────────
      // Keyed by agent email (after fuzzy-matching agentName → email)
      const trialsByEmail: Record<string, number> = {};

      if (db) {
        try {
          const fromDate = new Date(dateFrom + "T00:00:00.000Z");
          const toDate = new Date(dateTo + "T23:59:59.999Z");

          const rows = await db
            .select({
              agentName: formSubmissions.agentName,
              count: sql<number>`count(*)`,
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
            const submittedName = (row.agentName ?? "").trim();
            if (!submittedName) continue;

            // Try to match to a known opening agent
            const matchedEmail = matchAgentNameToEmail(submittedName, openingAgents);
            if (matchedEmail) {
              trialsByEmail[matchedEmail] = (trialsByEmail[matchedEmail] ?? 0) + Number(row.count);
            } else {
              // Store under a synthetic email key so we don't lose data
              const syntheticKey = `__unmatched__${submittedName.toLowerCase()}`;
              trialsByEmail[syntheticKey] = (trialsByEmail[syntheticKey] ?? 0) + Number(row.count);
              console.warn(`[OpeningDashboard] Could not match agentName "${submittedName}" to any opening agent`);
            }
          }
        } catch (err: any) {
          console.error("[OpeningDashboard] DB query error:", err?.message ?? err);
        }
      }

      // ── 2. CloudTalk calls — keyed by agent email ────────────────────────
      const allCalls = await fetchCloudTalkCalls(dateFrom, dateTo);

      const callsByEmail: Record<
        string,
        { totalCalls: number; workingDays: Set<string> }
      > = {};

      for (const call of allCalls) {
        const email = call.agentEmail;
        if (!email) continue;
        if (!callsByEmail[email]) {
          callsByEmail[email] = { totalCalls: 0, workingDays: new Set() };
        }
        callsByEmail[email].totalCalls++;
        if (call.date) callsByEmail[email].workingDays.add(call.date);
      }

      // ── 3. Stripe cancellations ───────────────────────────────────────────
      const stripeCancellations = await fetchStripeCancellations(dateFrom, dateTo);

      // ── 4. Merge — use opening agents as the source of truth ─────────────
      // Build rows for all opening agents, plus any unmatched CloudTalk agents
      // that appear in the calls data (they may not be in users table yet).

      // Collect emails that appear in CloudTalk but not in users table
      const knownEmails = new Set(openingAgents.map((a) => a.email));
      const unknownCloudTalkAgents: OpeningAgent[] = [];

      for (const email of Object.keys(callsByEmail)) {
        if (!knownEmails.has(email)) {
          // Find their name from the calls data
          const ctName = allCalls.find((c) => c.agentEmail === email)?.agentFullName ?? email;
          unknownCloudTalkAgents.push({
            id: -1,
            name: ctName,
            email,
            cloudtalkAgentId: null,
          });
        }
      }

      const allAgents = [...openingAgents, ...unknownCloudTalkAgents];

      const rows: AgentRow[] = [];

      for (const agent of allAgents) {
        const email = agent.email;

        const freeTrials = trialsByEmail[email] ?? 0;
        const ctData = callsByEmail[email];
        const dailyOpenings = ctData?.totalCalls ?? 0;
        const workingDays = ctData ? Array.from(ctData.workingDays).length : 0;
        const aveDays =
          workingDays > 0 ? Math.round((dailyOpenings / workingDays) * 100) / 100 : 0;

        // Cancellations: prefer email match, fall back to name match
        const cancelledTrials =
          (stripeCancellations.byEmail[email] ?? 0) +
          (stripeCancellations.byName[agent.name] ?? 0);

        const cancellationPct =
          freeTrials > 0
            ? Math.round((cancelledTrials / freeTrials) * 1000) / 10
            : 0;

        // Skip agents with zero data in all categories
        if (freeTrials === 0 && dailyOpenings === 0 && cancelledTrials === 0) continue;

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

      // Sort by freeTrials descending, then by dailyOpenings
      rows.sort((a, b) => b.freeTrials - a.freeTrials || b.dailyOpenings - a.dailyOpenings);

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
        // Return agents as {name, email} for the filter dropdown
        allAgents: rows.map((r) => ({ name: r.agentName, email: r.agentEmail })),
      };
    }),
});
