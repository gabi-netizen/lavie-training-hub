import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PersonalButlerTab } from "@/components/PersonalButlerTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw,
  Search,
  Mail,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  SlidersHorizontal,
  Package,
  CreditCard,
  MapPin,
  Heart,
  Forward,
  Bot,
  HelpCircle,
  MailQuestion,
  User,
  UserCheck,
  Building2,
  Cpu,
  Reply,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Ban,
  ShieldOff,
  Trash2,
  Users,
  MessageCircle,
  Paperclip,
  X,
  FileText,
  BookOpen,
} from "lucide-react";
const WhatsAppControl = lazy(() => import("@/pages/WhatsAppControl"));

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  cancellation_request: { label: "Cancellation", bg: "bg-red-100", text: "text-red-700", icon: XCircle },
  shipping_delivery_issue: { label: "Shipping/Delivery", bg: "bg-orange-100", text: "text-orange-700", icon: Package },
  payment_billing_dispute: { label: "Payment/Billing", bg: "bg-blue-100", text: "text-blue-700", icon: CreditCard },
  address_update: { label: "Address Update", bg: "bg-purple-100", text: "text-purple-700", icon: MapPin },
  product_feedback: { label: "Product Feedback", bg: "bg-emerald-100", text: "text-emerald-700", icon: Heart },
  agent_forwarded: { label: "Agent Forwarded", bg: "bg-indigo-100", text: "text-indigo-700", icon: Forward },
  system_automated: { label: "System/Automated", bg: "bg-slate-100", text: "text-slate-600", icon: Bot },
  follow_up_unanswered: { label: "Follow-up", bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
  subscription_question: { label: "Subscription Q", bg: "bg-sky-100", text: "text-sky-700", icon: HelpCircle },
  general_inquiry: { label: "General Inquiry", bg: "bg-slate-100", text: "text-slate-700", icon: MailQuestion },
};

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  HIGH: { label: "High", dot: "bg-red-500", text: "text-red-700" },
  MEDIUM: { label: "Medium", dot: "bg-amber-400", text: "text-amber-700" },
  LOW: { label: "Low", dot: "bg-green-500", text: "text-green-700" },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: "Open", bg: "bg-blue-100", text: "text-blue-700" },
  in_progress: { label: "In Progress", bg: "bg-amber-100", text: "text-amber-700" },
  awaiting_response: { label: "Awaiting Response", bg: "bg-purple-100", text: "text-purple-700" },
  customer_replied: { label: "Customer Replied", bg: "bg-orange-500", text: "text-white" },
  resolved: { label: "Resolved", bg: "bg-green-100", text: "text-green-700" },
  closed: { label: "Closed", bg: "bg-slate-100", text: "text-slate-600" },
};

const CUSTOMER_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  existing: { label: "Existing", bg: "bg-blue-100", text: "text-blue-700", icon: UserCheck },
  new: { label: "New", bg: "bg-green-100", text: "text-green-700", icon: User },
  internal: { label: "Internal", bg: "bg-indigo-100", text: "text-indigo-600", icon: Building2 },
  system: { label: "System", bg: "bg-slate-100", text: "text-slate-600", icon: Cpu },
};

// ─── Agent Badge Config ─────────────────────────────────────────────────────

const AGENT_BADGE_CONFIG: Record<string, { bg: string; text: string }> = {
  Guy: { bg: "bg-violet-100", text: "text-violet-700" },
  James: { bg: "bg-teal-100", text: "text-teal-700" },
  Rob: { bg: "bg-rose-100", text: "text-rose-700" },
};

// ─── Retention email → display name mapping (for reply box) ─────────────────
const RETENTION_EMAIL_DISPLAY: Record<string, string> = {
  "guy@lavielabs.com": "Guy Eli <guy@lavielabs.com>",
  "james.h@lavielabs.com": "James Huxley <james.h@lavielabs.com>",
  "rob.c@lavielabs.com": "Rob Chizdik <rob.c@lavielabs.com>",
};

