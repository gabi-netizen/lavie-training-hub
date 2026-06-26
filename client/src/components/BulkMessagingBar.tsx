import React from "react";
import { MessageCircle, MessageSquare, Mail, Trash2, X } from "lucide-react";

interface BulkMessagingBarProps {
  selectedCount: number;
  onWhatsApp: () => void;
  onSms: () => void;
  onEmail: () => void;
  onClear: () => void;
  onDelete?: () => void;
}

/**
 * Sticky action bar that appears when 1+ rows are selected.
 * Shows count + WhatsApp/SMS/Email buttons.
 */
export function BulkMessagingBar({
  selectedCount,
  onWhatsApp,
  onSms,
  onEmail,
  onClear,
  onDelete,
}: BulkMessagingBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-30 bg-white shadow-md rounded-lg border border-gray-200 px-5 py-3 mb-4 flex items-center gap-4 flex-wrap">
      <span className="text-sm font-bold text-gray-900">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onWhatsApp}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>
        <button
          onClick={onSms}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          SMS
        </button>
        <button
          onClick={onEmail}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          <Mail className="w-4 h-4" />
          Email
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
      <button
        onClick={onClear}
        className="ml-auto p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
