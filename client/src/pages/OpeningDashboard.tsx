/**
 * Opening Agents Dashboard
 *
 * Shows performance data for Opening team agents (sales agents who make cold
 * calls to sell Free Trials at £4.95).
 *
 * Data sources:
 *  - form_submissions DB → Free Trials per agent (matched by name → email)
 *  - CloudTalk API       → Working Days, Daily Openings (total calls, matched by email)
 *  - Stripe API          → Cancelled Trials
 *
 * Admin-only page.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Phone,
  Users,
  TrendingDown,
  CalendarDays,
  Gift,
  BarChart3,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Minus,
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
  | "dailyOpenings"
  | "aveDays"
  | "cancelledTrials"
  | "workingDays"
  | "freeTrials"
  | "cancellationPct";

interface AgentRow {
  agentName: string;
  agentEmail: string;
  dailyOpenings: number;
  aveDays: number;
  cancelledTrials: number;
  workingDays: number;
  freeTrials: number;
  cancellationPct: number;
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

function getCancellationColor(pct: number): string {
  if (pct >= 50) return "text-red-700 font-semibold";
  if (pct >= 35) return "text-orange-700 font-semibold";
  if (pct >= 20) return "text-yellow-700";
  return "text-green-700";
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
  if (column !== sortKey) return <Minus size={12} className="text-gray-400 ml-1 inline" />;
  return sortDir === "asc" ? (
    <ChevronUp size={12} className="text-indigo-600 ml-1 inline" />
  ) : (
    <ChevronDown size={12} className="text-indigo-600 ml-1 inline" />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OpeningDashboard() {
  // ── Filters ──
  const [timeline, setTimeline] = useState<Timeline>("last_month");
  // agentFilter is either "all" or an agent's email address
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  // ── Sorting ──
  const [sortKey, setSortKey] = useState<SortKey>("freeTrials");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Data fetch ──
  const { data, isLoading, isFetching, refetch, error } =
    trpc.openingDashboard.getDashboardData.useQuery(
      {
        timeline,
        agentFilter: agentFilter === "all" ? undefined : agentFilter,
        customDateFrom: timeline === "custom" ? customFrom : undefined,
        customDateTo: timeline === "custom" ? customTo : undefined,
      },
      {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
      }
    );

  // ── Sort rows client-side ──
  const sortedRows = useMemo<AgentRow[]>(() => {
    const rows: AgentRow[] = (data?.rows ?? []) as AgentRow[];
    return [...rows].sort((a, b) => {
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
  }, [data?.rows, sortKey, sortDir]);

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
    setAgentFilter("all");
    setCustomFrom("");
    setCustomTo("");
    setSortKey("freeTrials");
    setSortDir("desc");
  }

  const totalTrials = data?.totalTrials ?? 0;
  // allAgents is [{name, email}] — used for the agent filter dropdown
  const allAgents: { name: string; email: string }[] = data?.allAgents ?? [];

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
              Agent performance — Free Trials (£4.95)
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
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

            {/* Agent — value is email, label is name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Agent
              </label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="all">All</option>
                {allAgents.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name}
                  </option>
                ))}
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

          {/* Date range display */}
          {data && (
            <p className="mt-3 text-xs text-gray-600">
              Showing data from{" "}
              <span className="font-semibold text-gray-800">{data.dateFrom}</span> to{" "}
              <span className="font-semibold text-gray-800">{data.dateTo}</span>
            </p>
          )}
        </div>

        {/* ── Total Trials Hero Card ── */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center text-center min-h-[160px]">
          <p className="text-indigo-200 text-sm font-semibold uppercase tracking-widest mb-2">
            Total Trials
          </p>
          {isLoading ? (
            <div className="w-20 h-14 bg-indigo-500 rounded-xl animate-pulse" />
          ) : (
            <p className="text-7xl font-extrabold text-white leading-none">
              {totalTrials.toLocaleString()}
            </p>
          )}
          <p className="text-indigo-300 text-xs mt-3">
            Free Trials opened in the selected period
          </p>
        </div>

        {/* ── Summary Stats Cards ── */}
        {!isLoading && sortedRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Calls */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {sortedRows.reduce((s, r) => s + r.dailyOpenings, 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-600 font-medium">Total Calls</p>
              </div>
            </div>
            {/* Active Agents */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{sortedRows.length}</p>
                <p className="text-xs text-gray-600 font-medium">Active Agents</p>
              </div>
            </div>
            {/* Total Trials */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalTrials.toLocaleString()}</p>
                <p className="text-xs text-gray-600 font-medium">Free Trials</p>
              </div>
            </div>
            {/* Total Cancellations */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {sortedRows.reduce((s, r) => s + r.cancelledTrials, 0)}
                </p>
                <p className="text-xs text-gray-600 font-medium">Cancellations</p>
              </div>
            </div>
            {/* Total Working Days */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {sortedRows.reduce((s, r) => s + r.workingDays, 0)}
                </p>
                <p className="text-xs text-gray-600 font-medium">Working Days</p>
              </div>
            </div>
            {/* Overall Cancellation % */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {totalTrials > 0
                    ? (
                        (sortedRows.reduce((s, r) => s + r.cancelledTrials, 0) /
                          totalTrials) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </p>
                <p className="text-xs text-gray-600 font-medium">Cancel Rate</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Trials Data Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Trials Data</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Per-agent breakdown — click column headers to sort
            </p>
          </div>

          {/* Error state */}
          {error && (
            <div className="p-6 text-center">
              <p className="text-red-700 font-medium">Error loading data</p>
              <p className="text-sm text-gray-600 mt-1">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && !error && (
            <div className="p-8 text-center">
              <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Loading agent data...</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && sortedRows.length === 0 && (
            <div className="p-8 text-center">
              <Users size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">No data found</p>
              <p className="text-sm text-gray-600 mt-1">
                Try a different date range or check that agents have activity in this period.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && sortedRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-8 px-4 py-3 text-left text-xs font-semibold text-gray-700">
                      #
                    </th>
                    {(
                      [
                        { key: "agentName", label: "Agent" },
                        { key: "dailyOpenings", label: "Daily Openings" },
                        { key: "aveDays", label: "Ave/Days" },
                        { key: "cancelledTrials", label: "Cancelled Trials" },
                        { key: "workingDays", label: "Working Days" },
                        { key: "freeTrials", label: "Free Trials" },
                        { key: "cancellationPct", label: "Cancellation %" },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 cursor-pointer hover:text-indigo-700 select-none whitespace-nowrap"
                      >
                        {label}
                        <SortIcon column={key} sortKey={sortKey} sortDir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRows.map((row, idx) => (
                    <tr
                      key={row.agentEmail || row.agentName}
                      className="hover:bg-indigo-50/40 transition-colors"
                    >
                      {/* Row number */}
                      <td className="px-4 py-3 text-xs font-medium text-gray-500">
                        {idx + 1}
                      </td>
                      {/* Agent name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
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
                      {/* Daily Openings */}
                      <td className="px-4 py-3 text-gray-800 font-medium text-right">
                        {row.dailyOpenings.toLocaleString()}
                      </td>
                      {/* Ave/Days */}
                      <td className="px-4 py-3 text-gray-800 text-right">
                        {row.aveDays.toFixed(2)}
                      </td>
                      {/* Cancelled Trials */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            row.cancelledTrials > 0
                              ? "text-red-700 font-semibold"
                              : "text-gray-800"
                          }
                        >
                          {row.cancelledTrials}
                        </span>
                      </td>
                      {/* Working Days */}
                      <td className="px-4 py-3 text-gray-800 text-right">
                        {row.workingDays}
                      </td>
                      {/* Free Trials */}
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                          {row.freeTrials}
                        </span>
                      </td>
                      {/* Cancellation % */}
                      <td className="px-4 py-3 text-right">
                        <span className={getCancellationColor(row.cancellationPct)}>
                          {row.cancellationPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-xs font-bold text-gray-800 uppercase tracking-wide">
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {sortedRows.reduce((s, r) => s + r.dailyOpenings, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {sortedRows.length > 0
                        ? (
                            sortedRows.reduce((s, r) => s + r.aveDays, 0) /
                            sortedRows.length
                          ).toFixed(2)
                        : "0.00"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">
                      {sortedRows.reduce((s, r) => s + r.cancelledTrials, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {sortedRows.reduce((s, r) => s + r.workingDays, 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-200 text-green-900">
                        {totalTrials}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span
                        className={getCancellationColor(
                          totalTrials > 0
                            ? (sortedRows.reduce((s, r) => s + r.cancelledTrials, 0) /
                                totalTrials) *
                                100
                            : 0
                        )}
                      >
                        {totalTrials > 0
                          ? (
                              (sortedRows.reduce((s, r) => s + r.cancelledTrials, 0) /
                                totalTrials) *
                              100
                            ).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer note ── */}
        <p className="text-xs text-gray-500 text-center pb-4">
          Free Trials sourced from payment records · Working Days &amp; Calls from CloudTalk (matched by email) ·
          Cancellations from Stripe · Data cached for 5 minutes
        </p>
      </div>
    </div>
  );
}