const RETENTION_EMAILS = ["guy@lavielabs.com", "james.h@lavielabs.com", "rob.c@lavielabs.com"];

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general_inquiry;
}
function getPriorityConfig(p: string) {
  return PRIORITY_CONFIG[p] || PRIORITY_CONFIG.MEDIUM;
}
function getStatusConfig(s: string) {
  return STATUS_CONFIG[s] || STATUS_CONFIG.open;
}
function getCustomerStatusConfig(cs: string) {
  return CUSTOMER_STATUS_CONFIG[cs] || CUSTOMER_STATUS_CONFIG.new;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "\u2014";
  }
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours < 24) {
    if (remainingMins === 0) return `${hours}h ago`;
    return `${hours}h ${remainingMins}m ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// ─── Conversation Thread Component ──────────────────────────────────────────

function ConversationThread({ ticketId, originalBody, originalFrom, originalDate }: {
  ticketId: number;
  originalBody: string;
  originalFrom: string;
  originalDate: string;
}) {
  const { data: replies, refetch: refetchReplies } = trpc.tickets.getReplies.useQuery(
    { ticketId },
    { refetchOnWindowFocus: false }
  );

  // Build the full conversation: original message + replies
  const conversation = useMemo(() => {
    const items: Array<{
      id: string;
      direction: "inbound" | "outbound";
      body: string;
      sentBy: string;
      sentAt: string;
    }> = [
      {
        id: "original",
        direction: "inbound",
        body: originalBody || "(no body)",
        sentBy: originalFrom,
        sentAt: originalDate,
      },
    ];

    if (replies) {
      for (const reply of replies) {
        items.push({
          id: String(reply.id),
          direction: reply.direction as "inbound" | "outbound",
          body: reply.body,
          sentBy: reply.sentBy,
          sentAt: reply.sentAt,
        });
      }
    }

    return items;
  }, [replies, originalBody, originalFrom, originalDate]);

  return (
    <div className="space-y-3">
      {conversation.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-lg border p-3 ${
            msg.direction === "outbound"
              ? "bg-indigo-50 border-indigo-200 ml-6"
              : "bg-white border-gray-200 mr-6"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            {msg.direction === "outbound" ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-indigo-600" />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5 text-gray-500" />
            )}
            <span className={`text-xs font-semibold ${
              msg.direction === "outbound" ? "text-indigo-700" : "text-gray-700"
            }`}>
              {msg.sentBy}
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              {formatDateTime(msg.sentAt)}
            </span>
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {msg.body}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Reply Box Component ────────────────────────────────────────────────────

interface AttachedFile {
  filename: string;
  contentType: string;
  size: number;
  buffer: string; // base64
}

// ─── Email Templates ────────────────────────────────────────────────────────
const EMAIL_TEMPLATES = [
  {
    name: "Welcome",
    subject: "Welcome to Lavié Labs!",
    body: `Thank you for choosing Lavié Labs! We're thrilled to have you on board.\n\nYour order is being processed and you'll receive a shipping confirmation shortly.\n\nIf you have any questions, don't hesitate to reach out — we're here to help!`,
  },
  {
    name: "Cancellation Confirmation",
    subject: "Your cancellation has been processed",
    body: `We're sorry to see you go. Your subscription has been successfully cancelled.\n\nIf you change your mind, we'd love to welcome you back anytime.\n\nIs there anything we could have done differently? Your feedback helps us improve.`,
  },
  {
    name: "Refund Processed",
    subject: "Your refund has been processed",
    body: `We've processed your refund. Please allow 5-10 business days for the amount to appear in your account.\n\nIf you don't see it within that timeframe, please let us know and we'll look into it right away.`,
  },
  {
    name: "Shipping Update",
    subject: "Your order is on its way!",
    body: `Great news! Your order has been shipped and is on its way to you.\n\nPlease allow 7-14 business days for delivery. You'll receive a tracking number once available.\n\nIf you have any questions about your delivery, we're happy to help!`,
  },
  {
    name: "Follow Up",
    subject: "Following up on your inquiry",
    body: `I wanted to follow up on your recent inquiry to make sure everything has been resolved.\n\nIs there anything else I can help you with? We want to make sure you're completely satisfied.`,
  },
  {
    name: "Invoice Request",
    subject: "Your invoice from Lavié Labs",
    body: `Please find your invoice attached to this email.\n\nIf you have any questions about the charges or need any adjustments, please don't hesitate to reach out.`,
  },
];

