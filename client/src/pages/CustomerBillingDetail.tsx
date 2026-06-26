/**
 * Customer Billing Detail Page
 *
 * Shows full billing details for a customer when navigating from the Billing Control dashboard.
 * Route: /billing/customer/:id (where :id is the client_subscriptions row id)
 */
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  User,
  Calendar,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Pause,
  Send,
  DollarSign,
  Package,
  FileText,
  MessageSquare,
} from "lucide-react";

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

function daysFromNow(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function monthsSince(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return `${months} month${months !== 1 ? "s" : ""}`;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? "?";
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
  active: "bg-green-100 text-green-800 border border-green-300",
  trial: "bg-blue-100 text-blue-800 border border-blue-300",
  dunning: "bg-red-100 text-red-800 border border-red-300",
  unpaid: "bg-red-100 text-red-800 border border-red-300",
  cancelled: "bg-gray-200 text-gray-700 border border-gray-300",
  canceled: "bg-gray-200 text-gray-700 border border-gray-300",
  future: "bg-purple-100 text-purple-800 border border-purple-300",
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = STATUS_STYLES[s] ?? "bg-gray-200 text-gray-700 border border-gray-300";
  const label = s === "canceled" ? "Cancelled" : s === "live" ? "Active" : s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "processed" || s === "succeeded" || s === "paid") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">Paid</span>;
  }
  if (s === "failed") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">Failed</span>;
  }
  if (s === "refunded") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">Refunded</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">{status}</span>;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CustomerBillingDetail() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/billing/customer/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [noteText, setNoteText] = useState("");

  // Notes query
  const { data: notesData } = trpc.billingDashboard.getBillingNotes.useQuery(
    { subscriptionId: id },
    { enabled: !!id }
  );

  // Add note mutation
  const addNoteMutation = trpc.billingDashboard.addBillingNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      utils.billingDashboard.getBillingNotes.invalidate({ subscriptionId: id });
    },
  });

  const { data, isLoading, error } = trpc.billingDashboard.getCustomerDetail.useQuery(
    { id },
    { enabled: !!id }
  );

  // Shipment history — enabled only when we have the customer's email
  const customerEmail = data?.primary?.email ?? "";
  const {
    data: shipmentData,
    isLoading: shipmentsLoading,
    error: shipmentsError,
  } = trpc.billingDashboard.getShipmentHistory.useQuery(
    { email: customerEmail },
    { enabled: !!customerEmail }
  );

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate({
      subscriptionId: id,
      customerName: data?.primary?.customerName ?? undefined,
      agentName: user?.name ?? "Unknown",
      note: noteText.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="animate-spin mr-2 text-indigo-600" size={20} />
        <span className="text-gray-800 font-medium">Loading customer details…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={32} className="text-red-500" />
        <p className="text-gray-800 font-medium">Customer not found</p>
        <button
          onClick={() => navigate("/billing")}
          className="text-sm font-semibold text-indigo-700 hover:underline"
        >
          ← Back to Billing Control
        </button>
      </div>
    );
  }

  const { primary, allSubscriptions, payments, cardData } = data as any;
  const subscription = allSubscriptions.find((s) => s.planType === "subscription");
  const installment = allSubscriptions.find((s) => s.planType === "installment");

  // Calculate lifetime value from payments
  const lifetimeValue = payments.reduce((sum, p) => {
    if (p.status === "processed" || p.status === "succeeded" || p.status === "paid") {
      return sum + (p.amount ? p.amount / 100 : 0);
    }
    return sum;
  }, 0);

  const nextChargeDays = daysFromNow(primary.nextBillingOn);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* ── Header / Breadcrumb ── */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="text-xs text-gray-500 mb-1">
          Lavie Labs / Billing Control / <span className="text-gray-800 font-medium">{primary.customerName}</span>
        </div>
        <button
          onClick={() => navigate("/billing")}
          className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900 transition"
        >
          <ArrowLeft size={14} />
          Back to Billing Control
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* ── Customer Card ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            {/* Left: Avatar + Info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {getInitials(primary.customerName)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-gray-800">{primary.customerName}</h2>
                  <StatusBadge status={primary.status} />
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-1">
                  {primary.email && (
                    <span className="flex items-center gap-1.5 text-sm text-blue-700">
                      <Mail size={13} />
                      {primary.email}
                    </span>
                  )}
                  {primary.phone && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-800">
                      <Phone size={13} />
                      {primary.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Stat Boxes */}
            <div className="flex flex-wrap gap-3">
              {/* Agent */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 min-w-[130px]">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Agent</div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                    {getInitials(primary.salesPerson)}
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{primary.salesPerson || "—"}</span>
                </div>
              </div>
              {/* Customer Since */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 min-w-[130px]">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer Since</div>
                <div className="text-sm font-semibold text-gray-800">{formatDate(primary.activatedOn)}</div>
                <div className="text-xs text-gray-500">{monthsSince(primary.activatedOn)}</div>
              </div>
              {/* Lifetime Value */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 min-w-[130px]">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Lifetime Value</div>
                <div className="text-sm font-bold text-green-700">{formatCurrency(lifetimeValue)}</div>
                <div className="text-xs text-gray-500">{payments.filter((p) => p.status === "processed" || p.status === "succeeded" || p.status === "paid").length} payments</div>
              </div>
              {/* Stripe Customer */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 min-w-[130px]">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Subscription #</div>
                <div className="text-sm font-semibold text-gray-800">{primary.subscriptionNumber || "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Two Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── Active Subscription Section ── */}
            {subscription && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Active Subscription</h3>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Live
                  </span>
                </div>

                {/* Grid row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan</div>
                    <div className="text-sm font-bold text-gray-800">{subscription.planName || "Subscription"}</div>
                    <div className="text-xs text-gray-500">Every 60 days</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount</div>
                    <div className="text-sm font-bold text-gray-800">{formatCurrency(subscription.amount)}</div>
                    <div className="text-xs text-gray-500">per cycle</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Cycle</div>
                    <div className="text-sm font-bold text-gray-800">#{subscription.currentBillingCycle ?? 1}</div>
                    <div className="text-xs text-gray-500">of ongoing</div>
                  </div>
                </div>

                {/* Grid row 2 (green bg) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Next Charge</div>
                    <div className="text-sm font-bold text-gray-800">{formatDate(subscription.nextBillingOn)}</div>
                    <div className="text-xs text-green-700">
                      {daysFromNow(subscription.nextBillingOn) !== null
                        ? `in ${daysFromNow(subscription.nextBillingOn)} days`
                        : "—"}
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Last Charged</div>
                    <div className="text-sm font-bold text-gray-800">{formatDate(subscription.lastBilledOn)}</div>
                    <div className="text-xs text-green-700">{formatCurrency(subscription.amount)} ✓</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Payment Method</div>
                    <div className="text-sm font-bold text-gray-800">
                      {cardData?.last4
                        ? `${(cardData.brand || "Card").charAt(0).toUpperCase() + (cardData.brand || "card").slice(1)} •••• ${cardData.last4}`
                        : "—"}
                    </div>
                    <div className="text-xs text-gray-800">
                      {cardData?.expMonth && cardData?.expYear
                        ? `Expires ${String(cardData.expMonth).padStart(2, "0")}/${String(cardData.expYear).slice(-2)}`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Subscription Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">Actions:</span>
                  <button className="px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                    Change Amount
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                    Change Date
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50 transition">
                    Pause
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition">
                    Cancel
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
                    Retry Now
                  </button>
                </div>
              </div>
            )}

            {/* ── Installment Plan Section ── */}
            {installment && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Installment Plan</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                    In Progress
                  </span>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan</div>
                    <div className="text-sm font-bold text-gray-800">
                      {installment.billingCycles} × {formatCurrency(installment.amount)}
                    </div>
                    <div className="text-xs text-gray-500">Total: {formatCurrency(installment.totalAmount)}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Next Payment</div>
                    <div className="text-sm font-bold text-gray-800">{formatDate(installment.nextBillingOn)}</div>
                    <div className="text-xs text-gray-500">{formatCurrency(installment.amount)}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Remaining</div>
                    <div className="text-sm font-bold text-gray-800">
                      {formatCurrency(((installment.billingCycles ?? 0) - (installment.currentBillingCycle ?? 0)) * installment.amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(installment.billingCycles ?? 0) - (installment.currentBillingCycle ?? 0)} payments left
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Paid to Date</div>
                    <div className="text-sm font-bold text-green-700">
                      {formatCurrency((installment.currentBillingCycle ?? 0) * installment.amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {installment.currentBillingCycle ?? 0} of {installment.billingCycles ?? 0} paid
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: installment.billingCycles ?? 0 }, (_, i) => {
                      const completed = i < (installment.currentBillingCycle ?? 0);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border",
                            completed
                              ? "bg-green-100 text-green-700 border-green-300"
                              : "bg-gray-100 text-gray-500 border-gray-300"
                          )}
                        >
                          {completed ? "✓" : i + 1}
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${installment.billingCycles ? ((installment.currentBillingCycle ?? 0) / installment.billingCycles) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Installment Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">Actions:</span>
                  <button className="px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                    Skip Payment
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                    Change Date
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
                    Pay Off Early
                  </button>
                  <button className="px-3 py-1.5 text-xs font-bold text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition">
                    Cancel Plan
                  </button>
                </div>
              </div>
            )}

            {/* ── Payment History Section ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Payment History</h3>
                <span className="text-xs font-semibold text-gray-500">{payments.length} total payments</span>
              </div>

              {payments.length === 0 ? (
                <p className="text-sm text-gray-500">No payment records found.</p>
              ) : (
                <div className="space-y-2">
                  {payments.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          p.status === "processed" || p.status === "succeeded" || p.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : p.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        )}>
                          {p.status === "processed" || p.status === "succeeded" || p.status === "paid" ? (
                            <CheckCircle size={14} />
                          ) : p.status === "failed" ? (
                            <XCircle size={14} />
                          ) : (
                            <CreditCard size={14} />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            {p.amount ? formatCurrency(p.amount / 100) : "—"} — {formatEventType(p.eventType)}
                            {p.source === "max_billing" && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200">
                                Max Billing
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{p.subscriptionId}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <PaymentStatusBadge status={p.status} />
                        <span className="text-xs text-gray-500">{formatDate(p.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payments.length > 8 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 transition">
                    View all {payments.length} payments →
                  </button>
                </div>
              )}
            </div>

            {/* ── Shipment History Section ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Shipment History</h3>
                <span className="text-xs font-semibold text-gray-500">via Mintsoft</span>
              </div>

              {shipmentsLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <RefreshCw className="animate-spin text-indigo-600" size={14} />
                  Loading shipments…
                </div>
              )}

              {!shipmentsLoading && shipmentsError && (
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <AlertTriangle size={14} />
                  Failed to load shipments: {shipmentsError.message}
                </div>
              )}

              {!shipmentsLoading && !shipmentsError && (!shipmentData || shipmentData.length === 0) && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <Package size={16} className="text-gray-400" />
                  No shipment records found.
                </div>
              )}

              {!shipmentsLoading && !shipmentsError && shipmentData && shipmentData.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Order #</th>
                        <th className="text-left text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Date</th>
                        <th className="text-left text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Status</th>
                        <th className="text-left text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Courier</th>
                        <th className="text-left text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Tracking</th>
                        <th className="text-right text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2 pr-4">Items</th>
                        <th className="text-right text-[11px] font-semibold text-gray-800 uppercase tracking-wide pb-2">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shipmentData.map((shipment) => {
                        const getShipmentBadgeCls = (s: string) => {
                          switch (s.toLowerCase()) {
                            case "despatched":
                            case "dispatched": return "bg-green-100 text-green-800 border border-green-300";
                            case "new": return "bg-blue-100 text-blue-800 border border-blue-300";
                            case "picked":
                            case "packed":
                            case "picking started": return "bg-indigo-100 text-indigo-800 border border-indigo-300";
                            case "printed":
                            case "processing": return "bg-cyan-100 text-cyan-800 border border-cyan-300";
                            case "cancelled": return "bg-red-100 text-red-800 border border-red-300";
                            case "failed":
                            case "fraud risk": return "bg-red-100 text-red-800 border border-red-300";
                            case "invoice failed": return "bg-orange-100 text-orange-800 border border-orange-300";
                            case "invoiced": return "bg-emerald-100 text-emerald-800 border border-emerald-300";
                            case "on backorder":
                            case "holding":
                            case "pack and hold": return "bg-yellow-100 text-yellow-800 border border-yellow-300";
                            case "awaiting confirmation":
                            case "awaiting documentation":
                            case "awaiting payment":
                            case "awaiting picking":
                            case "awaiting replen": return "bg-amber-100 text-amber-800 border border-amber-300";
                            case "query raised": return "bg-purple-100 text-purple-800 border border-purple-300";
                            case "picking skipped":
                            case "rebinned": return "bg-gray-100 text-gray-700 border border-gray-300";
                            default: return "bg-gray-100 text-gray-700 border border-gray-300";
                          }
                        };
                        const badgeCls = getShipmentBadgeCls(shipment.status);

                        return (
                          <tr key={shipment.orderNumber} className="hover:bg-gray-50 transition">
                            <td className="py-2.5 pr-4 font-semibold text-gray-800">{shipment.orderNumber}</td>
                            <td className="py-2.5 pr-4 text-gray-800">{formatDate(shipment.orderDate)}</td>
                            <td className="py-2.5 pr-4">
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", badgeCls)}>
                                {shipment.status}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-gray-800">{shipment.courierService || "—"}</td>
                            <td className="py-2.5 pr-4">
                              {shipment.trackingUrl ? (
                                <a
                                  href={shipment.trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-700 font-semibold hover:underline"
                                >
                                  {shipment.trackingNumber || "Track"}
                                </a>
                              ) : shipment.trackingNumber ? (
                                <span className="text-gray-800">{shipment.trackingNumber}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-800">{shipment.totalItems}</td>
                            <td className="py-2.5 text-right font-semibold text-gray-800">{formatCurrency(shipment.orderValue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Agent Notes Section (full width) ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Agent Notes</h3>
                <span className="text-xs text-gray-500">{notesData?.notes?.length ?? 0} notes</span>
              </div>

              {/* Existing callback note from subscription */}
              {primary.callbackNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={13} className="text-amber-700" />
                    <span className="text-xs font-semibold text-amber-700">
                      {primary.retentionAgent || primary.salesPerson || "Agent"}
                    </span>
                    {primary.callbackAt && (
                      <span className="text-xs text-gray-500">• {formatDate(primary.callbackAt)}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800">{primary.callbackNote}</p>
                </div>
              )}

              {/* Saved notes from billing_notes table */}
              {notesData?.notes && notesData.notes.length > 0 && (
                <div className="space-y-3 mb-4">
                  {notesData.notes.map((n) => (
                    <div key={n.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare size={13} className="text-indigo-600" />
                        <span className="text-xs font-semibold text-indigo-700">{n.agentName}</span>
                        <span className="text-xs text-gray-500">• {formatDate(n.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-800">{n.note}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new note form */}
              <div className="space-y-3">
                <textarea
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  rows={3}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addNoteMutation.isPending ? "Saving…" : "Add Note"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (sidebar 1/3) */}
          <div className="space-y-6">
            {/* ── Quick Actions Card ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Quick Actions</h3>

              {/* Send Card Update Link */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Send Card Update Link</div>
                <p className="text-xs text-gray-500">Email a secure link to update payment details.</p>
                <button className="w-full px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition flex items-center justify-center gap-1.5">
                  <Send size={12} />
                  Send Email Now
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Retry Payment Now */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Retry Payment Now</div>
                <p className="text-xs text-gray-500">Attempt to charge the customer immediately.</p>
                <button className="w-full px-3 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
                  Retry {formatCurrency(primary.amount)}
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Pause Subscription */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Pause Subscription</div>
                <p className="text-xs text-gray-500">Temporarily pause billing.</p>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <button className="w-full px-3 py-2 text-xs font-bold text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50 transition">
                  Pause Subscription
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Change Billing Cycle */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Change Billing Cycle</div>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="30">Every 30 days</option>
                  <option value="60">Every 60 days</option>
                  <option value="90">Every 90 days</option>
                </select>
                <button className="w-full px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                  Update Cycle
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Change Amount */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Change Amount</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">£</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <button className="w-full px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                  Update Amount
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Change Next Charge Date */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Change Next Charge Date</div>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button className="w-full px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                  Update Date
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Issue Refund */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Issue Refund</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">£</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="">Select reason…</option>
                  <option value="duplicate">Duplicate charge</option>
                  <option value="customer_request">Customer request</option>
                  <option value="product_issue">Product issue</option>
                  <option value="other">Other</option>
                </select>
                <button className="w-full px-3 py-2 text-xs font-bold text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition">
                  Issue Refund
                </button>
              </div>

              <hr className="border-gray-100" />

              {/* Cancel Subscription */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Cancel Subscription</div>
                <p className="text-xs text-red-600">This will permanently cancel the subscription. This action cannot be undone.</p>
                <button className="w-full px-3 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition">
                  Cancel Subscription
                </button>
              </div>
            </div>

            {/* ── Subscription Timeline Card ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Subscription Timeline</h3>
              <div className="relative pl-6 space-y-5">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200" />

                {/* Next charge */}
                {subscription && subscription.nextBillingOn && (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Next charge</div>
                      <div className="text-xs text-gray-500">
                        {formatDate(subscription.nextBillingOn)} • {formatCurrency(subscription.amount)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Next installment */}
                {installment && installment.nextBillingOn && (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        Instalment #{(installment.currentBillingCycle ?? 0) + 1}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(installment.nextBillingOn)} • {formatCurrency(installment.amount)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Last charge */}
                {primary.lastBilledOn && (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow" />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Last charge ✓</div>
                      <div className="text-xs text-gray-500">
                        {formatDate(primary.lastBilledOn)} • {formatCurrency(primary.amount)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer since */}
                {primary.activatedOn && (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full bg-gray-300 border-2 border-white shadow" />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Customer since</div>
                      <div className="text-xs text-gray-500">{formatDate(primary.activatedOn)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
