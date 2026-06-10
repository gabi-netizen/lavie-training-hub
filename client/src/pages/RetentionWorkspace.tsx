import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
} from "lucide-react";
import { WhatsAppChatPanel } from "@/components/WhatsAppChatPanel";
import { WorkspaceEmailPanel } from "@/components/WorkspaceEmailPanel";

// ─── Lead Type Badge Colors ──────────────────────────────────────────────────

const LEAD_TYPE_COLORS: Record<string, string> = {
  "Pre-Cycle-Cancelled": "#22c55e",
  "Cancel Live Sub": "#2563eb",
  "Cancel Live Sub (Cycle 1)": "#2563eb",
  "Cancel Live Sub (Cycle 2+)": "#3b82f6",
  "From Cat to Rob": "#92400e",
  "Hot Lead": "#eab308",
  "Pre-Cycle-Decline": "#1a1a1a",
  "Decline Live Sub": "#7c3aed",
};

// ─── Work Status Badge Config ────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RetentionWorkspace() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"queue" | "callbacks" | "messages" | "emails">("queue");
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [statusDropdownOpen, setStatusDropdownOpen] = useState<string | null>(null);
  const [selectedLeadContactId, setSelectedLeadContactId] = useState<number | null>(null);

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

  // Fetch leads for the current agent
  // TODO: Once retention flow is live, revert to user?.name filtering
  const agentName = "Rob";
  const { data: leadsData, refetch } = trpc.manager.getLeads.useQuery(
    {
      agentFilter: agentName,
      perPage: 200,
      dateRangeFilter: "all",
    },
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

  const assignLeadMutation = trpc.manager.assignLead.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  type Lead = NonNullable<typeof leadsData>["leads"][number];
  const allLeads: Lead[] = useMemo(
    () => [...(leadsData?.leads ?? [])].sort((a, b) => (a.assignmentId ?? 0) - (b.assignmentId ?? 0)),
    [leadsData]
  );

  // Tab filtering - show ALL leads in queue
  const queueLeads = useMemo(
    () => allLeads,
    [allLeads]
  );

  const callbackLeads = useMemo(
    () => allLeads.filter((l: Lead) => l.callbackAt && l.callbackAt > Date.now()),
    [allLeads]
  );

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

  const displayLeads = activeTab === "queue" ? queueLeads : activeTab === "callbacks" ? callbackLeads : [];

  // Handle agent note save
  const handleNoteSave = (subscriptionId: string, note: string) => {
    assignLeadMutation.mutate({
      subscriptionId,
      agentNote: note,
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
    return (
      <span
        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {leadType}
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
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
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
        <h1 className="text-2xl font-bold text-gray-900">Retention Workspace</h1>
        <div className="flex items-center gap-4 text-sm text-gray-800">
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
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "queue"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          My Queue
        </button>
        <button
          onClick={() => setActiveTab("callbacks")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "callbacks"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          My Callbacks
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "messages"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          Messages
        </button>
        <button
          onClick={() => setActiveTab("emails")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "emails"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-800"
          }`}
        >
          Emails
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "messages" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WhatsAppChatPanel open={true} onClose={() => setActiveTab("queue")} inline />
        </div>
      )}
      {activeTab === "emails" && (
        <div style={{ height: "calc(100vh - 220px)", display: "flex" }}>
          <WorkspaceEmailPanel contactId={selectedLeadContactId} visible={activeTab === "emails"} />
        </div>
      )}

      {(activeTab === "queue" || activeTab === "callbacks") && (
        <>
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3 w-10">#</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-3 px-3">Status</th>
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

                    return (
                      <tr
                        key={lead.subscriptionId}
                        onClick={() => lead.contactId && setSelectedLeadContactId(lead.contactId)}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                          selectedLeadContactId === lead.contactId ? "bg-blue-50" : ""
                        }`}
                      >
                        {/* # */}
                        <td className="py-3 px-3 text-sm text-gray-800">{idx + 1}</td>

                        {/* Name */}
                        <td className="py-3 px-3">
                          <span className="text-sm font-semibold text-blue-600 cursor-pointer hover:underline">
                            {lead.customerName}
                          </span>
                        </td>

                        {/* Email */}
                        <td className="py-3 px-3">
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {lead.email}
                          </a>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3">
                          <StatusBadge lead={lead} />
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 text-sm text-gray-800">
                          {formatDateDDMMYYYY(lead.currentTermEndsAt || lead.createdAt)}
                        </td>

                        {/* Lead Type */}
                        <td className="py-3 px-3">
                          <LeadTypeBadge leadType={lead.leadType} />
                        </td>

                        {/* Customer Note */}
                        <td className="py-3 px-3">
                          <p className="text-sm text-gray-800 max-w-[200px] truncate" title={lead.managerNote || ""}>
                            {lead.managerNote
                              ? lead.managerNote.length > 100
                                ? lead.managerNote.slice(0, 100) + "..."
                                : lead.managerNote
                              : "—"}
                          </p>
                        </td>

                        {/* Agent Note */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <textarea
                              value={currentNote}
                              onChange={(e) =>
                                setEditingNotes((prev) => ({ ...prev, [noteKey]: e.target.value }))
                              }
                              onBlur={() => {
                                if (noteChanged) {
                                  handleNoteSave(lead.subscriptionId, currentNote);
                                }
                              }}
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
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            {/* Phone */}
                            <a
                              href={lead.phone ? `tel:${lead.phone}` : "#"}
                              className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                                lead.phone ? "text-green-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="Call"
                            >
                              <Phone className="h-4 w-4" />
                            </a>

                            {/* WhatsApp */}
                            <button
                              onClick={() => {
                                if (lead.contactId && lead.phone) {
                                  setMsgLeadContactId(lead.contactId);
                                  setMsgLeadPhone(lead.phone);
                                  setMsgLeadName(lead.customerName || "");
                                  setWaModalOpen(true);
                                }
                              }}
                              className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                                lead.phone ? "text-green-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="WhatsApp"
                              disabled={!lead.phone}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>

                            {/* SMS */}
                            <button
                              onClick={() => {
                                if (lead.contactId && lead.phone) {
                                  setMsgLeadContactId(lead.contactId);
                                  setMsgLeadPhone(lead.phone);
                                  setMsgLeadName(lead.customerName || "");
                                  setSmsModalOpen(true);
                                }
                              }}
                              className={`p-1.5 rounded hover:bg-blue-50 transition-colors ${
                                lead.phone ? "text-blue-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="SMS"
                              disabled={!lead.phone}
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

                            {/* Open Card */}
                            <button
                              onClick={() => {
                                if (lead.contactId) {
                                  window.location.href = `/contacts/${lead.contactId}?from=retention&leadIdx=${idx + 1}&subId=${encodeURIComponent(lead.subscriptionId)}`;
                                }
                              }}
                              className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
                              title="Open card"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
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
                    const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                    const hasPrefix = allPrefixes.some((p) => tpl.friendly_name.startsWith(p));
                    return tpl.friendly_name.startsWith("rt_") || tpl.friendly_name.startsWith("RT:") || !hasPrefix;
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
                      const allPrefixes = ["op_", "OP:", "rt_", "RT:"];
                      const hasPrefix = allPrefixes.some((p: string) => tpl.friendly_name.startsWith(p));
                      return tpl.friendly_name.startsWith("rt_") || tpl.friendly_name.startsWith("RT:") || !hasPrefix;
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
    </div>
  );
}
