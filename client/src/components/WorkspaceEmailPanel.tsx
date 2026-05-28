/**
 * WorkspaceEmailPanel — Emails tab for the Workspace page.
 * Shows all emails (sent + received) for the selected contact,
 * with compose functionality, open/click tracking indicators,
 * and real-time notifications.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Mail, Send, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Eye, Link2, X } from "lucide-react";

interface WorkspaceEmailPanelProps {
  /** Currently selected contact ID from the Workspace sidebar */
  contactId: number | null;
  /** Whether the panel is visible (for polling control) */
  visible: boolean;
}

export function WorkspaceEmailPanel({ contactId, visible }: WorkspaceEmailPanelProps) {
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch emails for the selected contact
  const { data: emails = [], refetch: refetchEmails } = trpc.emails.listForContact.useQuery(
    { contactId: contactId! },
    { enabled: !!contactId && visible, refetchInterval: 15000 }
  );

  // Get contact email
  const { data: contactInfo } = trpc.emails.getContactEmail.useQuery(
    { contactId: contactId! },
    { enabled: !!contactId && visible }
  );

  // Send email mutation
  const sendEmail = trpc.emails.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully!");
      setComposing(false);
      setSubject("");
      setBody("");
      refetchEmails();
    },
    onError: (err) => {
      toast.error(`Failed to send email: ${err.message}`);
    },
  });

  // Poll for notifications
  const { data: notifications = [], refetch: refetchNotifications } =
    trpc.emails.getUnreadNotifications.useQuery(undefined, {
      enabled: visible,
      refetchInterval: 10000,
    });

  // Mark notifications as read
  const markRead = trpc.emails.markNotificationsRead.useMutation({
    onSuccess: () => refetchNotifications(),
  });

  // Show toast for new notifications
  const lastNotifCountRef = useRef(0);
  useEffect(() => {
    if (notifications.length > lastNotifCountRef.current) {
      const newNotifs = notifications.slice(0, notifications.length - lastNotifCountRef.current);
      for (const notif of newNotifs) {
        if (notif.type === "opened") {
          toast.info(`📧 ${notif.contactName ?? "Someone"} opened your email!`, { duration: 5000 });
        } else if (notif.type === "clicked") {
          toast.info(`🔗 ${notif.contactName ?? "Someone"} clicked a link in your email!`, { duration: 5000 });
        }
      }
      // Auto-mark as read after showing
      if (newNotifs.length > 0) {
        markRead.mutate({ ids: newNotifs.map((n) => n.id) });
      }
    }
    lastNotifCountRef.current = notifications.length;
  }, [notifications]);

  const handleSend = () => {
    if (!contactId) return;
    if (!subject.trim() || !body.trim()) {
      toast.error("Please fill in both subject and message body");
      return;
    }
    sendEmail.mutate({ contactId, subject, body });
  };

  if (!contactId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 40 }}>
        <div style={{ textAlign: "center", color: "#000" }}>
          <Mail size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: "#000" }}>Select a contact to view emails</p>
          <p style={{ fontSize: 14, color: "#000", marginTop: 4 }}>Choose a contact from the list on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff",
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#000" }}>
            Emails {contactInfo?.name ? `— ${contactInfo.name}` : ""}
          </h3>
          {contactInfo?.email && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#000" }}>{contactInfo.email}</p>
          )}
        </div>
        <button
          onClick={() => setComposing(!composing)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            background: composing ? "#fee2e2" : "#2563eb",
            color: composing ? "#991b1b" : "#fff",
          }}
        >
          {composing ? <><X size={14} /> Cancel</> : <><Send size={14} /> Compose</>}
        </button>
      </div>

      {/* Compose Form */}
      {composing && (
        <div style={{
          padding: 16, borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
        }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#000", marginBottom: 4 }}>
              To
            </label>
            <input
              type="text"
              value={contactInfo?.email ?? ""}
              disabled
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6,
                border: "1px solid #e2e8f0", fontSize: 13, color: "#000",
                background: "#f1f5f9", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#000", marginBottom: 4 }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6,
                border: "1px solid #e2e8f0", fontSize: 13, color: "#000",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#000", marginBottom: 4 }}>
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here..."
              rows={6}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 6,
                border: "1px solid #e2e8f0", fontSize: 13, color: "#000",
                resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={handleSend}
              disabled={sendEmail.isPending || !subject.trim() || !body.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 20px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: sendEmail.isPending ? "#94a3b8" : "#2563eb",
                color: "#fff",
                opacity: (!subject.trim() || !body.trim()) ? 0.5 : 1,
              }}
            >
              <Send size={14} />
              {sendEmail.isPending ? "Sending..." : "Send Email"}
            </button>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#000" }}>
            Tracking pixel and link tracking will be automatically added.
          </p>
        </div>
      )}

      {/* Email List */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {emails.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#000" }}>
            <Mail size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "#000" }}>No emails yet</p>
            <p style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
              {contactInfo?.email ? "Click Compose to send the first email" : "This contact has no email address"}
            </p>
          </div>
        ) : (
          emails.map((email) => (
            <EmailRow
              key={`${email.direction}-${email.id}`}
              email={email}
              expanded={expandedId === email.id}
              onToggle={() => setExpandedId(expandedId === email.id ? null : email.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Email Row Component ────────────────────────────────────────────────────

interface EmailRowProps {
  email: {
    id: number;
    direction: "inbound" | "outbound";
    subject: string;
    body: string;
    from: string;
    to: string;
    createdAt: any;
    openedAt: any;
    openCount: number;
    clickedAt: any;
    clickCount: number;
    sentByUserId: number | null;
    sentByUserName: string;
  };
  expanded: boolean;
  onToggle: () => void;
}

function EmailRow({ email, expanded, onToggle }: EmailRowProps) {
  const isOutbound = email.direction === "outbound";
  const dateStr = email.createdAt
    ? new Date(email.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  // Strip HTML for preview
  const textPreview = email.body
    ? email.body.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").substring(0, 100)
    : "";

  return (
    <div style={{
      margin: "0 8px 4px", borderRadius: 8,
      border: "1px solid #e2e8f0", overflow: "hidden",
      background: expanded ? "#f8fafc" : "#fff",
    }}>
      {/* Row header (clickable) */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          cursor: "pointer", transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = expanded ? "#f8fafc" : "#fff"; }}
      >
        {/* Direction icon */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%", display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
          background: isOutbound ? "#dbeafe" : "#dcfce7",
        }}>
          {isOutbound ? (
            <ArrowUp size={14} style={{ color: "#2563eb" }} />
          ) : (
            <ArrowDown size={14} style={{ color: "#16a34a" }} />
          )}
        </div>

        {/* Subject + preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {email.subject}
          </div>
          <div style={{ fontSize: 12, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
            {isOutbound ? `To: ${email.to}` : `From: ${email.from}`}
            {textPreview ? ` — ${textPreview}` : ""}
          </div>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isOutbound && email.openedAt && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: "#dbeafe", color: "#1e40af",
            }}>
              <Eye size={11} /> Opened
            </span>
          )}
          {isOutbound && email.clickedAt && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: "#fef3c7", color: "#92400e",
            }}>
              <Link2 size={11} /> Clicked
            </span>
          )}
          {isOutbound && !email.openedAt && !email.clickedAt && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: "#f1f5f9", color: "#000",
            }}>
              ✓ Sent
            </span>
          )}
        </div>

        {/* Date */}
        <div style={{ fontSize: 11, color: "#000", whiteSpace: "nowrap", flexShrink: 0 }}>
          {dateStr}
        </div>

        {/* Expand icon */}
        {expanded ? <ChevronUp size={14} style={{ color: "#000" }} /> : <ChevronDown size={14} style={{ color: "#000" }} />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: 16 }}>
          {/* Tracking details for outbound */}
          {isOutbound && (
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "#000" }}>
              <span>
                <strong>Opens:</strong> {email.openCount}
                {email.openedAt && (
                  <> (first: {new Date(email.openedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})</>
                )}
              </span>
              <span>
                <strong>Clicks:</strong> {email.clickCount}
                {email.clickedAt && (
                  <> (first: {new Date(email.clickedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})</>
                )}
              </span>
              <span><strong>Sent by:</strong> {email.sentByUserName}</span>
            </div>
          )}

          {/* Email body (rendered HTML) */}
          <div
            style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
              padding: 16, maxHeight: 400, overflow: "auto",
              fontSize: 13, lineHeight: 1.6, color: "#000",
            }}
            dangerouslySetInnerHTML={{ __html: email.body || "<em>No content</em>" }}
          />
        </div>
      )}
    </div>
  );
}
