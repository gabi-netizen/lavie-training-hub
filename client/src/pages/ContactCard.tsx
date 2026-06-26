/**
 * ContactCard — Full-page CRM customer card
 * Route: /contacts/:id
 * Design: Professional 3-column CRM layout matching approved mockup
 * Layout: Left sidebar (identity + gradient card) | Center (history + docs) | Right sidebar (KPIs + info)
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  User,
  Calendar,
  PhoneCall,
  PhoneMissed,
  Voicemail,
  Clock,
  Tag,
  CheckCircle2,
  PhoneOff,
  ChevronDown,
  MessageSquare,
  Send,
  X,
  Shield,
  Package,
  AlertTriangle,
  Plus,
  CreditCard,
  Archive,
  FileText,
  Activity,
  Lock,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Pencil,
  Check,
  Trash2,
  Calculator,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import DoneDealModal from "@/components/DoneDealModal";

// ─── Colour maps ───────────────────────────────────────────────────────────────
const LEAD_TYPE_COLOURS: Record<string, string> = {
  "Pre Cycle": "bg-amber-100 text-amber-700 border-amber-200",
  "Pre-Cycle-Cancelled": "bg-orange-100 text-orange-700 border-orange-200",
  "Pre-Cycle-Decline": "bg-red-100 text-red-700 border-red-200",
  "Cycle 1": "bg-sky-100 text-sky-700 border-sky-200",
  "Cycle 2": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Cycle 3+": "bg-violet-100 text-violet-700 border-violet-200",
  "Cancel 2+ Cycle": "bg-red-100 text-red-700 border-red-200",
  "Live Sub 3 Days": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Live Sub 7 Days": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Live Sub 14days+": "bg-green-100 text-green-700 border-green-200",
  "Live Sub 2nd+": "bg-green-100 text-green-700 border-green-200",
  "Live Sub Declined 2nd+": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Owned Sub": "bg-teal-100 text-teal-700 border-teal-200",
  "Same day as charge cancel": "bg-rose-100 text-rose-700 border-rose-200",
  "Warm lead": "bg-lime-100 text-lime-700 border-lime-200",
  "Other": "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_COLOURS: Record<string, string> = {
  new: "bg-gray-100 text-gray-800 border-gray-200",
  open: "bg-blue-100 text-blue-700 border-blue-200",
  working: "bg-amber-100 text-amber-700 border-amber-200",
  assigned: "bg-purple-100 text-purple-700 border-purple-200",
  done_deal: "bg-green-100 text-green-700 border-green-200",
  retained_sub: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled_sub: "bg-red-100 text-red-700 border-red-200",
  closed: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  open: "Open",
  working: "Working",
  assigned: "Assigned",
  done_deal: "Done Deal",
  retained_sub: "Retained Sub",
  cancelled_sub: "Cancelled Sub",
  closed: "Closed",
};

const NOTE_OUTCOMES: Record<string, { dot: string; label: string; badge: string }> = {
  connected:  { dot: "bg-blue-600",    label: "Connected",  badge: "bg-blue-50 text-blue-700" },
  sale:       { dot: "bg-green-500",   label: "Sale",       badge: "bg-green-50 text-green-700" },
  follow_up:  { dot: "bg-amber-500",   label: "Follow-up",  badge: "bg-amber-50 text-amber-700" },
  no_answer:  { dot: "bg-red-400",     label: "No Answer",  badge: "bg-red-50 text-red-600" },
  voicemail:  { dot: "bg-indigo-400",  label: "Voicemail",  badge: "bg-indigo-50 text-indigo-600" },
  callback:   { dot: "bg-purple-400",  label: "Callback",   badge: "bg-purple-50 text-purple-600" },
  other:      { dot: "bg-gray-400",    label: "Note",       badge: "bg-gray-100 text-gray-600" },
};

const NOTE_TYPES = [
  { value: "connected",  label: "Connected",  icon: PhoneCall },
  { value: "sale",       label: "Sale",       icon: CheckCircle2 },
  { value: "follow_up",  label: "Follow-up",  icon: Clock },
  { value: "no_answer",  label: "No Answer",  icon: PhoneMissed },
  { value: "voicemail",  label: "Voicemail",  icon: Voicemail },
  { value: "callback",   label: "Callback",   icon: Calendar },
  { value: "other",      label: "Note",       icon: MessageSquare },
];

const ALL_STATUSES = [
  "new", "open", "working", "assigned", "done_deal", "retained_sub", "cancelled_sub", "closed",
] as const;

// ─── Retention Work Status Options (same as RetentionWorkspace) ────────────────
const RETENTION_STATUS_OPTIONS = ["new", "working", "closed", "done_deal", "retained_sub", "callback", "no_answer", "not_interested"] as const;

const RETENTION_STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-green-100", text: "text-green-800", label: "New" },
  assigned: { bg: "bg-amber-100", text: "text-amber-800", label: "Assigned" },
  working: { bg: "bg-amber-100", text: "text-amber-800", label: "Working" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-800", label: "In Progress" },
  done_deal: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Done Deal" },
  retained_sub: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Retained Sub" },
  retained: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Retained" },
  closed: { bg: "bg-red-100", text: "text-red-800", label: "Closed" },
  callback: { bg: "bg-blue-100", text: "text-blue-800", label: "Callback" },
  follow_up: { bg: "bg-blue-100", text: "text-blue-800", label: "Follow Up" },
  no_answer: { bg: "bg-orange-100", text: "text-orange-800", label: "No Answer" },
  not_interested: { bg: "bg-gray-100", text: "text-gray-700", label: "Not Interested" },
};

function getRetentionStatusBadge(status: string) {
  return RETENTION_STATUS_BADGE[status] || { bg: "bg-gray-100", text: "text-gray-700", label: status };
}

// ─── Inline Editable Field Component (matches Workspace styling) ──────────────
function InlineEditableField({
  label,
  value,
  onSave,
  icon,
}: {
  label: string;
  value: string;
  onSave: (newVal: string) => void;
  icon: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditVal(value);
  }, [value]);

  const startEdit = () => {
    setEditVal(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const save = () => {
    onSave(editVal);
    setEditing(false);
  };

  const cancel = () => {
    setEditVal(value);
    setEditing(false);
  };

  return (
    <div className="ws-detail-row">
      <span className="ws-detail-icon">{icon}</span>
      {editing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            onBlur={save}
            className="ws-detail-input"
          />
          <span className="ws-detail-save" onClick={save}>
            <Check size={14} />
          </span>
          <span className="ws-detail-cancel" onClick={cancel}>
            <X size={14} />
          </span>
        </>
      ) : (
        <>
          <span className="ws-detail-text">{value || "—"}</span>
          <span className="ws-detail-edit" onClick={startEdit} title={`Edit ${label}`}>
            <Pencil size={12} />
          </span>
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ContactCard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const contactId = parseInt(id ?? "0", 10);

  // ─── Retention context from query params ────────────────────────────────────
  const searchParams = new URLSearchParams(window.location.search);
  const isFromRetention = searchParams.get("from") === "retention";
  const retentionSubId = searchParams.get("subId") ?? "";


  const { data: contact, refetch, isLoading, isError } = trpc.contacts.get.useQuery(
    { id: contactId },
    { enabled: !!contactId }
  );

  const { data: retentionData } = trpc.contacts.getRetentionData.useQuery(
    { contactId },
    { enabled: !!contactId }
  );

  // AI Retention Notes from call analyses
  const { data: aiNotesData } = trpc.contacts.getRetentionNotes.useQuery(
    { contactId, phone: contact?.phone ?? undefined },
    { enabled: !!contactId }
  );

  // Client subscriptions from My Clients table
  const { data: clientSubs, isLoading: clientSubsLoading } = trpc.clientSubscriptions.getByContactId.useQuery(
    { contactId },
    { enabled: !!contactId }
  );
  const { data: clientSubsByEmail, isLoading: clientSubsByEmailLoading } = trpc.clientSubscriptions.getByEmail.useQuery(
    { email: contact?.email ?? "" },
    { enabled: !!contact?.email && (!clientSubs || clientSubs.length === 0) }
  );
  const contactSubscriptions = (clientSubs && clientSubs.length > 0) ? clientSubs : (clientSubsByEmail ?? []);
  const transactionsLoading = clientSubsLoading || clientSubsByEmailLoading;

  // ─── Computed billing info from local DB subscriptions ─────────────────────
  const billingInfo = useMemo(() => {
    if (!contactSubscriptions || contactSubscriptions.length === 0) return null;
    // Filter out callback_only entries
    const realSubs = contactSubscriptions.filter((s: any) => s.status !== 'callback_only');
    if (realSubs.length === 0) return null;
    // Primary = first live, then first by id desc
    const primary = realSubs.find((s: any) => s.status === 'live') || realSubs[0];
    // LTV Plan = sum of totalAmount (or amount*billingCycles+setupFee)
    let ltvPlan = 0;
    for (const sub of realSubs) {
      const amt = parseFloat(sub.totalAmount || "0");
      if (amt > 0) { ltvPlan += amt; }
      else {
        const cycleAmt = parseFloat(sub.amount || "0");
        const cycles = sub.billingCycles || 1;
        const setup = parseFloat(sub.setupFee || "0");
        ltvPlan += (cycleAmt * cycles) + setup;
      }
    }
    // LTV Paid = for each sub: setupFee + amount * cyclesCompleted (if available), else totalAmount if cancelled
    let ltvPaid = 0;
    for (const sub of realSubs) {
      const setup = parseFloat(sub.setupFee || "0");
      const amt = parseFloat(sub.amount || "0");
      const completed = sub.cyclesCompleted || sub.currentBillingCycle || 0;
      if (completed > 0) {
        ltvPaid += setup + (amt * completed);
      } else if (sub.status === 'cancelled' || sub.status === 'expired') {
        // Fully paid or cancelled — use totalAmount
        ltvPaid += parseFloat(sub.totalAmount || "0") || (setup + amt * (sub.billingCycles || 1));
      }
    }
    return {
      ltvPlan,
      ltvPaid,
      cycle: primary.currentBillingCycle || primary.cyclesCompleted || null,
      monthlyAmount: parseFloat(primary.amount || "0"),
      status: primary.status,
      planName: primary.planName || primary.subscriptionNumber || null,
      nextBillingDate: primary.nextBillingOn,
      cancellationDate: primary.cancelledDate,
      allSubscriptions: realSubs,
    };
  }, [contactSubscriptions]);

  // Stripe card info — now read directly from contact record (synced from Stripe)

  // ─── Adjacent leads for prev/next navigation ─────────────────────────────────
  const agentParam = searchParams.get("agent");
  const agentName = agentParam || "Rob";
  const tabParam = searchParams.get("tab") || "queue";
  const { data: adjacentData } = trpc.manager.getAdjacentLeads.useQuery(
    { agentFilter: agentName, currentContactId: contactId, tab: tabParam as "queue" | "clients" | "decline" | "cancel" | "endInstalment" },
    { enabled: isFromRetention && !!contactId }
  );

  const currentLeadIndex = adjacentData?.currentIndex ?? -1;
  const totalLeads = adjacentData?.total ?? 0;
  const prevLead = currentLeadIndex > 0 ? adjacentData?.leads[currentLeadIndex - 1] : null;
  const nextLead = currentLeadIndex >= 0 && currentLeadIndex < totalLeads - 1 ? adjacentData?.leads[currentLeadIndex + 1] : null;

  const navigateToLead = (lead: { contactId: number | null; subscriptionId: string }, idx: number) => {
    if (lead.contactId) {
      const agentQ = agentParam ? `&agent=${encodeURIComponent(agentParam)}` : "";
      window.location.href = `/contacts/${lead.contactId}?from=retention&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}${agentQ}&tab=${tabParam}`;
    }
  };

  // ─── Retention lead status & note management ────────────────────────────────
  const logCallAttemptMutation = trpc.manager.logCallAttempt.useMutation({
    onSuccess: () => { toast.success("Callback scheduled"); },
    onError: (err: any) => toast.error(err.message || "Failed to schedule callback"),
  });
  const assignLeadMutation = trpc.manager.assignLead.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Find the current lead's subscription ID and data from retention data
  const currentRetentionLead = useMemo(() => {
    if (!retentionData?.leads) return null;
    if (retentionSubId) {
      return retentionData.leads.find((l) => l.subscriptionId === retentionSubId) ?? retentionData.leads[0] ?? null;
    }
    return retentionData.leads[0] ?? null;
  }, [retentionData, retentionSubId]);

  const [retentionStatusDropdownOpen, setRetentionStatusDropdownOpen] = useState(false);
  const [retentionCustomStatusInput, setRetentionCustomStatusInput] = useState("");
  const [showRetentionCustomInput, setShowRetentionCustomInput] = useState(false);
  const [agentNoteValue, setAgentNoteValue] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [doneDealModalOpen, setDoneDealModalOpen] = useState(false);
  const [takePaymentOpen, setTakePaymentOpen] = useState(false);
  const [paymentCardNumber, setPaymentCardNumber] = useState("");
  const [paymentExpiry, setPaymentExpiry] = useState("");
  const [paymentCvv, setPaymentCvv] = useState("");

  // Sync agent note value from data
  useEffect(() => {
    if (currentRetentionLead?.agentNote !== undefined) {
      setAgentNoteValue(currentRetentionLead.agentNote ?? "");
    }
  }, [currentRetentionLead?.agentNote]);

  // Sync manual best time from localStorage when contactId changes
  useEffect(() => {
    if (contactId) {
      const saved = localStorage.getItem(`bestTime_${contactId}`);
      if (saved) {
        setManualBestTime(saved);
        setBestTimeInput(saved);
      } else {
        setManualBestTime("");
        setBestTimeInput("");
      }
    }
  }, [contactId]);

  const handleRetentionStatusChange = (newStatus: string) => {
    if (!currentRetentionLead) return;
    assignLeadMutation.mutate({
      subscriptionId: currentRetentionLead.subscriptionId,
      workStatus: newStatus,
    });
    setRetentionStatusDropdownOpen(false);
    setShowRetentionCustomInput(false);
    setRetentionCustomStatusInput("");
    toast.success(`Lead status → ${getRetentionStatusBadge(newStatus).label}`);
  };

  const handleAgentNoteSave = () => {
    if (!currentRetentionLead) return;
    assignLeadMutation.mutate({
      subscriptionId: currentRetentionLead.subscriptionId,
      agentNote: agentNoteValue,
    });
  };

  const handleQuickAction = (status: string) => {
    if (!currentRetentionLead) return;
    assignLeadMutation.mutate({
      subscriptionId: currentRetentionLead.subscriptionId,
      workStatus: status,
    });
    toast.success(`Lead marked as ${getRetentionStatusBadge(status).label}`);
    // Auto-advance to next lead
    if (autoAdvance && nextLead) {
      setTimeout(() => {
        navigateToLead(nextLead, currentLeadIndex + 1);
      }, 600);
    }
  };

  const updateMutation = trpc.contacts.update.useMutation({
    onSuccess: () => refetch(),
  });

  const addNoteMutation = trpc.contacts.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      setNoteType("connected");
      setShowNoteForm(false);
      refetch();
      toast.success("Note saved");
    },
  });

  const updateNoteMutation = trpc.contacts.updateNote.useMutation({
    onSuccess: () => {
      setEditingNoteId(null);
      setEditingNoteText("");
      refetch();
      toast.success("Note updated");
    },
    onError: () => toast.error("Failed to update note"),
  });

  const deleteNoteMutation = trpc.contacts.deleteNote.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Note deleted");
    },
    onError: () => toast.error("Failed to delete note"),
  });

  const syncToACMutation = trpc.contacts.syncToAC.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success("Synced to ActiveCampaign ✅");
      else toast.error("Sync failed");
    },
    onError: () => toast.error("Sync failed"),
  });

  const sendTestEmailMutation = trpc.contacts.sendTestEmail.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success("Test email sent ✅");
      else toast.error("Email failed to send");
    },
    onError: () => toast.error("Email failed to send"),
  });

  // ─── Email Template Picker ─────────────────────────────────────────────────
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const { data: emailTemplates, isLoading: templatesLoading } = trpc.emailTemplates.list.useQuery(
    undefined,
    { enabled: templatePickerOpen }
  );

  const { data: selectedTemplate, isLoading: templateDetailLoading } = trpc.emailTemplates.getById.useQuery(
    { id: selectedTemplateId! },
    { enabled: selectedTemplateId !== null }
  );

  const previewHtml = useMemo(() => {
    if (!selectedTemplate || !contact) return null;
    return selectedTemplate.htmlBody
      .replaceAll("${Customers.First Name}", (contact.name ?? "").split(" ")[0] || "[Name]")
      .replaceAll("${Customers.Customers Owner}", contact.agentName ?? user?.name ?? "[Agent]")
      .replaceAll("${agentName}", user?.name ?? "[Agent Name]")
      .replaceAll("${agentEmail}", user?.email ?? "[Agent Email]");
  }, [selectedTemplate, contact, user]);

  const sendTemplateMutation = trpc.emailTemplates.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully \u2705");
      setTemplatePickerOpen(false);
      setSelectedTemplateId(null);
    },
    onError: (err) => toast.error(`Failed to send: ${err.message}`),
  });

  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", description: "", htmlBody: "" });
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const createTemplateMutation = trpc.emailTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created!");
      setShowAddTemplate(false);
      setNewTemplate({ name: "", subject: "", description: "", htmlBody: "" });
      utils.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("connected");
  const [statusOpen, setStatusOpen] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  // Email compose state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // WhatsApp compose state
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");

  // SMS compose state
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");

  // Manual Best Time to Contact (localStorage)
  const [manualBestTime, setManualBestTime] = useState("");
  const [bestTimeInput, setBestTimeInput] = useState("");

  // Tab state
  const [centerTopTab, setCenterTopTab] = useState<"history" | "transactions" | "shipments" | "notes">(isFromRetention ? "notes" : "history");
  const [centerBottomTab, setCenterBottomTab] = useState<"documents" | "activities" | "cloudtalk" | "privacy">("documents");
  const [transactionIdx, setTransactionIdx] = useState(0);

  const { data: callHistoryFromDb, isLoading: historyLoading } = trpc.contacts.getCallHistoryFromDb.useQuery(
    { contactId: contact?.id ?? 0 },
    { enabled: !!contact?.id }
  );



  const clickToCallMutation = trpc.contacts.clickToCall.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("📞 CloudTalk is calling you now — pick up to connect to the customer");
      } else {
        toast.error(data.message ?? "Click-to-call failed");
      }
    },
    onError: (err) => toast.error(err.message ?? "Click-to-call failed"),
  });

  const sendEmailMutation = trpc.contacts.sendEmail.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Email sent successfully ✅");
        setEmailOpen(false);
        setEmailSubject("");
        setEmailBody("");
        refetch();
      } else {
        toast.error((data as any).error ?? "Failed to send email");
      }
    },
    onError: (err) => toast.error(err.message ?? "Failed to send email"),
  });

  const sendWhatsAppMutation = (trpc.whatsapp as any).reply.useMutation({
    onSuccess: () => {
      toast.success("WhatsApp sent ✅");
      setWhatsappOpen(false);
      setWhatsappMessage("");
    },
    onError: (err: any) => {
      if (err.message?.includes("63016") || err.message?.includes("outside")) {
        toast.error("24h window expired — send a template first.");
      } else {
        toast.error(`WhatsApp failed: ${err.message}`);
      }
    },
  });

  const sendSmsMutation = (trpc.whatsapp as any).reply.useMutation({
    onSuccess: () => {
      toast.success("SMS sent \u2705");
      setSmsOpen(false);
      setSmsMessage("");
    },
    onError: (err: any) => toast.error(`SMS failed: ${err.message}`),
  });

  // WhatsApp & SMS template modals
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);
  const [callbackModalType, setCallbackModalType] = useState<"callback" | "follow_up">("callback");
  const [callbackDateTime, setCallbackDateTime] = useState("");
  const { data: whatsappTemplates, isLoading: waTemplatesLoading } = trpc.whatsapp.templates.useQuery(
    undefined,
    { enabled: waModalOpen }
  );
  const { data: smsTemplates, isLoading: smsTemplatesLoading } = (trpc.whatsapp as any).smsTemplates.useQuery(
    undefined,
    { enabled: smsModalOpen }
  );
  const sendWaTemplateMutation = trpc.whatsapp.send.useMutation({
    onSuccess: () => {
      toast.success("WhatsApp template sent \u2705");
      setWaModalOpen(false);
    },
    onError: (err) => toast.error(`WhatsApp failed: ${err.message}`),
  });
  const sendSmsTemplateMutation = (trpc.whatsapp as any).sendSmsTemplate.useMutation({
    onSuccess: () => {
      toast.success("SMS template sent \u2705");
      setSmsModalOpen(false);
    },
    onError: (err: any) => toast.error(`SMS template failed: ${err.message}`),
  });
  const sendSmsFreeMutation = (trpc.whatsapp as any).sendSms.useMutation({
    onSuccess: () => {
      toast.success("SMS sent \u2705");
      setSmsModalOpen(false);
      setSmsBody("");
    },
    onError: (err: any) => toast.error(`SMS failed: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-800" style={{ background: "#f0f2f5" }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-800">Loading contact…</p>
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="flex items-center justify-center h-64" style={{ background: "#f0f2f5" }}>
        <div className="text-center">
          <p className="text-gray-700 font-medium mb-2">Contact not found</p>
          <button
            onClick={() => navigate("/contacts")}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Contacts
          </button>
        </div>
      </div>
    );
  }

  const handleStatusChange = (s: string) => {
    updateMutation.mutate({ id: contactId, status: s as any });
    setStatusOpen(false);
    toast.success(`Status → ${STATUS_LABELS[s]}`);
  };

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate({
      contactId,
      agentName: user?.name ?? undefined,
      note: noteText.trim(),
      statusAtTime: noteType,
    });
  };

  const handleCallNow = () => {
    if (!contact.phone && !currentRetentionLead?.phone) {
      toast.error("No phone number on file");
      return;
    }
    clickToCallMutation.mutate({ contactId });
  };

  // ─── Inline edit handlers for email and address ─────────────────────────────
  const handleSaveEmail = (newEmail: string) => {
    updateMutation.mutate({ id: contactId, email: newEmail });
    toast.success("Email updated");
  };

  const handleSaveAddress = (newAddress: string) => {
    updateMutation.mutate({ id: contactId, address: newAddress });
    toast.success("Address updated");
  };

  const handleSavePhone = (newPhone: string) => {
    updateMutation.mutate({ id: contactId, phone: newPhone });
    toast.success("Phone updated");
  };

  // Helper: initials from name
  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  // Helper: pad ID
  const paddedId = String(contact.id ?? contactId).padStart(5, "0");

  // Read timezone preference from workspace (same localStorage key)
  const userTimezone = localStorage.getItem(`tz_${agentName}`) || "Europe/London";

  // Helper: format date nicely (timezone-aware)
  const formatDate = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: userTimezone });
  };

  // Helper: format month/year
  const formatMonthYear = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  // Last contact info
  const lastNote = contact.callNotes.length > 0 ? contact.callNotes[0] : null;

  // Callback time display (timezone-aware)
  const callbackDisplay = contact.callbackAt
    ? new Date(contact.callbackAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: userTimezone })
    : null;

  // ─── Retention data computed values ─────────────────────────────────────────
  const retentionLeads = retentionData?.leads ?? [];
  const retentionTotalSpend = retentionLeads.reduce((sum, l) => sum + (l.totalSpend || 0), 0);
  const retentionMaxCycle = retentionLeads.reduce((max, l) => Math.max(max, l.cyclesCompleted || 0), 0);
  const retentionPlans = Array.from(new Set(retentionLeads.map((l) => l.planName).filter(Boolean))) as string[];
  const retentionLatestLead = retentionLeads.length > 0
    ? retentionLeads.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0]
    : null;

  return (
    <>
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>

      {/* ── Retention Navigation Bar (only when from retention) ── */}
      {isFromRetention && (
        <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center justify-between">
          <button
            onClick={() => navigate(agentParam && agentParam !== "Rob" ? `/retention-workspace/${agentParam.toLowerCase()}` : "/retention-workspace")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Retention
          </button>

          <div className="flex items-center gap-3">
            {/* Previous button */}
            <button
              onClick={() => prevLead && navigateToLead(prevLead, currentLeadIndex - 1)}
              disabled={!prevLead}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${prevLead ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            >
              <ChevronLeft size={14} />
              Prev
            </button>

            {/* Lead counter */}
            <span className="text-sm font-semibold text-slate-800">
              Lead {currentLeadIndex >= 0 ? currentLeadIndex + 1 : "—"} of {totalLeads}
            </span>

            {/* Next button */}
            <button
              onClick={() => nextLead && navigateToLead(nextLead, currentLeadIndex + 1)}
              disabled={!nextLead}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${nextLead ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Quick action buttons */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="rounded border-gray-300"
              />
              Auto-advance
            </label>
            <button
              onClick={() => setDoneDealModalOpen(true)}
              disabled={!currentRetentionLead || assignLeadMutation.isPending}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm"
              style={{ background: "#16a34a" }}
            >
              Mark Done Deal
            </button>
            <button
              onClick={() => handleQuickAction("closed")}
              disabled={!currentRetentionLead || assignLeadMutation.isPending}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm"
              style={{ background: "#dc2626" }}
            >
              Mark Closed
            </button>
          </div>
        </div>
      )}

      {/* ── Breadcrumb Bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          {isFromRetention ? (
            <>
              <button onClick={() => navigate(agentParam && agentParam !== "Rob" ? `/retention-workspace/${agentParam.toLowerCase()}` : "/retention-workspace")} className="hover:text-blue-700 transition-colors text-slate-800 font-medium">
                Retention Workspace
              </button>
              <ChevronRight size={14} className="text-gray-400" />
              <span className="text-gray-800 font-semibold">{contact.name}</span>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/contacts")} className="hover:text-blue-700 transition-colors">
                Customers
              </button>
              <ChevronRight size={14} className="text-gray-400" />
              <span className="text-gray-800 font-semibold">{contact.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Retention lead status dropdown (when from retention) */}
          {isFromRetention && currentRetentionLead && (
            <div className="relative">
              <button
                onClick={() => setRetentionStatusDropdownOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity",
                  getRetentionStatusBadge(currentRetentionLead.workStatus ?? "new").bg,
                  getRetentionStatusBadge(currentRetentionLead.workStatus ?? "new").text
                )}
              >
                {getRetentionStatusBadge(currentRetentionLead.workStatus ?? "new").label}
                <ChevronDown size={10} />
              </button>
              {retentionStatusDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
                  {RETENTION_STATUS_OPTIONS.map((status) => {
                    const opt = getRetentionStatusBadge(status);
                    return (
                      <button
                        key={status}
                        onClick={() => handleRetentionStatusChange(status)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors text-gray-800",
                          currentRetentionLead.workStatus === status && "bg-gray-100 font-semibold"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    {!showRetentionCustomInput ? (
                      <button
                        onClick={() => setShowRetentionCustomInput(true)}
                        className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        + Custom Status
                      </button>
                    ) : (
                      <div className="px-2 py-1.5 flex gap-1">
                        <input
                          type="text"
                          value={retentionCustomStatusInput}
                          onChange={(e) => setRetentionCustomStatusInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && retentionCustomStatusInput.trim()) {
                              handleRetentionStatusChange(retentionCustomStatusInput.trim().toLowerCase().replace(/\s+/g, "_"));
                            }
                          }}
                          placeholder="Type status..."
                          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 text-gray-800"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (retentionCustomStatusInput.trim()) {
                              handleRetentionStatusChange(retentionCustomStatusInput.trim().toLowerCase().replace(/\s+/g, "_"));
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
          )}

          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity",
                STATUS_COLOURS[contact.status] ?? "bg-gray-100 text-gray-800 border-gray-200"
              )}
            >
              {STATUS_LABELS[contact.status] ?? contact.status}
              <ChevronDown size={10} />
            </button>
            {statusOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors",
                      contact.status === s ? "font-semibold text-gray-900" : "text-gray-600"
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {contact.leadType && (
            <span className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
              LEAD_TYPE_COLOURS[contact.leadType] ?? "bg-gray-100 text-gray-800 border-gray-200"
            )}>
              {contact.leadType}
            </span>
          )}
          {/* Quick call from header */}
          {contact.phone && (
            <button
              onClick={handleCallNow}
              disabled={clickToCallMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-60 shadow-sm"
              style={{ background: "#4caf50" }}
            >
              <Phone size={13} />
              {clickToCallMutation.isPending ? "Calling…" : "Call Now"}
            </button>
          )}
        </div>
      </div>

      {/* ── 3-Column Layout ── */}
      <div className="flex gap-5 mx-auto px-5 py-5" style={{ maxWidth: "1400px", alignItems: "flex-start" }}>

        {/* ══════════════════════════════════════════════════
            LEFT SIDEBAR (~300px)
        ══════════════════════════════════════════════════ */}
        <div className="shrink-0 flex flex-col gap-4" style={{ width: "400px" }}>

          {/* ── Contact Identity Card (White) ── */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">

            {/* Avatar + Name + Status */}
            <div className="flex flex-col items-center pt-8 pb-4 px-5">
              <div className="relative mb-3">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ background: "#e8f5e9", color: "#2e7d32" }}
                >
                  {getInitials(contact.name)}
                </div>
                <span
                  className="absolute bottom-1 right-1 w-4 h-4 rounded-full"
                  style={{ background: "#4caf50", borderWidth: "2px", borderStyle: "solid", borderColor: "white" }}
                />
              </div>
              <h2 className="text-gray-800 text-xl font-bold text-center leading-tight">{contact.name}</h2>
              <p className="text-sm mt-1 text-center flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4caf50" }} />
                <span className="text-gray-600 font-medium">
                  {(() => {
                    const statusText = billingInfo?.status === "live"
                      ? `Active \u2014 ${billingInfo.planName || "Live Sub"} Cycle ${billingInfo.cycle || 1}`
                      : billingInfo?.status === "cancelled" ? "Cancelled"
                      : billingInfo?.status === "trial" ? "Trial"
                      : contact.status || "New";
                    return statusText;
                  })()}
                </span>
              </p>
            </div>



            {/* Best Time to Contact Section */}
            <div className="px-5 pb-4">
              {(() => {
                const cbRaw = contact.callbackAt || (currentRetentionLead?.callbackAt ? currentRetentionLead.callbackAt : null);
                if (cbRaw) {
                  const cbDate = new Date(typeof cbRaw === 'number' ? cbRaw : cbRaw);
                  const dateStr = cbDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: userTimezone });
                  const timeStr = cbDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: userTimezone });
                  return (
                    <div className="rounded-xl p-3" style={{ background: "#fff8e1", border: "2px solid #f5a623" }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#e65100" }}>Callback Scheduled</div>
                      <div className="text-gray-800 font-bold" style={{ fontSize: "28px", lineHeight: 1.2 }}>{timeStr}</div>
                      <div className="text-gray-600 font-semibold text-sm mt-1">{dateStr}</div>
                    </div>
                  );
                }
                // Smart Best Time: analyze call history from DB
                const calls = callHistoryFromDb ?? [];
                const answered = calls.filter((c: any) => (c.durationSeconds ?? 0) > 0 && c.callDate);
                const missed = calls.filter((c: any) => (c.durationSeconds ?? 0) === 0 && c.callDate);
                let suggestion = "";
                let suggestionNote = "";
                if (answered.length > 0) {
                  const hours = answered.map((c: any) => new Date(c.callDate).getHours());
                  const hourCounts: Record<number, number> = {};
                  hours.forEach((h: number) => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
                  const bestHour = Object.entries(hourCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
                  if (bestHour) {
                    const hr = Number(bestHour[0]);
                    suggestion = `${String(hr).padStart(2, "0")}:00 - ${String(hr + 1).padStart(2, "0")}:00`;
                    suggestionNote = `Answered ${bestHour[1]}x at this time`;
                  }
                } else if (missed.length > 0) {
                  const missedHours = missed.map((c: any) => new Date(c.callDate).getHours());
                  const avgMissedHour = missedHours.reduce((a: number, b: number) => a + b, 0) / missedHours.length;
                  if (avgMissedHour < 13) {
                    suggestion = "15:00 - 18:00";
                    suggestionNote = `Missed ${missed.length}x in morning \u2014 try afternoon`;
                  } else {
                    suggestion = "09:00 - 12:00";
                    suggestionNote = `Missed ${missed.length}x in afternoon \u2014 try morning`;
                  }
                }
                return (
                  <>
                    <div
                      className="inline-block rounded-full text-[10px] font-bold px-3 py-1 mb-2 uppercase tracking-wider"
                      style={{ background: "#f5a623", color: "#1a3a5c" }}
                    >
                      Best Time to Contact
                    </div>

                    {/* Manual override input */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        type="text"
                        placeholder="e.g. 14:00-16:00"
                        value={bestTimeInput}
                        onChange={(e) => setBestTimeInput(e.target.value)}
                        className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <button
                        onClick={() => {
                          if (bestTimeInput.trim()) {
                            localStorage.setItem(`bestTime_${contactId}`, bestTimeInput.trim());
                            setManualBestTime(bestTimeInput.trim());
                            toast.success("Best time saved");
                          } else {
                            localStorage.removeItem(`bestTime_${contactId}`);
                            setManualBestTime("");
                            toast.success("Best time cleared");
                          }
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition-colors"
                      >
                        Save
                      </button>
                    </div>

                    {/* Manual override display (if set) */}
                    {manualBestTime && (
                      <div className="rounded-lg p-2 mb-2" style={{ background: "#e8f5e9", border: "1px solid #4caf50" }}>
                        <div className="text-black font-bold text-lg">{manualBestTime}</div>
                        <div className="text-[10px] text-black font-semibold mt-0.5">Agent override</div>
                      </div>
                    )}

                    {/* CloudTalk smart suggestion */}
                    {suggestion ? (
                      <div className="rounded-lg p-2" style={{ background: "#f0fdf4", border: "1px solid rgba(34, 197, 94, 0.4)" }}>
                        <div className="text-black font-bold text-lg">{suggestion}</div>
                        <div className="text-[10px] text-black font-semibold mt-0.5">{suggestionNote}</div>
                      </div>
                    ) : !manualBestTime ? (
                      <p className="text-sm font-bold text-black">No call data yet</p>
                    ) : null}
                  </>
                );
              })()}
            </div>

            {/* Customer Details Table */}
            <div className="px-5 pb-4">
              <div className="divide-y divide-gray-100">

                {/* Phone — Click to Call */}
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-black">Phone</span>
                  {contact.phone ? (
                    <button
                      onClick={() => clickToCallMutation.mutate({ contactId })}
                      disabled={clickToCallMutation.isPending}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1 transition"
                      title="Click to call"
                    >
                      <Phone size={12} className="text-blue-500" />
                      {contact.phone}
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-gray-800">\u2014</span>
                  )}
                </div>
                {/* NA button — hangup + mark no_answer + advance to next */}
                {isFromRetention && (
                  <div className="py-2.5">
                    <button
                      onClick={() => {
                        // 1. Hangup via CloudTalk iframe
                        const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="phone.cloudtalk.io"]');
                        if (iframe?.contentWindow) {
                          iframe.contentWindow.postMessage(JSON.stringify({ event: "hangup", properties: {} }), "https://phone.cloudtalk.io");
                        }
                        // 2. Mark as no_answer
                        if (currentRetentionLead) {
                          assignLeadMutation.mutate({ subscriptionId: currentRetentionLead.subscriptionId, workStatus: "no_answer" });
                        }
                        toast("No Answer — moving to next", { icon: "📵" });
                        // 3. Advance to next lead
                        if (nextLead) setTimeout(() => navigateToLead(nextLead, currentLeadIndex + 1), 400);
                      }}
                      className="w-full px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition shadow-sm"
                    >
                      NA / End / Next
                    </button>
                  </div>
                )}
                {/* Lead Status — dropdown for agents */}
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-black">Lead Status</span>
                  <select
                    value={currentRetentionLead?.workStatus || contact.status || "new"}
                    onChange={(e) => {
                      if (currentRetentionLead) {
                        assignLeadMutation.mutate({ subscriptionId: currentRetentionLead.subscriptionId, workStatus: e.target.value });
                        toast.success(`Lead status → ${e.target.value.replace(/_/g, " ")}`);
                      } else {
                        updateMutation.mutate({ id: contactId, status: e.target.value as any });
                        toast.success(`Status → ${e.target.value.replace(/_/g, " ")}`);
                      }
                    }}
                    className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1 text-gray-800 bg-white hover:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="new">New</option>
                    <option value="working">Working</option>
                    <option value="callback">Callback</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="no_answer">No Answer</option>
                    <option value="done_deal">Done Deal</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                {/* Quick Actions Strip */}
                <div className="py-3">
                  <div className="grid grid-cols-5 gap-2">
                    <button
                      onClick={() => {
                        if (!contact.phone && !currentRetentionLead?.phone) { toast.error("No phone number on file"); return; }
                        setWaModalOpen(true);
                      }}
                      disabled={!contact.phone && !currentRetentionLead?.phone}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      </svg>
                      <span className="text-[10px] font-bold text-white">WhatsApp</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!contact.email) { toast.error("No email address on file"); return; }
                        setEmailOpen((v) => !v);
                      }}
                      disabled={!contact.email}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed border-2 border-amber-500"
                    >
                      <Mail size={18} className="text-white" />
                      <span className="text-[10px] font-bold text-white">Email</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!contact.phone && !currentRetentionLead?.phone) { toast.error("No phone number on file"); return; }
                        setSmsModalOpen(true);
                      }}
                      disabled={!contact.phone && !currentRetentionLead?.phone}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MessageSquare size={18} className="text-white" />
                      <span className="text-[10px] font-bold text-white">SMS</span>
                    </button>
                    <button
                      onClick={() => { setCallbackModalType("callback"); setCallbackModalOpen(true); setCallbackDateTime(""); }}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition"
                    >
                      <Calendar size={18} className="text-white" />
                      <span className="text-[10px] font-bold text-white">Callback</span>
                    </button>
                    <button
                      onClick={() => { setCallbackModalType("follow_up"); setCallbackModalOpen(true); setCallbackDateTime(""); }}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white transition"
                    >
                      <Clock size={18} className="text-white" />
                      <span className="text-[10px] font-bold text-white">Follow Up</span>
                    </button>
                  </div>
                </div>
                {/* Lead Navigation (Prev/Next) — inline after Quick Actions */}
                {isFromRetention && totalLeads > 0 && (
                  <div className="flex items-center justify-between py-3 mt-1 border-t border-gray-100">
                    <button
                      onClick={() => prevLead && navigateToLead(prevLead, currentLeadIndex - 1)}
                      disabled={!prevLead}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${prevLead ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                    >
                      <ChevronLeft size={16} />
                      Prev
                    </button>
                    <span className="text-sm font-bold text-slate-800">
                      Lead {currentLeadIndex >= 0 ? currentLeadIndex + 1 : "\u2014"} of {totalLeads}
                    </span>
                    <button
                      onClick={() => nextLead && navigateToLead(nextLead, currentLeadIndex + 1)}
                      disabled={!nextLead}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${nextLead ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
                {/* Done Deal + Take Payment buttons */}
                {isFromRetention && (
                  <div className="flex gap-2 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setDoneDealModalOpen(true)}
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition shadow-sm"
                    >
                      Done Deal
                    </button>
                    <button
                      onClick={() => setTakePaymentOpen(true)}
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 transition shadow-sm"
                    >
                      Take Payment
                    </button>
                  </div>
                )}
                {/* Card (Stripe) */}
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-black">Card</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {(() => {
                      if (!contact.cardLast4) return "\u2014";
                      const brand = contact.cardBrand ? contact.cardBrand.charAt(0).toUpperCase() + contact.cardBrand.slice(1) : "Card";
                      return `${brand} \u2022\u2022\u2022\u2022${contact.cardLast4} (${String(contact.cardExpMonth ?? 0).padStart(2, "0")}/${String(contact.cardExpYear ?? 0).slice(-2)})`;
                    })()}
                  </span>
                </div>
                {/* Assigned */}
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-black">Assigned</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {currentRetentionLead?.createdAt
                      ? new Date(currentRetentionLead.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "\u2014"}
                  </span>
                </div>
              </div>
            </div>

            {/* Last contact */}
            <div className="px-5 pb-5 flex items-center gap-1.5 text-xs text-gray-600 border-t border-gray-100 pt-3">
              <Clock size={14} className="text-gray-400" />
              {lastNote ? (
                <>
                  Last contact: {formatDate(lastNote.createdAt)}
                  {lastNote.agentName && (
                    <>
                      {" "}&bull;{" "}
                      <span className="font-medium text-gray-800">{lastNote.agentName}</span>
                    </>
                  )}
                </>
              ) : (
                "No previous contact"
              )}
            </div>
          </div>

          {/* WhatsApp Template Modal */}
          {waModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWaModalOpen(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <span>📱</span> Send WhatsApp Template
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">To: {contact.name} ({contact.phone || currentRetentionLead?.phone})</p>
                  </div>
                  <button onClick={() => setWaModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                    <X size={16} className="text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {!contact.phone && !currentRetentionLead?.phone ? (
                    <p className="text-sm text-red-600">⚠ No phone number on file</p>
                  ) : waTemplatesLoading ? (
                    <p className="text-sm text-gray-500">Loading templates…</p>
                  ) : !whatsappTemplates || whatsappTemplates.length === 0 ? (
                    <p className="text-sm text-gray-500">No WhatsApp templates found</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {whatsappTemplates.filter((tpl: any) => {
                        const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                        const hasPrefix = allPrefixes.some((p) => tpl.friendly_name.startsWith(p));
                        return tpl.friendly_name.startsWith("rt_") || tpl.friendly_name.startsWith("RT:") || !hasPrefix;
                      }).map((tpl: any) => (
                        <button
                          key={tpl.sid}
                          onClick={() => {
                            if (sendWaTemplateMutation.isPending) return;
                            sendWaTemplateMutation.mutate({ contactId: contact.id, contentSid: tpl.sid });
                          }}
                          disabled={sendWaTemplateMutation.isPending}
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

          {/* SMS Template + Free Text Modal */}
          {smsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSmsModalOpen(false); setSmsBody(""); }}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <span>💬</span> Send SMS
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">To: {contact.name} ({contact.phone || currentRetentionLead?.phone})</p>
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
                          const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                          const hasPrefix = allPrefixes.some((p: string) => tpl.friendly_name.startsWith(p));
                          return tpl.friendly_name.startsWith("rt_") || tpl.friendly_name.startsWith("RT:") || !hasPrefix;
                        }).map((tpl: any) => (
                          <button
                            key={tpl.sid}
                            onClick={() => {
                              if (sendSmsTemplateMutation.isPending) return;
                              sendSmsTemplateMutation.mutate({ contactId: contact.id, contentSid: tpl.sid, templateName: tpl.friendly_name });
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
                          if (!smsBody.trim() || sendSmsFreeMutation.isPending) return;
                          sendSmsFreeMutation.mutate({ contactId: contact.id, body: smsBody.trim() });
                        }}
                        disabled={!smsBody.trim() || sendSmsFreeMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendSmsFreeMutation.isPending ? "Sending…" : "Send SMS"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── White Info Card (with inline editing when from retention) ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {/* Phone */}
            <div className="mb-4">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Phone</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <InlineEditableField
                    label="Phone"
                    value={contact.phone ?? ""}
                    onSave={handleSavePhone}
                    icon={<Phone size={14} />}
                  />
                </div>
                {contact.phone && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(contact.phone || ""); toast.success("Phone copied"); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                    title="Copy phone"
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
            </div>
            {/* Email */}
            {(contact.email || isFromRetention) && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Email</p>
                {isFromRetention ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <InlineEditableField
                        label="Email"
                        value={contact.email ?? ""}
                        onSave={handleSaveEmail}
                        icon={<Mail size={14} />}
                      />
                    </div>
                    {contact.email && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(contact.email || ""); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                        title="Copy email"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-700">{contact.email}</p>
                    {contact.email && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(contact.email || ""); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                        title="Copy email"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Address */}
            {(contact.address || isFromRetention) && (
              <div className="mb-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Shipping Address</p>
                {isFromRetention ? (
                  <div className="flex items-start gap-1">
                    <div className="flex-1">
                      <InlineEditableField
                        label="Address"
                        value={contact.address ?? ""}
                        onSave={handleSaveAddress}
                        icon={<Package size={14} />}
                      />
                    </div>
                    {contact.address && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(contact.address || ""); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors shrink-0"
                        title="Copy address"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-1">
                    <p className="text-sm text-gray-700 leading-relaxed flex-1" style={{ wordBreak: 'break-word' }}>{contact.address}</p>
                    {contact.address && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(contact.address || ""); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors shrink-0"
                        title="Copy address"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Opening Data — info gathered by opening agent */}
            <div className={cn("pt-3 border-t border-gray-100", !contact.address && !contact.email && !isFromRetention && "pt-0 border-t-0")}>
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">Opening Info</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Age</span>
                  <span className="text-xs font-medium text-gray-700">{contact.skinType || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Current Brand</span>
                  <span className="text-xs font-medium text-gray-700">{contact.concern || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Products Used</span>
                  <span className="text-xs font-medium text-gray-700">{contact.routine || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Trial Kit</span>
                  <span className="text-xs font-medium text-gray-700">{contact.trialKit || "—"}</span>
                </div>
              </div>
            </div>

            {/* Opening Agent Notes */}
            {(contact as any).callNotes?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">Opening Agent Notes</p>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-gray-700 leading-relaxed">
                  {(contact as any).callNotes[0]?.note || ""}
                </div>
              </div>
            )}

            {/* Imported Notes (reason for cancellation) */}
            {contact.importedNotes && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">Customer Note</p>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-gray-700 leading-relaxed">
                  {contact.importedNotes}
                </div>
              </div>
            )}

            {/* AI Coach Recording */}
            {(contact as any).latestCallAnalysis && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">AI Coach Recording</p>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">
                      Score: {(contact as any).latestCallAnalysis.overallScore}/100
                    </span>
                    <a
                      href={`/ai-coach?analysisId=${(contact as any).latestCallAnalysis.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View Full Analysis
                    </a>
                  </div>
                  {(contact as any).latestCallAnalysis.audioFileUrl && (
                    <audio
                      controls
                      className="w-full h-8"
                      src={(contact as any).latestCallAnalysis.audioFileUrl}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Source & Agent */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
              {contact.source && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Source</span>
                  <span className="text-xs font-medium text-gray-700">{contact.source}</span>
                </div>
              )}
              {contact.agentName && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Opening Agent</span>
                  <span className="text-xs font-medium text-gray-700">{contact.agentName}</span>
                </div>
              )}
              {contact.leadDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Lead Date</span>
                  <span className="text-xs font-medium text-gray-700">{formatDate(contact.leadDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Agent Note (Retention) ── */}
          {isFromRetention && currentRetentionLead && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">Agent Note</p>
              <textarea
                value={agentNoteValue}
                onChange={(e) => setAgentNoteValue(e.target.value)}
                onBlur={handleAgentNoteSave}
                placeholder="Add your notes about this lead..."
                className="w-full min-h-[80px] text-sm text-gray-800 border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 placeholder:text-gray-500"
              />
              {assignLeadMutation.isPending && (
                <p className="text-[10px] text-blue-500 mt-1">Saving...</p>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════
            CENTER — Main content (flexible)
        ══════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">

          {/* ── Top Card: History / Transactions / Shipments / Notes ── */}
          <div className="rounded-2xl shadow-sm overflow-hidden bg-white border border-gray-100">

            {/* Tab row */}
            <div className="flex items-center border-b border-gray-200 px-4 bg-white">
              <button
                onClick={() => setCenterTopTab("history")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerTopTab === "history"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                <Clock size={16} />
                Timeline
              </button>
              <button
                onClick={() => setCenterTopTab("transactions")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerTopTab === "transactions"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                <CreditCard size={16} />
                Transactions
              </button>
              <button
                onClick={() => setCenterTopTab("shipments")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerTopTab === "shipments"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                <Archive size={16} />
                Shipments
              </button>
              <button
                onClick={() => setCenterTopTab("notes")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerTopTab === "notes"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                <FileText size={16} />
                Notes
              </button>
              <a
                href="https://docs.google.com/spreadsheets/d/1vXf8mwQibQLFmB9KaIHawTaeLZyu-61LErOiL8HelXY/edit?gid=0#gid=0"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 border-transparent text-green-700 hover:text-green-900 transition-colors whitespace-nowrap"
              >
                <Calculator size={16} />
                Calculator
              </a>
              <div className="ml-auto">
                <button
                  onClick={() => setShowNoteForm((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-lg my-2 transition-colors"
                  style={{ background: "#1565c0" }}
                >
                  <Plus size={14} />
                  Add Entry
                </button>
              </div>
            </div>

            {/* Note form (shown when Add Entry clicked) */}
            {showNoteForm && (
              <div className="p-5 border-b border-gray-200 bg-blue-50/50">
                <p className="text-xs font-semibold text-gray-600 mb-2">Log a new entry</p>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="What happened? Key objections, outcome, next steps…"
                  className="min-h-[88px] text-sm resize-none border-gray-200 text-gray-800 placeholder:text-gray-500 bg-white focus-visible:ring-blue-400"
                />
                <div className="flex items-center gap-3 mt-3">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-44 text-sm border-gray-200 text-gray-700 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {NOTE_TYPES.map(({ value, label, icon: Icon }) => (
                        <SelectItem key={value} value={value} className="text-gray-700">
                          <span className="flex items-center gap-2">
                            <Icon size={12} />
                            {label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSaveNote}
                    disabled={!noteText.trim() || addNoteMutation.isPending}
                    size="sm"
                    className="text-white font-semibold px-5"
                    style={{ background: "#1565c0" }}
                  >
                    {addNoteMutation.isPending ? "Saving…" : "Save Note"}
                  </Button>
                  <button
                    onClick={() => setShowNoteForm(false)}
                    className="text-xs text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="p-6">
              {/* Timeline tab */}
              {centerTopTab === "history" && (
                <div className="flex flex-col">
                  {contact.callNotes.length === 0 && retentionLeads.length === 0 && !contact.importedNotes && (!callHistoryFromDb || callHistoryFromDb.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <PhoneOff size={36} className="mb-3 opacity-50" />
                      <p className="text-sm font-medium">No call notes yet</p>
                      <p className="text-xs mt-1">Click "+ Add Entry" to log your first call</p>
                    </div>
                  ) : (
                    <>
                    {contact.callNotes.map((note, idx) => {
                      const outcome = NOTE_OUTCOMES[note.statusAtTime ?? "other"] ?? NOTE_OUTCOMES.other;
                      const agentInitials = note.agentName
                        ? note.agentName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                        : "??";
                      const isLast = idx === contact.callNotes.length - 1 && retentionLeads.length === 0;
                      return (
                        <div key={note.id} className="flex gap-3">
                          {/* Timeline dot + line */}
                          <div className="flex flex-col items-center" style={{ width: "20px" }}>
                            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1.5", outcome.dot)} />
                            {!isLast && (
                              <div className="w-0.5 bg-gray-200 mt-1 flex-1" style={{ minHeight: "24px" }} />
                            )}
                          </div>
                          {/* Entry content */}
                          <div className={cn("flex-1", !isLast && "pb-6")}>
                            <div className="flex items-start gap-3">
                              {/* Agent avatar */}
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow"
                                style={{
                                  background: note.statusAtTime === "sale" ? "#4caf50"
                                    : note.statusAtTime === "no_answer" ? "#ef5350"
                                    : note.statusAtTime === "follow_up" ? "#f5a623"
                                    : note.statusAtTime === "callback" ? "#9c27b0"
                                    : "#1565c0"
                                }}
                              >
                                {agentInitials}
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* Title = first line of note */}
                                <p className="text-sm font-semibold text-gray-800 leading-snug">
                                  {note.note.split("\n")[0].length > 80
                                    ? note.note.split("\n")[0].slice(0, 80) + "…"
                                    : note.note.split("\n")[0]}
                                </p>
                                {/* Meta row */}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="w-1.5 h-1.5 rounded-full inline-block bg-gray-400" />
                                  <span className="text-xs text-gray-700">{formatDate(note.createdAt)}</span>
                                  {note.agentName && (
                                    <>
                                      <span className="text-gray-300 text-xs">&bull;</span>
                                      <span className="text-xs">
                                        by <span className="font-medium text-blue-600">{note.agentName}</span>
                                      </span>
                                    </>
                                  )}
                                  <span className={cn(
                                    "text-[11px] font-semibold px-2.5 py-0.5 rounded-full",
                                    outcome.badge
                                  )}>
                                    {outcome.label}
                                  </span>
                                </div>
                                {/* Full note text - editable (only for manually created notes, not external/auto notes) */}
                                {(() => {
                                  const isExternalNote = note.note.startsWith("🤖") || note.note.startsWith("📧");
                                  return editingNoteId === note.id ? (
                                  <div className="mt-2">
                                    <textarea
                                      value={editingNoteText}
                                      onChange={(e) => setEditingNoteText(e.target.value)}
                                      className="w-full text-xs text-gray-800 border border-blue-300 rounded p-2 resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setEditingNoteId(null);
                                          setEditingNoteText("");
                                        }
                                      }}
                                    />
                                    <div className="flex gap-2 mt-1">
                                      <button
                                        onClick={() => updateNoteMutation.mutate({ noteId: note.id, note: editingNoteText })}
                                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }}
                                        className="text-xs text-black px-3 py-1 rounded hover:bg-gray-100"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => { if (confirm("Delete this note?")) { deleteNoteMutation.mutate({ noteId: note.id }); setEditingNoteId(null); setEditingNoteText(""); } }}
                                        className="text-xs text-red-600 px-3 py-1 rounded hover:bg-red-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="group/note flex items-start gap-1 mt-2">
                                    <p className="text-xs text-gray-800 leading-relaxed flex-1">{note.note}</p>
                                    {!isExternalNote && (
                                      <>
                                        <button
                                          onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.note); }}
                                          className="text-black hover:text-blue-600 shrink-0 mt-0.5"
                                          title="Edit note"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                        <button
                                          onClick={() => { if (confirm("Delete this note?")) deleteNoteMutation.mutate({ noteId: note.id }); }}
                                          className="text-black hover:text-red-600 shrink-0 mt-0.5"
                                          title="Delete note"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Call Attempts & Short Calls from DB */}
                    {callHistoryFromDb && callHistoryFromDb.length > 0 && (() => {
                      const attempts = callHistoryFromDb.filter((c: any) => (c.durationSeconds ?? 0) < 60);
                      const shortCalls = callHistoryFromDb.filter((c: any) => (c.durationSeconds ?? 0) >= 60 && (c.durationSeconds ?? 0) < 300);
                      if (attempts.length === 0 && shortCalls.length === 0) return null;
                      return (
                        <>
                          {(contact.callNotes.length > 0) && (
                            <div className="border-t border-gray-200 my-4 pt-4" />
                          )}
                          {attempts.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="text-red-400">{"\u2022"}</span> Call Attempts ({attempts.length})
                              </p>
                              <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                                <div className="grid grid-cols-[1fr_70px_100px] px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Date & Time</span>
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Duration</span>
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Agent</span>
                                </div>
                                {attempts.map((call: any) => (
                                  <div key={`tl-attempt-${call.id}`} className="grid grid-cols-[1fr_70px_100px] px-3 py-1.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-100">
                                    <span className="text-xs text-gray-800 font-medium">{call.callDate ? new Date(call.callDate).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                                    <span className="text-xs text-gray-800">{Math.round(call.durationSeconds ?? 0)}s</span>
                                    <span className="text-xs text-gray-800">{call.repName || "\u2014"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {shortCalls.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="text-amber-500">{"\u2022"}</span> Short Calls ({shortCalls.length})
                              </p>
                              <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
                                <div className="grid grid-cols-[1fr_70px_100px] px-3 py-1.5 bg-amber-100/50 border-b border-amber-200">
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Date & Time</span>
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Duration</span>
                                  <span className="text-[10px] font-bold text-gray-700 uppercase">Agent</span>
                                </div>
                                {shortCalls.map((call: any) => (
                                  <div key={`tl-short-${call.id}`} className="grid grid-cols-[1fr_70px_100px] px-3 py-1.5 border-b border-amber-100 last:border-b-0 hover:bg-amber-50">
                                    <span className="text-xs text-gray-800 font-medium">{call.callDate ? new Date(call.callDate).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                                    <span className="text-xs text-gray-800">{Math.floor((call.durationSeconds ?? 0) / 60)}m {Math.round((call.durationSeconds ?? 0) % 60)}s</span>
                                    <span className="text-xs text-gray-800">{call.repName || "\u2014"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Imported Notes from Zoho */}
                    {contact.importedNotes && (
                      <>
                        {(contact.callNotes.length > 0 || retentionLeads.length > 0) && (
                          <div className="border-t border-gray-200 my-4 pt-4">
                            <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-3">Zoho History</p>
                          </div>
                        )}
                        {contact.importedNotes.split('---').filter((n: string) => n.trim()).map((note: string, idx: number) => {
                          const trimmed = note.trim();
                          const isLast = idx === contact.importedNotes!.split('---').filter((n: string) => n.trim()).length - 1 && retentionLeads.length === 0;
                          return (
                            <div key={`imported-${idx}`} className="flex gap-3">
                              <div className="flex flex-col items-center" style={{ width: "20px" }}>
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 bg-purple-400" />
                                {!isLast && (
                                  <div className="w-0.5 bg-gray-200 mt-1 flex-1" style={{ minHeight: "24px" }} />
                                )}
                              </div>
                              <div className={`flex-1 ${!isLast ? 'pb-4' : ''}`}>
                                <p className="text-xs text-gray-800 leading-relaxed">{trimmed}</p>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {/* Retention lead entries */}
                    {retentionLeads.length > 0 && (
                      <>
                        {contact.callNotes.length > 0 && (
                          <div className="border-t border-gray-200 my-4 pt-4">
                            <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-3">Retention Leads</p>
                          </div>
                        )}
                        {retentionLeads.map((lead, idx) => {
                          const isLast = idx === retentionLeads.length - 1;
                          const agentInitials = lead.assignedAgent
                            ? lead.assignedAgent.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                            : "RT";
                          return (
                            <div key={`retention-${lead.id}`} className="flex gap-3">
                              <div className="flex flex-col items-center" style={{ width: "20px" }}>
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 bg-orange-400" />
                                {!isLast && (
                                  <div className="w-0.5 bg-gray-200 mt-1 flex-1" style={{ minHeight: "24px" }} />
                                )}
                              </div>
                              <div className={cn("flex-1", !isLast && "pb-6")}>
                                <div className="flex items-start gap-3">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow"
                                    style={{ background: "#e65100" }}
                                  >
                                    {agentInitials}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 leading-snug">
                                      {lead.leadType || "Retention Lead"}
                                      {lead.planName && ` — ${lead.planName}`}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="w-1.5 h-1.5 rounded-full inline-block bg-orange-400" />
                                      <span className="text-xs text-gray-500">{lead.createdAt ? formatDate(lead.createdAt) : "—"}</span>
                                      {lead.assignedAgent && (
                                        <>
                                          <span className="text-gray-300 text-xs">&bull;</span>
                                          <span className="text-xs">
                                            by <span className="font-medium text-orange-600">{lead.assignedAgent}</span>
                                          </span>
                                        </>
                                      )}
                                      {lead.workStatus && (
                                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700">
                                          {lead.workStatus.replace(/_/g, " ")}
                                        </span>
                                      )}
                                    </div>
                                    {lead.managerNote && (
                                      <p className="text-xs text-gray-600 mt-2 leading-relaxed italic">
                                        Customer: "{lead.managerNote.length > 200 ? lead.managerNote.slice(0, 200) + "…" : lead.managerNote}"
                                      </p>
                                    )}
                                    {lead.agentNote && (
                                      <p className="text-xs text-gray-800 mt-1 leading-relaxed">
                                        Agent note: {lead.agentNote}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-600">
                                      {lead.totalSpend > 0 && <span>£{lead.totalSpend.toFixed(2)} spent</span>}
                                      {lead.cyclesCompleted > 0 && <span>Cycle {lead.cyclesCompleted}</span>}
                                      {lead.billingStatus && <span>{lead.billingStatus}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                    </>
                  )}
                </div>
              )}

              {/* Transactions tab */}
              {centerTopTab === "transactions" && (
                <div>
                  {transactionsLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <div className="w-7 h-7 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
                      <p className="text-sm text-gray-700">Loading transactions…</p>
                    </div>
                  ) : !contactSubscriptions || contactSubscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <CreditCard size={36} className="mb-3 opacity-40" />
                      <p className="text-sm font-medium text-gray-800">No transactions yet</p>
                      <p className="text-xs mt-1 text-gray-600">Subscription data will appear here once synced from Zoho Billing</p>
                    </div>
                  ) : ((() => {
                    const currentTx = contactSubscriptions[transactionIdx] || contactSubscriptions[0];
                    if (!currentTx) return null;
                    const txStatus = (currentTx.status ?? "").toLowerCase();
                    const txStatusBadge = txStatus === "live" ? "bg-green-100 text-green-800 border-green-200" :
                      txStatus === "future" ? "bg-blue-100 text-blue-800 border-blue-200" :
                      txStatus === "cancelled" ? "bg-red-100 text-red-800 border-red-200" :
                      txStatus === "dunning" ? "bg-orange-100 text-orange-800 border-orange-200" :
                      txStatus === "unpaid" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                      "bg-gray-100 text-gray-800 border-gray-200";
                    const txCycles = currentTx.billingCycles;
                    const txCompleted = currentTx.cyclesCompleted ?? 0;
                    const txRemaining = txCycles != null ? txCycles - txCompleted : null;
                    const txAllPaid = txCycles != null && txCompleted >= txCycles;
                    let txProducts: { name: string; qty: number }[] = [];
                    if (currentTx.products) {
                      try {
                        const raw = typeof currentTx.products === "string" ? JSON.parse(currentTx.products) : currentTx.products;
                        if (typeof raw === "object" && raw !== null) {
                          txProducts = Object.entries(raw as Record<string, unknown>).map(([name, qty]) => ({ name, qty: Number(qty) }));
                        }
                      } catch {}
                    }
                    const txProductCount = txProducts.reduce((s, p) => s + p.qty, 0);
                    const txAvgPerProduct = txProductCount > 0 && currentTx.totalAmount ? Number(currentTx.totalAmount) / txProductCount : null;
                    const txFmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";
                    const txFmtAmount = (v: string | number | null | undefined) => v != null && v !== "" ? `\u00a3${Number(v).toFixed(2)}` : "\u2014";
                    return (
                      <div>
                        {contactSubscriptions.length > 1 && (
                          <div className="flex items-center justify-between mb-3">
                            <button onClick={() => setTransactionIdx(Math.max(0, transactionIdx - 1))} disabled={transactionIdx === 0} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-400 text-sm font-bold text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-500"><ChevronLeft size={16} /> Previous</button>
                            <span className="px-4 py-1.5 rounded-lg bg-amber-400 text-sm font-bold text-black">Transaction {transactionIdx + 1} of {contactSubscriptions.length}</span>
                            <button onClick={() => setTransactionIdx(Math.min(contactSubscriptions.length - 1, transactionIdx + 1))} disabled={transactionIdx === contactSubscriptions.length - 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-400 text-sm font-bold text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-500">Next <ChevronRight size={16} /></button>
                          </div>
                        )}
                        <div className="rounded-xl border-2 border-gray-900 bg-white shadow-sm overflow-hidden">
                          <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-900">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-black">{currentTx.planName || "Plan"}</span>
                              {currentTx.subscriptionNumber && <span className="text-xs text-black font-mono">{currentTx.subscriptionNumber}</span>}
                            </div>
                            <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border", txStatusBadge)}>{currentTx.status}</span>
                          </div>
                          <div className="p-5">
                            <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Deposit</p><p className="text-sm font-semibold text-black">{txFmtAmount((Number(currentTx.setupFee) || 0) + (Number(currentTx.recurringAmount ?? currentTx.amount) || 0))}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Per Cycle</p><p className="text-sm font-semibold text-black">{txFmtAmount(currentTx.recurringAmount ?? currentTx.amount)}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Total Value</p><p className="text-sm font-semibold text-black">{txFmtAmount(currentTx.totalAmount)}</p></div>
                              {txAvgPerProduct != null && <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Avg/Product</p><p className="text-sm font-semibold text-black">£{txAvgPerProduct.toFixed(2)} <span className="text-xs font-normal text-black">({txProductCount} items)</span></p></div>}
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Payment Status</p>{txAllPaid ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><CheckCircle2 size={13} /> All Paid</span> : txCycles != null ? <span className="text-xs font-semibold text-black">{txCompleted}/{txCycles} paid{txRemaining != null && txRemaining > 0 && <span className="ml-1 text-black font-normal">({txRemaining} remaining)</span>}</span> : <span className="text-xs text-black">Ongoing</span>}</div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Next Billing</p><p className="text-sm text-black">{txFmtDate(currentTx.nextBillingOn)}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Last Billed</p><p className="text-sm text-black">{txFmtDate(currentTx.lastBilledOn)}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Created</p><p className="text-sm text-black">{txFmtDate(currentTx.createdOn)}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Activated</p><p className="text-sm text-black">{txFmtDate(currentTx.activatedOn)}</p></div>
                              <div><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Salesperson</p><p className="text-sm font-bold text-black">{currentTx.salesPerson || "\u2014"}</p></div>
                              {currentTx.campaignId && <div style={{ gridColumn: "1 / -1" }}><p className="text-[10px] font-black text-black uppercase tracking-wider mb-0.5">Campaign</p><p className="text-sm text-black">{currentTx.campaignId}</p></div>}
                            </div>
                            {txProducts.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-900">
                                <p className="text-[10px] font-black text-black uppercase tracking-wider mb-2">Products ({txProductCount} items)</p>
                                <div className="flex flex-wrap gap-2">
                                  {txProducts.map((p) => <span key={p.name} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-medium text-black"><Package size={11} className="text-blue-500" />{p.name}<span className="ml-0.5 font-bold text-blue-700">×{p.qty}</span></span>)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })())}
                </div>
              )}

              {/* Shipments tab */}
              {centerTopTab === "shipments" && (() => {
                const shipmentsQuery = trpc.billingDashboard.getShipmentHistory.useQuery(
                  { email: contact?.email ?? "" },
                  { enabled: !!contact?.email }
                );
                const shipmentsData = shipmentsQuery.data;
                const shipmentsLoading = shipmentsQuery.isLoading;

                const shipmentStatusBadge = (status: string) => {
                  switch (status) {
                    case "Delivered": return "bg-green-100 text-green-800 border-green-200";
                    case "Dispatched": return "bg-blue-100 text-blue-800 border-blue-200";
                    case "New": return "bg-gray-100 text-gray-800 border-gray-200";
                    case "Packed": return "bg-indigo-100 text-indigo-800 border-indigo-200";
                    case "On Hold": return "bg-yellow-100 text-yellow-800 border-yellow-200";
                    case "Returned": return "bg-red-100 text-red-800 border-red-200";
                    case "Part Shipped": return "bg-orange-100 text-orange-800 border-orange-200";
                    default: return "bg-gray-100 text-gray-800 border-gray-200";
                  }
                };

                const fmtDate = (d: string | null | undefined) =>
                  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

                if (shipmentsLoading) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <div className="w-7 h-7 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
                      <p className="text-sm text-gray-700">Loading shipments\u2026</p>
                    </div>
                  );
                }

                if (!shipmentsData || shipmentsData.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <Archive size={36} className="mb-3 opacity-40" />
                      <p className="text-sm font-medium text-gray-800">No shipments found</p>
                      <p className="text-xs mt-1 text-gray-600">Mintsoft order data will appear here once synced</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      {shipmentsData.length} Shipment{shipmentsData.length !== 1 ? "s" : ""}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Order Date</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Status</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Courier</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Tracking</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Items</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Delivery Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipmentsData.map((shipment, idx) => (
                            <tr key={shipment.orderNumber ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2.5 text-gray-800 font-medium">
                                <div>{fmtDate(shipment.orderDate)}</div>
                                <div className="text-[10px] text-gray-500 font-mono">{shipment.orderNumber}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", shipmentStatusBadge(shipment.status))}>
                                  {shipment.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-700">{shipment.courierService || "\u2014"}</td>
                              <td className="px-3 py-2.5">
                                {shipment.trackingUrl ? (
                                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                                    {shipment.trackingNumber || "Track"}
                                    <ExternalLink size={10} />
                                  </a>
                                ) : shipment.trackingNumber ? (
                                  <span className="text-gray-700">{shipment.trackingNumber}</span>
                                ) : (
                                  <span className="text-gray-400">\u2014</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-700">
                                <span className="font-semibold">{shipment.totalItems}</span>
                                {shipment.items && shipment.items.length > 0 && (
                                  <span className="ml-1 text-[10px] text-gray-500">
                                    ({shipment.items.map((i: any) => i.sku).join(", ")})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-700">{fmtDate(shipment.deliveryDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Notes tab */}
              {centerTopTab === "notes" && (
                <div className="space-y-4">
                  {/* Agent Notes section — manual notes from agents */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-3">Agent Notes</p>
                    {contact.callNotes.filter((n) => !n.note.startsWith("\uD83E\uDD16") && !n.note.startsWith("\uD83D\uDCE7")).length === 0 ? (
                      <p className="text-xs text-gray-600 italic">No agent notes yet. Click "+ Add Entry" above to add one.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {contact.callNotes.filter((n) => !n.note.startsWith("\uD83E\uDD16") && !n.note.startsWith("\uD83D\uDCE7")).map((note) => (
                          <div key={`agent-note-${note.id}`} className="rounded-xl border border-gray-200 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-800">{note.agentName || "Agent"}</span>
                              <span className="text-[10px] text-gray-600">{formatDate(note.createdAt)}</span>
                            </div>
                            {editingNoteId === note.id ? (
                              <div>
                                <textarea
                                  value={editingNoteText}
                                  onChange={(e) => setEditingNoteText(e.target.value)}
                                  className="w-full text-xs text-gray-800 border border-blue-300 rounded p-2 resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  autoFocus
                                  onKeyDown={(e) => { if (e.key === "Escape") { setEditingNoteId(null); setEditingNoteText(""); } }}
                                />
                                <div className="flex gap-2 mt-1">
                                  <button onClick={() => updateNoteMutation.mutate({ noteId: note.id, note: editingNoteText })} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Save</button>
                                  <button onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }} className="text-xs text-black px-3 py-1 rounded hover:bg-gray-100">Cancel</button>
                                  <button onClick={() => { if (confirm("Delete this note?")) { deleteNoteMutation.mutate({ noteId: note.id }); setEditingNoteId(null); setEditingNoteText(""); } }} className="text-xs text-red-600 px-3 py-1 rounded hover:bg-red-50">Delete</button>
                                </div>
                              </div>
                            ) : (
                              <div className="group/note flex items-start gap-1">
                                <p className="text-xs text-gray-800 leading-relaxed flex-1">{note.note}</p>
                                <button onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.note); }} className="text-black hover:text-blue-600 shrink-0 mt-0.5" title="Edit note"><Pencil size={12} /></button>
                                <button onClick={() => { if (confirm("Delete this note?")) deleteNoteMutation.mutate({ noteId: note.id }); }} className="text-black hover:text-red-600 shrink-0 mt-0.5" title="Delete note"><Trash2 size={12} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-200 pt-4" />

                  {/* AI Call Notes section — only 5+ min analyzed calls */}
                  {aiNotesData?.notes && aiNotesData.notes.length > 0 && (() => {
                    const allNotes = aiNotesData.notes as any[];
                    const aiAnalyzed = allNotes.filter((n: any) => (n.durationSeconds || 0) >= 300);

                    const formatDateTime = (dateStr: string | null) => {
                      if (!dateStr) return "";
                      const d = new Date(dateStr);
                      return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
                    };

                    if (aiAnalyzed.length === 0) return null;
                    return (
                      <div className="space-y-5">
                        {/* AI Analyzed Calls (5+ min) */}
                        {aiAnalyzed.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                              <span>{"\uD83E\uDD16"}</span> AI Call Notes ({aiAnalyzed.length} calls)
                            </p>
                            {aiAnalyzed.map((note: any) => (
                              <div key={`ai-note-${note.id}`} className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-blue-700">
                                      {note.callType?.replace(/_/g, " ").toUpperCase() || "CALL"}
                                    </span>
                                    {note.overallScore != null && (
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${Number(note.overallScore) >= 7 ? "bg-green-100 text-green-800" : Number(note.overallScore) >= 4 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                                        Score: {Number(note.overallScore).toFixed(1)}/10
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-gray-800 font-medium">
                                    {formatDateTime(note.callDate)}
                                    {note.repName ? ` \u2022 ${note.repName}` : ""}
                                    {note.durationSeconds ? ` \u2022 ${Math.floor(note.durationSeconds / 60)}m` : ""}
                                  </span>
                                </div>
                                {note.retentionNotes && (
                                  <div className="space-y-1.5 mt-2">
                                    {note.retentionNotes.rapport && (
                                      <div className="border-l-4 border-teal-400 pl-3 py-1">
                                        <p className="text-[10px] font-bold text-teal-700 uppercase">Rapport</p>
                                        <p className="text-sm text-gray-800">{note.retentionNotes.rapport}</p>
                                      </div>
                                    )}
                                    {note.retentionNotes.currentRoutine && (
                                      <div className="border-l-4 border-indigo-400 pl-3 py-1">
                                        <p className="text-[10px] font-bold text-indigo-700 uppercase">Current Routine</p>
                                        <p className="text-sm text-gray-800">{note.retentionNotes.currentRoutine}</p>
                                      </div>
                                    )}
                                    {note.retentionNotes.productsToSend && (
                                      <div className="border-l-4 border-purple-400 pl-3 py-1">
                                        <p className="text-[10px] font-bold text-purple-700 uppercase">Products to Send</p>
                                        <p className="text-sm text-gray-800 whitespace-pre-line">{note.retentionNotes.productsToSend}</p>
                                      </div>
                                    )}
                                    {note.retentionNotes.customerSituation && (
                                       <div className="mb-3">
                                         <p className="text-[10px] font-bold text-orange-600 uppercase">Customer Situation</p>
                                         <p className="text-sm text-gray-800">{note.retentionNotes.customerSituation}</p>
                                       </div>
                                     )}
                                    {note.retentionNotes.keyCommitments && (
                                       <div className="mb-3">
                                         <p className="text-[10px] font-bold text-orange-600 uppercase">Key Commitments</p>
                                         <p className="text-sm text-gray-800">{note.retentionNotes.keyCommitments}</p>
                                       </div>
                                     )}
                                    {note.retentionNotes.nextActions && (
                                      <div className="border-l-4 border-orange-400 pl-3 py-1">
                                        <p className="text-[10px] font-bold text-orange-700 uppercase">Next Actions</p>
                                        <p className="text-sm text-gray-800">{note.retentionNotes.nextActions}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-blue-100 flex justify-end">
                                  <a href={`/ai-coach?analysisId=${note.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline">
                                    View Full Analysis \u2192
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Existing Retention Lead Notes */}
                  {retentionLeads.length === 0 && (!aiNotesData?.notes || aiNotesData.notes.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <FileText size={36} className="mb-3 opacity-40" />
                      <p className="text-sm font-medium">Notes</p>
                      <p className="text-xs mt-1">No retention notes available</p>
                    </div>
                  ) : retentionLeads.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {retentionLeads.filter((l) => l.managerNote || l.agentNote).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                          <FileText size={36} className="mb-3 opacity-40" />
                          <p className="text-sm font-medium">No notes</p>
                          <p className="text-xs mt-1">No manager or agent notes on retention leads</p>
                        </div>
                      ) : (
                        retentionLeads
                          .filter((l) => l.managerNote || l.agentNote)
                          .map((lead) => (
                            <div key={`note-${lead.id}`} className="rounded-xl border border-gray-200 p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-700">
                                  {lead.leadType || "Retention Lead"}
                                </span>
                                <span className="text-[10px] text-gray-600">
                                  {lead.createdAt ? formatDate(lead.createdAt) : ""}
                                </span>
                              </div>
                              {lead.managerNote && (
                                <div className="mb-2">
                                  <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Customer Message</p>
                                  <p className="text-sm text-gray-700 leading-relaxed">{lead.managerNote}</p>
                                </div>
                              )}
                              {lead.agentNote && (
                                <div className={lead.managerNote ? "pt-2 border-t border-gray-100" : ""}>
                                  <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Agent Note</p>
                                  <p className="text-sm text-gray-700 leading-relaxed">{lead.agentNote}</p>
                                </div>
                              )}
                              {lead.assignedAgent && (
                                <p className="text-[10px] text-gray-600 mt-2">Assigned to: {lead.assignedAgent}</p>
                              )}
                            </div>
                          ))
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom Card: Documents / Activities / CloudTalk History / Data Privacy ── */}
          <div className="rounded-2xl shadow-sm overflow-hidden bg-white border border-gray-100">

            {/* Sub-tab row */}
            <div className="flex items-center border-b border-gray-200 px-4">
              <button
                onClick={() => setCenterBottomTab("documents")}
                className={cn(
                  "px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerBottomTab === "documents"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                Documents
              </button>
              <button
                onClick={() => setCenterBottomTab("activities")}
                className={cn(
                  "px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerBottomTab === "activities"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                Activities
              </button>
              <button
                onClick={() => setCenterBottomTab("cloudtalk")}
                className={cn(
                  "px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerBottomTab === "cloudtalk"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                CloudTalk History
              </button>
              <button
                onClick={() => setCenterBottomTab("privacy")}
                className={cn(
                  "px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerBottomTab === "privacy"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-700 border-transparent hover:text-gray-900"
                )}
              >
                Data Privacy
              </button>
            </div>

            {/* Sub-tab content */}
            <div className="p-5">
              {/* Documents */}
              {centerBottomTab === "documents" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                  <FileText size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No documents uploaded yet</p>
                </div>
              )}

              {/* Activities */}
              {centerBottomTab === "activities" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                  <Activity size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No recent activities to display</p>
                </div>
              )}

              {/* CloudTalk History */}
              {centerBottomTab === "cloudtalk" && (
                <div>
                  {historyLoading ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-gray-600 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      Loading call history…
                    </div>
                  ) : !callHistoryFromDb || callHistoryFromDb.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-gray-600">
                      <PhoneOff size={28} className="mb-2 opacity-40" />
                      <p className="text-sm">No calls found for this contact</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-gray-600 mb-1">
                        {callHistoryFromDb.length} total calls
                      </p>
                      {callHistoryFromDb.map((call) => {
                        const isAnswered = (call.durationSeconds ?? 0) > 0;
                        const durationSec = Math.round(call.durationSeconds ?? 0);
                        const mins = Math.floor(durationSec / 60);
                        const secs = durationSec % 60;
                        return (
                          <div key={call.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {isAnswered ? (
                                  <PhoneCall size={13} className="text-green-500 shrink-0 mt-0.5" />
                                ) : (
                                  <PhoneMissed size={13} className="text-red-400 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={cn(
                                      "text-xs px-1.5 py-0.5 rounded-full font-medium",
                                      isAnswered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                                    )}>
                                      {isAnswered ? "Answered" : "Missed"}
                                    </span>
                                    {durationSec > 0 && (
                                      <span className="text-xs text-gray-600">{mins}m {secs}s</span>
                                    )}
                                    {call.repName && (
                                      <span className="text-xs text-gray-600">· {call.repName}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <p className="text-xs text-gray-600">
                                      {call.callDate ? new Date(call.callDate).toLocaleString("en-GB") : ""}
                                    </p>
                                    {call.callType && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                        {call.callType.replace(/_/g, " ")}
                                      </span>
                                    )}
                                    {call.overallScore != null && (
                                      <span className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                        call.overallScore >= 70 ? "bg-green-100 text-green-700" :
                                        call.overallScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                                        "bg-red-100 text-red-700"
                                      )}>
                                        {Math.round(call.overallScore)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {call.audioFileUrl && (
                                <a
                                  href={call.audioFileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                                >
                                  ▶ Play
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Data Privacy */}
              {centerBottomTab === "privacy" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                  <Lock size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">Data privacy settings coming soon</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            RIGHT SIDEBAR (~260px)
        ══════════════════════════════════════════════════ */}
        <div className="shrink-0 flex flex-col gap-4" style={{ width: "260px" }}>

          {/* ── KPI Cards (LTV Plan / LTV Paid / Cycle) ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* LTV Plan */}
            <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center text-center border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#e3f2fd" }}>
                <svg className="w-5 h-5" style={{ color: "#1565c0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">LTV Plan</p>
              <p className={`font-bold mt-0.5 ${(billingInfo?.ltvPlan || retentionTotalSpend) > 0 ? "text-gray-800" : "text-gray-600"}`} style={{ fontSize: "20px" }}>
                {billingInfo?.ltvPlan ? `£${billingInfo.ltvPlan.toFixed(2)}` : retentionTotalSpend > 0 ? `£${retentionTotalSpend.toFixed(2)}` : "—"}
              </p>
            </div>

            {/* LTV Paid */}
            <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center text-center border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#e8f5e9" }}>
                <svg className="w-5 h-5" style={{ color: "#2e7d32" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">LTV Paid</p>
              <p className={`font-bold mt-0.5 ${billingInfo?.ltvPaid ? "text-green-700" : "text-gray-600"}`} style={{ fontSize: "20px" }}>
                {billingInfo?.ltvPaid ? `£${billingInfo.ltvPaid.toFixed(2)}` : "—"}
              </p>
            </div>
          </div>

          {/* ── Cycle + Monthly Amount ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cycle */}
            <div className="bg-white rounded-2xl shadow-sm p-3.5 flex flex-col items-center text-center border border-gray-100">
              <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Cycle</p>
              <p className={`font-bold mt-0.5 ${(billingInfo?.cycle || retentionMaxCycle) > 0 ? "text-gray-800" : "text-gray-600"}`} style={{ fontSize: "22px" }}>
                {billingInfo?.cycle ? billingInfo.cycle : retentionMaxCycle > 0 ? retentionMaxCycle : "—"}
              </p>
            </div>

            {/* Monthly Amount */}
            <div className="bg-white rounded-2xl shadow-sm p-3.5 flex flex-col items-center text-center border border-gray-100">
              <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Monthly</p>
              <p className={`font-bold mt-0.5 ${billingInfo?.monthlyAmount ? "text-gray-800" : "text-gray-600"}`} style={{ fontSize: "22px" }}>
                {billingInfo?.monthlyAmount ? `£${billingInfo.monthlyAmount.toFixed(2)}` : "—"}
              </p>
            </div>
          </div>

          {/* ── Subscription Status + Next Billing ── */}
          {!!billingInfo && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-col gap-2.5">
                {billingInfo.status && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Status</span>
                    <span className={cn(
                      "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                      billingInfo.status === "live" ? "bg-green-100 text-green-700" :
                      billingInfo.status === "cancelled" ? "bg-red-100 text-red-700" :
                      billingInfo.status === "non_renewing" ? "bg-amber-100 text-amber-700" :
                      billingInfo.status === "expired" ? "bg-gray-100 text-gray-700" :
                      "bg-blue-100 text-blue-700"
                    )}>
                      {billingInfo.status.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
                {billingInfo.nextBillingDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Next Billing</span>
                    <span className="text-xs font-medium text-gray-800">{formatDate(billingInfo.nextBillingDate)}</span>
                  </div>
                )}
                {billingInfo.cancellationDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Cancelled</span>
                    <span className="text-xs font-medium text-red-600">{formatDate(billingInfo.cancellationDate)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Client Subscriptions ── */}
          {contactSubscriptions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={18} className="text-indigo-600" />
                <span className="text-sm font-black text-black">Plans</span>
                <span className="ml-auto text-xs font-bold text-black">{contactSubscriptions.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {contactSubscriptions.map((sub) => (
                  <div key={sub.subscriptionId} className="border border-gray-100 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{sub.planName || sub.subscriptionNumber}</span>
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        sub.status === "live" ? "bg-green-100 text-green-700" :
                        sub.status === "dunning" ? "bg-orange-100 text-orange-700" :
                        sub.status === "cancelled" ? "bg-red-100 text-red-700" :
                        sub.status === "expired" ? "bg-gray-100 text-gray-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-black">
                      <span>£{parseFloat(sub.amount || "0").toFixed(2)}/cycle</span>
                      {sub.billingCycles && (
                        <span>{sub.cyclesCompleted ?? 0}/{sub.billingCycles} paid</span>
                      )}
                      {sub.nextBillingOn && (
                        <span>Next: {new Date(sub.nextBillingOn).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Risk Score ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-gray-600" />
                <span className="text-sm font-bold text-gray-800">Risk Score</span>
              </div>
            </div>
            <p className="text-xs text-gray-600">No data yet</p>
          </div>

          {/* ── Products History ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={18} style={{ color: "#1565c0" }} />
              <span className="text-sm font-bold" style={{ color: "#1565c0" }}>Products History</span>
            </div>
            {(billingInfo?.allSubscriptions?.length || retentionPlans.length > 0 || contact.trialKit) ? (
              <div className="flex flex-col gap-2.5">
                {billingInfo?.allSubscriptions && billingInfo.allSubscriptions.length > 0 ? (
                  billingInfo.allSubscriptions.map((sub: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: sub.status === "live" ? "#4caf50" : "#9e9e9e" }} />
                        <span className="text-sm text-gray-800">{sub.planName || sub.subscriptionNumber || "Unknown Plan"}</span>
                      </div>
                      <span className={cn("text-xs font-semibold", sub.status === "live" ? "text-green-600" : "text-gray-600")}>
                        {sub.status === "live" ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))
                ) : null}
                {contact.trialKit && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#1565c0" }} />
                      <span className="text-sm text-gray-800">{contact.trialKit}</span>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: "#1565c0" }}>Current</span>
                  </div>
                )}
                {retentionPlans.map((plan) => (
                  <div key={plan} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block bg-gray-400" />
                      <span className="text-sm text-gray-700">{plan}</span>
                    </div>
                    <span className="text-[10px] text-gray-600">Retention</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No products recorded</p>
            )}
          </div>

          {/* ── Cancellation History ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} style={{ color: "#e65100" }} />
              <span className="text-sm font-bold text-gray-800">Cancellation History</span>
            </div>
            {retentionLeads.length > 0 ? (
              <div className="flex flex-col gap-3">
                {retentionLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl p-3" style={{ background: "#fff0ee" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {lead.leadType || "Unknown type"}
                      </span>
                      {lead.billingStatus && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                          {lead.billingStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {lead.createdAt ? formatDate(lead.createdAt) : "—"}
                      {lead.monthlyAmount > 0 && ` · £${lead.monthlyAmount.toFixed(2)}/mo`}
                    </p>
                    {lead.managerNote && (
                      <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed italic">
                        "{lead.managerNote.length > 120 ? lead.managerNote.slice(0, 120) + "…" : lead.managerNote}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl p-3.5" style={{ background: "#fff0ee" }}>
                <p className="text-xs text-gray-500">No cancellation attempts</p>
              </div>
            )}
          </div>

          {/* ── Assigned Team ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User size={18} className="text-gray-600" />
              <span className="text-sm font-bold text-gray-800">Assigned Team</span>
            </div>
            {(() => {
              const displayAgent = retentionLatestLead?.assignedAgent || contact.agentName;
              if (displayAgent) {
                return (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#e3f2fd" }}>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                      style={{ background: "#1565c0" }}
                    >
                      {getInitials(displayAgent)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{displayAgent}</p>
                      <p className="text-xs text-gray-500">
                        {contact.department ? `${contact.department.charAt(0).toUpperCase() + contact.department.slice(1)} Agent` : "Retention Agent"}
                      </p>
                    </div>
                  </div>
                );
              }
              return <p className="text-xs text-gray-600">No agent assigned</p>;
            })()}
          </div>

          {/* ── Call Stats (if notes exist) ── */}
          {contact.callNotes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-3">Call Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-700">{contact.callNotes.length}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">Total Calls</p>
                </div>
                <div className="rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-xl font-bold text-green-600">
                    {contact.callNotes.filter((n) => n.statusAtTime === "sale").length}
                  </p>
                  <p className="text-[10px] text-green-500 mt-0.5">Sales</p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>

    {/* ─── Email Compose Modal ─────────────────────────────────────────────── */}
    {emailOpen && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Compose Email</h3>
              {contact.email && (
                <p className="text-xs text-gray-500 mt-0.5">To: <span className="font-medium text-gray-700">{contact.email}</span></p>
              )}
            </div>
            <button onClick={() => setEmailOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="text-sm bg-white border-gray-200 text-gray-800 placeholder:text-gray-500 focus-visible:ring-blue-400"
            />
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Write your message here…"
              className="min-h-[140px] text-sm resize-none bg-white border-gray-200 text-gray-800 placeholder:text-gray-500 focus-visible:ring-blue-400"
            />
          </div>
          <div className="px-5 pb-5 flex items-center gap-3 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEmailOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!emailSubject.trim()) { toast.error("Please enter a subject"); return; }
                if (!emailBody.trim()) { toast.error("Please enter a message"); return; }
                sendEmailMutation.mutate({ contactId, subject: emailSubject.trim(), body: emailBody.trim() });
              }}
              disabled={sendEmailMutation.isPending || !emailSubject.trim() || !emailBody.trim()}
              size="sm"
              className="text-white font-semibold flex items-center gap-2"
              style={{ background: "#1565c0" }}
            >
              <Send size={13} />
              {sendEmailMutation.isPending ? "Sending…" : "Send Email"}
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Email Template Picker Modal ─────────────────────────────────────── */}
    {templatePickerOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Send Email Template</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                To: <span className="font-medium text-gray-700">{contact.name}</span>
                {contact.email
                  ? <span className="ml-2 text-gray-600">&lt;{contact.email}&gt;</span>
                  : <span className="ml-2 text-red-500 text-xs">⚠ No email on file</span>}
              </p>
            </div>
            <button
              onClick={() => { setTemplatePickerOpen(false); setSelectedTemplateId(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: Template list */}
            <div className="w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose Template</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowAddTemplate(!showAddTemplate)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {showAddTemplate ? "Cancel" : "+ Add"}
                  </button>
                )}
              </div>

              {/* Add Template Form */}
              {showAddTemplate && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <input
                    type="text"
                    placeholder="Template Name"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                  />
                  <input
                    type="text"
                    placeholder="Subject Line"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                  />
                  <textarea
                    placeholder="Paste HTML body here..."
                    value={newTemplate.htmlBody}
                    onChange={(e) => setNewTemplate({ ...newTemplate, htmlBody: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2 h-32 resize-y font-mono"
                  />
                  <button
                    onClick={() => createTemplateMutation.mutate(newTemplate)}
                    disabled={!newTemplate.name || !newTemplate.subject || !newTemplate.htmlBody || createTemplateMutation.isPending}
                    className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createTemplateMutation.isPending ? "Creating…" : "Create Template"}
                  </button>
                </div>
              )}

              {templatesLoading && (
                <div className="text-sm text-gray-600 text-center py-8">Loading…</div>
              )}
              {!templatesLoading && (!emailTemplates || emailTemplates.length === 0) && (
                <div className="text-sm text-gray-600 text-center py-8">No templates yet</div>
              )}
              <div className="flex flex-col gap-2">
                {emailTemplates?.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg border-2 transition-colors ${
                      selectedTemplateId === tpl.id
                        ? "border-amber-500 bg-amber-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{tpl.name}</p>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 mt-1 leading-snug">{tpl.description}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1 truncate italic">{tpl.subject}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Preview */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {!selectedTemplateId && (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                  <Mail size={32} className="opacity-30" />
                  <p className="text-sm">Select a template to preview</p>
                </div>
              )}
              {selectedTemplateId && templateDetailLoading && (
                <div className="flex items-center justify-center h-full text-gray-600 text-sm">Loading preview…</div>
              )}
              {selectedTemplateId && previewHtml && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                    <p className="text-xs text-gray-500">
                      Subject: <span className="font-medium text-gray-700">
                        {selectedTemplate?.subject
                          .replaceAll("${Customers.First Name}", (contact.name ?? "").split(" ")[0] || "[Name]")
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
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white">
            <p className="text-xs text-gray-600">
              Placeholders (name, agent, email) are filled automatically before sending
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setTemplatePickerOpen(false); setSelectedTemplateId(null); }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedTemplateId) return;
                  sendTemplateMutation.mutate({ templateId: selectedTemplateId, contactId });
                }}
                disabled={!selectedTemplateId || sendTemplateMutation.isPending || !contact.email}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {sendTemplateMutation.isPending ? "Sending…" : "Send Email"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* Schedule Callback Modal */}
    {callbackModalOpen && (() => {
      const TIME_SLOTS = [
        "09:00","09:30","10:00","10:30","11:00","11:30",
        "12:00","12:30","13:00","13:30","14:00","14:30",
        "15:00","15:30","16:00","16:30","17:00","17:30",
        "18:00","18:30","19:00","19:30","20:00"
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setCallbackModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-7 min-w-[380px] max-w-[460px] flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              <span className="font-bold text-lg text-gray-800">{callbackModalType === "follow_up" ? "Schedule Follow Up" : "Schedule Callback"}</span>
            </div>
            <p className="text-sm text-gray-600">
              Scheduling {callbackModalType === "follow_up" ? "follow up" : "callback"} for <strong>{contact.name}</strong>
            </p>

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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-700">Time</label>
              <select value={selectedTime} onChange={(e) => setTimePart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold w-full">
                <option value="" disabled>Select time...</option>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {isValid && (
              <div className="bg-green-50 border border-green-300 rounded-lg px-3 py-2 text-sm text-green-800 font-semibold text-center">
                {new Date(callbackDateTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at {selectedTime}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setCallbackModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => {
                  if (!isValid || !retentionSubId) return;
                  // Convert wall-clock in userTimezone to UTC ms
                  const asUtc = new Date(`${selectedDate}T${selectedTime}:00Z`);
                  const tzParts = new Intl.DateTimeFormat("en-US", {
                    timeZone: userTimezone,
                    hour: "2-digit", minute: "2-digit", hour12: false,
                  }).formatToParts(asUtc);
                  const tzH = parseInt(tzParts.find(p => p.type === "hour")!.value);
                  const tzM = parseInt(tzParts.find(p => p.type === "minute")!.value);
                  let offsetMin = (tzH * 60 + tzM) - (asUtc.getUTCHours() * 60 + asUtc.getUTCMinutes());
                  if (offsetMin > 720) offsetMin -= 1440;
                  if (offsetMin < -720) offsetMin += 1440;
                  const utcMs = asUtc.getTime() - offsetMin * 60000;

                  logCallAttemptMutation.mutate({
                    subscriptionId: retentionSubId,
                    agentName: user?.name || "Rob",
                    result: callbackModalType,
                    callbackAt: callbackModalType === "callback" ? utcMs : undefined,
                    followUpAt: callbackModalType === "follow_up" ? utcMs : undefined,
                    note: `${callbackModalType === "follow_up" ? "Follow up" : "Callback"} scheduled: ${selectedDate} ${selectedTime}`,
                  });
                  setCallbackModalOpen(false);
                }}
                disabled={!isValid}
                className={`px-5 py-2 rounded-lg border-none font-bold text-sm text-white ${
                  isValid ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer" : "bg-indigo-300 cursor-not-allowed"
                }`}>{callbackModalType === "follow_up" ? "Confirm Follow Up" : "Confirm Callback"}</button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Done Deal Modal */}
    <DoneDealModal
      open={doneDealModalOpen}
      onClose={() => setDoneDealModalOpen(false)}
      contactId={contactId}
      subscriptionId={currentRetentionLead?.subscriptionId ?? ""}
      customerName={contact.name ?? "Unknown"}
      agentName={user?.name ?? "Agent"}
      onSuccess={() => {
        refetch();
        // Auto-advance to next lead
        if (autoAdvance && nextLead) {
          setTimeout(() => {
            navigateToLead(nextLead, currentLeadIndex + 1);
          }, 600);
        }
      }}
    />
    {/* Take Payment Modal (placeholder — card details only, no processing yet) */}
    {takePaymentOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setTakePaymentOpen(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Take Payment</h2>
            <button onClick={() => setTakePaymentOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
              <X size={20} className="text-gray-900" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-900 font-medium">Enter card details for {contact.name}</p>
            <div>
              <label className="text-xs font-semibold text-gray-900 block mb-1">Card Number</label>
              <input
                type="text"
                value={paymentCardNumber}
                onChange={(e) => setPaymentCardNumber(e.target.value.replace(/[^0-9\s]/g, "").slice(0, 19))}
                placeholder="1234 5678 9012 3456"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-900 block mb-1">Expiry (MM/YY)</label>
                <input
                  type="text"
                  value={paymentExpiry}
                  onChange={(e) => setPaymentExpiry(e.target.value.replace(/[^0-9/]/g, "").slice(0, 5))}
                  placeholder="12/28"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-900 block mb-1">CVV</label>
                <input
                  type="text"
                  value={paymentCvv}
                  onChange={(e) => setPaymentCvv(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="123"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800 font-medium">Payment processing will be enabled soon. Card details are saved for future use.</p>
            </div>
          </div>
          <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
            <button
              onClick={() => setTakePaymentOpen(false)}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border-2 border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.success("Card details saved");
                setTakePaymentOpen(false);
              }}
              disabled={!paymentCardNumber || !paymentExpiry || !paymentCvv}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50 shadow-sm"
            >
              Save Card
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
