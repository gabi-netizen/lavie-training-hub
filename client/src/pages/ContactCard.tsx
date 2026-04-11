/**
 * ContactCard — Full-page CRM customer card
 * Route: /contacts/:id
 * Design: Light/white background, professional CRM layout (HubSpot-style)
 * Layout: Left sidebar (identity) | Main area (log call + history) | Right panel (actions + info)
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
  PhoneMissed,
  Voicemail,
  Clock,
  Tag,
  CheckCircle2,
  PhoneOff,
  ChevronDown,
  MessageSquare,
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
  "Other": "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_COLOURS: Record<string, string> = {
  new: "bg-gray-100 text-gray-600 border-gray-200",
  open: "bg-blue-100 text-blue-700 border-blue-200",
  working: "bg-amber-100 text-amber-700 border-amber-200",
  assigned: "bg-purple-100 text-purple-700 border-purple-200",
  done_deal: "bg-green-100 text-green-700 border-green-200",
  retained_sub: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled_sub: "bg-red-100 text-red-700 border-red-200",
  closed: "bg-gray-100 text-gray-500 border-gray-200",
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

const NOTE_OUTCOMES: Record<string, { dot: string; label: string }> = {
  connected:  { dot: "bg-blue-500",    label: "Connected" },
  sale:       { dot: "bg-green-500",   label: "Sale" },
  follow_up:  { dot: "bg-amber-500",   label: "Follow-up" },
  no_answer:  { dot: "bg-red-400",     label: "No Answer" },
  voicemail:  { dot: "bg-indigo-400",  label: "Voicemail" },
  callback:   { dot: "bg-purple-400",  label: "Callback" },
  other:      { dot: "bg-gray-400",    label: "Note" },
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

// ─── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = "lg" }: { name: string; size?: "sm" | "lg" }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const dim = size === "lg" ? "w-16 h-16 text-xl" : "w-8 h-8 text-sm";
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold bg-indigo-100 text-indigo-600", dim)}>
      {initials}
    </div>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────────
function Chip({ label, colour }: { label: string; colour: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", colour)}>
      {label}
    </span>
  );
}

// ─── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, value }: { icon: React.ElementType; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5 text-sm text-gray-600">
      <Icon size={14} className="text-gray-400 shrink-0" />
      <span className="truncate">{value}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ContactCard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const contactId = parseInt(id ?? "0", 10);

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
      refetch();
      toast.success("Note saved");
    },
  });

  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("connected");
  const [statusOpen, setStatusOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading contact…</p>
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 font-medium mb-2">Contact not found</p>
          <button
            onClick={() => navigate("/contacts")}
            className="text-sm text-indigo-600 hover:underline"
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
    const iframe = document.querySelector<HTMLIFrameElement>("iframe[src*='cloudtalk']");
    if (iframe?.contentWindow && contact.phone) {
      iframe.contentWindow.postMessage(
        { event: "dial", properties: { phone_number: contact.phone } },
        "*"
      );
      toast.success(`Dialling ${contact.phone}…`);
    } else if (contact.phone) {
      window.open(`tel:${contact.phone}`);
    } else {
      toast.error("No phone number on file");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top breadcrumb bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/contacts")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Contacts
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-800">{contact.name}</span>
      </div>

      {/* ── 3-column body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] h-[calc(100vh-112px)]">

        {/* ══════════════════════════════════════════════════
            LEFT — Identity panel
        ══════════════════════════════════════════════════ */}
        <aside className="bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="flex justify-center mb-3">
              <Avatar name={contact.name} size="lg" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">{contact.name}</h1>

            {/* Badges */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {contact.leadType && (
                <Chip
                  label={contact.leadType}
                  colour={LEAD_TYPE_COLOURS[contact.leadType] ?? "bg-gray-100 text-gray-600 border-gray-200"}
                />
              )}

              {/* Status with dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusOpen((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity",
                    STATUS_COLOURS[contact.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                  )}
                >
                  {STATUS_LABELS[contact.status] ?? contact.status}
                  <ChevronDown size={10} />
                </button>
                {statusOpen && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
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
            </div>
          </div>

          {/* Contact details */}
          <div className="p-5 flex flex-col gap-3 border-b border-gray-100">
            <InfoRow icon={Phone} value={contact.phone} />
            <InfoRow icon={Mail} value={contact.email} />
            <InfoRow icon={Tag} value={contact.source ? `Source: ${contact.source}` : null} />
            <InfoRow icon={User} value={contact.agentName ? `Agent: ${contact.agentName}` : null} />
            <InfoRow
              icon={Calendar}
              value={contact.leadDate ? `Lead: ${new Date(contact.leadDate).toLocaleDateString("en-GB")}` : null}
            />
          </div>

          {/* Callback */}
          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Callback</p>
            {contact.callbackAt ? (
              <p className="text-sm font-medium text-amber-600">
                {new Date(contact.callbackAt).toLocaleString("en-GB")}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Not scheduled</p>
            )}
          </div>

          {/* Call stats */}
          {contact.callNotes.length > 0 && (
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{contact.callNotes.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">Calls</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {contact.callNotes.filter((n) => n.statusAtTime === "sale").length}
                </p>
                <p className="text-xs text-green-500 mt-0.5">Sales</p>
              </div>
            </div>
          )}

          <p className="px-5 pb-4 text-xs text-gray-300 mt-auto">
            Added {new Date(contact.createdAt).toLocaleDateString("en-GB")}
          </p>
        </aside>

        {/* ══════════════════════════════════════════════════
            MIDDLE — Log call + History
        ══════════════════════════════════════════════════ */}
        <main className="flex flex-col overflow-hidden bg-gray-50">

          {/* Log call form */}
          <div className="bg-white border-b border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Log this call</p>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What happened? Key objections, outcome, next steps…"
              className="min-h-[88px] text-sm resize-none border-gray-200 text-gray-800 placeholder:text-gray-400 bg-white focus-visible:ring-indigo-400"
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5"
              >
                Save Note
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Call History &amp; Notes
              {contact.callNotes.length > 0 && (
                <span className="ml-1.5 text-gray-300">({contact.callNotes.length})</span>
              )}
            </p>

            {contact.callNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <PhoneOff size={36} className="mb-3 opacity-50" />
                <p className="text-sm font-medium">No call notes yet</p>
                <p className="text-xs mt-1">Log your first call above</p>
              </div>
            ) : (
              contact.callNotes.map((note) => {
                const outcome = NOTE_OUTCOMES[note.statusAtTime ?? "other"] ?? NOTE_OUTCOMES.other;
                return (
                  <div
                    key={note.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4 shadow-sm"
                  >
                    {/* Dot + line */}
                    <div className="flex flex-col items-center pt-1.5 shrink-0">
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", outcome.dot)} />
                      <div className="w-px flex-1 bg-gray-100 mt-2" />
                    </div>
                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs text-gray-400">
                          {new Date(note.createdAt).toLocaleString("en-GB")}
                        </span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium border",
                          note.statusAtTime === "sale"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : note.statusAtTime === "connected"
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : note.statusAtTime === "no_answer"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          {outcome.label}
                        </span>
                        {note.agentName && (
                          <span className="text-xs text-gray-400">· {note.agentName}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{note.note}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>

        {/* ══════════════════════════════════════════════════
            RIGHT — Actions + Lead info
        ══════════════════════════════════════════════════ */}
        <aside className="bg-white border-l border-gray-200 flex flex-col overflow-y-auto">

          {/* Quick Actions */}
          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Actions</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCallNow}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors shadow-sm"
              >
                <Phone size={15} />
                Call Now
                {contact.phone && (
                  <span className="ml-auto text-xs font-mono opacity-80 truncate max-w-[90px]">
                    {contact.phone}
                  </span>
                )}
              </button>
              <button
                onClick={() => contact.email && window.open(`mailto:${contact.email}`)}
                disabled={!contact.email}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mail size={15} />
                Send Email
              </button>
            </div>
          </div>

          {/* Lead Info */}
          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Lead Info</p>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Lead Type",  value: contact.leadType },
                { label: "Source",     value: contact.source },
                { label: "Lead Date",  value: contact.leadDate ? new Date(contact.leadDate).toLocaleDateString("en-GB") : null },
                { label: "Status",     value: STATUS_LABELS[contact.status] ?? contact.status },
                { label: "Agent",      value: contact.agentName },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-2">
                  <span className="text-xs text-gray-400 shrink-0">{label}</span>
                  <span className="text-xs text-gray-700 text-right font-medium">
                    {value ?? <span className="text-gray-300 italic">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Imported Notes */}
          {contact.importedNotes && (
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Imported Notes</p>
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-gray-700 leading-relaxed border-l-4 border-l-amber-400">
                {contact.importedNotes}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
