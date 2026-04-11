/*
  CLOUDTALK DIALLER PAGE
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
  ChevronLeft,
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
    idle: { label: "Ready", color: "bg-slate-700 text-slate-300", icon: <Phone className="w-3 h-3" /> },
    ringing: { label: "Incoming", color: "bg-amber-500/20 text-amber-300 border border-amber-500/40", icon: <Phone className="w-3 h-3 animate-bounce" /> },
    dialing: { label: "Dialling…", color: "bg-blue-500/20 text-blue-300 border border-blue-500/40", icon: <PhoneCall className="w-3 h-3 animate-pulse" /> },
    active: { label: "On Call", color: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40", icon: <Mic className="w-3 h-3 animate-pulse" /> },
    ended: { label: "Call Ended", color: "bg-slate-700/60 text-slate-400", icon: <PhoneOff className="w-3 h-3" /> },
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
  let cls = "bg-slate-700 text-slate-200";
  if (t.includes("pre cycle") || t.includes("pre-cycle")) cls = "bg-amber-600/80 text-amber-100";
  else if (t.includes("live sub")) cls = "bg-emerald-600/80 text-emerald-100";
  else if (t.includes("cancel") || t.includes("declined")) cls = "bg-rose-600/80 text-rose-100";
  else if (t.includes("cycle 1")) cls = "bg-sky-600/80 text-sky-100";
  else if (t.includes("cycle 2")) cls = "bg-indigo-600/80 text-indigo-100";
  else if (t.includes("cycle 3")) cls = "bg-violet-600/80 text-violet-100";
  else if (t.includes("warm")) cls = "bg-orange-500/80 text-orange-100";
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
    <div className="flex flex-col h-full bg-[#0F1923] rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/60 bg-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base truncate">
              {contact?.name ?? formatNumber(session.externalNumber)}
            </h3>
            {contact?.company && (
              <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3" />
                {contact.company}
              </p>
            )}
          </div>
          <CallStatusBadge status={session.status} />
        </div>
        {/* Call meta */}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {formatNumber(session.externalNumber)}
          </span>
          {session.status === "active" && (
            <span className="flex items-center gap-1 text-emerald-400 font-mono">
              <Clock className="w-3 h-3" />
              {elapsed}
            </span>
          )}
        </div>
        {/* Tags */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.map((tag) => (
              <Badge key={tag} className="text-[10px] bg-teal-500/10 text-teal-400 border-teal-500/30">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Contact details */}
      {contact && (
        <div className="p-4 border-b border-slate-700/60 space-y-2">
          {contact.contact_numbers && contact.contact_numbers.length > 1 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Other Numbers</p>
              {contact.contact_numbers.filter(n => n !== session.externalNumber).map((n) => (
                <p key={n} className="text-slate-300 text-sm">{formatNumber(n)}</p>
              ))}
            </div>
          )}
          {contact.contact_emails && contact.contact_emails.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Email</p>
              {contact.contact_emails.map((e) => (
                <p key={e} className="text-slate-300 text-sm truncate">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
          <FileText className="w-3 h-3" />
          Call Notes
        </div>
        <Textarea
          value={session.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Type notes during the call… they'll be saved automatically."
          className="flex-1 min-h-[120px] bg-slate-800/60 border-slate-700 text-slate-200 placeholder:text-slate-600 text-sm resize-none focus:border-teal-500/50"
        />
        <p className="text-[10px] text-slate-600">Notes are saved locally for this session.</p>
      </div>
    </div>
  );
}

// ─── CALL HISTORY ITEM ────────────────────────────────────────────────────────
function CallHistoryItem({ session }: { session: CallSession }) {
  const statusIcon = {
    ended: <PhoneOff className="w-3 h-3 text-slate-500" />,
    active: <PhoneCall className="w-3 h-3 text-emerald-400" />,
    idle: <Phone className="w-3 h-3 text-slate-500" />,
    ringing: <Phone className="w-3 h-3 text-amber-400" />,
    dialing: <PhoneCall className="w-3 h-3 text-blue-400" />,
  }[session.status];
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className="text-slate-300 text-xs truncate">
          {session.contact?.name ?? formatNumber(session.externalNumber)}
        </p>
        <p className="text-slate-600 text-[10px]">
          {session.startedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      {session.notes && (
        <FileText className="w-3 h-3 text-slate-600 flex-shrink-0" />
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <ContactRound className="w-4 h-4" />
          <span>Quick Dial</span>
        </div>
        <Link href="/contacts">
          <button className="text-[10px] text-teal-400 hover:text-teal-300 transition-colors">
            Manage Contacts →
          </button>
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-7 h-8 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-600 text-xs"
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs gap-2">
            <User className="w-6 h-6" />
            {search ? "No contacts match" : "No contacts yet — import a CSV"}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {contacts.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-800/40 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-slate-300">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-xs font-medium truncate">{c.name}</span>
                    <LeadTypeBadge type={c.leadType} />
                  </div>
                  {c.phone && (
                    <span className="text-slate-500 text-[10px] font-mono">{c.phone}</span>
                  )}
                </div>
                {c.phone && (
                  <button
                    onClick={() => onDial(c.phone, c.name)}
                    className="w-7 h-7 rounded-full bg-emerald-600/20 hover:bg-emerald-600/50 flex items-center justify-center text-emerald-400 transition-colors flex-shrink-0"
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
    // CloudTalk click-to-call postMessage API
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "dial", properties: { phone_number: phone } }),
      "https://phone.cloudtalk.io"
    );
    toast.success(`Dialling ${name} (${phone})…`);
  }, []);

  // ─── AUTH GATE ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Phone className="w-12 h-12 text-teal-400 mx-auto" />
          <h2 className="text-white text-xl font-semibold">Lavié Dialler</h2>
          <p className="text-slate-400">Sign in to access the dialler</p>
          <Button asChild className="bg-teal-600 hover:bg-teal-700">
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  // ─── MAIN LAYOUT ────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-56px)] bg-[#0A1628] flex flex-col">
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* CloudTalk iframe */}
        <div className="flex-shrink-0 relative">
          <iframe
            ref={iframeRef}
            src="https://phone.cloudtalk.io?partner=lavielabs"
            allow="microphone *; camera *; autoplay *"
            style={{ width: "420px", height: "100%", border: "none", display: "block" }}
            title="CloudTalk Phone"
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden border-l border-slate-800">
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
            <div className="border-t border-slate-800 p-4 max-h-52 overflow-y-auto flex-shrink-0">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Recent Calls</p>
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
