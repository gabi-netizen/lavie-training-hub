import React, { useState, useMemo } from "react";
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
  Mail,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  ArrowLeft,
  SlidersHorizontal,
  Package,
  CreditCard,
  MapPin,
  Heart,
  Forward,
  Bot,
  HelpCircle,
  MailQuestion,
  User,
  UserCheck,
  Building2,
  Cpu,
} from "lucide-react";

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  cancellation_request: { label: "Cancellation", bg: "bg-red-100", text: "text-red-700", icon: XCircle },
  shipping_delivery_issue: { label: "Shipping/Delivery", bg: "bg-orange-100", text: "text-orange-700", icon: Package },
  payment_billing_dispute: { label: "Payment/Billing", bg: "bg-blue-100", text: "text-blue-700", icon: CreditCard },
  address_update: { label: "Address Update", bg: "bg-purple-100", text: "text-purple-700", icon: MapPin },
  product_feedback: { label: "Product Feedback", bg: "bg-emerald-100", text: "text-emerald-700", icon: Heart },
  agent_forwarded: { label: "Agent Forwarded", bg: "bg-indigo-100", text: "text-indigo-700", icon: Forward },
  system_automated: { label: "System/Automated", bg: "bg-slate-100", text: "text-slate-600", icon: Bot },
  follow_up_unanswered: { label: "Follow-up", bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
  subscription_question: { label: "Subscription Q", bg: "bg-sky-100", text: "text-sky-700", icon: HelpCircle },
  general_inquiry: { label: "General Inquiry", bg: "bg-slate-100", text: "text-slate-700", icon: MailQuestion },
};

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  HIGH: { label: "High", dot: "bg-red-500", text: "text-red-700" },
  MEDIUM: { label: "Medium", dot: "bg-amber-400", text: "text-amber-700" },
  LOW: { label: "Low", dot: "bg-green-500", text: "text-green-700" },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: "Open", bg: "bg-blue-100", text: "text-blue-700" },
  in_progress: { label: "In Progress", bg: "bg-amber-100", text: "text-amber-700" },
  resolved: { label: "Resolved", bg: "bg-green-100", text: "text-green-700" },
  closed: { label: "Closed", bg: "bg-slate-100", text: "text-slate-600" },
};

