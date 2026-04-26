/**
 * Opening Agents Dashboard tRPC Router
 *
 * Aggregates data from:
 *  1. form_submissions DB table — Free Trials (£4.95 payments with agentName)
 *  2. CloudTalk API — Working Days (days with ≥1 call) and Daily Openings (total calls)
 *  3. Stripe API — Cancelled Trials (subscriptions/payments that were cancelled)
 *
 * Admin-only endpoints.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { formSubmissions } from "../../drizzle/schema";
import { and, gte, lte, sql } from "drizzle-orm";
import Stripe from "stripe";
import { ENV } from "../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRow {
  agentName: string;
  dailyOpenings: number;   // total calls from CloudTalk
  aveDays: number;         // dailyOpenings / workingDays
  cancelledTrials: number; // from Stripe
  workingDays: number;     // days with ≥1 call from CloudTalk
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

interface CloudTalkCallSummary {
  agentFullName: string;
  agentEmail: string;
  date: string; // YYYY-MM-DD
}

/**
 * Fetch all calls from CloudTalk for a given date range.
 * Paginates through all pages.
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
  const limit = 200;

  try {
    while (true) {
      const url = `${CLOUDTALK_BASE}/calls/index.json?limit=${limit}&offset=${(page - 1) * limit}&date_from=${dateFrom}&date_to=${dateTo}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

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

      for (const item of calls) {
        const agent = item?.Agent ?? {};
        const cdr = item?.Cdr ?? {};
        const startedAt = cdr?.started_at ?? "";
        // Extract date portion YYYY-MM-DD
        const date = startedAt ? startedAt.substring(0, 10) : "";
        if (date) {
          results.push({
            agentFullName: `${agent.firstname ?? ""} ${agent.lastname ?? ""}`.trim(),
            agentEmail: agent.email ?? "",
            date,
          });
        }
      }

      const pageCount = data?.pageCount ?? 1;
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
 * Returns a map of agentName -> cancelledCount.
 * We look at PaymentIntents with metadata.agentName that were for £4.95
 * and whose associated subscription was cancelled.
 *
 * Strategy: fetch all subscriptions with status=canceled in the period,
 * look at their metadata for agentName.
 */
async function fetchStripeCancellations(
  dateFrom: string,
  dateTo: string
): Promise<Record<string, number>> {
  const cacheKey = `stripe:cancellations:${dateFrom}:${dateTo}`;
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
        const agentName = (sub.metadata?.agentName ?? "").trim();
        if (agentName) {
          agentCancellations[agentName] = (agentCancellations[agentName] ?? 0) + 1;
        }
      }

      hasMore = subs.has_more;
      if (subs.data.length > 0) {
        startingAfter = subs.data[subs.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    // Also check PaymentIntents for £4.95 that were canceled (covers non-subscription cancellations)
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
          const agentName = (pi.metadata?.agentName ?? "").trim();
          if (agentName) {
            agentCancellations[agentName] = (agentCancellations[agentName] ?? 0) + 1;
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
      // Default: this month
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: fmt(start), dateTo: fmt(now) };
    }
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const openingDashboardRouter = router({
  /**
   * Get Opening Dashboard data — aggregated per agent.
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
        agentFilter: z.string().optional(), // "all" or specific agent name
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

      // ── 1. Free Trials from form_submissions DB ──────────────────────────
      const db = await getDb();
      let trialsByAgent: Record<string, number> = {};

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
            const name = (row.agentName ?? "Unknown").trim();
            trialsByAgent[name] = Number(row.count);
          }
        } catch (err: any) {
          console.error("[OpeningDashboard] DB query error:", err?.message ?? err);
        }
      }

      // ── 2. CloudTalk calls ────────────────────────────────────────────────
      const allCalls = await fetchCloudTalkCalls(dateFrom, dateTo);

      // Build per-agent: total calls + unique working days
      const callsByAgent: Record<
        string,
        { totalCalls: number; workingDays: Set<string>; email: string }
      > = {};

      for (const call of allCalls) {
        const name = call.agentFullName || "Unknown";
        if (!callsByAgent[name]) {
          callsByAgent[name] = { totalCalls: 0, workingDays: new Set(), email: call.agentEmail };
        }
        callsByAgent[name].totalCalls++;
        if (call.date) callsByAgent[name].workingDays.add(call.date);
      }

      // ── 3. Stripe cancellations ───────────────────────────────────────────
      const cancellationsByAgent = await fetchStripeCancellations(dateFrom, dateTo);

      // ── 4. Merge all agents ───────────────────────────────────────────────
      // Collect all unique agent names from all sources
       const allAgentNamesSet = new Set<string>([
        ...Object.keys(trialsByAgent),
        ...Object.keys(callsByAgent),
        ...Object.keys(cancellationsByAgent),
      ]);
      const allAgentNames: string[] = Array.from(allAgentNamesSet);
      // Remove empty/unknown if they have no meaningful data
      const rows: AgentRow[] = [];
      for (const name of allAgentNames) {
        if (!name || name === "Unknown" || name === "") continue;

        const freeTrials = trialsByAgent[name] ?? 0;
        const ctData = callsByAgent[name];
        const dailyOpenings = ctData?.totalCalls ?? 0;
        const workingDays = ctData ? Array.from(ctData.workingDays).length : 0;
        const aveDays =
          workingDays > 0 ? Math.round((dailyOpenings / workingDays) * 100) / 100 : 0;
        const cancelledTrials = cancellationsByAgent[name] ?? 0;
        const cancellationPct =
          freeTrials > 0
            ? Math.round((cancelledTrials / freeTrials) * 1000) / 10
            : 0;

        rows.push({
          agentName: name,
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

      // Apply agent filter
      const filteredRows =
        input.agentFilter && input.agentFilter !== "all"
          ? rows.filter((r) => r.agentName === input.agentFilter)
          : rows;

      const totalTrials = filteredRows.reduce((sum, r) => sum + r.freeTrials, 0);

      return {
        rows: filteredRows,
        totalTrials,
        dateFrom,
        dateTo,
        allAgentNames: rows.map((r) => r.agentName),
      };
    }),
});
