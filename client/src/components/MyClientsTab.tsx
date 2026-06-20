import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Phone, MessageCircle, Mail, MessageSquare, Calendar, RotateCcw, RefreshCw, ChevronRight } from "lucide-react";
import { useCheckboxSelection } from "@/hooks/useCheckboxSelection";
import { BulkMessagingBar } from "@/components/BulkMessagingBar";
import { BulkTemplateModal } from "@/components/BulkTemplateModal";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface MyClientsTabProps {
  agentName: string;
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

export function MyClientsTab({ agentName, onWhatsApp, onSms, onEmail, onCallback, onOpenCard }: MyClientsTabProps) {
  const [dateRangePreset, setDateRangePreset] = useState("all"); // all, today, yesterday, last7, thisMonth, lastMonth, custom
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Bulk messaging state
  const { selectedIds, isSelected, toggle, toggleAll, isAllSelected, clearSelection, selectedCount } = useCheckboxSelection();
  const [bulkChannel, setBulkChannel] = useState<"whatsapp" | "sms" | "email" | null>(null);

  // Clear selection on page change
  useEffect(() => { clearSelection(); }, [page, clearSelection]);

  const getSelectedRecipients = () => {
    return subscriptions
      .filter((sub) => selectedIds.has(sub.subscriptionId))
      .map((sub) => ({ phone: sub.phone, email: sub.email || null, name: sub.customerName }));
  };

  // Format date as YYYY-MM-DD in LOCAL timezone (avoids UTC shift bug)
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
        lastOfLastMonth.setDate(0); // last day of previous month
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
      salesperson: agentName,
      status: statusFilter || undefined,
      planType: planTypeFilter || undefined,
      search: search || undefined,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      page,
      perPage: 50,
    },
    { refetchOnWindowFocus: false, placeholderData: (prev: any) => prev }
  );

  const subscriptions: MyClientSubscription[] = data?.subscriptions ?? [];
  const summary = data?.summary ?? { total: 0, live: 0, dunning: 0, cancelled: 0, future: 0, expired: 0, unpaid: 0 };
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  const resetFilters = () => {
    setDateRangePreset("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setStatusFilter("");
    setPlanTypeFilter("");
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
      // Fallback to wa.me link if no contactId
      const cleaned = sub.phone.replace(/[^0-9+]/g, "");
      window.open(`https://wa.me/${cleaned.replace("+", "")}`, "_blank");
    }
  };

  const handleSms = (sub: MyClientSubscription) => {
    if (sub.phone && sub.contactId && onSms) {
      onSms(sub.contactId, sub.phone, sub.customerName);
    }
    // If no contactId → disabled (no fallback for SMS)
  };

  const handleEmail = (sub: MyClientSubscription) => {
    if (sub.contactId && onEmail) {
      onEmail(sub.contactId, sub.customerName, sub.email);
    } else if (sub.email) {
      // Fallback to mailto if no contactId
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
      // Fallback: expand row if no contactId
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


      {/* Filter Bar — Reordered: Date Range, Status, Plan Type, Search, Reset, Refresh */}
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

        {/* Custom Date Inputs (shown when "Custom Date" is selected) */}
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

        {/* Search Input — Smaller, fixed width */}
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
        />

        {/* Reset Button */}
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
          {/* Table Header — 17 columns */}
          <div
            className="grid items-center gap-1 px-3 py-3 border-b border-gray-200 bg-gray-50 min-w-[1840px]"
            style={{ gridTemplateColumns: "36px 150px 130px 75px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={isAllSelected(subscriptions.map(s => s.subscriptionId))}
                onChange={() => toggleAll(subscriptions.map(s => s.subscriptionId))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Customer</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Plan Name</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Status</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Created</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Activated</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Deposit</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Recurring</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Total</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Remaining</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Next Billing</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Last Billed</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Campaign</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Cancelled</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Actions</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Email</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Phone</div>
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
                  className={`grid items-center gap-1 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 min-w-[1840px] ${
                    isExpanded ? "bg-blue-50" : ""} ${isSelected(sub.subscriptionId) ? "ring-2 ring-inset ring-blue-400 bg-blue-50" : ""}`}
                  style={{ gridTemplateColumns: "36px 150px 130px 75px 90px 90px 80px 80px 80px 70px 90px 90px 130px 90px 140px 180px 110px" }}
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
                        window.location.href = `/contacts/${sub.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(sub.subscriptionId)}`;
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
                  {/* Created On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.createdOn)}
                  </div>
                  {/* Activated On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.activatedOn)}
                  </div>
                  {/* Deposit (Setup Fee + first Recurring) */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency((sub.setupFee || 0) + (sub.recurringAmount || 0))}
                  </div>
                  {/* Recurring Amount */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.recurringAmount)}
                  </div>
                  {/* Total Amount (minus deposit) */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency((sub.totalAmount ?? 0) - (sub.setupFee ?? 0))}
                  </div>
                  {/* Remaining Payments */}
                  <div className="text-xs text-slate-800">
                    {(() => {
                      if (sub.billingCycles == null) return "∞";
                      let paid = sub.currentBillingCycle ?? 0;
                      // If live/dunning with lastBilledOn but cycle is null/0, at least 1 paid
                      if (paid === 0 && sub.lastBilledOn && (sub.status === "live" || sub.status === "dunning")) paid = 1;
                      // Deposit counts as first payment
                      if (sub.setupFee && sub.setupFee > 0) paid = paid + 1;
                      const remaining = Math.max(0, sub.billingCycles - paid);
                      return `${remaining} remaining`;
                    })()}
                  </div>
                  {/* Next Billing On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.nextBillingOn)}
                  </div>
                  {/* Last Billed On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.lastBilledOn)}
                  </div>
                  {/* Campaign ID */}
                  <div className="text-xs text-slate-700 truncate" title={sub.campaignId || ""}>
                    {sub.campaignId || "—"}
                  </div>
                  {/* Cancelled Date */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.cancelledDate)}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {/* Phone — always tel: link */}
                    <button
                      onClick={() => handleCall(sub.phone)}
                      className="p-1.5 rounded hover:bg-green-50 transition-colors text-green-600"
                      title="Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>

                    {/* WhatsApp — modal if contactId, fallback to wa.me */}
                    <button
                      onClick={() => handleWhatsApp(sub)}
                      className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                        sub.contactId ? "text-green-600" : "text-slate-800"
                      }`}
                      title="WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>

                    {/* SMS — modal if contactId, disabled otherwise */}
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

                    {/* Email — modal if contactId, fallback to mailto */}
                    <button
                      onClick={() => handleEmail(sub)}
                      disabled={!sub.email}
                      className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                        sub.email ? "text-gray-600" : "text-gray-300 pointer-events-none"
                      }`}
                      title="Email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>

                    {/* Calendar — schedule callback */}
                    <button
                      onClick={() => handleCalendar(sub)}
                      className="p-1.5 rounded hover:bg-purple-50 transition-colors text-purple-600"
                      title="Schedule Callback"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>

                    {/* ChevronRight — open card or expand */}
                    <button
                      onClick={() => handleOpenCard(sub)}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
                      title="Open card"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Email */}
                  <div className="text-xs text-slate-700 truncate" title={sub.email}>
                    {sub.email || "—"}
                  </div>
                  {/* Phone */}
                  <div className="text-xs text-slate-700 truncate" title={sub.phone || ""}>
                    {sub.phone || "—"}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 min-w-[1800px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Subscription #</div>
                        <div className="text-sm font-medium text-slate-900">{sub.subscriptionNumber || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Plan Name</div>
                        <div className="text-sm font-medium text-slate-900">{sub.planName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Deposit</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency((sub.setupFee || 0) + (sub.recurringAmount || 0))}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Recurring Amount</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.recurringAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Total Value</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency((sub.totalAmount ?? 0) - (sub.setupFee ?? 0))}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Payment Progress</div>
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
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Campaign</div>
                        <div className="text-sm font-medium text-slate-900">{sub.campaignId || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Status</div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Created On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.createdOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Activated On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.activatedOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Last Billed On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.lastBilledOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Next Billing On</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.nextBillingOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Cancelled Date</div>
                        <div className="text-sm font-medium text-slate-900">{formatDate(sub.cancelledDate)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Phone</div>
                        <div className="text-sm font-medium text-slate-900">{sub.phone || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Email</div>
                        <div className="text-sm font-medium text-slate-900">{sub.email || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Customer Name</div>
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
                          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Products Ordered</div>
                          <div className="grid grid-cols-[1fr_50px] gap-x-4 gap-y-1">
                            <div className="text-xs font-bold text-slate-500">Product</div>
                            <div className="text-xs font-bold text-slate-500 text-center">Qty</div>
                            {productEntries.map(([name, qty]) => (
                              <React.Fragment key={name}>
                                <div className="text-sm font-medium text-slate-800">{name}</div>
                                <div className="text-sm font-bold text-blue-700 text-center">{qty}</div>
                              </React.Fragment>
                            ))}
                          </div>
                          <div className="mt-2 text-sm text-slate-700 border-t border-gray-100 pt-2">
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
                                <span className="text-xs font-semibold text-slate-500 uppercase">Payment Progress</span>
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

      {/* Bottom Pagination */}
      {/* Bulk Template Modal */}
      <BulkTemplateModal
        open={bulkChannel !== null}
        channel={bulkChannel || "whatsapp"}
        recipients={getSelectedRecipients()}
        onClose={() => setBulkChannel(null)}
        onSuccess={clearSelection}
      />

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
    </div>
  );
}
