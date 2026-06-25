import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MaximusGreeting } from "@/components/MaximusGreeting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Phone,
  MessageCircle,
  Mail,
  ChevronRight,
  MessageSquare,
  X,
  Pencil,
  Send,
  Calendar,
  Clock,
  Copy,
  Inbox,
  Users,
  TrendingDown,
  XCircle,
  CreditCard,
  Swords,
  BarChart3,
  BookOpen,
  RotateCcw,
  Upload,
} from "lucide-react";
import { WhatsAppChatPanel } from "@/components/WhatsAppChatPanel";
import { WorkspaceEmailPanel } from "@/components/WorkspaceEmailPanel";
import { MyClientsTab } from "@/components/MyClientsTab";
import { DeclineTab } from "@/components/DeclineTab";
import { CancelTab } from "@/components/CancelTab";
import { EndInstalmentTab } from "@/components/EndInstalmentTab";
import { PersonalButlerTab } from "@/components/PersonalButlerTab";
import { PerformanceTab } from "@/components/PerformanceTab";
import { useCheckboxSelection } from "@/hooks/useCheckboxSelection";
import { BulkMessagingBar } from "@/components/BulkMessagingBar";
import Papa from "papaparse";
import { BulkTemplateModal } from "@/components/BulkTemplateModal";

// ─── Lead Type Badge Colors ──────────────────────────────────────────────────

const LEAD_TYPE_COLORS: Record<string, string> = {
  "Pre-Cycle-Decline": "#3d3d3d",
  "Pre-Cycle - Decline": "#3d3d3d",
  "Pre-Cycle-Cancelled": "#d4edbc",
  "Pre-Cycle- Cancelled": "#d4edbc",
  "Live-Sub Decline": "#bfe1f6",
  "Decline Live Sub": "#bfe1f6",
  "Live Sub Declined 2nd+": "#bfe1f6",
  "Warm Lead": "#ffe5a0",
  "Warm lead": "#ffe5a0",
  "Hot Lead": "#ffe5a0",
  "Cancel Live Sub": "#0a53a8",
  "Cancel Live Sub (Cycle 1)": "#0a53a8",
  "Cancel 2+ Cycle": "#14c07a",
  "Cancel Live Sub (Cycle 2+)": "#14c07a",
  "Live Sub": "#e6cff2",
  "Live Sub 3 Days": "#e6cff2",
  "Live Sub 7 Days": "#e6cff2",
  "Live Sub 7 days": "#e6cff2",
  "Live Sub 14days+": "#e6cff2",
  "Live Sub 2nd+": "#e6cff2",
  "From Cat to Rob": "#92400e",
  "Gabi to Rob": "#dc2626",
  "End of Instalment": "#f97316",
  "Duplicate": "#9ca3af",
};

// ─── Work Status Badge Config ────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-green-100", text: "text-green-800", label: "New" },
  assigned: { bg: "bg-amber-100", text: "text-amber-800", label: "Assigned" },
  working: { bg: "bg-amber-100", text: "text-amber-800", label: "Working" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-800", label: "In Progress" },
  done_deal: { bg: "bg-blue-500", text: "text-white font-bold", label: "Done Deal" },
  retained_sub: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Retained Sub" },
  retained: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Retained" },
  closed: { bg: "bg-red-100", text: "text-red-800", label: "Closed" },
  callback: { bg: "bg-blue-100", text: "text-blue-800", label: "Callback" },
  follow_up: { bg: "bg-blue-100", text: "text-blue-800", label: "Follow Up" },
  no_answer: { bg: "bg-orange-100", text: "text-orange-800", label: "No Answer" },
  not_interested: { bg: "bg-gray-100", text: "text-gray-700", label: "Not Interested" },
  whatsapp_queue: { bg: "bg-green-100", text: "text-green-800", label: "WhatsApp Queue" },
  future_deal: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Future Deal" },
};

function getStatusBadge(status: string) {
  return STATUS_BADGE[status] || { bg: "bg-gray-100", text: "text-gray-700", label: status };
}

// ─── Date Formatter ──────────────────────────────────────────────────────────

function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

// ─── Status Dropdown Options ─────────────────────────────────────────────────

