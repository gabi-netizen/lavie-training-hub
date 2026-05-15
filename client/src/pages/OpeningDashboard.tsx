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
 * Excludes: Rob, Guy and James (Retention agents)
 *
 * Admin-only page.
 */
import { useState, useMemo, useEffect, useRef } from "react";
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
  Pencil,
  Search,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import EditWorkingHoursModal from "../components/EditWorkingHoursModal";
import EditTrialsOverrideModal from "../components/EditTrialsOverrideModal";

// ─── Types ────────────────────────────────────────────────────────────────────
type SortKey =
  | "agentName"
  | "dailyOpenings"
  | "trials"
  | "matured"
  | "converted"
  | "conversionRate"
  | "lost"
  | "workingDays"
  | "avePerDay";

type DateRangeOption =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "previous_month"
  | "last_month"
  | "last_3_months"
  | "custom";

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
  dailyOpenings: number;
}

interface AgentRow extends AgentDetail {
  converted: number;
  conversionRate: number;
  lost: number;
  avePerDay: number;
}

// ─── Date Range Options ───────────────────────────────────────────────────────

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "previous_month", label: "Previous Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "custom", label: "Custom Date" },
];

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

/** Get the current month in YYYY-MM format */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Format month string for display */
function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Get a human-readable label for the active date range filter */
function getDateRangeLabel(range: DateRangeOption, customFrom?: string, customTo?: string): string {
  if (range === "custom" && customFrom && customTo) {
    return `${customFrom} to ${customTo}`;
  }
  return DATE_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;
}

// ─── Customer Detail Modal ────────────────────────────────────────────────────

