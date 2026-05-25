/**
 * WhatsApp Chat Panel — slide-out overlay with conversation list + message view.
 * Used in the Workspace page for agents to view and reply to WhatsApp messages.
 */

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X, Send, MessageCircle, ArrowLeft } from "lucide-react";

interface WhatsAppChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function WhatsAppChatPanel({ open, onClose }: WhatsAppChatPanelProps) {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations list
  const { data: conversations, refetch: refetchConversations } =
    trpc.whatsapp.conversations.useQuery(undefined, {
      enabled: open,
      refetchInterval: open ? 10000 : false, // Poll every 10s when open
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when conversation selected
  useEffect(() => {
    if (selectedContactId !== null) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [selectedContactId]);

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

  if (!open) return null;

  const totalUnread = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

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
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            background: "#075e54",
            color: "#fff",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {selectedContactId !== null && (
              <button
                onClick={() => setSelectedContactId(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <MessageCircle size={22} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              WhatsApp Chat
              {totalUnread > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "#25d366",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {totalUnread} unread
                </span>
              )}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: Conversation List */}
          <div
            style={{
              width: selectedContactId !== null ? 0 : "100%",
              maxWidth: selectedContactId !== null ? 300 : "100%",
              minWidth: selectedContactId !== null ? 300 : undefined,
              borderRight: "1px solid #e5e7eb",
              overflowY: "auto",
              background: "#fff",
              display: selectedContactId !== null ? undefined : "block",
            }}
            className="whatsapp-conversation-list"
          >
            {!conversations || conversations.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 14,
                }}
              >
                <MessageCircle size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>No conversations yet</p>
                <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                  Messages will appear here when customers reply to your WhatsApp templates.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.contactId === selectedContactId;
                const name = conv.contact?.name || conv.fromNumber || "Unknown";
                const initials = name
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                const lastMsg = conv.lastMessage;
                const time = lastMsg?.createdAt
                  ? new Date(lastMsg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
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
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: isSelected ? "#25d366" : "#e5e7eb",
                        color: isSelected ? "#fff" : "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: conv.unreadCount > 0 ? 700 : 500,
                            fontSize: 14,
                            color: "#1f2937",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>
                        <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                          {time}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: conv.unreadCount > 0 ? "#374151" : "#9ca3af",
                            fontWeight: conv.unreadCount > 0 ? 500 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 180,
                          }}
                        >
                          {lastMsg?.direction === "outbound" && "You: "}
                          {lastMsg?.body || "[Template message]"}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span
                            style={{
                              background: "#25d366",
                              color: "#fff",
                              borderRadius: 10,
                              padding: "1px 7px",
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
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
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                background: "#ece5dd",
                minWidth: 0,
              }}
            >
              {/* Messages area */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {!messages || messages.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#6b7280",
                      fontSize: 13,
                      padding: 40,
                    }}
                  >
                    No messages yet
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    const time = new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const date = new Date(msg.createdAt).toLocaleDateString([], {
                      day: "numeric",
                      month: "short",
                    });

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          justifyContent: isOutbound ? "flex-end" : "flex-start",
                          marginBottom: 2,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "75%",
                            padding: "8px 12px",
                            borderRadius: isOutbound
                              ? "12px 12px 2px 12px"
                              : "12px 12px 12px 2px",
                            background: isOutbound ? "#dcf8c6" : "#fff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                            position: "relative",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize: 14,
                              color: "#1f2937",
                              lineHeight: 1.4,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {msg.body || "[Template message]"}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 4,
                            }}
                          >
                            <span style={{ fontSize: 11, color: "#6b7280" }}>
                              {date} {time}
                            </span>
                            {isOutbound && (
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
                                {msg.status === "delivered"
                                  ? "✓✓"
                                  : msg.status === "read"
                                  ? "✓✓"
                                  : msg.status === "failed"
                                  ? "✗"
                                  : "✓"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div
                style={{
                  padding: "10px 16px",
                  background: "#f0f2f5",
                  borderTop: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
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
                    background:
                      messageText.trim() && !sendFreeText.isPending
                        ? "#075e54"
                        : "#ccc",
                    border: "none",
                    color: "#fff",
                    cursor:
                      messageText.trim() && !sendFreeText.isPending
                        ? "pointer"
                        : "not-allowed",
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
          )}

          {/* Show placeholder when no conversation selected on desktop */}
          {selectedContactId === null && conversations && conversations.length > 0 && (
            <div
              style={{
                flex: 1,
                display: "none", // Hidden on mobile-like layout where list takes full width
                alignItems: "center",
                justifyContent: "center",
                background: "#ece5dd",
                color: "#6b7280",
                fontSize: 14,
              }}
            />
          )}
        </div>
      </div>

      {/* Responsive: hide conversation list on mobile when a conversation is selected */}
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
