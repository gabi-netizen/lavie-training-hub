import React, { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw,
  Search,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckSquare,
  Square,
  X,
  SlidersHorizontal,
  Download,
  Users,
  AlertTriangle,
  ShieldCheck,
  Handshake,
  Clock,
  CalendarPlus,
  Inbox,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Lead type badge styles — matched exactly to the Google Sheet screenshot
// ─────────────────────────────────────────────────────────────────────────────
function getLeadTypeBadge(
  leadType: string,
  daysSinceEvent: number
): { bg: string; text: string; label: string; rowTint: string } {
  if (leadType === "live_sub_healthy" && daysSinceEvent >= 14) {
    return { bg: "bg-[#8b5cf6]", text: "text-white", label: "Live Sub 14 Days +", rowTint: "bg-white" };
  }
  if (leadType === "live_sub_healthy" && daysSinceEvent >= 7) {
    return { bg: "bg-[#a78bfa]", text: "text-white", label: "Live Sub 7 Days", rowTint: "bg-white" };
  }
  const map: Record<string, { bg: string; text: string; label: string; rowTint: string }> = {
    pre_cycle_decline:      { bg: "bg-[#1a1a1a]",  text: "text-white",      label: "Pre-Cycle-Decline",   rowTint: "bg-white" },
    pre_cycle_cancelled:    { bg: "bg-[#22c55e]",  text: "text-white",      label: "Pre-Cycle-Cancelled", rowTint: "bg-white" },
    live_sub_critical:      { bg: "bg-[#7c3aed]",  text: "text-white",      label: "Live Sub Decline",    rowTint: "bg-white" },
    live_sub_at_risk:       { bg: "bg-[#1e3a8a]",  text: "text-white",      label: "Live Sub 2nd +",      rowTint: "bg-white" },
    live_sub_healthy:       { bg: "bg-[#4c1d95]",  text: "text-white",      label: "Live Sub 3 Days",     rowTint: "bg-white" },
    installment_first_fail: { bg: "bg-[#84cc16]",  text: "text-white",      label: "Instalment Decline",  rowTint: "bg-white" },
    installment_defaulted:  { bg: "bg-[#84cc16]",  text: "text-white",      label: "Instalment Decline",  rowTint: "bg-white" },
    installment_finished:   { bg: "bg-[#166534]",  text: "text-white",      label: "End of Instalment",   rowTint: "bg-white" },
    installment_returned:   { bg: "bg-[#6b7280]",  text: "text-white",      label: "Instalment Returned", rowTint: "bg-white" },
    installment_active:     { bg: "bg-[#166534]",  text: "text-white",      label: "Instalment Active",   rowTint: "bg-white" },
    cycle_1:                { bg: "bg-[#bfdbfe]",  text: "text-[#1e3a8a]", label: "Cycle 1",             rowTint: "bg-white" },
    cycle_2:                { bg: "bg-[#451a03]",  text: "text-white",      label: "Cancel 2+ Cycle",     rowTint: "bg-white" },
    cycle_3_plus:           { bg: "bg-[#451a03]",  text: "text-white",      label: "Cancel 2+ Cycle",     rowTint: "bg-white" },
    from_cat_to_rob:        { bg: "bg-[#92400e]",  text: "text-white",      label: "From Cat to Rob",     rowTint: "bg-white" },
    trial_active:           { bg: "bg-[#7c3aed]",  text: "text-white",      label: "Trial Active",        rowTint: "bg-white" },
    trial_expired:          { bg: "bg-[#6d28d9]",  text: "text-white",      label: "Trial Expired",       rowTint: "bg-white" },
  };
  return map[leadType] || { bg: "bg-gray-200", text: "text-gray-700", label: leadType, rowTint: "bg-white" };
}

// Lead Status — derived from assignedAgent (read-only badge)
const LEAD_STATUS_OPTIONS = [
  { value: "new",      label: "New",      bg: "bg-gray-100",  text: "text-gray-600" },
  { value: "assigned", label: "Assigned", bg: "bg-blue-100",  text: "text-blue-700" },
];

function getLeadStatus(assignedAgent: string | null | undefined) {
  return assignedAgent ? LEAD_STATUS_OPTIONS[1] : LEAD_STATUS_OPTIONS[0];
}

// Work Status — what the agent did with the lead (editable dropdown)
const STATUS_OPTIONS = [
  { value: "in_progress",    label: "In Progress",    bg: "bg-yellow-100", text: "text-yellow-800" },
  { value: "retained",       label: "Retained Sub",   bg: "bg-green-100",  text: "text-green-700" },
  { value: "done_deal",      label: "Done Deal",      bg: "bg-green-200",  text: "text-green-800" },
  { value: "future_deal",    label: "Future Deal",    bg: "bg-indigo-100", text: "text-indigo-700" },
  { value: "dont_assign",    label: "Don't Assign",   bg: "bg-red-200",    text: "text-red-800" },
  { value: "not_interested", label: "Not Interested", bg: "bg-red-100",    text: "text-red-600" },
  { value: "no_answer",      label: "No Answer",      bg: "bg-orange-100", text: "text-orange-700" },
  { value: "callback",       label: "Callback",       bg: "bg-purple-100", text: "text-purple-700" },
  { value: "follow_up",      label: "Follow-up",      bg: "bg-sky-100",    text: "text-sky-700" },
  { value: "whatsapp_queue", label: "WhatsApp Queue", bg: "bg-teal-100",   text: "text-teal-700" },
  { value: "cancelled_sub",  label: "Cancelled Sub",  bg: "bg-red-100",    text: "text-red-700" },
  { value: "archived",       label: "Archived",       bg: "bg-gray-100",   text: "text-gray-600" },
];

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || { value: status, label: status, bg: "bg-gray-100", text: "text-gray-600" };
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatCurrency(amount: number | null | undefined, currency = "GBP") {
  if (!amount && amount !== 0) return "\u2014";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const AGENTS = ["Guy", "Rob"];

// ─────────────────────────────────────────────────────────────────────────────
// Notes Cell — inline note editor (for Agent Note column)
// ─────────────────────────────────────────────────────────────────────────────
function NotesCell({
  managerNote,
  agentNote,
  subscriptionId,
  onSaveNote,
}: {
  managerNote?: string | null;
  agentNote?: string | null;
  subscriptionId: string;
  onSaveNote: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(managerNote || "");
  const [editing, setEditing] = useState(false);

  const displayText = agentNote || "";

  return (
    <div className="relative">
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            setEditValue(managerNote || "");
          }}
          title={displayText || undefined}
          className="flex items-start gap-1 text-left w-full group"
        >
          <span className="text-sm text-gray-800 truncate max-w-[200px] block leading-snug">
            {displayText || <span className="text-gray-400 italic">Add note...</span>}
          </span>
          <FileText className="h-3.5 w-3.5 text-gray-400 group-hover:text-blue-400 shrink-0 mt-0.5" />
        </button>
      )}

      {open && (
        <div
          className="absolute z-[9999] left-0 top-0 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl p-3"
          style={{ isolation: "isolate", background: "#ffffff" }}
        >
          {editing ? (
            <div>
              <textarea
                className="w-full text-sm border border-gray-200 rounded p-1.5 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                placeholder="Manager note..."
              />
              <div className="flex gap-1.5 mt-1.5">
                <Button
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    onSaveNote(editValue);
                    setEditing(false);
                    setOpen(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {agentNote && (
                <div className="mb-2 p-2 bg-amber-50 rounded text-sm text-amber-800 border border-amber-100">
                  <p className="font-semibold text-amber-500 uppercase text-[10px] mb-0.5">Agent Note</p>
                  <p>{agentNote}</p>
                </div>
              )}
              {managerNote && (
                <div className="mb-2 p-2 bg-blue-50 rounded text-sm text-blue-800 border border-blue-100">
                  <p className="font-semibold text-blue-500 uppercase text-[10px] mb-0.5">Manager Note</p>
                  <p>{managerNote}</p>
                </div>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditing(true)}
                >
                  {managerNote ? "Edit note" : "Add note"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-gray-500"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<
    "today" | "yesterday" | "7days" | "this_month" | "custom" | "all"
  >("this_month");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState<string>("");

  const {
    data: leadsData,
    isLoading,
    refetch,
    isFetching,
  } = trpc.manager.getLeads.useQuery(
    {
      page: 1,
      perPage: 200,
      search: search || undefined,
      agentFilter: agentFilter !== "all" ? agentFilter : undefined,
      leadTypeFilter: leadTypeFilter !== "all" ? leadTypeFilter : undefined,
      workStatusFilter: statusFilter !== "all" ? statusFilter : undefined,
      sortBy: "leadStatus",
      dateRangeFilter: dateRangeFilter === "custom" ? "custom" : dateRangeFilter,
      customDateFrom: dateRangeFilter === "custom" && customDateFrom ? customDateFrom : undefined,
      customDateTo: dateRangeFilter === "custom" && customDateTo ? customDateTo : undefined,
    },
    { refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  const assignLead = trpc.manager.assignLead.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const bulkAssign = trpc.manager.bulkAssign.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} leads assigned to ${bulkAgent}`);
      setSelectedIds(new Set());
      setBulkAgent("");
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const { data: workloadData } = trpc.manager.getAgentWorkload.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const agentWorkload = useMemo(() => {
    const map: Record<string, number> = {};
    (workloadData?.workload || []).forEach((w: any) => {
      map[w.agent] = w.active;
    });
    return map;
  }, [workloadData]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (currentLeads: any[]) => {
      if (selectedIds.size === currentLeads.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(currentLeads.map((l: any) => l.subscriptionId)));
      }
    },
    [selectedIds]
  );

  const handleBulkAssign = () => {
    if (!bulkAgent || selectedIds.size === 0) return;
    bulkAssign.mutate({
      subscriptionIds: Array.from(selectedIds),
      assignedAgent: bulkAgent,
    });
  };

  const allLeads: any[] = leadsData?.leads ?? [];

  // Apply lead status filter client-side (derived from assignedAgent)
  const leads = useMemo(() => {
    if (leadStatusFilter === "all") return allLeads;
    if (leadStatusFilter === "new") return allLeads.filter((l) => !l.assignedAgent);
    if (leadStatusFilter === "assigned") return allLeads.filter((l) => !!l.assignedAgent);
    return allLeads;
  }, [allLeads, leadStatusFilter]);

  const leadTypes = useMemo(() => {
    const seen = new Map<string, string>();
    leads.forEach((l) => {
      if (!seen.has(l.leadType)) {
        const badge = getLeadTypeBadge(l.leadType, l.daysSinceEvent ?? 0);
        seen.set(l.leadType, badge.label);
      }
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [leads]);

  const stats = useMemo(() => {
    const total = leads.length;
    const unassigned = leads.filter((l) => !l.assignedAgent || l.workStatus === "new").length;
    const urgent = leads.filter((l) => l.urgencyScore >= 70).length;
    const retained = leads.filter((l) => l.workStatus === "retained").length;
    const doneDealLeads = leads.filter((l) => l.workStatus === "done_deal");
    const futureDealLeads = leads.filter((l) => l.workStatus === "future_deal");
    const doneDeal = doneDealLeads.length;
    const futureDeal = futureDealLeads.length;
    const doneDealValue = doneDealLeads.reduce((sum: number, l: any) => sum + (l.monthlyAmount || 0), 0);
    const futureDealValue = futureDealLeads.reduce((sum: number, l: any) => sum + (l.monthlyAmount || 0), 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newToday = (leadsData?.leads ?? []).filter((l: any) => {
      if (l.assignedAgent) return false;
      const dateStr = l.currentTermEndsAt;
      if (!dateStr) return false;
      const ts = new Date(dateStr).getTime();
      return !isNaN(ts) && ts >= todayStart.getTime();
    }).length;
    return { total, unassigned, urgent, retained, doneDeal, futureDeal, doneDealValue, futureDealValue, newToday };
  }, [leads, leadsData]);

  // Compute agent workload cards data from leads
  const agentCardData = useMemo(() => {
    return AGENTS.map((agent) => {
      const agentLeads = allLeads.filter((l: any) => l.assignedAgent === agent);
      const closings = agentLeads.filter((l: any) =>
        ["retained", "done_deal"].includes(l.workStatus)
      );
      const subClosings = closings.filter((l: any) => l.leadCategory !== "installment").length;
      const instalmentClosings = closings.filter((l: any) => l.leadCategory === "installment").length;
      const totalAmount = closings.reduce((sum: number, l: any) => sum + (l.monthlyAmount || 0), 0);
      return {
        agent,
        closings: closings.length,
        subClosings,
        instalmentClosings,
        totalAmount,
      };
    });
  }, [allLeads]);

  // Export current filtered leads to CSV
  const exportToCSV = () => {
    if (!leads.length) {
      toast.error("No leads to export");
      return;
    }
    const headers = [
      "Name", "Email", "Phone", "Agent", "Work Status", "Lead Type",
      "Date", "Total Spend", "Currency", "Cycles", "Customer Note", "Agent Note",
    ];
    const rows = leads.map((l: any) => [
      l.customerName ?? "",
      l.email ?? "",
      l.phone ?? "",
      l.assignedAgent ?? "Unassigned",
      l.workStatus ?? "",
      l.leadType ?? "",
      l.currentTermEndsAt ? new Date(l.currentTermEndsAt).toLocaleDateString("en-GB") : "",
      l.totalSpend ?? 0,
      l.currencyCode ?? "GBP",
      l.cyclesCompleted ?? 0,
      (l.managerNote ?? "").replace(/"/g, "'"),
      (l.agentNote ?? "").replace(/"/g, "'"),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${leads.length} leads to CSV`);
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">
            Manager Command Centre
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
            Retention Lead Management &middot; Zoho Billing
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1 text-sm h-9 px-3"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{isFetching ? "Loading..." : "Refresh"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={!leads.length}
            className="gap-1 text-sm h-9 px-3"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-3 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Total */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500 font-medium">Total</p>
            </div>
          </div>
          {/* Unassigned */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
              <Inbox className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.unassigned}</p>
              <p className="text-xs text-gray-500 font-medium">Unassigned</p>
            </div>
          </div>
          {/* Urgent */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.urgent}</p>
              <p className="text-xs text-gray-500 font-medium">Urgent</p>
            </div>
          </div>
          {/* Retained */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.retained}</p>
              <p className="text-xs text-gray-500 font-medium">Retained</p>
            </div>
          </div>
          {/* Done Deal */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Handshake className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.doneDeal}</p>
              <p className="text-xs text-gray-500 font-medium">Done Deal</p>
            </div>
          </div>
          {/* Future Deal */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.futureDeal}</p>
              <p className="text-xs text-gray-500 font-medium">Future Deal</p>
            </div>
          </div>
          {/* New Today */}
          <button
            onClick={() => {
              setDateRangeFilter("today");
              setLeadStatusFilter("new");
            }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 hover:border-blue-300 transition-colors text-left"
            title="Click to show only today's new unassigned leads"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 relative">
              <CalendarPlus className="h-5 w-5 text-blue-600" />
              {stats.newToday > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.newToday}</p>
              <p className="text-xs text-gray-500 font-medium">New Today</p>
            </div>
          </button>
        </div>
      </div>

      {/* Agent Workload Cards — Today */}
      <div className="px-3 sm:px-6 pb-4">
        <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
          Agent Workload <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Today</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 gap-3 max-w-lg">
          {agentCardData.map((card) => (
            <div
              key={card.agent}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col items-center text-center"
            >
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mb-2">Today</span>
              <p className="text-lg font-bold text-gray-900 mb-1">{card.agent}</p>
              <p className="text-3xl font-bold text-gray-900">{card.closings}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">closings</p>
              <p className="text-xs text-gray-600 mt-2">
                {card.subClosings} sub / {card.instalmentClosings} instalment
              </p>
              <p className="text-xl font-bold text-green-600 mt-2">
                {formatCurrency(card.totalAmount)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="relative w-52 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm w-full"
            />
          </div>
          {/* Mobile filter toggle */}
          <Button
            variant="outline"
            size="sm"
            className="sm:hidden h-9 px-3 gap-1.5 text-sm shrink-0"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {[agentFilter, leadTypeFilter, statusFilter, leadStatusFilter].filter(
              (v) => v !== "all"
            ).length > 0 && (
              <span className="bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {
                  [agentFilter, leadTypeFilter, statusFilter, leadStatusFilter].filter(
                    (v) => v !== "all"
                  ).length
                }
              </span>
            )}
          </Button>
          {/* Desktop: all filters inline */}
          <div className="hidden sm:flex items-center gap-2.5 flex-wrap">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 w-32 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {AGENTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="Lead Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lead Status</SelectItem>
                <SelectItem value="new">New (Unassigned)</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
              <SelectTrigger className="h-9 w-48 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="All Lead Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lead Types</SelectItem>
                {leadTypes.map(({ key, label }) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="Work Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Work Status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dateRangeFilter}
              onValueChange={(v) => setDateRangeFilter(v as any)}
            >
              <SelectTrigger className="h-9 w-36 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="This Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {dateRangeFilter === "custom" && (
              <>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-sm text-gray-500">&rarr;</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </>
            )}
          </div>
          <span className="text-sm text-gray-800 font-medium ml-auto hidden sm:block">
            {isLoading ? "Loading..." : `${leads.length} leads`}
          </span>
        </div>

        {/* Mobile filter panel */}
        {showMobileFilters && (
          <div className="sm:hidden mt-2 flex flex-col gap-2 pb-1">
            <div className="grid grid-cols-2 gap-2">
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-10 text-sm border border-gray-300 rounded-lg">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {AGENTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                <SelectTrigger className="h-10 text-sm border border-gray-300 rounded-lg">
                  <SelectValue placeholder="Lead Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lead Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
                <SelectTrigger className="h-10 text-sm border border-gray-300 rounded-lg">
                  <SelectValue placeholder="Lead Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lead Types</SelectItem>
                  {leadTypes.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 text-sm border border-gray-300 rounded-lg">
                  <SelectValue placeholder="Work Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Work Status</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select
              value={dateRangeFilter}
              onValueChange={(v) => setDateRangeFilter(v as any)}
            >
              <SelectTrigger className="h-10 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="This Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {dateRangeFilter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-gray-800 pt-1">
              <span>{isLoading ? "Loading..." : `${leads.length} leads`}</span>
              <button
                onClick={() => {
                  setAgentFilter("all");
                  setLeadStatusFilter("all");
                  setLeadTypeFilter("all");
                  setStatusFilter("all");
                  setDateRangeFilter("this_month");
                }}
                className="text-blue-600 font-medium"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-600 text-white px-6 py-2 flex items-center gap-3 text-sm shadow-md">
          <CheckSquare className="h-4 w-4" />
          <span className="font-medium">
            {selectedIds.size} lead{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-blue-200 text-sm">Assign to:</span>
            <Select value={bulkAgent} onValueChange={setBulkAgent}>
              <SelectTrigger className="h-8 w-32 text-sm bg-blue-500 border-blue-400 text-white">
                <SelectValue placeholder="Choose agent..." />
              </SelectTrigger>
              <SelectContent>
                {AGENTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    <span className="flex items-center gap-2">
                      {a}
                      {agentWorkload[a] !== undefined && (
                        <span className="text-xs text-gray-500">({agentWorkload[a]} active)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 px-3 text-sm bg-white text-blue-700 hover:bg-blue-50 font-semibold"
              disabled={!bulkAgent || bulkAssign.isPending}
              onClick={handleBulkAssign}
            >
              {bulkAssign.isPending ? "Assigning..." : "Assign"}
            </Button>
          </div>
          <button
            className="ml-auto text-blue-200 hover:text-white"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table / Cards */}
      <div className="p-2 sm:p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            No leads found
          </div>
        ) : (
          <>
            {/* ── MOBILE CARD LIST (hidden on sm+) ── */}
            <div className="sm:hidden flex flex-col gap-2">
              {leads.map((lead: any) => {
                const badge = getLeadTypeBadge(lead.leadType, lead.daysSinceEvent ?? 0);
                const statusStyle = getStatusStyle(lead.workStatus);
                const isExpanded = expandedRow === lead.subscriptionId;
                const leadDate = lead.currentTermEndsAt || lead.nextBillingAt || null;
                const isSelected = selectedIds.has(lead.subscriptionId);
                return (
                  <div
                    key={lead.subscriptionId}
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                      isSelected ? "ring-2 ring-blue-400" : "border-gray-200"
                    } ${badge.rowTint}`}
                  >
                    {/* Card header */}
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => toggleSelect(lead.subscriptionId)}
                            className="shrink-0 text-gray-400 active:text-blue-600"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              {lead.customerName}
                            </p>
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-0.5"
                              >
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-gray-800">{formatDate(leadDate)}</span>
                        </div>
                      </div>
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="flex items-center gap-1 text-xs text-gray-800 mt-1.5 truncate"
                        >
                          <Mail className="h-3 w-3 shrink-0" />
                          {lead.email}
                        </a>
                      )}
                    </div>
                    {/* Card body — agent + status */}
                    <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                      <Select
                        value={lead.assignedAgent || "unassigned"}
                        onValueChange={(v) =>
                          assignLead.mutate({
                            subscriptionId: lead.subscriptionId,
                            assignedAgent: v === "unassigned" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger
                          className={`h-9 w-32 text-sm border rounded-lg font-medium ${
                            lead.assignedAgent
                              ? "text-gray-800 border-gray-300"
                              : "text-gray-500 italic border-gray-200"
                          }`}
                        >
                          <SelectValue placeholder="Assign..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">
                            <span className="text-gray-500 italic">Unassigned</span>
                          </SelectItem>
                          {AGENTS.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={
                          lead.workStatus &&
                          lead.workStatus !== "new" &&
                          lead.workStatus !== "assigned"
                            ? lead.workStatus
                            : ""
                        }
                        onValueChange={(v) =>
                          assignLead.mutate({
                            subscriptionId: lead.subscriptionId,
                            workStatus: v as any,
                          })
                        }
                      >
                        <SelectTrigger
                          className={`h-9 flex-1 min-w-[120px] text-sm border rounded-lg font-medium ${
                            lead.workStatus &&
                            lead.workStatus !== "new" &&
                            lead.workStatus !== "assigned"
                              ? `${statusStyle.bg} ${statusStyle.text} border-transparent`
                              : "text-gray-500 italic border-gray-200"
                          }`}
                        >
                          <SelectValue placeholder="Set status..." />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className={`px-1.5 py-0.5 rounded-full text-xs ${s.bg} ${s.text}`}>
                                {s.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : lead.subscriptionId)
                        }
                        className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-800 active:bg-gray-100"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {/* Notes preview */}
                    {(lead.managerNote || lead.agentNote) && (
                      <div className="px-4 pb-2">
                        <p className="text-sm text-gray-800 line-clamp-2">
                          {lead.managerNote || lead.agentNote}
                        </p>
                      </div>
                    )}
                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-blue-100 bg-blue-50/60 px-4 py-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                              Plan
                            </p>
                            <p className="text-gray-800">{lead.planName || "\u2014"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                              Cycles
                            </p>
                            <p className="text-gray-800">{lead.cyclesCompleted ?? "\u2014"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                              Monthly
                            </p>
                            <p className="text-gray-800">
                              {formatCurrency(lead.monthlyAmount, lead.currencyCode)}
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                              Total Spend
                            </p>
                            <p className="text-gray-800 font-semibold">
                              {formatCurrency(lead.totalSpend, lead.currencyCode)}
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                              Last Call
                            </p>
                            <p className="text-gray-800">
                              {lead.lastCallAt
                                ? new Date(lead.lastCallAt).toLocaleDateString("en-GB")
                                : "\u2014"}
                              {lead.lastCallResult && (
                                <span className="ml-1 text-gray-800">({lead.lastCallResult})</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <NotesCell
                            managerNote={lead.managerNote}
                            agentNote={lead.agentNote}
                            subscriptionId={lead.subscriptionId}
                            onSaveNote={(note) =>
                              assignLead.mutate({
                                subscriptionId: lead.subscriptionId,
                                managerNote: note,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── DESKTOP TABLE (hidden on mobile) ── */}
            <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f8f9fa] border-b border-gray-200 text-sm">
                    <th className="px-2 py-2.5 w-8">
                      <button
                        onClick={() => toggleSelectAll(leads)}
                        className="text-gray-800 hover:text-blue-600"
                      >
                        {selectedIds.size === leads.length && leads.length > 0 ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-36">
                      Name
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-36">
                      Email
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-24">
                      Agent
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-20">
                      Status
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-32">
                      Work Status
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-20">
                      Date
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-32">
                      Lead Type
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs w-20">
                      Spend
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs min-w-[160px]">
                      Customer Note
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold text-gray-800 uppercase tracking-wide text-xs min-w-[160px]">
                      Agent Note
                    </th>
                    <th className="w-5"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead: any) => {
                    const badge = getLeadTypeBadge(lead.leadType, lead.daysSinceEvent ?? 0);
                    const statusStyle = getStatusStyle(lead.workStatus);
                    const isExpanded = expandedRow === lead.subscriptionId;
                    const leadDate = lead.currentTermEndsAt || lead.nextBillingAt || null;
                    const isSelected = selectedIds.has(lead.subscriptionId);

                    return (
                      <React.Fragment key={lead.subscriptionId}>
                        <tr
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-all ${
                            badge.rowTint
                          } ${isSelected ? "ring-2 ring-inset ring-blue-400" : ""}`}
                        >
                          {/* Checkbox */}
                          <td className="px-2 py-2">
                            <button
                              onClick={() => toggleSelect(lead.subscriptionId)}
                              className="text-gray-800 hover:text-blue-600"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          {/* Name + Phone */}
                          <td className="px-2 py-2">
                            <div className="font-medium text-gray-900 text-sm leading-tight truncate max-w-[140px]">
                              {lead.customerName}
                            </div>
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                              >
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </a>
                            )}
                          </td>
                          {/* Email — compact, smaller font, truncate */}
                          <td className="px-2 py-2">
                            <a
                              href={`mailto:${lead.email}`}
                              title={lead.email}
                              className="flex items-center gap-1 text-xs text-gray-800 hover:text-blue-700 hover:underline truncate max-w-[130px]"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </a>
                          </td>
                          {/* Agent — prominent dropdown with visible border */}
                          <td className="px-2 py-2">
                            <Select
                              value={lead.assignedAgent || "unassigned"}
                              onValueChange={(v) =>
                                assignLead.mutate({
                                  subscriptionId: lead.subscriptionId,
                                  assignedAgent: v === "unassigned" ? null : v,
                                  email: lead.email,
                                })
                              }
                            >
                              <SelectTrigger
                                className={`h-8 w-[90px] text-sm border border-gray-300 rounded-lg px-2 font-medium ${
                                  lead.assignedAgent
                                    ? "text-gray-900"
                                    : "text-gray-500 italic"
                                }`}
                              >
                                <SelectValue placeholder="Assign..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">
                                  <span className="text-gray-500 italic">Unassigned</span>
                                </SelectItem>
                                {AGENTS.map((a) => (
                                  <SelectItem key={a} value={a}>
                                    {a}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Lead Status */}
                          <td className="px-2 py-2">
                            {(() => {
                              const ls = getLeadStatus(lead.assignedAgent);
                              return (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${ls.bg} ${ls.text}`}
                                >
                                  {ls.label}
                                </span>
                              );
                            })()}
                          </td>
                          {/* Work Status — prominent dropdown with visible border, slightly smaller badge */}
                          <td className="px-2 py-2">
                            <Select
                              value={
                                lead.workStatus &&
                                lead.workStatus !== "new" &&
                                lead.workStatus !== "assigned"
                                  ? lead.workStatus
                                  : ""
                              }
                              onValueChange={(v) =>
                                assignLead.mutate({
                                  subscriptionId: lead.subscriptionId,
                                  workStatus: v as any,
                                })
                              }
                            >
                              <SelectTrigger
                                className={`h-8 w-[130px] text-xs border border-gray-300 rounded-lg px-2 font-medium ${
                                  lead.workStatus &&
                                  lead.workStatus !== "new" &&
                                  lead.workStatus !== "assigned"
                                    ? `${statusStyle.bg} ${statusStyle.text}`
                                    : "text-gray-500 italic bg-transparent"
                                }`}
                              >
                                <SelectValue placeholder="Set status..." />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-xs ${s.bg} ${s.text}`}
                                    >
                                      {s.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Date */}
                          <td className="px-2 py-2 text-sm text-gray-800 whitespace-nowrap">
                            {formatDate(leadDate)}
                          </td>
                          {/* Lead Type */}
                          <td className="px-2 py-2">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${badge.bg} ${badge.text}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          {/* Total Spend */}
                          <td className="px-2 py-2 text-sm font-semibold text-gray-900 whitespace-nowrap">
                            {formatCurrency(lead.totalSpend, lead.currencyCode)}
                          </td>
                          {/* Customer Note — the customer's ticket message (managerNote used as customer note) */}
                          <td className="px-2 py-2 max-w-[200px]">
                            <p
                              className="text-sm text-gray-800 truncate leading-snug"
                              title={lead.managerNote || ""}
                            >
                              {lead.managerNote || <span className="text-gray-400 italic text-xs">—</span>}
                            </p>
                          </td>
                          {/* Agent Note */}
                          <td className="px-2 py-2 max-w-[200px]">
                            <NotesCell
                              managerNote={lead.managerNote}
                              agentNote={lead.agentNote}
                              subscriptionId={lead.subscriptionId}
                              onSaveNote={(note) =>
                                assignLead.mutate({
                                  subscriptionId: lead.subscriptionId,
                                  managerNote: note,
                                })
                              }
                            />
                          </td>
                          {/* Expand */}
                          <td className="px-1 py-2">
                            <button
                              onClick={() =>
                                setExpandedRow(
                                  isExpanded ? null : lead.subscriptionId
                                )
                              }
                              className="text-gray-800 hover:text-gray-600"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr
                            key={`${lead.subscriptionId}-exp`}
                            className="bg-blue-50/60 border-b border-blue-100"
                          >
                            <td colSpan={12} className="px-6 py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Plan
                                  </p>
                                  <p className="text-gray-800">{lead.planName || "\u2014"}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Cycles Completed
                                  </p>
                                  <p className="text-gray-800">{lead.cyclesCompleted ?? "\u2014"}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Monthly Amount
                                  </p>
                                  <p className="text-gray-800">
                                    {formatCurrency(lead.monthlyAmount, lead.currencyCode)}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Retry Attempts
                                  </p>
                                  <p className="text-gray-800">{lead.retryAttempts ?? 0}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Call Purpose
                                  </p>
                                  <p className="text-gray-800">{lead.callPurpose || "\u2014"}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Next Billing
                                  </p>
                                  <p className="text-gray-800">{formatDate(lead.nextBillingAt)}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Last Call
                                  </p>
                                  <p className="text-gray-800">
                                    {lead.lastCallAt
                                      ? new Date(lead.lastCallAt).toLocaleDateString("en-GB")
                                      : "\u2014"}
                                    {lead.lastCallResult && (
                                      <span className="ml-1 text-gray-800">
                                        ({lead.lastCallResult})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">
                                    Urgency Flags
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {(lead.urgencyFlags || []).length > 0 ? (
                                      lead.urgencyFlags.map((f: string) => (
                                        <span
                                          key={f}
                                          className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]"
                                        >
                                          {f.replace(/_/g, " ")}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-gray-800">None</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