function CustomerDetailModal({
  agentName,
  classification,
  classificationLabel,
  month,
  dateRange,
  customDateFrom,
  customDateTo,
  onClose,
}: {
  agentName: string;
  classification: string;
  classificationLabel: string;
  month: string;
  dateRange: DateRangeOption;
  customDateFrom?: string;
  customDateTo?: string;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.openingDashboard.getCustomerDetails.useQuery({
    month,
    agentName,
    classification,
    dateRange,
    ...(dateRange === "custom" && customDateFrom && customDateTo
      ? { customDateFrom, customDateTo }
      : {}),
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
            <p className="text-xs text-gray-600">
              {agentName} · {formatMonth(month)}
              {dateRange !== "all" && (
                <span className="ml-1 text-indigo-600">· {getDateRangeLabel(dateRange, customDateFrom, customDateTo)}</span>
              )}
            </p>
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

// ─── Summary Card Modal ──────────────────────────────────────────────────────

function SummaryCardModal({
  classification,
  classificationLabel,
  month,
  dateRange,
  customDateFrom,
  customDateTo,
  selectedAgents,
  onClose,
}: {
  classification: string;
  classificationLabel: string;
  month: string;
  dateRange: DateRangeOption;
  customDateFrom?: string;
  customDateTo?: string;
  selectedAgents: string[];
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = trpc.openingDashboard.getCustomersByClassification.useQuery({
    month,
    classification,
    dateRange,
    ...(dateRange === "custom" && customDateFrom && customDateTo
      ? { customDateFrom, customDateTo }
      : {}),
    ...(selectedAgents.length > 0 ? { agentNames: selectedAgents } : {}),
  });

  // Group customers by agent name
  const grouped = useMemo(() => {
    if (!data?.customers?.length) return [];
    const map = new Map<string, typeof data.customers>();
    for (const c of data.customers) {
      const agent = c.agentName || "Unknown Agent";
      if (!map.has(agent)) map.set(agent, []);
      map.get(agent)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{classificationLabel}</h3>
            <p className="text-xs text-gray-600">
              {selectedAgents.length > 0 ? (selectedAgents.length === 1 ? selectedAgents[0] : `${selectedAgents.length} agents`) : "All Agents"} · {formatMonth(month)}
              {dateRange !== "all" && (
                <span className="ml-1 text-indigo-600">· {getDateRangeLabel(dateRange, customDateFrom, customDateTo)}</span>
              )}
            </p>
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
          ) : isError ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 font-medium">Failed to load customers</p>
              <p className="text-xs text-red-500 mt-1">{error?.message || "Please try again"}</p>
            </div>
          ) : !grouped.length ? (
            <p className="text-sm text-gray-500 text-center py-8">No customers found for this period.</p>
          ) : (
            <div className="space-y-5">
              {grouped.map(([agentName, customers]) => (
                <div key={agentName}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-indigo-700">{agentName.charAt(0).toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900">
                      {agentName}{" "}
                      <span className="text-xs font-normal text-gray-500">({customers.length})</span>
                    </p>
                  </div>
                  <div className="space-y-2 pl-2">
                    {customers.map((c, i) => (
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
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());

  // ── Date range filter ──
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");

  // ── Custom date range ──
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");

  // ── Agent filter (multi-select) ──
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("opening_dash_agents");
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        if (arr.length > 0) return new Set(arr);
      }
    } catch {}
    return new Set();
  });
  const [agentPopupOpen, setAgentPopupOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const agentPopupRef = useRef<HTMLDivElement>(null);

  // Persist agent selection to localStorage
  useEffect(() => {
    if (selectedAgents.size === 0) {
      localStorage.removeItem("opening_dash_agents");
    } else {
      localStorage.setItem("opening_dash_agents", JSON.stringify([...selectedAgents]));
    }
  }, [selectedAgents]);

  // Close agent popup when clicking outside
  useEffect(() => {
    if (!agentPopupOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (agentPopupRef.current && !agentPopupRef.current.contains(e.target as Node)) {
        setAgentPopupOpen(false);
        setAgentSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [agentPopupOpen]);

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

  // ── Summary card modal ──
  const [summaryCardModal, setSummaryCardModal] = useState<{
    classification: string;
    classificationLabel: string;
  } | null>(null);
  // ── Edit working hours modal (admin only) ──
  const [editHoursAgent, setEditHoursAgent] = useState<string | null>(null);
  // ── Edit trials override modal (admin only) ──
  const [editTrialsAgent, setEditTrialsAgent] = useState<{ agentName: string; currentTrials: number } | null>(null);
  // ── Admin check ──
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();

  // ── Build query params ──
  const queryParams = useMemo(() => {
    const params: {
      month: string;
      dateRange: DateRangeOption;
      customDateFrom?: string;
      customDateTo?: string;
      agentNames?: string[];
    } = {
      month: selectedMonth,
      dateRange,
    };
    if (dateRange === "custom" && customDateFrom && customDateTo) {
      params.customDateFrom = customDateFrom;
      params.customDateTo = customDateTo;
    }
    if (selectedAgents.size > 0 && !selectedAgents.has("__none__")) {
      params.agentNames = [...selectedAgents];
    } else if (selectedAgents.has("__none__")) {
      // None selected - pass a dummy name that matches nothing
      params.agentNames = ["__none__"];
    }
    return params;
  }, [selectedMonth, dateRange, customDateFrom, customDateTo, selectedAgents]);

  // ── Fetch data from API ──
  const { data: agentData, isLoading, isError } = trpc.openingDashboard.getAgentData.useQuery(
    queryParams,
    { placeholderData: (prev) => prev }
  );
  const { data: monthsData } = trpc.openingDashboard.getAvailableMonths.useQuery();
  const { data: agentNamesData } = trpc.openingDashboard.getAgentNames.useQuery();

  // Derive whether "all" is effectively selected
  const allAgents = agentNamesData?.agents ?? [];
  const isAllAgentsSelected = selectedAgents.size === 0;
  const isNoneSelected = selectedAgents.size === 1 && selectedAgents.has("__none__");

  // Helper: get display label for the agent filter button
  function getAgentFilterLabel(): string {
    if (isAllAgentsSelected) return "All Agents";
    if (isNoneSelected) return "None Selected";
    if (selectedAgents.size === 1) return [...selectedAgents][0];
    return `${selectedAgents.size} selected`;
  }

  // ── Sync default month with available months list ──
  // Once the available months load, ensure the selected month exists in the list.
  // If the current month isn't available yet, fall back to the most recent month.
  useEffect(() => {
    if (!monthsData?.months?.length) return;
    const current = getCurrentMonth();
    if (!monthsData.months.includes(current)) {
      // Fall back to the most recent available month (list is ordered ascending)
      const mostRecent = monthsData.months[monthsData.months.length - 1];
      setSelectedMonth(mostRecent);
    }
  }, [monthsData]);

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
    // Reset to current month, or most recent available if current isn't in the list
    const current = getCurrentMonth();
    const months = monthsData?.months ?? [];
    setSelectedMonth(months.includes(current) ? current : (months[months.length - 1] ?? current));
    setDateRange("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setSelectedAgents(new Set());
    setSortKey("avePerDay");
    setSortDir("desc");
  }

  function handleDateRangeChange(value: string) {
    const newRange = value as DateRangeOption;
    setDateRange(newRange);
    // Clear custom dates when switching away from custom
    if (newRange !== "custom") {
      setCustomDateFrom("");
      setCustomDateTo("");
    }
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

  // ── Active filter description for display ──
  const activeFilterLabel = getDateRangeLabel(dateRange, customDateFrom, customDateTo);

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
              {dateRange !== "all" && (
                <span className="ml-1 text-indigo-600">· {activeFilterLabel}</span>
              )}
              {!isAllAgentsSelected && (
                <span className="ml-1 text-indigo-600">· {getAgentFilterLabel()}</span>
              )}
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
            {/* Agent filter — multi-select checkbox popup */}
            <div className="relative" ref={agentPopupRef}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Agent
              </label>
              <button
                type="button"
                onClick={() => { setAgentPopupOpen((o) => !o); setAgentSearch(""); }}
                className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[140px] justify-between"
              >
                <span className="truncate">{getAgentFilterLabel()}</span>
                <ChevronsUpDown size={14} className="text-gray-400 shrink-0" />
              </button>
              {agentPopupOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
                  {/* Search input */}
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white"
                        autoFocus
                      />
                    </div>
                  </div>
                  {/* Checkbox list */}
                  <div className="max-h-60 overflow-y-auto py-1">
                    {/* "All" checkbox */}
                    <div
                      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedAgents(new Set())}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isAllAgentsSelected
                          ? "bg-indigo-600 border-indigo-600"
                          : "border-gray-300 bg-white"
                      }`}>
                        {isAllAgentsSelected && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">All</span>
                    </div>
                    {/* Divider */}
                    <div className="border-t border-gray-100 my-0.5" />
                    {/* Agent checkboxes */}
                    {allAgents
                      .filter((name) => name.toLowerCase().includes(agentSearch.toLowerCase()))
                      .map((name) => {
                        const isChecked = isAllAgentsSelected || (!isNoneSelected && selectedAgents.has(name));
                        return (
                          <div
                            key={name}
                            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setSelectedAgents((prev) => {
                                // If currently "all" (empty set), clicking an agent means
                                // deselect this one (select all others)
                                if (prev.size === 0) {
                                  const next = new Set(allAgents);
                                  next.delete(name);
                                  return next;
                                }
                                // If currently "none" selected, clicking means select only this one
                                if (prev.size === 1 && prev.has("__none__")) {
                                  return new Set([name]);
                                }
                                const next = new Set(prev);
                                if (next.has(name)) {
                                  next.delete(name);
                                  // If nothing left, set to __none__ (not all)
                                  if (next.size === 0) {
                                    return new Set(["__none__"]);
                                  }
                                } else {
                                  next.add(name);
                                }
                                // If all agents are now selected, revert to empty set (= "all")
                                if (next.size === allAgents.length) {
                                  return new Set();
                                }
                                return next;
                              });
                            }}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-gray-300 bg-white"
                            }`}>
                              {isChecked && <Check size={12} className="text-white" />}
                            </div>
                            <span className="text-sm text-gray-800">{name}</span>
                          </div>
                        );
                      })}
                    {allAgents.filter((name) => name.toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-3">No agents found</p>
                    )}
                  </div>
                  {/* Footer: Clear + OK */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgents(new Set(["__none__"]));
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAgentPopupOpen(false); setAgentSearch(""); }}
                      className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Date range filter */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Custom Date Picker — shown only when "Custom Date" is selected */}
            {dateRange === "custom" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    min={customDateFrom || undefined}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </>
            )}
            {/* Active filter badges */}
            {dateRange !== "all" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                <CalendarDays size={13} className="text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-indigo-700">
                  {activeFilterLabel}
                </span>
                <button
                  onClick={() => {
                    setDateRange("all");
                    setCustomDateFrom("");
                    setCustomDateTo("");
                  }}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
                  aria-label="Clear date range filter"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {!isAllAgentsSelected && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                <Users size={13} className="text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-indigo-700">
                  {getAgentFilterLabel()}
                </span>
                <button
                  onClick={() => setSelectedAgents(new Set())}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
                  aria-label="Clear agent filter"
                >
                  <X size={13} />
                </button>
              </div>
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
                {dateRange === "all"
                  ? `Trials opened in ${formatMonth(selectedMonth)}`
                  : `Trials opened in ${formatMonth(selectedMonth)} · ${activeFilterLabel}`}
                {!isAllAgentsSelected && ` · ${getAgentFilterLabel()}`}
              </p>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Retention Help */}
              <div
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                onClick={() => setSummaryCardModal({ classification: "saved_by_retention", classificationLabel: "Saved by Retention" })}
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Gift className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{retentionPct.toFixed(1)}%</p>
                  <p className="text-xs text-gray-600 font-medium">Retention Help</p>
                </div>
              </div>
              {/* Still in Trial */}
              <div
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                onClick={() => setSummaryCardModal({ classification: "still_in_trial", classificationLabel: "Still in Trial" })}
              >
                <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stillInTrial}</p>
                  <p className="text-xs text-gray-600 font-medium">Still in Trial</p>
                </div>
              </div>
              {/* Matured */}
              <div
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                onClick={() => setSummaryCardModal({ classification: "matured_all", classificationLabel: "Matured" })}
              >
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{matured}</p>
                  <p className="text-xs text-gray-600 font-medium">Matured</p>
                </div>
              </div>
              {/* Conversion Rate % */}
              <div
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                onClick={() => setSummaryCardModal({ classification: "converted_all", classificationLabel: "Converted" })}
              >
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
              <div
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                onClick={() => setSummaryCardModal({ classification: "cancelled_after_payment", classificationLabel: "Cancelled After Payment" })}
              >
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
                <div className="grid grid-cols-[36px_1fr_80px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                  <div>#</div>
                  <div className="cursor-pointer hover:text-indigo-700" onClick={() => handleSort("agentName")}>
                    Agent <SortIcon column="agentName" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                  <div className="text-right cursor-pointer hover:text-indigo-700" onClick={() => handleSort("dailyOpenings")}>
                    Daily Openings <SortIcon column="dailyOpenings" sortKey={sortKey} sortDir={sortDir} />
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
                          className="grid grid-cols-[36px_1fr_80px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3.5 items-center hover:bg-indigo-50/40 transition-colors cursor-pointer"
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
                          <div className="text-right text-sm font-semibold">
                            {(() => {
                              const val = dateRange === "all" ? row.dailyOpenings : row.trials;
                              return val > 0 ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
                                  {val}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              );
                            })()}
                          </div>
                          <div className="text-right text-sm text-gray-800 font-medium flex items-center justify-end gap-1">
                            <span>{row.workingDays > 0 ? row.workingDays.toFixed(1) : "\u2014"}</span>
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditHoursAgent(row.agentName);
                                }}
                                className="p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Edit working hours"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                          <div className="text-right text-sm text-gray-800 font-semibold">{row.avePerDay > 0 ? row.avePerDay.toFixed(1) : "\u2014"}</div>
                          <div className="text-right text-sm text-gray-800 font-medium flex items-center justify-end gap-1">
                            <span
                              className="cursor-pointer hover:text-indigo-600 hover:underline transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomerModal({ agentName: row.agentName, classification: "all_trials", classificationLabel: `All Trials — ${row.agentName}` });
                              }}
                            >{row.trials}</span>
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditTrialsAgent({ agentName: row.agentName, currentTrials: row.trials });
                                }}
                                className="p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Edit trials override"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
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
                <div className="grid grid-cols-[36px_1fr_80px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3.5 bg-gray-50 border-t border-gray-200 text-sm">
                  <div></div>
                  <div className="text-xs font-bold text-gray-800 uppercase tracking-wide">Totals</div>
                  <div className="text-right font-bold text-gray-900">
                    {(() => {
                      const total = AGENT_ROWS.reduce((s, r) => s + (dateRange === "all" ? r.dailyOpenings : r.trials), 0);
                      return total > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
                          {total}
                        </span>
                      ) : <span className="text-gray-400">0</span>;
                    })()}
                  </div>
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
              Opening Agents Dashboard · {formatMonth(selectedMonth)}
              {dateRange !== "all" && ` · ${activeFilterLabel}`}
              {!isAllAgentsSelected && ` · ${getAgentFilterLabel()}`}
              {" "}· Excludes Retention agents (Rob, Guy, James)
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
          dateRange={dateRange}
          customDateFrom={customDateFrom || undefined}
          customDateTo={customDateTo || undefined}
          onClose={() => setCustomerModal(null)}
        />
      )}

      {/* ── Summary Card Modal ── */}
      {summaryCardModal && (
        <SummaryCardModal
          classification={summaryCardModal.classification}
          classificationLabel={summaryCardModal.classificationLabel}
          month={selectedMonth}
          dateRange={dateRange}
          customDateFrom={customDateFrom || undefined}
          customDateTo={customDateTo || undefined}
          selectedAgents={selectedAgents.size > 0 && !selectedAgents.has("__none__") ? [...selectedAgents] : []}
          onClose={() => setSummaryCardModal(null)}
        />
      )}
      {/* ── Edit Working Hours Modal (Admin only) ── */}
      {editHoursAgent && isAdmin && (
        <EditWorkingHoursModal
          agentName={editHoursAgent}
          month={selectedMonth}
          onClose={() => setEditHoursAgent(null)}
          onSaved={() => {
            utils.openingDashboard.getAgentData.invalidate();
            setEditHoursAgent(null);
          }}
        />
      )}
      {/* ── Edit Trials Override Modal (Admin only) ── */}
      {editTrialsAgent && isAdmin && (
        <EditTrialsOverrideModal
          agentName={editTrialsAgent.agentName}
          month={selectedMonth}
          currentTrials={editTrialsAgent.currentTrials}
          onClose={() => setEditTrialsAgent(null)}
          onSaved={() => {
            utils.openingDashboard.getAgentData.invalidate();
            setEditTrialsAgent(null);
          }}
        />
      )}
    </div>
  );
}
