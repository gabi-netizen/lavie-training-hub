/**
 * ContactCard — Full-page CRM customer card
 * Route: /contacts/:id
 * Layout: 3 columns — Identity | Call History | Quick Actions + Lead Info
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  User,
  Calendar,
  ArrowLeft,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Voicemail,
  Clock,
  Tag,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Colour helpers ────────────────────────────────────────────────────────────
const LEAD_TYPE_COLOURS: Record<string, string> = {
  "Pre Cycle": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Pre-Cycle-Cancelled": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Pre-Cycle-Decline": "bg-red-500/20 text-red-300 border-red-500/30",
  "Cycle 1": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "Cycle 2": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Cycle 3+": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Cancel 2+ Cycle": "bg-red-600/20 text-red-300 border-red-600/30",
  "Live Sub 3 Days": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Live Sub 7 Days": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Live Sub 14days+": "bg-green-500/20 text-green-300 border-green-500/30",
  "Live Sub 2nd+": "bg-green-600/20 text-green-300 border-green-600/30",
  "Live Sub Declined 2nd+": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "Owned Sub": "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "Same day as charge cancel": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "Warm lead": "bg-lime-500/20 text-lime-300 border-lime-500/30",
  "Other": "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const STATUS_COLOURS: Record<string, string> = {
  new: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  open: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  working: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  assigned: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  done_deal: "bg-green-500/20 text-green-300 border-green-500/30",
  retained_sub: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cancelled_sub: "bg-red-500/20 text-red-300 border-red-500/30",
  closed: "bg-slate-600/20 text-slate-400 border-slate-600/30",
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

const NOTE_TYPE_COLOURS: Record<string, { dot: string; label: string }> = {
  connected: { dot: "bg-green-400", label: "Connected" },
  sale: { dot: "bg-emerald-400", label: "Sale" },
  follow_up: { dot: "bg-amber-400", label: "Follow-up" },
  no_answer: { dot: "bg-red-400", label: "No Answer" },
  voicemail: { dot: "bg-blue-400", label: "Voicemail" },
  callback: { dot: "bg-purple-400", label: "Callback" },
  other: { dot: "bg-slate-400", label: "Note" },
};

const NOTE_TYPES = [
  { value: "connected", label: "Connected", icon: PhoneCall },
  { value: "sale", label: "Sale", icon: CheckCircle2 },
  { value: "follow_up", label: "Follow-up", icon: Clock },
  { value: "no_answer", label: "No Answer", icon: PhoneMissed },
  { value: "voicemail", label: "Voicemail", icon: Voicemail },
  { value: "callback", label: "Callback", icon: Calendar },
  { value: "other", label: "Note", icon: PhoneOff },
];

const ALL_STATUSES = [
  "new", "open", "working", "assigned", "done_deal", "retained_sub", "cancelled_sub", "closed"
] as const;

// ─── Initials avatar ───────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto"
      style={{ background: "oklch(0.72 0.19 180 / 0.2)", color: "oklch(0.72 0.19 180)" }}
    >
      {initials}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ContactCard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const contactId = parseInt(id ?? "0", 10);

  const { data: contact, refetch } = trpc.contacts.get.useQuery(
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
      refetch();
      toast.success("Note saved");
    },
  });

  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("connected");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40">
        Loading contact...
      </div>
    );
  }

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: contactId, status: newStatus as any });
    toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
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
    // Send postMessage to CloudTalk iframe if it exists
    const iframe = document.querySelector<HTMLIFrameElement>("iframe[src*='cloudtalk']");
    if (iframe?.contentWindow && contact.phone) {
      iframe.contentWindow.postMessage(
        { event: "dial", properties: { phone_number: contact.phone } },
        "*"
      );
      toast.success(`Dialling ${contact.phone}...`);
    } else if (contact.phone) {
      window.open(`tel:${contact.phone}`);
    } else {
      toast.error("No phone number on file");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.11 0.02 240)" }}>
      {/* ── Breadcrumb header ── */}
      <div
        className="flex items-center gap-3 px-6 py-3 border-b border-white/10"
        style={{ background: "oklch(0.13 0.03 240)" }}
      >
        <button
          onClick={() => navigate("/contacts")}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Contacts
        </button>
        <span className="text-white/20">/</span>
        <span className="text-sm text-white/80 font-medium">{contact.name}</span>
      </div>

      {/* ── 3-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-0 h-[calc(100vh-112px)]">

        {/* ══════════════════════════════════════════════════════════════
            LEFT COLUMN — Identity
        ══════════════════════════════════════════════════════════════ */}
        <div
          className="flex flex-col gap-5 p-5 border-r border-white/10 overflow-y-auto"
          style={{ background: "oklch(0.13 0.03 240)" }}
        >
          {/* Avatar + name */}
          <div className="text-center pt-2">
            <Avatar name={contact.name} />
            <h1 className="mt-3 text-xl font-bold text-white">{contact.name}</h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              {contact.leadType && (
                <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", LEAD_TYPE_COLOURS[contact.leadType] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30")}>
                  {contact.leadType}
                </span>
              )}
              {/* Status badge with dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusDropdownOpen((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-opacity hover:opacity-80",
                    STATUS_COLOURS[contact.status] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30"
                  )}
                >
                  {STATUS_LABELS[contact.status] ?? contact.status}
                  <ChevronDown size={10} />
                </button>
                {statusDropdownOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 w-40 rounded-lg border border-white/10 shadow-xl py-1 z-50"
                    style={{ background: "oklch(0.16 0.03 240)" }}
                  >
                    {ALL_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleStatusChange(s); setStatusDropdownOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors",
                          contact.status === s ? "text-white font-semibold" : "text-white/60"
                        )}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-white/10" />

          {/* Contact details */}
          <div className="flex flex-col gap-3">
            {contact.phone && (
              <div className="flex items-center gap-3">
                <Phone size={14} className="text-white/30 shrink-0" />
                <span className="text-sm text-white/80 font-mono">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-3">
                <Mail size={14} className="text-white/30 shrink-0" />
                <span className="text-sm text-white/70 truncate">{contact.email}</span>
              </div>
            )}
            {contact.source && (
              <div className="flex items-center gap-3">
                <Tag size={14} className="text-white/30 shrink-0" />
                <span className="text-sm text-white/60">Source: {contact.source}</span>
              </div>
            )}
            {contact.agentName && (
              <div className="flex items-center gap-3">
                <User size={14} className="text-white/30 shrink-0" />
                <span className="text-sm text-white/60">Agent: {contact.agentName}</span>
              </div>
            )}
            {contact.leadDate && (
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-white/30 shrink-0" />
                <span className="text-sm text-white/60">
                  Lead date: {new Date(contact.leadDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Callback */}
          <div className="rounded-lg border border-white/10 p-3" style={{ background: "oklch(0.15 0.03 240)" }}>
            <p className="text-xs text-white/40 mb-2 font-medium uppercase tracking-wide">Callback</p>
            {contact.callbackAt ? (
              <p className="text-sm text-amber-300 font-medium">
                {new Date(contact.callbackAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-white/30 italic">Not scheduled</p>
            )}
          </div>

          {/* Created */}
          <p className="text-xs text-white/25 text-center">
            Added {new Date(contact.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            MIDDLE COLUMN — Call History & Notes
        ══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col overflow-hidden">
          {/* Log call form */}
          <div
            className="p-5 border-b border-white/10"
            style={{ background: "oklch(0.13 0.03 240)" }}
          >
            <p className="text-sm font-semibold text-white/70 mb-3">Log this call</p>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What happened on this call? Key objections, outcome, next steps..."
              className="min-h-[90px] text-sm resize-none border-white/10 text-white placeholder:text-white/25"
              style={{ background: "oklch(0.16 0.03 240)" }}
            />
            <div className="flex items-center gap-3 mt-3">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger
                  className="w-44 text-sm border-white/10 text-white"
                  style={{ background: "oklch(0.16 0.03 240)" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "oklch(0.16 0.03 240)", borderColor: "rgba(255,255,255,0.1)" }}>
                  {NOTE_TYPES.map(({ value, label, icon: Icon }) => (
                    <SelectItem key={value} value={value} className="text-white/80">
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
                className="font-semibold"
                style={{ background: "oklch(0.72 0.19 180)", color: "#0F1923" }}
              >
                Save Note
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">
              Call History &amp; Notes
              {contact.callNotes.length > 0 && (
                <span className="ml-2 text-white/25">({contact.callNotes.length})</span>
              )}
            </p>

            {contact.callNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/25">
                <PhoneOff size={32} className="mb-3 opacity-40" />
                <p className="text-sm">No call notes yet</p>
                <p className="text-xs mt-1">Log your first call above</p>
              </div>
            ) : (
              contact.callNotes.map((note) => {
                const typeInfo = NOTE_TYPE_COLOURS[note.statusAtTime ?? "other"] ?? NOTE_TYPE_COLOURS.other;
                return (
                  <div
                    key={note.id}
                    className="rounded-xl border border-white/8 p-4 flex gap-4"
                    style={{ background: "oklch(0.14 0.025 240)" }}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center pt-1 shrink-0">
                      <div className={cn("w-2.5 h-2.5 rounded-full", typeInfo.dot)} />
                      <div className="w-px flex-1 bg-white/10 mt-2" />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-white/40">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", typeInfo.dot.replace("bg-", "bg-").replace("-400", "-400/20"), "text-white/70")}>
                          {typeInfo.label}
                        </span>
                        {note.agentName && (
                          <span className="text-xs text-white/40">· {note.agentName}</span>
                        )}
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">{note.note}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            RIGHT COLUMN — Quick Actions + Lead Info
        ══════════════════════════════════════════════════════════════ */}
        <div
          className="flex flex-col gap-5 p-5 border-l border-white/10 overflow-y-auto"
          style={{ background: "oklch(0.13 0.03 240)" }}
        >
          {/* Quick Actions */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Quick Actions</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCallNow}
                className="w-full justify-start gap-2 font-semibold"
                style={{ background: "oklch(0.55 0.18 145)", color: "white" }}
              >
                <Phone size={15} />
                Call Now
                {contact.phone && (
                  <span className="ml-auto text-xs font-mono opacity-70 truncate max-w-[100px]">
                    {contact.phone}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                onClick={() => contact.email && window.open(`mailto:${contact.email}`)}
                disabled={!contact.email}
              >
                <Mail size={15} />
                Send Email
              </Button>
            </div>
          </div>

          <div className="border-t border-white/10" />

          {/* Lead Info */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Lead Info</p>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Lead Type", value: contact.leadType },
                { label: "Source", value: contact.source },
                { label: "Lead Date", value: contact.leadDate ? new Date(contact.leadDate).toLocaleDateString() : null },
                { label: "Status", value: STATUS_LABELS[contact.status] ?? contact.status },
                { label: "Agent", value: contact.agentName },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-2">
                  <span className="text-xs text-white/35 shrink-0">{label}</span>
                  <span className="text-xs text-white/75 text-right font-medium">
                    {value ?? <span className="text-white/20 italic">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Imported Notes */}
          {contact.importedNotes && (
            <>
              <div className="border-t border-white/10" />
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">Imported Notes</p>
                <div
                  className="rounded-lg p-3 text-sm text-white/65 leading-relaxed border-l-2"
                  style={{ background: "oklch(0.15 0.03 240)", borderLeftColor: "oklch(0.72 0.19 180 / 0.5)" }}
                >
                  {contact.importedNotes}
                </div>
              </div>
            </>
          )}

          {/* Call stats */}
          {contact.callNotes.length > 0 && (
            <>
              <div className="border-t border-white/10" />
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Call Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.15 0.03 240)" }}>
                    <p className="text-xl font-bold text-white">{contact.callNotes.length}</p>
                    <p className="text-xs text-white/40 mt-0.5">Total Calls</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.15 0.03 240)" }}>
                    <p className="text-xl font-bold text-emerald-400">
                      {contact.callNotes.filter((n) => n.statusAtTime === "sale").length}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">Sales</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