const CUSTOMER_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  existing: { label: "Existing", bg: "bg-blue-100", text: "text-blue-700", icon: UserCheck },
  new: { label: "New", bg: "bg-green-100", text: "text-green-700", icon: User },
  internal: { label: "Internal", bg: "bg-indigo-100", text: "text-indigo-600", icon: Building2 },
  system: { label: "System", bg: "bg-slate-100", text: "text-slate-600", icon: Cpu },
};

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general_inquiry;
}
function getPriorityConfig(p: string) {
  return PRIORITY_CONFIG[p] || PRIORITY_CONFIG.MEDIUM;
}
function getStatusConfig(s: string) {
  return STATUS_CONFIG[s] || STATUS_CONFIG.open;
}
function getCustomerStatusConfig(cs: string) {
  return CUSTOMER_STATUS_CONFIG[cs] || CUSTOMER_STATUS_CONFIG.new;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "\u2014";
  }
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SupportTickets() {
  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "all">("all");
  const [search, setSearch] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Expanded ticket
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});

  // Data
  const {
    data: ticketsData,
    isLoading,
    refetch,
  } = trpc.tickets.getTickets.useQuery(
    {
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      dateRange,
      search: search || undefined,
      perPage: 200,
    },
    { refetchOnWindowFocus: false, refetchInterval: 60_000 }
  );

  const { data: stats } = trpc.tickets.getStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });

  const updateTicket = trpc.tickets.updateTicket.useMutation({
    onSuccess: () => {
      toast.success("Ticket updated");
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const tickets = ticketsData?.tickets ?? [];
  const total = ticketsData?.total ?? 0;

  const activeFilterCount = [categoryFilter, priorityFilter, statusFilter, dateRange]
    .filter((v) => v !== "all")
    .length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Mail className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Support Tickets</h1>
              <p className="text-sm text-gray-600">Email inbox &mdash; auto-categorized</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-3 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total Open */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalOpen ?? 0}</p>
              <p className="text-xs text-gray-600 font-medium">Open Tickets</p>
            </div>
          </div>
          {/* High Priority */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats?.highPriority ?? 0}</p>
              <p className="text-xs text-gray-600 font-medium">High Priority</p>
            </div>
          </div>
          {/* Awaiting Response */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats?.awaitingResponse ?? 0}</p>
              <p className="text-xs text-gray-600 font-medium">Awaiting Response</p>
            </div>
          </div>
          {/* Resolved Today */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats?.resolvedToday ?? 0}</p>
              <p className="text-xs text-gray-600 font-medium">Resolved Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
        <div className="flex items-center gap-2.5">
          {/* Search */}
          <div className="relative w-52 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search tickets..."
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
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Desktop filters */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Category */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 w-[120px] text-sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[130px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range */}
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
              <SelectTrigger className="h-9 w-[120px] text-sm">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Result count */}
          <span className="text-xs text-gray-600 ml-auto whitespace-nowrap">
            {total} ticket{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Mobile filters (collapsible) */}
        {showMobileFilters && (
          <div className="sm:hidden flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 w-[110px] text-sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[110px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
              <SelectTrigger className="h-9 w-[110px] text-sm">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Ticket List */}
      <div className="px-3 sm:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
            <span className="ml-2 text-gray-600">Loading tickets...</span>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">No tickets found</h3>
            <p className="text-sm text-gray-600 max-w-sm">
              {search || categoryFilter !== "all" || priorityFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters or search query."
                : "Tickets will appear here when emails arrive at support@lavielabs.com."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket: any) => {
              const catCfg = getCategoryConfig(ticket.category);
              const priCfg = getPriorityConfig(ticket.priority);
              const statusCfg = getStatusConfig(ticket.status);
              const custCfg = getCustomerStatusConfig(ticket.customerStatus);
              const CatIcon = catCfg.icon;
              const CustIcon = custCfg.icon;
              const isExpanded = expandedId === ticket.id;

              return (
                <div
                  key={ticket.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all"
                >
                  {/* Ticket Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    {/* Priority dot */}
                    <div className="shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${priCfg.dot}`} title={priCfg.label} />
                    </div>

                    {/* Category badge */}
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.bg} ${catCfg.text} flex items-center gap-1`}>
                      <CatIcon className="h-3 w-3" />
                      <span className="hidden sm:inline">{catCfg.label}</span>
                    </div>

                    {/* Subject + From */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {ticket.subject}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {ticket.fromName ? `${ticket.fromName} <${ticket.fromEmail}>` : ticket.fromEmail}
                      </p>
                    </div>

                    {/* Customer status badge */}
                    <div className={`hidden md:flex shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${custCfg.bg} ${custCfg.text} items-center gap-1`}>
                      <CustIcon className="h-3 w-3" />
                      {custCfg.label}
                    </div>

                    {/* Status badge */}
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                      {statusCfg.label}
                    </div>

                    {/* Date */}
                    <span className="hidden lg:block shrink-0 text-xs text-gray-600 w-20 text-right">
                      {timeAgo(ticket.receivedAt)}
                    </span>

                    {/* Expand icon */}
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                      {/* Meta row */}
                      <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-600">Priority:</span>
                          <span className={`flex items-center gap-1 text-xs font-semibold ${priCfg.text}`}>
                            <span className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
                            {priCfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-600">Received:</span>
                          <span className="text-xs text-gray-800">{formatDateTime(ticket.receivedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-600">Customer:</span>
                          <span className={`flex items-center gap-1 text-xs font-medium ${custCfg.text}`}>
                            <CustIcon className="h-3 w-3" />
                            {custCfg.label}
                          </span>
                        </div>
                        {ticket.assignedTo && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-600">Assigned:</span>
                            <span className="text-xs text-gray-800">{ticket.assignedTo}</span>
                          </div>
                        )}
                      </div>

                      {/* Email body */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                          <Mail className="h-4 w-4 text-gray-500" />
                          <span className="text-sm font-semibold text-gray-900">{ticket.subject}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-3 text-xs text-gray-600">
                          <span>From: <strong className="text-gray-800">{ticket.fromName || ticket.fromEmail}</strong></span>
                          {ticket.fromName && <span>&lt;{ticket.fromEmail}&gt;</span>}
                        </div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                          {ticket.body || "(no body)"}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 items-end">
                        {/* Status update */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                          <Select
                            value={ticket.status}
                            onValueChange={(val) =>
                              updateTicket.mutate({ id: ticket.id, status: val as any })
                            }
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Assign */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Assign to</label>
                          <Select
                            value={ticket.assignedTo || "unassigned"}
                            onValueChange={(val) =>
                              updateTicket.mutate({
                                id: ticket.id,
                                assignedTo: val === "unassigned" ? null : val,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              <SelectItem value="Diane">Diane</SelectItem>
                              <SelectItem value="Gabriel">Gabriel</SelectItem>
                              <SelectItem value="Guy">Guy</SelectItem>
                              <SelectItem value="Rob">Rob</SelectItem>
                              <SelectItem value="Wendy">Wendy</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Notes */}
                        <div className="flex-1 min-w-[200px]">
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                          <div className="flex gap-1.5">
                            <Input
                              value={editingNotes[ticket.id] ?? ticket.notes ?? ""}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setEditingNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                              }
                              placeholder="Add a note..."
                              className="h-8 text-xs flex-1"
                            />
                            <Button
                              size="sm"
                              className="h-8 px-3 text-xs"
                              disabled={
                                (editingNotes[ticket.id] ?? ticket.notes ?? "") === (ticket.notes ?? "")
                              }
                              onClick={() => {
                                updateTicket.mutate({
                                  id: ticket.id,
                                  notes: editingNotes[ticket.id] ?? "",
                                });
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
