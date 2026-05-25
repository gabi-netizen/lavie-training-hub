/**
 * WhatsApp Chat Panel — slide-out overlay with conversation list + message view.
 * Features: read receipts, 24h window timer, date separators, search, emoji picker.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X, Send, MessageCircle, ArrowLeft, Search, Smile } from "lucide-react";

// ─── Common Emojis Grid ─────────────────────────────────────────────────────
const COMMON_EMOJIS = [
  "😊", "👍", "❤️", "🙏", "😂", "🎉", "✅", "💯",
  "🔥", "⭐", "💪", "👋", "😍", "🤗", "👏", "💐",
  "✨", "🙌", "😘", "💕", "🌟", "💝", "🎊", "🥰",
  "😉", "🤝", "💫", "🌹", "💜", "💙", "🧡", "💚",
];

// ─── Check Mark SVGs ─────────────────────────────────────────────────────────
function SingleCheck({ color = "#8696a0" }: { color?: string }) {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11.071 0.929L4.5 7.5L1.929 4.929" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function DoubleCheck({ color = "#8696a0" }: { color?: string }) {
  return (
    <svg width="20" height="11" viewBox="0 0 20 11" fill="none" style={{ flexShrink: 0 }}>
      <path d="M14.071 0.929L7.5 7.5L4.929 4.929" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M18.071 0.929L11.5 7.5L10.5 6.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ─── Date Formatting Helpers ─────────────────────────────────────────────────
function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ─── 24h Window Helper ───────────────────────────────────────────────────────
function getTimeRemaining(lastInboundTime: Date | null): { expired: boolean; label: string } {
  if (!lastInboundTime) return { expired: true, label: "No customer message yet" };
  const windowEnd = new Date(lastInboundTime.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const diff = windowEnd.getTime() - now.getTime();

  if (diff <= 0) return { expired: true, label: "24h window expired" };

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { expired: false, label: `${hours}h ${minutes}m remaining` };
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface WhatsAppChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function WhatsAppChatPanel({ open, onClose }: WhatsAppChatPanelProps) {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fetch conversations list
  const { data: conversations, refetch: refetchConversations } =
    trpc.whatsapp.conversations.useQuery(undefined, {
      enabled: open,
      refetchInterval: open ? 10000 : false,
    });

  // Fetch messages for selected contact
  const { data: messages, refetch: refetchMessages } =
    trpc.whatsapp.messages.useQuery(
      { contactId: selectedContactId },
      {
        enabled: open && selectedContactId !== null,
        refetchInterval: open && selectedContactId !== null ? 5000 : false,
      }
    );

  // Mark as read mutation
  const markAsRead = trpc.whatsapp.markAsRead.useMutation({
    onSuccess: () => refetchConversations(),
  });

  // Send free-text mutation
  const sendFreeText = trpc.whatsapp.sendFreeText.useMutation({
    onSuccess: () => {
      setMessageText("");
      setShowEmoji(false);
      refetchMessages();
      refetchConversations();
      toast.success("Message sent");
    },
    onError: (err) => {
      if (err.message.includes("63016") || err.message.includes("outside")) {
        toast.error("Cannot send: 24h conversation window has expired. Send a template first.");
      } else {
        toast.error(`Failed to send: ${err.message}`);
      }
    },
  });

  // When selecting a conversation, mark as read
  useEffect(() => {
    if (selectedContactId !== null && open) {
      markAsRead.mutate({ contactId: selectedContactId });
    }
  }, [selectedContactId, open]);

  // Auto-scroll to bottom when messages change or conversation opens
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, [messages, selectedContactId]);

  // Focus input when conversation selected
  useEffect(() => {
    if (selectedContactId !== null) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [selectedContactId]);

  // ─── 24h Window Calculation ────────────────────────────────────────────────
  const lastInboundTime = useMemo(() => {
    if (!messages) return null;
    const inboundMessages = messages.filter((m: any) => m.direction === "inbound");
    if (inboundMessages.length === 0) return null;
    const latest = inboundMessages[inboundMessages.length - 1];
    return new Date(latest.createdAt);
  }, [messages]);

  const [windowStatus, setWindowStatus] = useState({ expired: true, label: "" });

  useEffect(() => {
    const update = () => setWindowStatus(getTimeRemaining(lastInboundTime));
    update();
    const interval = setInterval(update, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [lastInboundTime]);

  // ─── Filtered Conversations ────────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv: any) => {
      const name = conv.contact?.name || conv.fromNumber || "";
      return name.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery]);

  const handleSend = () => {
    if (!messageText.trim() || selectedContactId === null) return;
    sendFreeText.mutate({
      contactId: selectedContactId,
      body: messageText.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    setMessageText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  if (!open) return null;

  const totalUnread = conversations?.reduce((sum: number, c: any) => sum + c.unreadCount, 0) ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 900,
          height: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid #e5e7eb",
            background: "#075e54",
            color: "#fff",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {selectedContactId !== null && (
              <button
                onClick={() => { setSelectedContactId(null); setShowEmoji(false); }}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <MessageCircle size={20} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              WhatsApp Chat
              {totalUnread > 0 && (
                <span style={{ marginLeft: 8, background: "#25d366", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                  {totalUnread} unread
                </span>
              )}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: Conversation List */}
          <div
            style={{
              width: selectedContactId !== null ? 300 : "100%",
              maxWidth: selectedContactId !== null ? 300 : "100%",
              minWidth: selectedContactId !== null ? 300 : undefined,
              borderRight: "1px solid #e5e7eb",
              overflowY: "auto",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
            }}
            className="whatsapp-conversation-list"
          >
            {/* Search bar */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f2f5", borderRadius: 20, padding: "6px 12px" }}>
                <Search size={14} style={{ color: "#8696a0", flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "#1f2937" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Conversation items */}
            {!filteredConversations || filteredConversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                <MessageCircle size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {searchQuery ? "No matches found" : "No conversations yet"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {searchQuery ? "Try a different search" : "Messages will appear here when customers reply."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv: any) => {
                const isSelected = conv.contactId === selectedContactId;
                const name = conv.contact?.name || conv.fromNumber || "Unknown";
                const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                const lastMsg = conv.lastMessage;
                const time = lastMsg?.createdAt
                  ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "";

                return (
                  <div
                    key={conv.contactId ?? "null"}
                    onClick={() => setSelectedContactId(conv.contactId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      cursor: "pointer",
                      background: isSelected ? "#f0fdf4" : "transparent",
                      borderBottom: "1px solid #f3f4f6",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: isSelected ? "#25d366" : "#e5e7eb", color: isSelected ? "#fff" : "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: conv.unreadCount > 0 ? 700 : 500, fontSize: 14, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                        <span style={{ fontSize: 11, color: conv.unreadCount > 0 ? "#25d366" : "#9ca3af", flexShrink: 0 }}>
                          {time}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                        <span style={{ fontSize: 13, color: conv.unreadCount > 0 ? "#374151" : "#9ca3af", fontWeight: conv.unreadCount > 0 ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                          {lastMsg?.direction === "outbound" && "You: "}
                          {lastMsg?.body || "[Template message]"}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span style={{ background: "#25d366", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Messages View */}
          {selectedContactId !== null && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#ece5dd", minWidth: 0 }}>
              {/* Messages area */}
              <div
                ref={messagesContainerRef}
                style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}
              >
                {!messages || messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13, padding: 40 }}>
                    No messages yet
                  </div>
                ) : (
                  messages.map((msg: any, idx: number) => {
                    const isOutbound = msg.direction === "outbound";
                    const msgDate = new Date(msg.createdAt);
                    const time = msgDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                    // Date separator
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showDateSep = !prevMsg || !isSameDay(msgDate, new Date(prevMsg.createdAt));

                    return (
                      <div key={msg.id}>
                        {/* Date separator */}
                        {showDateSep && (
                          <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 8px" }}>
                            <span style={{ background: "#e2dfd7", color: "#54656f", fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 8 }}>
                              {formatDateSeparator(msgDate)}
                            </span>
                          </div>
                        )}

                        {/* Message bubble */}
                        <div style={{ display: "flex", justifyContent: isOutbound ? "flex-end" : "flex-start", marginBottom: 2 }}>
                          <div
                            style={{
                              maxWidth: "75%",
                              padding: "7px 10px 4px",
                              borderRadius: isOutbound ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                              background: isOutbound ? "#d9fdd3" : "#fff",
                              boxShadow: "0 1px 1px rgba(0,0,0,0.06)",
                            }}
                          >
                            <p style={{ margin: 0, fontSize: 14, color: "#1f2937", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {msg.body || "[Template message]"}
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3, marginTop: 3 }}>
                              <span style={{ fontSize: 11, color: "#667781" }}>{time}</span>
                              {isOutbound && (
                                msg.status === "read"
                                  ? <DoubleCheck color="#53bdeb" />
                                  : msg.status === "delivered"
                                  ? <DoubleCheck color="#8696a0" />
                                  : msg.status === "failed"
                                  ? <span style={{ fontSize: 11, color: "#dc2626" }}>!</span>
                                  : <SingleCheck color="#8696a0" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 24h window timer + Input area */}
              <div style={{ borderTop: "1px solid #e5e7eb", background: "#f0f2f5" }}>
                {/* Timer bar */}
                {messages && messages.length > 0 && (
                  <div style={{ padding: "4px 16px", fontSize: 11, color: windowStatus.expired ? "#dc2626" : "#16a34a", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: windowStatus.expired ? "#dc2626" : "#22c55e" }} />
                    {windowStatus.expired
                      ? "24h window expired. Send a template to re-engage."
                      : `Messaging window: ${windowStatus.label}`}
                  </div>
                )}

                {/* Emoji picker */}
                {showEmoji && (
                  <div style={{ padding: "8px 16px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
                      {COMMON_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => insertEmoji(emoji)}
                          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4, borderRadius: 6, transition: "background 0.1s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input row */}
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: showEmoji ? "#25d366" : "#8696a0", padding: 4, display: "flex", alignItems: "center" }}
                  >
                    <Smile size={22} />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={windowStatus.expired ? "24h window expired — send a template" : "Type a message..."}
                    disabled={sendFreeText.isPending || windowStatus.expired}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 24,
                      border: "none",
                      background: "#fff",
                      fontSize: 14,
                      outline: "none",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      opacity: windowStatus.expired ? 0.6 : 1,
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sendFreeText.isPending || windowStatus.expired}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: messageText.trim() && !sendFreeText.isPending && !windowStatus.expired ? "#075e54" : "#ccc",
                      border: "none",
                      color: "#fff",
                      cursor: messageText.trim() && !sendFreeText.isPending && !windowStatus.expired ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "background 0.15s",
                    }}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 640px) {
          .whatsapp-conversation-list {
            ${selectedContactId !== null ? "display: none !important;" : ""}
          }
        }
        @media (min-width: 641px) {
          .whatsapp-conversation-list {
            width: 300px !important;
            max-width: 300px !important;
            min-width: 300px !important;
          }
        }
      `}</style>
    </div>
  );
}
