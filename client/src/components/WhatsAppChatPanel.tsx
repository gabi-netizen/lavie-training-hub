/**
 * WhatsApp Chat Panel — full-featured overlay matching WhatsApp Control design.
 * 3-panel layout: Left (conversations) | Center (chat) | Right (contact details)
 * Agent restrictions: no assign, no snooze, no campaigns.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  X, Send, MessageCircle, Search, Smile, CheckCircle2,
  RotateCcw, Clock, FileText, Smartphone
} from "lucide-react";

// ─── Common Emojis ──────────────────────────────────────────────────────────
const COMMON_EMOJIS = [
  "😊", "👍", "❤️", "🙏", "😂", "🎉", "✅", "💯",
  "🔥", "⭐", "💪", "👋", "😍", "🤗", "👏", "💐",
  "✨", "🙌", "😘", "💕", "🌟", "💝", "🎊", "🥰",
  "😉", "🤝", "💫", "🌹", "💜", "💙", "🧡", "💚",
];

// ─── Check Mark SVGs ─────────────────────────────────────────────────────────
function SingleCheck({ color = "#555" }: { color?: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 5L4.5 8.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DoubleCheck({ color = "#555" }: { color?: string }) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 5L4.5 8.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5L10.5 8.5L19 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case "sent":      return <SingleCheck color="#555" />;
    case "delivered": return <DoubleCheck color="#555" />;
    case "read":      return <DoubleCheck color="#53bdeb" />;
    case "failed":    return <span className="text-red-500 text-[10px] font-bold">!</span>;
    default:          return null;
  }
}

// ─── Status Dot ──────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { open: "bg-green-400", snoozed: "bg-yellow-400", resolved: "bg-gray-400" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-green-400"}`} />;
}

// ─── Date Helpers ────────────────────────────────────────────────────────────
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
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ─── 24h Window Helper ───────────────────────────────────────────────────────
function get24hWindowRemaining(messages: any[]): { expired: boolean; remaining: string | null } {
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  if (!lastInbound) return { expired: true, remaining: null };
  const lastInboundTime = new Date(lastInbound.createdAt).getTime();
  const windowEnd = lastInboundTime + 24 * 60 * 60 * 1000;
  const remainingMs = windowEnd - Date.now();
  if (remainingMs <= 0) return { expired: true, remaining: null };
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / 60000);
  return { expired: false, remaining: `${hours}h ${mins}m` };
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface WhatsAppChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** When true, renders inline (no modal overlay). Used as a Workspace tab. */
  inline?: boolean;
}

