import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Phone, MessageCircle, Mail, ChevronDown, ChevronUp, Calendar, RotateCcw, RefreshCw } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface MyClientsTabProps {
  agentName: string;
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

export function MyClientsTab({ agentName }: MyClientsTabProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = trpc.billing.getMyClientsData.useQuery(
    {
      salesperson: agentName,
      search: search || undefined,
      status: statusFilter || undefined,
      planType: planTypeFilter || undefined,
      page,
      perPage: 50,
    },
    { refetchOnWindowFocus: false }
  );

  const subscriptions: MyClientSubscription[] = data?.subscriptions ?? [];
  const summary = data?.summary ?? { total: 0, live: 0, dunning: 0, cancelled: 0, future: 0, expired: 0, unpaid: 0 };
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPlanTypeFilter("");
    setPage(1);
  };

  const handleWhatsApp = (phone: string | null) => {
    if (phone) {
      const cleaned = phone.replace(/[^0-9+]/g, "");
      window.open(`https://wa.me/${cleaned.replace("+", "")}`, "_blank");
    }
  };

  const handleEmail = (email: string | null) => {
    if (email) {
      window.open(`mailto:${email}`, "_blank");
    }
  };

  const handleCall = (phone: string | null) => {
    if (phone) {
      window.open(`tel:${phone}`, "_blank");
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
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total</div>
          <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Live</div>
          <div className="text-2xl font-bold text-green-800">{summary.live}</div>
        </div>
        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Decline</div>
          <div className="text-2xl font-bold text-red-800">{summary.dunning}</div>
        </div>
        <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Cancelled</div>
          <div className="text-2xl font-bold text-slate-800">{summary.cancelled}</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Future</div>
          <div className="text-2xl font-bold text-blue-800">{summary.future}</div>
        </div>
        <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Expired</div>
          <div className="text-2xl font-bold text-slate-800">{summary.expired}</div>
        </div>
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">Unpaid</div>
          <div className="text-2xl font-bold text-orange-800">{summary.unpaid}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
        <select
          value={planTypeFilter}
          onChange={(e) => { setPlanTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Plan Types</option>
          <option value="installment">Installment</option>
          <option value="subscription">Subscription</option>
          <option value="one_payment">One Payment</option>
        </select>
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
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
          {/* Table Header — 16 columns */}
          <div
            className="grid items-center gap-1 px-3 py-3 border-b border-gray-200 bg-gray-50 min-w-[1800px]"
            style={{ gridTemplateColumns: "150px 180px 140px 70px 80px 75px 60px 55px 90px 75px 130px 90px 90px 90px 90px 100px" }}
          >
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Customer</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Email</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Plan Name</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Setup Fee</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Recurring</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Total</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Cycles</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Cur.</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Next Billing</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Status</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Campaign</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Created</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Activated</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Last Billed</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Cancelled</div>
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
                  className={`grid items-center gap-1 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 min-w-[1800px] ${
                    isExpanded ? "bg-blue-50" : ""
                  }`}
                  style={{ gridTemplateColumns: "150px 180px 140px 70px 80px 75px 60px 55px 90px 75px 130px 90px 90px 90px 90px 100px" }}
                >
                  {/* Customer Name */}
                  <div className="text-sm font-semibold text-slate-900 truncate" title={sub.customerName}>
                    {sub.customerName}
                  </div>
                  {/* Email */}
                  <div className="text-xs text-slate-700 truncate" title={sub.email}>
                    {sub.email || "—"}
                  </div>
                  {/* Plan Name */}
                  <div className="text-xs text-slate-800 truncate" title={sub.planName}>
                    {sub.planName || "—"}
                  </div>
                  {/* Setup Fee */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.setupFee)}
                  </div>
                  {/* Recurring Amount */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.recurringAmount)}
                  </div>
                  {/* Total Amount */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.totalAmount)}
                  </div>
                  {/* Billing Cycles */}
                  <div className="text-xs text-slate-800">
                    {sub.billingCycles != null ? sub.billingCycles : "∞"}
                  </div>
                  {/* Current Billing Cycle */}
                  <div className="text-xs text-slate-800">
                    {sub.currentBillingCycle != null ? sub.currentBillingCycle : "—"}
                  </div>
                  {/* Next Billing On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.nextBillingOn)}
                  </div>
                  {/* Status */}
                  <div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor.bg} ${statusColor.text}`}>
                      {statusLabel}
                    </span>
                  </div>
                  {/* Campaign ID */}
                  <div className="text-xs text-slate-700 truncate" title={sub.campaignId || ""}>
                    {sub.campaignId || "—"}
                  </div>
                  {/* Created On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.createdOn)}
                  </div>
                  {/* Activated On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.activatedOn)}
                  </div>
                  {/* Last Billed On */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.lastBilledOn)}
                  </div>
                  {/* Cancelled Date */}
                  <div className="text-xs text-slate-800">
                    {formatDate(sub.cancelledDate)}
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
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Setup Fee</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.setupFee)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Recurring Amount</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.recurringAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Total Amount</div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(sub.totalAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Payment Progress</div>
                        <div className="text-sm font-medium text-slate-900">
                          {sub.currentBillingCycle != null && sub.billingCycles != null
                            ? `Payment ${sub.currentBillingCycle} of ${sub.billingCycles}`
                            : sub.currentBillingCycle != null
                            ? `Payment ${sub.currentBillingCycle} (recurring)`
                            : "—"}
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
                    {productEntries.length > 0 && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Products Ordered</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {productEntries.map(([name, qty]) => (
                            <div key={name} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                              <span className="text-sm font-medium text-slate-800">{name}</span>
                              <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">x{qty}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Progress Bar for Installments */}
                    {sub.billingCycles != null && sub.currentBillingCycle != null && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500 uppercase">Payment Progress</span>
                          <span className="text-xs font-medium text-slate-800">
                            {sub.currentBillingCycle} / {sub.billingCycles} payments
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-purple-600 h-2.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (sub.currentBillingCycle / sub.billingCycles) * 100)}%` }}
                          ></div>
                        </div>
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
                        onClick={() => handleWhatsApp(sub.phone)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                      <button
                        onClick={() => handleEmail(sub.email)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
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
