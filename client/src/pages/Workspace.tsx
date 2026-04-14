// File: client/src/pages/Workspace.tsx
// Full Agent Workspace UI — v8 design converted to React
// Includes: Contact card, Action buttons, Script panel, Notes dropdowns, Payment box

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Phone, Mail, MapPin, User, Pencil, Check, X, RotateCcw,
  ChevronRight, ChevronDown, CreditCard, Search
} from "lucide-react";

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
  skinType?: string;
  concerns?: string[];
  routine?: string;
  trialKit?: string;
  notes?: string;
  importedNotes?: string;
}

// ==========================================
// CONCERN OPTIONS
// ==========================================
const CONCERN_OPTIONS = [
  "Wrinkles", "Dark circles", "Puffiness", "Sun damage",
  "Dry patches", "Fine lines", "Firmness", "Acne", "Other"
];

const SKIN_OPTIONS = ["Dry", "Combination", "Oily", "Sensitive", "Normal"];
const ROUTINE_OPTIONS = ["None", "Basic", "Full routine", "Medical"];
const TRIAL_KIT_OPTIONS = ["Matinika + Oulala", "Matinika + Ashkara"];

// ==========================================
// MULTI-SELECT CONCERN COMPONENT
// ==========================================
function ConcernMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const toggle = (val: string) => {
    onChange(
      selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]
    );
  };

  return (
    <div className="ws-concern-multi" ref={ref}>
      <div className="ws-concern-trigger" onClick={() => setOpen(!open)}>
        <div className="ws-concern-tags">
          {selected.length === 0 ? (
            <span className="text-[#1f2937] text-xs">Select</span>
          ) : (
            selected.map((val) => (
              <span key={val} className="ws-concern-tag">
                {val}
                <span
                  className="ws-concern-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(val);
                  }}
                >
                  &times;
                </span>
              </span>
            ))
          )}
        </div>
        <span className="text-[#1f2937] text-[10px]">&#9660;</span>
      </div>
      {open && (
        <div className="ws-concern-dropdown">
          {CONCERN_OPTIONS.map((opt) => (
            <div
              key={opt}
              className={`ws-concern-option ${selected.includes(opt) ? "selected" : ""}`}
              onClick={() => toggle(opt)}
            >
              <span className="ws-concern-check">
                {selected.includes(opt) ? "✓" : ""}
              </span>
              {opt}
            </div>
          ))}
          <div className="ws-concern-scroll-hint">↓ scroll for more</div>
        </div>
      )}
    </div>
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
  onAction,
  onFieldChange,
}: {
  contact: Contact;
  isActive: boolean;
  isDone: boolean;
  doneStatus?: string;
  onSelect: () => void;
  onAction: (action: string) => void;
  onFieldChange: (field: string, value: any) => void;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [concerns, setConcerns] = useState<string[]>(contact.concerns ?? []);
  const [notes, setNotes] = useState(contact.notes ?? "");

  const { user } = useAuth();

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
    return selectedTemplate.htmlBody
      .replaceAll("${Customers.First Name}", (contact.name ?? "").split(" ")[0] || "[Name]")
      .replaceAll("${Customers.Customers Owner}", user?.name ?? "[Agent]")
      .replaceAll("${agentName}", user?.name ?? "[Agent Name]")
      .replaceAll("${agentEmail}", user?.email ?? "[Agent Email]");
  }, [selectedTemplate, contact, user]);

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

  const handleConcernChange = (val: string[]) => {
    setConcerns(val);
    onFieldChange("concerns", val);
  };

  return (
    <div
      className={`ws-item ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
      onClick={onSelect}
    >
      <div className="ws-row1">
        <div className="ws-avatar">{initials}</div>
        <div className="ws-name-box">
          <div className="ws-name">{contact.name}</div>
          <div className="ws-phone">{contact.phone}</div>
        </div>
        {isDone && (
          <div
            className="ws-done-icon"
            style={{
              color:
                doneStatus === "Sold"
                  ? "#16a34a"
                  : doneStatus === "N/A"
                  ? "#d97706"
                  : "#dc2626",
            }}
          >
            {doneStatus}
          </div>
        )}
      </div>

      {isActive && !isDone && (
        <div className="ws-expanded" onClick={(e) => e.stopPropagation()}>
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
                <label>Skin</label>
                <select
                  className="ws-select"
                  value={contact.skinType ?? ""}
                  onChange={(e) => onFieldChange("skinType", e.target.value)}
                >
                  <option value="">Select</option>
                  {SKIN_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="ws-field">
                <label>Concern</label>
                <ConcernMultiSelect selected={concerns} onChange={handleConcernChange} />
              </div>
            </div>
            <div className="ws-field-row">
              <div className="ws-field">
                <label>Routine</label>
                <select
                  className="ws-select"
                  value={contact.routine ?? ""}
                  onChange={(e) => onFieldChange("routine", e.target.value)}
                >
                  <option value="">Select</option>
                  {ROUTINE_OPTIONS.map((o) => (
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

          {/* Free Notes */}
          <textarea
            className="ws-notes-area"
            placeholder="Free notes..."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              onFieldChange("notes", e.target.value);
            }}
          />

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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Choose Template</p>
                    {templatesLoading && (
                      <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                    )}
                    {!templatesLoading && (!emailTemplates || emailTemplates.length === 0) && (
                      <div className="text-sm text-gray-400 text-center py-8">No templates yet</div>
                    )}
                    <div className="flex flex-col gap-2">
                      {emailTemplates?.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`w-full text-left px-3 py-3 rounded-lg border-2 transition-colors ${
                            selectedTemplateId === tpl.id
                              ? "border-amber-500 bg-amber-50"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-xs text-gray-500 mt-1 leading-snug">{tpl.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1 truncate italic">{tpl.subject}</p>
                        </button>
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
            <button className="ws-btn ws-btn-call" onClick={() => onAction("call")}>Call</button>
            <button className="ws-btn ws-btn-sold" onClick={() => onAction("sold")}>Sold</button>
            <button className="ws-btn ws-btn-na" onClick={() => onAction("na")}>N/A</button>
            <button className="ws-btn ws-btn-cb" onClick={() => onAction("callback")}>Callback</button>
            <button className="ws-btn ws-btn-no" onClick={() => onAction("no")}>No</button>
            <button className="ws-btn ws-btn-skip" onClick={() => onAction("skip")}>Skip</button>
          </div>

          {/* Take Payment + Send Email Template — 50/50 */}
          <div className="ws-btn-pair">
            <button className="ws-btn-pay ws-btn-pair-item" onClick={() => setPayOpen(!payOpen)}>
              Take Payment
            </button>
            <button className="ws-btn-email ws-btn-pair-item" onClick={() => setEmailTemplateOpen(true)}>
              Send Email Template
            </button>
          </div>

          {payOpen && (
            <div className="ws-pay-box">
              <div className="ws-pay-title">
                <CreditCard size={14} /> Payment Details
              </div>
              <div className="ws-pay-grid">
                <input className="ws-pay-input" placeholder="Card Number" />
                <div className="ws-pay-row2">
                  <input className="ws-pay-input" placeholder="MM/YY" />
                  <input className="ws-pay-input" placeholder="CVV" />
                </div>
                <input className="ws-pay-input" placeholder="Name on Card" />
              </div>
              <button className="ws-pay-submit">
                Charge £4.95
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// SCRIPT PANEL — PITCH STAGES
// ==========================================
const PITCH_STAGES = [
  {
    num: 1,
    title: "Opening",
    instructions: ["HIGH ENERGY — NO PAUSES — CONFIDENCE — SMILE"],
    says: [
      '"Hi [Name], it\'s [Your Name] from Lavie Labs. We\'re a medical-grade skincare company working in partnership with UK Best Offers. We\'re calling today to send you a complimentary Anti-Ageing Starter Kit to try!"',
      '"Because our products are medical-grade and highly active, I just need to ask a few quick questions to make sure we send you the perfect match for your skin. Would you say your skin is more on the dry side, combination, or oily?"',
    ],
    endInstruction: "Listen and adapt. Focus on how the skin FEELS to them.",
  },
  {
    num: 2,
    title: "Magic Wand Question",
    instructions: ["Crucial for emotional buy-in — listen carefully"],
    says: [
      '"If you had a magic wand and could improve just ONE thing about your skin right now, what would it be?"',
      '"So just to clarify, you would like to [recap their exact words]. Did I get that right?"',
    ],
    endInstruction: "Recap their exact words to show you understand.",
  },
  {
    num: 3,
    title: "Product Presentation",
    instructions: ["Benefit-driven — tie back to their magic wand answer"],
    notes: ["MATINIKA — 32% Hyaluronic Acid"],
    says: [
      '"Based on what you told me about [their goal], the first product I\'m sending you is Matinika. It has 32% active Hyaluronic Acid — 6x more than high street brands."',
      '"The first time you put this on, your skin just drinks it up. That tight, dry feeling vanishes. Incredibly soft, deeply nourished, beautiful healthy glow."',
    ],
  },
  {
    num: 4,
    title: "Social Proof & Website",
    says: [
      '"I\'ve just sent an email to [Email]. Could you let me know when that pops up?"',
      '"We\'re incredibly proud of our Trustpilot rating — thousands of happy customers. Scroll down for Before & After photos."',
    ],
    endInstruction: "Compare the women on the website with your customer's needs.",
  },
  {
    num: 5,
    title: "The Offer & Close",
    instructions: ["Confident, clear, no hesitation"],
    says: [
      '"We\'re sending you a 21-day, completely risk-free trial. Cancel anytime, no questions asked."',
      '"As a VIP client, you get a permanent 30% discount — £44.95 every 60 days instead of £59."',
      '"We just ask you to cover the small £4.95 postage fee today."',
    ],
    endInstruction: "Process payment. Stop talking.",
    closingSay: '"Will you be using Visa, Mastercard, or Amex for the £4.95 postage?"',
  },
  {
    num: 6,
    title: "Confirmation & Usage",
    says: [
      '"Today it\'s just £4.95 for premium tracked shipping. You\'re receiving your Matinika and starter serum."',
      '"In 21 days, your subscription begins at your exclusive 30% VIP discount."',
    ],
    endInstruction: "Warm close — set expectations and build excitement.",
  },
];

function ScriptPanel() {
  const [openStages, setOpenStages] = useState<number[]>([1]);

  const toggleStage = (num: number) => {
    setOpenStages((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  };

  return (
    <div className="ws-pitch-panel">
      {PITCH_STAGES.map((stage) => {
        const isOpen = openStages.includes(stage.num);
        return (
          <div key={stage.num} className={`ws-pitch-stage ${isOpen ? "" : "collapsed"}`}>
            <div className="ws-ps-header" onClick={() => toggleStage(stage.num)}>
              <div className="ws-ps-num">{stage.num}</div>
              <div className="ws-ps-title">{stage.title}</div>
              <span className="ws-ps-arrow">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </div>
            {isOpen && (
              <div className="ws-ps-body">
                {stage.instructions?.map((inst, i) => (
                  <div key={i} className="ws-ps-instruction">{inst}</div>
                ))}
                {stage.notes?.map((note, i) => (
                  <div key={i} className="ws-ps-note"><strong>{note}</strong></div>
                ))}
                {stage.says?.map((say, i) => (
                  <div key={i} className="ws-ps-say">{say}</div>
                ))}
                {stage.endInstruction && (
                  <div className="ws-ps-instruction">{stage.endInstruction}</div>
                )}
                {stage.closingSay && (
                  <div className="ws-ps-say ws-ps-closing">{stage.closingSay}</div>
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
// QUICK TOOLS — OBJECTIONS + PRODUCTS
// ==========================================
const OBJECTIONS = [
  { q: '"It\'s a subscription?"', a: '"You\'re in complete control. Pause or cancel anytime — no questions asked."' },
  { q: '"I don\'t trust giving my card"', a: '"Fully regulated UK company. Encrypted payment. Thousands of 5-star Trustpilot reviews."' },
  { q: '"Too many products"', a: '"Matinika replaces 3 products in one — moisturiser, serum, and anti-ageing in one cream."' },
  { q: '"Need to think about it"', a: '"The trial is completely risk-free. You\'re not committing — just trying. Cancel with one click."' },
  { q: '"Is it really medical-grade?"', a: '"32% active Hyaluronic Acid — 6x more than high street. Formulated by dermatologists."' },
];

const PRODUCTS = [
  { name: "Matinika — Day & Night", desc: "32% Hyaluronic Acid. Replaces moisturiser + serum + anti-ageing. Silky, lightweight. Instant hydration and glow." },
  { name: "Oulala — Retinol Serum", desc: "Face & Neck. Gold standard anti-ageing. Sweeps dead cells. Tighter, smoother, lines soften." },
  { name: "Ashkara — Eye Serum", desc: "Dark circles, puffiness, fine lines. Apply mornings & evenings." },
];

function QuickTools() {
  const [openObj, setOpenObj] = useState<number[]>([0]);
  const [openProd, setOpenProd] = useState<number[]>([0]);

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
              {isOpen && <div className="ws-obj-a">{obj.a}</div>}
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
// MAIN WORKSPACE PAGE
// ==========================================
export default function Workspace() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [doneItems, setDoneItems] = useState<Record<number, string>>({});

  // Fetch contacts from the API
  const { data: contacts = [], refetch } = trpc.contacts.list.useQuery(
    { search: searchQuery || undefined, limit: 50 },
    { enabled: true }
  );

  // Click-to-call mutation
  const clickToCall = trpc.contacts.clickToCall.useMutation({
    onSuccess: () => toast.success("Call initiated! Your phone will ring first."),
    onError: (err: any) => {
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

  const handleAction = (contactId: number, action: string, phone?: string) => {
    if (action === "call" && phone) {
      clickToCall.mutate({ contactId });
    } else if (action === "sold" || action === "na" || action === "no" || action === "skip" || action === "callback") {
      setDoneItems((prev) => ({
        ...prev,
        [contactId]: action === "sold" ? "Sold" : action === "na" ? "N/A" : action === "no" ? "No" : action === "callback" ? "Callback" : "Skip",
      }));
      // Move to next contact
      const currentIndex = contacts.findIndex((c: any) => c.id === contactId);
      const nextContact = contacts[currentIndex + 1];
      if (nextContact) setActiveId(nextContact.id);
    }
  };

  const handleFieldChange = (contactId: number, field: string, value: any) => {
    // For fields that exist in the DB, save them
    if (["name", "phone", "email", "status", "leadType"].includes(field)) {
      updateContact.mutate({ id: contactId, [field]: value });
    }
    // For workspace-only fields (skinType, concerns, routine, trialKit, notes), 
    // they will be saved when the agent clicks an action button
  };

  // Auto-select first contact
  useEffect(() => {
    if (contacts.length > 0 && activeId === null) {
      setActiveId(contacts[0].id);
    }
  }, [contacts, activeId]);

  // Stats
  const totalContacts = contacts.length;
  const doneCount = Object.keys(doneItems).length;
  const soldCount = Object.values(doneItems).filter((s) => s === "Sold").length;

  return (
    <div className="ws-layout">
      {/* TOP NAV */}
      <div className="ws-topnav">
        <div className="ws-topnav-logo">
          LAVIÉ <span>LABS</span>
        </div>
        <div className="ws-topnav-tabs">
          <div className="ws-topnav-tab active">Workspace</div>
          <div className="ws-topnav-tab" onClick={() => navigate("/")}>Training</div>
          <div className="ws-topnav-tab" onClick={() => navigate("/contacts")}>Contacts</div>
          <div className="ws-topnav-tab" onClick={() => navigate("/ai-coach")}>AI Coach</div>
        </div>
        <div className="ws-topnav-user">
          <div className="ws-topnav-avatar">
            {user?.name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) ?? "?"}
          </div>
          {user?.name ?? "Agent"}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="ws-main">
        {/* LEFT: DIAL LIST */}
        <div className="ws-dial-list">
          <div className="ws-dl-header">
            <div className="ws-dl-title-row">
              <h3>Today's List</h3>
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
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1f2937]" />
              <input
                className="ws-dl-search"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="ws-dl-items">
            {contacts.map((contact: any) => {
              const isDone = !!doneItems[contact.id];
              return (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  isActive={activeId === contact.id}
                  isDone={isDone}
                  doneStatus={doneItems[contact.id]}
                  onSelect={() => !isDone && setActiveId(contact.id)}
                  onAction={(action) => handleAction(contact.id, action, contact.phone)}
                  onFieldChange={(field, value) => handleFieldChange(contact.id, field, value)}
                />
              );
            })}
          </div>
        </div>

        {/* CENTER: SCRIPT PANEL */}
        <div className="ws-script-col">
          <div className="ws-sales-content">
            <ScriptPanel />
          </div>
        </div>

        {/* RIGHT: QUICK TOOLS */}
        <div className="ws-quicktools-col">
          <div className="ws-sales-content">
            <QuickTools />
          </div>
        </div>
      </div>

      {/* BOTTOM BAR — Call Controls */}
      <div className="ws-bottom-bar">
        <div className="ws-bb-left">
          <div className="ws-bb-status">
            <div className="ws-bb-pulse" />
            {contacts.find((c: any) => c.id === activeId)?.name ?? "No contact selected"}
          </div>
        </div>
        <div className="ws-bb-controls">
          <button className="ws-bb-btn">Mute</button>
          <button className="ws-bb-btn">Hold</button>
          <button className="ws-bb-btn ws-bb-btn-end">End Call</button>
        </div>
      </div>
    </div>
  );
}