export function WhatsAppChatPanel({ open, onClose, inline }: WhatsAppChatPanelProps) {
  const { user } = useAuth();
  const isManager = !user?.team;

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | undefined>(undefined);
  const [hasSelectedConversation, setHasSelectedConversation] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [replyChannel, setReplyChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── tRPC Queries ──────────────────────────────────────────────────────────
  const { data: conversations, refetch: refetchConversations } =
    trpc.whatsapp.conversations.useQuery(
      { tab: isManager ? "all" : "mine", includeResolved },
      { enabled: open, refetchInterval: open ? 10000 : false }
    );

  const { data: messages, refetch: refetchMessages } =
    trpc.whatsapp.messages.useQuery(
      { contactId: selectedContactId, phoneNumber: selectedPhoneNumber },
      { enabled: open && hasSelectedConversation, refetchInterval: open && hasSelectedConversation ? 5000 : false }
    );

  const { data: templates } = trpc.whatsapp.templates.useQuery(undefined, {
    enabled: open && hasSelectedConversation,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const markAsRead = trpc.whatsapp.markAsRead.useMutation({ onSuccess: () => refetchConversations() });

  const sendFreeText = trpc.whatsapp.sendFreeText.useMutation({
    onSuccess: () => { setMessageInput(""); refetchMessages(); refetchConversations(); toast.success("Message sent"); },
    onError: (err) => {
      if (err.message.includes("63016") || err.message.includes("outside")) {
        toast.error("24h window expired — send a template first.");
      } else { toast.error(`Failed: ${err.message}`); }
    },
  });

  const replyMutation = trpc.whatsapp.reply.useMutation({
    onSuccess: () => { setMessageInput(""); refetchMessages(); refetchConversations(); toast.success("Message sent"); },
    onError: (err) => {
      if (err.message.includes("63016") || err.message.includes("outside")) {
        toast.error("24h window expired — send a template first.");
      } else { toast.error(`Failed: ${err.message}`); }
    },
  });

  const sendTemplate = trpc.whatsapp.send.useMutation({
    onSuccess: () => { setShowTemplatePicker(false); refetchMessages(); refetchConversations(); toast.success("Template sent ✅"); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const resolveConversation = trpc.whatsapp.resolveConversation.useMutation({
    onSuccess: () => { toast.success("Resolved"); refetchConversations(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const reopenConversation = trpc.whatsapp.reopenConversation.useMutation({
    onSuccess: () => { toast.success("Reopened"); refetchConversations(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasSelectedConversation && open) markAsRead.mutate({ contactId: selectedContactId, phoneNumber: selectedPhoneNumber });
    setShowTemplatePicker(false);
    setShowEmojiPicker(false);
  }, [selectedContactId, open]);

  // Auto-detect reply channel from last inbound message
  useEffect(() => {
    if (messages && messages.length > 0) {
      const lastInbound = [...messages].reverse().find((m: any) => m.direction === "inbound");
      if (lastInbound && lastInbound.channel) {
        setReplyChannel(lastInbound.channel as "whatsapp" | "sms");
      } else {
        setReplyChannel("whatsapp");
      }
    }
  }, [messages, selectedContactId]);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages, selectedContactId]);

  useEffect(() => {
    if (selectedContactId !== null) setTimeout(() => messageInputRef.current?.focus(), 150);
  }, [selectedContactId]);

  // ─── Derived State ────────────────────────────────────────────────────────
  const windowInfo = useMemo(() => {
    if (!messages || messages.length === 0) return { expired: true, remaining: null };
    return get24hWindowRemaining(messages);
  }, [messages]);

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv: any) => {
      const name = conv.contact?.name || conv.fromNumber || "";
      return name.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery]);

  const selectedConversation = useMemo(() =>
    conversations?.find((c: any) => c.contactId === selectedContactId),
    [conversations, selectedContactId]
  );

  const currentAssignment = selectedConversation?.assignedTo;

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSendMessage = () => {
    if (!messageInput.trim() || !hasSelectedConversation) return;
    // Allow sending to unmatched conversations (contactId null) using phoneNumber fallback
    if (selectedContactId !== null) {
      replyMutation.mutate({ contactId: selectedContactId, body: messageInput.trim(), channel: replyChannel });
    } else if (selectedPhoneNumber) {
      replyMutation.mutate({ phoneNumber: selectedPhoneNumber, body: messageInput.trim(), channel: replyChannel });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleSendTemplate = (contentSid: string, friendlyName: string) => {
    if (selectedContactId === null) return;
    sendTemplate.mutate({ contactId: selectedContactId, contentSid, templateName: friendlyName });
  };

  if (!open) return null;

  const content = (
    <div className={`bg-white flex overflow-hidden ${inline ? 'w-full h-full rounded-lg border border-gray-200' : 'rounded-xl w-full max-w-[1200px] h-[85vh] shadow-2xl'}`}>

        {/* ═══ LEFT PANEL: Conversation List ═══ */}
        <div className="w-[320px] min-w-[320px] border-r border-gray-200 flex flex-col bg-gray-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#075e54]">
            <div className="flex items-center gap-2 text-white">
              <MessageCircle size={18} />
              <span className="text-sm font-bold">Messages</span>
            </div>
            <button onClick={onClose} className="text-white hover:text-white/80 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Search + Controls */}
          <div className="p-2 border-b border-gray-200 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-black placeholder-black/40 focus:outline-none focus:border-[#25D366]"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10px] text-black cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={includeResolved}
                  onChange={(e) => setIncludeResolved(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-500"
                />
                Show resolved
              </label>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-black text-sm">
                <MessageCircle size={32} className="mb-2 opacity-30" />
                <p className="font-medium">{isManager ? "No conversations" : "No conversations assigned to you"}</p>
              </div>
            ) : (
              filteredConversations.map((conv: any) => {
                const isSelected = conv.contactId === selectedContactId;
                const displayName = conv.contact?.name || conv.fromNumber || "Unknown";
                const lastBody = conv.lastMessage?.body || "";
                const truncatedBody = lastBody.length > 45 ? lastBody.substring(0, 45) + "..." : lastBody;
                const timeStr = conv.lastMessage?.createdAt ? formatRelativeTime(new Date(conv.lastMessage.createdAt)) : "";

                return (
                  <div
                    key={conv.contactId ?? conv.fromNumber ?? "null"}
                    onClick={() => {
                      setSelectedContactId(conv.contactId);
                      setSelectedPhoneNumber(conv.contactId === null ? conv.fromNumber : undefined);
                      setHasSelectedConversation(true);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-200 transition-colors ${
                      isSelected ? "bg-[#25D366]/10 border-l-2 border-l-[#25D366]" : "hover:bg-gray-100"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                      conv.lastMessage?.channel === "sms"
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                        : "bg-gradient-to-br from-[#25D366] to-[#128C7E]"
                    }`}>
                      {(displayName[0] || "?").toUpperCase()}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <StatusDot status={conv.conversationStatus || "open"} />
                          <span className="text-sm font-medium text-black truncate">{displayName}</span>
                          {/* Channel icon: 💬 green = WhatsApp, 📱 blue = SMS */}
                          <span
                            className={`flex-shrink-0 text-[11px] leading-none ${
                              conv.lastMessage?.channel === "sms" ? "text-blue-600" : "text-[#25D366]"
                            }`}
                            title={conv.lastMessage?.channel === "sms" ? "SMS" : "WhatsApp"}
                          >
                            {conv.lastMessage?.channel === "sms" ? "📱" : "💬"}
                          </span>
                        </div>
                        <span className="text-[10px] text-black flex-shrink-0">{timeStr}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-black truncate">{truncatedBody}</p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-1 flex-shrink-0 w-4 h-4 rounded-full bg-[#25D366] text-white text-[9px] flex items-center justify-center font-bold">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-black mt-0.5 truncate font-medium">{conv.assignedTo ? conv.assignedTo.userName : "Unassigned"}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ CENTER PANEL: Chat View ═══ */}
        <div className="flex-1 flex flex-col bg-[#e5ddd5] min-w-0 relative">
          {!hasSelectedConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-black">
              <MessageCircle size={48} className="mb-3 opacity-30" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose from the list on the left to start messaging</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-[#f0f2f5]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white text-xs font-bold">
                    {((selectedConversation?.contact?.name || selectedConversation?.fromNumber || "?")[0] || "?").toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-black">
                        {selectedConversation?.contact?.name || selectedConversation?.fromNumber || "Unknown"}
                      </span>
                      <StatusDot status={selectedConversation?.conversationStatus || "open"} />
                      <span className="text-[10px] text-black capitalize font-medium">
                        {selectedConversation?.conversationStatus || "open"}
                      </span>
                    </div>
                    <p className="text-[11px] text-black">{selectedConversation?.fromNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {windowInfo.remaining && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300 font-medium">
                      <Clock size={10} className="inline mr-1" />{windowInfo.remaining}
                    </span>
                  )}
                  {windowInfo.expired && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-medium">
                      24h expired
                    </span>
                  )}
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {messages && messages.length > 0 ? (
                  messages.map((msg: any, idx: number) => {
                    const msgDate = new Date(msg.createdAt);
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showDateSeparator = !prevMsg || !isSameDay(new Date(prevMsg.createdAt), msgDate);
                    const isOutbound = msg.direction === "outbound";

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-3">
                            <span className="text-[10px] bg-white text-black px-3 py-0.5 rounded-full shadow-sm font-medium">
                              {formatDateSeparator(msgDate)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
                          <div className={`max-w-[65%] px-3 py-1.5 rounded-lg text-sm relative ${
                            msg.channel === "sms"
                              ? isOutbound
                                ? "bg-blue-100 text-black rounded-tr-none border border-blue-200"
                                : "bg-blue-50 text-black rounded-tl-none shadow-sm border border-blue-200"
                              : isOutbound
                                ? "bg-[#dcf8c6] text-black rounded-tr-none"
                                : "bg-white text-black rounded-tl-none shadow-sm"
                          }`}>
                            {msg.mediaUrl && (
                              <img src={msg.mediaUrl} alt="Media" className="max-w-full rounded mb-1 max-h-48 object-cover" />
                            )}
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{msg.body || "[Template message]"}</p>
                            <div className={`flex items-center gap-1 mt-0.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
                              {msg.channel === "sms" ? (
                                <Smartphone size={10} className="text-blue-600" />
                              ) : (
                                <MessageCircle size={10} className="text-green-600" />
                              )}
                              <span className="text-[10px] text-black">{formatTime(msgDate)}</span>
                              {isOutbound && <MessageStatus status={msg.status} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-full text-black text-sm">No messages yet</div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 24h Window Expired Banner — only shown for WhatsApp channel */}
              {windowInfo.expired && selectedContactId !== null && replyChannel === "whatsapp" && (
                <div className="mx-3 mt-2 mb-1 flex items-center justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-black leading-snug">
                    ⚠️ 24-hour window expired — You can only send a Template message
                  </span>
                  <button
                    onClick={() => alert("Template selection coming soon")}
                    className="shrink-0 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-500 transition-colors"
                  >
                    Select Template
                  </button>
                </div>
              )}

              {/* Input Area */}
              <div className="px-3 py-2 border-t border-gray-200 bg-[#f0f2f5]">
                {/* Channel Toggle */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <button
                    onClick={() => setReplyChannel("whatsapp")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-w-[90px] ${
                      replyChannel === "whatsapp"
                        ? "bg-[#25D366] text-white shadow-sm"
                        : "bg-[#25D366]/20 text-black hover:bg-[#25D366]/30"
                    }`}
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={() => setReplyChannel("sms")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-w-[90px] ${
                      replyChannel === "sms"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-blue-600/20 text-black hover:bg-blue-600/30"
                    }`}
                  >
                    <span>📱</span>
                    <span>SMS</span>
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  {/* Emoji picker */}
                  <div className="relative">
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2 text-black hover:text-[#25D366] transition-colors">
                      <Smile size={20} />
                    </button>
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg p-2 shadow-xl z-50 w-64">
                        <div className="grid grid-cols-8 gap-1">
                          {COMMON_EMOJIS.map((emoji) => (
                            <button key={emoji} onClick={() => { setMessageInput(prev => prev + emoji); setShowEmojiPicker(false); messageInputRef.current?.focus(); }} className="w-7 h-7 flex items-center justify-center text-lg hover:bg-gray-100 rounded">
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Template picker */}
                  <button onClick={() => setShowTemplatePicker(!showTemplatePicker)} className="p-2 text-black hover:text-[#25D366] transition-colors" title="Send template">
                    <FileText size={20} />
                  </button>

                  {/* Text input */}
                  <textarea
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={windowInfo.expired && replyChannel === "whatsapp" ? "24h window expired — use a WhatsApp template" : replyChannel === "sms" ? "Type your SMS message..." : "Type a message..."}
                    disabled={windowInfo.expired && replyChannel === "whatsapp"}
                    rows={1}
                    className="flex-1 resize-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-black placeholder-black/40 focus:outline-none focus:border-[#25D366] disabled:opacity-50 disabled:cursor-not-allowed max-h-24"
                    style={{ minHeight: "36px" }}
                  />

                  {/* Send button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || (replyChannel === "whatsapp" && windowInfo.expired) || replyMutation.isPending || (selectedContactId === null && !selectedPhoneNumber)}
                    className={`p-2 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      replyChannel === "sms" ? "bg-blue-600 hover:bg-blue-500" : "bg-[#25D366] hover:bg-[#1fb855]"
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>

              {/* Template Picker Dropdown */}
              {showTemplatePicker && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-96 max-h-80 bg-white border border-gray-300 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                    <span className="text-sm font-semibold text-black">Templates</span>
                    <button onClick={() => setShowTemplatePicker(false)} className="text-black hover:text-red-500"><X size={16} /></button>
                  </div>
                  <div className="overflow-y-auto max-h-64 p-2 space-y-1">
                    {templates?.map((t: any) => (
                      <button key={t.sid} onClick={() => handleSendTemplate(t.sid, t.friendly_name)} className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors">
                        <p className="text-xs font-medium text-black">{t.friendly_name}</p>
                      </button>
                    ))}
                    {(!templates || templates.length === 0) && (
                      <p className="text-xs text-black text-center py-4">No templates available</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ RIGHT PANEL: Contact Details ═══ */}
        <div className="w-[260px] min-w-[260px] border-l border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
          {!hasSelectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-black text-sm">
              <p>No conversation selected</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Contact Info */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white text-xl font-bold mx-auto mb-2">
                  {((selectedConversation?.contact?.name || selectedConversation?.fromNumber || "?")[0] || "?").toUpperCase()}
                </div>
                <h3 className="text-sm font-semibold text-black">
                  {selectedConversation?.contact?.name || "Unknown"}
                </h3>
                <p className="text-xs text-black">{selectedConversation?.fromNumber}</p>
                {selectedConversation?.contact?.email && (
                  <p className="text-xs text-black mt-0.5">{selectedConversation.contact.email}</p>
                )}
              </div>

              {/* Lead Status */}
              {selectedConversation?.contact?.status && (
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-[10px] text-black uppercase tracking-wide mb-1 font-semibold">Lead Status</p>
                  <p className="text-xs text-black capitalize font-medium">{selectedConversation.contact.status}</p>
                </div>
              )}

              {/* Assignment */}
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] text-black uppercase tracking-wide mb-1 font-semibold">Assigned To</p>
                {currentAssignment ? (
                  <p className="text-xs text-black font-medium">{currentAssignment.userName}</p>
                ) : (
                  <p className="text-xs text-black italic">Unassigned</p>
                )}
              </div>

              {/* Conversation Status + Actions */}
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] text-black uppercase tracking-wide mb-2 font-semibold">Conversation</p>
                <div className="flex items-center gap-1.5 mb-2">
                  <StatusDot status={selectedConversation?.conversationStatus || "open"} />
                  <span className="text-xs text-black capitalize font-medium">
                    {selectedConversation?.conversationStatus || "open"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {selectedConversation?.conversationStatus !== "resolved" && (
                    <button
                      onClick={() => resolveConversation.mutate({ contactId: selectedContactId! })}
                      className="w-full text-[11px] px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-500 flex items-center justify-center gap-1 font-semibold"
                    >
                      <CheckCircle2 size={12} /> Resolve
                    </button>
                  )}
                  {selectedConversation?.conversationStatus === "resolved" && (
                    <button
                      onClick={() => reopenConversation.mutate({ contactId: selectedContactId! })}
                      className="w-full text-[11px] px-2 py-1.5 bg-green-700 text-white rounded hover:bg-green-600 flex items-center justify-center gap-1 font-semibold"
                    >
                      <RotateCcw size={12} /> Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

    </div>
  );

  if (inline) return content;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {content}
    </div>
  );
}
