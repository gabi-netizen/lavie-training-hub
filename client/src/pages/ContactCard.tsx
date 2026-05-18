/**
 * ContactCard — Full-page CRM customer card
 * Route: /contacts/:id
 * Design: Professional 3-column CRM layout matching approved mockup
 * Layout: Left sidebar (identity + gradient card) | Center (history + docs) | Right sidebar (KPIs + info)
 */
import { useState, useMemo } from "react";
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

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ContactCard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const contactId = parseInt(id ?? "0", 10);

  // CloudTalk call history state
  const [showCloudTalkHistory, setShowCloudTalkHistory] = useState(false);
  const [audioData, setAudioData] = useState<Record<number, string>>({}); // callId -> base64

  const { data: contact, refetch, isLoading, isError } = trpc.contacts.get.useQuery(
    { id: contactId },
    { enabled: !!contactId }
  );

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

  // Email compose state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Tab state
  const [centerTopTab, setCenterTopTab] = useState<"history" | "transactions" | "shipments" | "notes">("history");
  const [centerBottomTab, setCenterBottomTab] = useState<"documents" | "activities" | "cloudtalk" | "privacy">("documents");

  const { data: cloudTalkHistory, isLoading: historyLoading } = trpc.contacts.callHistory.useQuery(
    { phone: contact?.phone ?? "", limit: 20 },
    { enabled: (showCloudTalkHistory || centerBottomTab === "cloudtalk") && !!contact?.phone }
  );

  const streamRecordingMutation = trpc.contacts.streamRecording.useMutation({
    onSuccess: (data, variables) => {
      if (data.success && data.data) {
        setAudioData((prev) => ({ ...prev, [variables.callId]: data.data! }));
      } else {
        toast.error("Recording not available");
      }
    },
    onError: () => toast.error("Failed to load recording"),
  });

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-800" style={{ background: "#f0f2f5" }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading contact…</p>
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
    if (!contact.phone) {
      toast.error("No phone number on file");
      return;
    }
    clickToCallMutation.mutate({ contactId });
  };

  // Helper: initials from name
  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  // Helper: pad ID
  const paddedId = String(contact.id ?? contactId).padStart(5, "0");

  // Helper: format date nicely
  const formatDate = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  // Helper: format month/year
  const formatMonthYear = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  // Last contact info
  const lastNote = contact.callNotes.length > 0 ? contact.callNotes[0] : null;

  // Callback time display
  const callbackDisplay = contact.callbackAt
    ? new Date(contact.callbackAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })
    : null;

  return (
    <>
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>

      {/* ── Breadcrumb Bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => navigate("/contacts")} className="hover:text-blue-700 transition-colors">
            Customers
          </button>
          <ChevronRight size={14} className="text-gray-400" />
          <span className="text-gray-800 font-semibold">{contact.name}</span>
        </div>
        <div className="flex items-center gap-4">
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
        <div className="shrink-0 flex flex-col gap-4" style={{ width: "300px" }}>

          {/* ── Blue Gradient Card ── */}
          <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: "linear-gradient(180deg, #1a5276 0%, #2980b9 100%)" }}>

            {/* Avatar + Name + ID */}
            <div className="flex flex-col items-center pt-8 pb-4 px-5">
              <div className="relative mb-4">
                <div
                  className="w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl font-bold shadow-lg"
                  style={{ background: "rgba(255,255,255,0.15)", color: "white", borderColor: "rgba(255,255,255,0.8)" }}
                >
                  {getInitials(contact.name)}
                </div>
                <span
                  className="absolute bottom-1 right-1 w-5 h-5 rounded-full"
                  style={{ background: "#4caf50", borderWidth: "3px", borderStyle: "solid", borderColor: "white" }}
                />
              </div>
              <h2 className="text-white text-xl font-bold text-center leading-tight">{contact.name}</h2>
              <p className="text-xs mt-1 text-center" style={{ color: "rgba(255,255,255,0.7)" }}>
                Customer ID: #LVL-{paddedId}
              </p>
              <p className="text-xs mt-0.5 text-center" style={{ color: "rgba(255,255,255,0.7)" }}>
                Customer since{" "}
                <span style={{ color: "#f5a623", fontWeight: 600 }}>
                  {formatMonthYear(contact.createdAt)}
                </span>
              </p>

              {/* Action buttons */}
              <div className="flex gap-2 mt-5 w-full">
                <button
                  onClick={handleCallNow}
                  disabled={clickToCallMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 text-white text-xs font-semibold py-2.5 px-3 rounded-lg shadow-md disabled:opacity-60 transition-colors"
                  style={{ background: "#4caf50" }}
                >
                  <Phone size={14} />
                  {clickToCallMutation.isPending
                    ? "Calling…"
                    : contact.phone || "No phone"}
                </button>
                <button
                  onClick={() => {
                    if (!contact.email) { toast.error("No email address on file"); return; }
                    setEmailOpen((v) => !v);
                  }}
                  className="flex items-center justify-center gap-1.5 text-white text-xs font-semibold py-2.5 px-4 rounded-lg shadow-md transition-colors"
                  style={{ background: "#1565c0" }}
                >
                  <Mail size={14} />
                  Email
                </button>
              </div>
            </div>

            {/* Best Time to Contact */}
            <div className="px-5 pb-4 pt-2">
              <div
                className="inline-block rounded-full text-[10px] font-bold px-3 py-1 mb-3 uppercase tracking-wider"
                style={{ background: "#f5a623", color: "#1a3a5c" }}
              >
                Best Time to Contact
              </div>
              {contact.callbackAt ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-white font-bold" style={{ fontSize: "36px", lineHeight: 1 }}>
                      {new Date(contact.callbackAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                    Scheduled callback
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Not set</p>
              )}
            </div>

            {/* Last contact */}
            <div className="px-5 pb-5 flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              <Clock size={14} />
              {lastNote ? (
                <>
                  Last contact: {formatDate(lastNote.createdAt)}
                  {lastNote.agentName && (
                    <>
                      {" "}&bull;{" "}
                      <span style={{ color: "#f5a623", fontWeight: 500 }}>{lastNote.agentName}</span>
                    </>
                  )}
                </>
              ) : (
                "No previous contact"
              )}
            </div>
          </div>

          {/* ── Quick Contact Card ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quick Contact</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  if (!contact.phone) { toast.error("No phone number on file"); return; }
                  const num = contact.phone.replace(/\D/g, "");
                  window.open(`https://wa.me/${num}`, "_blank");
                }}
                disabled={!contact.phone}
                className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={() => {
                  if (!contact.email) { toast.error("No email address on file"); return; }
                  setEmailOpen((v) => !v);
                }}
                disabled={!contact.email}
                className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mail size={16} />
                Email
              </button>
              <button
                onClick={() => {
                  if (!contact.phone) { toast.error("No phone number on file"); return; }
                  window.open(`sms:${contact.phone}`);
                }}
                disabled={!contact.phone}
                className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageSquare size={16} />
                SMS
              </button>
            </div>
          </div>

          {/* ── White Info Card ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {/* Email */}
            {contact.email && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-sm text-gray-700">{contact.email}</p>
              </div>
            )}

            {/* Address */}
            {contact.address && (
              <div className="mb-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Shipping Address</p>
                <p className="text-sm text-gray-700 leading-relaxed">{contact.address}</p>
              </div>
            )}

            {/* Current Brand */}
            <div className={cn("pt-3 border-t border-gray-100", !contact.address && !contact.email && "pt-0 border-t-0")}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Current Brand</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {["Estée Lauder", "Clinique", "Lancôme", "Clarins", "Elemis", "L'Occitane", "No.7"].map((brand) => {
                  const selectedBrands: string[] = (() => {
                    try { return JSON.parse((contact as any).brands ?? "[]"); } catch { return []; }
                  })();
                  const isChecked = selectedBrands.includes(brand);
                  return (
                    <label
                      key={brand}
                      className={cn(
                        "flex items-center gap-1.5 cursor-pointer rounded px-1.5 py-1 text-xs select-none transition-colors",
                        isChecked
                          ? "bg-violet-50 text-violet-700 font-medium"
                          : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="accent-violet-600 w-3 h-3 shrink-0"
                        checked={isChecked}
                        onChange={() => {
                          const updated = isChecked
                            ? selectedBrands.filter((b) => b !== brand)
                            : [...selectedBrands, brand];
                          updateMutation.mutate({ id: contactId, brands: JSON.stringify(updated) });
                        }}
                      />
                      {brand}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Source & Agent */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
              {contact.source && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Source</span>
                  <span className="text-xs font-medium text-gray-700">{contact.source}</span>
                </div>
              )}
              {contact.agentName && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Agent</span>
                  <span className="text-xs font-medium text-gray-700">{contact.agentName}</span>
                </div>
              )}
              {contact.leadDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Lead Date</span>
                  <span className="text-xs font-medium text-gray-700">{formatDate(contact.leadDate)}</span>
                </div>
              )}
              {contact.department && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Department</span>
                  <span className="text-xs font-medium text-gray-700 capitalize">{contact.department}</span>
                </div>
              )}
            </div>



            {/* Integrations */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Integrations</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => syncToACMutation.mutate({ id: contactId })}
                  disabled={syncToACMutation.isPending}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-indigo-600 hover:bg-indigo-50 font-medium text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Tag size={13} />
                  {syncToACMutation.isPending ? "Syncing…" : "Sync to ActiveCampaign"}
                </button>
                <button
                  onClick={() => setTemplatePickerOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-amber-700 hover:bg-amber-50 font-medium text-xs transition-colors"
                >
                  <Mail size={13} />
                  Send Email Template
                </button>
              </div>
            </div>

            {/* Starter Kit Selector */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Starter Kit</p>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                value={contact.trialKit || ""}
                onChange={(e) => updateMutation.mutate({ id: contactId, trialKit: e.target.value || undefined })}
              >
                <option value="">Select kit...</option>
                <option value="Starter Kit Ashkara">Starter Kit Ashkara</option>
                <option value="Starter Kit Oulala">Starter Kit Oulala</option>
              </select>
              {contact.trialKit && (
                <button
                  onClick={() => alert("Coming soon")}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white font-semibold text-xs transition-colors shadow-sm"
                  style={{ background: "#1565c0" }}
                >
                  Create Subscription
                </button>
              )}
            </div>

            {/* Imported Notes */}
            {contact.importedNotes && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Imported Notes</p>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-gray-700 leading-relaxed">
                  {contact.importedNotes}
                </div>
              </div>
            )}

            {/* Skin Info */}
            {(contact.skinType || contact.concern || contact.routine) && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Skin Profile</p>
                <div className="flex flex-col gap-1.5">
                  {contact.skinType && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Skin Type</span>
                      <span className="text-xs font-medium text-gray-700">{contact.skinType}</span>
                    </div>
                  )}
                  {contact.concern && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Concern</span>
                      <span className="text-xs font-medium text-gray-700">{contact.concern}</span>
                    </div>
                  )}
                  {contact.routine && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Routine</span>
                      <span className="text-xs font-medium text-gray-700">{contact.routine}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
                )}
              >
                <Clock size={16} />
                History
              </button>
              <button
                onClick={() => setCenterTopTab("transactions")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  centerTopTab === "transactions"
                    ? "text-blue-700 border-blue-700 font-semibold"
                    : "text-gray-500 border-transparent hover:text-gray-700"
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
                )}
              >
                <FileText size={16} />
                Notes
              </button>
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
                  className="min-h-[88px] text-sm resize-none border-gray-200 text-gray-800 placeholder:text-gray-400 bg-white focus-visible:ring-blue-400"
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
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="p-6">
              {/* History tab */}
              {centerTopTab === "history" && (
                <div className="flex flex-col">
                  {contact.callNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <PhoneOff size={36} className="mb-3 opacity-50" />
                      <p className="text-sm font-medium">No call notes yet</p>
                      <p className="text-xs mt-1">Click "+ Add Entry" to log your first call</p>
                    </div>
                  ) : (
                    contact.callNotes.map((note, idx) => {
                      const outcome = NOTE_OUTCOMES[note.statusAtTime ?? "other"] ?? NOTE_OUTCOMES.other;
                      const agentInitials = note.agentName
                        ? note.agentName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                        : "??";
                      const isLast = idx === contact.callNotes.length - 1;
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
                                  <span className="text-xs text-gray-500">{formatDate(note.createdAt)}</span>
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
                                {/* Full note text */}
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{note.note}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Transactions tab */}
              {centerTopTab === "transactions" && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <CreditCard size={36} className="mb-3 opacity-40" />
                  <p className="text-sm font-medium">Transactions</p>
                  <p className="text-xs mt-1">Coming soon — transaction data will appear here</p>
                </div>
              )}

              {/* Shipments tab */}
              {centerTopTab === "shipments" && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Archive size={36} className="mb-3 opacity-40" />
                  <p className="text-sm font-medium">Shipments</p>
                  <p className="text-xs mt-1">Coming soon — shipment tracking will appear here</p>
                </div>
              )}

              {/* Notes tab */}
              {centerTopTab === "notes" && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <FileText size={36} className="mb-3 opacity-40" />
                  <p className="text-sm font-medium">Notes</p>
                  <p className="text-xs mt-1">Use the History tab to view and add call notes</p>
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
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
                    : "text-gray-500 border-transparent hover:text-gray-700"
                )}
              >
                Data Privacy
              </button>
            </div>

            {/* Sub-tab content */}
            <div className="p-5">
              {/* Documents */}
              {centerBottomTab === "documents" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FileText size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No documents uploaded yet</p>
                </div>
              )}

              {/* Activities */}
              {centerBottomTab === "activities" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Activity size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No recent activities to display</p>
                </div>
              )}

              {/* CloudTalk History */}
              {centerBottomTab === "cloudtalk" && (
                <div>
                  {!contact.phone ? (
                    <div className="flex flex-col items-center py-12 text-gray-400">
                      <PhoneOff size={28} className="mb-2 opacity-40" />
                      <p className="text-sm">No phone number on file</p>
                    </div>
                  ) : historyLoading ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      Loading call history…
                    </div>
                  ) : !cloudTalkHistory || cloudTalkHistory.calls.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-gray-400">
                      <PhoneOff size={28} className="mb-2 opacity-40" />
                      <p className="text-sm">No CloudTalk calls found for this number</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-gray-400 mb-1">
                        {cloudTalkHistory.totalCount} total calls
                      </p>
                      {cloudTalkHistory.calls.map((call) => {
                        const isAnswered = call.status === "answered";
                        const durationSec = call.call_times?.talking_time ?? 0;
                        const mins = Math.floor(durationSec / 60);
                        const secs = durationSec % 60;
                        const b64 = audioData[call.cdr_id];
                        return (
                          <div key={call.cdr_id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
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
                                      <span className="text-xs text-gray-500">{mins}m {secs}s</span>
                                    )}
                                    {call.agent?.name && (
                                      <span className="text-xs text-gray-500">· {call.agent.name}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {call.date ? new Date(call.date).toLocaleString("en-GB") : ""}
                                  </p>
                                </div>
                              </div>
                              {call.recorded && (
                                <button
                                  onClick={() => {
                                    if (b64) {
                                      setAudioData((prev) => { const n = {...prev}; delete n[call.cdr_id]; return n; });
                                    } else {
                                      streamRecordingMutation.mutate({ callId: call.cdr_id });
                                    }
                                  }}
                                  disabled={streamRecordingMutation.isPending}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 disabled:opacity-50"
                                >
                                  {streamRecordingMutation.isPending && !b64 ? (
                                    <div className="w-3 h-3 border border-blue-400 border-t-blue-700 rounded-full animate-spin" />
                                  ) : b64 ? (
                                    <span>Hide</span>
                                  ) : (
                                    <span>▶ Play</span>
                                  )}
                                </button>
                              )}
                            </div>
                            {b64 && (
                              <audio
                                controls
                                className="w-full mt-2 h-8"
                                src={`data:audio/wav;base64,${b64}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Data Privacy */}
              {centerBottomTab === "privacy" && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
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

          {/* ── KPI Cards (2 side by side) ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* LTV */}
            <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center text-center border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#e3f2fd" }}>
                <svg className="w-5 h-5" style={{ color: "#1565c0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">LTV</p>
              <p className="font-bold mt-0.5 text-gray-400" style={{ fontSize: "22px" }}>—</p>
            </div>

            {/* Cycle */}
            <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center text-center border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#e3f2fd" }}>
                <svg className="w-5 h-5" style={{ color: "#1565c0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Cycle</p>
              <p className="font-bold mt-0.5 text-gray-400" style={{ fontSize: "22px" }}>—</p>
            </div>
          </div>

          {/* ── Risk Score ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-gray-600" />
                <span className="text-sm font-bold text-gray-800">Risk Score</span>
              </div>
            </div>
            <p className="text-xs text-gray-400">No data yet</p>
          </div>

          {/* ── Products History ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={18} style={{ color: "#1565c0" }} />
              <span className="text-sm font-bold" style={{ color: "#1565c0" }}>Products History</span>
            </div>
            {contact.trialKit ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#1565c0" }} />
                    <span className="text-sm text-gray-800">{contact.trialKit}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "#1565c0" }}>Current</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No products recorded</p>
            )}
          </div>

          {/* ── Cancellation History ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} style={{ color: "#e65100" }} />
              <span className="text-sm font-bold text-gray-800">Cancellation History</span>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: "#fff0ee" }}>
              <p className="text-xs text-gray-500">No cancellation attempts</p>
            </div>
          </div>

          {/* ── Assigned Team ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User size={18} className="text-gray-600" />
              <span className="text-sm font-bold text-gray-800">Assigned Team</span>
            </div>
            {contact.agentName ? (
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#e3f2fd" }}>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                  style={{ background: "#1565c0" }}
                >
                  {getInitials(contact.agentName)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{contact.agentName}</p>
                  <p className="text-xs text-gray-500">
                    {contact.department ? `${contact.department.charAt(0).toUpperCase() + contact.department.slice(1)} Agent` : "Agent"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No agent assigned</p>
            )}
          </div>

          {/* ── Call Stats (if notes exist) ── */}
          {contact.callNotes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Call Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-700">{contact.callNotes.length}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Total Calls</p>
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
              className="text-sm bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus-visible:ring-blue-400"
            />
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Write your message here…"
              className="min-h-[140px] text-sm resize-none bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus-visible:ring-blue-400"
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
                  ? <span className="ml-2 text-gray-400">&lt;{contact.email}&gt;</span>
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
                <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
              )}
              {!templatesLoading && (!emailTemplates || emailTemplates.length === 0) && (
                <div className="text-sm text-gray-400 text-center py-8">No templates yet</div>
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
                    <p className="text-xs text-gray-400 mt-1 truncate italic">{tpl.subject}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Preview */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
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
            <p className="text-xs text-gray-400">
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
    </>
  );
}
