import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MessageCircle, Phone, Volume2, VolumeX, X } from "lucide-react";

interface NotificationMessage {
  id: number;
  contactId: number | null;
  contactName: string;
  body: string;
  channel: "whatsapp" | "sms";
  fromNumber: string;
  createdAt: number;
}

/**
 * Global component that polls for new inbound WhatsApp/SMS messages
 * and shows toast notifications with sound.
 * Renders as a fixed overlay — should be placed inside AppLayout.
 */
export default function MessageNotifications() {
  const { user } = useAuth();
  const [muted, setMuted] = useState(() => localStorage.getItem("msg_notifications_muted") === "true");
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const sinceRef = useRef<number>(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.volume = 0.7;
  }, []);

  // Toggle mute
  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    localStorage.setItem("msg_notifications_muted", String(newMuted));
  };

  // Poll for new messages every 15 seconds
  const { data } = trpc.whatsapp.pollNewMessages.useQuery(
    { since: sinceRef.current },
    {
      enabled: !!user,
      refetchInterval: 15000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (!data?.messages?.length) return;

    const newOnes = data.messages.filter((m) => !seenIds.has(m.id));
    if (newOnes.length === 0) return;

    // Play sound
    if (!muted && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    // Add to notifications (max 5 visible at a time)
    setNotifications((prev) => [...newOnes, ...prev].slice(0, 5));
    setSeenIds((prev) => {
      const next = new Set(prev);
      for (const m of newOnes) next.add(m.id);
      return next;
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => !newOnes.some((m) => m.id === n.id)));
    }, 10000);
  }, [data, seenIds, muted]);

  const dismiss = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (!user) return null;

  return (
    <>
      {/* Mute/Unmute toggle — fixed top right */}
      <button
        onClick={toggleMute}
        style={{
          position: "fixed",
          top: 70,
          right: 16,
          zIndex: 10000,
          background: muted ? "#ef4444" : "#22c55e",
          color: "#fff",
          border: "none",
          borderRadius: 20,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
        title={muted ? "Notifications muted — click to unmute" : "Click to mute notifications"}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {muted ? "Muted" : "Sound On"}
      </button>

      {/* Notification toasts — fixed top right, stacked */}
      <div style={{ position: "fixed", top: 110, right: 16, zIndex: 10001, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              padding: "12px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              borderLeft: n.channel === "whatsapp" ? "4px solid #25D366" : "4px solid #3b82f6",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            {/* Icon */}
            <div style={{ marginTop: 2 }}>
              {n.channel === "whatsapp" ? (
                <MessageCircle size={20} color="#25D366" />
              ) : (
                <Phone size={20} color="#3b82f6" />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", marginBottom: 2 }}>
                {n.channel === "whatsapp" ? "WhatsApp" : "SMS"} from {n.contactName}
              </div>
              <div style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.body || "(media message)"}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => dismiss(n.id)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9ca3af" }}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
