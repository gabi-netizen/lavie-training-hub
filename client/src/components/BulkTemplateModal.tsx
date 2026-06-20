import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, Send, MessageCircle, MessageSquare, Mail } from "lucide-react";
import { toast } from "sonner";

type Channel = "whatsapp" | "sms" | "email";

interface Recipient {
  phone: string | null | undefined;
  email: string | null | undefined;
  name: string | null | undefined;
}

interface BulkTemplateModalProps {
  open: boolean;
  channel: Channel;
  recipients: Recipient[];
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Modal for selecting a template and confirming bulk send.
 * Fetches templates based on the channel type.
 */
export function BulkTemplateModal({
  open,
  channel,
  recipients,
  onClose,
  onSuccess,
}: BulkTemplateModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch WhatsApp templates
  const { data: waTemplates, isLoading: waLoading } = trpc.whatsapp.templates.useQuery(
    undefined,
    { enabled: open && channel === "whatsapp" }
  );

  // Fetch SMS templates (same endpoint as WhatsApp templates via smsTemplates)
  const { data: smsTemplates, isLoading: smsLoading } = (trpc.whatsapp as any).smsTemplates.useQuery(
    undefined,
    { enabled: open && channel === "sms" }
  );

  // Fetch Email templates
  const { data: emailTemplates, isLoading: emailLoading } = trpc.emailTemplates.list.useQuery(
    undefined,
    { enabled: open && channel === "email" }
  );

  // Bulk send mutation
  const bulkSend = trpc.bulkMessaging.bulkSendMessage.useMutation({
    onSuccess: (data) => {
      toast.success(`Sent to ${data.sent} of ${data.total} contacts`);
      if (data.failed > 0) {
        toast.error(`${data.failed} failed to send`);
      }
      setSelectedTemplateId(null);
      setSelectedTemplateName("");
      setShowConfirm(false);
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Bulk send failed: ${err.message}`);
    },
  });

  if (!open) return null;

  const isLoading = channel === "whatsapp" ? waLoading : channel === "sms" ? smsLoading : emailLoading;

  const templates: { id: string; name: string; description?: string }[] = (() => {
    if (channel === "whatsapp" && waTemplates) {
      return waTemplates.map((t: any) => ({
        id: t.sid,
        name: t.friendly_name,
        description: t.types?.["twilio/text"]?.body || "",
      }));
    }
    if (channel === "sms" && smsTemplates) {
      return smsTemplates.map((t: any) => ({
        id: t.sid,
        name: t.friendly_name,
        description: t.types?.["twilio/text"]?.body || "",
      }));
    }
    if (channel === "email" && emailTemplates) {
      return emailTemplates.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        description: t.subject || t.description || "",
      }));
    }
    return [];
  })();

  const handleSend = () => {
    if (!selectedTemplateId) return;
    bulkSend.mutate({
      recipients: recipients.map((r) => ({
        phone: r.phone || null,
        email: r.email || null,
        name: r.name || null,
      })),
      channel,
      templateId: selectedTemplateId,
    });
  };

  const channelConfig = {
    whatsapp: { icon: MessageCircle, color: "text-green-600", bgColor: "bg-green-600", label: "WhatsApp" },
    sms: { icon: MessageSquare, color: "text-blue-600", bgColor: "bg-blue-600", label: "SMS" },
    email: { icon: Mail, color: "text-purple-600", bgColor: "bg-purple-600", label: "Email" },
  };

  const config = channelConfig[channel];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
            <h2 className="text-lg font-bold text-gray-900">
              Bulk {config.label} — Select Template
            </h2>
          </div>
          <button
            onClick={() => {
              setSelectedTemplateId(null);
              setSelectedTemplateName("");
              setShowConfirm(false);
              onClose();
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {showConfirm ? (
            <div className="text-center py-8">
              <Icon className={`w-12 h-12 ${config.color} mx-auto mb-4`} />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Send to {recipients.length} contact{recipients.length !== 1 ? "s" : ""}?
              </h3>
              <p className="text-sm text-gray-700 mb-2">
                Template: <strong className="text-gray-900">{selectedTemplateName}</strong>
              </p>
              <p className="text-xs text-gray-600">
                This will send a {config.label} message to all selected contacts.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-600">
              No templates available
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    setSelectedTemplateName(tpl.name);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    selectedTemplateId === tpl.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-sm font-bold text-gray-900">{tpl.name}</div>
                  {tpl.description && (
                    <div className="text-xs text-gray-700 mt-1 line-clamp-2">
                      {tpl.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={() => {
              if (showConfirm) {
                setShowConfirm(false);
              } else {
                setSelectedTemplateId(null);
                setSelectedTemplateName("");
                onClose();
              }
            }}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {showConfirm ? "Back" : "Cancel"}
          </button>
          {showConfirm ? (
            <button
              onClick={handleSend}
              disabled={bulkSend.isPending}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white ${config.bgColor} hover:opacity-90 rounded-lg transition-colors disabled:opacity-50`}
            >
              <Send className="w-4 h-4" />
              {bulkSend.isPending ? "Sending..." : `Send to ${recipients.length}`}
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!selectedTemplateId}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white ${config.bgColor} hover:opacity-90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
