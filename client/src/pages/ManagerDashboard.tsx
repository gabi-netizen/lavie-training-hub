import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  RefreshCw,
  Search,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
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
  Pencil,
  Trash2,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  Calendar,
  Send,
  Swords,
  XCircle,
  CreditCard,
  TrendingDown,
  UserCheck,
  BarChart3,
} from "lucide-react";
import { WhatsAppChatPanel } from "@/components/WhatsAppChatPanel";
import { WorkspaceEmailPanel } from "@/components/WorkspaceEmailPanel";
import { AllClientsTab } from "@/components/AllClientsTab";
import { DeclineTab } from "@/components/DeclineTab";
import { CancelTab } from "@/components/CancelTab";
import { EndInstalmentTab } from "@/components/EndInstalmentTab";
import { PersonalButlerTab } from "@/components/PersonalButlerTab";
import { CustomersTab } from "@/components/CustomersTab";
import { MaximusGreeting } from "@/components/MaximusGreeting";
import { PerformanceTab } from "@/components/PerformanceTab";
import { BulkTemplateModal } from "@/components/BulkTemplateModal";

// ─────────────────────────────────────────────────────────────────────────────
// Strip HTML/CSS from customer notes (for display)
// ─────────────────────────────────────────────────────────────────────────────
function stripHtml(text: string | null | undefined): string {
  if (!text) return "";
  let clean = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  clean = clean.replace(/<[^>]*>/g, " ");
  clean = clean.replace(/(?:div\.zm_|#x_|\.[a-z])[\w_.:-]*(?:\s+[\w_.#\[\]=*"':,-]+)*/gi, "");
  clean = clean.replace(/\w*\[[^\]]*\]/g, "");
  clean = clean.replace(/\[[^\]]*\]/g, "");
  clean = clean.replace(/[.#]x_[\w]+/g, "");
  clean = clean.replace(/ReadMsgBody/g, "");
  clean = clean.replace(/ExternalClass/g, "");
  clean = clean.replace(/MessageViewBody/g, "");
  clean = clean.replace(/\{[^}]*\}/g, "");
  clean = clean.replace(/\b(div|table|td|th|img|sup|span|font|a)\b\s*[,]/g, "");
  clean = clean.replace(/css-[\w]+/g, "");
  clean = clean.replace(/apple-link/g, "");
  clean = clean.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ");
  clean = clean.replace(/[\w-]+\s*:\s*[^;,]+[;,]/g, "");
  clean = clean.replace(/[\u00AD\u200B\u200C\u200D\uFEFF\u034F]+/g, "");
  clean = clean.replace(/\s[.#]\s/g, " ");
  clean = clean.replace(/[,;]+\s*/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead type badge styles
// ─────────────────────────────────────────────────────────────────────────────
function getLeadTypeBadge(
  leadType: string,
  _daysSinceEvent: number
): { bg: string; text: string; label: string; rowTint: string } {
  const map: Record<string, { bg: string; text: string; label: string; rowTint: string }> = {
    "Cat to Rob":                 { bg: "bg-[#92400e]", text: "text-white", label: "Cat to Rob",                 rowTint: "bg-white" },
    "Gabi to Rob":                { bg: "bg-[#dc2626]", text: "text-white", label: "Gabi to Rob",                rowTint: "bg-white" },
    "Pre-Cycle-Cancelled":        { bg: "bg-[#22c55e]", text: "text-white", label: "Pre-Cycle-Cancelled",        rowTint: "bg-white" },
    "Cancel Live Sub (Cycle 1)":  { bg: "bg-[#2563eb]", text: "text-white", label: "Cancel Live Sub (Cycle 1)",  rowTint: "bg-white" },
    "Cancel Live Sub (Cycle 2+)": { bg: "bg-[#3b82f6]", text: "text-white", label: "Cancel Live Sub (Cycle 2+)", rowTint: "bg-white" },
    "Hot Lead":                   { bg: "bg-[#eab308]", text: "text-white", label: "Hot Lead",                   rowTint: "bg-white" },
    "Pre-Cycle-Decline":          { bg: "bg-[#1a1a1a]", text: "text-white", label: "Pre-Cycle-Decline",          rowTint: "bg-white" },
    "Decline Live Sub":           { bg: "bg-[#7c3aed]", text: "text-white", label: "Decline Live Sub",           rowTint: "bg-white" },
    "Duplicate":                    { bg: "bg-gray-400", text: "text-white", label: "Duplicate",                    rowTint: "bg-gray-50" },
  };
  return map[leadType] || { bg: "bg-gray-200", text: "text-gray-800", label: leadType, rowTint: "bg-white" };
}

const LEAD_TYPE_OPTIONS = [
  "Cat to Rob",
  "Gabi to Rob",
  "Pre-Cycle-Cancelled",
  "Cancel Live Sub (Cycle 1)",
  "Cancel Live Sub (Cycle 2+)",
  "Hot Lead",
  "Pre-Cycle-Decline",
  "Decline Live Sub",
  "Duplicate",
];

// Work Status options
const STATUS_OPTIONS = [
  { value: "in_progress",    label: "In Progress",    bg: "bg-yellow-100", text: "text-yellow-800" },
  { value: "retained",       label: "Retained Sub",   bg: "bg-green-100",  text: "text-green-800" },
  { value: "done_deal",      label: "Done Deal",      bg: "bg-green-200",  text: "text-green-800" },
  { value: "future_deal",    label: "Future Deal",    bg: "bg-indigo-100", text: "text-indigo-800" },
  { value: "dont_assign",    label: "Don't Assign",   bg: "bg-red-200",    text: "text-red-800" },
  { value: "not_interested", label: "Not Interested", bg: "bg-red-100",    text: "text-red-800" },
  { value: "no_answer",      label: "No Answer",      bg: "bg-orange-100", text: "text-orange-800" },
  { value: "callback",       label: "Callback",       bg: "bg-purple-100", text: "text-purple-800" },
  { value: "follow_up",      label: "Follow-up",      bg: "bg-sky-100",    text: "text-sky-800" },
  { value: "whatsapp_queue", label: "WhatsApp Queue", bg: "bg-teal-100",   text: "text-teal-800" },
  { value: "cancelled_sub",  label: "Cancelled Sub",  bg: "bg-red-100",    text: "text-red-800" },
  { value: "archived",       label: "Archived",       bg: "bg-gray-100",   text: "text-gray-800" },
];

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || { value: status, label: status, bg: "bg-gray-100", text: "text-gray-800" };
}

function getLeadStatus(assignedAgent: string | null | undefined) {
  return assignedAgent
    ? { bg: "bg-blue-100", text: "text-blue-800", label: "Assigned" }
    : { bg: "bg-green-100", text: "text-green-800", label: "New" };
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

const AGENTS = ["Guy", "Rob", "James"];

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Guy:   { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  Rob:   { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300" },
  James: { bg: "bg-fuchsia-100", text: "text-fuchsia-800", border: "border-fuchsia-300" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Notes Cell — inline note editor (for Agent Note column)
// ─────────────────────────────────────────────────────────────────────────────
function NotesCell({
  agentNote,
  subscriptionId,
  onSaveNote,
  onOpen,
}: {
  managerNote?: string | null;
  agentNote?: string | null;
  subscriptionId: string;
  onSaveNote: (note: string) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(agentNote || "");
  const [editing, setEditing] = useState(false);

  const displayText = agentNote || "";

  return (
    <div className="relative">
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            setEditValue(agentNote || "");
            if (!agentNote) setEditing(true);
            onOpen?.();
          }}
          title={displayText || undefined}
          className="flex items-start gap-1 w-[250px] px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm hover:border-gray-400 transition-colors"
        >
          <span className="text-sm text-gray-800 flex-1 text-left line-clamp-2 leading-snug">
            {displayText || <span className="text-gray-500 italic">Add note...</span>}
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-900 mt-0.5" />
        </button>
      )}

      {open && (
        <div
          className="absolute z-[9999] left-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 max-h-[400px] overflow-y-auto"
          style={{ isolation: "isolate", background: "#ffffff" }}
        >
          {editing ? (
            <div>
              <textarea
                className="w-full text-sm border border-gray-200 rounded p-1.5 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                placeholder="Agent note..."
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
                  <p className="font-semibold text-amber-600 uppercase text-[10px] mb-0.5">Agent Note</p>
                  <p>{agentNote}</p>
                </div>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditing(true)}
                >
                  {agentNote ? "Edit note" : "Add note"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-gray-600"
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
// Customer Message Editor (admin only)
// ─────────────────────────────────────────────────────────────────────────────
function CustomerMessageEditor({
  leadId,
  message,
  onSave,
}: {
  leadId: string;
  message: string;
  onSave: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message);
  const cleaned = stripHtml(message);

  if (!message && !editing) {
    return (
      <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-amber-600 uppercase text-[10px]">Customer Message</p>
          <button
            onClick={() => { setDraft(""); setEditing(true); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add message
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">No message</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
        <p className="font-semibold text-amber-600 uppercase text-[10px] mb-1">Customer Message</p>
        <textarea
          className="w-full border border-amber-200 rounded p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 text-gray-800"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={() => { setDraft(message); setEditing(false); }}
            className="px-3 py-1 bg-gray-200 text-gray-800 text-xs rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg max-h-[200px] overflow-y-auto">
      <div className="flex items-center justify-between sticky top-0 bg-amber-50">
        <p className="font-semibold text-amber-600 uppercase text-[10px] mb-1">Customer Message</p>
        <button
          onClick={() => { setDraft(cleaned); setEditing(true); }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Edit
        </button>
      </div>
      <p className="text-sm text-amber-900 whitespace-pre-wrap">{cleaned}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab type
// ─────────────────────────────────────────────────────────────────────────────
type TabId = "leads" | "callbacks" | "messages" | "emails" | "allClients" | "decline" | "cancel" | "endInstalment" | "butler" | "customers" | "performance";


// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, navigate] = useLocation();

  // ─── Tab State ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = sessionStorage.getItem("command-centre-tab");
    if (saved && ["leads", "callbacks", "messages", "emails", "allClients", "decline", "cancel", "endInstalment", "butler", "customers", "performance"].includes(saved)) {
      return saved as TabId;
    }
    return "leads";
  });

  useEffect(() => {
    sessionStorage.setItem("command-centre-tab", activeTab);
  }, [activeTab]);

  // ─── Incoming Leads State ───────────────────────────────────────────────────
  // Generate month tabs from June 2026 to current month
  const monthTabs = useMemo(() => {
    const START_YEAR = 2026;
    const START_MONTH = 5; // June (0-indexed)
    const _now = new Date();
    const tabs: { label: string; month: string }[] = [];
    let y = START_YEAR;
    let m = START_MONTH;
    while (y < _now.getFullYear() || (y === _now.getFullYear() && m <= _now.getMonth())) {
      const d = new Date(y, m);
      tabs.push({
        label: d.toLocaleString('en-US', { month: 'long' }),
        month: `${y}-${String(m + 1).padStart(2, '0')}`,
      });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return tabs;
  }, []);
  const defaultMonth = monthTabs.length > 0 ? monthTabs[monthTabs.length - 1].month : new Date().toISOString().substring(0, 7);
  const [selectedLeadsMonth, setSelectedLeadsMonth] = useState<string>(defaultMonth);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState<string>("");
  const [editingLeadType, setEditingLeadType] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedLeadContactId, setSelectedLeadContactId] = useState<number | null>(null);
  const [callbackDateFilter, setCallbackDateFilter] = useState<string>("all");
  const [bulkMsgChannel, setBulkMsgChannel] = useState<"whatsapp" | "sms" | "email" | null>(null);

  // ─── Data Queries ───────────────────────────────────────────────────────────
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
      dateRangeFilter: activeTab === "leads" ? "custom" : (dateRangeFilter === "custom" ? "custom" : dateRangeFilter),
      customDateFrom: activeTab === "leads"
        ? `${selectedLeadsMonth}-01`
        : (dateRangeFilter === "custom" && customDateFrom ? customDateFrom : undefined),
      customDateTo: activeTab === "leads"
        ? (() => { const [y, mo] = selectedLeadsMonth.split("-").map(Number); const next = new Date(y, mo, 0); return next.toISOString().substring(0, 10); })()
        : (dateRangeFilter === "custom" && customDateTo ? customDateTo : undefined),
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

  const bulkDeleteLeads = trpc.manager.bulkDeleteLeads.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} lead${data.deleted !== 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const { data: workloadData } = trpc.manager.getAgentWorkload.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Fetch ALL billing callbacks (from client_subscriptions) for manager view
  const { data: allBillingCallbacksData } = trpc.billing.getAllClientCallbacks.useQuery(
    undefined,
    { refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  // ─── Upcoming Callbacks Polling (toast notifications) ──────────────────────
  const { data: upcomingCallbacks = [] } = trpc.manager.getUpcomingCallbacks.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );
  const lastCallbackIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (upcomingCallbacks.length > 0) {
      const currentIds = new Set(upcomingCallbacks.map((c: any) => c.id));
      for (const cb of upcomingCallbacks) {
        if (!lastCallbackIdsRef.current.has(cb.id)) {
          const mins = Math.max(1, Math.round(((cb.callbackAt as number) - Date.now()) / 60000));
          toast.info(`\u23F0 Callback with ${cb.customerName} in ${mins} min`, { duration: 10000 });
        }
      }
      lastCallbackIdsRef.current = currentIds;
    }
  }, [upcomingCallbacks]);

  const agentWorkload = useMemo(() => {
    const map: Record<string, number> = {};
    (workloadData?.workload || []).forEach((w: any) => {
      map[w.agent] = w.active;
    });
    return map;
  }, [workloadData]);

  // ─── Leads Processing ──────────────────────────────────────────────────────
  const allLeads: any[] = leadsData?.leads ?? [];

  const leads = useMemo(() => {
    if (leadStatusFilter === "all") return allLeads;
    if (leadStatusFilter === "new") return allLeads.filter((l) => !l.assignedAgent);
    if (leadStatusFilter === "assigned") return allLeads.filter((l) => !!l.assignedAgent);
    return allLeads;
  }, [allLeads, leadStatusFilter]);

  // Callbacks: leads with callbackAt in the future, filtered + sorted soonest first
  // Merges lead_assignments callbacks + client_subscriptions callbacks
  const callbackLeads = useMemo(() => {
    // Lead-assignment callbacks
    let cbs: any[] = allLeads
      .filter((l: any) => l.callbackAt && l.callbackAt > Date.now())
      .map((l: any) => ({ ...l, source: "lead" }));

    // Billing (client_subscriptions) callbacks — map to lead-compatible shape
    const billingCbs: any[] = (allBillingCallbacksData?.callbacks ?? [])
      .filter((cb: any) => cb.callbackAt && cb.callbackAt > Date.now())
      .map((cb: any) => ({
        subscriptionId: cb.subscriptionId,
        customerId: null,
        customerName: cb.customerName,
        email: cb.email,
        phone: cb.phone,
        planName: cb.planName,
        billingStatus: cb.status,
        cyclesCompleted: 0,
        totalSpend: 0,
        monthlyAmount: cb.amount ?? 0,
        currencyCode: "GBP",
        retryAttempts: 0,
        nextBillingAt: null,
        currentTermEndsAt: null,
        leadCategory: "subscription",
        leadType: "Billing Callback",
        urgencyScore: 0,
        urgencyFlags: [],
        urgencyLabel: "Low",
        daysSinceEvent: 0,
        valueScore: 0,
        reachabilityScore: 50,
        queuePriority: 0,
        callPurpose: null,
        callPurposeNote: null,
        actionRequired: null,
        maxCallAttempts: 3,
        assignmentId: 0,
        assignedAgent: cb.retentionAgent,
        workStatus: "callback",
        managerNote: null,
        agentNote: cb.callbackNote ?? null,
        attemptCount: 0,
        noAnswerCount: 0,
        lastCallAt: null,
        lastCallResult: null,
        callbackAt: cb.callbackAt,
        followUpAt: null,
        followUpNote: null,
        assignedAt: null,
        statusChangedAt: null,
        lastTransactionDate: null,
        lastShipmentDate: null,
        contactId: cb.contactId,
        createdAt: null,
        source: "billing",
      }));

    cbs = [...cbs, ...billingCbs];

    // Apply callback date filter
    if (callbackDateFilter !== "all") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
      if (callbackDateFilter === "today") {
        cbs = cbs.filter((l: any) => l.callbackAt >= todayStart && l.callbackAt <= todayEnd);
      } else if (callbackDateFilter === "tomorrow") {
        const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
        const tomorrowEnd = todayEnd + 24 * 60 * 60 * 1000;
        cbs = cbs.filter((l: any) => l.callbackAt >= tomorrowStart && l.callbackAt <= tomorrowEnd);
      } else if (callbackDateFilter === "this_week") {
        const dayOfWeek = now.getDay() || 7;
        const weekStart = todayStart - (dayOfWeek - 1) * 24 * 60 * 60 * 1000;
        const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;
        cbs = cbs.filter((l: any) => l.callbackAt >= weekStart && l.callbackAt <= weekEnd);
      }
    }
    // Sort by soonest callback first
    cbs.sort((a: any, b: any) => (a.callbackAt ?? 0) - (b.callbackAt ?? 0));
    return cbs;
  }, [allLeads, allBillingCallbacksData, callbackDateFilter]);

  const callbacksTodayCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return allLeads.filter(
      (l: any) => l.callbackAt && l.callbackAt >= todayStart.getTime() && l.callbackAt <= todayEnd.getTime()
    ).length;
  }, [allLeads]);

  const doneDealCount = useMemo(
    () => allLeads.filter((l: any) => l.workStatus === "done_deal" || l.workStatus === "retained").length,
    [allLeads]
  );

  // Extract contactIds from leads for Messages tab
  const agentContactIds = useMemo(
    () => allLeads.filter((l: any) => l.contactId).map((l: any) => l.contactId as number),
    [allLeads]
  );

  const displayLeads = activeTab === "leads" ? leads : activeTab === "callbacks" ? callbackLeads : [];

  const stats = useMemo(() => {
    const total = leads.length;
    const unassigned = leads.filter((l) => !l.assignedAgent || l.workStatus === "new").length;
    const urgent = leads.filter((l) => l.urgencyScore >= 70).length;
    const retained = leads.filter((l) => l.workStatus === "retained").length;
    const doneDealLeads = leads.filter((l) => l.workStatus === "done_deal");
    const futureDealLeads = leads.filter((l) => l.workStatus === "future_deal");
    const doneDeal = doneDealLeads.length;
    const futureDeal = futureDealLeads.length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newToday = (leadsData?.leads ?? []).filter((l: any) => {
      if (l.assignedAgent) return false;
      const dateStr = l.currentTermEndsAt;
      if (!dateStr) return false;
      const ts = new Date(dateStr).getTime();
      return !isNaN(ts) && ts >= todayStart.getTime();
    }).length;
    return { total, unassigned, urgent, retained, doneDeal, futureDeal, newToday };
  }, [leads, leadsData]);

  // Agent workload cards
  const agentCardData = useMemo(() => {
    return AGENTS.map((agent) => {
      const agentLeads = allLeads.filter((l: any) => l.assignedAgent === agent);
      const closings = agentLeads.filter((l: any) =>
        ["retained", "done_deal"].includes(l.workStatus)
      );
      const subClosings = closings.filter((l: any) => l.leadCategory !== "installment").length;
      const instalmentClosings = closings.filter((l: any) => l.leadCategory === "installment").length;
      const totalAmount = closings.reduce((sum: number, l: any) => sum + (l.monthlyAmount || 0), 0);
      return { agent, closings: closings.length, subClosings, instalmentClosings, totalAmount };
    });
  }, [allLeads]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = leads
      .filter((l: any) => selectedIds.has(l.subscriptionId))
      .map((l: any) => l.assignmentId as number)
      .filter((id: number) => typeof id === "number" && !isNaN(id));
    if (idsToDelete.length === 0) {
      toast.error("Could not resolve lead IDs");
      return;
    }
    bulkDeleteLeads.mutate({ ids: idsToDelete });
  };

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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Command Centre</h1>
          <p className="text-sm text-gray-600 mt-0.5">Retention Lead Management</p>
          <MaximusGreeting userName={user?.name?.split(" ")[0] ?? "Commander"} />
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-800">
          <span className="font-medium">{allLeads.length} leads</span>
          <span className="text-gray-400">|</span>
          <span className="font-medium">{callbacksTodayCount} callbacks today</span>
          <span className="text-gray-400">|</span>
          <span className="font-medium text-green-700">{doneDealCount} done deals</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("leads")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "leads"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Inbox className="w-4 h-4" />
          Incoming Leads
        </button>
        <button
          onClick={() => setActiveTab("callbacks")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "callbacks"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          My Callbacks
          {callbackLeads.length > 0 && (
            <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 text-white ${callbacksTodayCount > 0 ? 'bg-red-600' : 'bg-indigo-500'}`}>
              {callbackLeads.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "messages"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Messages
        </button>
        <button
          onClick={() => setActiveTab("emails")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "emails"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Mail className="w-4 h-4" />
          Emails
        </button>
        <button
          onClick={() => setActiveTab("allClients")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "allClients"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Users className="w-4 h-4" />
          All Clients
        </button>
        <button
          onClick={() => setActiveTab("decline")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "decline"
              ? "border-red-600 text-red-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Decline
        </button>
        <button
          onClick={() => setActiveTab("cancel")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "cancel"
              ? "border-gray-600 text-gray-800"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <XCircle className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={() => setActiveTab("endInstalment")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "endInstalment"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          End Instalment
        </button>
        <button
          onClick={() => setActiveTab("butler")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "butler"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-purple-600 hover:text-purple-800"
          }`}
        >
          <Swords className="w-4 h-4" />
          Maximus Aurelius
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "customers"
              ? "border-green-500 text-green-600"
              : "border-transparent text-green-500 hover:text-green-700"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Customers
        </button>
        <button
          onClick={() => setActiveTab("performance")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "performance"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Performance
        </button>
      </div>

      {/* ─── Tab Content: Messages ─────────────────────────────────────────────── */}
      {activeTab === "messages" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WhatsAppChatPanel open={true} onClose={() => setActiveTab("leads")} inline contactIds={agentContactIds} />
        </div>
      )}

      {/* ─── Tab Content: Emails ───────────────────────────────────────────────── */}
      {activeTab === "emails" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WorkspaceEmailPanel contactId={selectedLeadContactId} visible={activeTab === "emails"} />
        </div>
      )}

      {/* ─── Tab Content: All Clients ──────────────────────────────────────────── */}
      {activeTab === "allClients" && (
        <AllClientsTab
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {/* ─── Tab Content: Decline ──────────────────────────────────────────────── */}
      {activeTab === "decline" && (
        <DeclineTab
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {/* ─── Tab Content: Cancel ───────────────────────────────────────────────── */}
      {activeTab === "cancel" && (
        <CancelTab
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {/* ─── Tab Content: End Instalment ───────────────────────────────────────── */}
      {activeTab === "endInstalment" && (
        <EndInstalmentTab
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {/* ─── Tab Content: Maximus Aurelius ──────────────────────────────────────────── */}
      {activeTab === "butler" && (
        <PersonalButlerTab />
      )}
      {/* ─── Tab Content: Customers ───────────────────────────────────────────── */}
      {activeTab === "customers" && (
        <CustomersTab />
      )}
      {/* ─── Tab Content: Performance ─────────────────────────────────────────────── */}
      {activeTab === "performance" && (
        <PerformanceTab />
      )}

      {/* ─── Tab Content: Incoming Leads / Callbacks ───────────────────────────── */}
      {(activeTab === "leads" || activeTab === "callbacks") && (
        <>
          {/* Month sub-tabs (Incoming Leads only) */}
          {activeTab === "leads" && (
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              {monthTabs.map(({ label, month }) => (
                <button
                  key={month}
                  onClick={() => setSelectedLeadsMonth(month)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
                    selectedLeadsMonth === month
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-600 font-medium">Total</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <Inbox className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.unassigned}</p>
                <p className="text-xs text-gray-600 font-medium">Unassigned</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.urgent}</p>
                <p className="text-xs text-gray-600 font-medium">Urgent</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.retained}</p>
                <p className="text-xs text-gray-600 font-medium">Retained</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Handshake className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.doneDeal}</p>
                <p className="text-xs text-gray-600 font-medium">Done Deal</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.futureDeal}</p>
                <p className="text-xs text-gray-600 font-medium">Future Deal</p>
              </div>
            </div>
            <button
              onClick={() => {
                setDateRangeFilter("today");
                setLeadStatusFilter("new");
              }}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 hover:border-blue-300 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 relative">
                <CalendarPlus className="h-5 w-5 text-blue-600" />
                {stats.newToday > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.newToday}</p>
                <p className="text-xs text-gray-600 font-medium">New Today</p>
              </div>
            </button>
          </div>


          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
            <div className="relative w-52 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-800" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm w-full font-bold text-gray-800 placeholder-gray-800"
              />
            </div>
            {activeTab === "callbacks" && (
              <select
                value={callbackDateFilter}
                onChange={(e) => setCallbackDateFilter(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 font-medium"
              >
                <option value="all">All Callbacks</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="this_week">This Week</option>
              </select>
            )}
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 w-32 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="all">All Agents</SelectItem>
                {AGENTS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="Lead Status" />
              </SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="all">All Lead Status</SelectItem>
                <SelectItem value="new">New (Unassigned)</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
              <SelectTrigger className="h-9 w-48 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="All Lead Types" />
              </SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="all">All Lead Types</SelectItem>
                {LEAD_TYPE_OPTIONS.map((lt) => {
                  const b = getLeadTypeBadge(lt, 0);
                  return (
                    <SelectItem key={lt} value={lt}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${b.bg}`}></span>
                        {lt}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40 text-sm border border-gray-300 rounded-lg">
                <SelectValue placeholder="Work Status" />
              </SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="all">All Work Status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
              <SelectContent side="bottom">
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
                <span className="text-sm text-gray-600">&rarr;</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1 text-sm h-9 px-3"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "Loading..." : "Refresh"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={!leads.length}
                className="gap-1 text-sm h-9 px-3"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <span className="text-sm text-gray-800 font-medium">
                {isLoading ? "Loading..." : `${displayLeads.length} leads`}
              </span>
            </div>
          </div>

          {/* Bulk action toolbar */}
          {selectedIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 text-gray-800 px-6 py-2 flex items-center gap-3 text-sm rounded-md mb-4">
              <CheckSquare className="h-4 w-4" />
              <span className="font-medium">
                {selectedIds.size} lead{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-gray-600 text-sm">Assign to:</span>
                <Select value={bulkAgent} onValueChange={setBulkAgent}>
                  <SelectTrigger className="h-8 w-32 text-sm bg-white border-gray-300 text-gray-800">
                    <SelectValue placeholder="Choose agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENTS.map((a) => (
                      <SelectItem key={a} value={a}>
                        <span className="flex items-center gap-2">
                          {a}
                          {agentWorkload[a] !== undefined && (
                            <span className="text-xs text-gray-600">({agentWorkload[a]} active)</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8 px-3 text-sm bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded"
                  disabled={!bulkAgent || bulkAssign.isPending}
                  onClick={handleBulkAssign}
                >
                  {bulkAssign.isPending ? "Assigning..." : "Assign"}
                </Button>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  className="h-8 px-3 text-sm bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5 ml-2"
                  disabled={bulkDeleteLeads.isPending}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleteLeads.isPending ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
                </Button>
              )}
              {/* Bulk Messaging Buttons */}
              <div className="flex items-center gap-2 ml-4 border-l border-gray-300 pl-4">
                <button
                  onClick={() => setBulkMsgChannel("whatsapp")}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
                <button
                  onClick={() => setBulkMsgChannel("sms")}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  SMS
                </button>
                <button
                  onClick={() => setBulkMsgChannel("email")}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </button>
              </div>
              <button
                className="ml-auto text-gray-500 hover:text-gray-800"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Delete confirmation dialog */}
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to permanently delete{" "}
                  <strong>{selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""}</strong> from the
                  database. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    handleDeleteSelected();
                  }}
                >
                  Yes, delete {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading leads...
            </div>
          ) : displayLeads.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
              No leads found
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-visible shadow-sm">
              {/* CSS Grid Table Header */}
              <div
                className="grid items-center gap-0 px-2 py-2.5 bg-gray-50 border-b border-gray-200 min-w-[1600px]"
                style={{ gridTemplateColumns: activeTab === "callbacks" ? "32px 150px 160px 100px 80px 130px 120px 90px 70px 160px minmax(200px, 1fr) minmax(200px, 1fr)" : "32px 150px 160px 100px 80px 130px 90px 70px 160px minmax(200px, 1fr) minmax(200px, 1fr)" }}
              >
                <div className="px-1">
                  <button
                    onClick={() => toggleSelectAll(displayLeads)}
                    className="text-gray-800 hover:text-blue-600"
                  >
                    {selectedIds.size === displayLeads.length && displayLeads.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Name</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Email</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Agent</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Status</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Work Status</div>
                {activeTab === "callbacks" && (
                  <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Callback Due</div>
                )}
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Date</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Time In</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Lead Type</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Customer Note</div>
                <div className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide px-2">Agent Note</div>
              </div>

              {/* CSS Grid Table Body */}
              <div className="overflow-x-auto">
                {displayLeads.map((lead: any) => {
                  const badge = getLeadTypeBadge(lead.leadType, lead.daysSinceEvent ?? 0);
                  const statusStyle = getStatusStyle(lead.workStatus);
                  const isExpanded = expandedRow === lead.subscriptionId;
                  const leadDate = lead.currentTermEndsAt || lead.nextBillingAt || null;
                  const isSelected = selectedIds.has(lead.subscriptionId);

                  return (
                    <React.Fragment key={lead.subscriptionId}>
                      <div
                        className={`grid items-center gap-0 px-2 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors min-w-[1600px] ${
                          isSelected ? "ring-2 ring-inset ring-blue-400 bg-blue-50" : ""
                        }`}
                        style={{ gridTemplateColumns: activeTab === "callbacks" ? "32px 150px 160px 100px 80px 130px 120px 90px 70px 160px minmax(200px, 1fr) minmax(200px, 1fr)" : "32px 150px 160px 100px 80px 130px 90px 70px 160px minmax(200px, 1fr) minmax(200px, 1fr)" }}
                      >
                        {/* Checkbox */}
                        <div className="px-1">
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
                        </div>
                        {/* Name + Phone */}
                        <div className="px-2">
                          <button
                            onClick={() => {
                              if (lead.contactId) {
                                window.location.href = `/contacts/${lead.contactId}?from=retention&subId=${encodeURIComponent(lead.subscriptionId)}`;
                              } else {
                                setExpandedRow(isExpanded ? null : lead.subscriptionId);
                              }
                            }}
                            className="font-medium text-gray-900 text-sm leading-tight truncate max-w-[140px] hover:text-blue-600 hover:underline cursor-pointer text-left"
                          >
                            {lead.customerName}
                          </button>
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                            >
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                        {/* Email */}
                        <div className="px-2">
                          {lead.contactId ? (
                            <button
                              onClick={() => navigate(`/contacts/${lead.contactId}`)}
                              title={lead.email}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate max-w-[150px] font-medium"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{lead.email}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </button>
                          ) : (
                            <span
                              title={lead.email}
                              className="flex items-center gap-1 text-xs text-gray-800 truncate max-w-[150px]"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </span>
                          )}
                        </div>
                        {/* Agent */}
                        <div className="px-2">
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
                              className={`h-8 w-[90px] text-sm border rounded-lg px-2 font-medium ${
                                lead.assignedAgent && AGENT_COLORS[lead.assignedAgent]
                                  ? `${AGENT_COLORS[lead.assignedAgent].bg} ${AGENT_COLORS[lead.assignedAgent].text} ${AGENT_COLORS[lead.assignedAgent].border}`
                                  : lead.assignedAgent
                                  ? "text-gray-900 border-gray-300"
                                  : "text-green-700 bg-green-100 border-green-300"
                              }`}
                            >
                              <SelectValue placeholder="Assign..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                <span className="text-gray-600 italic">Unassigned</span>
                              </SelectItem>
                              {AGENTS.map((a) => (
                                <SelectItem key={a} value={a}>{a}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Lead Status */}
                        <div className="px-2">
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
                        </div>
                        {/* Work Status */}
                        <div className="px-2">
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
                              className={`h-8 w-[120px] text-xs border border-gray-300 rounded-lg px-2 font-medium ${
                                lead.workStatus &&
                                lead.workStatus !== "new" &&
                                lead.workStatus !== "assigned"
                                  ? `${statusStyle.bg} ${statusStyle.text}`
                                  : "text-gray-600 italic bg-transparent"
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
                        </div>
                        {/* Callback Due (only in callbacks tab) */}
                        {activeTab === "callbacks" && (
                          <div className="px-2 text-sm text-gray-800 whitespace-nowrap">
                            {lead.callbackAt
                              ? new Date(lead.callbackAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + new Date(lead.callbackAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
                              : "\u2014"}
                          </div>
                        )}
                        {/* Date */}
                        <div className="px-2 text-sm text-gray-800 whitespace-nowrap">
                          {formatDate(leadDate)}
                        </div>
                        {/* Time In */}
                        <div className="px-2 text-sm text-gray-600 whitespace-nowrap">
                          {lead.createdAt ? new Date(lead.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "\u2014"}
                        </div>
                        {/* Lead Type */}
                        <div className="px-2">
                          {editingLeadType === lead.subscriptionId ? (
                            <Select
                              value={lead.leadType ?? ""}
                              onValueChange={(v) => {
                                assignLead.mutate({
                                  subscriptionId: lead.subscriptionId,
                                  leadType: v,
                                });
                                setEditingLeadType(null);
                              }}
                              open
                              onOpenChange={(open) => { if (!open) setEditingLeadType(null); }}
                            >
                              <SelectTrigger className="h-7 text-xs w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LEAD_TYPE_OPTIONS.map((lt) => {
                                  const b = getLeadTypeBadge(lt, 0);
                                  return (
                                    <SelectItem key={lt} value={lt}>
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${b.bg} ${b.text}`}>
                                        {b.label}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex items-center gap-1 group">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${badge.bg} ${badge.text}`}
                              >
                                {badge.label}
                              </span>
                              {user?.role === "admin" && !user?.team && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingLeadType(lead.subscriptionId); }}
                                  className="p-0.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                                  title="Edit lead type"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Customer Note */}
                        <div className="px-2">
                          {lead.managerNote ? (() => {
                            const cleaned = stripHtml(lead.managerNote);
                            return (
                              <details className="group">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex items-start gap-1 w-[200px] px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm">
                                    <span className="text-sm text-gray-800 flex-1 line-clamp-2 leading-snug">{cleaned}</span>
                                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-900 mt-0.5 group-open:rotate-180 transition-transform" />
                                  </div>
                                </summary>
                                <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto w-[250px]">
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{cleaned}</p>
                                </div>
                              </details>
                            );
                          })() : (
                            <div className="flex items-start gap-1 w-[200px] px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                              <span className="text-sm text-gray-500 italic flex-1">No note</span>
                            </div>
                          )}
                        </div>
                        {/* Agent Note */}
                        <div className="px-2">
                          <NotesCell
                            managerNote={lead.managerNote}
                            agentNote={lead.agentNote}
                            subscriptionId={lead.subscriptionId}
                            onSaveNote={(note) =>
                              assignLead.mutate({
                                subscriptionId: lead.subscriptionId,
                                agentNote: note,
                              })
                            }
                            onOpen={() => setExpandedRow(null)}
                          />
                        </div>
                      </div>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 relative min-w-[1600px]">
                          <button
                            onClick={() => setExpandedRow(null)}
                            className="absolute top-2 right-4 p-1 rounded-full hover:bg-blue-200 transition-colors"
                            title="Close"
                          >
                            <X className="w-5 h-5 text-gray-800" />
                          </button>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Plan</p>
                              <p className="text-gray-800">{lead.planName || "\u2014"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Cycles Completed</p>
                              <p className="text-gray-800">{lead.cyclesCompleted ?? "\u2014"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Monthly Amount</p>
                              <p className="text-gray-800">{formatCurrency(lead.monthlyAmount, lead.currencyCode)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Total Spend</p>
                              <p className="text-gray-800 font-semibold">{formatCurrency(lead.totalSpend, lead.currencyCode)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Last Call</p>
                              <p className="text-gray-800">
                                {lead.lastCallAt
                                  ? new Date(lead.lastCallAt).toLocaleDateString("en-GB")
                                  : "\u2014"}
                                {lead.lastCallResult && (
                                  <span className="ml-1 text-gray-800">({lead.lastCallResult})</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 uppercase text-[10px] mb-0.5">Urgency Flags</p>
                              <div className="flex flex-wrap gap-1">
                                {(lead.urgencyFlags || []).length > 0 ? (
                                  lead.urgencyFlags.map((f: string) => (
                                    <span
                                      key={f}
                                      className="px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-[10px]"
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
                          {/* Full customer note in expanded row - editable by admin */}
                          <CustomerMessageEditor
                            leadId={lead.subscriptionId}
                            message={lead.managerNote || ""}
                            onSave={(newMsg) =>
                              assignLead.mutate({
                                subscriptionId: lead.subscriptionId,
                                managerNote: newMsg,
                              })
                            }
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {/* Bulk Messaging Template Modal */}
      <BulkTemplateModal
        open={bulkMsgChannel !== null}
        channel={bulkMsgChannel || "whatsapp"}
        recipients={displayLeads
          .filter((l: any) => selectedIds.has(l.subscriptionId))
          .map((l: any) => ({ phone: l.phone || null, email: l.email || null, name: l.customerName || null }))}
        onClose={() => setBulkMsgChannel(null)}
        onSuccess={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
