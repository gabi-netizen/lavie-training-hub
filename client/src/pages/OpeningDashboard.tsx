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
 * Data: Fetched from opening_trials + agent_working_days tables via tRPC API
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
  Loader2,
  X,
} from "lucide-react";
import { trpc } from "../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────
type SortKey =
  | "agentName"
  | "trials"
  | "matured"
  | "converted"
  | "conversionRate"
  | "lost"
  | "workingDays"
  | "avePerDay";

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
  workingDays: number;
}

interface AgentRow extends AgentDetail {
  converted: number;
  conversionRate: number;
  lost: number;
  avePerDay: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function calculateMetrics(agent: AgentDetail): AgentRow {
  const converted = agent.live + agent.saved + agent.cancelledAfterPayment;
  const conversionRate =
    agent.matured > 0 ? (converted / agent.matured) * 100 : 0;
  const lost = agent.cancelledBeforePayment + agent.dunning;
  const avePerDay = agent.workingDays > 0 ? agent.trials / agent.workingDays : 0;
  return {
    ...agent,
    converted,
    conversionRate,
    lost,
    avePerDay,
  };
}

/** Get previous month in YYYY-MM format */
function getPreviousMonth(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Format month string for display */
function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ─── Customer Detail Modal ────────────────────────────────────────────────────

function CustomerDetailModal({
  agentName,
  classification,
  classificationLabel,
  month,
  onClose,
}: {
  agentName: string;
  classification: string;
  classificationLabel: string;
  month: string;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.openingDashboard.getCustomerDetails.useQuery({
    month,
    agentName,
    classification,
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{classificationLabel}</h3>
            <p className="text-xs text-gray-600">{agentName} · {formatMonth(month)}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-gray-600">Loading customers...</span>
            </div>
          ) : !data?.customers?.length ? (
            <p className="text-sm text-gray-500 text-center py-8">No customers found.</p>
          ) : (
            <div className="space-y-2">
              {data.customers.map((c, i) => (
                <div key={c.subscriptionId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-indigo-700">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.customerName || "Unknown Customer"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.subscriptionId}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OpeningDashboard() {
  // ── Month selection ──
  const [selectedMonth, setSelectedMonth] = useState<string>(getPreviousMonth());

  // ── Filters ──
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // ── Sorting ──
  const [sortKey, setSortKey] = useState<SortKey>("avePerDay");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Customer detail modal ──
  const [customerModal, setCustomerModal] = useState<{
    agentName: string;
    classification: string;
    classificationLabel: string;
  } | null>(null);

  // ── Fetch data from API ──
  const { data: agentData, isLoading, isError } = trpc.openingDashboard.getAgentData.useQuery(
    { month: selectedMonth },
    { placeholderData: (prev) => prev }
  );
  const { data: monthsData } = trpc.openingDashboard.getAvailableMonths.useQuery();

  // ── Calculate metrics from fetched data ──
  const AGENT_ROWS: AgentRow[] = useMemo(() => {
    if (!agentData?.agents) return [];
    return agentData.agents.map(calculateMetrics);
  }, [agentData]);

  // ── Sort rows client-side ──
  const sortedRows = useMemo<AgentRow[]>(() => {
    return [...AGENT_ROWS].sort((a, b) => {
      // Agents without working days always go to the bottom
      if (a.workingDays === 0 && b.workingDays > 0) return 1;
      if (b.workingDays === 0 && a.workingDays > 0) return -1;
      if (a.workingDays === 0 && b.workingDays === 0) return b.trials - a.trials;
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
  }, [AGENT_ROWS, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleReset() {
    setSelectedMonth(getPreviousMonth());
    setSortKey("avePerDay");
    setSortDir("desc");
  }

  // ── Calculate summary metrics ──
  const totalTrials = AGENT_ROWS.reduce((s, r) => s + r.trials, 0);
  const stillInTrial = AGENT_ROWS.reduce((s, r) => s + r.stillInTrial, 0);
  const matured = AGENT_ROWS.reduce((s, r) => s + r.matured, 0);
  const totalConverted = AGENT_ROWS.reduce((s, r) => s + r.converted, 0);
  const totalSaved = AGENT_ROWS.reduce((s, r) => s + r.saved, 0);
  const retentionPct = matured > 0 ? (totalSaved / matured) * 100 : 0;
  const overallConversionRate =
    matured > 0 ? (totalConverted / matured) * 100 : 0;
  // Find best agent by conversion rate (among those with matured trials)
  const bestAgent = AGENT_ROWS.filter((r) => r.matured > 0).reduce(
    (best, current) =>
      current.conversionRate > best.conversionRate ? current : best,
    { agentName: "\u2014", conversionRate: 0 } as AgentRow
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
              Trial conversion performance — {formatMonth(selectedMonth)}
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 space-y-5">
        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Month selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {monthsData?.months && monthsData.months.length > 0 ? (
                  monthsData.months.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))
                ) : (
                  <option value={selectedMonth}>{formatMonth(selectedMonth)}</option>
                )}
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
            {/* Reset */}
            <button
              onClick={handleReset}
              className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── Loading State ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <span className="ml-3 text-gray-600 font-medium">Loading dashboard data...</span>
          </div>
        )}

        {/* ── Error State ── */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load dashboard data</p>
            <p className="text-sm text-red-600 mt-1">Please try refreshing the page.</p>
          </div>
        )}

        {/* ── Dashboard Content (only show when data is loaded) ── */}
        {!isLoading && !isError && (
          <>
            {/* ── Total Trials Hero Card ── */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center text-center min-h-[160px]">
              <p className="text-indigo-200 text-sm font-semibold uppercase tracking-widest mb-2">
                Total Trials
              </p>
              <p className="text-7xl font-extrabold text-white leading-none">
                {totalTrials}
              </p>
              <p className="text-indigo-300 text-xs mt-3">
                Trials opened in {formatMonth(selectedMonth)}
              </p>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Retention Help */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Gift className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{retentionPct.toFixed(1)}%</p>
                  <p className="text-xs text-gray-600 font-medium">Retention Help</p>
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
              {/* Table - CSS Grid layout (same approach as Call Center Dashboard) */}
              <div>
                {/* Header row */}
                <div className="grid grid-cols-[36px_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                  <div>#</div>
                  <div className="cursor-pointer hover:text-indigo-700" onClick={() => handleSort("agentName")}>
                    Agent <SortIcon column="agentName" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("workingDays")}>
                    W.Days <SortIcon column="workingDays" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("avePerDay")}>
                    Ave/Day <SortIcon column="avePerDay" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("trials")}>
                    Trials <SortIcon column="trials" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("matured")}>
                    Matured <SortIcon column="matured" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("converted")}>
                    Converted <SortIcon column="converted" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("conversionRate")}>
                    Conv% <SortIcon column="conversionRate" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("lost")}>
                    Lost <SortIcon column="lost" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                </div>
                {/* Data rows */}
                {sortedRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Users size={32} className="text-gray-300 mb-3" />
                    <p className="text-gray-700 font-medium">No data yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      No agents found for the selected period.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {sortedRows.map((row, idx) => (
                      <div key={row.agentName}>
                        {/* Main row */}
                        <div
                          className="grid grid-cols-[36px_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3.5 items-center hover:bg-indigo-50/40 transition-colors cursor-pointer"
                          onClick={() =>
                            setExpandedAgent(
                              expandedAgent === row.agentName ? null : row.agentName
                            )
                          }
                        >
                          <div className="text-xs font-medium text-gray-500">{idx + 1}</div>
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={16}
                              className={`text-gray-400 transition-transform ${
                                expandedAgent === row.agentName ? "rotate-90" : ""
                              }`}
                            />
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-indigo-700">
                                {row.agentName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">
                              {row.agentName}
                            </span>
                          </div>
                          <div className="text-right text-sm text-gray-800 font-medium">{row.workingDays > 0 ? row.workingDays.toFixed(1) : "\u2014"}</div>
                          <div className="text-right text-sm text-gray-800 font-semibold">{row.avePerDay > 0 ? row.avePerDay.toFixed(1) : "\u2014"}</div>
                          <div className="text-right text-sm text-gray-800 font-medium">{row.trials}</div>
                          <div className="text-right text-sm text-gray-800">{row.matured}</div>
                          <div className="text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                              {row.converted}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className={getConversionColor(row.conversionRate)}>
                              {row.conversionRate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-right">
                            <span className={row.lost > 0 ? "text-red-700 font-semibold" : "text-gray-800"}>
                              {row.lost}
                            </span>
                          </div>
                        </div>
                        {/* Expanded detail */}
                        {expandedAgent === row.agentName && (
                          <div className="bg-indigo-50/20 border-t border-indigo-100 px-5 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "live", classificationLabel: "Live Sub" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Live Sub</p>
                                <p className="text-lg font-bold text-gray-900">{row.live}</p>
                              </div>
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "saved_by_retention", classificationLabel: "Saved by Retention" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Saved by Retention</p>
                                <p className="text-lg font-bold text-gray-900">{row.saved}</p>
                              </div>
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "cancelled_after_payment", classificationLabel: "Cancelled After Payment" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Cancelled After Payment</p>
                                <p className="text-lg font-bold text-gray-900">{row.cancelledAfterPayment}</p>
                              </div>
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "cancelled_before_payment", classificationLabel: "Cancelled Before Payment" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Cancelled Before Payment</p>
                                <p className="text-lg font-bold text-gray-900">{row.cancelledBeforePayment}</p>
                              </div>
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "dunning", classificationLabel: "Dunning" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Dunning</p>
                                <p className="text-lg font-bold text-gray-900">{row.dunning}</p>
                              </div>
                              <div
                                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerModal({ agentName: row.agentName, classification: "future_deal", classificationLabel: "Future Deal" });
                                }}
                              >
                                <p className="text-xs text-gray-600 font-medium">Future Deal</p>
                                <p className="text-lg font-bold text-gray-900">{row.futureDeal}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Totals row */}
                <div className="grid grid-cols-[36px_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3 bg-gray-50 border-t-2 border-gray-300 text-sm">
                  <div></div>
                  <div className="text-xs font-bold text-gray-800 uppercase tracking-wide">Totals</div>
                  <div className="text-right font-bold text-gray-900">{AGENT_ROWS.reduce((s, r) => s + r.workingDays, 0).toFixed(1)}</div>
                  <div className="text-right font-bold text-gray-900">{(totalTrials / Math.max(AGENT_ROWS.reduce((s, r) => s + r.workingDays, 0), 1)).toFixed(1)}</div>
                  <div className="text-right font-bold text-gray-900">{totalTrials}</div>
                  <div className="text-right font-bold text-gray-900">{matured}</div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-200 text-green-900">
                      {totalConverted}
                    </span>
                  </div>
                  <div className="text-right font-bold">
                    <span className={getConversionColor(overallConversionRate)}>
                      {overallConversionRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right font-bold text-red-700">
                    {AGENT_ROWS.reduce((s, r) => s + r.lost, 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer note ── */}
            <p className="text-xs text-gray-500 text-center pb-4">
              Opening Agents Dashboard · {formatMonth(selectedMonth)} · Excludes Retention agents (Rob, Guy)
            </p>
          </>
        )}
      </div>

      {/* ── Customer Detail Modal ── */}
      {customerModal && (
        <CustomerDetailModal
          agentName={customerModal.agentName}
          classification={customerModal.classification}
          classificationLabel={customerModal.classificationLabel}
          month={selectedMonth}
          onClose={() => setCustomerModal(null)}
        />
      )}
    </div>
  );
}
