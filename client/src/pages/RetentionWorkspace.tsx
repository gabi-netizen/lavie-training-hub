import { useState, useMemo } from "react";
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
} from "lucide-react";

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
        <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
          Coming soon
        </div>
      )}
      {activeTab === "emails" && (
        <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
          Coming soon
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
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
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
                            <a
                              href={lead.phone ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}` : "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-1.5 rounded hover:bg-green-50 transition-colors ${
                                lead.phone ? "text-green-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>

                            {/* SMS */}
                            <a
                              href={lead.phone ? `sms:${lead.phone}` : "#"}
                              className={`p-1.5 rounded hover:bg-blue-50 transition-colors ${
                                lead.phone ? "text-blue-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="SMS"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </a>

                            {/* Email */}
                            <a
                              href={lead.email ? `mailto:${lead.email}` : "#"}
                              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                                lead.email ? "text-gray-600" : "text-gray-300 pointer-events-none"
                              }`}
                              title="Email"
                            >
                              <Mail className="h-4 w-4" />
                            </a>

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
    </div>
  );
}
