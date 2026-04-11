/*
  CLOUDTALK DIALLER PAGE — Light Theme
  - Embeds CloudTalk Phone via iframe (phone.cloudtalk.io)
  - Listens to postMessage events: ringing, dialing, calling, hangup, ended, contact_info
  - Shows a contact card panel that auto-opens when a call starts
  - Click-to-call: sends postMessage to CloudTalk iframe to dial a number
  - Quick contacts search panel in idle state
*/
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  User,
  Building2,
  Clock,
  FileText,
  Mic,
  Loader2,
  Search,
  ContactRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type CallStatus = "idle" | "ringing" | "dialing" | "active" | "ended";

interface ContactInfo {
  id?: number;
  name?: string;
  company?: string;
  contact_emails?: string[];
  contact_numbers?: string[];
  tags?: string[];
}

interface CallEvent {
  event: string;
  properties: {
    call_uuid?: string;
    external_number?: string;
    internal_number?: string;
    contact?: ContactInfo;
  };
}

interface CallSession {
  uuid: string;
  externalNumber: string;
  internalNumber: string;
  contact: ContactInfo | null;
  startedAt: Date;
  status: CallStatus;
  notes: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatDuration(startedAt: Date): string {
  const secs = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatNumber(num: string): string {
  return num?.replace(/\s+/g, " ").trim() ?? "—";
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function CallStatusBadge({ status }: { status: CallStatus }) {
  const config = {
    idle:    { label: "Ready",       color: "bg-gray-100 text-gray-800 border border-gray-200",                   icon: <Phone className="w-3 h-3" /> },
    ringing: { label: "Incoming",    color: "bg-amber-50 text-amber-700 border border-amber-200",                  icon: <Phone className="w-3 h-3 animate-bounce" /> },
    dialing: { label: "Dialling…",   color: "bg-blue-50 text-blue-700 border border-blue-200",                    icon: <PhoneCall className="w-3 h-3 animate-pulse" /> },
    active:  { label: "On Call",     color: "bg-emerald-50 text-emerald-700 border border-emerald-200",            icon: <Mic className="w-3 h-3 animate-pulse" /> },
    ended:   { label: "Call Ended",  color: "bg-gray-100 text-gray-700 border border-gray-200",                   icon: <PhoneOff className="w-3 h-3" /> },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ─── LEAD TYPE BADGE ──────────────────────────────────────────────────────────
function LeadTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const t = type.toLowerCase();
  let cls = "bg-gray-100 text-gray-700";
  if (t.includes("pre cycle") || t.includes("pre-cycle")) cls = "bg-amber-100 text-amber-800";
  else if (t.includes("live sub")) cls = "bg-emerald-100 text-emerald-800";
  else if (t.includes("cancel") || t.includes("declined")) cls = "bg-rose-100 text-rose-800";
  else if (t.includes("cycle 1")) cls = "bg-sky-100 text-sky-800";
  else if (t.includes("cycle 2")) cls = "bg-indigo-100 text-indigo-800";
  else if (t.includes("cycle 3")) cls = "bg-violet-100 text-violet-800";
  else if (t.includes("warm")) cls = "bg-orange-100 text-orange-800";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {type}
    </span>
  );
}

// ─── CONTACT CARD (active call) ───────────────────────────────────────────────
function ContactCard({
  session,
  onNotesChange,
  elapsed,
}: {
  session: CallSession;
  onNotesChange: (notes: string) => void;
  elapsed: string;
}) {
  const contact = session.contact;
  const initials = contact?.name
    ? contact.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : session.externalNumber.slice(-2);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 font-semibold text-base truncate">
              {contact?.name ?? formatNumber(session.externalNumber)}
            </h3>
            {contact?.company && (
              <p className="text-gray-700 text-xs flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3" />
                {contact.company}
              </p>
            )}
          </div>
          <CallStatusBadge status={session.status} />
        </div>
        {/* Call meta */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-800">
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {formatNumber(session.externalNumber)}
          </span>
          {session.status === "active" && (
            <span className="flex items-center gap-1 text-emerald-600 font-mono">
              <Clock className="w-3 h-3" />
              {elapsed}
            </span>
          )}
        </div>
        {/* Tags */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.map((tag) => (
              <Badge key={tag} className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Contact details */}
      {contact && (
        <div className="p-4 border-b border-gray-100 space-y-2">
          {contact.contact_numbers && contact.contact_numbers.length > 1 && (
            <div>
              <p className="text-[10px] text-gray-800 uppercase tracking-wide mb-1">Other Numbers</p>
              {contact.contact_numbers.filter(n => n !== session.externalNumber).map((n) => (
                <p key={n} className="text-gray-700 text-sm">{formatNumber(n)}</p>
              ))}
            </div>
          )}
          {contact.contact_emails && contact.contact_emails.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-800 uppercase tracking-wide mb-1">Email</p>
              {contact.contact_emails.map((e) => (
                <p key={e} className="text-gray-700 text-sm truncate">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-800 uppercase tracking-wide">
          <FileText className="w-3 h-3" />
          Call Notes
        </div>
        <Textarea
          value={session.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Type notes during the call… they'll be saved automatically."
          className="flex-1 min-h-[120px] bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-800 text-sm resize-none focus:border-indigo-400"
        />
        <p className="text-[10px] text-gray-800">Notes are saved locally for this session.</p>
      </div>
    </div>
  );
}

// ─── CALL HISTORY ITEM ────────────────────────────────────────────────────────
function CallHistoryItem({ session }: { session: CallSession }) {
  const statusIcon = {
    ended:   <PhoneOff className="w-3 h-3 text-gray-800" />,
    active:  <PhoneCall className="w-3 h-3 text-emerald-500" />,
    idle:    <Phone className="w-3 h-3 text-gray-800" />,
    ringing: <Phone className="w-3 h-3 text-amber-500" />,
    dialing: <PhoneCall className="w-3 h-3 text-blue-500" />,
  }[session.status];
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className="text-gray-700 text-xs truncate">
          {session.contact?.name ?? formatNumber(session.externalNumber)}
        </p>
        <p className="text-gray-800 text-[10px]">
          {session.startedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      {session.notes && (
        <FileText className="w-3 h-3 text-gray-800 flex-shrink-0" />
      )}
    </div>
  );
}

// ─── QUICK CONTACTS PANEL ─────────────────────────────────────────────────────
function QuickContactsPanel({ onDial }: { onDial: (phone: string, name: string) => void }) {
  const [search, setSearch] = useState("");
  const { data: contacts = [], isLoading } = trpc.contacts.list.useQuery(
    { search: search || undefined, limit: 20 },
    { enabled: true }
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-gray-700 text-sm">
          <ContactRound className="w-4 h-4" />
          <span>Quick Dial</span>
        </div>
        <Link href="/contacts">
          <button className="text-[10px] text-indigo-600 hover:text-indigo-800 transition-colors">
            Manage Contacts →
          </button>
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-800" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-7 h-8 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-800 text-xs"
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-gray-800 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-800 text-xs gap-2">
            <User className="w-6 h-6" />
            {search ? "No contacts match" : "No contacts yet — import a CSV"}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contacts.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-indigo-700">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-800 text-xs font-medium truncate">{c.name}</span>
                    <LeadTypeBadge type={c.leadType} />
                  </div>
                  {c.phone && (
                    <span className="text-gray-800 text-[10px] font-mono">{c.phone}</span>
                  )}
                </div>
                {c.phone && (
                  <button
                    onClick={() => onDial(c.phone, c.name)}
                    className="w-7 h-7 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-colors flex-shrink-0"
                    title={`Call ${c.name}`}
                  >
                    <Phone className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN DIALLER ─────────────────────────────────────────────────────────────
export default function Dialler() {
  const { isAuthenticated, loading } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<CallSession[]>([]);
  const [elapsed, setElapsed] = useState("00:00");
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Keep ref in sync for use in event handler
  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  // Elapsed timer
  useEffect(() => {
    if (callStatus === "active" && currentSession) {
      elapsedRef.current = setInterval(() => {
        setElapsed(formatDuration(currentSession.startedAt));
      }, 1000);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (callStatus !== "active") setElapsed("00:00");
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [callStatus, currentSession]);

  // CloudTalk postMessage listener
  const CLOUDTALK_ORIGINS = [
    "https://phone.cloudtalk.io",
    "https://my.cloudtalk.io",
    "https://app.cloudtalk.io",
  ];

  const handleMessage = useCallback((e: MessageEvent) => {
    if (!CLOUDTALK_ORIGINS.some(o => e.origin === o || e.origin.endsWith(".cloudtalk.io"))) {
      return;
    }
    let eventData: CallEvent;
    try {
      eventData = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }

    if (!eventData?.event) return;
    const { event, properties } = eventData;

    switch (event) {
      case "ringing": {
        const session: CallSession = {
          uuid: properties.call_uuid ?? crypto.randomUUID(),
          externalNumber: properties.external_number ?? "Unknown",
          internalNumber: properties.internal_number ?? "",
          contact: properties.contact ?? null,
          startedAt: new Date(),
          status: "ringing",
          notes: "",
        };
        setCurrentSession(session);
        setCallStatus("ringing");
        break;
      }
      case "dialing": {
        const session: CallSession = {
          uuid: properties.call_uuid ?? crypto.randomUUID(),
          externalNumber: properties.external_number ?? "Unknown",
          internalNumber: properties.internal_number ?? "",
          contact: properties.contact ?? null,
          startedAt: new Date(),
          status: "dialing",
          notes: "",
        };
        setCurrentSession(session);
        setCallStatus("dialing");
        break;
      }
      case "calling": {
        setCallStatus("active");
        setCurrentSession(prev =>
          prev ? { ...prev, status: "active", startedAt: new Date() } : prev
        );
        break;
      }
      case "contact_info": {
        if (properties.contact) {
          setCurrentSession(prev =>
            prev ? { ...prev, contact: properties.contact ?? prev.contact } : prev
          );
        }
        break;
      }
      case "hangup":
      case "ended": {
        setCallStatus("ended");
        setCurrentSession(prev => {
          if (!prev) return prev;
          const ended = { ...prev, status: "ended" as CallStatus };
          setSessionHistory(h => [ended, ...h].slice(0, 20));
          return ended;
        });
        setTimeout(() => {
          setCallStatus("idle");
          setCurrentSession(null);
        }, 8000);
        break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleNotesChange = (notes: string) => {
    setCurrentSession(prev => prev ? { ...prev, notes } : prev);
  };

  // ─── CLICK-TO-CALL ──────────────────────────────────────────────────────────
  const handleDial = useCallback((phone: string, name: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      toast.error("Dialler not ready — please wait for CloudTalk to load.");
      return;
    }
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "dial", properties: { phone_number: phone } }),
      "https://phone.cloudtalk.io"
    );
    toast.success(`Dialling ${name} (${phone})…`);
  }, []);

  // ─── AUTH GATE ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Phone className="w-12 h-12 text-indigo-500 mx-auto" />
          <h2 className="text-gray-900 text-xl font-semibold">Lavié Dialler</h2>
          <p className="text-gray-700">Sign in to access the dialler</p>
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  // ─── MAIN LAYOUT ────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-56px)] bg-gray-50 flex flex-col">
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* CloudTalk iframe — full width on mobile, fixed 420px on desktop */}
        <div className="flex-shrink-0 relative border-r border-gray-200 w-full md:w-auto">
          <iframe
            ref={iframeRef}
            src="https://phone.cloudtalk.io?partner=lavielabs"
            allow="microphone *; camera *; autoplay *"
            className="w-full md:w-[420px] h-full"
            style={{ border: "none", display: "block" }}
            title="CloudTalk Phone"
          />
        </div>

        {/* Right panel — hidden on mobile, visible on desktop */}
        <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-white border-l border-gray-200">
          {/* Active call — contact card */}
          {currentSession ? (
            <div className="flex-1 p-4 overflow-y-auto">
              <ContactCard
                session={currentSession}
                onNotesChange={handleNotesChange}
                elapsed={elapsed}
              />
            </div>
          ) : (
            /* Idle — quick contacts panel */
            <div className="flex-1 overflow-hidden flex flex-col">
              <QuickContactsPanel onDial={handleDial} />
            </div>
          )}

          {/* Call history (always visible at bottom) */}
          {sessionHistory.length > 0 && (
            <div className="border-t border-gray-100 p-4 max-h-52 overflow-y-auto flex-shrink-0 bg-gray-50">
              <p className="text-xs text-gray-800 uppercase tracking-wide mb-3">Recent Calls</p>
              <div className="space-y-0">
                {sessionHistory.map((s) => (
                  <CallHistoryItem key={s.uuid} session={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
