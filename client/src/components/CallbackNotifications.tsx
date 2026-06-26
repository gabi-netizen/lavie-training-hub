import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

interface CallbackItem {
  id: number;
  customerName: string;
  phone: string | null;
  callbackAt: number;
  contactId: number | null;
  subscriptionId: string | null;
  source: "retention" | "opening";
}

/**
 * Global callback notification popup.
 * Polls every 30s for callbacks due within 10 minutes.
 * Shows a persistent popup (not a toast) with callback details and a link to the customer.
 */
export default function CallbackNotifications() {
  const { data: callbacks = [] } = trpc.manager.getUpcomingCallbacks.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const notifiedRef = useRef<Set<number>>(new Set());

  // Play a subtle notification sound
  const playSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  useEffect(() => {
    for (const cb of callbacks) {
      if (!notifiedRef.current.has(cb.id)) {
        notifiedRef.current.add(cb.id);
        playSound();
      }
    }
  }, [callbacks]);

  const activeCallbacks = (callbacks as CallbackItem[]).filter((cb) => !dismissed.has(cb.id));

  if (activeCallbacks.length === 0) return null;

  const handleDismiss = (id: number) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const handleOpen = (cb: CallbackItem) => {
    if (cb.contactId) {
      if (cb.source === "retention") {
        window.location.href = `/contacts/${cb.contactId}?from=retention&subId=${encodeURIComponent(cb.subscriptionId || "")}&tab=queue`;
      } else {
        window.location.href = `/contacts/${cb.contactId}`;
      }
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const getMinutesLeft = (ts: number) => {
    const mins = Math.round((ts - Date.now()) / 60000);
    if (mins <= 0) return "NOW";
    return `in ${mins} min`;
  };

  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm">
      {activeCallbacks.map((cb) => (
        <div
          key={cb.id}
          className="bg-white border-2 border-orange-400 rounded-xl shadow-2xl p-4 animate-in slide-in-from-right"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏰</span>
              <div>
                <p className="text-sm font-bold text-gray-900">Callback Due</p>
                <p className="text-xs font-semibold text-orange-600">{getMinutesLeft(cb.callbackAt)} — {formatTime(cb.callbackAt)}</p>
              </div>
            </div>
            <button
              onClick={() => handleDismiss(cb.id)}
              className="text-gray-400 hover:text-gray-700 text-lg font-bold leading-none"
            >
              ×
            </button>
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-sm font-semibold text-gray-900">{cb.customerName}</p>
            {cb.phone && <p className="text-xs text-gray-600">{cb.phone}</p>}
          </div>
          <button
            onClick={() => handleOpen(cb)}
            disabled={!cb.contactId}
            className="mt-3 w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Open Customer Card →
          </button>
        </div>
      ))}
    </div>
  );
}