function ReplyBox({ ticketId, onReplySent, recipient }: { ticketId: number; onReplySent: () => void; recipient?: string | null }) {
  const { user } = useAuth();
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-append signature
  const agentName = user?.name || "Lavie Labs Support";
  const signature = `\n\nWarm regards,\n${agentName}\nLavié Labs\nwww.lavielabs.com`;

  const replyMutation = trpc.tickets.replyToTicket.useMutation({
    onSuccess: () => {
      toast.success("Reply sent successfully");
      setReplyText("");
      setAttachedFiles([]);
      setShowReplyBox(false);
      onReplySent();
    },
    onError: (e: { message: string }) => {
      toast.error(`Failed to send reply: ${e.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      const res = await fetch("/api/ticket-attachment-upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      setAttachedFiles((prev) => [...prev, ...data.files]);
      toast.success(`${data.files.length} file(s) attached`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to upload files");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Determine the "Sent from" display
  const isRetentionTicket = recipient && RETENTION_EMAILS.includes(recipient);
  const sentFromDisplay = isRetentionTicket
    ? RETENTION_EMAIL_DISPLAY[recipient!] || recipient
    : "Lavie Labs Support <trial@lavielabs.com>";

  if (!showReplyBox) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
        onClick={() => setShowReplyBox(true)}
      >
        <Reply className="h-4 w-4" />
        Reply
      </Button>
    );
  }

  const applyTemplate = (template: typeof EMAIL_TEMPLATES[0]) => {
    setReplyText(template.body + signature);
    setShowTemplates(false);
  };

  return (
    <div className="bg-white rounded-lg border border-indigo-200 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Reply className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-700">Write Reply</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50 transition-colors"
        >
          <Paperclip className="h-3 w-3" />
          {uploading ? "Uploading..." : "Attach File"}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1 hover:bg-purple-50 transition-colors"
          >
            <BookOpen className="h-3 w-3" />
            Templates
            <ChevronDown className="h-3 w-3" />
          </button>
          {showTemplates && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56">
              {EMAIL_TEMPLATES.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => applyTemplate(template)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 first:rounded-t-lg last:rounded-b-lg transition-colors"
                >
                  <span className="font-medium text-gray-700">{template.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (!replyText.includes(signature)) {
              setReplyText((prev) => prev + signature);
            }
          }}
          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2 py-1 hover:bg-green-50 transition-colors"
          title="Add signature"
        >
          <User className="h-3 w-3" />
          Signature
        </button>
        <button
          onClick={() => { setShowReplyBox(false); setAttachedFiles([]); }}
          className="ml-auto text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
      <Textarea
        value={replyText}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyText(e.target.value)}
        placeholder="Type your reply to the customer..."
        className="min-h-[120px] text-sm resize-y"
        autoFocus
        spellCheck={true}
      />
      {/* Attached files list */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs">
              <FileText className="h-3 w-3 text-gray-500" />
              <span className="max-w-[150px] truncate">{file.filename}</span>
              <span className="text-gray-400">({(file.size / 1024).toFixed(0)}KB)</span>
              <button onClick={() => removeFile(idx)} className="ml-1 text-red-400 hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <p className="text-xs text-black font-medium">
          Sent from: {sentFromDisplay}
        </p>
        <Button
          size="sm"
          className="gap-1.5 bg-purple-800 hover:bg-purple-900 text-white font-bold shadow-md"
          disabled={!replyText.trim() || replyMutation.isPending}
          onClick={() => {
            replyMutation.mutate({
              ticketId,
              replyText: replyText.trim(),
              attachments: attachedFiles.length > 0 ? attachedFiles.map(f => ({
                filename: f.filename,
                contentType: f.contentType,
                buffer: f.buffer,
              })) : undefined,
            });
          }}
        >
          <Send className="h-3.5 w-3.5" />
          {replyMutation.isPending ? "Sending..." : `Send Reply${attachedFiles.length > 0 ? ` (${attachedFiles.length} file${attachedFiles.length > 1 ? "s" : ""})` : ""}`}
        </Button>
      </div>
    </div>
  );
}

// ─── Blocked Senders Management Section ─────────────────────────────────────

function BlockedSendersSection() {
  const utils = trpc.useUtils();
  const { data: blockedList, isLoading } = trpc.tickets.listBlockedSenders.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const unblockMutation = trpc.tickets.unblockSender.useMutation({
    onSuccess: () => {
      toast.success("Sender unblocked");
      utils.tickets.listBlockedSenders.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-600">Loading blocked senders...</span>
      </div>
    );
  }

  if (!blockedList || blockedList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <ShieldOff className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No blocked senders</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          When you block a sender from a ticket, their email will appear here. Blocked senders will not generate new tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-600 mb-3">
        {blockedList.length} blocked sender{blockedList.length !== 1 ? "s" : ""}. Emails from these addresses are silently dropped.
      </div>
      {blockedList.map((item) => (
        <div
          key={item.id}
          className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Ban className="h-4 w-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{item.email}</p>
            <p className="text-xs text-gray-500">
              Blocked by {item.blockedBy} on {formatDate(item.blockedAt)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 gap-1 text-green-700 border-green-200 hover:bg-green-50"
            disabled={unblockMutation.isPending}
            onClick={() => {
              if (window.confirm(`Unblock ${item.email}? They will be able to create tickets again.`)) {
                unblockMutation.mutate({ id: item.id });
              }
            }}
          >
            <ShieldOff className="h-3 w-3" />
            Unblock
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Blocked Subjects Management Section ────────────────────────────────────

function BlockedSubjectsSection() {
  const utils = trpc.useUtils();
  const { data: blockedList, isLoading } = trpc.tickets.listBlockedSubjects.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const unblockMutation = trpc.tickets.unblockSubject.useMutation({
    onSuccess: () => {
      toast.success("Subject keyword unblocked");
      utils.tickets.listBlockedSubjects.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-600">Loading blocked subjects...</span>
      </div>
    );
  }

  if (!blockedList || blockedList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <ShieldOff className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No blocked subjects</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          When you block a subject keyword from a ticket, it will appear here. Emails with matching subjects will not generate new tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-600 mb-3">
        {blockedList.length} blocked subject{blockedList.length !== 1 ? "s" : ""}. Emails whose subject contains these keywords are silently dropped.
      </div>
      {blockedList.map((item) => (
        <div
          key={item.id}
          className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
            <Ban className="h-4 w-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">"{item.keyword}"</p>
            <p className="text-xs text-gray-500">
              Blocked by {item.blockedBy} on {formatDate(item.blockedAt)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 gap-1 text-green-700 border-green-200 hover:bg-green-50"
            disabled={unblockMutation.isPending}
            onClick={() => {
              if (window.confirm(`Unblock subject keyword "${item.keyword}"? Emails with this subject will create tickets again.`)) {
                unblockMutation.mutate({ id: item.id });
              }
            }}
          >
            <ShieldOff className="h-3 w-3" />
            Unblock
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SupportTickets() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // View mode: "tickets", "retention", "blocked", "blockedSubjects", "whatsapp", "butler", or "butlerUsage"
  const urlTab = new URLSearchParams(window.location.search).get("tab") as "tickets" | "retention" | "blocked" | "blockedSubjects" | "whatsapp" | "butler" | "butlerUsage" | null;
  const [viewMode, setViewModeState] = useState<"tickets" | "retention" | "blocked" | "blockedSubjects" | "whatsapp" | "butler" | "butlerUsage">(urlTab || "tickets");
  const setViewMode = (mode: "tickets" | "retention" | "blocked" | "blockedSubjects" | "whatsapp" | "butler" | "butlerUsage") => {
    setViewModeState(mode);
    window.history.replaceState(null, "", `/support-tickets?tab=${mode}`);
  };
  const isManager = !user?.team; // Managers have no team assigned

  // Fetch unread WhatsApp messages count for the badge
  const { data: whatsappConversations } = trpc.whatsapp.conversations.useQuery(undefined, {
    enabled: isManager,
    refetchInterval: 10_000, // Poll every 10s
    refetchOnWindowFocus: false,
  });
  const whatsappUnreadCount = useMemo(() => {
    if (!whatsappConversations) return 0;
    return whatsappConversations.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);
  }, [whatsappConversations]);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "all">("all");
  const [search, setSearch] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Expanded ticket
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});

  // Send to Retention modal state
  const [sendToRetentionTicket, setSendToRetentionTicket] = useState<any | null>(null);
  const [retentionLeadType, setRetentionLeadType] = useState("Pre-Cycle-Cancelled");
  const [retentionAgent, setRetentionAgent] = useState("Rob");
  const [retentionCustomerName, setRetentionCustomerName] = useState("");
  const [retentionEmail, setRetentionEmail] = useState("");
  const [retentionPhone, setRetentionPhone] = useState("");
  const [retentionNote, setRetentionNote] = useState("");

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t: any) => t.id)));
    }
  };

  // Determine recipientType based on viewMode
  const recipientType = viewMode === "retention" ? "retention" : "support";

  // Data
  const {
    data: ticketsData,
    isLoading,
    isFetching,
    refetch,
  } = trpc.tickets.getTickets.useQuery(
    {
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      dateRange,
      search: search || undefined,
      perPage: 200,
      recipientType,
    },
    { refetchOnWindowFocus: false, refetchInterval: 60_000 }
  );

  const { data: stats } = trpc.tickets.getStats.useQuery(
    { recipientType },
    {
      refetchOnWindowFocus: false,
      refetchInterval: 60_000,
    }
  );

  const updateTicket = trpc.tickets.updateTicket.useMutation({
    onSuccess: () => {
      toast.success("Ticket updated");
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const bulkUpdateStatus = trpc.tickets.bulkUpdateStatus.useMutation({
    onSuccess: (data: { count: number }) => {
      toast.success(`${data.count} tickets updated`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const bulkDelete = trpc.tickets.bulkDelete.useMutation({
    onSuccess: (data: { count: number }) => {
      toast.success(`${data.count} tickets deleted`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const blockSenderMutation = trpc.tickets.blockSender.useMutation({
    onSuccess: () => {
      toast.success("Sender blocked. Future emails from this address will be dropped.");
      utils.tickets.listBlockedSenders.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const blockSubjectMutation = trpc.tickets.blockSubject.useMutation({
    onSuccess: () => {
      toast.success("Subject keyword blocked. Future emails with this subject will be dropped.");
      utils.tickets.listBlockedSubjects.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const tickets = ticketsData?.tickets ?? [];
  const total = ticketsData?.total ?? 0;

  const activeFilterCount = [categoryFilter, priorityFilter, dateRange]
    .filter((v) => v !== "all")
    .length + (statusFilter !== "all" && statusFilter !== "active" ? 1 : 0);

  const handleBlockSender = (email: string) => {
    if (window.confirm(`Are you sure you want to block "${email}"?\n\nFuture emails from this address will be silently dropped and no ticket will be created.`)) {
      blockSenderMutation.mutate({
        email,
        blockedBy: user?.name || user?.email || "Unknown Agent",
      });
    }
  };

  const handleBlockSubject = (subject: string) => {
    const keyword = window.prompt(
      `Block emails by subject keyword.\n\nThe current subject is:\n"${subject}"\n\nEnter the keyword/phrase to block (case-insensitive):`,
      subject
    );
    if (keyword && keyword.trim()) {
      if (window.confirm(`Block all future emails whose subject contains:\n"${keyword.trim()}"\n\nAre you sure?`)) {
        blockSubjectMutation.mutate({
          keyword: keyword.trim(),
          blockedBy: user?.name || user?.email || "Unknown Agent",
        });
      }
    }
  };

  const isAdmin = user?.role === "admin";

  // ─── Send to Retention Modal ─────────────────────────────────────────────
  // Reset modal fields when a new ticket is opened
  useEffect(() => {
    if (sendToRetentionTicket) {
      setRetentionLeadType("Pre-Cycle-Cancelled");
      setRetentionAgent("Rob");
      setRetentionCustomerName(sendToRetentionTicket.fromName || "");
      setRetentionEmail(sendToRetentionTicket.fromEmail || "");
      setRetentionPhone("");
      setRetentionNote((sendToRetentionTicket.body || "").slice(0, 200));
    }
  }, [sendToRetentionTicket]);

  const createLeadMutation = trpc.manager.createLead.useMutation({
    onSuccess: () => {
      toast.success("Sent to Retention");
      if (sendToRetentionTicket) updateTicket.mutate({ id: sendToRetentionTicket.id, status: "resolved" });
      setSendToRetentionTicket(null);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const SendToRetentionModal = () => {
    const ticket = sendToRetentionTicket;
    if (!ticket) return null;

    const handleSubmit = () => {
      createLeadMutation.mutate({
        customerName: retentionCustomerName,
        email: retentionEmail,
        phone: retentionPhone,
        leadType: retentionLeadType,
        assignedAgent: retentionAgent,
        managerNote: retentionNote,
        leadCategory: "subscription",
      });
    };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Send to Retention</h2>
            <button
              onClick={() => setSendToRetentionTicket(null)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Lead Type */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Lead Type</label>
              <Select value={retentionLeadType} onValueChange={setRetentionLeadType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pre-Cycle-Cancelled">Pre-Cycle-Cancelled</SelectItem>
                  <SelectItem value="Cancel Live Sub (Cycle 1)">Cancel Live Sub (Cycle 1)</SelectItem>
                  <SelectItem value="Cancel Live Sub (Cycle 2+)">Cancel Live Sub (Cycle 2+)</SelectItem>
                  <SelectItem value="Cat to Rob">Cat to Rob</SelectItem>
                  <SelectItem value="Pre-Cycle-Decline">Pre-Cycle-Decline</SelectItem>
                  <SelectItem value="Hot Lead">Hot Lead</SelectItem>
                  <SelectItem value="Decline Live Sub">Decline Live Sub</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agent */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Agent</label>
              <Select value={retentionAgent} onValueChange={setRetentionAgent}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rob">Rob</SelectItem>
                  <SelectItem value="Guy">Guy</SelectItem>
                  <SelectItem value="James">James</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Customer Name */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Customer Name</label>
              <Input
                value={retentionCustomerName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRetentionCustomerName(e.target.value)}
                placeholder="Customer name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
              <Input
                value={retentionEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRetentionEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phone</label>
              <Input
                value={retentionPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRetentionPhone(e.target.value)}
                placeholder="+44..."
              />
            </div>

            {/* Customer Note */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Customer Note</label>
              <Textarea
                value={retentionNote}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRetentionNote(e.target.value)}
                placeholder="Notes from the ticket..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setSendToRetentionTicket(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSubmit}
              disabled={createLeadMutation.isPending}
            >
              {createLeadMutation.isPending ? "Sending..." : "Send to Retention"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Send to Retention Modal */}
      <SendToRetentionModal />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Mail className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Support Tickets</h1>
              <p className="text-sm text-gray-600">Email inbox &mdash; auto-categorized</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => { setViewMode("tickets"); setSelectedIds(new Set()); setExpandedId(null); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "tickets"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Tickets
              </button>
              <button
                onClick={() => { setViewMode("retention"); setSelectedIds(new Set()); setExpandedId(null); setStatusFilter("active"); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "retention"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Retention
                </span>
              </button>
              <button
                onClick={() => setViewMode("butler")}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  viewMode === "butler"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-purple-600 hover:bg-purple-50"
                }`}
              >
                Sir Carlton
              </button>
              {isManager && (
                <button
                  onClick={() => setViewMode("whatsapp")}
                  className={`relative px-3 py-1.5 text-xs font-medium transition-colors bg-blue-700 text-white hover:bg-blue-800 ${whatsappUnreadCount > 0 && viewMode !== "whatsapp" ? "animate-pulse" : ""}`}
                >
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    Messages
                    {whatsappUnreadCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                        {whatsappUnreadCount}
                      </span>
                    )}
                  </span>
                </button>
              )}
              {isAdmin && (
                <>
                  <button
                    onClick={() => setViewMode("blocked")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "blocked"
                        ? "bg-red-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Senders
                    </span>
                  </button>
                  <button
                    onClick={() => setViewMode("blockedSubjects")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "blockedSubjects"
                        ? "bg-orange-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Subjects
                    </span>
                  </button>
                  <button
                    onClick={() => setViewMode("butlerUsage")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "butlerUsage"
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-indigo-600 hover:bg-indigo-50"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      ⚡ Sir Carlton Usage
                    </span>
                  </button>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isFetching ? 'Loading...' : 'Refresh'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Blocked Senders View */}
      {viewMode === "blocked" && (
        <div className="px-3 sm:px-6 py-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Ban className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-bold text-gray-900">Blocked Senders</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Emails from blocked senders are silently dropped by the inbound webhook. No ticket is created and Postmark receives a 200 OK response.
            </p>
            <BlockedSendersSection />
          </div>
        </div>
      )}

      {/* Blocked Subjects View */}
      {viewMode === "blockedSubjects" && (
        <div className="px-3 sm:px-6 py-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Ban className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-bold text-gray-900">Blocked Subjects</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Emails whose subject contains any of these keywords will be silently dropped. The match is case-insensitive.
            </p>
            <BlockedSubjectsSection />
          </div>
        </div>
      )}

      {/* Sir Carlton View */}
      {viewMode === "butler" && (
        <div className="px-3 sm:px-6 py-6">
          <PersonalButlerTab />
        </div>
      )}

      {/* Sir Carlton Usage View (admin only) */}
      {viewMode === "butlerUsage" && <ButlerUsagePanel />}

      {/* WhatsApp Control View */}
      {viewMode === "whatsapp" && (
        <div className="px-0 py-0" style={{ height: "calc(100vh - 140px)" }}>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-gray-500">Loading Messages...</p></div>}>
            <WhatsAppControl />
          </Suspense>
        </div>
      )}
      {/* Tickets View (both "tickets" and "retention" modes) */}
      {(viewMode === "tickets" || viewMode === "retention") && (
        <>
          {/* Stats Row */}
          <div className="px-3 sm:px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total Open */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Inbox className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalOpen ?? 0}</p>
                  <p className="text-xs text-gray-600 font-medium">Open Tickets</p>
                </div>
              </div>
              {/* High Priority */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats?.highPriority ?? 0}</p>
                  <p className="text-xs text-gray-600 font-medium">High Priority</p>
                </div>
              </div>
              {/* Awaiting Response */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats?.awaitingResponse ?? 0}</p>
                  <p className="text-xs text-gray-600 font-medium">Awaiting Response</p>
                </div>
              </div>
              {/* Resolved Today */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats?.resolvedToday ?? 0}</p>
                  <p className="text-xs text-gray-600 font-medium">Resolved Today</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
            <div className="flex items-center gap-2.5">
              {/* Search */}
              <div className="relative w-52 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm w-full"
                />
              </div>

              {/* Mobile filter toggle */}
              <Button
                variant="outline"
                size="sm"
                className="sm:hidden h-9 px-3 gap-1.5 text-sm shrink-0"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {/* Desktop filters */}
              <div className="hidden sm:flex items-center gap-2">
                {/* Category */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 w-[160px] text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Priority */}
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-9 w-[120px] text-sm">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>

                {/* Status */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-[150px] text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active (excl. Closed/Resolved)</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
                    <SelectItem value="customer_replied">Customer Replied</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date Range */}
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger className="h-9 w-[120px] text-sm">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Result count */}
              <span className="text-xs text-gray-600 ml-auto whitespace-nowrap">
                {total} ticket{total !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Mobile filters (collapsible) */}
            {showMobileFilters && (
              <div className="sm:hidden flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 w-[140px] text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-9 w-[110px] text-sm">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-[140px] text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active (excl. Closed/Resolved)</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
                    <SelectItem value="customer_replied">Customer Replied</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger className="h-9 w-[110px] text-sm">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Ticket List */}
          <div className="px-3 sm:px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-600">Loading tickets...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <Inbox className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">No tickets found</h3>
                <p className="text-sm text-gray-600 max-w-sm">
                  {search || categoryFilter !== "all" || priorityFilter !== "all" || (statusFilter !== "all" && statusFilter !== "active")
                    ? "Try adjusting your filters or search query."
                    : viewMode === "retention"
                    ? "Retention tickets will appear here when emails arrive at guy@, james.h@, or rob.c@lavielabs.com."
                    : "Tickets will appear here when emails arrive at support@lavielabs.com."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Bulk Action Bar */}
                {isAdmin && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === tickets.length && tickets.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    {selectedIds.size > 0 ? (
                      <>
                        <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => bulkUpdateStatus.mutate({ ticketIds: Array.from(selectedIds), status: "resolved" })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => bulkUpdateStatus.mutate({ ticketIds: Array.from(selectedIds), status: "closed" })}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Close
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete ${selectedIds.size} ticket(s)? This cannot be undone.`)) {
                                bulkDelete.mutate({ ticketIds: Array.from(selectedIds) });
                              }
                            }}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-gray-500"
                            onClick={() => setSelectedIds(new Set())}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">Select tickets for bulk actions</span>
                    )}
                  </div>
                )}

                {tickets.map((ticket: any) => {
                  const catCfg = getCategoryConfig(ticket.category);
                  const priCfg = getPriorityConfig(ticket.priority);
                  const statusCfg = getStatusConfig(ticket.status);
                  const custCfg = getCustomerStatusConfig(ticket.customerStatus);
                  const CatIcon = catCfg.icon;
                  const CustIcon = custCfg.icon;
                  const isExpanded = expandedId === ticket.id;
                  const agentBadge = ticket.agentLabel ? AGENT_BADGE_CONFIG[ticket.agentLabel] : null;

                  return (
                    <div
                      key={ticket.id}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all"
                    >
                      {/* Ticket Row */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        {/* Checkbox */}
                        {isAdmin && (
                          <div className="shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(ticket.id)}
                              onClick={(e) => toggleSelect(ticket.id, e)}
                              onChange={() => {}}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        )}

                        {/* Priority dot */}
                        <div className="shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full ${priCfg.dot}`} title={priCfg.label} />
                        </div>

                        {/* Category badge */}
                        <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.bg} ${catCfg.text} flex items-center gap-1`}>
                          <CatIcon className="h-3 w-3" />
                          <span className="hidden sm:inline">{catCfg.label}</span>
                        </div>

                        {/* Agent badge (retention tab only) */}
                        {viewMode === "retention" && agentBadge && ticket.agentLabel && (
                          <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${agentBadge.bg} ${agentBadge.text}`}>
                            {ticket.agentLabel}
                          </div>
                        )}

                        {/* Subject + From */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {ticket.subject}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {ticket.fromName ? `${ticket.fromName} <${ticket.fromEmail}>` : ticket.fromEmail}
                          </p>
                        </div>

                        {/* Customer status badge */}
                        <div className={`hidden md:flex shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${custCfg.bg} ${custCfg.text} items-center gap-1`}>
                          <CustIcon className="h-3 w-3" />
                          {custCfg.label}
                        </div>

                        {/* Status badge */}
                        <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </div>

                        {/* Date */}
                        <span className="hidden lg:block shrink-0 text-xs text-gray-600 w-20 text-right">
                          {timeAgo(ticket.updatedAt)}
                        </span>

                        {/* Expand icon */}
                        <div className="shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                          {/* Meta row */}
                          <div className="flex flex-wrap gap-3 mb-4 items-center">
                            <div className="shrink-0">
                              <ReplyBox
                                ticketId={ticket.id}
                                onReplySent={() => refetch()}
                                recipient={ticket.recipient}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-gray-600">Priority:</span>
                              <span className={`flex items-center gap-1 text-xs font-semibold ${priCfg.text}`}>
                                <span className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
                                {priCfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-gray-600">Received:</span>
                              <span className="text-xs text-gray-800">{formatDateTime(ticket.receivedAt)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-gray-600">Customer:</span>
                              <span className={`flex items-center gap-1 text-xs font-medium ${custCfg.text}`}>
                                <CustIcon className="h-3 w-3" />
                                {custCfg.label}
                              </span>
                            </div>
                            {ticket.assignedTo && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-gray-600">Assigned:</span>
                                <span className="text-xs text-gray-800">{ticket.assignedTo}</span>
                              </div>
                            )}
                            {viewMode === "retention" && ticket.agentLabel && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-gray-600">Agent:</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${agentBadge?.bg || "bg-gray-100"} ${agentBadge?.text || "text-gray-700"}`}>
                                  {ticket.agentLabel}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Conversation Thread */}
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                              <MessageSquare className="h-4 w-4 text-gray-500" />
                              <span className="text-sm font-semibold text-gray-700">Conversation</span>
                              <span className="text-xs text-gray-500">
                                Re: {ticket.subject}
                              </span>

                            </div>
                            <ConversationThread
                              ticketId={ticket.id}
                              originalBody={ticket.body}
                              originalFrom={ticket.fromName || ticket.fromEmail}
                              originalDate={ticket.receivedAt}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 items-end border-t border-gray-200 pt-4">
                            {/* Status update */}
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                              <Select
                                value={ticket.status}
                                onValueChange={(val) =>
                                  updateTicket.mutate({ id: ticket.id, status: val as any })
                                }
                              >
                                <SelectTrigger className="h-8 w-[150px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
                                  <SelectItem value="customer_replied">Customer Replied</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Assign */}
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Assign to</label>
                              <Select
                                value={ticket.assignedTo || "unassigned"}
                                onValueChange={(val) =>
                                  updateTicket.mutate({
                                    id: ticket.id,
                                    assignedTo: val === "unassigned" ? null : val,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-[120px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  <SelectItem value="Diane">Diane</SelectItem>
                                  <SelectItem value="Gabriel">Gabriel</SelectItem>
                                  <SelectItem value="Guy">Guy</SelectItem>
                                  <SelectItem value="James">James</SelectItem>
                                  <SelectItem value="Rob">Rob</SelectItem>
                                  <SelectItem value="Wendy">Wendy</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Notes */}
                            <div className="flex-1 min-w-[200px]">
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                              <div className="flex gap-1.5">
                                <Input
                                  value={editingNotes[ticket.id] ?? ticket.notes ?? ""}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setEditingNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                                  }
                                  placeholder="Add a note..."
                                  className="h-8 text-xs flex-1"
                                />
                                <Button
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  disabled={
                                    (editingNotes[ticket.id] ?? ticket.notes ?? "") === (ticket.notes ?? "")
                                  }
                                  onClick={() => {
                                    updateTicket.mutate({
                                      id: ticket.id,
                                      notes: editingNotes[ticket.id] ?? "",
                                    });
                                  }}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>

                            {/* Block Sender Button (admin only) */}
                            {isAdmin && (
                              <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">&nbsp;</label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                  disabled={blockSenderMutation.isPending}
                                  onClick={() => handleBlockSender(ticket.fromEmail)}
                                >
                                  <Ban className="h-3 w-3" />
                                  Block Sender
                                </Button>
                              </div>
                            )}
                            {/* Block Subject Button (admin only) */}
                            {isAdmin && (
                              <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">&nbsp;</label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                                  disabled={blockSubjectMutation.isPending}
                                  onClick={() => handleBlockSubject(ticket.subject || "")}
                                >
                                  <Ban className="h-3 w-3" />
                                  Block Subject
                                </Button>
                              </div>
                            )}
                            {/* Send to Retention Button (admin + retention team) */}
                            {(isAdmin || user?.team === "retention") && (
                              <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">&nbsp;</label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => setSendToRetentionTicket(ticket)}
                                >
                                  <ArrowUpRight className="h-3 w-3" />
                                  Send to Retention
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Butler Usage Panel (admin only) ─────────────────────────────────────────
function ButlerUsagePanel() {
  const [period, setPeriod] = useState<"today" | "7days" | "thisMonth" | "lastMonth" | "30days" | "all">("thisMonth");
  const { data, isLoading } = trpc.manager.getButlerUsage.useQuery({ period });

  return (
    <div className="px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">⚡ Sir Carlton Token Usage</h2>
          <p className="text-sm text-gray-600 mt-1">Monitor AI token consumption per agent</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="30days">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Loading usage data...</p>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">Total Questions</p>
              <p className="text-2xl font-bold text-gray-900">{data.totals.questions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">Total Tokens</p>
              <p className="text-2xl font-bold text-gray-900">{data.totals.tokens.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">Estimated Cost</p>
              <p className="text-2xl font-bold text-green-700">${data.totals.cost}</p>
            </div>
          </div>

          {/* Per Agent Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Usage Per Agent</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold text-gray-700">Agent</th>
                    <th className="text-center px-4 py-2 font-bold text-gray-700">Questions</th>
                    <th className="text-center px-4 py-2 font-bold text-gray-700">Tokens</th>
                    <th className="text-center px-4 py-2 font-bold text-gray-700">Cost ($)</th>
                    <th className="text-center px-4 py-2 font-bold text-gray-700">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perAgent.map((agent) => (
                    <tr key={agent.name} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{agent.name}</td>
                      <td className="px-4 py-3 text-center text-gray-800">{agent.questions}</td>
                      <td className="px-4 py-3 text-center text-gray-800">{agent.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium">${agent.totalCost}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {agent.lastUsed ? new Date(agent.lastUsed).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Questions */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Recent Questions (last 50)</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.recentQuestions.map((q, i) => (
                <div key={i} className="px-4 py-3 border-t border-gray-50 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">{q.userName}</span>
                    <span className="text-xs text-gray-500">
                      {q.date ? new Date(q.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1 truncate">{q.question}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-500">{q.tokens?.toLocaleString()} tokens</span>
                    <span className="text-xs text-green-600">${q.cost}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-gray-500">No usage data available.</p>
      )}
    </div>
  );
}
