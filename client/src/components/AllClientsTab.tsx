import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Phone, MessageCircle, Mail, MessageSquare, Calendar, RotateCcw, RefreshCw, ChevronRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useCheckboxSelection } from "@/hooks/useCheckboxSelection";
import { BulkMessagingBar } from "@/components/BulkMessagingBar";
import { BulkTemplateModal } from "@/components/BulkTemplateModal";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface AllClientsTabProps {
  onWhatsApp?: (contactId: number, phone: string, name: string) => void;
  onSms?: (contactId: number, phone: string, name: string) => void;
  onEmail?: (contactId: number, name: string, email: string) => void;
  onCallback?: (subscriptionId: string, contactName: string) => void;
  onOpenCard?: (contactId: number, subscriptionId: string) => void;
}

interface MyClientSubscription {
  subscriptionId: string;
  customerName: string;
  email: string;
  planName: string;
  setupFee: number | null;
  recurringAmount: number | null;
  totalAmount: number | null;
  billingCycles: number | null;
  currentBillingCycle: number | null;
  nextBillingOn: string | null;
  status: string;
  campaignId: string | null;
  createdOn: string | null;
  activatedOn: string | null;
  lastBilledOn: string | null;
  cancelledDate: string | null;
  phone: string | null;
  products: Record<string, number>;
  subscriptionNumber: string | null;
  contactId: number | null;
  salesPerson: string | null;
}

// ─── Status Badge Colors ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  live: { bg: "bg-green-100", text: "text-green-800" },
  dunning: { bg: "bg-red-100", text: "text-red-800" },
  cancelled: { bg: "bg-gray-200", text: "text-gray-800" },
  canceled: { bg: "bg-gray-200", text: "text-gray-800" },
  expired: { bg: "bg-gray-200", text: "text-gray-800" },
  future: { bg: "bg-blue-100", text: "text-blue-800" },
  unpaid: { bg: "bg-orange-100", text: "text-orange-800" },
};

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  dunning: "Decline",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  expired: "Expired",
  future: "Future",
  unpaid: "Unpaid",
};

const RETENTION_AGENTS = ["Guy", "Rob", "James"];
const AGENTS = RETENTION_AGENTS; // alias for Ret. Agent dropdown


// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return "—";
  return `£${amount.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function AllClientsTab({ onWhatsApp, onSms, onEmail, onCallback, onOpenCard }: AllClientsTabProps) {
  const [dateRangePreset, setDateRangePreset] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [draftAgentFilter, setDraftAgentFilter] = useState<string[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [cycleFilter, setCycleFilter] = useState("");
  const [subAgeFilter, setSubAgeFilter] = useState("");
  const [daysLeftFilter, setDaysLeftFilter] = useState("");
  const [daysLeftDateFrom, setDaysLeftDateFrom] = useState("");
  const [daysLeftDateTo, setDaysLeftDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Bulk messaging state
  const { selectedIds, isSelected, toggle, toggleAll, isAllSelected, clearSelection, selectedCount } = useCheckboxSelection();
  const [bulkChannel, setBulkChannel] = useState<"whatsapp" | "sms" | "email" | null>(null);
  const [showAssignRetention, setShowAssignRetention] = useState(false);
  const [retentionAgent, setRetentionAgent] = useState("");
  const assignToRetention = trpc.billing.assignToRetention.useMutation({
    onSuccess: (data) => {
      toast.success(`Assigned ${data.created} new leads, updated ${data.updated} existing`);
      setShowAssignRetention(false);
      setRetentionAgent("");
      clearSelection();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const reassignRetention = trpc.billing.reassignRetention.useMutation({
    onSuccess: (data) => {
      if (data.action === "unassigned") toast.success("Lead unassigned");
      else if (data.action === "reassigned") toast.success("Lead reassigned");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Clear selection on page change
  useEffect(() => { clearSelection(); }, [page, clearSelection]);

  // Get recipients for bulk send
  const getSelectedRecipients = () => {
    return subscriptions
      .filter((sub) => selectedIds.has(sub.subscriptionId))
      .map((sub) => ({ phone: sub.phone, email: sub.email || null, name: sub.customerName }));
  };

  // Format date as YYYY-MM-DD in LOCAL timezone
  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Calculate date range based on preset
  const getDateRange = () => {
    const today = new Date();
    const todayStr = toLocalDateStr(today);

    switch (dateRangePreset) {
      case "today":
        return { from: todayStr, to: todayStr };
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { from: toLocalDateStr(yesterday), to: toLocalDateStr(yesterday) };
      }
      case "last7": {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return { from: toLocalDateStr(sevenDaysAgo), to: todayStr };
      }
      case "thisMonth": {
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toLocalDateStr(firstOfMonth), to: todayStr };
      }
      case "lastMonth": {
        const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastOfLastMonth = new Date(firstOfThisMonth);
        lastOfLastMonth.setDate(0);
        const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
        return { from: toLocalDateStr(firstOfLastMonth), to: toLocalDateStr(lastOfLastMonth) };
      }
      case "custom":
        return { from: customDateFrom || undefined, to: customDateTo || undefined };
      default:
        return { from: undefined, to: undefined };
    }
  };

  const dateRange = getDateRange();

  const { data, isLoading, refetch, isFetching } = trpc.billing.getMyClientsData.useQuery(
    {
      ...(agentFilter.length > 0 ? { salesperson: agentFilter.join(",") } : {}),
      status: statusFilter || undefined,
      planType: planTypeFilter || undefined,
      cycleFilter: cycleFilter || undefined,
      subAgeFilter: subAgeFilter || undefined,
      daysLeftFilter: daysLeftFilter || undefined,
      daysLeftDateFrom: daysLeftFilter === "custom" ? (daysLeftDateFrom || undefined) : undefined,
      daysLeftDateTo: daysLeftFilter === "custom" ? (daysLeftDateTo || undefined) : undefined,
      search: search || undefined,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      page,
      perPage: 50,
    },
    { refetchOnWindowFocus: false, placeholderData: (prev: any) => prev }
  );

  const subscriptions: MyClientSubscription[] = data?.subscriptions ?? [];
  const summary: any = data?.summary ?? { total: 0, live: 0, dunning: 0, cancelled: 0, future: 0, expired: 0, unpaid: 0, liveInstallment: 0, liveSub: 0, trials: 0 };

  // Show Ret. Agent column for: LIVE SUB, TRIALS, END INSTALLMENTS
  const showRetentionCol = planTypeFilter === "subscription" || planTypeFilter === "trial" || statusFilter === "expired";
  // Hide installment columns (Deposit/Total/Remaining) only for subscriptions/trials, NOT for expired
  const isSubMode = planTypeFilter === "subscription" || planTypeFilter === "trial";
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  // Click on a card = quick-filter by status (+ planType for sub-categories)
  const handleCardClick = (status: string, planType?: string) => {
    if (statusFilter === status && planTypeFilter === (planType || "")) {
      // Clicking same card again = reset
      setStatusFilter("");
      setPlanTypeFilter("");
    } else {
      setStatusFilter(status);
      setPlanTypeFilter(planType || "");
      // Reset date range so all records for this status are shown
      setDateRangePreset("all");
      setCustomDateFrom("");
      setCustomDateTo("");
    }
    // Always reset sub-filters when switching cubes
    setDaysLeftFilter("");
    setDaysLeftDateFrom("");
    setDaysLeftDateTo("");
    setCycleFilter("");
    setSubAgeFilter("");
    setPage(1);
  };

  const resetFilters = () => {
    setDateRangePreset("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setStatusFilter("");
    setPlanTypeFilter("");
    setAgentFilter([]);
    setDraftAgentFilter([]);
    setCycleFilter("");
    setSubAgeFilter("");
    setDaysLeftFilter("");
    setDaysLeftDateFrom("");
    setDaysLeftDateTo("");
    setSearch("");
    setPage(1);
  };

  // ─── Action Handlers ────────────────────────────────────────────────────────

  const handleCall = (phone: string | null) => {
    if (phone) {
      window.open(`tel:${phone}`, "_blank");
    }
  };

  const handleWhatsApp = (sub: MyClientSubscription) => {
    if (sub.phone && sub.contactId && onWhatsApp) {
      onWhatsApp(sub.contactId, sub.phone, sub.customerName);
    } else if (sub.phone) {
      const cleaned = sub.phone.replace(/[^0-9+]/g, "");
      window.open(`https://wa.me/${cleaned.replace("+", "")}`, "_blank");
    }
  };

  const handleSms = (sub: MyClientSubscription) => {
    if (sub.phone && sub.contactId && onSms) {
      onSms(sub.contactId, sub.phone, sub.customerName);
    }
  };

  const handleEmail = (sub: MyClientSubscription) => {
    if (sub.contactId && onEmail) {
      onEmail(sub.contactId, sub.customerName, sub.email);
    } else if (sub.email) {
      window.open(`mailto:${sub.email}`, "_blank");
    }
  };

  const handleCalendar = (sub: MyClientSubscription) => {
    if (onCallback) {
      onCallback(sub.subscriptionId, sub.customerName);
    }
  };

  const handleOpenCard = (sub: MyClientSubscription) => {
    if (sub.contactId && onOpenCard) {
      onOpenCard(sub.contactId, sub.subscriptionId);
    } else {
      setExpandedRow(expandedRow === sub.subscriptionId ? null : sub.subscriptionId);
    }
  };

  if (isLoading && subscriptions.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div onClick={() => handleCardClick("live")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "live" && !planTypeFilter ? "border-2 border-green-600 ring-2 ring-green-100" : "border border-green-200 hover:border-green-400"}`}>
          <div className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">Live</div>
          <div className="text-2xl font-bold text-green-800">{summary.liveInstallment + summary.liveSub}</div>
        </div>
        <div onClick={() => handleCardClick("live", "installment")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "live" && planTypeFilter === "installment" ? "border-2 border-emerald-600 ring-2 ring-emerald-100" : "border border-emerald-200 hover:border-emerald-400"}`}>
          <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Live Installments</div>
          <div className="text-2xl font-bold text-emerald-800">{summary.liveInstallment}</div>
        </div>
        <div onClick={() => handleCardClick("live", "subscription")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "live" && planTypeFilter === "subscription" ? "border-2 border-teal-600 ring-2 ring-teal-100" : "border border-teal-200 hover:border-teal-400"}`}>
          <div className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-1">Live Sub</div>
          <div className="text-2xl font-bold text-teal-800">{summary.liveSub}</div>
        </div>
        <div onClick={() => handleCardClick("live", "trial")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "live" && planTypeFilter === "trial" ? "border-2 border-purple-600 ring-2 ring-purple-100" : "border border-purple-200 hover:border-purple-400"}`}>
          <div className="text-xs font-semibold text-purple-800 uppercase tracking-wide mb-1">Trials</div>
          <div className="text-2xl font-bold text-purple-800">{summary.trials}</div>
        </div>
        <div onClick={() => handleCardClick("dunning")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "dunning" ? "border-2 border-red-600 ring-2 ring-red-100" : "border border-red-200 hover:border-red-400"}`}>
          <div className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-1">Decline</div>
          <div className="text-2xl font-bold text-red-800">{summary.dunning}</div>
        </div>
        <div onClick={() => handleCardClick("future")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "future" ? "border-2 border-blue-600 ring-2 ring-blue-100" : "border border-blue-200 hover:border-blue-400"}`}>
          <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">Future</div>
          <div className="text-2xl font-bold text-blue-800">{summary.future}</div>
        </div>
        <div onClick={() => handleCardClick("expired")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "expired" ? "border-2 border-gray-600 ring-2 ring-gray-100" : "border border-gray-300 hover:border-gray-500"}`}>
          <div className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-1">End Installments</div>
          <div className="text-2xl font-bold text-slate-800">{summary.expired}</div>
        </div>
        <div onClick={() => handleCardClick("unpaid")} className={`cursor-pointer bg-white rounded-xl p-4 shadow-sm transition-all ${statusFilter === "unpaid" ? "border-2 border-orange-600 ring-2 ring-orange-100" : "border border-orange-200 hover:border-orange-400"}`}>
          <div className="text-xs font-semibold text-orange-800 uppercase tracking-wide mb-1">Unpaid</div>
          <div className="text-2xl font-bold text-orange-800">{summary.unpaid}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        {/* Date Range Dropdown */}
        <select
          value={dateRangePreset}
          onChange={(e) => {
            setDateRangePreset(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="custom">Custom Date</option>
        </select>

        {/* Custom Date Inputs */}
        {dateRangePreset === "custom" && (
          <>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => {
                setCustomDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
              placeholder="From"
            />
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => {
                setCustomDateTo(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
              placeholder="To"
            />
          </>
        )}

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Status</option>
          <option value="live">Live</option>
          <option value="dunning">Decline</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="future">Future</option>
          <option value="unpaid">Unpaid</option>
        </select>

        {/* Plan Type Dropdown */}
        <select
          value={planTypeFilter}
          onChange={(e) => {
            setPlanTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Plan Types</option>
          <option value="installment">Installment</option>
          <option value="subscription">Subscription</option>
          <option value="one_payment">One Payment</option>
        </select>

        {/* Agent Multi-Select */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setDraftAgentFilter([...agentFilter]); setShowAgentDropdown(!showAgentDropdown); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white min-w-[130px] text-left"
          >
            {agentFilter.length === 0 ? "All Agents" : `${agentFilter.length} selected`}
            <span className="ml-2 text-gray-400">▾</span>
          </button>
          {showAgentDropdown && (
            <div className="absolute z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[180px]">
              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-200">
                <input
                  type="checkbox"
                  checked={draftAgentFilter.length === 0}
                  onChange={() => setDraftAgentFilter([])}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-800">All Agents</span>
              </label>
              {(data?.uniqueAgents ?? []).map((a: string) => (
                <label key={a} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftAgentFilter.includes(a)}
                    onChange={() => {
                      setDraftAgentFilter((prev) =>
                        prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
                      );
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-800">{a}</span>
                </label>
              ))}
              <div className="flex justify-end gap-2 px-3 py-2 border-t border-gray-200">
                <button
                  onClick={() => { setDraftAgentFilter([]); setAgentFilter([]); setPage(1); setShowAgentDropdown(false); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >Clear</button>
                <button
                  onClick={() => { setAgentFilter([...draftAgentFilter]); setPage(1); setShowAgentDropdown(false); }}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >OK</button>
              </div>
            </div>
          )}
        </div>

        {/* Cycle Dropdown */}
        <select
          value={cycleFilter}
          onChange={(e) => {
            setCycleFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Cycles</option>
          <option value="1">Cycle 1</option>
          <option value="2">Cycle 2</option>
          <option value="3">Cycle 3</option>
          <option value="4">Cycle 4</option>
          <option value="5">Cycle 5</option>
          <option value="6">Cycle 6</option>
          <option value="7">Cycle 7</option>
          <option value="8">Cycle 8</option>
          <option value="9">Cycle 9</option>
          <option value="10+">Cycle 10+</option>
        </select>

        {/* Sub Age Dropdown */}
        <select
          value={subAgeFilter}
          onChange={(e) => {
            setSubAgeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Ages</option>
          <option value="0-7">0-7 days</option>
          <option value="8-14">8-14 days</option>
          <option value="15-30">15-30 days</option>
          <option value="31-60">31-60 days</option>
          <option value="61-90">61-90 days</option>
          <option value="91-180">91-180 days</option>
          <option value="180+">180+ days</option>
        </select>

        {/* Days Left Filter — visible when Trials or Live Installments cube is selected */}
        {(statusFilter === "live" && (planTypeFilter === "trial" || planTypeFilter === "installment")) && (
          <>
            <select
              value={daysLeftFilter}
              onChange={(e) => {
                setDaysLeftFilter(e.target.value);
                if (e.target.value !== "custom") {
                  setDaysLeftDateFrom("");
                  setDaysLeftDateTo("");
                }
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-800 bg-orange-50 font-medium"
            >
              <option value="">All Days Left</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="2days">2 Days</option>
              <option value="3days">3 Days</option>
              <option value="4days">4 Days</option>
              <option value="5days">5 Days</option>
              <option value="6days">6 Days</option>
              <option value="7days">7 Days</option>
              <option value="this_week">This Week</option>
              <option value="next_week">Next Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom</option>
            </select>
            {daysLeftFilter === "custom" && (
              <>
                <input
                  type="date"
                  value={daysLeftDateFrom}
                  onChange={(e) => {
                    setDaysLeftDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-800 bg-orange-50"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={daysLeftDateTo}
                  onChange={(e) => {
                    setDaysLeftDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-800 bg-orange-50"
                  placeholder="To"
                />
              </>
            )}
          </>
        )}

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-500"
        />

        {/* Reset Button */}
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>

        {/* Refresh Button */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Expected Income Summary — visible when Days Left filter is active AND on Live Installments */}
      {daysLeftFilter && statusFilter === "live" && planTypeFilter === "installment" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 shadow-sm">
          <span className="text-lg font-bold text-green-700">
            {totalCount} customers &mdash; &pound;{(data?.expectedIncome ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} expected income
          </span>
        </div>
      )}

      {/* Results count + Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-800">
          Showing {subscriptions.length} of {totalCount} subscriptions
          {isFetching && <span className="ml-2 text-blue-600">(loading...)</span>}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-800"
            >
              Previous
            </button>
            <span className="text-gray-800 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-800"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {subscriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Calendar className="h-7 w-7 text-gray-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No subscriptions found</h3>
          <p className="text-sm text-gray-600 max-w-sm">
            Try adjusting your filters or search terms.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
          {/* Bulk Messaging Action Bar */}
          <BulkMessagingBar
            selectedCount={selectedCount}
            onWhatsApp={() => setBulkChannel("whatsapp")}
            onSms={() => setBulkChannel("sms")}
            onEmail={() => setBulkChannel("email")}
            onClear={clearSelection}
          />
          {/* Assign to Retention button — visible when items selected and in subscription mode */}
          {selectedCount > 0 && showRetentionCol && (
            <div className="px-4 pb-2">
              <button
                onClick={() => setShowAssignRetention(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Assign to Retention ({selectedCount})
              </button>
            </div>
          )}
          {/* Table Header — CSS Grid */}
          <div
            className={`grid items-center gap-1 px-3 py-3 border-b border-gray-200 bg-gray-50 ${isSubMode ? "min-w-[1600px]" : showRetentionCol ? "min-w-[2020px]" : "min-w-[1940px]"}`}
            style={{ gridTemplateColumns: isSubMode ? "36px 150px 130px 75px 90px 80px 90px 90px 80px 70px 70px 90px 90px 130px 90px 140px 180px 110px" : showRetentionCol ? "36px 150px 130px 75px 90px 80px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" : "36px 150px 130px 75px 90px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={isAllSelected(subscriptions.map(s => s.subscriptionId))}
                onChange={() => toggleAll(subscriptions.map(s => s.subscriptionId))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Customer</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Plan Name</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Status</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Agent</div>
            {showRetentionCol && (
              <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Ret. Agent</div>
            )}
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Created</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Activated</div>
            {!isSubMode && (
              <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Deposit</div>
            )}
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">{isSubMode ? "Monthly" : "Recurring"}</div>
            {!isSubMode && (
              <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Total</div>
            )}
            {!isSubMode ? (
              <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Remaining</div>
            ) : (
              <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Cycle</div>
            )}
            {isSubMode && (
              <div className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">Days Left</div>
            )}

            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Next Billing</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Last Billed</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Campaign</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Cancelled</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Actions</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Email</div>
            <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">Phone</div>
          </div>

          {/* Table Body */}
          {subscriptions.map((sub) => {
            const isExpanded = expandedRow === sub.subscriptionId;
            const statusColor = STATUS_COLORS[sub.status] || STATUS_COLORS.expired;
            const statusLabel = STATUS_LABELS[sub.status] || sub.status;
            const productEntries = Object.entries(sub.products).filter(([, qty]) => qty > 0);

            return (
              <div key={sub.subscriptionId}>
                {/* Main Row */}
                <div
                  onClick={() => setExpandedRow(isExpanded ? null : sub.subscriptionId)}
                  className={`grid items-center gap-1 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${isSubMode ? "min-w-[1600px]" : showRetentionCol ? "min-w-[2020px]" : "min-w-[1940px]"} ${
                    isExpanded ? "bg-blue-50" : ""} ${isSelected(sub.subscriptionId) ? "ring-2 ring-inset ring-blue-400 bg-blue-50" : ""}`}
                  style={{ gridTemplateColumns: isSubMode ? "36px 150px 130px 75px 90px 80px 90px 90px 80px 70px 70px 90px 90px 130px 90px 140px 180px 110px" : showRetentionCol ? "36px 150px 130px 75px 90px 80px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" : "36px 150px 130px 75px 90px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" }}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected(sub.subscriptionId)}
                      onChange={() => toggle(sub.subscriptionId)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  {/* Customer Name */}
                  <div
                    className="text-sm font-semibold text-blue-700 truncate cursor-pointer hover:underline"
                    title={sub.customerName}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sub.contactId) {
                        window.location.href = `/contacts/${sub.contactId}?from=retention&subId=${encodeURIComponent(sub.subscriptionId)}`;
                      }
                    }}
                  >
                    {sub.customerName}
                  </div>
                  {/* Plan Name */}
                  <div className="text-xs text-slate-800 truncate" title={sub.planName}>
                    {sub.planName || "—"}
                  </div>
                  {/* Status */}
                  <div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor.bg} ${statusColor.text}`}>
                      {statusLabel}
                    </span>
                  </div>
                  {/* Agent */}
                  <div className="text-xs font-medium text-slate-800 truncate" title={sub.salesPerson || ""}>
                    {sub.salesPerson || "—"}
                  </div>
                  {/* Ret. Agent — inline dropdown */}
                  {showRetentionCol && (
                    <div className="text-xs" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={(sub as any).retentionAgent || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__unassign__") {
                            reassignRetention.mutate({ subscriptionId: sub.subscriptionId, assignedAgent: null });
                          } else if (val) {
                            reassignRetention.mutate({ subscriptionId: sub.subscriptionId, assignedAgent: val });
                          }
                        }}
                        className={`w-full px-1 py-0.5 border rounded text-xs cursor-pointer ${
                          (sub as any).retentionAgent
                            ? "border-purple-300 text-purple-700 font-semibold bg-purple-50"
                            : "border-gray-300 text-gray-500"
                        }`}
                      >
                        <option value="">—</option>
                        {AGENTS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                        {(sub as any).retentionAgent && (
                          <option value="__unassign__" className="text-red-600">Unassign</option>
                        )}
                      </select>
                    </div>
                  )}
                  {/* Created On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.createdOn)}
                  </div>
                  {/* Activated On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.activatedOn)}
                  </div>
                  {/* Deposit (Setup Fee + first Recurring) — hidden for subscriptions */}
                  {!isSubMode && (
                    <div className="text-xs font-medium text-slate-800">
                      {formatCurrency((sub.setupFee || 0) + (sub.recurringAmount || 0))}
                    </div>
                  )}
                  {/* Recurring / Monthly Amount */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.recurringAmount)}
                  </div>
                  {/* Total Amount — hidden for subscriptions */}
                  {!isSubMode && (
                    <div className="text-xs font-medium text-slate-800">
                      {formatCurrency(sub.totalAmount)}
                    </div>
                  )}
                  {/* Remaining Payments (installments) OR Cycle (subscriptions) */}
                  {!isSubMode ? (
                    <div className="text-xs text-slate-800">
                      {(() => {
                        if (sub.billingCycles == null) return "∞";
                        let paid = sub.currentBillingCycle ?? 0;
                        if (paid === 0 && sub.lastBilledOn && (sub.status === "live" || sub.status === "dunning")) paid = 1;
                        // Deposit counts as first payment
                        if (sub.setupFee && sub.setupFee > 0) paid = paid + 1;
                        const remaining = Math.max(0, sub.billingCycles - paid);
                        return `${remaining} remaining`;
                      })()}
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-slate-800">
                      {sub.currentBillingCycle ?? "—"}
                    </div>
                  )}
                  {/* Days Left — only for sub/trial mode */}
                  {isSubMode && (
                    <div className="text-xs font-bold text-orange-700">
                      {(() => {
                        let nextDate = sub.nextBillingOn;
                        if (!nextDate && sub.activatedOn) {
                          // Trial: calculate first billing as activatedOn + 21 days
                          const activated = new Date(sub.activatedOn);
                          activated.setDate(activated.getDate() + 21);
                          nextDate = activated.toISOString().split('T')[0];
                        }
                        if (!nextDate) return "—";
                        const next = new Date(nextDate);
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        next.setHours(0,0,0,0);
                        const diff = Math.ceil((next.getTime() - today.getTime()) / (1000*60*60*24));
                        if (diff < 0) return `${Math.abs(diff)}d overdue`;
                        if (diff === 0) return "Today";
                        return `${diff}`;
                      })()}
                    </div>
                  )}

                  {/* Next Billing On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.nextBillingOn)}
                  </div>
                  {/* Last Billed On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.lastBilledOn)}
                  </div>
                  {/* Campaign ID */}
                  <div className="text-xs text-slate-800 truncate" title={sub.campaignId || ""}>
                    {sub.campaignId || "—"}
                  </div>
                  {/* Cancelled Date */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.cancelledDate)}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleCall(sub.phone)}
                      className="p-1.5 rounded hover:bg-green-50 transition-colors text-green-600"
                      title="Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleWhatsApp(sub)}
                      className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                        sub.contactId ? "text-green-600" : "text-slate-800"
                      }`}
                      title="WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSms(sub)}
                      disabled={!sub.contactId || !sub.phone}
                      className={`p-1.5 rounded hover:bg-blue-50 transition-colors ${
                        sub.contactId && sub.phone ? "text-blue-600" : "text-slate-800 opacity-50 cursor-not-allowed"
                      }`}
                      title="SMS"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEmail(sub)}
                      disabled={!sub.email}
                      className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                        sub.email ? "text-gray-800" : "text-gray-300 pointer-events-none"
                      }`}
                      title="Email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCalendar(sub)}
                      className="p-1.5 rounded hover:bg-purple-50 transition-colors text-purple-600"
                      title="Schedule Callback"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenCard(sub)}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-800"
                      title="Open card"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Email */}
                  <div className="text-xs text-slate-800 truncate" title={sub.email}>
                    {sub.email || "—"}
                  </div>
                  {/* Phone */}
                  <div className="text-xs text-slate-800 truncate" title={sub.phone || ""}>
                    {sub.phone || "—"}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 min-w-[1800px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Subscription #</div>
                        <div className="text-sm font-medium text-slate-900">{sub.subscriptionNumber || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Plan Name</div>
                        <div className="text-sm font-medium text-slate-900">{sub.planName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Deposit</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency((sub.setupFee || 0) + (sub.recurringAmount || 0))}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Recurring Amount</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.recurringAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Total Value</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.totalAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Payment Progress</div>
                        <div className="text-sm font-medium text-slate-900">
                          {(() => {
                            if (sub.billingCycles == null) return "Recurring (∞)";
                            let paid = sub.currentBillingCycle ?? 0;
                            if (paid === 0 && sub.lastBilledOn && (sub.status === "live" || sub.status === "dunning")) paid = 1;
                            // Deposit counts as first payment
                            if (sub.setupFee && sub.setupFee > 0) paid = paid + 1;
                            const remaining = Math.max(0, sub.billingCycles - paid);
                            return `${paid}/${sub.billingCycles} paid (${remaining} remaining)`;
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Campaign</div>
                        <div className="text-sm font-medium text-slate-900">{sub.campaignId || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Status</div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Created On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.createdOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Activated On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.activatedOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Last Billed On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.lastBilledOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Next Billing On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.nextBillingOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Cancelled Date</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.cancelledDate)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Phone</div>
                        <div className="text-sm font-medium text-slate-900">{sub.phone || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Email</div>
                        <div className="text-sm font-medium text-slate-900">{sub.email || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Customer Name</div>
                        <div className="text-sm font-medium text-slate-900">{sub.customerName}</div>
                      </div>
                    </div>

                    {/* Products */}
                    {productEntries.length > 0 && (() => {
                      const totalProducts = productEntries.reduce((sum, [, qty]) => sum + qty, 0);
                      const totalValue = sub.totalAmount ?? sub.recurringAmount ?? 0;
                      const avgPerProduct = totalProducts > 0 ? (totalValue / totalProducts) : 0;
                      return (
                        <div className="mb-4 inline-block border border-gray-200 rounded-lg p-3 bg-white">
                          <div className="text-xs font-semibold text-slate-600 uppercase mb-2">Products Ordered</div>
                          <div className="grid grid-cols-[1fr_50px] gap-x-4 gap-y-1">
                            <div className="text-xs font-bold text-slate-600">Product</div>
                            <div className="text-xs font-bold text-slate-600 text-center">Qty</div>
                            {productEntries.map(([name, qty]) => (
                              <React.Fragment key={name}>
                                <div className="text-sm font-medium text-slate-800">{name}</div>
                                <div className="text-sm font-bold text-blue-700 text-center">{qty}</div>
                              </React.Fragment>
                            ))}
                          </div>
                          <div className="mt-2 text-sm text-slate-800 border-t border-gray-100 pt-2">
                            <span className="font-semibold">{totalProducts} products</span>
                            <span className="mx-2">|</span>
                            <span className="font-semibold">Avg: £{avgPerProduct.toFixed(2)}/product</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Progress Bar for Installments */}
                    {sub.billingCycles != null && (
                      <div className="mb-4">
                        {(() => {
                          let paid = sub.currentBillingCycle ?? 0;
                          if (paid === 0 && sub.lastBilledOn && (sub.status === "live" || sub.status === "dunning")) paid = 1;
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-600 uppercase">Payment Progress</span>
                                <span className="text-xs font-medium text-slate-800">
                                  {paid} / {sub.billingCycles} payments
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div
                                  className="bg-purple-600 h-2.5 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, (paid / sub.billingCycles) * 100)}%` }}
                                ></div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => handleCall(sub.phone)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call
                      </button>
                      <button
                        onClick={() => handleWhatsApp(sub)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                      <button
                        onClick={() => handleSms(sub)}
                        disabled={!sub.contactId || !sub.phone}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                      </button>
                      <button
                        onClick={() => handleEmail(sub)}
                        disabled={!sub.email}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>
                      <button
                        onClick={() => handleCalendar(sub)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Callback
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Template Modal */}
      <BulkTemplateModal
        open={bulkChannel !== null}
        channel={bulkChannel || "whatsapp"}
        recipients={getSelectedRecipients()}
        onClose={() => setBulkChannel(null)}
        onSuccess={clearSelection}
      />

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-800"
          >
            Previous
          </button>
          <span className="text-sm text-gray-800 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-800"
          >
            Next
          </button>
        </div>
      )}

      {/* Assign to Retention Modal */}
      {showAssignRetention && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Assign to Retention Agent</h2>
            <p className="text-sm text-gray-600 mb-4">
              Assign {selectedCount} selected subscription(s) to a retention agent. They will appear as "Live Sub" leads.
            </p>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Retention Agent</label>
            <select
              value={retentionAgent}
              onChange={(e) => setRetentionAgent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 mb-6"
            >
              <option value="">Select agent...</option>
              {AGENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAssignRetention(false); setRetentionAgent(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!retentionAgent) { toast.error("Please select an agent"); return; }
                  assignToRetention.mutate({
                    subscriptionIds: Array.from(selectedIds),
                    assignedAgent: retentionAgent,
                  });
                }}
                disabled={!retentionAgent || assignToRetention.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assignToRetention.isPending ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
