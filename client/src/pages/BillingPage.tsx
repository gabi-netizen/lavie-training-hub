/**
 * Billing Control Page — Admin-only billing dashboard.
 *
 * Matches the approved mockup with:
 * 1. Top action buttons (New Subscription, New Instalment Plan, Export CSV)
 * 2. Summary cards row (6 cards)
 * 3. Second row of cards (Revenue Recovered, Cards Expiring, MRR Trend, Churn Metrics)
 * 4. Main table "Upcoming Charges" with Progress column, Days Until, and action buttons
 * 5. Bottom section: Recent Activity + Quick Stats
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
  Pause,
  XCircle,
  Plus,
  Download,
  TrendingUp,
  CreditCard,
  X,
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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
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
  scheduled: "bg-blue-100 text-blue-800 border border-blue-300",
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

// ─── Days Until (plain colored text, no badge) ──────────────────────────────
function DaysUntilBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-400 text-sm font-bold">—</span>;
  let colorClass = "text-green-600";
  let label = `${days}d`;
  if (days < 0) {
    colorClass = "text-red-600";
    label = "Overdue";
  } else if (days === 0) {
    colorClass = "text-red-600";
    label = "Today";
  } else if (days <= 3) {
    colorClass = "text-red-600";
    label = `${days}d`;
  } else if (days <= 7) {
    colorClass = "text-orange-500";
    label = `${days}d`;
  }
  return (
    <span className={cn("text-sm font-bold", colorClass)}>
      {label}
    </span>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number | null; total: number | null }) {
  if (!total || total <= 0) return <span className="text-sm text-gray-400">—</span>;
  const completed = current ?? 0;
  const pct = Math.round((completed / total) * 100);
  const barColor = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-indigo-500" : "bg-indigo-400";
  return (
    <div className="inline-flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">
        {completed}/{total} payments <span className="text-gray-500 ml-1">{pct}%</span>
      </span>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden" style={{ width: 80 }}>
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Sort Icon ──────────────────────────────────────────────────────────────
function SortIcon({ field, currentSort, currentDir }: { field: string; currentSort: string; currentDir: SortDir }) {
  if (currentSort !== field) return <ArrowUpDown size={12} className="text-gray-600 ml-1" />;
  return currentDir === "asc"
    ? <ArrowUp size={12} className="text-blue-600 ml-1" />
    : <ArrowDown size={12} className="text-blue-600 ml-1" />;
}

// ─── Modal Component ────────────────────────────────────────────────────────
function Modal({ open, onClose, title, subtitle, icon, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-10 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 font-bold transition">
          <X size={16} />
        </button>
        <div className="flex items-center gap-3 mb-6">
          {icon}
          <div>
            <h3 className="text-lg font-extrabold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Failed Payments Section ────────────────────────────────────────────────
function FailedPaymentsSection() {
  const [failedPage, setFailedPage] = useState(1);
  const failedPerPage = 4;
  const { data } = trpc.billingDashboard.getFailedPayments.useQuery({});
  if (!data || data.totalCount === 0) return null;

  const totalFailedPages = Math.ceil(data.rows.length / failedPerPage);
  const visibleRows = data.rows.slice((failedPage - 1) * failedPerPage, failedPage * failedPerPage);

  function formatRetryDate(dateStr: string | null, daysUntil: number | null): { line1: string; line2: string; color: string } {
    if (daysUntil !== null && daysUntil <= 0) {
      return { line1: "No retries left", line2: "Manual action required", color: "text-red-600" };
    }
    if (!dateStr) return { line1: "—", line2: "", color: "text-gray-800" };
    const d = new Date(dateStr);
    const formatted = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " 9:00 am";
    if (daysUntil === 1) return { line1: "Tomorrow 9:00 am", line2: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), color: "text-gray-800" };
    if (daysUntil !== null && daysUntil <= 5) return { line1: formatted, line2: `Final retry in ${daysUntil} days`, color: "text-orange-700" };
    return { line1: formatted, line2: daysUntil !== null ? `In ${daysUntil} days` : "", color: "text-gray-800" };
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3">
        <h2 className="text-lg font-bold text-gray-800 italic">Failed Payments — Smart Retry Schedule</h2>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-red-700 bg-red-50 border border-red-200">
          {data.totalCount} Requiring Action
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {/* Header row */}
        <div
          className="grid items-center px-6 py-2 border-b border-gray-200"
          style={{ gridTemplateColumns: "1.5fr 0.6fr 1fr 1fr 1.3fr 0.8fr" }}
        >
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Customer</div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount</div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Failure Reason</div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Retry Attempts</div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Next Retry</div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</div>
        </div>

        {/* Body rows */}
        {visibleRows.map((row) => {
          const retry = formatRetryDate(row.nextBillingOn, row.daysUntilRetry);
          return (
            <div
              key={row.subscriptionId}
              className="grid items-center px-6 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
              style={{ gridTemplateColumns: "1.5fr 0.6fr 1fr 1fr 1.3fr 0.8fr" }}
            >
              {/* Customer */}
              <div>
                <div className="text-sm font-semibold text-gray-800">{row.customerName}</div>
                <div className="text-xs text-gray-400">{row.email}</div>
              </div>
              {/* Amount */}
              <div className="text-sm font-bold text-gray-800">{formatCurrency(row.amount)}</div>
              {/* Failure Reason */}
              <div>
                <span className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                  row.status === "dunning"
                    ? "text-red-600"
                    : "text-orange-600"
                )}>
                  {row.failureReason}
                </span>
              </div>
              {/* Retry Attempts */}
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-green-800 border border-green-300 bg-green-50">
                  Attempt 1 / 4
                </span>
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden" style={{ width: 70 }}>
                  <div className={cn("h-full rounded-full", row.daysUntilRetry !== null && row.daysUntilRetry <= 0 ? "bg-red-500" : "bg-orange-400")} style={{ width: "25%" }} />
                </div>
              </div>
              {/* Next Retry */}
              <div>
                <div className={cn("text-sm font-bold", retry.color)}>{retry.line1}</div>
                <div className="text-xs text-gray-500">{retry.line2}</div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 text-xs font-bold text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition">
                  View
                </button>
                <button className="px-3 py-1 text-xs font-bold text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with pagination */}
      <div className="flex items-center justify-between px-6 py-2.5 border-t border-gray-100">
        <span className="text-xs text-gray-600">
          Showing {visibleRows.length} of {data.totalCount} failed payments.
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFailedPage((p) => Math.max(1, p - 1))}
            disabled={failedPage <= 1}
            className="text-xs font-semibold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ← Prev
          </button>
          {Array.from({ length: totalFailedPages }, (_, i) => (
            <button
              key={i + 1}
              onClick={() => setFailedPage(i + 1)}
              className={cn(
                "text-xs font-semibold px-2.5 py-1 rounded-lg transition",
                failedPage === i + 1
                  ? "bg-indigo-600 text-white"
                  : "text-gray-800 bg-gray-100 hover:bg-gray-200"
              )}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setFailedPage((p) => Math.min(totalFailedPages, p + 1))}
            disabled={failedPage >= totalFailedPages}
            className="text-xs font-semibold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function BillingPage() {
  // Filters state
  const [statusFilter, setStatusFilter] = useState("all");
  const [planTypeFilter, setPlanTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("this_week");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("nextBillingOn");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const limit = 10;

  // Modal state
  const [showNewSubModal, setShowNewSubModal] = useState(false);
  const [showNewInstalmentModal, setShowNewInstalmentModal] = useState(false);

  // Queries
  const utils = trpc.useUtils();

  const { data: summary, isLoading: summaryLoading } = trpc.billingDashboard.getBillingSummary.useQuery({});
  const { data: extendedMetrics } = trpc.billingDashboard.getExtendedMetrics.useQuery({});

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
  const { data: quickStats } = trpc.billingDashboard.getQuickStats.useQuery({});

  const handleRefresh = () => {
    utils.billingDashboard.invalidate();
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

  const clearFilters = () => {
    setStatusFilter("all");
    setPlanTypeFilter("all");
    setAgentFilter("all");
    setSearchQuery("");
    setDateRange("this_week");
    setPage(1);
  };

  const totalPages = Math.ceil((chargesData?.totalCount ?? 0) / limit);
  const uniqueAgents = chargesData?.uniqueAgents ?? [];
  const rows = chargesData?.rows ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header with Action Buttons ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-800 leading-tight">Billing Control</h1>
          <p className="text-sm text-gray-600 mt-0.5">Automated Stripe billing management — {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={summaryLoading || chargesLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(summaryLoading && "animate-spin")} />
            Refresh
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition">
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => setShowNewSubModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 transition"
          >
            <Plus size={14} />
            New Subscription
          </button>
          <button
            onClick={() => setShowNewInstalmentModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition"
          >
            <Plus size={14} />
            New Instalment Plan
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* ── ROW 1: Summary Cards (6 cards) ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Scheduled */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Scheduled</span>
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar size={14} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.scheduledCount ?? 0}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Pending first charge</div>
            <div className="text-[11px] text-blue-700 font-semibold mt-0.5">21-day trial active</div>
          </div>

          {/* Active Subs */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Active Subs</span>
              <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle size={14} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.activeSubsCount ?? 0}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Charged every 60 days</div>
            <div className="text-[11px] text-green-700 font-semibold mt-0.5">Live subscriptions</div>
          </div>

          {/* Active Installments */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Installments</span>
              <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                <Package size={14} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.activeInstallmentsCount ?? 0}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Active instalment plans</div>
          </div>

          {/* Due This Week */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Due This Week</span>
              <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                <Clock size={14} className="text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{summaryLoading ? "…" : summary?.dueThisWeek ?? 0}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Charges in next 7 days</div>
            <div className="text-[11px] text-orange-700 font-semibold mt-0.5">Expected revenue</div>
          </div>

          {/* Failed / Dunning */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Failed / Dunning</span>
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-red-700">{summaryLoading ? "…" : summary?.failedCount ?? 0}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Require attention</div>
            <div className="text-[11px] text-red-700 font-semibold mt-0.5">At risk</div>
          </div>

          {/* Revenue This Month */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Revenue (Month)</span>
              <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign size={14} className="text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{summaryLoading ? "…" : formatCurrency(summary?.revenueThisMonth ?? 0)}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">Payments processed</div>
            <div className="text-[11px] text-purple-700 font-semibold mt-0.5">This month</div>
          </div>
        </div>

        {/* ── ROW 2: Extended Metrics (4 cards) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Revenue Recovered */}
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-emerald-400 border-t border-r border-b border-t-gray-100 border-r-gray-100 border-b-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Revenue Recovered</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <RefreshCw size={14} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{formatCurrency(extendedMetrics?.revenueRecovered ?? 0)}</div>
            <div className="text-xs text-gray-600 mt-1">Recovered via smart retries this month</div>
            <div className="mt-3">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-gray-800">Recovery Rate</span>
                <span className="text-emerald-700">{extendedMetrics?.recoveryRate ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${extendedMetrics?.recoveryRate ?? 0}%` }} />
              </div>
              <div className="text-xs text-gray-600 mt-1.5">
                {extendedMetrics?.recoveredCount ?? 0} of {(extendedMetrics?.recoveredCount ?? 0) + (extendedMetrics?.failedThisMonth ?? 0)} failed payments recovered
              </div>
            </div>
          </div>

          {/* Cards Expiring Soon */}
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-400 border-t border-r border-b border-t-gray-100 border-r-gray-100 border-b-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Cards Expiring Soon</span>
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <CreditCard size={14} className="text-amber-600" />
              </div>
            </div>
            <div className="flex gap-4 mt-2">
              <div>
                <div className="text-2xl font-extrabold text-amber-700">—</div>
                <div className="text-xs text-gray-600">Expire this month</div>
              </div>
              <div className="border-l border-gray-200 pl-4">
                <div className="text-2xl font-extrabold text-gray-800">—</div>
                <div className="text-xs text-gray-600">Expire next month</div>
              </div>
            </div>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <div className="text-xs font-semibold text-amber-800">Coming soon</div>
              <div className="text-xs text-amber-700 mt-0.5">Card expiry tracking will be available when Stripe card data is synced</div>
            </div>
          </div>

          {/* MRR Trend */}
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-violet-400 border-t border-r border-b border-t-gray-100 border-r-gray-100 border-b-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">MRR Trend</span>
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                <TrendingUp size={14} className="text-violet-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-gray-800">{formatCurrency(extendedMetrics?.mrrCurrent ?? 0)}</div>
            <div className="text-xs text-gray-600 mt-0.5">This month&apos;s MRR</div>
            <div className="mt-2">
              {(extendedMetrics?.mrrChangePercent ?? 0) >= 0 ? (
                <span className="text-sm font-bold text-emerald-700">↑ {extendedMetrics?.mrrChangePercent ?? 0}%</span>
              ) : (
                <span className="text-sm font-bold text-red-700">↓ {Math.abs(extendedMetrics?.mrrChangePercent ?? 0)}%</span>
              )}
              <div className="text-xs text-gray-600">vs {formatCurrency(extendedMetrics?.mrrPrevious ?? 0)} last month</div>
            </div>
          </div>

          {/* Churn Metrics */}
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-rose-400 border-t border-r border-b border-t-gray-100 border-r-gray-100 border-b-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Churn Metrics</span>
              <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center">
                <XCircle size={14} className="text-rose-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-rose-50 rounded-lg p-2.5 text-center">
                <div className="text-xl font-extrabold text-rose-700">{extendedMetrics?.involuntaryChurnPct ?? 0}%</div>
                <div className="text-xs text-gray-800 font-medium mt-0.5">Involuntary</div>
                <div className="text-[10px] text-gray-600">Failed, not recovered</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-xl font-extrabold text-gray-800">{extendedMetrics?.voluntaryChurnPct ?? 0}%</div>
                <div className="text-xs text-gray-800 font-medium mt-0.5">Voluntary</div>
                <div className="text-[10px] text-gray-600">Customer cancellations</div>
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2 text-center">
              Total churn rate: <span className="font-bold text-gray-800">{extendedMetrics?.totalChurnPct ?? 0}%</span> this month
            </div>
          </div>
        </div>

        {/* ── MAIN TABLE: Upcoming Charges ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table Header with title + filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-800">Upcoming Charges</h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Status */}
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="text-xs text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none"
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
                className="text-xs text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none"
              >
                <option value="all">All Types</option>
                <option value="subscription">Subscription</option>
                <option value="installment">Installment</option>
                <option value="one_payment">One-Time Payment</option>
              </select>

              {/* Agent */}
              <select
                value={agentFilter}
                onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
                className="text-xs text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none"
              >
                <option value="all">All Agents</option>
                {uniqueAgents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              {/* Date Range */}
              <select
                value={dateRange}
                onChange={(e) => { setDateRange(e.target.value as DateRange); setPage(1); }}
                className="text-xs text-gray-800 font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none"
              >
                <option value="this_week">This Week</option>
                <option value="next_7_days">Next 7 Days</option>
                <option value="next_30_days">Next 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="all">All</option>
              </select>

              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="pl-8 pr-3 py-1.5 text-xs text-gray-800 border border-gray-300 rounded-lg bg-white outline-none w-40 placeholder:text-gray-500"
                />
              </div>

              {/* Clear */}
              <button
                onClick={clearFilters}
                className="text-xs font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Table (CSS Grid) */}
          <div className="overflow-x-auto">
            {/* Header */}
            <div
              className="grid items-center px-5 py-3 border-b border-gray-200 bg-gray-50 min-w-[1100px]"
              style={{ gridTemplateColumns: "1.5fr 1.7fr 0.8fr 0.8fr 1fr 0.8fr 0.8fr 1.2fr 1.3fr" }}
            >
              <button onClick={() => handleSort("customerName")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Customer <SortIcon field="customerName" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("email")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Email <SortIcon field="email" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("salesPerson")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Agent <SortIcon field="salesPerson" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("amount")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Amount <SortIcon field="amount" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("nextBillingOn")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Next Charge <SortIcon field="nextBillingOn" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("status")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Status <SortIcon field="status" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <button onClick={() => handleSort("currentBillingCycle")} className="flex items-center text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-blue-700 transition">
                Days Until <SortIcon field="currentBillingCycle" currentSort={sortBy} currentDir={sortDir} />
              </button>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Progress</div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</div>
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
              <div>
                {rows.map((row) => (
                  <div
                    key={row.subscriptionId}
                    className="grid items-center px-5 py-4 hover:bg-gray-50 transition-colors min-w-[1100px] border-b border-gray-100"
                    style={{ gridTemplateColumns: "1.5fr 1.7fr 0.8fr 0.8fr 1fr 0.8fr 0.8fr 1.2fr 1.3fr" }}
                  >
                    {/* Customer */}
                    <div className="truncate">
                      <span className="text-sm font-semibold text-gray-800">{row.customerName}</span>
                    </div>
                    {/* Email */}
                    <div className="truncate text-sm text-gray-600">{row.email}</div>
                    {/* Agent */}
                    <div className="text-sm font-semibold text-gray-800">{row.salesPerson}</div>
                    {/* Amount */}
                    <div className="text-sm font-bold text-gray-800">{formatCurrency(row.amount)}</div>
                    {/* Next Charge */}
                    <div className="text-sm text-gray-800">{formatDate(row.nextBillingOn)}</div>
                    {/* Status */}
                    <div><StatusBadge status={row.status} /></div>
                    {/* Days Until */}
                    <div><DaysUntilBadge days={row.daysUntilCharge} /></div>
                    {/* Progress */}
                    <div>
                      <ProgressBar current={row.currentBillingCycle} total={row.billingCycles} />
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition">
                        View
                      </button>
                      <button className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                        Pause
                      </button>
                      <button className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-600">
              Showing <strong className="text-gray-800">{rows.length}</strong> of <strong className="text-gray-800">{chargesData?.totalCount ?? 0}</strong> subscriptions
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "text-xs font-semibold px-3 py-1.5 rounded-lg transition",
                      page === pageNum
                        ? "bg-indigo-600 text-white"
                        : "text-gray-800 bg-gray-100 hover:bg-gray-200"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-xs font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* ── FAILED PAYMENTS — Smart Retry Schedule ── */}
        <FailedPaymentsSection />

        {/* ── BOTTOM ROW: Activity Feed + Quick Stats ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Recent Activity Feed (2/3 width) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 xl:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-gray-800" />
              <h3 className="text-base font-bold text-gray-800">Recent Activity</h3>
            </div>
            <div className="space-y-0 max-h-[360px] overflow-y-auto">
              {activityData?.entries && activityData.entries.length > 0 ? (
                activityData.entries.map((entry, idx) => (
                  <div key={entry.id} className={cn("flex gap-3 items-start py-3", idx > 0 && "border-t border-gray-100")}>
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                      entry.eventType.includes("succeeded") || entry.eventType.includes("paid") || entry.eventType.includes("recovered") ? "bg-green-500" :
                      entry.eventType.includes("failed") || entry.eventType.includes("declined") ? "bg-red-500" :
                      entry.eventType.includes("created") || entry.eventType.includes("schedule") ? "bg-blue-500" :
                      entry.eventType.includes("paused") || entry.eventType.includes("cancelled") || entry.eventType.includes("canceled") ? "bg-gray-400" :
                      entry.eventType.includes("warning") || entry.eventType.includes("expir") ? "bg-amber-500" :
                      "bg-red-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{formatEventType(entry.eventType)}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.amount !== null && entry.amount !== undefined && (
                          <span className="text-xs text-gray-600">
                            {formatCurrency((entry.amount ?? 0) / 100)}
                          </span>
                        )}
                        {entry.customerId && (
                          <span className="text-xs text-gray-600 truncate">{entry.customerId}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                      {timeAgo(entry.createdAt)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-600 text-center py-8">No recent activity recorded</div>
              )}
            </div>
            {/* View full activity log link */}
            <div className="text-center pt-3 border-t border-gray-100 mt-2">
              <button className="text-sm text-blue-600 font-semibold hover:underline">View full activity log →</button>
            </div>
          </div>

          {/* Quick Stats (1/3 width) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-5">
            <h3 className="text-base font-bold text-gray-800">Quick Stats</h3>

            {/* Payment Success Rate */}
            <div>
              <div className="flex justify-between text-sm font-semibold mb-1.5">
                <span className="text-gray-800">Payment Success Rate</span>
                <span className="text-green-700">{quickStats?.paymentSuccessRate ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${quickStats?.paymentSuccessRate ?? 0}%` }} />
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {quickStats?.successCount ?? 0} of {quickStats?.totalPayments ?? 0} payments succeeded
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              <div>
                <div className="text-xs text-gray-600 font-medium">Avg Revenue / Customer</div>
                <div className="text-xl font-extrabold text-gray-800 mt-1">{formatCurrency(quickStats?.avgRevenuePerCustomer ?? 0)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-medium">Total Customers</div>
                <div className="text-xl font-extrabold text-gray-800 mt-1">{quickStats?.totalCustomers ?? 0}</div>
              </div>
            </div>

            {/* Next Batch Charge + Avg Days Between Charge */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="text-xs text-gray-600 font-medium">Next Batch Charge</div>
                <div className="text-lg font-extrabold text-green-700 mt-0.5">
                  {quickStats?.nextBatchDate ? (() => {
                    const d = new Date(quickStats.nextBatchDate + "T00:00:00");
                    const today = new Date(); today.setHours(0,0,0,0);
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                    if (d.getTime() === today.getTime()) return "Today";
                    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
                    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  })() : "—"}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">{quickStats?.nextBatchCustomers ?? 0} customers · {formatCurrency(quickStats?.nextBatchAmount ?? 0)}</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="text-xs text-gray-600 font-medium">Avg Days Between Charge</div>
                <div className="text-lg font-extrabold text-green-700 mt-0.5">{quickStats?.avgDaysBetweenCharge ?? 0}</div>
                <div className="text-xs text-gray-600 mt-0.5">days</div>
              </div>
            </div>

            {/* Revenue Forecast */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Revenue Forecast</div>
              <div className="text-2xl font-extrabold text-indigo-800">{formatCurrency(extendedMetrics?.mrrCurrent ?? 0)}</div>
              <div className="text-xs text-gray-800 mt-1">Expected next 30 days (based on live subs)</div>
            </div>

            {/* Installment Plans */}
            {(quickStats?.installmentPlans?.length ?? 0) > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Installment Plans</div>
                <div className="flex flex-col gap-2.5">
                  {quickStats?.installmentPlans?.map((plan, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="text-xs text-gray-800 font-medium w-28 truncate">{plan.name?.split(" ").slice(0, 3).join(" ")}</div>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${plan.current / plan.total >= 0.8 ? "bg-green-500" : "bg-indigo-500"}`}
                          style={{ width: `${(plan.current / plan.total) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs font-semibold text-gray-700 w-8 text-right">{plan.current}/{plan.total}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      {/* New Subscription Modal */}
      <Modal
        open={showNewSubModal}
        onClose={() => setShowNewSubModal(false)}
        title="New Subscription"
        subtitle="Set up a recurring Stripe billing schedule for a customer"
        icon={<div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Plus size={20} className="text-green-600" /></div>}
      >
        <div className="space-y-4">
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">1 — Customer</div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="text" className="w-full pl-9 pr-3 py-2.5 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none placeholder:text-gray-500" placeholder="Type name, email or phone…" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">2 — Billing Configuration</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Amount (£)</label>
                <input type="number" className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none" defaultValue="44.90" step="0.01" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Billing cycle</label>
                <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
                  <option>Every 30 days</option>
                  <option>Every 60 days</option>
                  <option>Every 90 days</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Trial period</label>
                <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
                  <option>No trial</option>
                  <option>21-day free trial</option>
                  <option>14-day free trial</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">First charge date</label>
                <input type="date" className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none" />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">3 — Agent</div>
            <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
              <option value="">Select agent…</option>
              {uniqueAgents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button onClick={() => setShowNewSubModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">Create Subscription</button>
          </div>
        </div>
      </Modal>

      {/* New Instalment Plan Modal */}
      <Modal
        open={showNewInstalmentModal}
        onClose={() => setShowNewInstalmentModal(false)}
        title="New Instalment Plan"
        subtitle="Split a total amount into scheduled equal payments"
        icon={<div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Package size={20} className="text-blue-600" /></div>}
      >
        <div className="space-y-4">
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">1 — Customer</div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="text" className="w-full pl-9 pr-3 py-2.5 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none placeholder:text-gray-500" placeholder="Type name, email or phone…" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">2 — Instalment Configuration</div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-800 mb-1 block">Total amount (£)</label>
              <input type="number" className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none" defaultValue="420.00" step="0.01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Number of payments</label>
                <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
                  <option>2</option>
                  <option>3</option>
                  <option>6</option>
                  <option>9</option>
                  <option>12</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Payment interval</label>
                <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
                  <option>Every 14 days</option>
                  <option>Every 30 days</option>
                  <option>Every 60 days</option>
                  <option>Every 90 days</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">First payment date</label>
                <input type="date" className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-800 mb-1 block">Description</label>
                <input type="text" className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none" placeholder="e.g. Matinika Starter Kit" />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-3">3 — Agent</div>
            <select className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg outline-none">
              <option value="">Select agent…</option>
              {uniqueAgents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button onClick={() => setShowNewInstalmentModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">Create Instalment Plan</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
