
// Full Agent Workspace UI — v9 design: 7-stage pitch + Edit/Reset + Manager View + Email Modal
// Includes: Contact card, Action buttons, Script panel (7 stages), Notes dropdowns, Payment box, Email Template Modal

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Stripe publishable keys
const STRIPE_LIVE_PK = "pk_live_51IuIy2EfUpox0KeWfAcGnlsc5OyDrbkti82yntGcWWd8xHUHuJBIoUjq5dLQCOBBSGDT7plnxVl8CJxUjTgulIlE00toX4MBQf";
const STRIPE_TEST_PK = import.meta.env.VITE_STRIPE_TEST_PK || "pk_test_51IuIy2EfUpox0KeWXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// Lazy-load Stripe instances
const stripeLivePromise = loadStripe(STRIPE_LIVE_PK);
const stripeTestPromise = loadStripe(STRIPE_TEST_PK);
import {
  Phone, Mail, MapPin, User, Pencil, Check, X, RotateCcw,
  ChevronRight, ChevronLeft, ChevronDown, CreditCard, Search,
  Edit3, Save, AlertCircle, Eye, Users, Calendar, UserPlus, ChevronsUpDown
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// ==========================================
// TYPES
// ==========================================
interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  leadType?: string;
  status?: string;
  /** stores age value (e.g. "52", "30 & Under", "90+") — DB column: skinType */
  skinType?: string;
  /** stores current skincare brand — DB column: concern */
  concern?: string;
  /** stores products used — DB column: routine */
  routine?: string;
  trialKit?: string;
  /** free notes from DB */
  callNotes?: string;
  /** UI alias for callNotes */
  notes?: string;
  importedNotes?: string;
  callbackAt?: Date | string | null;
  source?: string | null;
}

// ==========================================
// DROPDOWN OPTIONS
// ==========================================

// AGE: "30 & Under", 31–89, "90+"
const AGE_OPTIONS: string[] = [
  "30 & Under",
  ...Array.from({ length: 59 }, (_, i) => String(31 + i)), // 31..89
  "90+",
];

const CURRENT_BRAND_OPTIONS = [
  // Premium
  "Estée Lauder",
  "Clinique",
  "Lancôme",
  "Clarins",
  "Elemis",
  "L'Occitane",
  // Budget
  "No.7",
  "Nivea",
  "Olay",
  "Simple",
  // Other
  "Other",
  "None",
];

const PRODUCTS_USED_OPTIONS = [
  "Cleanser only",
  "Moisturiser only",
  "2-3 Products",
  "Full Routine (4+)",
  "Nothing",
];

const TRIAL_KIT_OPTIONS = ["Matinika + Oulala", "Matinika + Ashkara"];

