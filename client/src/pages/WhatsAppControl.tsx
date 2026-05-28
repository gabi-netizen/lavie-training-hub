/**
 * WhatsApp Control — Full-page WhatsApp conversation management (Respond.io-style).
 * Accessible to ALL authenticated users.
 * - Managers (no team): see All / Unassigned / Mine tabs
 * - Agents (with team): see Unassigned / Mine tabs only
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Send,
  MessageCircle,
  Search,
  Smile,
  ChevronDown,
  UserPlus,
  X,
  CheckSquare,
  Square,
  Clock,
  CheckCircle2,
  RotateCcw,
  Users,
  FileText,
  BarChart3,
} from "lucide-react";
import { CampaignsList } from "@/components/CampaignsList";
import { CreateCampaignWizard } from "@/components/CreateCampaignWizard";
import { CampaignDetail } from "@/components/CampaignDetail";

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ─── Status indicator component ─────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-green-400",
    snoozed: "bg-yellow-400",
    resolved: "bg-gray-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-gray-400"}`} />;
}

// ─── Message status indicator ────────────────────────────────────────────────
function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return <SingleCheck color="#8696a0" />;
    case "delivered":
      return <DoubleCheck color="#8696a0" />;
    case "read":
      return <DoubleCheck color="#53bdeb" />;
    case "failed":
      return <span className="text-red-400 text-[10px]">!</span>;
    default:
      return null;
  }
}

// ─── 24h Window Helper ───────────────────────────────────────────────────────
function get24hWindowRemaining(messages: any[]): { expired: boolean; remaining: string | null } {
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  if (!lastInbound) return { expired: true, remaining: null };
  const lastInboundTime = new Date(lastInbound.createdAt).getTime();
  const windowEnd = lastInboundTime + 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (now > windowEnd) return { expired: true, remaining: null };
  const remainingMs = windowEnd - now;
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / 60000);
  return { expired: false, remaining: `${hours}h ${mins}m` };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function WhatsAppControl() {
  const { user } = useAuth();
  const seesAll = !user?.team;

  // State
  const [activeTab, setActiveTab] = useState<"unassigned" | "mine" | "all" | "campaigns">(
    seesAll ? "all" : "mine"
  );
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | undefined>(undefined);
  const [hasSelectedConversation, setHasSelectedConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showBulkTemplateModal, setShowBulkTemplateModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── tRPC Queries ──────────────────────────────────────────────────────────
  const {
    data: conversations,
    refetch: refetchConversations,
  } = trpc.whatsapp.conversations.useQuery(
    { tab: activeTab as any, includeResolved },
    { refetchInterval: 10000, enabled: activeTab !== "campaigns" }
  );

  const {
    data: messages,
    refetch: refetchMessages,
  } = trpc.whatsapp.messages.useQuery(
    { contactId: selectedContactId, phoneNumber: selectedPhoneNumber },
    { enabled: hasSelectedConversation, refetchInterval: 5000 }
  );

  const { data: templates } = trpc.whatsapp.templates.useQuery(undefined, {
    staleTime: 60000,
  });

  const { data: agents } = trpc.whatsapp.getAgents.useQuery(undefined, {
    staleTime: 60000,
  });

  const { data: currentAssignment, refetch: refetchAssignment } = trpc.whatsapp.getAssignment.useQuery(
    { contactId: selectedContactId! },
    { enabled: selectedContactId !== null && hasSelectedConversation }
  );

  // ─── tRPC Mutations ────────────────────────────────────────────────────────
  const markAsRead = trpc.whatsapp.markAsRead.useMutation({
    onSuccess: () => refetchConversations(),
  });

  const sendFreeText = trpc.whatsapp.sendFreeText.useMutation({
    onSuccess: () => {
      setMessageInput("");
      refetchMessages();
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendTemplate = trpc.whatsapp.send.useMutation({
    onSuccess: () => {
      toast.success("Template sent!");
      setShowTemplatePicker(false);
      refetchMessages();
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignConversation = trpc.whatsapp.assignConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation assigned!");
      setShowAssignModal(false);
      setShowBulkAssignModal(false);
      refetchConversations();
      refetchAssignment();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveConversation = trpc.whatsapp.resolveConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation resolved");
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  const reopenConversation = trpc.whatsapp.reopenConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation reopened");
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  const snoozeConversation = trpc.whatsapp.snoozeConversation.useMutation({
    onSuccess: (data) => {
      toast.success(`Snoozed until ${new Date(data.snoozedUntil).toLocaleString()}`);
      setShowSnoozeMenu(false);
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkSendTemplate = trpc.whatsapp.bulkSendTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(`Sent: ${data.sent}, Failed: ${data.failed}`);
      setShowBulkTemplateModal(false);
      setMultiSelectMode(false);
      setSelectedContactIds(new Set());
      refetchConversations();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Auto-scroll messages ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Mark as read when selecting a conversation ────────────────────────────
  useEffect(() => {
    if (hasSelectedConversation) {
      markAsRead.mutate({ contactId: selectedContactId, phoneNumber: selectedPhoneNumber });
    }
  }, [selectedContactId, selectedPhoneNumber, hasSelectedConversation]);

  // ─── Filter conversations by search ────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c: any) => {
      const name = c.contact?.name?.toLowerCase() || "";
      const phone = c.fromNumber?.toLowerCase() || "";
      const body = c.lastMessage?.body?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q) || body.includes(q);
    });
  }, [conversations, searchQuery]);

  // ─── Selected conversation data ────────────────────────────────────────────
  const selectedConversation = useMemo(() => {
    if (selectedContactId !== null) {
      return conversations?.find((c: any) => c.contactId === selectedContactId) ?? null;
    }
    if (selectedPhoneNumber) {
      return conversations?.find((c: any) => c.contactId === null && c.fromNumber === selectedPhoneNumber) ?? null;
    }
    return null;
  }, [conversations, selectedContactId, selectedPhoneNumber]);

  // ─── 24h window info ───────────────────────────────────────────────────────
  const windowInfo = useMemo(() => {
    if (!messages) return { expired: true, remaining: null };
    return get24hWindowRemaining(messages);
  }, [messages]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSendMessage = () => {
    if (!messageInput.trim() || !hasSelectedConversation || selectedContactId === null) return;
    sendFreeText.mutate({ contactId: selectedContactId, body: messageInput.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

    const handleSendTemplate = (contentSid: string, friendlyName: string) => {
    if (!hasSelectedConversation || selectedContactId === null) return;
    sendTemplate.mutate({ contactId: selectedContactId, contentSid, templateName: friendlyName });
  };
  const handleAssign = (assignedUserId: number) => {
    if (!hasSelectedConversation || selectedContactId === null) return;
    assignConversation.mutate({ contactId: selectedContactId, assignedUserId });
  };

  const handleBulkAssign = (assignedUserId: number) => {
    const ids = Array.from(selectedContactIds);
    for (const contactId of ids) {
      assignConversation.mutate({ contactId, assignedUserId });
    }
  };

  const handleBulkResolve = () => {
    const ids = Array.from(selectedContactIds);
    for (const contactId of ids) {
      resolveConversation.mutate({ contactId });
    }
    setMultiSelectMode(false);
    setSelectedContactIds(new Set());
  };

  const handleBulkSendTemplate = (contentSid: string, templateName?: string) => {
    const ids = Array.from(selectedContactIds);
    bulkSendTemplate.mutate({ contactIds: ids, contentSid, templateName });
  };

  const toggleContactSelection = (contactId: number | null) => {
    if (contactId === null) return;
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-56px)] bg-white overflow-hidden">
      {/* ═══ LEFT PANEL: Conversation List ═══ */}
      <div className="w-[320px] min-w-[320px] border-r border-gray-200 flex flex-col bg-gray-50">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {seesAll && (
            <>
              <button
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === "all"
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-black hover:text-blue-600"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab("campaigns")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === "campaigns"
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-black hover:text-blue-600"
                }`}
              >
                Campaigns
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === "unassigned"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-black hover:text-blue-600"
            }`}
          >
            Unassigned
          </button>
          <button
            onClick={() => setActiveTab("mine")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === "mine"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-black hover:text-blue-600"
            }`}
          >
            Mine
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
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-black placeholder-gray-400 focus:outline-none focus:border-[#25D366]"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10px] text-black cursor-pointer">
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                className="w-3 h-3 rounded border-gray-500"
              />
              Show resolved
            </label>
            <button
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                setSelectedContactIds(new Set());
              }}
              className={`text-[10px] px-2 py-0.5 rounded ${
                multiSelectMode
                  ? "bg-[#25D366] text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              {multiSelectMode ? "Cancel" : "Select"}
            </button>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {multiSelectMode && selectedContactIds.size > 0 && (
          <div className="p-2 border-b border-gray-200 bg-white flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-black">{selectedContactIds.size} selected</span>
            {seesAll && (
              <>
                <button
                  onClick={() => setShowBulkTemplateModal(true)}
                  className="text-[10px] px-2 py-1 bg-[#25D366] text-white rounded hover:bg-[#1fb855]"
                >
                  Send Template
                </button>
                <button
                  onClick={() => setShowBulkAssignModal(true)}
                  className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500"
                >
                  Assign All
                </button>
              </>
            )}
            <button
              onClick={handleBulkResolve}
              className="text-[10px] px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-500"
            >
              Resolve All
            </button>
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-black text-sm">
              <MessageCircle size={32} className="mb-2 opacity-50" />
              <p>No conversations</p>
            </div>
          ) : (
            filteredConversations.map((conv: any) => {
              const isSelected = conv.contactId !== null
                ? conv.contactId === selectedContactId
                : (conv.fromNumber === selectedPhoneNumber && selectedContactId === null);
              const displayName = conv.contact?.name || conv.fromNumber || "Unknown";
              const lastBody = conv.lastMessage?.body || "";
              const truncatedBody = lastBody.length > 45 ? lastBody.substring(0, 45) + "..." : lastBody;
              const timeStr = conv.lastMessage?.createdAt
                ? formatRelativeTime(new Date(conv.lastMessage.createdAt))
                : "";

              return (
                <div
                  key={conv.contactId ?? conv.fromNumber ?? "null"}
                  onClick={() => {
                    if (multiSelectMode) {
                      toggleContactSelection(conv.contactId);
                    } else {
                      setSelectedContactId(conv.contactId);
                      setSelectedPhoneNumber(conv.contactId === null ? conv.fromNumber : undefined);
                      setHasSelectedConversation(true);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-200 transition-colors ${
                    isSelected && !multiSelectMode
                      ? "bg-[#25D366]/10 border-l-2 border-l-[#25D366]"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {/* Multi-select checkbox */}
                  {multiSelectMode && (
                    <div className="flex-shrink-0">
                      {conv.contactId !== null && selectedContactIds.has(conv.contactId) ? (
                        <CheckSquare size={16} className="text-[#25D366]" />
                      ) : (
                        <Square size={16} className="text-black" />
                      )}
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(displayName[0] || "?").toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <StatusDot status={conv.conversationStatus || "open"} />
                        <span className="text-sm font-medium text-black truncate">
                          {displayName}
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
                    {conv.assignedTo && (
                      <p className="text-[10px] text-blue-600 mt-0.5 truncate">
                        {conv.assignedTo.userName}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ═══ CENTER PANEL: Chat Window / Campaigns ═══ */}
      <div className="flex-1 flex flex-col bg-[#e5ddd5] min-w-0 relative">
        {activeTab === "campaigns" ? (
          <div className="flex-1 bg-white overflow-hidden">
            {selectedCampaignId ? (
              <CampaignDetail 
                campaignId={selectedCampaignId} 
                onBack={() => setSelectedCampaignId(null)} 
              />
            ) : (
              <CampaignsList 
                onCreateClick={() => setShowCreateCampaign(true)} 
                onCampaignClick={(id) => setSelectedCampaignId(id)}
              />
            )}
          </div>
        ) : !hasSelectedConversation ? (
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
                    <span className="text-[10px] text-black capitalize">
                      {selectedConversation?.conversationStatus || "open"}
                    </span>
                  </div>
                  <p className="text-[11px] text-black">
                    {selectedConversation?.fromNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* 24h window indicator */}
                {windowInfo.remaining && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300">
                    <Clock size={10} className="inline mr-1" />
                    {windowInfo.remaining}
                  </span>
                )}
                {windowInfo.expired && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    24h expired
                  </span>
                )}
                {/* Assign button */}
                {seesAll && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 flex items-center gap-1"
                  >
                    <UserPlus size={12} />
                    Assign
                  </button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            >
              {messages && messages.length > 0 ? (
                messages.map((msg: any, idx: number) => {
                  const msgDate = new Date(msg.createdAt);
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showDateSeparator = !prevMsg || !isSameDay(new Date(prevMsg.createdAt), msgDate);
                  const isOutbound = msg.direction === "outbound";

                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-3">
                          <span className="text-[10px] bg-white text-black px-3 py-0.5 rounded-full shadow-sm">
                            {formatDateSeparator(msgDate)}
                          </span>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
                        <div
                          className={`max-w-[65%] px-3 py-1.5 rounded-lg text-sm relative ${
                            isOutbound
                              ? "bg-[#dcf8c6] text-black rounded-tr-none"
                              : "bg-white text-black rounded-tl-none shadow-sm"
                          }`}
                        >
                          {/* Media */}
                          {msg.mediaUrl && (
                            <img
                              src={msg.mediaUrl}
                              alt="Media"
                              className="max-w-full rounded mb-1 max-h-48 object-cover"
                            />
                          )}
                          {/* Body */}
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                            {msg.body}
                          </p>
                          {/* Time + status */}
                          <div className={`flex items-center gap-1 mt-0.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
                            <span className="text-[10px] text-black">{formatTime(msgDate)}</span>
                            {isOutbound && <MessageStatus status={msg.status} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center justify-center h-full text-black text-sm">
                  No messages yet
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 24h Window Expired Banner */}
            {windowInfo.expired && hasSelectedConversation && (
              <div className="mx-3 mt-2 mb-1 flex items-center justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-black leading-snug">
                  ⚠️ חלון 24 שעות נסגר — ניתן לשלוח רק הודעת Template
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
              <div className="flex items-end gap-2">
                {/* Emoji picker toggle */}
                <div className="relative">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 text-black hover:text-[#25D366] transition-colors"
                  >
                    <Smile size={20} />
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg p-2 shadow-xl z-50 w-64">
                      <div className="grid grid-cols-8 gap-1">
                        {COMMON_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setMessageInput((prev) => prev + emoji);
                              setShowEmojiPicker(false);
                              messageInputRef.current?.focus();
                            }}
                            className="w-7 h-7 flex items-center justify-center text-lg hover:bg-gray-100 rounded"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Template picker toggle */}
                <button
                  onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                  className="p-2 text-black hover:text-[#25D366] transition-colors"
                  title="Send template"
                >
                  <FileText size={20} />
                </button>

                {/* Text input */}
                <textarea
                  ref={messageInputRef}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={windowInfo.expired ? "24h window expired — use a template" : "Type a message..."}
                  disabled={windowInfo.expired}
                  rows={1}
                  className="flex-1 resize-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-[#25D366] disabled:opacity-50 disabled:cursor-not-allowed max-h-24"
                  style={{ minHeight: "36px" }}
                />

                {/* Send button */}
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || windowInfo.expired || sendFreeText.isPending}
                  className="p-2 bg-[#25D366] text-white rounded-full hover:bg-[#1fb855] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  <button onClick={() => setShowTemplatePicker(false)} className="text-black hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto max-h-64 p-2 space-y-1">
                  {templates?.map((t: any) => (
                    <button
                      key={t.sid}
                      onClick={() => handleSendTemplate(t.sid, t.friendly_name)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                    >
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
      <div className="w-[280px] min-w-[280px] border-l border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
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
                <p className="text-xs text-black capitalize">{selectedConversation.contact.status}</p>
              </div>
            )}

            {/* Assignment */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-[10px] text-black uppercase tracking-wide mb-1 font-semibold">Assigned To</p>
              {currentAssignment ? (
                <p className="text-xs text-black">{currentAssignment.assignedUserName}</p>
              ) : (
                <p className="text-xs text-black italic">Unassigned</p>
              )}
              {seesAll && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="mt-2 w-full text-[11px] px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 flex items-center justify-center gap-1"
                >
                  <UserPlus size={12} />
                  {currentAssignment ? "Reassign" : "Assign"}
                </button>
              )}
            </div>

            {/* Conversation Status */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-[10px] text-black uppercase tracking-wide mb-2 font-semibold">Conversation</p>
              <div className="flex items-center gap-1.5 mb-2">
                <StatusDot status={selectedConversation?.conversationStatus || "open"} />
                <span className="text-xs text-black capitalize">
                  {selectedConversation?.conversationStatus || "open"}
                </span>
              </div>

              {/* Action buttons */}
              <div className="space-y-1.5">
                {selectedConversation?.conversationStatus !== "resolved" && (
                  <button
                    onClick={() => resolveConversation.mutate({ contactId: selectedContactId! })}
                    className="w-full text-[11px] px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-500 flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 size={12} />
                    Resolve
                  </button>
                )}
                {selectedConversation?.conversationStatus === "resolved" && (
                  <button
                    onClick={() => reopenConversation.mutate({ contactId: selectedContactId! })}
                    className="w-full text-[11px] px-2 py-1.5 bg-green-700 text-white rounded hover:bg-green-600 flex items-center justify-center gap-1"
                  >
                    <RotateCcw size={12} />
                    Reopen
                  </button>
                )}
                {selectedConversation?.conversationStatus !== "resolved" && (
                  <div className="relative">
                    <button
                      onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                      className="w-full text-[11px] px-2 py-1.5 bg-yellow-700 text-white rounded hover:bg-yellow-600 flex items-center justify-center gap-1"
                    >
                      <Clock size={12} />
                      Snooze
                    </button>
                    {showSnoozeMenu && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg z-50">
                        {[
                          { label: "1 hour", hours: 1 },
                          { label: "4 hours", hours: 4 },
                          { label: "24 hours", hours: 24 },
                          { label: "3 days", hours: 72 },
                          { label: "7 days", hours: 168 },
                        ].map((opt) => (
                          <button
                            key={opt.hours}
                            onClick={() => {
                              snoozeConversation.mutate({
                                contactId: selectedContactId!,
                                durationHours: opt.hours,
                              });
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-black hover:bg-gray-100"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Snoozed Until */}
            {selectedConversation?.conversationStatus === "snoozed" && selectedConversation?.snoozedUntil && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                <p className="text-[10px] text-black uppercase tracking-wide mb-1 font-semibold">Snoozed Until</p>
                <p className="text-xs text-black">
                  {new Date(selectedConversation.snoozedUntil).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white border border-gray-300 rounded-lg w-80 max-h-96 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-black">Assign Conversation</span>
              <button onClick={() => setShowAssignModal(false)} className="text-black hover:text-red-500">
                <X size={16} />
              </button>
            </div>
            <div className="p-3">
              <input
                type="text"
                placeholder="Search agents..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-300 rounded text-sm text-black placeholder-gray-400 focus:outline-none focus:border-[#25D366] mb-2"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {agents
                  ?.filter((a: any) => a.name.toLowerCase().includes(assignSearch.toLowerCase()))
                  .map((agent: any) => (
                    <button
                      key={agent.id}
                      onClick={() => handleAssign(agent.id)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors flex items-center justify-between"
                    >
                      <span className="text-xs text-black">{agent.name}</span>
                      {agent.team && (
                        <span className="text-[10px] text-black capitalize">{agent.team}</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Modal */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowBulkAssignModal(false)}>
          <div className="bg-white border border-gray-300 rounded-lg w-80 max-h-96 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-black">Assign {selectedContactIds.size} conversations</span>
              <button onClick={() => setShowBulkAssignModal(false)} className="text-black hover:text-red-500">
                <X size={16} />
              </button>
            </div>
            <div className="p-3">
              <input
                type="text"
                placeholder="Search agents..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-300 rounded text-sm text-black placeholder-gray-400 focus:outline-none focus:border-[#25D366] mb-2"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {agents
                  ?.filter((a: any) => a.name.toLowerCase().includes(assignSearch.toLowerCase()))
                  .map((agent: any) => (
                    <button
                      key={agent.id}
                      onClick={() => handleBulkAssign(agent.id)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors flex items-center justify-between"
                    >
                      <span className="text-xs text-black">{agent.name}</span>
                      {agent.team && (
                        <span className="text-[10px] text-black capitalize">{agent.team}</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Template Modal */}
      {showBulkTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowBulkTemplateModal(false)}>
          <div className="bg-white border border-gray-300 rounded-lg w-96 max-h-96 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-black">Send Template to {selectedContactIds.size} contacts</span>
              <button onClick={() => setShowBulkTemplateModal(false)} className="text-black hover:text-red-500">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-72 p-2 space-y-1">
              {templates?.map((t: any) => (
                <button
                  key={t.sid}
                  onClick={() => handleBulkSendTemplate(t.sid, t.friendly_name)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                >
                  <p className="text-xs font-medium text-black">{t.friendly_name}</p>
                </button>
              ))}
              {(!templates || templates.length === 0) && (
                <p className="text-xs text-black text-center py-4">No templates available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Wizard */}
      {showCreateCampaign && (
        <CreateCampaignWizard 
          onClose={() => setShowCreateCampaign(false)}
          onSuccess={() => {
            setShowCreateCampaign(false);
            setActiveTab("campaigns");
          }}
        />
      )}
    </div>
  );
}
