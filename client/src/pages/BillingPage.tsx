/**
 * Billing Page — Admin-only billing control dashboard.
 *
 * Sections:
 * 1. Summary cards row (top)
 * 2. Filters row
 * 3. Main table (CSS Grid with div, paginated, sortable)
 * 4. Bottom section: Recent Activity + Quick Stats
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw,
  Calendar,
  CheckCircle,
  Package,
  Clock,
  AlertTriangle,
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  Users,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";
type SortField = "customerName" | "email" | "salesPerson" | "planType" | "amount" | "nextBillingOn" | "status" | "currentBillingCycle";
type DateRange = "this_week" | "next_7_days" | "next_30_days" | "this_month" | "all";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\./g, " › ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Status Badge ───────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  live: "bg-green-100 text-green-800 border border-green-300",
  trial: "bg-blue-100 text-blue-800 border border-blue-300",
  dunning: "bg-red-100 text-red-800 border border-red-300",
  unpaid: "bg-red-100 text-red-800 border border-red-300",
  cancelled: "bg-gray-200 text-gray-800 border border-gray-300",
  canceled: "bg-gray-200 text-gray-800 border border-gray-300",
  future: "bg-purple-100 text-purple-800 border border-purple-300",
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = STATUS_STYLES[s] ?? "bg-gray-200 text-gray-800 border border-gray-300";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold", cls)}>
      {s === "canceled" ? "Cancelled" : s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

// ─── Plan Type Badge ────────────────────────────────────────────────────────
function PlanTypeBadge({ planType }: { planType: string }) {
  const isInstallment = planType === "installment";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
        isInstallment
          ? "bg-orange-100 text-orange-800 border border-orange-300"
          : "bg-blue-100 text-blue-800 border border-blue-300"
      )}
    >
      {isInstallment ? "Installment" : "Sub"}
    </span>
  );
}

// ─── Days Left Badge ────────────────────────────────────────────────────────
function DaysLeftBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-600 text-xs">—</span>;
  let colorClass = "text-green-700 bg-green-50";
  if (days < 3) colorClass = "text-red-700 bg-red-50";
  else if (days < 7) colorClass = "text-orange-700 bg-orange-50";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold", colorClass)}>
      {days}d
    </span>
  );
}

// ─── Sort Icon ──────────────────────────────────────────────────────────────
function SortIcon({ field, currentSort, currentDir }: { field: string; currentSort: string; currentDir: SortDir }) {
  if (currentSort !== field) return <ArrowUpDown size={12} className="text-gray-600 ml-1" />;
  return currentDir === "asc"
    ? <ArrowUp size={12} className="text-blue-600 ml-1" />
    : <ArrowDown size={12} className="text-blue-600 ml-1" />;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function BillingPage() {
  // Filters state
  const [statusFilter, setStatusFilter] = useState("all");
  const [planTypeFilter, setPlanTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("nextBillingOn");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const limit = 50;

  // Queries
  const utils = trpc.useUtils();

  const { data: summary, isLoading: summaryLoading } = trpc.billingDashboard.getBillingSummary.useQuery({});

  const { data: chargesData, isLoading: chargesLoading } = trpc.billingDashboard.getUpcomingCharges.useQuery({
    status: statusFilter,
    planType: planTypeFilter,
    agent: agentFilter,
    search: searchQuery || undefined,
    dateRange,
    page,
    limit,
    sortBy,
    sortDir,
  });

  const { data: activityData } = trpc.billingDashboard.getRecentActivity.useQuery({});

  const { data: churnData } = trpc.billingDashboard.getChurnMetrics.useQuery({});

  const handleRefresh = () => {
    utils.billingDashboard.getBillingSummary.invalidate();
    utils.billingDashboard.getUpcomingCharges.invalidate();
    utils.billingDashboard.getRecentActivity.invalidate();
    utils.billingDashboard.getChurnMetrics.invalidate();
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const totalPages = Math.ceil((chargesData?.totalCount ?? 0) / limit);
  const uniqueAgents = chargesData?.uniqueAgents ?? [];
  const rows = chargesData?.rows ?? [];

  // Quick stats
  const quickStats = useMemo(() => {
    if (!summary) return null;
    const avgAmount = chargesData?.totalCount && chargesData.totalCount > 0
      ? (rows.reduce((sum, r) => sum + r.amount, 0) / rows.length)
      : 0;
    return {
      totalCustomers: summary.totalCustomers,
      activeSubs: summary.activeSubsCount,
      activeInstallments: summary.activeInstallmentsCount,
      avgAmount,
    };
  }, [summary, chargesData, rows]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-800">Billing Control</h1>
          <p className="text-sm text-gray-600 mt-0.5">Subscription and instalment billing management</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={summaryLoading || chargesLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(summaryLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Scheduled */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Scheduled</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar size={16} className="text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.scheduledCount ?? 0}</div>
            <div className="text-xs text-gray-600 mt-1">Trial / Future</div>
          </div>

          {/* Active Subs */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Active Subs</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-green-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.activeSubsCount ?? 0}</div>
            <div className="text-xs text-gray-600 mt-1">Live subscriptions</div>
          </div>

          {/* Active Installments */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Installments</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Package size={16} className="text-green-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.activeInstallmentsCount ?? 0}</div>
            <div className="text-xs text-gray-600 mt-1">Live instalments</div>
          </div>

          {/* Due This Week */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Due This Week</span>
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Clock size={16} className="text-orange-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.dueThisWeek ?? 0}</div>
            <div className="text-xs text-gray-600 mt-1">Charges in next 7 days</div>
          </div>

          {/* Failed / Dunning */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Failed / Dunning</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-red-700">{summaryLoading ? "…" : summary?.failedCount ?? 0}</div>
            <div className="text-xs text-gray-600 mt-1">Require attention</div>
          </div>

          {/* Revenue This Month */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Revenue (Month)</span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign size={16} className="text-purple-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-gray-800">{summaryLoading ? "…" : formatCurrency(summary?.revenueThisMonth ?? 0)}</div>
            <div className="text-xs text-gray-600 mt-1">Billed this month</div>
          </div>
        </div>

        {/* ── Filters Row ── */}
        <div className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="text-sm text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="live">Live</option>
            <option value="trial">Trial</option>
            <option value="dunning">Dunning</option>
            <option value="unpaid">Unpaid</option>
            <option value="cancelled">Cancelled</option>
            <option value="future">Future</option>
          </select>

          {/* Plan Type */}
          <select
            value={planTypeFilter}
            onChange={(e) => { setPlanTypeFilter(e.target.value); setPage(1); }}
            className="text-sm text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="all">All Plan Types</option>
            <option value="subscription">Subscription</option>
            <option value="installment">Installment</option>
          </select>

          {/* Agent */}
          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
            className="text-sm text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="all">All Agents</option>
            {uniqueAgents.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder="Search name or email…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none placeholder:text-gray-500"
            />
          </div>

          {/* Date Range */}
          <select
            value={dateRange}
            onChange={(e) => { setDateRange(e.target.value as DateRange); setPage(1); }}
            className="text-sm text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="all">All Dates</option>
            <option value="this_week">This Week</option>
            <option value="next_7_days">Next 7 Days</option>
            <option value="next_30_days">Next 30 Days</option>
            <option value="this_month">This Month</option>
          </select>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* ── Main Table (CSS Grid) ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Results count + pagination info */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-800">
              {chargesLoading ? "Loading…" : `${chargesData?.totalCount ?? 0} results`}
            </span>
            <span className="text-xs text-gray-600">
              Page {page} of {totalPages || 1}
            </span>
          </div>

          {/* Table container with horizontal scroll */}
          <div className="overflow-x-auto">
            {/* Header */}
            <div
              className="grid items-center gap-1 px-4 py-3 border-b border-gray-200 bg-gray-50 min-w-[1200px]"
              style={{ gridTemplateColumns: "160px 180px 100px 90px 80px 110px 80px 70px 70px 80px" }}
            >
              <button onClick={() => handleSort("customerName")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Customer <SortIcon field="customerName" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("email")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Email <SortIcon field="email" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("salesPerson")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Agent <SortIcon field="salesPerson" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("planType")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Plan Type <SortIcon field="planType" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("amount")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Amount <SortIcon field="amount" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("nextBillingOn")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Next Charge <SortIcon field="nextBillingOn" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("status")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Status <SortIcon field="status" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("currentBillingCycle")} className="flex items-center text-[11px] font-semibold text-gray-800 uppercase tracking-wide hover:text-blue-700 transition">
                Cycle <SortIcon field="currentBillingCycle" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide">Days Left</div>
              <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide">Actions</div>
            </div>

            {/* Body */}
            {chargesLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-800">
                <RefreshCw className="animate-spin mr-2" size={16} />
                Loading billing data…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-600">
                No records found for the current filters.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <div
                    key={row.subscriptionId}
                    className="grid items-center gap-1 px-4 py-2.5 hover:bg-gray-50 transition-colors min-w-[1200px]"
                    style={{ gridTemplateColumns: "160px 180px 100px 90px 80px 110px 80px 70px 70px 80px" }}
                  >
                    {/* Customer */}
                    <div className="truncate">
                      <span className="text-sm font-semibold text-gray-800">{row.customerName}</span>
                    </div>
                    {/* Email */}
                    <div className="truncate text-sm text-gray-600">{row.email}</div>
                    {/* Agent */}
                    <div className="truncate text-sm text-gray-800">{row.salesPerson}</div>
                    {/* Plan Type */}
                    <div><PlanTypeBadge planType={row.planType} /></div>
                    {/* Amount */}
                    <div className="text-sm font-semibold text-gray-800">{formatCurrency(row.amount)}</div>
                    {/* Next Charge */}
                    <div className="text-sm text-gray-800">{formatDate(row.nextBillingOn)}</div>
                    {/* Status */}
                    <div><StatusBadge status={row.status} /></div>
                    {/* Cycle */}
                    <div className="text-sm text-gray-800 text-center">{row.currentBillingCycle ?? "—"}</div>
                    {/* Days Left */}
                    <div className="text-center"><DaysLeftBadge days={row.daysUntilCharge} /></div>
                    {/* Actions */}
                    <div>
                      <button className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition">
                        <Eye size={12} />
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-8 h-8 text-sm font-medium rounded-lg transition",
                        page === pageNum
                          ? "bg-blue-600 text-white"
                          : "text-gray-800 hover:bg-gray-200"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* ── Bottom Section (two columns) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-gray-800" />
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Recent Activity</h3>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {activityData?.entries && activityData.entries.length > 0 ? (
                activityData.entries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                      entry.eventType.includes("succeeded") ? "bg-green-500" :
                      entry.eventType.includes("failed") ? "bg-red-500" :
                      "bg-blue-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{formatEventType(entry.eventType)}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.amount !== null && (
                          <span className="text-xs font-semibold text-gray-800">
                            {formatCurrency((entry.amount ?? 0) / 100)}
                          </span>
                        )}
                        {entry.customerId && (
                          <span className="text-xs text-gray-600 truncate">{entry.customerId}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-600 whitespace-nowrap shrink-0">
                      {entry.createdAt ? formatDate(entry.createdAt) : "—"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-600 text-center py-4">No recent activity</div>
              )}
            </div>
          </div>

          {/* Right: Quick Stats */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-gray-800" />
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Quick Stats</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-extrabold text-gray-800">{quickStats?.totalCustomers ?? 0}</div>
                <div className="text-xs text-gray-600 mt-1">Total Customers</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-extrabold text-gray-800">{quickStats?.activeSubs ?? 0}</div>
                <div className="text-xs text-gray-600 mt-1">Active Subs</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-extrabold text-gray-800">{quickStats?.activeInstallments ?? 0}</div>
                <div className="text-xs text-gray-600 mt-1">Active Installments</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-extrabold text-gray-800">
                  {quickStats?.avgAmount ? formatCurrency(quickStats.avgAmount) : "£0.00"}
                </div>
                <div className="text-xs text-gray-600 mt-1">Avg Amount (page)</div>
              </div>
            </div>

            {/* Churn metrics */}
            {churnData && (
              <div className="mt-5 pt-4 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-3">Churn Metrics</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-700">{churnData.involuntaryChurn}</div>
                    <div className="text-[11px] text-gray-600">Involuntary</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-700">{churnData.voluntaryChurn}</div>
                    <div className="text-[11px] text-gray-600">Voluntary</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-700">{churnData.recoveryRate}%</div>
                    <div className="text-[11px] text-gray-600">Recovery</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