// ==========================================
// AGE SEARCHABLE COMBOBOX COMPONENT
// ==========================================
function AgeCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="ws-select flex items-center justify-between cursor-pointer text-left"
          style={{ appearance: "none" }}
        >
          <span className={value ? "text-[#1f2937]" : "text-gray-400"}>
            {value || "Select"}
          </span>
          <ChevronsUpDown size={12} className="text-gray-400 shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 bg-white border border-gray-200 shadow-lg rounded-lg"
        style={{ width: "160px", zIndex: 9999 }}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Type age..." className="text-xs h-8" />
          <CommandList style={{ maxHeight: "200px" }}>
            <CommandEmpty className="text-xs text-gray-400 py-2 text-center">No match</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs cursor-pointer text-red-500"
                >
                  ✕ Clear selection
                </CommandItem>
              )}
              {AGE_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  className="text-xs cursor-pointer"
                >
                  <Check
                    size={12}
                    className={`mr-1.5 shrink-0 ${
                      value === opt ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ==========================================
// BRAND MULTI-SELECT DROPDOWN WITH CHECKBOXES
// ==========================================
function BrandCheckboxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Local state for draft selection (only saved on "Save" click)
  const [draft, setDraft] = useState<string[]>([]);

  // Sync draft when popover opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setDraft(value ? value.split(",").map(s => s.trim()).filter(Boolean) : []);
      setSearch("");
    }
    setOpen(isOpen);
  };

  const toggle = (brand: string) => {
    setDraft(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const filtered = CURRENT_BRAND_OPTIONS.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const selected: string[] = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const displayText = selected.length === 0
    ? "Select"
    : selected.length <= 2
      ? selected.join(", ")
      : `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="ws-select flex items-center justify-between cursor-pointer text-left"
          style={{ appearance: "none" }}
        >
          <span className={selected.length > 0 ? "text-[#1f2937]" : "text-gray-400"}>
            {displayText}
          </span>
          <ChevronsUpDown size={12} className="text-gray-400 shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 bg-white border border-gray-200 shadow-lg rounded-lg"
        style={{ width: "200px", zIndex: 9999 }}
        align="start"
      >
        <div className="p-1.5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Type brand name..."
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: "220px", overflowY: "auto" }}>
          {draft.length > 0 && !search.trim() && (
            <button
              type="button"
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-red-50 text-red-500 cursor-pointer border-b border-gray-100"
              onClick={() => setDraft([])}
            >
              ✕ Clear all
            </button>
          )}
          {filtered.map((brand) => {
            const isChecked = draft.includes(brand);
            return (
              <label
                key={brand}
                className={`flex items-center gap-2 w-full text-left text-xs px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${
                  isChecked ? "bg-violet-50 font-medium text-violet-700" : "text-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-violet-600 w-3.5 h-3.5 shrink-0 cursor-pointer"
                  checked={isChecked}
                  onChange={() => toggle(brand)}
                />
                {brand}
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-gray-400 py-2 text-center">No matches</div>
          )}
        </div>
        {/* Save button */}
        <div className="p-1.5 border-t border-gray-100">
          <button
            type="button"
            className="w-full text-xs font-semibold px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer"
            onClick={() => {
              onChange(draft.join(","));
              setOpen(false);
            }}
          >
            ✔ Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ==========================================
// INLINE EDITABLE FIELD COMPONENT
// ==========================================
function EditableField({
  icon,
  value,
  originalValue,
  onSave,
}: {
  icon: React.ReactNode;
  value: string;
  originalValue: string;
  onSave: (newVal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const [currentVal, setCurrentVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentVal(value);
  }, [value]);

  const startEdit = () => {
    setEditVal(currentVal);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const save = () => {
    setCurrentVal(editVal);
    onSave(editVal);
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  const resetToOriginal = () => {
    setCurrentVal(originalValue);
    onSave(originalValue);
  };

  const isChanged = currentVal !== originalValue;

  return (
    <div className="ws-detail-row">
      <span className="ws-detail-icon">{icon}</span>
      {editing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            className="ws-detail-input"
          />
          <span className="ws-detail-save" onClick={save}>
            <Check size={14} />
          </span>
          <span className="ws-detail-cancel" onClick={cancel}>
            <X size={14} />
          </span>
        </>
      ) : (
        <>
          <span className="ws-detail-text">{currentVal || "—"}</span>
          <span className="ws-detail-edit" onClick={startEdit}>
            <Pencil size={12} />
          </span>
          {isChanged && (
            <span className="ws-detail-reset" onClick={resetToOriginal} title="Reset to original">
              <RotateCcw size={12} />
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ==========================================
// CONTACT CARD IN LIST
// ==========================================
function ContactCard({
  contact,
  isActive,
  isDone,
  doneStatus,
  onSelect,
  onClose,
  onAction,
  onFieldChange,
  isCallPending,
  isSkipped,
  onDelete,
  onPrev,
  onNext,
}: {
  contact: Contact;
  isActive: boolean;
  isDone: boolean;
  doneStatus?: string;
  isSkipped?: boolean;
  onSelect: () => void;
  onClose: () => void;
  onAction: (action: string) => void;
  onFieldChange: (field: string, value: any) => void;
  isCallPending?: boolean;
  onDelete?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [emailDropOpen, setEmailDropOpen] = useState(false);
  const [autoSelectFormTemplate, setAutoSelectFormTemplate] = useState(false);
  const emailDropRef = useRef<HTMLDivElement>(null);

  // Close email dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emailDropRef.current && !emailDropRef.current.contains(e.target as Node)) {
        setEmailDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", description: "", htmlBody: "", headerImageUrl: "", visibility: "" });
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editTemplate, setEditTemplate] = useState({ name: "", subject: "", description: "", htmlBody: "", headerImageUrl: "", visibility: "" });
  const [notes, setNotes] = useState(contact.callNotes ?? contact.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(contact.callNotes ?? contact.notes ?? "");
  const notesChanged = notes !== savedNotes;

  // Sync local state when contact changes (different contact selected OR same contact refetched from DB)
  useEffect(() => {
    const freshNotes = contact.callNotes ?? contact.notes ?? "";
    setNotes(freshNotes);
    setSavedNotes(freshNotes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, contact.callNotes, contact.skinType, contact.concern, contact.routine, contact.trialKit]);

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const deleteTemplateMutation = trpc.emailTemplates.delete.useMutation({
    onSuccess: () => {
      utils.emailTemplates.list.invalidate();
      setSelectedTemplateId(null);
    },
  });

  const updateTemplateMutation = trpc.emailTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated!");
      setEditingTemplateId(null);
      utils.emailTemplates.list.invalidate();
      utils.emailTemplates.getById.invalidate();
    },
  });

  const createTemplateMutation = trpc.emailTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created!");
      setShowAddTemplate(false);
      setNewTemplate({ name: "", subject: "", description: "", htmlBody: "", headerImageUrl: "", visibility: "" });
      utils.emailTemplates.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Fetch all users for visibility agent picker
  const { data: allUsersWs } = trpc.pitch.allUsers.useQuery();

  const { data: emailTemplates, isLoading: templatesLoading } = trpc.emailTemplates.list.useQuery(
    undefined,
    { enabled: emailTemplateOpen }
  );

  const { data: selectedTemplate, isLoading: templateDetailLoading } = trpc.emailTemplates.getById.useQuery(
    { id: selectedTemplateId! },
    { enabled: selectedTemplateId !== null }
  );

  const previewHtml = useMemo(() => {
    if (!selectedTemplate || !contact) return null;
    const body = selectedTemplate.htmlBody
      .replaceAll("${Customers.First Name}", (contact.name ?? "").split(" ")[0] || "[Name]")
      .replaceAll("${Customers.Customers Owner}", user?.name ?? "[Agent]")
      .replaceAll("${agentName}", user?.name ?? "[Agent Name]")
      .replaceAll("${agentEmail}", user?.email ?? "[Agent Email]");
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
    const formattedBody = hasHtmlTags ? body : body.replace(/\n/g, "<br>");
    const headerImg = selectedTemplate.headerImageUrl
      ? `<tr><td style="padding:0;"><img src="${selectedTemplate.headerImageUrl}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>`
      : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">${headerImg}<tr><td style="padding:32px 32px 24px;"><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p></td></tr><tr><td style="padding:0 32px 24px;"><p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${user?.name ?? "[Agent]"}</strong></p></td></tr></table></td></tr></table></body></html>`;
  }, [selectedTemplate, contact, user]);

  // Auto-select the "Form" template when "Send Payment Form" is clicked
  useEffect(() => {
    if (autoSelectFormTemplate && emailTemplates && emailTemplates.length > 0) {
      const formTemplate = emailTemplates.find(
        (t: { id: number; name: string }) => t.name === "Form"
      );
      if (formTemplate) {
        setSelectedTemplateId(formTemplate.id);
      }
      setAutoSelectFormTemplate(false);
    }
  }, [autoSelectFormTemplate, emailTemplates]);

  const sendTemplateMutation = trpc.emailTemplates.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully ✅");
      setEmailTemplateOpen(false);
      setSelectedTemplateId(null);
    },
    onError: (err) => toast.error(`Failed to send: ${err.message}`),
  });

  const initials = contact.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`ws-item ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isSkipped && !isActive ? "skipped" : ""}`}
      onClick={onSelect}
    >
      <div className="ws-row1">
        {isActive ? (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
              disabled={!onPrev}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-indigo-100 border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous contact"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNext?.(); }}
              disabled={!onNext}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-indigo-100 border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next contact"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="ws-avatar">{initials}</div>
        )}
        <div className="ws-name-box">
          <div className="ws-name">{contact.name}</div>
          <div className="ws-phone">{contact.phone}</div>
        </div>
        {(isDone || (isSkipped && !isActive)) && (
          <div
            className="ws-done-icon"
            style={{
              color:
                doneStatus === "Sold"
                  ? "#16a34a"
                  : doneStatus === "No"
                  ? "#dc2626"
                  : doneStatus === "Skip"
                  ? "#9ca3af"
                  : "#d97706",
            }}
          >
            {doneStatus}
          </div>
        )}
        {isActive && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Mark ${contact.name} as "Do Not Call"? This means the customer asked to be removed.`)) {
                  onAction("no");
                }
              }}
              className="px-3 py-1 flex items-center gap-1 rounded-md bg-red-50 hover:bg-red-100 border border-red-300 hover:border-red-400 text-red-600 hover:text-red-700 font-semibold text-xs transition-colors"
            >
              No
            </button>
            {onDelete && !contact.source && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete ${contact.name}? This cannot be undone.`)) {
                    onDelete();
                  }
                }}
                className="px-3 py-1 flex items-center gap-1 rounded-md bg-red-50 hover:bg-red-100 border border-red-300 hover:border-red-400 text-red-600 hover:text-red-700 font-semibold text-xs transition-colors"
              >
                <X size={14} strokeWidth={2.5} />
                Delete
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="px-3 py-1 flex items-center gap-1 rounded-md bg-gray-100 hover:bg-red-50 border border-gray-300 hover:border-red-300 text-gray-600 hover:text-red-600 font-semibold text-xs transition-colors"
            >
              <X size={14} strokeWidth={2.5} />
              Close
            </button>
          </div>
        )}
      </div>

      {isActive && (
        <div className="ws-expanded" onClick={(e) => e.stopPropagation()}>
          {/* Toggle details */}
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "#6366f1",
              padding: "4px 0", marginBottom: 4
            }}
          >
            {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {detailsOpen ? "Hide Details" : "Show Details"}
          </button>
          {detailsOpen && <>
          {/* Contact Details — Editable */}
          <div className="ws-details">
            <EditableField
              icon={<User size={14} />}
              value={contact.name}
              originalValue={contact.name}
              onSave={(v) => onFieldChange("name", v)}
            />
            <EditableField
              icon={<Phone size={14} />}
              value={contact.phone}
              originalValue={contact.phone}
              onSave={(v) => onFieldChange("phone", v)}
            />
            <EditableField
              icon={<Mail size={14} />}
              value={contact.email ?? ""}
              originalValue={contact.email ?? ""}
              onSave={(v) => onFieldChange("email", v)}
            />
            <EditableField
              icon={<MapPin size={14} />}
              value={contact.address ?? ""}
              originalValue={contact.address ?? ""}
              onSave={(v) => onFieldChange("address", v)}
            />
          </div>

          {/* Structured Fields */}
          <div className="ws-fields">
            <div className="ws-field-row">
              <div className="ws-field">
                <label>Age</label>
                <AgeCombobox
                  value={contact.skinType ?? ""}
                  onChange={(v) => onFieldChange("skinType", v)}
                />
              </div>
              <div className="ws-field">
                <label>Current Brand</label>
                <BrandCheckboxes
                  value={contact.concern ?? ""}
                  onChange={(v) => onFieldChange("concern", v)}
                />
              </div>
            </div>
            <div className="ws-field-row">
              <div className="ws-field">
                <label>Products Used</label>
                <select
                  className="ws-select"
                  value={contact.routine ?? ""}
                  onChange={(e) => onFieldChange("routine", e.target.value)}
                >
                  <option value="">Select</option>
                  {PRODUCTS_USED_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="ws-field">
                <label>Trial Kit</label>
                <select
                  className="ws-select"
                  value={contact.trialKit ?? ""}
                  onChange={(e) => onFieldChange("trialKit", e.target.value)}
                >
                  <option value="">Select</option>
                  {TRIAL_KIT_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Free Notes — manual save */}
          <textarea
            className="ws-notes-area"
            placeholder="Free notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {notesChanged && (
            <button
              className="ws-notes-save-btn"
              onClick={() => {
                onFieldChange("notes", notes);
                setSavedNotes(notes);
              }}
            >
              Save Notes
            </button>
          )}
          </>}

          {/* Email Template Modal */}
          {emailTemplateOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); }}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Send Email Template</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      To: <span className="font-medium text-gray-700">{contact.name}</span>
                      {contact.email
                        ? <span className="ml-2 text-gray-400">&lt;{contact.email}&gt;</span>
                        : <span className="ml-2 text-red-500 text-xs">⚠ No email on file</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); }}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X size={18} className="text-gray-500" />
                  </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Left: Template list */}
                  <div className="w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose Template</p>
                      {isAdmin && (
                        <button
                          onClick={() => setShowAddTemplate(!showAddTemplate)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          {showAddTemplate ? "Cancel" : "+ Add"}
                        </button>
                      )}
                    </div>

                    {/* Add Template Form */}
                    {showAddTemplate && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <input
                          type="text"
                          placeholder="Template Name"
                          value={newTemplate.name}
                          onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                        />
                        <input
                          type="text"
                          placeholder="Subject Line"
                          value={newTemplate.subject}
                          onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                        />
                        <input
                          type="text"
                          placeholder="Description (optional)"
                          value={newTemplate.description}
                          onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                        />
                        <textarea
                          placeholder="Paste HTML body here..."
                          value={newTemplate.htmlBody}
                          onChange={(e) => setNewTemplate({ ...newTemplate, htmlBody: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2 h-32 resize-y font-mono"
                        />
                        <label className="block text-xs font-bold text-black mb-1">Header Image URL (optional)</label>
                        <input
                          type="url"
                          placeholder="https://example.com/image.png"
                          value={newTemplate.headerImageUrl}
                          onChange={(e) => setNewTemplate({ ...newTemplate, headerImageUrl: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-1"
                        />
                        {newTemplate.headerImageUrl && (
                          <img
                            src={newTemplate.headerImageUrl}
                            alt="Header preview"
                            className="w-full max-h-24 object-contain rounded border border-gray-200 mb-2"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {/* Visibility selector */}
                        <label className="block text-xs font-bold text-black mb-1 mt-2">Visible to:</label>
                        <select
                          value={(() => { try { const v = JSON.parse(newTemplate.visibility || '{"type":"everyone"}'); return v.type === 'everyone' ? 'everyone' : v.type === 'team' ? v.value : 'agents'; } catch { return 'everyone'; } })()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'everyone') setNewTemplate({ ...newTemplate, visibility: JSON.stringify({ type: 'everyone' }) });
                            else if (val === 'opening' || val === 'retention') setNewTemplate({ ...newTemplate, visibility: JSON.stringify({ type: 'team', value: val }) });
                            else setNewTemplate({ ...newTemplate, visibility: JSON.stringify({ type: 'agents', ids: [] }) });
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                        >
                          <option value="everyone">Everyone</option>
                          <option value="opening">Opening only</option>
                          <option value="retention">Retention only</option>
                          <option value="agents">Specific agents</option>
                        </select>
                        {(() => { try { const v = JSON.parse(newTemplate.visibility || '{}'); return v.type === 'agents'; } catch { return false; } })() && allUsersWs && (
                          <div className="mb-2 max-h-28 overflow-y-auto border border-gray-200 rounded p-2">
                            {(allUsersWs as any[]).filter((u: any) => u.role !== 'admin').map((u: any) => (
                              <label key={u.id} className="flex items-center gap-2 text-xs py-0.5">
                                <input
                                  type="checkbox"
                                  checked={(() => { try { const v = JSON.parse(newTemplate.visibility || '{}'); return v.ids?.includes(u.id); } catch { return false; } })()}
                                  onChange={(e) => {
                                    const v = JSON.parse(newTemplate.visibility || '{"type":"agents","ids":[]}');
                                    const ids = v.ids || [];
                                    if (e.target.checked) ids.push(u.id);
                                    else { const idx = ids.indexOf(u.id); if (idx > -1) ids.splice(idx, 1); }
                                    setNewTemplate({ ...newTemplate, visibility: JSON.stringify({ type: 'agents', ids }) });
                                  }}
                                />
                                {u.name || u.email}
                              </label>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => createTemplateMutation.mutate(newTemplate)}
                          disabled={!newTemplate.name || !newTemplate.subject || !newTemplate.htmlBody || createTemplateMutation.isPending}
                          className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {createTemplateMutation.isPending ? "Saving\u2026" : "Save Template"}
                        </button>
                      </div>
                    )}

                    {templatesLoading && (
                      <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                    )}
                    {!templatesLoading && (!emailTemplates || emailTemplates.length === 0) && (
                      <div className="text-sm text-gray-400 text-center py-8">No templates yet</div>
                    )}
                    <div className="flex flex-col gap-2">
                      {emailTemplates?.map((tpl) => (
                        <div key={tpl.id} className="relative">
                          {editingTemplateId === tpl.id ? (
                            <div className="p-3 rounded-lg border-2 border-blue-400 bg-blue-50">
                              <input className="w-full text-sm font-semibold border border-gray-300 rounded px-2 py-1 mb-1" value={editTemplate.name} onChange={(e) => setEditTemplate({...editTemplate, name: e.target.value})} placeholder="Name" />
                              <input className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1" value={editTemplate.subject} onChange={(e) => setEditTemplate({...editTemplate, subject: e.target.value})} placeholder="Subject" />
                              <input className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1" value={editTemplate.description} onChange={(e) => setEditTemplate({...editTemplate, description: e.target.value})} placeholder="Description" />
                              <textarea className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2" rows={4} value={editTemplate.htmlBody} onChange={(e) => setEditTemplate({...editTemplate, htmlBody: e.target.value})} placeholder="HTML Body" />
                              <label className="block text-xs font-bold text-black mb-1">Header Image URL (optional)</label>
                              <input
                                type="url"
                                placeholder="https://example.com/image.png"
                                value={editTemplate.headerImageUrl}
                                onChange={(e) => setEditTemplate({...editTemplate, headerImageUrl: e.target.value})}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1"
                              />
                              {editTemplate.headerImageUrl && (
                                <img
                                  src={editTemplate.headerImageUrl}
                                  alt="Header preview"
                                  className="w-full max-h-24 object-contain rounded border border-gray-200 mb-2"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              )}
                              {/* Visibility selector (edit) */}
                              <label className="block text-xs font-bold text-black mb-1 mt-1">Visible to:</label>
                              <select
                                value={(() => { try { const v = JSON.parse(editTemplate.visibility || '{"type":"everyone"}'); return v.type === 'everyone' ? 'everyone' : v.type === 'team' ? v.value : 'agents'; } catch { return 'everyone'; } })()}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'everyone') setEditTemplate({ ...editTemplate, visibility: JSON.stringify({ type: 'everyone' }) });
                                  else if (val === 'opening' || val === 'retention') setEditTemplate({ ...editTemplate, visibility: JSON.stringify({ type: 'team', value: val }) });
                                  else setEditTemplate({ ...editTemplate, visibility: JSON.stringify({ type: 'agents', ids: [] }) });
                                }}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2"
                              >
                                <option value="everyone">Everyone</option>
                                <option value="opening">Opening only</option>
                                <option value="retention">Retention only</option>
                                <option value="agents">Specific agents</option>
                              </select>
                              {(() => { try { const v = JSON.parse(editTemplate.visibility || '{}'); return v.type === 'agents'; } catch { return false; } })() && allUsersWs && (
                                <div className="mb-2 max-h-28 overflow-y-auto border border-gray-200 rounded p-2">
                                  {(allUsersWs as any[]).filter((u: any) => u.role !== 'admin').map((u: any) => (
                                    <label key={u.id} className="flex items-center gap-2 text-xs py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={(() => { try { const v = JSON.parse(editTemplate.visibility || '{}'); return v.ids?.includes(u.id); } catch { return false; } })()}
                                        onChange={(e) => {
                                          const v = JSON.parse(editTemplate.visibility || '{"type":"agents","ids":[]}');
                                          const ids = v.ids || [];
                                          if (e.target.checked) ids.push(u.id);
                                          else { const idx = ids.indexOf(u.id); if (idx > -1) ids.splice(idx, 1); }
                                          setEditTemplate({ ...editTemplate, visibility: JSON.stringify({ type: 'agents', ids }) });
                                        }}
                                      />
                                      {u.name || u.email}
                                    </label>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => updateTemplateMutation.mutate({ id: tpl.id, ...editTemplate })} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                                <button onClick={() => setEditingTemplateId(null)} className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setSelectedTemplateId(tpl.id)}
                                className={`w-full text-left px-3 py-3 rounded-lg border-2 transition-colors ${
                                  selectedTemplateId === tpl.id
                                    ? "border-amber-500 bg-amber-50"
                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                              >
                                <p className="text-sm font-semibold text-gray-900 leading-tight pr-14">{tpl.name}</p>
                                {tpl.description && (
                                  <p className="text-xs text-gray-500 mt-1 leading-snug">{tpl.description}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1 truncate italic">{tpl.subject}</p>
                                {isAdmin && (() => {
                                  const vis = (() => { try { return JSON.parse((tpl as any).visibility || '{}'); } catch { return { type: 'everyone' }; } })();
                                  const label = vis.type === 'team' ? (vis.value === 'opening' ? '🟢 Opening' : '🔵 Retention')
                                    : vis.type === 'agents' ? `👤 ${vis.ids?.length || 0} agents`
                                    : '🌐 Everyone';
                                  const color = vis.type === 'team' ? (vis.value === 'opening' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')
                                    : vis.type === 'agents' ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-600';
                                  return <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{label}</span>;
                                })()}
                              </button>
                              <div className="absolute top-2 right-2 flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTemplateId(tpl.id);
                                    setEditTemplate({ name: tpl.name, subject: tpl.subject || "", description: tpl.description || "", htmlBody: "", headerImageUrl: (tpl as any).headerImageUrl || "", visibility: (tpl as any).visibility || "" });
                                  }}
                                  className="text-blue-400 hover:text-blue-600 p-1 rounded"
                                  title="Edit template"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Are you sure you want to permanently delete the template "${tpl.name}"? This action cannot be undone.`)) {
                                      deleteTemplateMutation.mutate({ id: tpl.id });
                                    }
                                  }}
                                  className="text-red-400 hover:text-red-600 p-1 rounded"
                                  title="Delete template"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Preview */}
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {!selectedTemplateId && (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                        <Mail size={32} className="opacity-30" />
                        <p className="text-sm">Select a template to preview</p>
                      </div>
                    )}
                    {selectedTemplateId && templateDetailLoading && (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading preview…</div>
                    )}
                    {selectedTemplateId && previewHtml && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                          <p className="text-xs text-gray-500">
                            Subject: <span className="font-medium text-gray-700">
                              {selectedTemplate?.subject
                                .replaceAll("${Customers.First Name}", (contact.name ?? "").split(" ")[0] || "[Name]")
                                .replaceAll("${agentName}", user?.name ?? "[Agent]")}
                            </span>
                          </p>
                        </div>
                        <iframe
                          srcDoc={previewHtml}
                          className="w-full"
                          style={{ height: "520px", border: "none" }}
                          title="Email Preview"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white">
                  <p className="text-xs text-gray-400">
                    Placeholders (name, agent, email) are filled automatically before sending
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEmailTemplateOpen(false); setSelectedTemplateId(null); }}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedTemplateId) return;
                        sendTemplateMutation.mutate({ templateId: selectedTemplateId, contactId: contact.id });
                      }}
                      disabled={!selectedTemplateId || sendTemplateMutation.isPending || !contact.email}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendTemplateMutation.isPending ? "Sending…" : "Send Email"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="ws-actions">
            <button className="ws-btn ws-btn-call" onClick={() => onAction("call")} disabled={isCallPending} style={isCallPending ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>{isCallPending ? "Calling…" : "Call"}</button>
            <button className="ws-btn ws-btn-sold" onClick={() => onAction("sold")}>Sold</button>
            <button className="ws-btn ws-btn-cb" onClick={() => onAction("callback")}>Callback</button>
            <button className="ws-btn ws-btn-done" onClick={() => onAction("done")}>Not Interested</button>
            <button className="ws-btn ws-btn-skip" onClick={() => onAction("skip")}>Next</button>
          </div>

          {/* Take Payment + Send Email Template dropdown — 50/50 */}
          <div className="ws-btn-pair">
            <button className="ws-btn-pay ws-btn-pair-item" onClick={() => setPayOpen(!payOpen)}>
              Take Payment
            </button>
            <button
              className="ws-btn-email ws-btn-pair-item"
              onClick={() => setEmailTemplateOpen(true)}
            >
              Send Email
            </button>
          </div>

          {payOpen && (
            <StripePaymentSection
              contact={contact}
              isAdmin={isAdmin}
              onSuccess={() => {
                setPayOpen(false);
                onAction("sold");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// STRIPE PAYMENT SECTION COMPONENT
// ==========================================

/** Inner form that uses Stripe hooks (must be inside <Elements>) */
function StripeCheckoutForm({
  contactId,
  customerId,
  onSuccess,
}: {
  contactId: number;
  customerId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirmPaymentMutation = trpc.contacts.confirmPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment successful! Contact marked as Sold.");
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(`Failed to save payment: ${err.message}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMsg(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMsg(error.message || "Payment failed. Please try again.");
      setProcessing(false);
    } else {
      // Payment succeeded — save to DB
      confirmPaymentMutation.mutate({
        contactId,
        stripeCustomerId: customerId,
      });
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMsg && (
        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
          <AlertCircle size={12} /> {errorMsg}
        </div>
      )}
      <button
        type="submit"
        className="ws-pay-submit"
        disabled={!stripe || processing}
        style={processing ? { opacity: 0.6, cursor: "not-allowed" } : {}}
      >
        {processing ? "Processing…" : "Charge \u00a34.95"}
      </button>
    </form>
  );
}

/** Wrapper that handles PaymentIntent creation and renders Stripe Elements */
function StripePaymentSection({
  contact,
  isAdmin,
  onSuccess,
}: {
  contact: Contact;
  isAdmin: boolean;
  onSuccess: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<{ paid: boolean; amount?: string | null; paidAt?: string | null } | null>(null);

  const sendPaymentEmail = trpc.contacts.sendPaymentEmail.useMutation({
    onSuccess: () => {
      setEmailSent(true);
      setEmailLoading(false);
      toast.success("Payment email sent to " + contact.email);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send payment email.");
      setEmailLoading(false);
    },
  });

  const handleSendPaymentEmail = () => {
    if (!contact.email) {
      toast.error("Contact must have an email address.");
      return;
    }
    setEmailLoading(true);
    setEmailSent(false);
    sendPaymentEmail.mutate({
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
    });
  };

  const handleCheckPayment = async () => {
    if (!contact.email) {
      toast.error("Contact must have an email address.");
      return;
    }
    setCheckingPayment(true);
    setPaymentStatus(null);
    try {
      const res = await fetch(`/api/trpc/contacts.checkPaymentStatus?input=${encodeURIComponent(JSON.stringify({ email: contact.email, contactId: contact.id }))}`);
      const data = await res.json();
      const result = data?.result?.data;
      if (result?.paid) {
        setPaymentStatus({ paid: true, amount: result.amount, paidAt: result.paidAt });
        toast.success("Payment confirmed! £" + result.amount);
      } else {
        setPaymentStatus({ paid: false });
        toast.error("No payment found for this customer.");
      }
    } catch (err) {
      toast.error("Failed to check payment status.");
    }
    setCheckingPayment(false);
  };

  const createPaymentIntent = trpc.contacts.createPaymentIntent.useMutation({
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setCustomerId(data.customerId);
      setLoading(false);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to initialize payment.");
      setLoading(false);
    },
  });

  const handleTakePayment = () => {
    if (!contact.email) {
      setError("Contact must have an email address to process payment.");
      return;
    }
    setLoading(true);
    setError(null);
    setClientSecret(null);
    setCustomerId(null);
    createPaymentIntent.mutate({
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
    });
  };

  const stripePromise = testMode ? stripeTestPromise : stripeLivePromise;

  return (
    <div className="ws-pay-box">
      <div className="ws-pay-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <CreditCard size={14} /> Payment Details
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTestMode(!testMode)}
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              background: testMode ? "#fef3c7" : "#d1fae5",
              color: testMode ? "#92400e" : "#065f46",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {testMode ? "⚠\ufe0f TEST" : "\u2705 LIVE"}
          </button>
        )}
      </div>

      {!clientSecret && !loading && (
        <div style={{ padding: "12px" }}>
          <button
            type="button"
            onClick={handleTakePayment}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#1a1a1a",
              color: "white",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            💳 Take Payment Over Phone
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: "16px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
          Initializing payment…
        </div>
      )}

      {error && (
        <div style={{ padding: "12px", color: "#ef4444", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* ── Send Payment Email section ── */}
      <div style={{ padding: "12px", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Or send a secure payment link via email:</div>
        <button
          type="button"
          onClick={handleSendPaymentEmail}
          disabled={emailLoading || emailSent}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            background: emailSent ? "#10b981" : "#f97316",
            color: "white",
            fontWeight: 700,
            fontSize: "13px",
            cursor: (emailLoading || emailSent) ? "not-allowed" : "pointer",
            opacity: emailLoading ? 0.6 : 1,
          }}
        >
          {emailLoading ? "Sending…" : emailSent ? "✉️ Email Sent!" : "✉️ Send Google/Apple Pay"}
        </button>
        {emailSent && (
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "6px", textAlign: "center" }}>
            Sent to {contact.email}
          </div>
        )}
      </div>

      {/* ── Check Payment Status section - temporarily hidden ── */}

      {clientSecret && customerId && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#6366f1",
                borderRadius: "8px",
                fontFamily: "Inter, system-ui, sans-serif",
                fontSizeBase: "13px",
              },
            },
          }}
        >
          <StripeCheckoutForm
            contactId={contact.id}
            customerId={customerId}
            onSuccess={onSuccess}
          />
        </Elements>
      )}
    </div>
  );
}

// ==========================================
// PITCH DATA — 7 stages with branches
// ==========================================
interface PitchBranch {
  label: string;
  says: string[];
  instruction?: string;
}

interface PitchStage {
  num: number;
  title: string;
  emoji?: string;
  instructions?: string[];
  says?: string[];
  endInstruction?: string;
  closingSay?: string;
  notes?: string[];
  branches?: {
    prompt: string;
    options: PitchBranch[];
  };
}

const PITCH_STAGES: PitchStage[] = [
  {
    num: 1,
    title: "Introduction & Discovery",
    emoji: "📞",
    instructions: ["HIGH ENERGY — NO PAUSES — CONFIDENCE — SAY IT WITH A SMILE!"],
    says: [
      '"Hi [Name], it\'s [Your Name] from Lavie Labs. We\'re a medical-grade skincare company working in partnership with UK Best Offers. We\'re calling today to send you a complimentary Anti-Ageing Starter Kit to try!"',
      '"Because our products are medical-grade and highly active, I just need to ask a few quick questions to make sure we send you the perfect match for your skin. Would you say your skin is more on the dry side, combination, or oily?"',
    ],
    endInstruction: "Listen and adapt based on their answer. Focus on how the skin FEELS to them.",
    branches: {
      prompt: "What did the customer say?",
      options: [
        {
          label: "🌵 Dry",
          says: [
            '"Have you always had drier skin, or is this a recent change where your skin just feels like it\'s lost its bounce and hydration?"',
            '"Do you ever get that tight, uncomfortable feeling right after you step out of the shower?"',
            '"Are there specific areas that feel rough or flaky, where makeup just doesn\'t sit right?"',
          ],
        },
        {
          label: "🔄 Combination",
          says: [
            '"Has it always been combination, or did you used to have oilier skin that has changed over time?"',
            '"Do you find your T-zone gets shiny by midday while your cheeks feel tight?"',
          ],
        },
        {
          label: "💧 Oily",
          says: [
            '"Have you always struggled with oily skin?"',
            '"Do you find yourself having to blot or powder throughout the day to keep the shine down?"',
            '"Are you prone to breakouts, or do you have any stubborn post-blemish marks you\'d love to fade?"',
          ],
        },
      ],
    },
  },
  {
    num: 2,
    title: "Routine & Education",
    emoji: "🧴",
    instructions: ["Build rapport and introduce Hyaluronic Acid"],
    says: [
      '"Do you currently have a skincare routine you follow morning and night? What are you using right now?"',
    ],
    endInstruction: "Listen actively. Compliment their effort, no matter how small.",
    notes: [
      '"I love that you have a routine! Taking that time for yourself is half the battle. The other half is making sure you are using powerful active ingredients which you will receive using medical grade products."',
      '"Tell me, are you familiar with Hyaluronic Acid? Have you heard of it?"',
      '"Hyaluronic Acid is actually something our bodies produce naturally. Think of it like a sponge that holds water inside your skin. It\'s what gives young skin that plump, bouncy, glowing look."',
      '"The catch is, after we turn 25, our bodies stop making as much of it. That\'s when we start noticing our skin feeling drier, looking a bit duller, and those fine lines start creeping in. Our goal is simply to give that hydration back to your skin, so it can look and feel plump, smooth, and radiant again."',
    ],
  },
  {
    num: 3,
    title: "The Magic Wand Question",
    emoji: "✨",
    instructions: ["Crucial for emotional buy-in — listen carefully"],
    says: [
      '"I always like to ask my clients this question: If you had a magic wand and could improve just ONE thing about your skin right now when you look in the mirror, what would it be? What result would make you feel amazing? It could be the eye area — some puffiness, lines, or dark circles — or it could be elasticity, or lines and wrinkles. What would your choice be?"',
    ],
    endInstruction: "Listen carefully. Recap their exact words to show you understand their pain point.",
    closingSay: '"So just to clarify, you would like to soften the lines around your mouth and treat the dry skin and get it looking more radiant. Did I get that right?"',
  },
  {
    num: 4,
    title: "Product Presentation",
    emoji: "💎",
    instructions: ["Benefit-driven — always tie back to their magic wand answer"],
    branches: {
      prompt: "Which product are you presenting?",
      options: [
        {
          label: "🧴 Matinika",
          instruction: "MATINIKA — Day & Night Cream",
          says: [
            '"Based on what you just told me about wanting to [insert their goal], the first product I am so excited to send you is called Matinika. Now, I could bore you with the science and tell you it has 32% active Hyaluronic Acid compared to the 5% you might find in high street brands, but what really matters is what it\'s going to do for you."',
            '"The very first time you put this on, you\'re going to notice the texture. It\'s incredibly silky and lightweight. It doesn\'t sit heavy on your face; your skin just drinks it right up. Instantly, that tight, dry feeling is going to vanish. Your skin is going to feel incredibly soft, deeply nourished, and you\'re going to have this beautiful, healthy glow that lasts all day long."',
            '"We have clients telling us constantly that they finally feel confident going makeup-free because their skin just looks so healthy and hydrated."',
          ],
        },
        {
          label: "✨ Oulala",
          instruction: "OULALA — Retinol Serum (Fine Lines / Texture)",
          says: [
            '"The second product I\'m including in your kit is our Oulala Face and Neck Retinol Serum. Retinol is the gold standard for anti-ageing. What this is going to do for you is gently sweep away all those tired, dead skin cells that make our complexion look dull. You are going to literally see your skin transforming — tighter, significantly smoother, and those deeper lines you mentioned are going to start softening. You\'re going to wake up looking refreshed, with that plump, youthful radiance we all want."',
          ],
        },
        {
          label: "👁️ Ashkara",
          instruction: "ASHKARA — Eye Serum (Dark Circles / Puffiness)",
          says: [
            '"Because you specifically mentioned wanting to target [dark circles / hooded eye lids / puffy bags / fine lines around the eyes], I am making sure to include our Ashkara Eye Serum in your kit. When you use this daily, it\'s going to smooth out those fine lines, visibly reduce that morning puffiness, and brighten up those dark circles. Apply the eye serum mornings and evenings."',
          ],
        },
      ],
    },
  },
  {
    num: 5,
    title: "Social Proof & Website",
    emoji: "⭐",
    instructions: ["Show the website, build trust visually"],
    says: [
      '"I want to show you exactly what you\'ll be receiving. I\'ve just sent an email to [Email Address]. Could you let me know when that pops up? It will be from Lavie Labs."',
      '"Fantastic. If you click the link to our website, you\'ll see our homepage. We are incredibly proud of our rating on Trustpilot — we have thousands of happy customers who have shared their results there and across the web. I am going to be your personal skincare concierge — if you ever need anything, I\'m right here."',
      '"If you scroll down just a bit, you\'ll see some Before & After photos of real women using our products. Take a look at those. Do any of those transformations stand out to you?"',
    ],
    endInstruction: "Guide them to see the results they want.",
    notes: [
      '🎁 Compare the women on our website with your customer\'s needs!',
      '"Look at the brightness in their skin. You can see how much softer their fine lines look, and they all have that gorgeous, healthy glow. That is exactly the result we are aiming for with your skin using the Matinika and the [Oulala/Ashkara]."',
    ],
  },
  {
    num: 6,
    title: "The Offer & Close",
    emoji: "🎁",
    instructions: ["Confident, clear, no hesitation"],
    says: [
      '"Here is how this works: We are sending you a 21-day, completely risk-free trial of the Matinika, alongside a starter size of the serum. We want you to feel the textures, see the glow, and experience the results in your own mirror without any pressure."',
      '"If for any reason you don\'t absolutely love how your skin feels, you can pause or cancel at any time, no questions asked."',
      '"Once you fall in love with the results, as a VIP client, you unlock a permanent 30% discount. So instead of paying the normal £59 for a two-month supply of Matinika, it comes all the way down to just £44.95 every 60 days."',
      '"We send everything via our premium 48-hour tracked delivery with signature on arrival, so your package is always safe and in your hands. We just ask you to cover the small £4.95 postage fee today."',
      '"I am so excited for you to start seeing real changes in your skin, especially with [reiterate their main concern]. Are you ready to give your skin the hydration it deserves and try this out?"',
    ],
    endInstruction: "Process payment. Stop talking. Do not add anything.",
    closingSay: '"Will you be using Visa, Mastercard, or Amex for the £4.95 postage?"',
  },
  {
    num: 7,
    title: "Confirmation & Usage",
    emoji: "✅",
    instructions: ["Warm close — set expectations and build excitement"],
    says: [
      '"Perfect. Just to summarise for our recorded line: Today it is just £4.95 for the premium tracked shipping. You are receiving your Matinika and your starter [Oulala/Ashkara]."',
      '"In 21 days, if you\'re loving your results — and I know you will be — your subscription will begin and you\'ll receive your next supply at your exclusive 30% VIP discount."',
      '"For best results, use the Matinika morning and night on clean skin. Apply a small amount — a little goes a long way — and gently massage it in until fully absorbed. Follow with the [Oulala/Ashkara] serum. You should start noticing a difference in how your skin feels within the first few days."',
      '"I\'m going to send you a confirmation email right now with all the details, your order number, and my direct contact information. If you ever have any questions, please don\'t hesitate to reach out — I am your personal skincare concierge and I am here for you."',
      '"I am so excited for you to start this journey. Enjoy your beautiful new skin!"',
    ],
    endInstruction: "End the call warmly. The customer should feel excited, not sold to.",
  },
];

// ==========================================
// HELPERS — merge custom content onto a stage
// ==========================================
function mergeStage(original: PitchStage, custom: Record<string, unknown> | null): PitchStage {
  if (!custom) return original;
  return {
    ...original,
    says: (custom.says as string[] | undefined) ?? original.says,
    notes: (custom.notes as string[] | undefined) ?? original.notes,
    closingSay: (custom.closingSay as string | undefined) ?? original.closingSay,
    instructions: (custom.instructions as string[] | undefined) ?? original.instructions,
    endInstruction: (custom.endInstruction as string | undefined) ?? original.endInstruction,
  };
}

function extractEditable(stage: PitchStage): Record<string, unknown> {
  return {
    says: stage.says ?? [],
    notes: stage.notes ?? [],
    closingSay: stage.closingSay ?? "",
    instructions: stage.instructions ?? [],
    endInstruction: stage.endInstruction ?? "",
  };
}

// ==========================================
// EDITABLE TEXTAREA FOR SAY LINES
// ==========================================
function EditableSayLine({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <textarea
      className={`ws-edit-textarea ${className || ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.max(2, Math.ceil(value.length / 80))}
    />
  );
}

// ==========================================
// SCRIPT PANEL — 7 stages + Edit/Reset + Branches
// ==========================================
function ScriptPanel({
  customMap,
  onSave,
  onReset,
  isSaving,
  isManagerView,
}: {
  customMap: Record<number, Record<string, unknown>>;
  onSave: (stageNum: number, content: Record<string, unknown>) => void;
  onReset: (stageNum: number) => void;
  isSaving: boolean;
  isManagerView?: boolean;
}) {
  const [openStages, setOpenStages] = useState<number[]>([]);
  const [activeBranches, setActiveBranches] = useState<Record<string, string>>({});
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown> | null>(null);

  const toggleStage = (num: number) => {
    setOpenStages((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  };

  const selectBranch = (stageNum: number, label: string) => {
    const key = `stage-${stageNum}`;
    setActiveBranches((prev) => ({
      ...prev,
      [key]: prev[key] === label ? "" : label,
    }));
  };

  const startEditing = (stage: PitchStage, customContent: Record<string, unknown> | null) => {
    const merged = mergeStage(stage, customContent);
    setEditingStage(stage.num);
    setEditDraft(extractEditable(merged));
    if (!openStages.includes(stage.num)) {
      setOpenStages((prev) => [...prev, stage.num]);
    }
  };

  const cancelEditing = () => {
    setEditingStage(null);
    setEditDraft(null);
  };

  const saveEditing = (stageNum: number) => {
    if (!editDraft) return;
    onSave(stageNum, editDraft);
    setEditingStage(null);
    setEditDraft(null);
  };

  const updateDraftField = (field: string, value: unknown) => {
    setEditDraft((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const updateDraftArrayItem = (field: string, index: number, value: string) => {
    setEditDraft((prev) => {
      if (!prev) return null;
      const arr = [...((prev[field] as string[]) || [])];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  return (
    <div className="ws-pitch-panel">
      {PITCH_STAGES.map((originalStage) => {
        const customContent = customMap[originalStage.num] || null;
        const isCustomized = !!customContent;
        const stage = mergeStage(originalStage, customContent);
        const isOpen = openStages.includes(stage.num);
        const isEditing = editingStage === stage.num;
        const branchKey = `stage-${stage.num}`;
        const activeBranch = activeBranches[branchKey] || "";

        return (
          <div key={stage.num} className={`ws-pitch-stage ${isOpen ? "" : "collapsed"}`}>
            {/* Header */}
            <div className="ws-ps-header" onClick={() => !isEditing && toggleStage(stage.num)}>
              <div className="ws-ps-num">{stage.num}</div>
              <div className="ws-ps-title">
                {stage.emoji && <span>{stage.emoji}</span>}
                {stage.title}
                {isCustomized && !isEditing && (
                  <span className="ws-customized-badge" title="This stage has been customized">
                    <AlertCircle size={12} /> Modified
                  </span>
                )}
              </div>
              <div className="ws-ps-actions" onClick={(e) => e.stopPropagation()}>
                {isEditing ? (
                  <>
                    <button
                      className="ws-action-btn ws-save-btn"
                      onClick={() => saveEditing(stage.num)}
                      disabled={isSaving}
                    >
                      <Save size={13} /> Save
                    </button>
                    <button className="ws-action-btn ws-cancel-btn" onClick={cancelEditing}>
                      <X size={13} /> Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="ws-action-btn ws-edit-btn"
                      onClick={() => startEditing(originalStage, customContent)}
                      title="Edit this stage"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    {isCustomized && (
                      <button
                        className="ws-action-btn ws-reset-btn"
                        onClick={() => {
                          if (confirm("Reset this stage to the original script?")) {
                            onReset(stage.num);
                          }
                        }}
                        title="Reset to original"
                      >
                        <RotateCcw size={13} /> Original
                      </button>
                    )}
                  </>
                )}
              </div>
              {!isEditing && (
                <span className="ws-ps-arrow">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              )}
            </div>

            {/* Body */}
            {isOpen && (
              <div className="ws-ps-body">
                {isEditing && editDraft ? (
                  /* ── EDIT MODE ── */
                  <div className="ws-edit-mode">
                    {((editDraft.instructions as string[]) || []).length > 0 && (
                      <div className="ws-edit-section">
                        <label className="ws-edit-label">Instructions (green text)</label>
                        {((editDraft.instructions as string[]) || []).map((inst, i) => (
                          <EditableSayLine
                            key={i}
                            value={inst}
                            onChange={(v) => updateDraftArrayItem("instructions", i, v)}
                            className="ws-edit-instruction"
                          />
                        ))}
                      </div>
                    )}

                    {((editDraft.says as string[]) || []).length > 0 && (
                      <div className="ws-edit-section">
                        <label className="ws-edit-label">Say Lines</label>
                        {((editDraft.says as string[]) || []).map((say, i) => (
                          <EditableSayLine
                            key={i}
                            value={say}
                            onChange={(v) => updateDraftArrayItem("says", i, v)}
                          />
                        ))}
                      </div>
                    )}

                    {(editDraft.endInstruction as string) && (
                      <div className="ws-edit-section">
                        <label className="ws-edit-label">End Instruction</label>
                        <EditableSayLine
                          value={editDraft.endInstruction as string}
                          onChange={(v) => updateDraftField("endInstruction", v)}
                          className="ws-edit-instruction"
                        />
                      </div>
                    )}

                    {((editDraft.notes as string[]) || []).length > 0 && (
                      <div className="ws-edit-section">
                        <label className="ws-edit-label">Notes</label>
                        {((editDraft.notes as string[]) || []).map((note, i) => (
                          <EditableSayLine
                            key={i}
                            value={note}
                            onChange={(v) => updateDraftArrayItem("notes", i, v)}
                          />
                        ))}
                      </div>
                    )}

                    {(editDraft.closingSay as string) && (
                      <div className="ws-edit-section">
                        <label className="ws-edit-label">Closing Line</label>
                        <EditableSayLine
                          value={editDraft.closingSay as string}
                          onChange={(v) => updateDraftField("closingSay", v)}
                        />
                      </div>
                    )}

                    <p className="ws-edit-note-text">
                      Branch buttons (skin type / product) cannot be edited — only the text content above.
                    </p>
                  </div>
                ) : (
                  /* ── VIEW MODE ── */
                  <>
                    {stage.instructions?.map((inst, i) => (
                      <div key={i} className="ws-ps-instruction">{inst}</div>
                    ))}

                    {stage.says?.map((say, i) => (
                      <div key={i} className="ws-ps-say">{say.replace(/^"+|"+$/g, '')}</div>
                    ))}

                    {stage.endInstruction && (
                      <div className="ws-ps-instruction">{stage.endInstruction}</div>
                    )}

                    {stage.notes?.map((note, i) => (
                      <div key={i} className="ws-ps-say">{note.replace(/^"+|"+$/g, '')}</div>
                    ))}

                    {stage.closingSay && (
                      <div className="ws-ps-say ws-ps-closing">{stage.closingSay.replace(/^"+|"+$/g, '')}</div>
                    )}

                    {/* Branch Buttons */}
                    {stage.branches && (
                      <div className="ws-branch-section">
                        <div className="ws-branch-prompt">{stage.branches.prompt}</div>
                        <div className="ws-branch-buttons">
                          {stage.branches.options.map((opt) => (
                            <button
                              key={opt.label}
                              className={`ws-branch-btn ${activeBranch === opt.label ? "active" : ""}`}
                              onClick={() => selectBranch(stage.num, opt.label)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {stage.branches.options.map((opt) =>
                          activeBranch === opt.label ? (
                            <div key={opt.label} className="ws-branch-content">
                              {opt.instruction && (
                                <div className="ws-ps-instruction">{opt.instruction}</div>
                              )}
                              {opt.says.map((say, i) => (
                                <div key={i} className="ws-ps-say">{say.replace(/^"+|"+$/g, '')}</div>
                              ))}
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// AGENT PITCH PANEL — own editable pitch (wrapper with tRPC)
// ==========================================
function AgentPitchPanel() {
  const { data: customizations, isLoading } = trpc.pitch.myCustomizations.useQuery();
  const utils = trpc.useUtils();

  const upsertMut = trpc.pitch.upsert.useMutation({
    onSuccess: () => {
      utils.pitch.myCustomizations.invalidate();
      toast.success("Stage saved!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetMut = trpc.pitch.reset.useMutation({
    onSuccess: () => {
      utils.pitch.myCustomizations.invalidate();
      toast.success("Stage reset to original");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const customMap = useMemo(() => {
    const map: Record<number, Record<string, unknown>> = {};
    if (customizations) {
      for (const c of customizations) {
        map[c.stageNum] = c.customContent as Record<string, unknown>;
      }
    }
    return map;
  }, [customizations]);

  const handleSave = useCallback(
    (stageNum: number, content: Record<string, unknown>) => {
      upsertMut.mutate({ stageNum, customContent: content });
    },
    [upsertMut]
  );

  const handleReset = useCallback(
    (stageNum: number) => {
      resetMut.mutate({ stageNum });
    },
    [resetMut]
  );

  if (isLoading) {
    return <div className="ws-loading">Loading your pitch...</div>;
  }

  return (
    <ScriptPanel
      customMap={customMap}
      onSave={handleSave}
      onReset={handleReset}
      isSaving={upsertMut.isPending}
    />
  );
}

// ==========================================
// MANAGER VIEW — see & edit agent pitches
// ==========================================
function ManagerView({
  selectedAgentId,
  setSelectedAgentId,
}: {
  selectedAgentId: number | null;
  setSelectedAgentId: (id: number | null) => void;
}) {
  const { data: allUsers } = trpc.pitch.allUsers.useQuery();
  const { data: overview } = trpc.pitch.agentsOverview.useQuery();
  const { data: agentCustomizations } = trpc.pitch.agentCustomizations.useQuery(
    { agentUserId: selectedAgentId! },
    { enabled: !!selectedAgentId }
  );
  const utils = trpc.useUtils();

  const adminUpsert = trpc.pitch.adminUpsert.useMutation({
    onSuccess: () => {
      utils.pitch.agentCustomizations.invalidate();
      utils.pitch.agentsOverview.invalidate();
      toast.success("Agent's stage updated!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adminReset = trpc.pitch.adminReset.useMutation({
    onSuccess: () => {
      utils.pitch.agentCustomizations.invalidate();
      utils.pitch.agentsOverview.invalidate();
      toast.success("Agent's stage reset to original");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const overviewMap = useMemo(() => {
    const map: Record<number, Set<number>> = {};
    if (overview) {
      for (const row of overview) {
        if (!map[row.userId]) map[row.userId] = new Set();
        map[row.userId].add(row.stageNum);
      }
    }
    return map;
  }, [overview]);

  const customMap = useMemo(() => {
    const map: Record<number, Record<string, unknown>> = {};
    if (agentCustomizations) {
      for (const c of agentCustomizations) {
        map[c.stageNum] = c.customContent as Record<string, unknown>;
      }
    }
    return map;
  }, [agentCustomizations]);

  const handleSave = useCallback(
    (stageNum: number, content: Record<string, unknown>) => {
      if (!selectedAgentId) return;
      adminUpsert.mutate({ agentUserId: selectedAgentId, stageNum, customContent: content });
    },
    [adminUpsert, selectedAgentId]
  );

  const handleReset = useCallback(
    (stageNum: number) => {
      if (!selectedAgentId) return;
      adminReset.mutate({ agentUserId: selectedAgentId, stageNum });
    },
    [adminReset, selectedAgentId]
  );

  const agents = useMemo(() => allUsers || [], [allUsers]);

  return (
    <div>
      <div className="ws-manager-bar">
        <Eye size={16} />
        <span className="ws-manager-label">Viewing agent:</span>
        <select
          className="ws-manager-select"
          value={selectedAgentId ?? ""}
          onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select an agent...</option>
          {agents.map((a: any) => {
            const modCount = overviewMap[a.id]?.size || 0;
            return (
              <option key={a.id} value={a.id}>
                {a.name || a.email} {modCount > 0 ? `(${modCount} modified)` : ""}
              </option>
            );
          })}
        </select>
      </div>

      {selectedAgentId ? (
        <ScriptPanel
          customMap={customMap}
          onSave={handleSave}
          onReset={handleReset}
          isSaving={adminUpsert.isPending}
          isManagerView
        />
      ) : (
        <div className="ws-empty-state">
          <Users size={40} className="text-gray-300" />
          <p>Select an agent to view and edit their pitch customizations</p>
        </div>
      )}
    </div>
  );
}

// ==========================================
// QUICK TOOLS — OBJECTIONS + PRODUCTS (UNCHANGED)
// ==========================================
const OBJECTIONS = [
  { q: '"It\'s a subscription?"', a: ['I\'m so glad you asked! Yes, after your 21-day free trial it automatically transitions into a subscription — so you never run out.', 'But here\'s the best part: you are in complete control.', 'You can cancel, pause, or change it at any time with just one click or a quick email.', 'Most of our ladies keep it going because they fall in love with how their skin looks — and it locks in your 30% VIP discount forever.', 'Does that make sense?'] },
  { q: '"I don\'t trust giving my card"', a: ['I completely understand — and honestly, I respect that you\'re careful with your card details. That tells me you\'re smart.', 'Let me reassure you: Lavie Labs is a fully regulated UK company.', 'We have thousands of happy customers who have shared their results on Trustpilot and across the web.', 'Your details are completely safe with us, and we use fully encrypted, secure payment processing.'] },
  { q: '"Too many products"', a: ['I hear that a lot, and I completely understand.', 'If your cabinet is full, those products probably promised results but didn\'t fully deliver.', 'That\'s exactly why we created Matinika — it replaces them all.', 'For the next 21 days it\'s completely free. Just try it and let it prove itself.', 'No commitment, no pressure.'] },
  { q: '"Need to think about it"', a: ['The trial is completely risk-free.', 'You\'re not committing — just trying.', 'Cancel with one click, any time.'] },
  { q: '"Is it really medical-grade?"', a: ['32% active Hyaluronic Acid — 6x more than anything on the high street.', 'Formulated by dermatologists.', 'Not available in shops — only direct from Lavie Labs.'] },
];

const PRODUCTS = [
  { name: "Matinika — Day & Night", desc: "32% Hyaluronic Acid. Replaces moisturiser + serum + anti-ageing. Silky, lightweight. Instant hydration and glow." },
  { name: "Oulala — Retinol Serum", desc: "Face & Neck. Gold standard anti-ageing. Sweeps dead cells. Tighter, smoother, lines soften." },
  { name: "Ashkara — Eye Serum", desc: "Dark circles, puffiness, fine lines. Apply mornings & evenings." },
];

function QuickTools() {
  const [openObj, setOpenObj] = useState<number[]>([]);
  const [openProd, setOpenProd] = useState<number[]>([]);

  return (
    <div className="ws-quick-tools">
      {/* The Offer */}
      <div className="ws-offer">
        <div className="ws-offer-title">The Offer</div>
        <div className="ws-offer-row"><span className="ws-check">✓</span> Product is <strong>FREE</strong> — £4.95 covers shipping</div>
        <div className="ws-offer-row"><span className="ws-check">✓</span> <strong>21 days</strong> risk-free trial</div>
        <div className="ws-offer-row"><span className="ws-check">✓</span> <strong>Cancel anytime</strong></div>
        <div className="ws-offer-row"><span className="ws-check">✓</span> VIP <strong>30% off</strong> permanent</div>
        <div className="ws-offer-price">£4.95 <span className="ws-offer-sub">today</span></div>
        <div className="text-xs text-[#1f2937] mt-0.5">Then £44.95 / 60 days</div>
      </div>

      {/* Objections */}
      <div className="ws-section">
        <div className="ws-section-header">Objections</div>
        {OBJECTIONS.map((obj, i) => {
          const isOpen = openObj.includes(i);
          return (
            <div key={i} className={`ws-obj-item ${isOpen ? "open" : ""}`} onClick={() => {
              setOpenObj(prev => prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i]);
            }}>
              <div className="ws-obj-q">
                <span className="ws-obj-arrow">{isOpen ? "▼" : "▶"}</span> {obj.q}
              </div>
              {isOpen && (
                <div className="ws-obj-a">
                  {Array.isArray(obj.a)
                    ? <ul className="ws-obj-bullets">{obj.a.map((line, li) => <li key={li}>{line}</li>)}</ul>
                    : obj.a
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Products */}
      <div className="ws-section">
        <div className="ws-section-header">Products</div>
        {PRODUCTS.map((prod, i) => {
          const isOpen = openProd.includes(i);
          return (
            <div key={i} className={`ws-prod-item ${isOpen ? "open" : ""}`} onClick={() => {
              setOpenProd(prev => prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i]);
            }}>
              <div className="ws-prod-name">
                <span className="ws-prod-arrow">{isOpen ? "▼" : "▶"}</span> {prod.name}
              </div>
              {isOpen && <div className="ws-prod-desc">{prod.desc}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// CALLBACKS PANEL — list all scheduled callbacks
// ==========================================
function CallbacksPanel({
  callbacks,
  onSelectContact,
  onReschedule,
  onCancel,
}: {
  callbacks: any[];
  onSelectContact: (id: number) => void;
  onReschedule: (id: number, name: string) => void;
  onCancel: (id: number, name: string) => void;
}) {
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});
  const now = new Date();

  if (callbacks.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", color: "#6b7280",
        gap: 12,
      }}>
        <Calendar size={40} className="text-gray-300" />
        <p style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>No callbacks scheduled \uD83C\uDF89</p>
        <p style={{ fontSize: 13, color: "#9ca3af" }}>When you schedule callbacks, they'll appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
      {callbacks.map((cb) => {
        const cbDate = cb.callbackAt ? new Date(cb.callbackAt) : null;
        const isOverdue = cbDate ? cbDate <= now : false;
        const formattedDate = cbDate
          ? cbDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
            ", " + cbDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "No date";
        const notesText = cb.callNotes || "";
        const notesLines = notesText.split("\n");
        const isExpanded = expandedNotes[cb.id] || false;
        const shouldTruncate = notesLines.length > 2;
        const displayedNotes = isExpanded ? notesText : notesLines.slice(0, 2).join("\n");

        return (
          <div
            key={cb.id}
            style={{
              background: isOverdue ? "#fef2f2" : "#f9fafb",
              border: isOverdue ? "1.5px solid #fca5a5" : "1.5px solid #e5e7eb",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Top row: name + action buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{cb.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{cb.phone || "No phone"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => onReschedule(cb.id, cb.name)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1.5px solid #d1d5db",
                    background: "#fff",
                    color: "#374151",
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Pencil size={11} /> Reschedule
                </button>
                <button
                  onClick={() => onCancel(cb.id, cb.name)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1.5px solid #fca5a5",
                    background: "#fff",
                    color: "#dc2626",
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={11} /> Closed
                </button>
                <button
                  onClick={() => onSelectContact(cb.id)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 7,
                    border: "none",
                    background: isOverdue ? "#dc2626" : "#4F46E5",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Phone size={12} /> Call Now
                </button>
              </div>
            </div>

            {/* Date row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600,
              color: isOverdue ? "#dc2626" : "#4F46E5",
            }}>
              <Calendar size={12} />
              {formattedDate}
              {isOverdue && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  background: "#dc2626", color: "#fff",
                  padding: "2px 6px", borderRadius: 4,
                }}>OVERDUE</span>
              )}
            </div>

            {/* Notes */}
            {notesText && (
              <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
                <div style={{ whiteSpace: "pre-wrap" }}>{displayedNotes}</div>
                {shouldTruncate && (
                  <button
                    onClick={() => setExpandedNotes((prev) => ({ ...prev, [cb.id]: !isExpanded }))}
                    style={{
                      background: "none", border: "none", color: "#6366f1",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      padding: "4px 0 0 0",
                    }}
                  >
                    {isExpanded ? "Show less" : "Show more..."}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// MAIN WORKSPACE PAGE
// ==========================================
export default function Workspace() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [localDoneItems, setLocalDoneItems] = useState<Record<number, string>>({});
  const [listFilter, setListFilter] = useState<string>("active");

  const [activeTab, setActiveTab] = useState<"pitch" | "callbacks" | "manager">("pitch");
  const managerMode = activeTab === "manager";
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('ws_selectedAgentId');
    return saved ? Number(saved) : null;
  });
  // Persist selectedAgentId to localStorage
  useEffect(() => {
    if (selectedAgentId !== null) {
      localStorage.setItem('ws_selectedAgentId', String(selectedAgentId));
    } else {
      localStorage.removeItem('ws_selectedAgentId');
    }
  }, [selectedAgentId]);

  // Fetch all users (for manager view agent filtering)
  const { data: allUsersWs } = trpc.pitch.allUsers.useQuery(undefined, { enabled: true });
  const selectedAgentEmail = useMemo(() => {
    if (!managerMode) {
      // In "My Pitch" mode, always show only the current user's own leads
      return user?.email ?? undefined;
    }
    if (!selectedAgentId || !allUsersWs) return undefined;
    const agent = allUsersWs.find((u: any) => u.id === selectedAgentId);
    return agent?.email ?? undefined;
  }, [managerMode, selectedAgentId, allUsersWs, user?.email]);

  // ── Callback scheduler modal state ──
  const [callbackModal, setCallbackModal] = useState<{ contactId: number; contactName: string } | null>(null);
  const [callbackDateTime, setCallbackDateTime] = useState("");

  // ── Callbacks-due popup state ──
  const [callbacksDueOpen, setCallbacksDueOpen] = useState(false);
  const [callbacksDueDismissed, setCallbacksDueDismissed] = useState(false);

   // ── Call state (driven by CloudTalk postMessage events) ──
  const [callActive, setCallActive] = useState(false);
  const [callContactName, setCallContactName] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  // ── Phone lookup for live call matching ──
  const [incomingPhone, setIncomingPhone] = useState<string | null>(null);
  const { data: matchedContact } = trpc.contacts.lookupByPhone.useQuery(
    { phone: incomingPhone ?? "" },
    { enabled: !!incomingPhone }
  );
  // When a matched contact is found, auto-select it in the left panel
  useEffect(() => {
    if (matchedContact?.id) {
      setActiveId(matchedContact.id);
    }
  }, [matchedContact]);
  const CLOUDTALK_ORIGINS_WS = [
    "https://phone.cloudtalk.io",
    "https://my.cloudtalk.io",
    "https://app.cloudtalk.io",
  ];
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!CLOUDTALK_ORIGINS_WS.some(o => e.origin === o || e.origin.endsWith(".cloudtalk.io"))) return;
      // CloudTalk sends data as a JSON string
      let data: Record<string, unknown>;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data) return;
      const evt = (data.event ?? data.type ?? "") as string;
      const props = (data.properties ?? {}) as Record<string, unknown>;
      if (evt === "ringing" || evt === "dialing" || evt === "calling") {
        setCallActive(true);
        // Extract phone number for contact lookup
        const rawPhone = (props.external_number ?? "") as string;
        if (rawPhone) setIncomingPhone(rawPhone);
        // Also try name from CloudTalk contact info
        const ctContact = props.contact as Record<string, unknown> | undefined;
        const name = (ctContact?.name ?? null) as string | null;
        if (name) setCallContactName(name);
      }
      if (evt === "hangup" || evt === "ended" || evt === "idle") {
        setCallActive(false);
        setCallContactName(null);
        setIncomingPhone(null);
        setIsMuted(false);
        setIsOnHold(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);;

  // Send a command to the CloudTalk iframe
  const sendToCloudTalk = useCallback((event: string) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="phone.cloudtalk.io"]');
    if (!iframe?.contentWindow) {
      toast.error("CloudTalk dialler is not open. Please open the phone widget first.");
      return;
    }
    iframe.contentWindow.postMessage(
      JSON.stringify({ event, properties: {} }),
      "https://phone.cloudtalk.io"
    );
  }, []);

  const handleMute = useCallback(() => {
    sendToCloudTalk(isMuted ? "unmute" : "mute");
    setIsMuted(v => !v);
  }, [isMuted, sendToCloudTalk]);

  const handleHold = useCallback(() => {
    sendToCloudTalk(isOnHold ? "unhold" : "hold");
    setIsOnHold(v => !v);
  }, [isOnHold, sendToCloudTalk]);

  const handleEndCall = useCallback(() => {
    sendToCloudTalk("hangup");
  }, [sendToCloudTalk]);

  // Fetch contacts from the API (filter by selected agent in manager mode, or current user in My Pitch)
  const { data: contacts = [], refetch } = trpc.contacts.list.useQuery(
    { search: searchQuery || undefined, limit: 5000, agentEmail: selectedAgentEmail },
    { enabled: true, staleTime: 0, refetchOnMount: "always" }
  );

  // Derive done state from persisted DB status so it survives navigation
  const doneItems = useMemo(() => {
    const fromDB: Record<number, string> = {};
    for (const c of contacts as any[]) {
      if (c.status === "done_deal") fromDB[c.id] = "Sold";
      else if (c.status === "do_not_call") fromDB[c.id] = "No";
      else if (c.status === "closed") fromDB[c.id] = "No";
      else if (c.status === "no_answer") fromDB[c.id] = "Skip";
      else if (c.status === "skipped") fromDB[c.id] = "Skip";
    }
    return { ...fromDB, ...localDoneItems };
  }, [contacts, localDoneItems]);

  // ── Callbacks due query (placed after contacts/doneItems to avoid reference errors) ──
  const { data: callbacksDue = [] } = trpc.contacts.callbacksDue.useQuery(
    undefined,
    { staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000 }
  );
  // Show popup on mount when there are due callbacks
  useEffect(() => {
    if (callbacksDue.length > 0 && !callbacksDueDismissed) {
      setCallbacksDueOpen(true);
    }
  }, [callbacksDue.length, callbacksDueDismissed]);

  // ── All callbacks query (for My Callbacks tab) ──
  const { data: allCallbacks = [] } = trpc.contacts.allCallbacks.useQuery(
    undefined,
    { staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000 }
  );
  const overdueCallbackCount = useMemo(() => {
    const now = new Date();
    return (allCallbacks as any[]).filter((c) => c.callbackAt && new Date(c.callbackAt) <= now).length;
  }, [allCallbacks]);

  // How to Use guide modal
  const [showGuide, setShowGuide] = useState(false);

  // Click-to-call mutation
  const [callCooldown, setCallCooldown] = useState(false);
  const clickToCall = trpc.contacts.clickToCall.useMutation({
    onSuccess: () => {
      toast.success("Call initiated! Your phone will ring first.");
      setCallCooldown(true);
      setTimeout(() => setCallCooldown(false), 15000);
    },
    onError: (err) => {
      if (err.message === "NO_CLOUDTALK_AGENT_ID") {
        toast.error(
          <div>
            You haven't set your CloudTalk Agent ID yet.{" "}
            <a
              href="/profile-settings"
              className="underline font-bold text-[#4F46E5]"
              onClick={(e) => {
                e.preventDefault();
                navigate("/profile-settings");
              }}
            >
              Go to Profile Settings
            </a>{" "}
            to add it.
          </div>
        );
      } else {
        toast.error(`Call failed: ${err.message}`);
      }
    },
  });

  // Update contact mutation
  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // ── Add Contact modal ──
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ name: "", phone: "", email: "", address: "", source: "" });
  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      toast.success("Contact added successfully!");
      refetch();
      setShowAddContactModal(false);
      setAddContactForm({ name: "", phone: "", email: "", address: "", source: "" });
    },
    onError: (err: any) => toast.error(`Failed to add contact: ${err.message}`),
  });

  // Map action label → contact status for DB persistence
  const ACTION_TO_STATUS: Record<string, string> = {
    sold: "done_deal",
    no: "do_not_call",
    callback: "working",
    skip: "no_answer",
    done: "done",
  };

  const handleAction = (contactId: number, action: string, phone?: string) => {
    if (action === "call") {
      if (callCooldown || clickToCall.isPending) return;
      clickToCall.mutate({ contactId });
    } else if (action === "callback") {
      // Open date/time picker modal — do NOT mark done yet
      const contact = (contacts as any[]).find((c) => c.id === contactId);
      setCallbackDateTime("");
      setCallbackModal({ contactId, contactName: contact?.name ?? "Contact" });
    } else if (action === "next") {
      // Advance to next contact without any status change
      const currentIndex = contacts.findIndex((c: any) => c.id === contactId);
      const nextContact = contacts[currentIndex + 1];
      if (nextContact) setActiveId(nextContact.id);
    } else if (action === "sold" || action === "no" || action === "skip" || action === "done") {
      // If next is pressed, silently end any active/ringing call
      if (action === "skip") {
        const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="phone.cloudtalk.io"]');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify({ event: "hangup", properties: {} }), "https://phone.cloudtalk.io");
        }
      }
      const displayLabel = action === "sold" ? "Sold" : action === "no" ? "No" : action === "done" ? "Done" : "Skip";
      setLocalDoneItems((prev: Record<number, string>) => ({ ...prev, [contactId]: displayLabel }));
      // Persist status to DB and clear any scheduled callback
      const newStatus = ACTION_TO_STATUS[action];
      if (newStatus) {
        updateContact.mutate({ id: contactId, status: newStatus as any, callbackAt: null });
      }
      const currentIndex = contacts.findIndex((c: any) => c.id === contactId);
      const nextContact = contacts[currentIndex + 1];
      if (nextContact) setActiveId(nextContact.id);
    }
  };

  // Confirm callback: save callbackAt + append note + mark working
  const handleCallbackConfirm = () => {
    if (!callbackModal || !callbackDateTime) return;
    const { contactId, contactName } = callbackModal;
    const dt = new Date(callbackDateTime);
    // Format: "17-Apr-2026 14:30"
    const formatted = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") + " " + dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const noteAppend = `CALLBACK Scheduled on ${formatted}`;
    // Get existing notes for this contact
    const existingContact = (contacts as any[]).find((c) => c.id === contactId);
    const existingNotes = existingContact?.callNotes ?? "";
    const updatedNotes = existingNotes ? `${existingNotes.trimEnd()}\n${noteAppend}` : noteAppend;
    updateContact.mutate({
      id: contactId,
      status: "working" as any,
      callbackAt: dt,
      callNotes: updatedNotes,
    }, {
      onSuccess: () => {
        toast.success(`Callback scheduled for ${formatted}`);
        refetch();
      }
    });
    // Mark locally as Callback (non-interactive)
    setLocalDoneItems((prev: Record<number, string>) => ({ ...prev, [contactId]: "Callback" }));
    // Advance to next contact
    const currentIndex = (contacts as any[]).findIndex((c) => c.id === contactId);
    const nextContact = (contacts as any[])[currentIndex + 1];
    if (nextContact) setActiveId(nextContact.id);
    setCallbackModal(null);
    setCallbackDateTime("");
  };

  const handleFieldChange = (contactId: number, field: string, value: any) => {
    const persistedFields = ["name", "phone", "email", "status", "leadType", "skinType", "concern", "routine", "trialKit", "callNotes", "address"];
    if (persistedFields.includes(field)) {
      updateContact.mutate({ id: contactId, [field]: value });
    } else if (field === "notes") {
      // "notes" in UI maps to "callNotes" in DB
      updateContact.mutate({ id: contactId, callNotes: value });
    }
  };

  // Auto-select first contact
  useEffect(() => {
    if (contacts.length > 0 && activeId === null) {
      setActiveId(contacts[0].id);
    }
  }, [contacts, activeId]);

  // Filter contacts based on listFilter dropdown
  const filteredContacts = useMemo(() => {
    if (listFilter === "active") {
      return (contacts as any[]).filter((c) => !doneItems[c.id]);
    } else if (listFilter === "all") {
      return contacts as any[];
    } else if (listFilter === "skipped") {
      return (contacts as any[]).filter((c) => doneItems[c.id] === "Skip");
    } else if (listFilter === "sold") {
      return (contacts as any[]).filter((c) => doneItems[c.id] === "Sold");
    } else if (listFilter === "done") {
      return (contacts as any[]).filter((c) => doneItems[c.id] === "Done");
    } else if (listFilter === "no") {
      return (contacts as any[]).filter((c) => doneItems[c.id] === "No");
    } else if (listFilter === "callback") {
      return (contacts as any[]).filter((c) => doneItems[c.id] === "Callback");
    }
    return contacts as any[];
  }, [contacts, doneItems, listFilter]);
  // Stats
  const totalContacts = contacts.length;
  const activeCount = (contacts as any[]).filter((c) => !doneItems[c.id]).length;
  const doneCount = Object.keys(doneItems).length;
  const soldCount = Object.values(doneItems).filter((s) => s === "Sold").length;
  const skippedCount = Object.values(doneItems).filter((s) => s === "Skip").length;

  return (
    <div className="ws-layout">
      {/* MAIN CONTENT */}
      <div className="ws-main">
        {/* LEFT: DIAL LIST */}
        <div className="ws-dial-list">
          <div className="ws-dl-header">
            <div className="ws-dl-title-row">
              <h3>Today's List</h3>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg border-2 border-green-800 transition-colors"
                onClick={() => setShowAddContactModal(true)}
              >
                <UserPlus size={13} /> Add Contact
              </button>

              <div className="ws-dl-stats">
                <div className="ws-dl-stat">
                  <div className="ws-dl-stat-num">{totalContacts}</div>
                  <div className="ws-dl-stat-label">Total</div>
                </div>
                <div className="ws-dl-stat">
                  <div className="ws-dl-stat-num">{doneCount}</div>
                  <div className="ws-dl-stat-label">Done</div>
                </div>
                <div className="ws-dl-stat">
                  <div className="ws-dl-stat-num" style={{ color: "#16a34a" }}>{soldCount}</div>
                  <div className="ws-dl-stat-label">Sold</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1f2937]" />
                <input
                  className="ws-dl-search"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                className="text-xs font-semibold px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-800 cursor-pointer focus:outline-none focus:border-indigo-400"
                style={{ minWidth: "90px" }}
              >
                <option value="active">Active ({activeCount})</option>
                <option value="all">All ({totalContacts})</option>
                <option value="skipped">Skipped ({skippedCount})</option>
                <option value="sold">Sold ({soldCount})</option>
                <option value="done">Done ({Object.values(doneItems).filter((s) => s === "Done").length})</option>
                <option value="no">No ({Object.values(doneItems).filter((s) => s === "No").length})</option>
                <option value="callback">Callback ({Object.values(doneItems).filter((s) => s === "Callback").length})</option>
              </select>
            </div>
          </div>

          <div className="ws-dl-items">
            {filteredContacts.map((contact: any, idx: number) => {
              // Overdue callbacks are always unlocked (interactive) regardless of doneItems
              const isOverdueCallback = (callbacksDue as any[]).some((c) => c.id === contact.id);
              const isSkipped = doneItems[contact.id] === "Skip";
              const isDone = isOverdueCallback ? false : (!!doneItems[contact.id] && !isSkipped);
              const prevContact = filteredContacts[idx - 1];
              const nextContact = filteredContacts[idx + 1];
              return (
                <div key={contact.id} id={`ws-contact-${contact.id}`}>
                  <ContactCard
                    contact={contact}
                    isActive={activeId === contact.id}
                    isDone={isDone}
                    doneStatus={isOverdueCallback ? undefined : doneItems[contact.id]}
                    isSkipped={isSkipped}
                    onPrev={prevContact ? () => setActiveId(prevContact.id) : undefined}
                    onNext={nextContact ? () => setActiveId(nextContact.id) : undefined}
                    onSelect={() => {
                      if (isSkipped) {
                        // Re-open skipped contact: clear local done + reset status in DB
                        setLocalDoneItems((prev: Record<number, string>) => {
                          const next = { ...prev };
                          delete next[contact.id];
                          return next;
                        });
                        updateContact.mutate({ id: contact.id, status: "new" as any });
                      }
                      setActiveId(contact.id);
                    }}
                    onClose={() => setActiveId(null)}
                    onAction={(action) => handleAction(contact.id, action, contact.phone)}
                    onFieldChange={(field, value) => handleFieldChange(contact.id, field, value)}
                    isCallPending={clickToCall.isPending || callCooldown}
                    onDelete={() => {
                      const currentIndex = contacts.findIndex((c: any) => c.id === contact.id);
                      const nextContact = contacts[currentIndex + 1] ?? contacts[currentIndex - 1];
                      deleteContact.mutate({ id: contact.id }, {
                        onSuccess: () => {
                          if (nextContact) setActiveId(nextContact.id);
                          else setActiveId(null);
                        }
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER: PITCH PANEL */}
        <div className="ws-sales-tools">
          <div className="ws-script-col">
            <div className="ws-sales-content">
              {/* ── My Pitch / My Callbacks / Manager View Toggle ── */}
              <div className="ws-mode-toggle" style={{ marginBottom: 12 }}>
                <button
                  className={`ws-mode-btn ${activeTab === "pitch" ? "active" : ""}`}
                  onClick={() => setActiveTab("pitch")}
                >
                  <Edit3 size={14} /> My Pitch
                </button>
                <button
                  className={`ws-mode-btn ${activeTab === "callbacks" ? "active" : ""}`}
                  onClick={() => setActiveTab("callbacks")}
                  style={{ position: "relative" }}
                >
                  <Calendar size={14} /> My Callbacks{allCallbacks.length > 0 && (
                    <span style={{
                      marginLeft: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "0 6px",
                      background: overdueCallbackCount > 0 ? "#dc2626" : "#6366f1",
                      color: "#fff",
                    }}>
                      {allCallbacks.length}
                    </span>
                  )}
                </button>
                <button
                  className={`ws-mode-btn ${activeTab === "manager" ? "active" : ""}`}
                  onClick={() => setActiveTab("manager")}
                >
                  <Users size={14} /> Manager View
                </button>
                <a
                  href="https://dashboard.stripe.com/payments?status%5B%5D=successful&amount%5Bgte%5D=495&amount%5Blte%5D=495"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ws-mode-btn"
                  style={{ marginLeft: "auto", background: "#635bff", color: "#fff", borderRadius: 8, padding: "6px 12px", textDecoration: "none", fontSize: 14 }}
                >
                  💳 £4.95 Payments
                </a>
                <button
                  className="ws-mode-btn"
                  onClick={() => setShowGuide(true)}
                  style={{ background: "#4f46e5", color: "#fff", borderRadius: 8, padding: "6px 12px" }}
                >
                  📖 How to Use
                </button>
              </div>

              {/* ── Tab Content ── */}
              {activeTab === "manager" ? (
                <ManagerView
                  selectedAgentId={selectedAgentId}
                  setSelectedAgentId={setSelectedAgentId}
                />
              ) : activeTab === "callbacks" ? (
                <CallbacksPanel
                  callbacks={allCallbacks as any[]}
                  onSelectContact={(id: number) => {
                    setActiveId(id);
                    setActiveTab("pitch");
                    setTimeout(() => {
                      const el = document.getElementById(`ws-contact-${id}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 100);
                  }}
                  onReschedule={(id: number, name: string) => {
                    setCallbackDateTime("");
                    setCallbackModal({ contactId: id, contactName: name });
                  }}
                  onCancel={(id: number, name: string) => {
                    if (!confirm(`Close callback for ${name}? Status will be set to Closed.`)) return;
                    updateContact.mutate({ id, status: "closed" as any, callbackAt: null }, {
                      onSuccess: () => {
                        toast.success(`${name} marked as Closed`);
                        refetch();
                      }
                    });
                  }}
                />
              ) : (
                <AgentPitchPanel />
              )}
            </div>
          </div>

          {/* RIGHT: QUICK TOOLS (Offer, Objections, Products) */}
          <div className="ws-quicktools-col">
            <div className="ws-sales-content">
              <QuickTools />
            </div>
          </div>
        </div>
      </div>

      {/* ── Callbacks Due Banner (non-blocking) ── */}
      {callbacksDueOpen && callbacksDue.length > 0 && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
            background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
            color: "#fff", padding: "10px 20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
            boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
            animation: "slideDown 0.3s ease-out"
          }}
        >
          <Calendar size={16} color="#fff" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {callbacksDue.length === 1 ? "1 Callback Due" : `${callbacksDue.length} Callbacks Due`}
          </span>
          <span style={{ fontSize: 13, opacity: 0.9 }}>—</span>
          <span style={{ fontSize: 13, opacity: 0.9 }}>
            {(callbacksDue as any[]).map((c) => c.name).join(", ")}
          </span>
          <button
            onClick={() => {
              setActiveTab("callbacks");
              setCallbacksDueOpen(false);
              setCallbacksDueDismissed(true);
            }}
            style={{
              padding: "5px 14px", borderRadius: 6, border: "2px solid rgba(255,255,255,0.6)",
              background: "rgba(255,255,255,0.15)", color: "#fff",
              fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              marginLeft: 4
            }}
          >
            View Callbacks
          </button>
          <button
            onClick={() => { setCallbacksDueOpen(false); setCallbacksDueDismissed(true); }}
            style={{
              background: "none", border: "none", color: "#fff", cursor: "pointer",
              padding: "2px 6px", fontSize: 18, fontWeight: 700, opacity: 0.7,
              marginLeft: 8
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Callback Scheduler Modal ── */}
      {callbackModal && (() => {
        const TIME_SLOTS = [
          "09:00","09:30","10:00","10:30","11:00","11:30",
          "12:00","12:30","13:00","13:30","14:00","14:30",
          "15:00","15:30","16:00","16:30","17:00","17:30",
          "18:00","18:30","19:00","19:30","20:00"
        ];
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        const in2Days = new Date(today); in2Days.setDate(today.getDate() + 2);
        const in2DaysStr = in2Days.toISOString().slice(0, 10);
        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().slice(0, 10);

        // Parse current callbackDateTime into date and time parts
        const cbParts = callbackDateTime.split("T");
        const selectedDate = cbParts[0] || "";
        const selectedTime = cbParts[1]?.slice(0, 5) || "";
        const isCustomDate = selectedDate && selectedDate !== todayStr && selectedDate !== tomorrowStr && selectedDate !== in2DaysStr && selectedDate !== nextWeekStr;
        const showCustomPicker = isCustomDate || (!selectedDate && false);

        const setDatePart = (dateStr: string) => {
          setCallbackDateTime(dateStr + "T" + (selectedTime || ""));
        };
        const setTimePart = (timeStr: string) => {
          const datePart = selectedDate || todayStr;
          setCallbackDateTime(datePart + "T" + timeStr);
        };

        const isValid = selectedDate && selectedTime;

        const quickBtnStyle = (active: boolean) => ({
          padding: "7px 14px",
          borderRadius: 8,
          border: active ? "2px solid #4F46E5" : "1.5px solid #d1d5db",
          background: active ? "#EEF2FF" : "#fff",
          color: active ? "#4F46E5" : "#374151",
          fontWeight: 600 as const,
          fontSize: 13,
          cursor: "pointer" as const,
          transition: "all 0.15s",
        });

        return (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
            }}
            onClick={() => setCallbackModal(null)}
          >
            <div
              style={{
                background: "#fff", borderRadius: 14, padding: "28px 32px",
                minWidth: 380, maxWidth: 460, boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                display: "flex", flexDirection: "column", gap: 18
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Calendar size={20} color="#4F46E5" />
                <span style={{ fontWeight: 700, fontSize: 17, color: "#1f2937" }}>Schedule Callback</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                Scheduling callback for <strong>{callbackModal.contactName}</strong>
              </p>

              {/* Quick date buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Date</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setDatePart(todayStr)} style={quickBtnStyle(selectedDate === todayStr)}>Today</button>
                  <button type="button" onClick={() => setDatePart(tomorrowStr)} style={quickBtnStyle(selectedDate === tomorrowStr)}>Tomorrow</button>
                  <button type="button" onClick={() => setDatePart(in2DaysStr)} style={quickBtnStyle(selectedDate === in2DaysStr)}>In 2 Days</button>
                  <button type="button" onClick={() => setDatePart(nextWeekStr)} style={quickBtnStyle(selectedDate === nextWeekStr)}>Next Week</button>
                  <button type="button" onClick={() => {
                    // Toggle custom mode - clear date to show picker
                    setCallbackDateTime("T" + (selectedTime || ""));
                  }} style={quickBtnStyle(!!isCustomDate)}>Custom</button>
                </div>
                {/* Custom date picker - shown when Custom is selected or date doesn't match quick buttons */}
                {(isCustomDate || (!selectedDate && callbackDateTime.startsWith("T"))) && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setDatePart(e.target.value)}
                    min={todayStr}
                    style={{
                      border: "1.5px solid #d1d5db", borderRadius: 8, padding: "8px 12px",
                      fontSize: 14, color: "#1f2937", outline: "none", marginTop: 4, width: "100%"
                    }}
                  />
                )}
              </div>

              {/* Time dropdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Time</label>
                <select
                  value={selectedTime}
                  onChange={(e) => setTimePart(e.target.value)}
                  style={{
                    border: "1.5px solid #d1d5db", borderRadius: 8, padding: "9px 12px",
                    fontSize: 14, color: "#000000", fontWeight: 700, outline: "none",
                    width: "100%", background: "#fff", cursor: "pointer"
                  }}
                >
                  <option value="" disabled>Select time...</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              {isValid && (
                <div style={{
                  background: "#F0FDF4", border: "1.5px solid #86efac", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, color: "#166534", fontWeight: 600,
                  textAlign: "center"
                }}>
                  {new Date(callbackDateTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at {selectedTime}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setCallbackModal(null)}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: "1.5px solid #d1d5db",
                    background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCallbackConfirm}
                  disabled={!isValid}
                  style={{
                    padding: "8px 20px", borderRadius: 8, border: "none",
                    background: isValid ? "#4F46E5" : "#c7d2fe",
                    color: "#fff", fontWeight: 700, fontSize: 14,
                    cursor: isValid ? "pointer" : "not-allowed"
                  }}
                >
                  Confirm Callback
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Contact Modal ── */}
      {showAddContactModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18, color: "#1f2937" }}>Add New Contact</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Name *</label>
                <input
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14 }}
                  placeholder="Full name"
                  value={addContactForm.name}
                  onChange={(e) => setAddContactForm({ ...addContactForm, name: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Phone</label>
                <input
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14 }}
                  placeholder="+447..."
                  value={addContactForm.phone}
                  onChange={(e) => setAddContactForm({ ...addContactForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Email</label>
                <input
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14 }}
                  placeholder="email@example.com"
                  value={addContactForm.email}
                  onChange={(e) => setAddContactForm({ ...addContactForm, email: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Address</label>
                <input
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14 }}
                  placeholder="Full address"
                  value={addContactForm.address}
                  onChange={(e) => setAddContactForm({ ...addContactForm, address: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Source</label>
                <input
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14 }}
                  placeholder="Data source name"
                  value={addContactForm.source}
                  onChange={(e) => setAddContactForm({ ...addContactForm, source: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => { setShowAddContactModal(false); setAddContactForm({ name: "", phone: "", email: "", address: "", source: "" }); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!addContactForm.name.trim()) { toast.error("Name is required"); return; }
                  createContactMutation.mutate({
                    name: addContactForm.name,
                    phone: addContactForm.phone || undefined,
                    email: addContactForm.email ? addContactForm.email.toLowerCase() : undefined,
                    address: addContactForm.address || undefined,
                    source: addContactForm.source || undefined,
                    status: "new",
                    department: "opening",
                    agentEmail: user?.email || "trial@lavielabs.com",
                    agentName: user?.name || "trial lavie labs",
                    leadDate: new Date().toISOString().split("T")[0],
                  });
                }}
                disabled={createContactMutation.isPending}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                {createContactMutation.isPending ? "Adding..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── How to Use Guide Modal ── */}
      {showGuide && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "32px 36px", position: "relative" }}>
            <button onClick={() => setShowGuide(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1f2937", marginBottom: 20 }}>📖 How to Use the Workspace</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>🔌 Connecting Your Phone (CloudTalk)</h3>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Download the <strong>CloudTalk Phone</strong> app on your mobile or use the desktop app</li>
                  <li>Log in with the credentials provided by your manager</li>
                  <li>Make sure your status is set to <strong>"Available"</strong></li>
                  <li>When you click "Call Now" in the system, CloudTalk will ring YOUR phone first, then connect you to the customer</li>
                </ol>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>📋 Today's List</h3>
                <p>Your daily contact list appears on the left. Each contact shows their name, phone, and status. Click on a contact to load their details and start working.</p>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>📞 Making a Call</h3>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Click the <strong>"Call"</strong> button</li>
                  <li>Your CloudTalk phone will ring — pick up!</li>
                  <li>Once you answer, the system connects you to the customer</li>
                  <li>Follow the script stages on the right panel</li>
                </ol>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>⏭️ Next Button</h3>
                <p>Click <strong>"Next"</strong> to move to the next contact in your list. If a call is currently ringing, it will automatically end the call and move you forward.</p>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>📝 Saving a Call Note</h3>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>After the call, select the outcome (Connected, Sale, No Answer, etc.)</li>
                  <li>Write what happened — key objections, outcome, next steps</li>
                  <li>Click <strong>"Save Note"</strong></li>
                  <li>The note is saved and visible to managers</li>
                </ol>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>💬 WhatsApp / Email / SMS</h3>
                <p>Use the action buttons below the contact details:</p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li><strong>WhatsApp</strong> — Opens WhatsApp with the customer's number</li>
                  <li><strong>Email</strong> — Opens email compose or use "Send Email Template" for pre-made emails</li>
                  <li><strong>SMS</strong> — Opens your phone's SMS app with the number</li>
                </ul>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>💳 Taking Payment (£4.95 Trial)</h3>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Select the Starter Kit the customer wants</li>
                  <li>Click <strong>"Send Payment Link"</strong> or use the payment box</li>
                  <li>The customer receives a secure Stripe payment link</li>
                  <li>Once paid, the status updates automatically</li>
                </ol>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>📅 Scheduling a Callback</h3>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Click the <strong>"Callback"</strong> button on the contact</li>
                  <li>Select date and time</li>
                  <li>The callback will appear in your "My Callbacks" tab</li>
                  <li>You'll see a reminder when it's time to call back</li>
                </ol>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>🎯 The Script Panel (Right Side)</h3>
                <p>The right panel shows your pitch stages (1-7). Click each stage to expand it and see the script. Follow the stages in order for best results. You can customise stages by clicking the edit icon.</p>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#4338ca", marginBottom: 6 }}>❓ Having Issues?</h3>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li><strong>Phone not ringing?</strong> — Check CloudTalk app is open and status is "Available"</li>
                  <li><strong>Can't see contacts?</strong> — Make sure your manager assigned contacts to you</li>
                  <li><strong>Payment not working?</strong> — Contact your manager immediately</li>
                  <li><strong>System slow?</strong> — Refresh the page (F5)</li>
                </ul>
              </div>

              <div style={{ background: "#f0fdf4", border: "2px solid #86efac", borderRadius: 10, padding: "14px 18px", marginTop: 4 }}>
                <p style={{ margin: 0, fontWeight: 600, color: "#166534" }}>💡 Tip: If something doesn't work, don't waste time — tell your manager right away!</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
