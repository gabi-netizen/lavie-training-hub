/**
 * Billing Dashboard - Work Tool
 *
 * Compact viewport-fit layout with:
 * - Summary cards (clickable for drill-down)
 * - Sticky filters bar (date range, type, agent, cycles)
 * - Agent table sorted by revenue (scrollable, max 200px)
 * - Drill-down customer list (hidden by default, opens on click)
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw,
  Users,
  CreditCard,
  TrendingUp,
  Package,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Date Range Presets ─────────────────────────────────────────────────────
type DatePreset = "all" | "today" | "yesterday" | "this_week" | "last_7_days" | "this_month" | "last_3_months" | "this_year" | "previous_month" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "this_year", label: "This Year" },
  { value: "previous_month", label: "Previous Month" },
];

function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === "all") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  let to: Date = new Date(today.getTime() + 86400000 - 1); // end of today

  switch (preset) {
    case "today":
      from = today;
      break;
    case "yesterday":
      from = new Date(today.getTime() - 86400000);
      to = new Date(today.getTime() - 1);
      break;
    case "this_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      from = new Date(today.getTime() - diff * 86400000);
      break;
    }
    case "last_7_days":
      from = new Date(today.getTime() - 7 * 86400000);
      break;
    case "this_month":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "last_3_months":
      from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      break;
    case "this_year":
      from = new Date(today.getFullYear(), 0, 1);
      break;
    case "previous_month":
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
      break;
    default:
      return null;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

// ─── Status badge ───────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  live: "bg-green-100 text-green-800 border border-green-300",
  unpaid: "bg-red-100 text-red-800 border border-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = STATUS_STYLES[s] ?? "bg-gray-100 text-gray-900 border border-gray-300";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", cls)}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

function TypeBadge({ plan }: { plan: string }) {
  const isInstallment = /installment/i.test(plan);
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
      isInstallment ? "bg-purple-100 text-purple-800 border border-purple-300" : "bg-green-100 text-green-800 border border-green-300"
    )}>
      {isInstallment ? "Installment" : "Subscription"}
    </span>
  );
}

// ─── Format helpers ─────────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Drill-down context ─────────────────────────────────────────────────────
interface DrillDown {
  title: string;
  filterFn: (sub: any) => boolean;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function BillingDashboard() {
  const utils = trpc.useUtils();

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "subscription" | "installment">("all");
  const [agentFilter, setAgentFilter] = useState("");

  // Drill-down state
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);

  // Data
  const { data: summary, isLoading, refetch } = trpc.billing.getBillingSummary.useQuery({});
  const { data: listData, isLoading: listLoading, refetch: refetchList } = trpc.billing.getSubscriptionsList.useQuery({
    page: 1,
    perPage: 200,
    salesperson: agentFilter || undefined,
    planType: typeFilter === "all" ? undefined : typeFilter,
  });

  const handleRefresh = () => {
    utils.billing.getBillingSummary.invalidate();
    utils.billing.getSubscriptionsList.invalidate();
    refetch();
    refetchList();
  };

  // Filter subscriptions by date range
  const filteredSubscriptions = useMemo(() => {
    let subs = listData?.subscriptions ?? [];
    const range = getDateRange(datePreset);
    if (range) {
      const fromTime = new Date(range.from).getTime();
      const toTime = new Date(range.to).getTime();
      subs = subs.filter((s) => {
        const created = new Date(s.createdAt).getTime();
        return created >= fromTime && created <= toTime;
      });
    }
    return subs;
  }, [listData, datePreset]);

  // Agent stats from summary, sorted by revenue high to low
  const agentStats = useMemo(() => {
    return [...(summary?.bySalesperson ?? [])].sort((a, b) => b.revenue - a.revenue);
  }, [summary]);

  // Drill-down filtered list
  const drillDownList = useMemo(() => {
    if (!drillDown) return [];
    return filteredSubscriptions.filter(drillDown.filterFn);
  }, [drillDown, filteredSubscriptions]);

  // Open drill-down
  const openDrillDown = (title: string, filterFn: (sub: any) => boolean) => {
    setDrillDown({ title, filterFn });
  };

  const closeDrillDown = () => setDrillDown(null);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-black">Billing Dashboard</h2>
          <p className="text-xs text-gray-600">Live data from Zoho Billing</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-2 border-gray-900 text-black h-8 font-semibold"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={cn("mr-1.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-black">
          <RefreshCw className="animate-spin mr-2" size={18} /> Loading billing data…
        </div>
      ) : summary ? (
        <div className="flex flex-col flex-1 overflow-hidden px-4">
          {/* ── Summary Cards (clickable) ── */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 shrink-0">
            {/* 1. Live Trial */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-orange-500 transition-colors", drillDown?.title === "Live Trial Customers" ? "border-orange-500" : "border-gray-900")}
              onClick={() => openDrillDown("Live Trial Customers", (s) => s.status?.toLowerCase() === "live" && s.amount === 4.95 && !/installment/i.test(s.plan))}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-orange-600 bg-orange-50">
                <Users size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-black leading-none">{(summary.uniqueTrialCustomers ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-600">Live Trial</p>
              </div>
            </div>

            {/* 2. Live Sub */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-green-500 transition-colors", drillDown?.title === "Live Sub Customers" ? "border-green-500" : "border-gray-900")}
              onClick={() => openDrillDown("Live Sub Customers", (s) => s.status?.toLowerCase() === "live" && s.amount > 4.95 && !/installment/i.test(s.plan))}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-green-600 bg-green-50">
                <Users size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-black leading-none">{(summary.uniqueLiveSubCustomers ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-600">Live Sub</p>
              </div>
            </div>

            {/* 3. Installments */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-purple-500 transition-colors", drillDown?.title === "Installment Customers" ? "border-purple-500" : "border-gray-900")}
              onClick={() => openDrillDown("Installment Customers", (s) => /installment/i.test(s.plan))}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-purple-600 bg-purple-50">
                <Package size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-black leading-none">{(summary.uniqueInstallmentCustomers ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-600">Installments</p>
              </div>
            </div>

            {/* 4. MRR (excludes trials) */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-blue-500 transition-colors", drillDown?.title === "MRR Breakdown" ? "border-blue-500" : "border-gray-900")}
              onClick={() => openDrillDown("MRR Breakdown", (s) => s.status?.toLowerCase() === "live" && s.amount > 4.95 && !/installment/i.test(s.plan))}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-blue-600 bg-blue-50">
                <CreditCard size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-black leading-none">{formatCurrency(summary.mrr ?? 0)}</p>
                <p className="text-[10px] text-gray-600">MRR</p>
              </div>
            </div>

            {/* 5. Unpaid */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-red-500 transition-colors", drillDown?.title === "Unpaid Customers" ? "border-red-500" : "border-gray-900")}
              onClick={() => openDrillDown("Unpaid Customers", (s) => s.status?.toLowerCase() === "unpaid")}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-red-600 bg-red-50">
                <CreditCard size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-red-600 leading-none">{(summary.unpaidCount ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-600">Unpaid</p>
              </div>
            </div>

            {/* 6. Total Active */}
            <div
              className={cn("flex items-center gap-2 bg-white rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer hover:border-yellow-500 transition-colors", drillDown?.title === "All Active Customers" ? "border-yellow-500" : "border-gray-900")}
              onClick={() => openDrillDown("All Active Customers", () => true)}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-yellow-600 bg-yellow-50">
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-black leading-none">{(summary.totalActiveCustomers ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-600">Total Active</p>
              </div>
            </div>
          </div>

          {/* ── Filters Bar ── */}
          <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
            {/* Date Range */}
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="bg-white border-gray-300 text-black text-xs h-8 w-36">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type Toggle */}
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              {(["all", "subscription", "installment"] as const).map((t) => (
                <button
                  key={t}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold transition-colors",
                    typeFilter === t ? "bg-gray-900 text-white" : "bg-white text-black hover:bg-gray-100"
                  )}
                  onClick={() => { setTypeFilter(t); setDrillDown(null); }}
                >
                  {t === "all" ? "All" : t === "subscription" ? "Subs" : "Installments"}
                </button>
              ))}
            </div>

            {/* Agent Filter */}
            <Select value={agentFilter || "__all__"} onValueChange={(v) => { setAgentFilter(v === "__all__" ? "" : v); setDrillDown(null); }}>
              <SelectTrigger className="bg-white border-gray-300 text-black text-xs h-8 w-32">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Agents</SelectItem>
                {agentStats.map((row) => (
                  <SelectItem key={row.agent} value={row.agent}>{row.agent}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Agent Table (scrollable, max 200px) ── */}
          <div className="bg-white rounded-lg border-2 border-gray-900 shadow-sm overflow-hidden mb-3 shrink-0">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-black uppercase tracking-wide">Agents (by Revenue)</h3>
              <ChevronDown size={14} className="text-gray-400" />
            </div>
            <div className="overflow-y-auto max-h-[200px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-semibold text-black">Agent</th>
                    <th className="text-center px-2 py-2 font-semibold text-black">Trials</th>
                    <th className="text-center px-2 py-2 font-semibold text-black">Subs</th>
                    <th className="text-center px-2 py-2 font-semibold text-black">Install.</th>
                    <th className="text-center px-2 py-2 font-semibold text-black">Total</th>
                    <th className="text-right px-3 py-2 font-semibold text-black">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agentStats.map((row) => (
                    <tr
                      key={row.agent}
                      className="hover:bg-indigo-50 cursor-pointer transition-colors"
                      onClick={() => openDrillDown(`${row.agent}'s Customers`, (s) => s.salesperson === row.agent)}
                    >
                      <td className="px-3 py-2 font-semibold text-black">{row.agent}</td>
                      <td
                        className="px-2 py-2 text-center text-orange-700 font-semibold cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); openDrillDown(`${row.agent} - Trials`, (s) => s.salesperson === row.agent && s.status?.toLowerCase() === "live" && s.amount === 4.95 && !/installment/i.test(s.plan)); }}
                      >
                        {row.trials}
                      </td>
                      <td
                        className="px-2 py-2 text-center text-green-700 font-semibold cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); openDrillDown(`${row.agent} - Subscriptions`, (s) => s.salesperson === row.agent && s.status?.toLowerCase() === "live" && s.amount > 4.95 && !/installment/i.test(s.plan)); }}
                      >
                        {row.subscriptions}
                      </td>
                      <td
                        className="px-2 py-2 text-center text-purple-700 font-semibold cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); openDrillDown(`${row.agent} - Installments`, (s) => s.salesperson === row.agent && /installment/i.test(s.plan)); }}
                      >
                        {row.installments}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-black">{row.total}</td>
                      <td className="px-3 py-2 text-right font-semibold text-black">{formatCurrency(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Drill-Down Customer List (hidden by default) ── */}
          {drillDown && (
            <div className="flex-1 overflow-hidden bg-white rounded-lg border-2 border-gray-900 shadow-sm flex flex-col">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-black uppercase tracking-wide">{drillDown.title}</h3>
                  <span className="text-xs text-gray-500">({drillDownList.length} customers)</span>
                </div>
                <button onClick={closeDrillDown} className="p-1 hover:bg-gray-200 rounded transition-colors">
                  <X size={14} className="text-gray-600" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {listLoading ? (
                  <div className="flex items-center justify-center h-20 text-black text-xs">
                    <RefreshCw className="animate-spin mr-2" size={14} /> Loading…
                  </div>
                ) : drillDownList.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-gray-500 text-xs">
                    No customers found for this filter.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-black">Customer</th>
                        <th className="text-left px-2 py-2 font-semibold text-black">Type</th>
                        <th className="text-left px-2 py-2 font-semibold text-black">Plan</th>
                        <th className="text-right px-2 py-2 font-semibold text-black">Amount</th>
                        <th className="text-center px-2 py-2 font-semibold text-black">Status</th>
                        <th className="text-left px-2 py-2 font-semibold text-black">Agent</th>
                        <th className="text-left px-2 py-2 font-semibold text-black">Next Billing</th>
                        <th className="text-left px-3 py-2 font-semibold text-black">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {drillDownList.map((sub) => (
                        <tr key={sub.subscriptionId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-black">{sub.name}</div>
                            <div className="text-gray-500">{sub.email}</div>
                          </td>
                          <td className="px-2 py-2"><TypeBadge plan={sub.plan} /></td>
                          <td className="px-2 py-2 text-black max-w-[120px] truncate">{sub.plan}</td>
                          <td className="px-2 py-2 text-right font-semibold text-black">{formatCurrency(sub.amount)}</td>
                          <td className="px-2 py-2 text-center"><StatusBadge status={sub.status} /></td>
                          <td className="px-2 py-2 text-black">{sub.salesperson}</td>
                          <td className="px-2 py-2 text-black">{formatDate(sub.nextBilling)}</td>
                          <td className="px-3 py-2 text-black">{formatDate(sub.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Empty state when no drill-down ── */}
          {!drillDown && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Click on any card or agent row to view customer details
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center flex-1 text-black">
          Failed to load billing data. Please try refreshing.
        </div>
      )}
    </div>
  );
}
