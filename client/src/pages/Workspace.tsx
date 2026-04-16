
// Full Agent Workspace UI — v9 design: 7-stage pitch + Edit/Reset + Manager View + Email Modal
// Includes: Contact card, Action buttons, Script panel (7 stages), Notes dropdowns, Payment box, Email Template Modal

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Phone, Mail, MapPin, User, Pencil, Check, X, RotateCcw,
  ChevronRight, ChevronDown, CreditCard, Search,
  Edit3, Save, AlertCircle, Eye, Users
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

          {/* Take Payment + Send Email Template dropdown — 50/50 */}
          <div className="ws-btn-pair">
            <button className="ws-btn-pay ws-btn-pair-item" onClick={() => setPayOpen(!payOpen)}>
              Take Payment
            </button>
            <div className="ws-email-drop-wrap" ref={emailDropRef}>
              <button
                className="ws-btn-email ws-btn-pair-item ws-email-drop-trigger"
                onClick={() => setEmailDropOpen((v) => !v)}
              >
                Send Email
                <span className="ws-email-drop-arrow">{emailDropOpen ? "▲" : "▼"}</span>
              </button>
              {emailDropOpen && (
                <div className="ws-email-drop-menu">
                  <button
                    className="ws-email-drop-item"
                    onClick={() => {
                      setEmailDropOpen(false);
                      setEmailTemplateOpen(true);
                    }}
                  >
                    <span className="ws-email-drop-icon">✉️</span>
                    Post-Call Follow-Up
                  </button>
                  <button
                    className="ws-email-drop-item"
                    onClick={() => {
                      setEmailDropOpen(false);
                      // Find and open the Form template directly
                      setEmailTemplateOpen(true);
                      // We'll auto-select the Form template after templates load
                      setAutoSelectFormTemplate(true);
                    }}
                  >
                    <span className="ws-email-drop-icon">🔗</span>
                    Send Payment Form
                  </button>
                </div>
              )}
            </div>
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
  const [openStages, setOpenStages] = useState<number[]>([1]);
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
                      <div key={i} className="ws-ps-say">{say}</div>
                    ))}

                    {stage.endInstruction && (
                      <div className="ws-ps-instruction">{stage.endInstruction}</div>
                    )}

                    {stage.notes?.map((note, i) => (
                      <div key={i} className="ws-ps-say">{note}</div>
                    ))}

                    {stage.closingSay && (
                      <div className="ws-ps-say ws-ps-closing">{stage.closingSay}</div>
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
                                <div key={i} className="ws-ps-say">{say}</div>
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
  const isAdmin = user?.role === "admin";
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [doneItems, setDoneItems] = useState<Record<number, string>>({});
  const [managerMode, setManagerMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  // ── Call state (driven by CloudTalk postMessage events) ──
  const [callActive, setCallActive] = useState(false);
  const [callContactName, setCallContactName] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  const CLOUDTALK_ORIGINS_WS = [
    "https://phone.cloudtalk.io",
    "https://my.cloudtalk.io",
    "https://app.cloudtalk.io",
  ];

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!CLOUDTALK_ORIGINS_WS.some(o => e.origin === o || e.origin.endsWith(".cloudtalk.io"))) return;
      const evt = e.data?.event ?? e.data?.type;
      if (evt === "ringing" || evt === "dialing" || evt === "calling") {
        setCallActive(true);
        const name = e.data?.properties?.contact?.name ?? e.data?.properties?.external_number ?? null;
        if (name) setCallContactName(name);
      }
      if (evt === "hangup" || evt === "ended" || evt === "idle") {
        setCallActive(false);
        setCallContactName(null);
        setIsMuted(false);
        setIsOnHold(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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

  // Fetch contacts from the API
  const { data: contacts = [], refetch } = trpc.contacts.list.useQuery(
    { search: searchQuery || undefined, limit: 50 },
    { enabled: true }
  );

  // Click-to-call mutation
  const clickToCall = trpc.contacts.clickToCall.useMutation({
    onSuccess: () => toast.success("Call initiated! Your phone will ring first."),
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

  const handleAction = (contactId: number, action: string, phone?: string) => {
    if (action === "call") {
      clickToCall.mutate({ contactId });
    } else if (action === "sold" || action === "na" || action === "no" || action === "skip" || action === "callback") {
      setDoneItems((prev) => ({
        ...prev,
        [contactId]: action === "sold" ? "Sold" : action === "na" ? "N/A" : action === "no" ? "No" : action === "callback" ? "Callback" : "Skip",
      }));
      const currentIndex = contacts.findIndex((c: any) => c.id === contactId);
      const nextContact = contacts[currentIndex + 1];
      if (nextContact) setActiveId(nextContact.id);
    }
  };

  const handleFieldChange = (contactId: number, field: string, value: any) => {
    if (["name", "phone", "email", "status", "leadType"].includes(field)) {
      updateContact.mutate({ id: contactId, [field]: value });
    }
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

        {/* CENTER: PITCH PANEL */}
        <div className="ws-sales-tools">
          <div className="ws-script-col">
            <div className="ws-sales-content">
              {/* ── My Pitch / Manager View Toggle (admin only) ── */}
              {isAdmin && (
                <div className="ws-mode-toggle" style={{ marginBottom: 12 }}>
                  <button
                    className={`ws-mode-btn ${!managerMode ? "active" : ""}`}
                    onClick={() => setManagerMode(false)}
                  >
                    <Edit3 size={14} /> My Pitch
                  </button>
                  <button
                    className={`ws-mode-btn ${managerMode ? "active" : ""}`}
                    onClick={() => setManagerMode(true)}
                  >
                    <Users size={14} /> Manager View
                  </button>
                </div>
              )}

              {/* ── Pitch Panel (7-stage with Edit/Reset) ── */}
              {managerMode && isAdmin ? (
                <ManagerView
                  selectedAgentId={selectedAgentId}
                  setSelectedAgentId={setSelectedAgentId}
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

      {/* BOTTOM BAR — Call Controls: only visible when a call is active */}
      {callActive && (
        <div className="ws-bottom-bar">
          <div className="ws-bb-left">
            <div className="ws-bb-status">
              <div className="ws-bb-pulse" />
              {callContactName ?? contacts.find((c: any) => c.id === activeId)?.name ?? "Active Call"}
            </div>
          </div>
          <div className="ws-bb-controls">
            <button
              className={`ws-bb-btn${isMuted ? " ws-bb-btn-active" : ""}`}
              onClick={handleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              className={`ws-bb-btn${isOnHold ? " ws-bb-btn-active" : ""}`}
              onClick={handleHold}
              title={isOnHold ? "Resume" : "Hold"}
            >
              {isOnHold ? "Resume" : "Hold"}
            </button>
            <button className="ws-bb-btn ws-bb-btn-end" onClick={handleEndCall} title="End Call">
              End Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
