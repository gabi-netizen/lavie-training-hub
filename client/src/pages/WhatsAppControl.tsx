/**
 * WhatsApp Control — Manager-only full-page WhatsApp conversation management.
 * Shows ALL conversations (no team filtering) and allows assigning conversations to agents.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Send, MessageCircle, ArrowLeft, Search, Smile, ChevronDown, UserPlus, X } from "lucide-react";

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
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 5L4.5 8.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoubleCheck({ color = "#8696a0" }: { color?: string }) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 5L4.5 8.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5L10.5 8.5L19 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

export default function WhatsAppControl() {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assignRef = useRef<HTMLDivElement>(null);

  // Fetch conversations list (manager sees all)
  const { data: conversations, refetch: refetchConversations } =
    trpc.whatsapp.conversations.useQuery(undefined, {
      refetchInterval: 10000,
    });

  // Fetch messages for selected contact
  const {
    data: messages,
    refetch: refetchMessages,
    isLoading: messagesLoading,
    error: messagesError,
  } = trpc.whatsapp.messages.useQuery(
    { contactId: selectedContactId },
    {
      enabled: selectedContactId !== null,
      refetchInterval: selectedContactId !== null ? 5000 : false,
      retry: 1,
    }
  );

  // Fetch templates (for expired-window re-engagement)
  const { data: templates } = trpc.whatsapp.templates.useQuery(undefined, {
    enabled: selectedContactId !== null,
  });

  // Fetch agents for assignment dropdown
  const { data: agents } = trpc.whatsapp.getAgents.useQuery(undefined, {
    enabled: showAssignDropdown,
  });

  // Fetch current assignment for selected contact
  const { data: currentAssignment, refetch: refetchAssignment } = trpc.whatsapp.getAssignment.useQuery(
    { contactId: selectedContactId! },
    { enabled: selectedContactId !== null }
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

  // Send template mutation
  const sendTemplate = trpc.whatsapp.send.useMutation({
    onSuccess: () => {
      setShowTemplates(false);
      refetchMessages();
      refetchConversations();
      toast.success("Template sent — conversation window re-opened ✅");
    },
    onError: (err) => toast.error(`Failed to send template: ${err.message}`),
  });

  // Assign conversation mutation
  const assignConversation = trpc.whatsapp.assignConversation.useMutation({
    onSuccess: () => {
      setShowAssignDropdown(false);
      setAssignSearchQuery("");
      refetchAssignment();
      refetchConversations();
      toast.success("Conversation assigned successfully");
    },
    onError: (err) => toast.error(`Failed to assign: ${err.message}`),
  });

  // When selecting a conversation, mark as read
  useEffect(() => {
    if (selectedContactId !== null) {
      markAsRead.mutate({ contactId: selectedContactId });
    }
    setShowTemplates(false);
    setShowEmoji(false);
    setShowAssignDropdown(false);
  }, [selectedContactId]);

  // Auto-scroll to bottom when messages change
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

  // Close assign dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    const interval = setInterval(update, 30000);
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

  // ─── Filtered Agents for Assign ────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!assignSearchQuery.trim()) return agents;
    const q = assignSearchQuery.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q) || (a.team || "").toLowerCase().includes(q));
  }, [agents, assignSearchQuery]);

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

  const handleAssign = (agentId: number) => {
    if (selectedContactId === null) return;
    assignConversation.mutate({
      contactId: selectedContactId,
      assignedUserId: agentId,
    });
  };

  const totalUnread = conversations?.reduce((sum: number, c: any) => sum + c.unreadCount, 0) ?? 0;

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {selectedContactId !== null && (
            <button
              onClick={() => { setSelectedContactId(null); setShowEmoji(false); setShowTemplates(false); setShowAssignDropdown(false); }}
              style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <MessageCircle size={20} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            WhatsApp Control
            {totalUnread > 0 && (
              <span style={{ marginLeft: 8, background: "#25d366", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                {totalUnread} unread
              </span>
            )}
          </span>
        </div>

        {/* Assign button — only shown when a conversation is selected */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedContactId !== null && (
            <div ref={assignRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
              >
                <UserPlus size={14} />
                Assign
                <ChevronDown size={12} />
              </button>

              {/* Assign dropdown */}
              {showAssignDropdown && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    width: 280,
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                    zIndex: 100,
                    overflow: "hidden",
                  }}
                >
                  {/* Current assignment info */}
                  {currentAssignment && (
                    <div style={{ padding: "10px 14px", background: "#f0fdf4", borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#166534" }}>
                      Currently assigned to: <strong>{currentAssignment.assignedUserName}</strong>
                    </div>
                  )}

                  {/* Search agents */}
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f2f5", borderRadius: 20, padding: "6px 12px" }}>
                      <Search size={14} style={{ color: "#8696a0", flexShrink: 0 }} />
                      <input
                        type="text"
                        value={assignSearchQuery}
                        onChange={(e) => setAssignSearchQuery(e.target.value)}
                        placeholder="Search agents..."
                        style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "#1f2937" }}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Agent list */}
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {filteredAgents.length === 0 ? (
                      <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                        No agents found
                      </div>
                    ) : (
                      filteredAgents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => handleAssign(agent.id)}
                          disabled={assignConversation.isPending}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "10px 14px",
                            border: "none",
                            borderBottom: "1px solid #f3f4f6",
                            background: currentAssignment?.assignedUserId === agent.id ? "#f0fdf4" : "transparent",
                            cursor: assignConversation.isPending ? "not-allowed" : "pointer",
                            textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#f0fdf4"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = currentAssignment?.assignedUserId === agent.id ? "#f0fdf4" : "transparent"; }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{agent.name}</div>
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                              {agent.team ? agent.team.charAt(0).toUpperCase() + agent.team.slice(1) : "Manager"}
                            </div>
                          </div>
                          {currentAssignment?.assignedUserId === agent.id && (
                            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Current</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Conversation List */}
        <div
          style={{
            width: selectedContactId !== null ? 320 : "100%",
            maxWidth: selectedContactId !== null ? 320 : "100%",
            minWidth: selectedContactId !== null ? 320 : undefined,
            borderRight: "1px solid #e5e7eb",
            overflowY: "auto",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
          className="whatsapp-control-conversation-list"
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
                      <span style={{ fontSize: 13, color: conv.unreadCount > 0 ? "#374151" : "#9ca3af", fontWeight: conv.unreadCount > 0 ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
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
              style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}
            >
              {messagesLoading ? (
                <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 40 }}>
                  Loading messages…
                </div>
              ) : messagesError ? (
                <div style={{ textAlign: "center", color: "#dc2626", fontSize: 13, padding: 40 }}>
                  Error loading messages: {messagesError.message}
                </div>
              ) : !messages || messages.length === 0 ? (
                <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13, padding: 40 }}>
                  No messages yet
                </div>
              ) : (
                messages.map((msg: any, idx: number) => {
                  const isOutbound = msg.direction === "outbound";
                  const msgDate = new Date(msg.createdAt);
                  const time = msgDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showDateSep = !prevMsg || !isSameDay(msgDate, new Date(prevMsg.createdAt));

                  return (
                    <div key={msg.id}>
                      {showDateSep && (
                        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 8px" }}>
                          <span style={{ background: "#e2dfd7", color: "#54656f", fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 8 }}>
                            {formatDateSeparator(msgDate)}
                          </span>
                        </div>
                      )}
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
                              <span style={{ fontSize: 12, lineHeight: 1, display: "inline-flex", alignItems: "center" }}>
                                {msg.status === "read"
                                  ? <DoubleCheck color="#53bdeb" />
                                  : msg.status === "delivered"
                                  ? <DoubleCheck color="#8696a0" />
                                  : msg.status === "failed"
                                  ? <span style={{ color: "#dc2626", fontWeight: 700 }}>✗</span>
                                  : <SingleCheck color="#8696a0" />
                                }
                              </span>
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

            {/* Bottom input area */}
            <div style={{ borderTop: "1px solid #e5e7eb", background: "#f0f2f5" }}>

              {windowStatus.expired ? (
                /* ── Expired window UI ── */
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px" }}>
                    <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
                      ⏰ 24h window expired — send a template to re-open the conversation
                    </span>
                    <button
                      onClick={() => setShowTemplates(!showTemplates)}
                      disabled={sendTemplate.isPending}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        background: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "7px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Send Template <ChevronDown size={13} />
                    </button>
                  </div>

                  {/* Template dropdown */}
                  {showTemplates && (
                    <div style={{ marginTop: 8, background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 240, overflowY: "auto" }}>
                      {!templates || templates.length === 0 ? (
                        <div style={{ padding: "16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                          No templates available
                        </div>
                      ) : (
                        templates.map((tpl: any) => (
                          <button
                            key={tpl.sid}
                            onClick={() => {
                              if (sendTemplate.isPending) return;
                              sendTemplate.mutate({
                                contactId: selectedContactId!,
                                contentSid: tpl.sid,
                                templateName: tpl.friendly_name,
                              });
                            }}
                            disabled={sendTemplate.isPending}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 14px",
                              border: "none",
                              borderBottom: "1px solid #f3f4f6",
                              background: "transparent",
                              cursor: sendTemplate.isPending ? "not-allowed" : "pointer",
                              fontSize: 13,
                              color: "#1f2937",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#f0fdf4"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ fontWeight: 600, color: "#16a34a" }}>{tpl.friendly_name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ── Active window UI ── */
                <>
                  {/* Timer bar */}
                  {messages && messages.length > 0 && (
                    <div style={{ padding: "4px 16px", fontSize: 11, color: "#16a34a", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                      {`Messaging window: ${windowStatus.label}`}
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
                      placeholder="Type a message..."
                      disabled={sendFreeText.isPending}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        borderRadius: 24,
                        border: "none",
                        background: "#fff",
                        fontSize: 14,
                        outline: "none",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!messageText.trim() || sendFreeText.isPending}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: messageText.trim() && !sendFreeText.isPending ? "#075e54" : "#ccc",
                        border: "none",
                        color: "#fff",
                        cursor: messageText.trim() && !sendFreeText.isPending ? "pointer" : "not-allowed",
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
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 640px) {
          .whatsapp-control-conversation-list {
            ${selectedContactId !== null ? "display: none !important;" : ""}
          }
        }
        @media (min-width: 641px) {
          .whatsapp-control-conversation-list {
            width: 320px !important;
            max-width: 320px !important;
            min-width: 320px !important;
          }
        }
      `}</style>
    </div>
  );
}