const STATUS_OPTIONS = ["new", "working", "closed", "done_deal", "retained_sub", "callback", "no_answer", "not_interested"] as const;

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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RetentionWorkspace({ agentName: agentNameProp }: { agentName?: string } = {}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"queue" | "callbacks" | "followups" | "messages" | "emails" | "clients" | "decline" | "cancel" | "endInstalment" | "butler" | "performance">(() => {
    const saved = sessionStorage.getItem("retention-workspace-tab");
    if (saved && ["queue", "callbacks", "followups", "messages", "emails", "clients", "decline", "cancel", "endInstalment", "butler", "performance"].includes(saved)) {
      return saved as any;
    }
    return "performance";
  });

  // Persist active tab to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("retention-workspace-tab", activeTab);
  }, [activeTab]);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [statusDropdownOpen, setStatusDropdownOpen] = useState<string | null>(null);
  const [selectedLeadContactId, setSelectedLeadContactId] = useState<number | null>(null);

  // Usage Protocol modal
  const [protocolOpen, setProtocolOpen] = useState(false);

  // Email template modal state
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [emailLeadContactId, setEmailLeadContactId] = useState<number | null>(null);
  const [emailLeadName, setEmailLeadName] = useState("");
  const [emailLeadEmail, setEmailLeadEmail] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [composeFreeEmail, setComposeFreeEmail] = useState(false);
  const [freeSubject, setFreeSubject] = useState("");
  const [freeBody, setFreeBody] = useState("");

  // WhatsApp & SMS modal state
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [msgLeadContactId, setMsgLeadContactId] = useState<number | null>(null);
  const [msgLeadPhone, setMsgLeadPhone] = useState("");
  const [msgLeadName, setMsgLeadName] = useState("");
    const [smsBody, setSmsBody] = useState("");
  // Filter state
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>("all");
  const [callbackDateFilter, setCallbackDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Bulk messaging state for leads table
  const { selectedIds: bulkSelectedIds, isSelected: bulkIsSelected, toggle: bulkToggle, toggleAll: bulkToggleAll, isAllSelected: bulkIsAllSelected, clearSelection: bulkClearSelection, selectedCount: bulkSelectedCount } = useCheckboxSelection();
  const [bulkMsgChannel, setBulkMsgChannel] = useState<"whatsapp" | "sms" | "email" | null>(null);

  // Callback modal state
  const [callbackModal, setCallbackModal] = useState<{ subscriptionId: string; contactName: string; type: "callback" | "follow_up" } | null>(null);
  const [editingLeadType, setEditingLeadType] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [callbackDateTime, setCallbackDateTime] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  // Fetch leads for the current agent
  const agentName = agentNameProp || "Rob";
  const { data: leadsData, refetch } = trpc.manager.getLeads.useQuery(
    {
      agentFilter: agentName,
      perPage: 200,
      dateRangeFilter: "all",
      sortBy: "leadStatus",
    },
    { refetchOnWindowFocus: false, refetchInterval: 30_000 }
  );

  // Fetch billing callbacks for this agent (from client_subscriptions)
  const { data: billingCallbacksData } = trpc.billing.getClientCallbacks.useQuery(
    { agentName },
    { refetchOnWindowFocus: false, refetchInterval: 30_000 }
  );

  // Email template queries
  const { data: emailTemplates } = trpc.emailTemplates.list.useQuery(
    undefined,
    { enabled: emailTemplateOpen }
  );
  const { data: selectedTemplate, isLoading: templateDetailLoading } = trpc.emailTemplates.getById.useQuery(
    { id: selectedTemplateId! },
    { enabled: selectedTemplateId !== null }
  );
  const previewHtml = useMemo(() => {
    if (!selectedTemplate || !emailLeadName) return null;
    const body = selectedTemplate.htmlBody
      .replaceAll("${Customers.First Name}", (emailLeadName ?? "").split(" ")[0] || "[Name]")
      .replaceAll("${Customers.Customers Owner}", user?.name ?? "[Agent]")
      .replaceAll("${agentName}", user?.name ?? "[Agent Name]")
      .replaceAll("${agentEmail}", user?.email ?? "[Agent Email]");
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
    const formattedBody = hasHtmlTags ? body : body.replace(/\n/g, "<br>");
    const headerImg = selectedTemplate.headerImageUrl
      ? `<tr><td style="padding:0;"><img src="${selectedTemplate.headerImageUrl}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>`
      : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">${headerImg}<tr><td style="padding:32px 32px 24px;"><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p></td></tr><tr><td style="padding:0 32px 24px;"><p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${user?.name ?? "[Agent]"}</strong></p></td></tr></table></td></tr></table></body></html>`;
  }, [selectedTemplate, emailLeadName, user]);
  const sendTemplateMutation = trpc.emailTemplates.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully \u2705");
      setEmailTemplateOpen(false);
      setSelectedTemplateId(null);
    },
    onError: (err) => toast.error(`Failed to send: ${err.message}`),
  });
  const sendFreeEmailMutation = trpc.emails.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully \u2705");
      setEmailTemplateOpen(false);
      setComposeFreeEmail(false);
      setFreeSubject("");
      setFreeBody("");
    },
    onError: (err) => toast.error(`Failed to send: ${err.message}`),
  });

  // WhatsApp templates & send
  const { data: whatsappTemplates, isLoading: waTemplatesLoading } = trpc.whatsapp.templates.useQuery(
    undefined,
    { enabled: waModalOpen }
  );
  const sendWhatsAppMutation = trpc.whatsapp.send.useMutation({
    onSuccess: () => {
      toast.success("WhatsApp message sent \u2705");
      setWaModalOpen(false);
    },
    onError: (err) => toast.error(`WhatsApp failed: ${err.message}`),
  });

  // SMS templates & send
  const { data: smsTemplates, isLoading: smsTemplatesLoading } = (trpc.whatsapp as any).smsTemplates.useQuery(
    undefined,
    { enabled: smsModalOpen }
  );
  const sendSmsMutation = (trpc.whatsapp as any).sendSms.useMutation({
    onSuccess: () => {
      toast.success("SMS sent \u2705");
      setSmsModalOpen(false);
      setSmsBody("");
    },
    onError: (err: any) => toast.error(`SMS failed: ${err.message}`),
  });
  const sendSmsTemplateMutation = (trpc.whatsapp as any).sendSmsTemplate.useMutation({
    onSuccess: () => {
      toast.success("SMS template sent \u2705");
      setSmsModalOpen(false);
    },
    onError: (err: any) => toast.error(`SMS template failed: ${err.message}`),
  });

  const logCallAttemptMutation = trpc.manager.logCallAttempt.useMutation({
    onSuccess: () => { toast.success("Callback scheduled"); refetch(); },
    onError: (err: any) => toast.error(err.message || "Failed to schedule callback"),
  });

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
  const assignLeadMutation = trpc.manager.assignLead.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Return leads to Command Centre (managers only)
  const returnToCCMutation = trpc.manager.returnToCommandCentre.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.returned} lead${data.returned > 1 ? "s" : ""} returned to Command Centre`);
      refetch();
      bulkClearSelection();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Clear billing callback (dismiss from My Callbacks)
  const clearCallbackMutation = trpc.billing.clearClientCallback.useMutation({
    onSuccess: () => {
      toast.success("Callback dismissed");
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // CSV Import for leads (managers only)
  const csvInputRef = useRef<HTMLInputElement>(null);
  const importLeadsMutation = trpc.manager.importLeads.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported: ${data.inserted} new, ${data.updated} updated, ${data.skipped} skipped`);
      refetch();
    },
    onError: (e: { message: string }) => toast.error(`Import failed: ${e.message}`),
  });

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const mapped = rows
          .filter((r) => r["Full Name"] || r["full name"] || r.name || r.Name)
          .map((r) => {
            const name = r["Full Name"] || r["full name"] || r.name || r.Name || "";
            const email = r.Email || r.email || undefined;
            const phone = r.Phone || r.phone || r.Mobile || r.mobile || undefined;
            const callOwner = r["Call Owner"] || r["call owner"] || r["Agent"] || r["agent"] || undefined;
            const subject = r.Subject || r.subject || r.Notes || r.notes || undefined;
            const callStartTime = r["Call Start Time"] || r["call start time"] || r["Callback"] || r["callback"] || undefined;

            // Build address from mailing fields
            const street = r["Mailing Street"] || r["Mailing Str"] || "";
            const street2 = r["Mailing Street 2"] || r["Mailing Street2"] || "";
            const city = r["Mailing City"] || "";
            const postcode = r["Mailing Postcode"] || r["Mailing Poc"] || r["Mailing Zip"] || "";
            const country = r["Mailing Country"] || r["Mailing Co"] || "";
            const address = [street, street2, city, postcode, country].filter(Boolean).join(", ") || undefined;

            // Parse callback date
            let callbackAt: number | undefined;
            if (callStartTime) {
              const parsed = new Date(callStartTime);
              if (!isNaN(parsed.getTime())) callbackAt = parsed.getTime();
            }

            // Map Zoho status to our workStatus
            const callType = r["Call Type"] || r["call type"] || "";
            const status = r["Status"] || r["status"] || r["Call Status"] || r["call status"] || "";
            let workStatus: string | undefined;
            const statusLower = status.toLowerCase();
            if (statusLower.includes("no answer") || statusLower.includes("no_answer")) workStatus = "no_answer";
            else if (statusLower.includes("call back") || statusLower.includes("callback")) workStatus = "callback";
            else if (statusLower.includes("follow up") || statusLower.includes("follow_up")) workStatus = "follow_up";
            else if (statusLower.includes("not interest")) workStatus = "not_interested";
            else if (statusLower.includes("sold") || statusLower.includes("done")) workStatus = "done_deal";
            else if (callbackAt) workStatus = "callback";

            return {
              customerName: name,
              email,
              phone,
              assignedAgent: callOwner,
              customerNote: subject,
              callbackAt,
              workStatus,
              address,
            };
          });

        if (mapped.length === 0) {
          toast.error("No valid rows found. Expected column: Full Name");
          return;
        }
        toast.info(`Importing ${mapped.length} leads...`);
        importLeadsMutation.mutate({ leads: mapped });
      },
      error: (err) => toast.error(`CSV parse error: ${err.message}`),
    });
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  type Lead = NonNullable<typeof leadsData>["leads"][number];
  const allLeads: Lead[] = useMemo(
    () => [...(leadsData?.leads ?? [])].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // newest first
    }),
    [leadsData]
  );

  // Extract contactIds from leads for filtering Messages/Emails tabs
  const agentContactIds = useMemo(
    () => allLeads.filter((l) => l.contactId).map((l) => l.contactId as number),
    [allLeads]
  );

  // Apply date + lead type filters
  const filteredLeads: Lead[] = useMemo(() => {
    let result = allLeads;
    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      let startDate: Date;
      if (dateFilter === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "7days") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === "thisMonth") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateFilter === "lastMonth") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        result = result.filter((l) => {
          const d = new Date(l.createdAt || 0).getTime();
          return d >= startDate.getTime() && d <= endDate.getTime();
        });
        // Skip the generic filter below
        startDate = undefined as any;
      } else {
        startDate = undefined as any;
      }
      if (startDate) {
        result = result.filter((l) => new Date(l.createdAt || 0).getTime() >= startDate.getTime());
      }
    }
    // Lead type filter
    if (leadTypeFilter !== "all") {
      result = result.filter((l) => l.leadType === leadTypeFilter);
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((l) =>
        (l.customerName || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.phone || "").includes(q)
      );
    }
    return result;
  }, [allLeads, dateFilter, leadTypeFilter, searchQuery]);

  // Tab filtering - show ALL leads in queue
  const queueLeads = useMemo(
    () => filteredLeads,
    [filteredLeads]
  );

  const callbackLeads = useMemo(() => {
    // Lead-assignment callbacks
    let cbs: (Lead & { source?: string })[] = allLeads
      .filter((l: Lead) => l.callbackAt)
      .map((l) => ({ ...l, source: "lead" as const }));

    // Billing (client_subscriptions) callbacks — map to Lead-compatible shape
    const billingCbs: (Lead & { source?: string })[] = (billingCallbacksData?.callbacks ?? [])
      .filter((cb) => cb.callbackAt)
      .map((cb) => ({
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
        source: "billing" as const,
      } as Lead & { source?: string }));

    cbs = [...cbs, ...billingCbs];

    // Apply callback date filter
    if (callbackDateFilter !== "all") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
      if (callbackDateFilter === "today") {
        cbs = cbs.filter((l) => l.callbackAt! >= todayStart && l.callbackAt! <= todayEnd);
      } else if (callbackDateFilter === "tomorrow") {
        const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
        const tomorrowEnd = todayEnd + 24 * 60 * 60 * 1000;
        cbs = cbs.filter((l) => l.callbackAt! >= tomorrowStart && l.callbackAt! <= tomorrowEnd);
      } else if (callbackDateFilter === "this_week") {
        const dayOfWeek = now.getDay() || 7; // Mon=1
        const weekStart = todayStart - (dayOfWeek - 1) * 24 * 60 * 60 * 1000;
        const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;
        cbs = cbs.filter((l) => l.callbackAt! >= weekStart && l.callbackAt! <= weekEnd);
      }
    }
    // Sort: overdue first (oldest first), then today, then future (soonest first)
    const now = Date.now();
    const todayStartMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const todayEndMs = new Date(new Date().setHours(23, 59, 59, 999)).getTime();
    cbs.sort((a, b) => {
      const aTime = a.callbackAt ?? 0;
      const bTime = b.callbackAt ?? 0;
      const aOverdue = aTime < todayStartMs ? 0 : aTime <= todayEndMs ? 1 : 2;
      const bOverdue = bTime < todayStartMs ? 0 : bTime <= todayEndMs ? 1 : 2;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      // Within same group: overdue = oldest first, today/future = soonest first
      return aTime - bTime;
    });
    return cbs;
  }, [allLeads, billingCallbacksData, callbackDateFilter]);

  const doneDealCount = useMemo(
    () => allLeads.filter((l: Lead) => l.workStatus === "done_deal" || l.workStatus === "retained").length,
    [allLeads]
  );

  // Callbacks today count
  const callbacksTodayCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return allLeads.filter(
      (l: Lead) => l.callbackAt && l.callbackAt >= todayStart.getTime() && l.callbackAt <= todayEnd.getTime()
    ).length;
  }, [allLeads]);

  // Unique lead types for filter dropdown
  const uniqueLeadTypes = useMemo(
    () => Array.from(new Set(allLeads.map((l) => l.leadType).filter(Boolean))).sort(),
    [allLeads]
  );

  // Follow-up leads — show all leads with a followUpAt set (past due + upcoming)
  const followUpLeads = useMemo(() => {
    let fups = allLeads.filter((l: Lead) => l.followUpAt && l.followUpAt > 0);
    // Sort by soonest first
    fups.sort((a, b) => (a.followUpAt ?? 0) - (b.followUpAt ?? 0));
    return fups;
  }, [allLeads]);

  const displayLeads = activeTab === "queue" ? queueLeads : activeTab === "callbacks" ? callbackLeads : activeTab === "followups" ? followUpLeads : [];

  // Clear bulk selection when switching tabs
  useEffect(() => { bulkClearSelection(); }, [activeTab, bulkClearSelection]);

  // Get selected lead recipients for bulk messaging
  const getBulkLeadRecipients = () => {
    return displayLeads
      .filter((l: any) => bulkSelectedIds.has(l.subscriptionId))
      .map((l: any) => ({ phone: l.phone || null, email: l.email || null, name: l.customerName || null }));
  };

  // Handle agent note save
  const handleNoteSave = (subscriptionId: string, note: string) => {
    assignLeadMutation.mutate({
      subscriptionId,
      agentNote: note,
    }, {
      onSuccess: () => {
        toast.success("Note saved");
      },
    });
  };

  // Handle status change
  const handleStatusChange = (subscriptionId: string, newStatus: string) => {
    assignLeadMutation.mutate({
      subscriptionId,
      workStatus: newStatus,
    });
    setStatusDropdownOpen(null);
  };

  // ─── Lead Type Badge ─────────────────────────────────────────────────────────

  const LeadTypeBadge = ({ leadType }: { leadType: string }) => {
    const color = LEAD_TYPE_COLORS[leadType] || "#6b7280";
    // Normalize display: "Live Sub 7 Days", "Live Sub 3 Days", etc. → "Live Sub"
    const displayLabel = /^Live Sub\s*\d/i.test(leadType) ? "Live Sub" : leadType;
    // Use dark text for light backgrounds, white text for dark backgrounds
    const lightBgs = ["#d4edbc", "#bfe1f6", "#ffe5a0", "#e6cff2", "#14c07a"];
    const textColor = lightBgs.includes(color) ? "#1a1a1a" : "#ffffff";
    return (
      <span
        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
        style={{ backgroundColor: color, color: textColor }}
      >
        {displayLabel}
      </span>
    );
  };

    // ─── Status Badge with Dropdown ──────────────────────────────────────────────
  const [customStatusInput, setCustomStatusInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const StatusBadge = ({ lead }: { lead: (typeof allLeads)[0] }) => {
    const badge = getStatusBadge(lead.workStatus);
    const isOpen = statusDropdownOpen === lead.subscriptionId;
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setStatusDropdownOpen(isOpen ? null : lead.subscriptionId);
            setShowCustomInput(false);
            setCustomStatusInput("");
          }}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${badge.bg} ${badge.text}`}
        >
          {badge.label}
          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-[200] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
            {STATUS_OPTIONS.map((status) => {
              const opt = getStatusBadge(status);
              return (
                <button
                  key={status}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(lead.subscriptionId, status);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors text-gray-800 ${lead.workStatus === status ? "bg-gray-100 font-semibold" : ""}`}
                >
                  {opt.label}
                </button>
              );
            })}
            <div className="border-t border-gray-100 mt-1 pt-1">
              {!showCustomInput ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCustomInput(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                >
                  + Custom Status
                </button>
              ) : (
                <div className="px-2 py-1.5 flex gap-1">
                  <input
                    type="text"
                    value={customStatusInput}
                    onChange={(e) => setCustomStatusInput(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customStatusInput.trim()) {
                        handleStatusChange(lead.subscriptionId, customStatusInput.trim().toLowerCase().replace(/\s+/g, "_"));
                        setCustomStatusInput("");
                        setShowCustomInput(false);
                      }
                    }}
                    placeholder="Type status..."
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                    autoFocus
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (customStatusInput.trim()) {
                        handleStatusChange(lead.subscriptionId, customStatusInput.trim().toLowerCase().replace(/\s+/g, "_"));
                        setCustomStatusInput("");
                        setShowCustomInput(false);
                      }
                    }}
                    className="text-xs bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Retention Workspace</h1>
              <span className="px-4 py-1.5 rounded-full bg-orange-500 text-white text-lg font-bold">{agentName}</span>
            </div>
            <MaximusGreeting userName={user?.name?.split(" ")[0] ?? "Commander"} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-800">
          {!user?.team && (
            <>
              <Button onClick={() => csvInputRef.current?.click()} className="bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-2 h-9 px-4 text-sm">
                <Upload size={14} />
                Import CSV
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
              />
            </>
          )}
          <Button onClick={() => setProtocolOpen(true)} className="bg-[#FF6B00] hover:bg-[#E55F00] text-white font-bold flex items-center gap-2 h-9 px-4 text-sm">
            <BookOpen size={14} />
            Usage Protocol
          </Button>
          <span className="font-medium">{queueLeads.length} leads</span>
          <span className="text-gray-400">|</span>
          <span className="font-medium">{callbacksTodayCount} callbacks today</span>
          <span className="text-gray-400">|</span>
          <span className="font-medium text-green-700">{doneDealCount} done deals</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("queue")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "queue"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Inbox className="w-4 h-4" />
          Incoming Lead June
        </button>
        <button
          onClick={() => setActiveTab("clients")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "clients"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Users className="w-4 h-4" />
          My Clients
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
          onClick={() => setActiveTab("followups")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "followups"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          <Calendar className="w-4 h-4" />
          My Follow Ups
          {followUpLeads.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 text-white bg-sky-500">
              {followUpLeads.length}
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
          onClick={() => setActiveTab("performance")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
            activeTab === "performance"
              ? "border-green-600 text-green-700"
              : "border-transparent text-green-600 hover:text-green-800"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          My Performance
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "messages" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WhatsAppChatPanel open={true} onClose={() => setActiveTab("queue")} inline contactIds={agentContactIds} />
        </div>
      )}
      {activeTab === "emails" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WorkspaceEmailPanel contactId={selectedLeadContactId} visible={activeTab === "emails"} />
        </div>
      )}

      {activeTab === "clients" && (
        <MyClientsTab
          agentName={agentName}
          onWhatsApp={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setWaModalOpen(true);
          }}
          onSms={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setSmsModalOpen(true);
          }}
          onEmail={(contactId, name, email) => {
            setEmailLeadContactId(contactId);
            setEmailLeadName(name);
            setEmailLeadEmail(email);
            setEmailTemplateOpen(true);
          }}
          onCallback={(subscriptionId, contactName) => {
            setCallbackModal({ subscriptionId, contactName, type: "callback" });
            setCallbackDateTime("");
          }}
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {activeTab === "decline" && (
        <DeclineTab
          agentName={agentName}
          onWhatsApp={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setWaModalOpen(true);
          }}
          onSms={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setSmsModalOpen(true);
          }}
          onEmail={(contactId, name, email) => {
            setEmailLeadContactId(contactId);
            setEmailLeadName(name);
            setEmailLeadEmail(email);
            setEmailTemplateOpen(true);
          }}
          onCallback={(subscriptionId, contactName) => {
            setCallbackModal({ subscriptionId, contactName, type: "callback" });
            setCallbackDateTime("");
          }}
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {activeTab === "cancel" && (
        <CancelTab
          agentName={agentName}
          onWhatsApp={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setWaModalOpen(true);
          }}
          onSms={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setSmsModalOpen(true);
          }}
          onEmail={(contactId, name, email) => {
            setEmailLeadContactId(contactId);
            setEmailLeadName(name);
            setEmailLeadEmail(email);
            setEmailTemplateOpen(true);
          }}
          onCallback={(subscriptionId, contactName) => {
            setCallbackModal({ subscriptionId, contactName, type: "callback" });
            setCallbackDateTime("");
          }}
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {activeTab === "endInstalment" && (
        <EndInstalmentTab
          agentName={agentName}
          onWhatsApp={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setWaModalOpen(true);
          }}
          onSms={(contactId, phone, name) => {
            setMsgLeadContactId(contactId);
            setMsgLeadPhone(phone);
            setMsgLeadName(name);
            setSmsModalOpen(true);
          }}
          onEmail={(contactId, name, email) => {
            setEmailLeadContactId(contactId);
            setEmailLeadName(name);
            setEmailLeadEmail(email);
            setEmailTemplateOpen(true);
          }}
          onCallback={(subscriptionId, contactName) => {
            setCallbackModal({ subscriptionId, contactName, type: "callback" });
            setCallbackDateTime("");
          }}
          onOpenCard={(contactId, subscriptionId) => {
            window.location.href = `/contacts/${contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(subscriptionId)}`;
          }}
        />
      )}

      {activeTab === "butler" && (
        <PersonalButlerTab />
      )}
      {activeTab === "performance" && (
        <PerformanceTab />
      )}

      {(activeTab === "queue" || activeTab === "callbacks" || activeTab === "followups") && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            {activeTab === "queue" && (
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 font-medium"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
              </select>
            )}
            {activeTab === "callbacks" && (
              <select
                value={callbackDateFilter}
                onChange={(e) => setCallbackDateFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 font-medium"
              >
                <option value="all">All Callbacks</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="this_week">This Week</option>
              </select>
            )}
            <select
              value={leadTypeFilter}
              onChange={(e) => setLeadTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 font-medium"
            >
              <option value="all">All Lead Types</option>
              {uniqueLeadTypes.map((lt) => (
                <option key={lt} value={lt}>{lt}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search name, email or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 font-bold w-[220px] placeholder-gray-800"
            />
            <span className="text-sm text-gray-600 font-medium">{displayLeads.length} leads</span>
          </div>
          {displayLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <MessageSquare className="h-7 w-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">
                {activeTab === "queue" ? "No leads in your queue" : "No upcoming callbacks"}
              </h3>
              <p className="text-sm text-gray-600 max-w-sm">
                {activeTab === "queue"
                  ? "New leads will appear here when assigned to you."
                  : "Scheduled callbacks will appear here."}
              </p>
            </div>
          ) : (
            <div className="">
              {/* Bulk Messaging Action Bar */}
              <BulkMessagingBar
                selectedCount={bulkSelectedCount}
                onWhatsApp={() => setBulkMsgChannel("whatsapp")}
                onSms={() => setBulkMsgChannel("sms")}
                onEmail={() => setBulkMsgChannel("email")}
                onClear={bulkClearSelection}
              />
              {/* Bulk Return to CC (managers only) */}
              {!user?.team && bulkSelectedCount > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm(`Return ${bulkSelectedCount} lead${bulkSelectedCount > 1 ? "s" : ""} to Command Centre?`)) {
                        returnToCCMutation.mutate({ subscriptionIds: Array.from(bulkSelectedIds) });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Return to CC ({bulkSelectedCount})
                  </button>
                </div>
              )}
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={bulkIsAllSelected(displayLeads.map((l: any) => l.subscriptionId))}
                        onChange={() => bulkToggleAll(displayLeads.map((l: any) => l.subscriptionId))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3 w-10">#</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3 max-w-[160px]">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Status</th>
                    {activeTab === "callbacks" && (
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Callback Due</th>
                    )}
                    {activeTab === "followups" && (
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Follow Up Due</th>
                    )}
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Date</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Lead Type</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Customer Note</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Agent Note</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLeads.map((lead: Lead, idx: number) => {
                    const noteKey = lead.subscriptionId;
                    const currentNote = editingNotes[noteKey] ?? lead.agentNote ?? "";
                    const noteChanged = currentNote !== (lead.agentNote ?? "");

                    // Determine callback urgency coloring
                    const cbTime = lead.callbackAt ?? 0;
                    const cbTodayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
                    const cbTodayEnd = new Date(new Date().setHours(23, 59, 59, 999)).getTime();
                    const cbTomorrowEnd = cbTodayEnd + 24 * 60 * 60 * 1000;
                    const cbWeekEnd = cbTodayEnd + 7 * 24 * 60 * 60 * 1000;
                    const isOverdue = activeTab === "callbacks" && cbTime > 0 && cbTime < cbTodayStart;
                    const isToday = activeTab === "callbacks" && cbTime >= cbTodayStart && cbTime <= cbTodayEnd;
                    const isTomorrow = activeTab === "callbacks" && cbTime > cbTodayEnd && cbTime <= cbTomorrowEnd;
                    const isThisWeek = activeTab === "callbacks" && cbTime > cbTomorrowEnd && cbTime <= cbWeekEnd;

                    return (
                      <tr
                        key={lead.subscriptionId}
                        onClick={() => lead.contactId && setSelectedLeadContactId(lead.contactId)}
                        className={`group/row border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                          isOverdue ? "bg-red-50" : isToday ? "bg-green-50" : isTomorrow ? "bg-blue-50" : isThisWeek ? "bg-purple-50" : ""
                        } ${
                          selectedLeadContactId === lead.contactId ? "!bg-blue-100" : ""
                        } ${bulkIsSelected(lead.subscriptionId) ? "ring-2 ring-inset ring-blue-400 !bg-blue-50" : ""}`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={bulkIsSelected(lead.subscriptionId)}
                            onChange={() => bulkToggle(lead.subscriptionId)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        {/* # */}
                        <td className="py-3 px-3 text-sm text-gray-800">{idx + 1}</td>

                        {/* Name */}
                        <td className="py-3 px-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (lead.contactId) {
                                window.location.href = `/contacts/${lead.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                              }
                            }}
                            className="text-sm font-semibold text-blue-600 cursor-pointer hover:underline text-left"
                          >
                            {lead.customerName}
                          </button>
                        </td>

                        {/* Email */}
                        <td className="py-3 px-3 max-w-[160px]">
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-sm text-blue-600 hover:underline truncate block"
                            title={lead.email}
                          >
                            {lead.email}
                          </a>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3">
                          <StatusBadge lead={lead} />
                        </td>

                        {/* Callback Due (only in callbacks tab) */}
                        {activeTab === "callbacks" && (
                          <td className={`py-3 px-3 text-sm whitespace-nowrap font-medium ${
                            isOverdue ? "text-red-700" : isToday ? "text-green-700" : isTomorrow ? "text-blue-700" : isThisWeek ? "text-purple-700" : "text-gray-800"
                          }`}>
                            {lead.callbackAt
                              ? <>
                                  {isOverdue && <span className="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 uppercase">Overdue</span>}
                                  {isToday && <span className="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 uppercase">Today</span>}
                                  {isTomorrow && <span className="inline-block bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 uppercase">Tomorrow</span>}
                                  {isThisWeek && <span className="inline-block bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 uppercase">This Week</span>}
                                  {new Date(lead.callbackAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + new Date(lead.callbackAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                </>
                              : "—"}
                          </td>
                        )}
                        {/* Follow Up Due (only in followups tab) */}
                        {activeTab === "followups" && (
                          <td className="py-3 px-3 text-sm text-gray-800 whitespace-nowrap">
                            {lead.followUpAt
                              ? new Date(lead.followUpAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + new Date(lead.followUpAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
                              : "—"}
                          </td>
                        )}

                        {/* Date */}
                        <td className="py-3 px-3 text-sm text-gray-800">
                          {formatDateDDMMYYYY(lead.currentTermEndsAt || lead.createdAt)}
                        </td>

                        {/* Lead Type */}
                        <td className="py-3 px-3">
                          {editingLeadType === lead.subscriptionId ? (
                            <Select
                              value={lead.leadType ?? ""}
                              onValueChange={(v) => {
                                assignLeadMutation.mutate({
                                  subscriptionId: lead.subscriptionId,
                                  leadType: v,
                                });
                                setEditingLeadType(null);
                                toast.success(`Lead type → ${v}`);
                              }}
                              open
                              onOpenChange={(open) => { if (!open) setEditingLeadType(null); }}
                            >
                              <SelectTrigger className="h-7 text-xs w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LEAD_TYPE_OPTIONS.map((lt) => (
                                  <SelectItem key={lt} value={lt}>{lt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex items-center gap-1">
                              <LeadTypeBadge leadType={lead.leadType} />
                              {user?.role === "admin" && !user?.team && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingLeadType(lead.subscriptionId); }}
                                  className="p-0.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  title="Edit lead type"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Customer Note */}
                        <td className="py-3 px-3 relative group/note">
                          <p
                            className="text-sm text-gray-800 max-w-[200px] truncate cursor-pointer hover:text-blue-600"
                            onClick={() => setExpandedNoteId(expandedNoteId === `cust-${lead.subscriptionId}` ? null : `cust-${lead.subscriptionId}`)}
                          >
                            {lead.managerNote
                              ? lead.managerNote.length > 40
                                ? lead.managerNote.slice(0, 40) + "..."
                                : lead.managerNote
                              : "—"}
                          </p>
                          {/* Tooltip on hover - above the text */}
                          {lead.managerNote && lead.managerNote.length > 40 && (
                            <div className="absolute z-50 left-0 bottom-full mb-1 hidden group-hover/note:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 max-w-[350px] whitespace-pre-wrap shadow-lg">
                              {lead.managerNote}
                            </div>
                          )}
                          {/* Expanded view on click */}
                          {expandedNoteId === `cust-${lead.subscriptionId}` && lead.managerNote && (
                            <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-300 rounded-lg px-3 py-2 max-w-[400px] min-w-[250px] whitespace-pre-wrap shadow-xl text-sm text-gray-800">
                              {lead.managerNote}
                            </div>
                          )}
                        </td>

                        {/* Agent Note */}
                        <td className="py-3 px-3 relative group/anote">
                          <div className="flex items-center gap-1">
                            {expandedNoteId === `agent-${lead.subscriptionId}` ? (
                              <div className="absolute z-50 left-0 top-0 w-[380px] bg-white border border-blue-300 rounded-lg shadow-xl p-3">
                                <textarea
                                  value={currentNote}
                                  onChange={(e) =>
                                    setEditingNotes((prev) => ({ ...prev, [noteKey]: e.target.value }))
                                  }
                                  autoFocus
                                  placeholder="Add note..."
                                  className="text-sm w-full border border-gray-200 rounded px-2 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800 min-h-[100px]"
                                  rows={5}
                                />
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    onClick={() => { handleNoteSave(lead.subscriptionId, currentNote); setExpandedNoteId(null); }}
                                    className="text-xs bg-blue-600 text-white font-medium px-3 py-1.5 rounded hover:bg-blue-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setExpandedNoteId(`agent-${lead.subscriptionId}`)}
                                    className="text-xs bg-black text-white font-medium px-3 py-1.5 rounded hover:bg-gray-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setExpandedNoteId(null)}
                                    className="text-xs bg-black text-white font-medium px-3 py-1.5 rounded hover:bg-gray-900"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <textarea
                                  value={currentNote}
                                  onChange={(e) =>
                                    setEditingNotes((prev) => ({ ...prev, [noteKey]: e.target.value }))
                                  }
                                  onFocus={() => setExpandedNoteId(`agent-${lead.subscriptionId}`)}
                                  placeholder="Add note..."
                                  className="text-sm border border-gray-200 rounded px-2 py-1 w-[160px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
                                  rows={1}
                                />
                                {noteChanged && (
                                  <button
                                    onClick={() => handleNoteSave(lead.subscriptionId, currentNote)}
                                    className="text-xs text-blue-600 font-medium hover:underline shrink-0"
                                  >
                                    Save
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {/* Tooltip on hover for agent note */}
                          {currentNote && currentNote.length > 20 && expandedNoteId !== `agent-${lead.subscriptionId}` && (
                            <div className="absolute z-50 left-0 top-full mt-1 hidden group-hover/anote:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 max-w-[350px] whitespace-pre-wrap shadow-lg">
                              {currentNote}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            {/* Phone */}
                            <a
                              href={lead.phone ? `tel:${lead.phone}` : "#"}
                              onClick={(e) => {
                                if (!lead.phone && lead.contactId) {
                                  e.preventDefault();
                                  window.location.href = `/contacts/${lead.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                                }
                              }}
                              className="p-1.5 rounded hover:bg-green-50 transition-colors text-green-600"
                              title="Call"
                            >
                              <Phone className="h-4 w-4" />
                            </a>

                            {/* WhatsApp */}
                            <button
                              onClick={() => {
                                if (lead.phone) {
                                  if (lead.contactId) {
                                    setMsgLeadContactId(lead.contactId);
                                    setMsgLeadPhone(lead.phone);
                                    setMsgLeadName(lead.customerName || "");
                                    setWaModalOpen(true);
                                  }
                                } else if (lead.contactId) {
                                  window.location.href = `/contacts/${lead.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                                }
                              }}
                              className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                                lead.contactId ? "text-green-600" : "text-black"
                              }`}
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>

                            {/* SMS */}
                            <button
                              onClick={() => {
                                if (lead.phone) {
                                  if (lead.contactId) {
                                    setMsgLeadContactId(lead.contactId);
                                    setMsgLeadPhone(lead.phone);
                                    setMsgLeadName(lead.customerName || "");
                                    setSmsModalOpen(true);
                                  }
                                } else if (lead.contactId) {
                                  window.location.href = `/contacts/${lead.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                                }
                              }}
                              className={`p-1.5 rounded hover:bg-blue-50 transition-colors ${
                                lead.contactId ? "text-blue-600" : "text-black"
                              }`}
                              title="SMS"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>

                            {/* Email */}
                            <button
                              onClick={() => {
                                if (lead.contactId) {
                                  setEmailLeadContactId(lead.contactId);
                                  setEmailLeadName(lead.customerName || "");
                                  setEmailLeadEmail(lead.email || "");
                                  setEmailTemplateOpen(true);
                                }
                              }}
                              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                                lead.email ? "text-gray-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="Email"
                              disabled={!lead.email}
                            >
                              <Mail className="h-4 w-4" />
                            </button>

                            {/* Schedule Callback */}
                            <button
                              onClick={() => {
                                setCallbackModal({ subscriptionId: lead.subscriptionId, contactName: lead.customerName || "", type: "callback" });
                                setCallbackDateTime("");
                              }}
                              className="p-1.5 rounded hover:bg-purple-50 transition-colors text-purple-600"
                              title="Schedule Callback"
                            >
                              <Calendar className="h-4 w-4" />
                            </button>
                            {/* Schedule Follow Up */}
                            <button
                              onClick={() => {
                                setCallbackModal({ subscriptionId: lead.subscriptionId, contactName: lead.customerName || "", type: "follow_up" });
                                setCallbackDateTime("");
                              }}
                              className="p-1.5 rounded hover:bg-sky-50 transition-colors text-sky-600"
                              title="Schedule Follow Up"
                            >
                              <Clock className="h-4 w-4" />
                            </button>

                            {/* Open Card */}
                            <button
                              onClick={() => {
                                if (lead.contactId) {
                                  window.location.href = `/contacts/${lead.contactId}?from=retention&agent=${encodeURIComponent(agentName)}&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                                }
                              }}
                              className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
                              title="Open card"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>

                            {/* Cancel Follow Up (follow ups tab only) */}
                            {activeTab === "followups" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Cancel follow-up for ${lead.customerName || "this lead"}?`)) {
                                    assignLeadMutation.mutate({
                                      subscriptionId: lead.subscriptionId,
                                      followUpAt: null,
                                    });
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-600"
                                title="Cancel Follow Up"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                            {/* Dismiss callback (billing source only) */}
                            {activeTab === "callbacks" && (lead as any).source === "billing" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Dismiss callback for ${lead.customerName || "this client"}?`)) {
                                    clearCallbackMutation.mutate({ subscriptionId: lead.subscriptionId });
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-600"
                                title="Dismiss callback"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}

                            {/* Return to Command Centre (managers only) */}
                            {!user?.team && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Return ${lead.customerName || "this lead"} to Command Centre?`)) {
                                    returnToCCMutation.mutate({ subscriptionIds: [lead.subscriptionId] });
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-orange-50 transition-colors text-orange-600"
                                title="Return to Command Centre"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {/* Email Template Modal */}
      {emailTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Send Email Template</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  To: <span className="font-medium text-gray-700">{emailLeadName}</span>
                  {emailLeadEmail
                    ? <span className="ml-2 text-gray-400">&lt;{emailLeadEmail}&gt;</span>
                    : <span className="ml-2 text-red-500 text-xs">⚠ No email on file</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setComposeFreeEmail(!composeFreeEmail); setSelectedTemplateId(null); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    composeFreeEmail
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {composeFreeEmail ? <><X size={14} /> Cancel</> : <><Send size={14} /> Compose</>}
                </button>
                <button
                  onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); setComposeFreeEmail(false); }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
            </div>
            {/* Body: Template list + Preview */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Template list */}
              <div className="w-80 border-r border-gray-200 overflow-y-auto">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">CHOOSE TEMPLATE</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {emailTemplates?.map((tpl: any) => (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-4 cursor-pointer transition-colors ${
                        selectedTemplateId === tpl.id
                          ? "bg-blue-50 border-l-4 border-l-blue-500"
                          : "hover:bg-gray-50 border-l-4 border-l-transparent"
                      }`}
                    >
                      <p className="font-semibold text-sm text-gray-900">{tpl.name}</p>
                      {tpl.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>}
                      {tpl.subject && <p className="text-xs text-gray-400 mt-1 italic truncate">{tpl.subject}</p>}
                    </div>
                  ))}
                </div>
              </div>
              {/* Right: Preview or Compose */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                {composeFreeEmail ? (
                  <div className="flex flex-col gap-4 h-full">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">To</label>
                      <p className="mt-1 text-sm text-gray-800 bg-gray-100 rounded-lg px-3 py-2">{emailLeadEmail}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Subject</label>
                      <input
                        type="text"
                        value={freeSubject}
                        onChange={(e) => setFreeSubject(e.target.value)}
                        placeholder="Add a subject"
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                    <div className="flex-1 flex flex-col">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Message</label>
                      <textarea
                        value={freeBody}
                        onChange={(e) => setFreeBody(e.target.value)}
                        placeholder="Write your email..."
                        className="mt-1 flex-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                        style={{ minHeight: "300px" }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {!selectedTemplateId && (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                        <Mail size={32} className="opacity-30" />
                        <p className="text-sm">Select a template to preview</p>
                      </div>
                    )}
                    {selectedTemplateId && templateDetailLoading && (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading preview…</div>
                    )}
                    {selectedTemplateId && previewHtml && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                          <p className="text-xs text-gray-500">
                            Subject: <span className="font-medium text-gray-700">
                              {selectedTemplate?.subject
                                ?.replaceAll("${Customers.First Name}", (emailLeadName ?? "").split(" ")[0] || "[Name]")
                                .replaceAll("${agentName}", user?.name ?? "[Agent]")}
                            </span>
                          </p>
                        </div>
                        <iframe
                          srcDoc={previewHtml}
                          className="w-full"
                          style={{ height: "520px", border: "none" }}
                          title="Email Preview"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white">
              <p className="text-xs text-gray-400">
                {composeFreeEmail ? "Email will be sent from trial@lavielabs.com" : "Placeholders (name, agent, email) are filled automatically before sending"}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); setComposeFreeEmail(false); }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                {composeFreeEmail ? (
                  <button
                    onClick={() => {
                      if (!emailLeadContactId || !freeSubject.trim() || !freeBody.trim()) return;
                      sendFreeEmailMutation.mutate({ contactId: emailLeadContactId, subject: freeSubject.trim(), body: freeBody.trim() });
                    }}
                    disabled={!freeSubject.trim() || !freeBody.trim() || sendFreeEmailMutation.isPending || !emailLeadEmail}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendFreeEmailMutation.isPending ? "Sending…" : "Send Email"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (!selectedTemplateId || !emailLeadContactId) return;
                      sendTemplateMutation.mutate({ templateId: selectedTemplateId, contactId: emailLeadContactId });
                    }}
                    disabled={!selectedTemplateId || sendTemplateMutation.isPending || !emailLeadEmail}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendTemplateMutation.isPending ? "Sending…" : "Send Email"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Template Modal */}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWaModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>📱</span> Send WhatsApp Template
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">To: {msgLeadName} ({msgLeadPhone})</p>
              </div>
              <button onClick={() => setWaModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!msgLeadPhone ? (
                <p className="text-sm text-red-600">⚠ No phone number on file</p>
              ) : waTemplatesLoading ? (
                <p className="text-sm text-gray-500">Loading templates…</p>
              ) : !whatsappTemplates || whatsappTemplates.length === 0 ? (
                <p className="text-sm text-gray-500">No WhatsApp templates found in Twilio</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {whatsappTemplates.filter((tpl: any) => {
                    const name = tpl.friendly_name;
                    // Retention team: only show templates starting with ret_
                    if (user?.team === "retention") {
                      return name.startsWith("ret_") || name.startsWith("RET:");
                    }
                    // Others: show rt_/RT: and non-prefixed (hide op_/OP:)
                    const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                    const hasPrefix = allPrefixes.some((p) => name.startsWith(p));
                    return name.startsWith("rt_") || name.startsWith("RT:") || !hasPrefix;
                  }).map((tpl: any) => (
                    <button
                      key={tpl.sid}
                      onClick={() => {
                        if (sendWhatsAppMutation.isPending || !msgLeadContactId) return;
                        sendWhatsAppMutation.mutate({ contactId: msgLeadContactId, contentSid: tpl.sid });
                      }}
                      disabled={sendWhatsAppMutation.isPending}
                      className="p-3 text-left border border-gray-200 rounded-lg hover:border-green-500 transition-colors disabled:opacity-50"
                    >
                      <p className="text-sm font-semibold text-gray-900">{tpl.friendly_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tpl.language || 'en'} • Click to send</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SMS Modal */}
      {smsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSmsModalOpen(false); setSmsBody(""); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>💬</span> Send SMS
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">To: {msgLeadName} ({msgLeadPhone})</p>
              </div>
              <button onClick={() => { setSmsModalOpen(false); setSmsBody(""); }} className="p-2 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* SMS Templates */}
              <div>
                <p className="text-xs font-bold text-blue-600 mb-2">📋 Quick Templates</p>
                {smsTemplatesLoading ? (
                  <p className="text-xs text-gray-500">Loading templates…</p>
                ) : smsTemplates && smsTemplates.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {smsTemplates.filter((tpl: any) => {
                      const name = tpl.friendly_name;
                      // Retention team: only show templates starting with ret_
                      if (user?.team === "retention") {
                        return name.startsWith("ret_") || name.startsWith("RET:");
                      }
                      // Others: show rt_/RT: and non-prefixed (hide op_/OP:)
                      const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                      const hasPrefix = allPrefixes.some((p: string) => name.startsWith(p));
                      return name.startsWith("rt_") || name.startsWith("RT:") || !hasPrefix;
                    }).map((tpl: any) => (
                      <button
                        key={tpl.sid}
                        onClick={() => {
                          if (sendSmsTemplateMutation.isPending || !msgLeadContactId) return;
                          sendSmsTemplateMutation.mutate({ contactId: msgLeadContactId, contentSid: tpl.sid, templateName: tpl.friendly_name });
                        }}
                        disabled={sendSmsTemplateMutation.isPending}
                        className="p-2 text-left border border-gray-200 rounded-lg hover:border-blue-500 transition-colors disabled:opacity-50"
                      >
                        <p className="text-sm font-semibold text-gray-900">{tpl.friendly_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tpl.language || 'en'} • Click to send</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* Custom SMS */}
              <div>
                <p className="text-xs font-bold text-blue-600 mb-2">✏️ Or type a custom message</p>
                <textarea
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  placeholder="Type your SMS message..."
                  maxLength={1600}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-300"
                  style={{ minHeight: "80px" }}
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">{smsBody.length}/1600</span>
                  <button
                    onClick={() => {
                      if (!smsBody.trim() || sendSmsMutation.isPending || !msgLeadContactId) return;
                      sendSmsMutation.mutate({ contactId: msgLeadContactId, body: smsBody.trim() });
                    }}
                    disabled={!smsBody.trim() || sendSmsMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendSmsMutation.isPending ? "Sending…" : "Send SMS"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Schedule Callback Modal */}
      {callbackModal && (() => {
        const TIME_SLOTS = [
          "09:00","09:15","09:30","09:45","10:00","10:15","10:30","10:45",
          "11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45",
          "13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45",
          "15:00","15:15","15:30","15:45","16:00","16:15","16:30","16:45",
          "17:00","17:15","17:30","17:45","18:00","18:15","18:30","18:45",
          "19:00","19:15","19:30","19:45","20:00"
        ];
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        const in2Days = new Date(today); in2Days.setDate(today.getDate() + 2);
        const in2DaysStr = in2Days.toISOString().slice(0, 10);
        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().slice(0, 10);

        const cbParts = callbackDateTime.split("T");
        const selectedDate = cbParts[0] || "";
        const selectedTime = cbParts[1]?.slice(0, 5) || "";
        const isCustomDate = selectedDate && selectedDate !== todayStr && selectedDate !== tomorrowStr && selectedDate !== in2DaysStr && selectedDate !== nextWeekStr;

        const setDatePart = (dateStr: string) => setCallbackDateTime(dateStr + "T" + (selectedTime || ""));
        const setTimePart = (timeStr: string) => setCallbackDateTime((selectedDate || todayStr) + "T" + timeStr);
        const isValid = selectedDate && selectedTime;

        return (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
            onClick={() => setCallbackModal(null)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl p-7 min-w-[380px] max-w-[460px] flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                {callbackModal.type === "follow_up" ? <Clock className="h-5 w-5 text-sky-600" /> : <Calendar className="h-5 w-5 text-indigo-600" />}
                <span className="font-bold text-lg text-gray-800">{callbackModal.type === "follow_up" ? "Schedule Follow Up" : "Schedule Callback"}</span>
              </div>
              <p className="text-sm text-gray-600">
                Scheduling {callbackModal.type === "follow_up" ? "follow up" : "callback"} for <strong>{callbackModal.contactName}</strong>
              </p>

              {/* Date buttons */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Date</label>
                <div className="flex gap-2 flex-wrap">
                  {[{label:"Today",val:todayStr},{label:"Tomorrow",val:tomorrowStr},{label:"In 2 Days",val:in2DaysStr},{label:"Next Week",val:nextWeekStr}].map(b => (
                    <button key={b.val} type="button" onClick={() => setDatePart(b.val)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                        selectedDate === b.val ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}>{b.label}</button>
                  ))}
                  <button type="button" onClick={() => setCallbackDateTime("T" + (selectedTime || ""))}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                      isCustomDate ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}>Custom</button>
                </div>
                {(isCustomDate || (!selectedDate && callbackDateTime.startsWith("T"))) && (
                  <input type="date" value={selectedDate} onChange={(e) => setDatePart(e.target.value)} min={todayStr}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 w-full" />
                )}
              </div>

              {/* Time */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Time</label>
                <select value={selectedTime} onChange={(e) => setTimePart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold w-full">
                  <option value="" disabled>Select time...</option>
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Summary */}
              {isValid && (
                <div className="bg-green-50 border border-green-300 rounded-lg px-3 py-2 text-sm text-green-800 font-semibold text-center">
                  {new Date(callbackDateTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at {selectedTime}
                </div>
              )}

              {/* Optional note */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={callbackNote}
                  onChange={(e) => setCallbackNote(e.target.value)}
                  placeholder="e.g. Asked to call after 3pm, was interested but busy..."
                  rows={2}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full resize-y font-sans"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setCallbackModal(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50">Cancel</button>
                <button
                  onClick={() => {
                    if (!isValid || !callbackModal) return;
                    const dt = new Date(callbackDateTime);
                    const typeLabel = callbackModal.type === "follow_up" ? "Follow up" : "Callback";
                    const noteText = callbackNote
                      ? `${typeLabel} scheduled: ${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${selectedTime} — Note: ${callbackNote}`
                      : `${typeLabel} scheduled: ${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${selectedTime}`;
                    logCallAttemptMutation.mutate({
                      subscriptionId: callbackModal.subscriptionId,
                      agentName: agentName,
                      result: callbackModal.type === "follow_up" ? "follow_up" : "callback",
                      callbackAt: callbackModal.type === "callback" ? dt.getTime() : undefined,
                      followUpAt: callbackModal.type === "follow_up" ? dt.getTime() : undefined,
                      note: noteText,
                    });
                    setCallbackModal(null);
                    setCallbackNote("");
                  }}
                  disabled={!isValid}
                  className={`px-5 py-2 rounded-lg border-none font-bold text-sm text-white ${
                    isValid ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer" : "bg-indigo-300 cursor-not-allowed"
                  }`}>{callbackModal.type === "follow_up" ? "Confirm Follow Up" : "Confirm Callback"}</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Bulk Messaging Template Modal for Leads */}
      <BulkTemplateModal
        open={bulkMsgChannel !== null}
        channel={bulkMsgChannel || "whatsapp"}
        recipients={getBulkLeadRecipients()}
        onClose={() => setBulkMsgChannel(null)}
        onSuccess={bulkClearSelection}
      />

      {/* Usage Protocol Modal */}
      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Retention Workspace — Usage Protocol</DialogTitle></DialogHeader>
          <div className="space-y-6 py-2 text-sm text-gray-800">

            {/* Overview */}
            <div>
              <h3 className="font-bold text-base text-indigo-700 mb-2">What is the Retention Workspace?</h3>
              <p>Your personal command centre for managing retention leads. Every lead assigned to you appears here — you can call, message, email, schedule callbacks, and track your deals all from one place.</p>
            </div>

            {/* Tabs */}
            <div>
              <h3 className="font-bold text-base text-blue-700 mb-2">Navigation Tabs</h3>
              <p className="mb-2">The tabs at the top switch between different views:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Incoming Leads</strong> — Your main queue. All new leads land here.</li>
                <li><strong>My Callbacks</strong> — Leads you scheduled a callback for. Shows date/time due. Overdue ones appear in red.</li>
                <li><strong>My Follow Ups</strong> — Leads you scheduled a follow-up for (less urgent than callbacks).</li>
                <li><strong>Messages</strong> — This is where you read and reply to WhatsApp AND SMS conversations with your customers. If someone replied to you, you'll see an unread badge (a little number) on this tab. Go here to check what customers wrote back to you.</li>
                <li><strong>Emails</strong> — View and send emails to your customers.</li>
                <li><strong>My Clients</strong> — All your active subscriptions with billing details, payment history, and products.</li>
                <li><strong>Decline / Cancel / End Instalment</strong> — Filtered views by lead type for focused work.</li>
                <li><strong>Maximus Aurelius</strong> — Your AI assistant for quick lookups and help.</li>
                <li><strong>My Performance</strong> — Your personal stats: deals closed, revenue, conversion rates.</li>
              </ul>
            </div>

            {/* Leads Table */}
            <div>
              <h3 className="font-bold text-base text-purple-700 mb-2">The Leads Table</h3>
              <p className="mb-2">Each row is one lead. Here's what each column means:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Checkbox</strong> — Tick to select multiple leads for bulk actions.</li>
                <li><strong>Name</strong> — Customer name. Click to open their full contact card.</li>
                <li><strong>Email</strong> — Click to open your email app.</li>
                <li><strong>Status</strong> — Coloured badge showing where this lead is (New, Working, Done Deal, etc). Click to change it.</li>
                <li><strong>Date</strong> — When the lead was created or when their term ends.</li>
                <li><strong>Lead Type</strong> — Category badge (Pre-Cycle-Decline, Cancel Live Sub, Hot Lead, etc).</li>
                <li><strong>Customer Note</strong> — Note from management. Hover to see full text.</li>
                <li><strong>Agent Note</strong> — Your personal notes. Click to edit and save.</li>
                <li><strong>Actions</strong> — Quick buttons: Call, WhatsApp, SMS, Email, Schedule Callback, Open Card.</li>
              </ul>
            </div>

            {/* Filters */}
            <div>
              <h3 className="font-bold text-base text-teal-700 mb-2">Filtering Your Leads</h3>
              <p className="mb-2">Use the filters above the table to narrow down what you see:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Date Filter</strong> (Queue tab) — Show leads from: All Dates, Today, Last 7 Days, This Month, Last Month.</li>
                <li><strong>Callback Date Filter</strong> (Callbacks tab) — Show: All Callbacks, Today, Tomorrow, This Week.</li>
                <li><strong>Lead Type Filter</strong> — Show only specific types (e.g. only "Hot Lead" or only "Pre-Cycle-Decline").</li>
                <li><strong>Search</strong> — Type a name, email, or phone number to find a specific customer instantly.</li>
              </ul>
            </div>

            {/* Bulk Actions */}
            <div>
              <h3 className="font-bold text-base text-orange-700 mb-2">Bulk Actions (Send to Multiple Customers)</h3>
              <p className="mb-2">Want to message several customers at once? Here's how:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tick the checkboxes next to the leads you want (or use the top checkbox to select all).</li>
                <li>A blue bar appears at the bottom showing how many are selected.</li>
                <li>Click <strong>WhatsApp</strong>, <strong>SMS</strong>, or <strong>Email</strong> on that bar.</li>
                <li>Choose a template from the list that appears.</li>
                <li>Confirm — the message is sent to all selected customers at once.</li>
              </ol>
              <p className="mt-2 text-xs text-gray-500">Tip: Use "Clear Selection" on the bar to deselect everyone quickly.</p>
            </div>

            {/* Contact Card */}
            <div>
              <h3 className="font-bold text-base text-rose-700 mb-2">Contact Card (Opening a Lead)</h3>
              <p className="mb-2">Click a customer's name or the arrow icon to open their full card. From here you can:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Edit details</strong> — Change name, phone, email, address. Click Save when done.</li>
                <li><strong>Call</strong> — Start a call directly.</li>
                <li><strong>Schedule Callback</strong> — Pick a date, time, and add a note. The lead moves to your Callbacks tab.</li>
                <li><strong>Mark as Sold</strong> — Marks a successful deal.</li>
                <li><strong>Not Interested / N/A</strong> — Skip or close the lead.</li>
                <li><strong>Send Payment</strong> — Opens the Stripe payment section to take a card payment.</li>
                <li><strong>Send Email</strong> — Opens the email template picker.</li>
                <li><strong>Send WhatsApp</strong> — Opens WhatsApp template picker.</li>
                <li><strong>Send SMS</strong> — Opens SMS composer.</li>
                <li><strong>Free Notes</strong> — Write anything. Remember to click Save Notes!</li>
                <li><strong>Navigate</strong> — Use Previous/Next arrows to move between leads without going back to the table.</li>
              </ul>
            </div>

            {/* Callbacks */}
            <div>
              <h3 className="font-bold text-base text-amber-700 mb-2">Callbacks & Follow-ups</h3>
              <p className="mb-2">How to schedule and manage callbacks:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Click the calendar icon on any lead (or "Callback" in the contact card).</li>
                <li>Choose a date: Today, Tomorrow, In 2 Days, Next Week, or pick a Custom date.</li>
                <li>Choose a time (15-minute intervals).</li>
                <li>Add a note (optional) — e.g. "Customer said call after 3pm".</li>
                <li>Click Confirm. The lead moves to your Callbacks tab automatically.</li>
              </ol>
              <p className="mt-2"><strong>When a callback is due:</strong> You'll get a notification toast. Overdue callbacks appear in red with an "OVERDUE" badge.</p>
              <p className="mt-1"><strong>Actions on callbacks:</strong> Reschedule, Close (mark as done), or Call Now.</p>
            </div>

            {/* WhatsApp & SMS */}
            <div>
              <h3 className="font-bold text-base text-green-700 mb-2">Sending Messages (WhatsApp & SMS)</h3>
              <p className="mb-2">You have two ways to message a customer. Both are inside the Contact Card and also available as quick icons in the leads table:</p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                <h4 className="font-bold text-green-800 mb-1">📱 WhatsApp</h4>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Click the green WhatsApp icon on any lead (or the WhatsApp button inside the Contact Card).</li>
                  <li>You'll see a list of message templates — these are pre-written messages ready to go.</li>
                  <li>Click the template you want to send. That's it! It sends immediately.</li>
                  <li>The button goes grey for a second to stop you accidentally sending twice.</li>
                </ol>
                <div className="mt-2 bg-green-100 rounded p-2">
                  <p className="text-xs font-bold text-green-900">⚠️ THE 24-HOUR RULE (Very Important!):</p>
                  <p className="text-xs text-green-800 mt-1">WhatsApp has a strict rule: You can ONLY send a template message to start a conversation. Once the customer replies, you have a 24-hour window where you can send free-text messages back and forth. After 24 hours of no reply from them, the window closes and you must use a template again.</p>
                  <p className="text-xs text-green-800 mt-1"><strong>In simple words:</strong> Template first → Customer replies → You can chat freely for 24 hours → After 24 hours of silence, use a template again.</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-bold text-blue-800 mb-1">💬 SMS</h4>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Click the SMS icon (speech bubble) on any lead, or the "Send SMS" button inside the Contact Card.</li>
                  <li>You can either pick a template OR write your own message.</li>
                  <li>Type your message and click Send.</li>
                </ol>
                <p className="text-xs text-blue-700 mt-2"><strong>When to use SMS instead of WhatsApp?</strong> If the customer doesn't have WhatsApp, or if you need to send a quick personal message without template restrictions. SMS has no 24-hour rule — you can send anytime.</p>
              </div>

              <p className="mt-3 text-xs text-gray-500">⚠️ If the customer has no phone number on file, you'll see a warning and won't be able to send either WhatsApp or SMS.</p>
            </div>

            {/* Email */}
            <div>
              <h3 className="font-bold text-base text-sky-700 mb-2">Sending Emails</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Click the email icon on any lead.</li>
                <li>A large modal opens with templates on the left and preview on the right.</li>
                <li>Click a template to preview it (customer name is auto-filled).</li>
                <li>Click Send to dispatch it.</li>
                <li><strong>Or</strong> click "Compose" to write a custom email (your own subject + message).</li>
              </ol>
              <p className="mt-2 text-xs text-gray-500">Note: If the customer has no email, the send button is disabled.</p>
            </div>

            {/* Status */}
            <div>
              <h3 className="font-bold text-base text-violet-700 mb-2">Changing Lead Status</h3>
              <p className="mb-2">Click the coloured status badge on any lead to open the dropdown. Options:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>New</strong> — Fresh lead, not yet contacted.</li>
                <li><strong>Working</strong> — You're actively working on this lead.</li>
                <li><strong>Callback</strong> — Scheduled for a future call.</li>
                <li><strong>No Answer</strong> — Called but no answer.</li>
                <li><strong>Done Deal</strong> — Successfully retained/sold!</li>
                <li><strong>Retained Sub</strong> — Subscription saved.</li>
                <li><strong>Closed</strong> — Lead is closed (no deal).</li>
                <li><strong>Not Interested</strong> — Customer declined.</li>
                <li><strong>+ Custom Status</strong> — Type your own status if none of the above fit.</li>
              </ul>
              <p className="mt-2 text-xs text-gray-500">Tip: Some actions auto-update the status (e.g. scheduling a callback sets it to "Callback").</p>
            </div>

            {/* Notes */}
            <div>
              <h3 className="font-bold text-base text-fuchsia-700 mb-2">Notes</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Customer Note</strong> (read-only) — Written by management. Hover over it with your mouse to see the full text.</li>
                <li><strong>Agent Note</strong> (editable) — Your personal notes. Click the note area in the table to edit. Click Save when done.</li>
                <li><strong>Contact Card Notes</strong> — Larger text area in the contact card. Don't forget to click "Save Notes"!</li>
                <li><strong>Auto-notes</strong> — The system automatically adds notes when you schedule callbacks or complete actions.</li>
              </ul>
            </div>

            {/* My Clients */}
            <div>
              <h3 className="font-bold text-base text-cyan-700 mb-2">My Clients Tab</h3>
              <p className="mb-2">Shows all your active subscriptions with full billing details:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Filters</strong> — Date range (Today, Last 7 Days, This Month, Custom), Status (Live, Dunning, Cancelled), Plan Type, Search.</li>
                <li><strong>Columns</strong> — Name, Email, Plan, Setup Fee, Monthly Amount, Total, Billing Cycle progress, Status, Next Billing Date, Actions.</li>
                <li><strong>Expand row</strong> — Click the arrow to see product breakdown and payment progress bar.</li>
                <li><strong>Bulk actions</strong> — Same as leads table: tick multiple, then WhatsApp/SMS/Email.</li>
                <li><strong>Pagination</strong> — 50 clients per page. Use Previous/Next at the bottom.</li>
              </ul>
            </div>

            {/* Manager Features */}
            <div>
              <h3 className="font-bold text-base text-red-700 mb-2">Manager Features</h3>
              <p className="mb-2">These features are only visible to managers (not agents):</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Import CSV</strong> — Purple button in the top right. Upload a CSV file from Zoho CRM with leads. Columns supported: Full Name, Subject (becomes notes), Call Owner (auto-assigned to agent), Email, Phone, Call Start Time (becomes callback date), Mailing fields (address). Leads with a Call Start Time will enter as "Callback" status. If a customer already exists (by email or phone), their status is updated instead of creating duplicates.</li>
                <li><strong>Return to Command Centre</strong> — Orange button (↺ icon) on each lead row. Returns the lead back to Command Centre unassigned, so it can be reassigned to a different agent. Also available as a bulk action when multiple leads are selected.</li>
                <li><strong>Assign Leads</strong> — From Command Centre, managers can assign leads to specific agents. The lead then appears in that agent's Retention Workspace automatically.</li>
              </ul>
            </div>

            {/* Payment */}
            <div>
              <h3 className="font-bold text-base text-pink-700 mb-2">Taking Payment</h3>
              <p className="mb-2">When you close a deal and need to take payment:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open the Contact Card and click "Payment".</li>
                <li>Enter the card details OR send a payment link via email (Google Pay / Apple Pay or Credit Card Only).</li>
                <li>After successful payment, the system shows a success message but does NOT auto-mark as Sold.</li>
                <li><strong>Important:</strong> Add your notes first, then click "Sold" when you're ready to move on.</li>
              </ol>
            </div>

            {/* Tips */}
            <div>
              <h3 className="font-bold text-base text-emerald-700 mb-2">Tips & Tricks</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Start your day</strong> with the Callbacks tab — handle overdue ones first.</li>
                <li><strong>Use bulk messaging</strong> to send a template to all your "No Answer" leads at once.</li>
                <li><strong>Always add a note</strong> after every call — future you will thank you.</li>
                <li><strong>After payment</strong> — don't forget to add notes before clicking Sold!</li>
                <li><strong>Check Messages tab</strong> regularly for customer replies on WhatsApp.</li>
                <li><strong>Use the search bar</strong> to find any customer instantly by name, email, or phone.</li>
                <li><strong>Custom status</strong> — If you need something specific (e.g. "Waiting for husband"), use + Custom Status.</li>
                <li><strong>Performance tab</strong> — Check your stats weekly to see how you're doing.</li>
              </ul>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtocolOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
