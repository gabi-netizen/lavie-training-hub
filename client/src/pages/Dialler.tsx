/*
  CLOUDTALK DIALLER PAGE
  - Embeds CloudTalk Phone via iframe (phone.cloudtalk.io)
  - Listens to postMessage events: ringing, dialing, calling, hangup, ended, contact_info
  - Shows a contact card panel that auto-opens when a call starts
  - Notes are saved per call session
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  User,
  Building2,
  Clock,
  FileText,
  Mic,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  // Basic formatting — show as-is but clean up
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

// ─── CONTACT CARD ─────────────────────────────────────────────────────────────
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
          {/* Avatar */}
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
  const contact = session.contact;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/60">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
        {contact?.name ? contact.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-300 text-sm font-medium truncate">{contact?.name ?? formatNumber(session.externalNumber)}</p>
        <p className="text-slate-500 text-xs">{session.startedAt.toLocaleTimeString()}</p>
      </div>
      {session.status === "ended" ? (
        <PhoneOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      ) : (
        <PhoneMissed className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Dialler() {
  const { isAuthenticated, loading } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<CallSession[]>([]);
  const [cardVisible, setCardVisible] = useState(true);
  const [elapsed, setElapsed] = useState("00:00");
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<CallSession | null>(null);

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

  // CloudTalk postMessage listener — only accept messages from CloudTalk origins
  const CLOUDTALK_ORIGINS = [
    "https://phone.cloudtalk.io",
    "https://my.cloudtalk.io",
    "https://app.cloudtalk.io",
  ];

  const handleMessage = useCallback((e: MessageEvent) => {
    // Security: ignore messages from untrusted origins
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
        setCardVisible(true);
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
        setCardVisible(true);
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
        // Update contact info when it arrives (may come after ringing)
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
        // Auto-clear after 8 seconds
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
          <h2 className="text-white text-xl font-semibold">Lavie Dialler</h2>
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
    <div className="min-h-screen bg-[#0A1628] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0F1923]">
        <div className="flex items-center gap-3">
          <a href="/" className="text-slate-500 hover:text-teal-400 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </a>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-teal-400" />
            <span className="text-white font-semibold text-sm">Lavie Dialler</span>
          </div>
        </div>
        <CallStatusBadge status={callStatus} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* CloudTalk iframe */}
        <div className="flex-shrink-0 relative">
          <iframe
            src="https://phone.cloudtalk.io?partner=lavielabs"
            allow="microphone *; camera *; autoplay *"
            style={{ width: "420px", height: "calc(100vh - 53px)", border: "none", display: "block" }}
            title="CloudTalk Phone"
          />
        </div>

        {/* Right panel — contact card + history */}
        <div className="flex-1 flex flex-col overflow-hidden border-l border-slate-800">
          {/* Contact card toggle */}
          {currentSession && (
            <div className="flex-1 p-4 overflow-y-auto">
              <ContactCard
                session={currentSession}
                onNotesChange={handleNotesChange}
                elapsed={elapsed}
              />
            </div>
          )}

          {/* Idle state */}
          {!currentSession && callStatus === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                <Phone className="w-7 h-7 text-teal-400" />
              </div>
              <h3 className="text-slate-300 font-semibold mb-2">Ready to dial</h3>
              <p className="text-slate-500 text-sm max-w-xs">
                Use the CloudTalk phone on the left to make or receive calls. The contact card will appear here automatically.
              </p>
            </div>
          )}

          {/* Call history */}
          {sessionHistory.length > 0 && (
            <div className="border-t border-slate-800 p-4 max-h-64 overflow-y-auto">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Recent Calls</p>
              <div className="space-y-2">
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
