import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Phone, MessageCircle, Mail, MessageSquare, Calendar, RotateCcw, RefreshCw, ChevronRight } from "lucide-react";
import { useCheckboxSelection } from "@/hooks/useCheckboxSelection";
import { BulkMessagingBar } from "@/components/BulkMessagingBar";
import { BulkTemplateModal } from "@/components/BulkTemplateModal";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface CancelTabProps {
  agentName?: string;
  onWhatsApp?: (contactId: number, phone: string, name: string) => void;
  onSms?: (contactId: number, phone: string, name: string) => void;
  onEmail?: (contactId: number, name: string, email: string) => void;
  onCallback?: (subscriptionId: string, contactName: string) => void;
  onFollowUp?: (subscriptionId: string, contactName: string) => void;
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

/**
 * Calculate "Paid So Far" = setupFee + (recurringAmount × cyclesCompleted)
 */
function calcPaidSoFar(sub: MyClientSubscription): number {
  const setup = sub.setupFee ?? 0;
  const recurring = sub.recurringAmount ?? 0;
  let cycles = sub.currentBillingCycle ?? 0;
  if (cycles === 0 && sub.lastBilledOn) {
    cycles = 1;
  }
  return setup + recurring * cycles;
}

/**
 * Calculate "Remaining" = totalAmount - paidSoFar
 */
function calcRemaining(sub: MyClientSubscription): number | null {
  if (sub.totalAmount == null) return null;
  const paid = calcPaidSoFar(sub);
  return Math.max(0, sub.totalAmount - paid);
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function CancelTab({ agentName, onWhatsApp, onSms, onEmail, onCallback, onFollowUp, onOpenCard }: CancelTabProps) {
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

  // Fetch cancelled subscriptions sorted by cancelledDate DESC
  const { data, isLoading, isFetching, refetch } = trpc.billing.getMyClientsData.useQuery(
    {
      ...(agentName ? { salesperson: agentName } : {}),
      status: "cancelled",
      search: search || undefined,
      page,
      perPage: 50,
      sortBy: "cancelledDate",
    },
    { refetchOnWindowFocus: false, placeholderData: (prev: any) => prev }
  );

  const subscriptions: MyClientSubscription[] = data?.subscriptions ?? [];
  const summary = data?.summary ?? { total: 0, live: 0, dunning: 0, cancelled: 0, future: 0, expired: 0, unpaid: 0 };
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  // ─── Action Handlers ────────────────────────────────────────────────────────

  const handleCall = (phone: string | null) => {
    if (phone) window.open(`tel:${phone}`, "_blank");
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">


      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-[240px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
        />
        <button
          onClick={() => { setSearch(""); setPage(1); }}
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
          Showing {subscriptions.length} of {totalCount} cancelled subscriptions
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
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <Calendar className="h-7 w-7 text-green-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No cancelled subscriptions</h3>
          <p className="text-sm text-gray-600 max-w-sm">
            No cancelled subscriptions found for your clients.
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
          {/* Table Header — 10 columns */}
          <div
            className="grid items-center gap-1 px-3 py-3 border-b border-gray-200 bg-gray-50 min-w-[1240px]"
            style={{ gridTemplateColumns: "36px 40px 160px 180px 150px 90px 90px 90px 110px 140px" }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={isAllSelected(subscriptions.map(s => s.subscriptionId))}
                onChange={() => toggleAll(subscriptions.map(s => s.subscriptionId))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">#</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Customer Name</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Email</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Plan Name</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Total Value</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Paid So Far</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Remaining</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Cancel Date</div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Actions</div>
          </div>

          {/* Table Body */}
          {subscriptions.map((sub, idx) => {
            const isExpanded = expandedRow === sub.subscriptionId;
            const paidSoFar = calcPaidSoFar(sub);
            const remaining = calcRemaining(sub);

            return (
              <div key={sub.subscriptionId}>
                <div
                  onClick={() => setExpandedRow(isExpanded ? null : sub.subscriptionId)}
                  className={`grid items-center gap-1 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 min-w-[1240px] ${
                    isExpanded ? "bg-blue-50" : ""} ${isSelected(sub.subscriptionId) ? "ring-2 ring-inset ring-blue-400 bg-blue-50" : ""}`}
                  style={{ gridTemplateColumns: "36px 40px 160px 180px 150px 90px 90px 90px 110px 140px" }}
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
                  {/* # */}
                  <div className="text-sm text-gray-800">{(page - 1) * 50 + idx + 1}</div>

                  {/* Customer Name */}
                  <div
                    className="text-sm font-semibold text-blue-700 truncate cursor-pointer hover:underline"
                    title={sub.customerName}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sub.contactId) {
                        window.location.href = `/contacts/${sub.contactId}?from=retention&agent=${encodeURIComponent(agentName || "Rob")}&subId=${encodeURIComponent(sub.subscriptionId)}&tab=cancel`;
                      }
                    }}
                  >
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

                  {/* Total Value */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(sub.totalAmount)}
                  </div>

                  {/* Paid So Far */}
                  <div className="text-xs font-medium text-slate-800">
                    {formatCurrency(paidSoFar)}
                  </div>

                  {/* Remaining */}
                  <div className="text-xs font-medium text-orange-700">
                    {remaining != null ? formatCurrency(remaining) : "—"}
                  </div>

                  {/* Cancel Date */}
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
                      className={`p-1.5 rounded hover:bg-green-50 transition-colors ${sub.contactId ? "text-green-600" : "text-slate-800"}`}
                      title="WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSms(sub)}
                      disabled={!sub.contactId || !sub.phone}
                      className={`p-1.5 rounded hover:bg-blue-50 transition-colors ${sub.contactId && sub.phone ? "text-blue-600" : "text-slate-800 opacity-50 cursor-not-allowed"}`}
                      title="SMS"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEmail(sub)}
                      disabled={!sub.email}
                      className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${sub.email ? "text-gray-600" : "text-gray-300 pointer-events-none"}`}
                      title="Email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenCard(sub)}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
                      title="Open card"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 min-w-[1200px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Subscription #</div>
                        <div className="text-sm font-medium text-slate-900">{sub.subscriptionNumber || "—"}</div>
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
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Payment Progress</div>
                        <div className="text-sm font-medium text-slate-900">
                          {sub.billingCycles != null
                            ? `${sub.currentBillingCycle ?? 0} of ${sub.billingCycles} payments`
                            : "Recurring (no fixed end)"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Phone</div>
                        <div className="text-sm font-medium text-slate-900">{sub.phone || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Campaign</div>
                        <div className="text-sm font-medium text-slate-900">{sub.campaignId || "—"}</div>
                      </div>
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
    </div>
  );
}
