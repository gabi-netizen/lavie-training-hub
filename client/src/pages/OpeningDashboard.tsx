/**
 * Opening Agents Dashboard
 *
 * Shows performance data for Opening team agents (sales agents who make cold
 * calls to sell Free Trials at £4.95).
 *
 * Displays:
 * - Top banner: Total Trials for the month
 * - Six cards: Total Trials, Still in Trial, Matured, Conversion Rate %, Best Agent, Cancelled After Payment
 * - Table: Agent performance with columns: #, Agent, Trials, Matured, Converted, Conv%, Lost
 * - Expandable rows: Show detail breakdown (Live Sub, Saved by Retention, Cancelled After Payment, etc.)
 *
 * Data: Hardcoded April 2026 (no backend API yet)
 * Excludes: Rob and Guy (Retention agents)
 *
 * Admin-only page.
 */
import { useState, useMemo } from "react";
import {
  Phone,
  Users,
  TrendingDown,
  TrendingUp,
  Gift,
  BarChart3,
  ChevronUp,
  ChevronDown,
  Minus,
  ChevronRight,
  CalendarDays,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Timeline =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "custom";

type SortKey =
  | "agentName"
  | "trials"
  | "matured"
  | "converted"
  | "conversionRate"
  | "lost";

interface AgentDetail {
  agentName: string;
  trials: number;
  stillInTrial: number;
  matured: number;
  live: number;
  saved: number;
  cancelledAfterPayment: number;
  cancelledBeforePayment: number;
  dunning: number;
  futureDeal: number;
}

interface AgentRow extends AgentDetail {
  converted: number;
  conversionRate: number;
  lost: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIMELINE_LABELS: Record<Timeline, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Previous Month",
  last_3_months: "Last 3 Months",
  custom: "Custom",
};

function getConversionColor(pct: number): string {
  if (pct >= 70) return "text-green-700 font-semibold";
  if (pct >= 50) return "text-green-600 font-semibold";
  if (pct >= 30) return "text-yellow-700";
  if (pct >= 10) return "text-orange-700";
  return "text-red-700 font-semibold";
}

function SortIcon({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}) {
  if (column !== sortKey)
    return <Minus size={12} className="text-gray-400 ml-1 inline" />;
  return sortDir === "asc" ? (
    <ChevronUp size={12} className="text-indigo-600 ml-1 inline" />
  ) : (
    <ChevronDown size={12} className="text-indigo-600 ml-1 inline" />
  );
}

// ─── Hardcoded April 2026 Data ────────────────────────────────────────────────
// Source: Zoho Subscriptions Report (April 2026)
// Excludes: Rob, Guy (Retention agents)
// Conversion Logic: (Live + Saved + Cancelled after payment) / Matured

const APRIL_2026_DATA: AgentDetail[] = [
  {
    agentName: "Debbie",
    trials: 75,
    stillInTrial: 50,
    matured: 25,
    live: 10,
    saved: 1,
    cancelledAfterPayment: 2,
    cancelledBeforePayment: 11,
    dunning: 1,
    futureDeal: 0,
  },
  {
    agentName: "Ava",
    trials: 36,
    stillInTrial: 32,
    matured: 4,
    live: 0,
    saved: 1,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 3,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Ashley",
    trials: 21,
    stillInTrial: 16,
    matured: 5,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 5,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Paige",
    trials: 19,
    stillInTrial: 14,
    matured: 5,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 5,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Ryan",
    trials: 19,
    stillInTrial: 11,
    matured: 8,
    live: 3,
    saved: 1,
    cancelledAfterPayment: 3,
    cancelledBeforePayment: 1,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "harrison",
    trials: 14,
    stillInTrial: 12,
    matured: 2,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 2,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Angel",
    trials: 13,
    stillInTrial: 10,
    matured: 3,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 2,
    cancelledBeforePayment: 1,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Matt",
    trials: 13,
    stillInTrial: 3,
    matured: 10,
    live: 4,
    saved: 0,
    cancelledAfterPayment: 3,
    cancelledBeforePayment: 3,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Nisha",
    trials: 7,
    stillInTrial: 6,
    matured: 1,
    live: 0,
    saved: 1,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 0,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Shola",
    trials: 6,
    stillInTrial: 6,
    matured: 0,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 0,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Ashleigh",
    trials: 2,
    stillInTrial: 2,
    matured: 0,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 0,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Sara",
    trials: 1,
    stillInTrial: 0,
    matured: 1,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 1,
    cancelledBeforePayment: 0,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "Yasmeen",
    trials: 1,
    stillInTrial: 0,
    matured: 1,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 1,
    dunning: 0,
    futureDeal: 0,
  },
  {
    agentName: "gabi@lavielabs.com",
    trials: 1,
    stillInTrial: 1,
    matured: 0,
    live: 0,
    saved: 0,
    cancelledAfterPayment: 0,
    cancelledBeforePayment: 0,
    dunning: 0,
    futureDeal: 0,
  },
];

// Calculate derived metrics for each agent
function calculateMetrics(agent: AgentDetail): AgentRow {
  const converted = agent.live + agent.saved + agent.cancelledAfterPayment;
  const conversionRate =
    agent.matured > 0 ? (converted / agent.matured) * 100 : 0;
  const lost =
    agent.cancelledBeforePayment + agent.dunning;

  return {
    ...agent,
    converted,
    conversionRate,
    lost,
  };
}

const AGENT_ROWS: AgentRow[] = APRIL_2026_DATA.map(calculateMetrics);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OpeningDashboard() {
  // ── Filters ──
  const [timeline, setTimeline] = useState<Timeline>("last_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // ── Sorting ──
  const [sortKey, setSortKey] = useState<SortKey>("trials");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Sort rows client-side ──
  const sortedRows = useMemo<AgentRow[]>(() => {
    return [...AGENT_ROWS].sort((a, b) => {
      const va: number | string = a[sortKey];
      const vb: number | string = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc"
          ? va.localeCompare(vb)
          : vb.localeCompare(va);
      }
      const na = va as number;
      const nb = vb as number;
      return sortDir === "asc" ? na - nb : nb - na;
    });
  }, [sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleReset() {
    setTimeline("last_month");
    setCustomFrom("");
    setCustomTo("");
    setSortKey("trials");
    setSortDir("desc");
  }

  // ── Calculate summary metrics ──
  const totalTrials = AGENT_ROWS.reduce((s, r) => s + r.trials, 0);
  const stillInTrial = AGENT_ROWS.reduce((s, r) => s + r.stillInTrial, 0);
  const matured = AGENT_ROWS.reduce((s, r) => s + r.matured, 0);
  const totalConverted = AGENT_ROWS.reduce((s, r) => s + r.converted, 0);
  const overallConversionRate =
    matured > 0 ? (totalConverted / matured) * 100 : 0;

  // Find best agent by conversion rate (among those with matured trials)
  const bestAgent = AGENT_ROWS.filter((r) => r.matured > 0).reduce(
    (best, current) =>
      current.conversionRate > best.conversionRate ? current : best,
    { agentName: "—", conversionRate: 0 } as AgentRow
  );

  const cancelledAfterPayment = AGENT_ROWS.reduce(
    (s, r) => s + r.cancelledAfterPayment,
    0
  );

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Phone className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Opening Dashboard</h1>
            <p className="text-sm text-gray-600">
              Trial conversion performance — April 2026
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-5">
        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Timeline */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Timeline
              </label>
              <select
                value={timeline}
                onChange={(e) => setTimeline(e.target.value as Timeline)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {(Object.keys(TIMELINE_LABELS) as Timeline[]).map((t) => (
                  <option key={t} value={t}>
                    {TIMELINE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Agent filter — placeholder, will be populated from backend */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Agent
              </label>
              <select
                defaultValue="all"
                disabled
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
              >
                <option value="all">All</option>
              </select>
            </div>

            {/* Custom date range */}
            {timeline === "custom" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </>
            )}

            {/* Reset */}
            <button
              onClick={handleReset}
              className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── Total Trials Hero Card ── */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center text-center min-h-[160px]">
          <p className="text-indigo-200 text-sm font-semibold uppercase tracking-widest mb-2">
            Total Trials
          </p>
          <p className="text-7xl font-extrabold text-white leading-none">
            {totalTrials}
          </p>
          <p className="text-indigo-300 text-xs mt-3">
            Trials opened in April 2026
          </p>
        </div>

        {/* ── Summary Stats Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Trials */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalTrials}</p>
              <p className="text-xs text-gray-600 font-medium">Total Trials</p>
            </div>
          </div>

          {/* Still in Trial */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stillInTrial}</p>
              <p className="text-xs text-gray-600 font-medium">Still in Trial</p>
            </div>
          </div>

          {/* Matured */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{matured}</p>
              <p className="text-xs text-gray-600 font-medium">Matured</p>
            </div>
          </div>

          {/* Conversion Rate % */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {overallConversionRate.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-600 font-medium">Conversion Rate</p>
            </div>
          </div>

          {/* Best Agent */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">
                {bestAgent.agentName}
              </p>
              <p className="text-xs text-gray-600 font-medium">
                {bestAgent.conversionRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Cancelled After Payment */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {cancelledAfterPayment}
              </p>
              <p className="text-xs text-gray-600 font-medium">Cancelled After Payment</p>
            </div>
          </div>
        </div>

        {/* ── Trials Data Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Agent Performance</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Click row to expand detail breakdown — sorted by trials (highest first)
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{width: "5%"}} />
                <col style={{width: "25%"}} />
                <col style={{width: "14%"}} />
                <col style={{width: "14%"}} />
                <col style={{width: "14%"}} />
                <col style={{width: "14%"}} />
                <col style={{width: "14%"}} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                    #
                  </th>
                  {(
                    [
                      { key: "agentName", label: "Agent" },
                      { key: "trials", label: "Trials" },
                      { key: "matured", label: "Matured" },
                      { key: "converted", label: "Converted" },
                      { key: "conversionRate", label: "Conv%" },
                      { key: "lost", label: "Lost" },
                    ] as { key: SortKey; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`px-4 py-3 text-xs font-semibold text-gray-700 cursor-pointer hover:text-indigo-700 select-none whitespace-nowrap ${key === "agentName" ? "text-left" : "text-right"}`}
                    >
                      {label}
                      <SortIcon column={key} sortKey={sortKey} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Users size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-700 font-medium">No data yet</p>
                      <p className="text-sm text-gray-500 mt-1">
                        No agents found for the selected period.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row, idx) => (
                    <tbody key={row.agentName}>
                      {/* Main row */}
                      <tr
                        className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedAgent(
                            expandedAgent === row.agentName ? null : row.agentName
                          )
                        }
                      >
                        <td className="px-4 py-3 text-xs font-medium text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={16}
                              className={`text-gray-400 transition-transform ${
                                expandedAgent === row.agentName
                                  ? "rotate-90"
                                  : ""
                              }`}
                            />
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-indigo-700">
                                {row.agentName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-semibold text-gray-900">
                              {row.agentName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-800 font-medium text-right">
                          {row.trials}
                        </td>
                        <td className="px-4 py-3 text-gray-800 text-right">
                          {row.matured}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                            {row.converted}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={getConversionColor(row.conversionRate)}>
                            {row.conversionRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              row.lost > 0
                                ? "text-red-700 font-semibold"
                                : "text-gray-800"
                            }
                          >
                            {row.lost}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedAgent === row.agentName && (
                        <tr className="bg-indigo-50/20 border-t border-indigo-100">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Live Sub
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.live}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Saved by Retention
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.saved}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Cancelled After Payment
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.cancelledAfterPayment}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Cancelled Before Payment
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.cancelledBeforePayment}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Dunning
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.dunning}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-3">
                                <p className="text-xs text-gray-600 font-medium">
                                  Future Deal
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {row.futureDeal}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))
                )}
              </tbody>

              {/* Totals row */}
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-xs font-bold text-gray-800 uppercase tracking-wide">
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {totalTrials}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {matured}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-200 text-green-900">
                      {totalConverted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    <span className={getConversionColor(overallConversionRate)}>
                      {overallConversionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">
                    {AGENT_ROWS.reduce((s, r) => s + r.lost, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Footer note ── */}
        <p className="text-xs text-gray-500 text-center pb-4">
          Opening Agents Dashboard · April 2026 · Excludes Retention agents (Rob, Guy)
        </p>
      </div>
    </div>
  );
}
