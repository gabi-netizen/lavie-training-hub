/**
 * Billing Dashboard Component
 *
 * Displays live subscription data from Zoho Billing API:
 * - Summary cards (Unique Sub Customers, Unique Installment Customers, MRR, Total Active)
 * - Agent breakdown table (unique customers per agent)
 * - Full paginated subscriptions list with filters
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Users,
  TrendingUp,
  Package,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Status badge colours ────────────────────────────────────────────────────
const BILLING_STATUS_STYLES: Record<string, string> = {
  live: "bg-green-100 text-green-800 border border-green-300",
  trial: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  trialing: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  cancelled: "bg-red-100 text-red-800 border border-red-300",
  canceled: "bg-red-100 text-red-800 border border-red-300",
  future: "bg-blue-100 text-blue-800 border border-blue-300",
};

function BillingStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = BILLING_STATUS_STYLES[s] ?? "bg-gray-100 text-gray-900 border border-gray-300";
  const label = s === "trialing" ? "Trial" : s === "canceled" ? "Cancelled" : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

// ─── Sort helpers ────────────────────────────────────────────────────────────
type SortField = "name" | "plan" | "amount" | "status" | "nextBilling" | "salesperson" | "createdAt";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={12} className="text-black opacity-40" />;
  return (
    <ArrowUpDown size={12} className={cn("text-indigo-600", dir === "desc" && "rotate-180")} />
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BillingDashboard() {
  const utils = trpc.useUtils();

  // Filters & pagination state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const perPage = 50;

  // Data queries
  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = trpc.billing.getBillingSummary.useQuery({});

  const {
    data: listData,
    isLoading: listLoading,
    refetch: refetchList,
  } = trpc.billing.getSubscriptionsList.useQuery({
    page,
    perPage,
    status: statusFilter || undefined,
    salesperson: agentFilter || undefined,
    planType: planFilter || undefined,
    search: search || undefined,
  });

  const isLoading = summaryLoading || listLoading;

  // Refresh handler (bypasses cache)
  const handleRefresh = () => {
    utils.billing.getBillingSummary.invalidate();
    utils.billing.getSubscriptionsList.invalidate();
    refetchSummary();
    refetchList();
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Sort subscriptions client-side
  const sortedSubscriptions = [...(listData?.subscriptions ?? [])].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === "amount") {
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
    } else if (sortField === "createdAt" || sortField === "nextBilling") {
      aVal = new Date(aVal || 0).getTime();
      bVal = new Date(bVal || 0).getTime();
    } else {
      aVal = String(aVal || "").toLowerCase();
      bVal = String(bVal || "").toLowerCase();
    }

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil((listData?.total ?? 0) / perPage);

  return (
    <div className="px-4 md:px-8 py-4 md:py-6">
      {/* ── Header with Refresh ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-black">Billing Dashboard</h2>
          <p className="text-sm text-black mt-0.5">Active customers from Zoho Billing (live + unpaid)</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-2 border-gray-900 text-black hover:text-black h-9 font-semibold"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={cn("mr-1.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {summaryLoading ? (
        <div className="flex items-center justify-center h-48 text-black">
          <RefreshCw className="animate-spin mr-2" size={18} /> Loading billing data…
        </div>
      ) : summary ? (
        <>
          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {/* Unique Subscription Customers */}
            <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-green-600 bg-green-50">
                <Users size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-black leading-none">{(summary.uniqueSubCustomers ?? 0).toLocaleString()}</p>
                <p className="text-xs text-black mt-0.5">Customers with Subs</p>
              </div>
            </div>
            {/* Unique Installment Customers */}
            <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-purple-600 bg-purple-50">
                <Package size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-black leading-none">{(summary.uniqueInstallmentCustomers ?? 0).toLocaleString()}</p>
                <p className="text-xs text-black mt-0.5">Customers with Installments</p>
              </div>
            </div>
            {/* MRR */}
            <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-blue-600 bg-blue-50">
                <CreditCard size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-black leading-none">{formatCurrency(summary.mrr ?? 0)}</p>
                <p className="text-xs text-black mt-0.5">MRR (Subs Only)</p>
              </div>
            </div>
            {/* Unpaid */}
            <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-red-400 px-4 py-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-red-600 bg-red-50">
                <CreditCard size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-red-600 leading-none">{(summary.unpaidCount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-black mt-0.5">Unpaid</p>
              </div>
            </div>
            {/* Total Active Customers */}
            <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-yellow-600 bg-yellow-50">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-black leading-none">{(summary.totalActiveCustomers ?? 0).toLocaleString()}</p>
                <p className="text-xs text-black mt-0.5">Total Active Customers</p>
              </div>
            </div>
          </div>

          {/* ── Agent Breakdown Table ── */}
          <div className="bg-white rounded-xl border-2 border-gray-900 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b-2 border-gray-900 bg-gray-50">
              <h3 className="text-sm font-bold text-black uppercase tracking-wide">Agent Breakdown (Unique Customers)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide">Agent</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide">Subscriptions</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide">Installments</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(summary.bySalesperson ?? []).map((row: any) => (
                    <tr key={row.agent} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-black">{row.agent}</td>
                      <td className="px-3 py-3 text-sm text-black text-center">{row.subscriptions}</td>
                      <td className="px-3 py-3 text-sm text-black text-center">{row.installments}</td>
                      <td className="px-3 py-3 text-sm text-black text-center font-semibold">{row.total}</td>
                      <td className="px-4 py-3 text-sm text-black text-right font-semibold">{formatCurrency(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Filters Bar ── */}
          <div className="bg-white rounded-xl border-2 border-gray-900 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b-2 border-gray-900 bg-gray-50 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-bold text-black uppercase tracking-wide mr-4">All Active Subscriptions</h3>
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search name or email…"
                  className="pl-9 bg-white border-gray-300 text-black placeholder:text-black text-sm h-9"
                />
              </div>
              {/* Agent filter */}
              <Select value={agentFilter || "__all__"} onValueChange={(v) => { setAgentFilter(v === "__all__" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-white border-gray-300 text-black text-sm h-9 w-36">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Agents</SelectItem>
                  {(summary.bySalesperson ?? []).map((row: any) => (
                    <SelectItem key={row.agent} value={row.agent}>{row.agent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Type filter (Subscription vs Installment) */}
              <Select value={planFilter || "__all__"} onValueChange={(v) => { setPlanFilter(v === "__all__" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-white border-gray-300 text-black text-sm h-9 w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  <SelectItem value="subscription">Subscriptions Only</SelectItem>
                  <SelectItem value="installment">Installments Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Table ── */}
            {listLoading ? (
              <div className="flex items-center justify-center h-32 text-black">
                <RefreshCw className="animate-spin mr-2" size={16} /> Loading…
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("name")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Customer <SortIcon active={sortField === "name"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-left px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("plan")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Plan <SortIcon active={sortField === "plan"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-right px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("amount")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Amount <SortIcon active={sortField === "amount"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-center px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("status")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Status <SortIcon active={sortField === "status"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-left px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("nextBilling")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Next Billing <SortIcon active={sortField === "nextBilling"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-left px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("salesperson")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Agent <SortIcon active={sortField === "salesperson"} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      className="text-left px-3 py-3 text-xs font-semibold text-black uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => handleSort("createdAt")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Created <SortIcon active={sortField === "createdAt"} dir={sortDir} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedSubscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-black text-sm">
                        No subscriptions found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    sortedSubscriptions.map((sub) => (
                      <tr key={sub.subscriptionId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-black">{sub.name}</div>
                          <div className="text-xs text-black">{sub.email}</div>
                        </td>
                        <td className="px-3 py-3 text-sm text-black">{sub.plan}</td>
                        <td className="px-3 py-3 text-sm text-black text-right font-semibold">{formatCurrency(sub.amount)}</td>
                        <td className="px-3 py-3 text-center">
                          <BillingStatusBadge status={sub.status} />
                        </td>
                        <td className="px-3 py-3 text-sm text-black">{formatDate(sub.nextBilling)}</td>
                        <td className="px-3 py-3 text-sm text-black">{sub.salesperson}</td>
                        <td className="px-3 py-3 text-sm text-black">{formatDate(sub.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          {/* ── Pagination ── */}
          {(listData?.total ?? 0) > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <p className="text-sm text-black">
                Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, listData?.total ?? 0)} of {listData?.total?.toLocaleString()} subscriptions
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 border-gray-300 text-black"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-sm text-black font-semibold">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 border-gray-300 text-black"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-48 text-black">
          Failed to load billing data. Please try refreshing.
        </div>
      )}
    </div>
  );
}
