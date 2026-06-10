import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Phone, MessageCircle, Mail, ChevronDown, ChevronUp, Calendar, ExternalLink, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface MyClientsTabProps {
  agentName: string;
}

// ─── Status Badge Colors ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  live: { bg: "bg-green-100", text: "text-green-800" },
  dunning: { bg: "bg-orange-100", text: "text-orange-800" },
  cancelled: { bg: "bg-red-100", text: "text-red-800" },
  expired: { bg: "bg-gray-200", text: "text-gray-700" },
  future: { bg: "bg-blue-100", text: "text-blue-800" },
  unpaid: { bg: "bg-yellow-100", text: "text-yellow-800" },
};

const PLAN_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  installment: { bg: "bg-purple-100", text: "text-purple-800" },
  subscription: { bg: "bg-blue-100", text: "text-blue-800" },
  one_payment: { bg: "bg-yellow-100", text: "text-yellow-800" },
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  installment: "Installment",
  subscription: "Subscription",
  one_payment: "One Payment",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return `£${num.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function MyClientsTab({ agentName }: MyClientsTabProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [nextBillingFilter, setNextBillingFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Derive amount range from filter
  const amountRange = useMemo(() => {
    switch (amountFilter) {
      case "under_20": return { min: undefined, max: 20 };
      case "20_40": return { min: 20, max: 40 };
      case "40_80": return { min: 40, max: 80 };
      case "over_80": return { min: 80, max: undefined };
      default: return { min: undefined, max: undefined };
    }
  }, [amountFilter]);

  const { data, isLoading } = trpc.clientSubscriptions.getClientSubscriptions.useQuery(
    {
      salesPerson: agentName,
      search: search || undefined,
      status: statusFilter || undefined,
      planType: (planTypeFilter as "installment" | "subscription" | "one_payment") || undefined,
      nextBillingRange: (nextBillingFilter as "this_week" | "this_month" | "overdue") || undefined,
      amountMin: amountRange.min,
      amountMax: amountRange.max,
      page,
      perPage: 50,
    },
    { refetchOnWindowFocus: false }
  );

  const subscriptions = data?.subscriptions ?? [];
  const summary = data?.summary ?? { total: 0, live: 0, dunning: 0, cancelled: 0, billingThisWeek: 0 };
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPlanTypeFilter("");
    setNextBillingFilter("");
    setAmountFilter("");
    setPage(1);
  };

  const handleWhatsApp = (email?: string | null) => {
    // Placeholder: would need phone number from contacts
  };

  const handleEmail = (email?: string | null) => {
    if (email) {
      window.open(`mailto:${email}`, "_blank");
    }
  };

  const handleOpenCard = (contactId: number | null) => {
    if (contactId) {
      navigate(`/contacts/${contactId}`);
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Clients</div>
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Live</div>
          <div className="text-2xl font-bold text-green-700">{summary.live}</div>
        </div>
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">Dunning ⚠️</div>
          <div className="text-2xl font-bold text-orange-700">{summary.dunning}</div>
        </div>
        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Cancelled</div>
          <div className="text-2xl font-bold text-red-700">{summary.cancelled}</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Billing This Week</div>
          <div className="text-2xl font-bold text-blue-700">{summary.billingThisWeek}</div>
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
          <option value="dunning">Dunning</option>
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
        <select
          value={nextBillingFilter}
          onChange={(e) => { setNextBillingFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Billing</option>
          <option value="this_week">Due This Week</option>
          <option value="this_month">Due This Month</option>
          <option value="overdue">Overdue</option>
        </select>
        <select
          value={amountFilter}
          onChange={(e) => { setAmountFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="">All Amounts</option>
          <option value="under_20">Under £20</option>
          <option value="20_40">£20 - £40</option>
          <option value="40_80">£40 - £80</option>
          <option value="over_80">Over £80</option>
        </select>
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Results count + Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span className="font-medium text-gray-800">
          Showing {subscriptions.length} of {totalCount} subscriptions
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
            <Calendar className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No subscriptions found</h3>
          <p className="text-sm text-gray-600 max-w-sm">
            Try adjusting your filters or search terms.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Table Header */}
          <div
            className="grid items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50"
            style={{ gridTemplateColumns: "40px 1.5fr 100px 110px 80px 100px 100px 140px" }}
          >
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">#</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Customer</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Plan Type</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Next Billing</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Progress</div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</div>
          </div>

          {/* Table Body */}
          {subscriptions.map((sub, idx) => {
            const isExpanded = expandedRow === sub.subscriptionId;
            const statusColor = STATUS_COLORS[sub.status] || STATUS_COLORS.expired;
            const planColor = PLAN_TYPE_COLORS[sub.planType] || PLAN_TYPE_COLORS.subscription;
            const progress = sub.planType === "installment" && sub.billingCycles
              ? `${sub.cyclesCompleted ?? 0}/${sub.billingCycles}`
              : "—";

            return (
              <div key={sub.subscriptionId}>
                {/* Main Row */}
                <div
                  onClick={() => setExpandedRow(isExpanded ? null : sub.subscriptionId)}
                  className={`grid items-center gap-2 px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${
                    isExpanded ? "bg-blue-50" : ""
                  }`}
                  style={{ gridTemplateColumns: "40px 1.5fr 100px 110px 80px 100px 100px 140px" }}
                >
                  <div className="text-sm text-gray-800 font-medium">{(page - 1) * 50 + idx + 1}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{sub.customerName}</div>
                    <div className="text-xs text-gray-600 truncate">{sub.email || "—"}</div>
                  </div>
                  <div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}>
                      {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </span>
                  </div>
                  <div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${planColor.bg} ${planColor.text}`}>
                      {PLAN_TYPE_LABELS[sub.planType] || sub.planType}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-800">{formatCurrency(sub.amount)}</div>
                  <div className="text-sm text-gray-800">{formatDate(sub.nextBillingOn)}</div>
                  <div className="text-sm text-gray-800 font-medium">{progress}</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEmail(sub.email); }}
                      className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                      title="Email"
                    >
                      <Mail className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleWhatsApp(sub.email); }}
                      className="p-1.5 rounded-lg hover:bg-green-100 transition-colors"
                      title="WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4 text-green-600" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); /* Call placeholder */ }}
                      className="p-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                      title="Call"
                    >
                      <Phone className="w-4 h-4 text-indigo-600" />
                    </button>
                    {sub.contactId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenCard(sub.contactId); }}
                        className="p-1.5 rounded-lg hover:bg-purple-100 transition-colors"
                        title="Open Card"
                      >
                        <ExternalLink className="w-4 h-4 text-purple-600" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : sub.subscriptionId); }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Plan Name</div>
                        <div className="text-sm font-medium text-gray-900">{sub.planName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Monthly Amount</div>
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(sub.recurringAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Value</div>
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(sub.totalAmount)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Subscription #</div>
                        <div className="text-sm font-medium text-gray-900">{sub.subscriptionNumber || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Campaign</div>
                        <div className="text-sm font-medium text-gray-900">{sub.campaignId || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Activated On</div>
                        <div className="text-sm font-medium text-gray-900">{formatDate(sub.activatedOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Next Billing</div>
                        <div className="text-sm font-medium text-gray-900">{formatDate(sub.nextBillingOn)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}>
                          {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar for Installments */}
                    {sub.planType === "installment" && sub.billingCycles && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase">Payment Progress</span>
                          <span className="text-xs font-medium text-gray-700">
                            {sub.cyclesCompleted ?? 0} / {sub.billingCycles} payments
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-purple-600 h-2.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((sub.cyclesCompleted ?? 0) / sub.billingCycles) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => {/* Call placeholder */}}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call
                      </button>
                      <button
                        onClick={() => handleWhatsApp(sub.email)}
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
                      <button
                        onClick={() => {/* Schedule callback placeholder */}}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Schedule Callback
                      </button>
                      {sub.contactId && (
                        <button
                          onClick={() => handleOpenCard(sub.contactId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open Card
                        </button>
                      )}
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
