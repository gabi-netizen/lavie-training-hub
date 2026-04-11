/**
 * FloatingDialler — Persistent CloudTalk phone widget
 * Sits in the bottom-right corner on all pages (admin only).
 * Minimized by default; click the phone icon to expand.
 * Other components can trigger a call via:
 *   window.dispatchEvent(new CustomEvent('cloudtalk:dial', { detail: { phone: '+44...' } }))
 */
import { useEffect, useRef, useState } from "react";
import { Phone, X, Minus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const CLOUDTALK_ORIGINS = [
  "https://phone.cloudtalk.io",
  "https://my.cloudtalk.io",
  "https://app.cloudtalk.io",
];

export default function FloatingDialler() {
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasIncoming, setHasIncoming] = useState(false);

  // Only show for admins
  if (user && user.role !== "admin") return null;

  // Listen for dial events dispatched by ContactCard "Call Now"
  useEffect(() => {
    const handler = (e: Event) => {
      const phone = (e as CustomEvent<{ phone: string }>).detail?.phone;
      if (!phone) return;

      // Expand the widget so the user can see the call
      setExpanded(true);

      // Wait a tick for the iframe to be visible, then postMessage
      setTimeout(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage(
          { event: "dial", properties: { phone_number: phone } },
          "https://phone.cloudtalk.io"
        );
      }, 300);
    };

    window.addEventListener("cloudtalk:dial", handler);
    return () => window.removeEventListener("cloudtalk:dial", handler);
  }, []);

  // Listen for incoming call events from CloudTalk to auto-expand
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!CLOUDTALK_ORIGINS.some(o => e.origin === o || e.origin.endsWith(".cloudtalk.io"))) return;
      const evt = e.data?.event ?? e.data?.type;
      if (evt === "ringing" || evt === "dialing" || evt === "calling") {
        setHasIncoming(true);
        setExpanded(true);
      }
      if (evt === "hangup" || evt === "ended" || evt === "idle") {
        setHasIncoming(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div
      className="fixed bottom-20 right-4 z-[9999] md:bottom-6 md:right-6 flex flex-col items-end gap-2"
      style={{ pointerEvents: "none" }}
    >
      {/* Expanded iframe panel */}
      {expanded && (
        <div
          className="rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white"
          style={{ width: 340, height: 560, pointerEvents: "auto" }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Phone size={14} />
              CloudTalk
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="hover:bg-indigo-700 rounded p-0.5 transition-colors"
              title="Minimise"
            >
              <Minus size={14} />
            </button>
          </div>
          <iframe
            ref={iframeRef}
            src="https://phone.cloudtalk.io?partner=lavielabs"
            allow="microphone; camera; autoplay"
            className="w-full"
            style={{ height: 516, border: "none" }}
            title="CloudTalk Phone"
          />
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`
          w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200
          ${expanded
            ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
            : hasIncoming
              ? "bg-green-500 text-white hover:bg-green-600 animate-pulse"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }
        `}
        style={{ pointerEvents: "auto" }}
        title={expanded ? "Close dialler" : "Open dialler"}
      >
        {expanded ? <X size={22} /> : <Phone size={22} />}
      </button>
    </div>
  );
}
