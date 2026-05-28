import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Send, 
  Users, 
  MessageSquare, 
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check
} from "lucide-react";
import { toast } from "sonner";

interface CreateCampaignWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateCampaignWizard({ onClose, onSuccess }: CreateCampaignWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    channel: "whatsapp" as "whatsapp" | "sms",
    templateName: "",
    messageBody: "",
    audienceFilter: {
      department: "" as any,
      leadType: "",
      statuses: [] as string[],   // ← multi-select array
      source: "",
      agentName: "",
    }
  });

  // ─── tRPC Queries ──────────────────────────────────────────────────────────
  const { data: templates } = trpc.whatsapp.templates.useQuery(undefined, {
    enabled: formData.channel === "whatsapp",
  });

  const { data: meta } = trpc.contacts.meta.useQuery();
  const { data: agents } = trpc.whatsapp.getAgents.useQuery();

  // For count preview, pass the first selected status (backend count only supports single status)
  // The actual send uses the full array via audienceFilter
  const { data: matchCount, isLoading: isCountLoading } = trpc.contacts.count.useQuery(
    {
      department: formData.audienceFilter.department || undefined,
      leadType: formData.audienceFilter.leadType || undefined,
      status: formData.audienceFilter.statuses.length === 1 ? formData.audienceFilter.statuses[0] : undefined,
      source: formData.audienceFilter.source || undefined,
      agentName: formData.audienceFilter.agentName || undefined,
    },
    { enabled: step === 3 }
  );

  // ─── tRPC Mutations ────────────────────────────────────────────────────────
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: (data) => {
      sendCampaign.mutate({ id: data.id });
    },
    onError: (err) => toast.error(`Failed to create: ${err.message}`),
  });

  const sendCampaign = trpc.campaigns.send.useMutation({
    onSuccess: () => {
      toast.success("Campaign launched successfully!");
      onSuccess();
    },
    onError: (err) => toast.error(`Failed to launch: ${err.message}`),
  });

  // ─── Status multi-select toggle ────────────────────────────────────────────
  const toggleStatus = (status: string) => {
    setFormData(prev => {
      const current = prev.audienceFilter.statuses;
      const next = current.includes(status)
        ? current.filter(s => s !== status)
        : [...current, status];
      return { ...prev, audienceFilter: { ...prev.audienceFilter, statuses: next } };
    });
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = () => {
    createCampaign.mutate({
      name: formData.name,
      channel: formData.channel,
      templateName: formData.channel === "whatsapp" ? formData.templateName : undefined,
      messageBody: formData.channel === "sms" ? formData.messageBody : undefined,
      audienceFilter: {
        department: formData.audienceFilter.department || undefined,
        leadType: formData.audienceFilter.leadType || undefined,
        statuses: formData.audienceFilter.statuses.length > 0 ? formData.audienceFilter.statuses : undefined,
        source: formData.audienceFilter.source || undefined,
        agentName: formData.audienceFilter.agentName || undefined,
      }
    });
  };

  const isStep1Valid = formData.name.length > 0;
  const isStep2Valid = formData.channel === "whatsapp" ? !!formData.templateName : !!formData.messageBody;
  const isStep3Valid = true; // Filters are optional

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
              <Send size={16} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-black">Create Campaign</h3>
              <p className="text-[10px] text-black uppercase tracking-wider font-semibold opacity-60">Step {step} of 4</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-black transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Steps Progress */}
        <div className="flex border-b border-gray-100">
          {[1, 2, 3, 4].map((s) => (
            <div 
              key={s} 
              className={`flex-1 h-1 transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} 
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-2">
                <label className="text-sm font-bold text-black">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. Summer Sale 2024"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none text-black font-medium transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-black">Channel</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, channel: "whatsapp" }))}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                      formData.channel === "whatsapp" 
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" 
                        : "border-gray-100 bg-gray-50 text-black hover:border-gray-300"
                    }`}
                  >
                    <MessageCircle size={32} className={formData.channel === "whatsapp" ? "text-[#25D366]" : "text-black opacity-30"} />
                    <span className="font-bold">WhatsApp</span>
                  </button>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, channel: "sms" }))}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                      formData.channel === "sms" 
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" 
                        : "border-gray-100 bg-gray-50 text-black hover:border-gray-300"
                    }`}
                  >
                    <MessageSquare size={32} className={formData.channel === "sms" ? "text-blue-500" : "text-black opacity-30"} />
                    <span className="font-bold">SMS</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {formData.channel === "whatsapp" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[#25D366] mb-2">
                    <AlertCircle size={18} />
                    <p className="text-xs font-bold uppercase tracking-wide">WhatsApp requires an approved template</p>
                  </div>
                  <label className="text-sm font-bold text-black">Select Template</label>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2">
                    {templates?.map(t => (
                      <button
                        key={t.sid}
                        onClick={() => setFormData(prev => ({ ...prev, templateName: t.sid }))}
                        className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                          formData.templateName === t.sid 
                            ? "border-blue-600 bg-blue-50 font-bold text-black shadow-sm" 
                            : "border-gray-100 bg-gray-50 text-black hover:border-gray-200"
                        }`}
                      >
                        <div className="text-sm">{t.friendly_name}</div>
                        <div className="text-[10px] opacity-60 mt-0.5 font-mono">{t.sid}</div>
                      </button>
                    ))}
                    {(!templates || templates.length === 0) && (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <p className="text-sm text-black opacity-60">No templates found in your Twilio account</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">SMS Message Body</label>
                  <textarea
                    rows={6}
                    placeholder="Enter your SMS message here..."
                    value={formData.messageBody}
                    onChange={e => setFormData(prev => ({ ...prev, messageBody: e.target.value }))}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none text-black font-medium transition-colors resize-none"
                  />
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[10px] text-black opacity-60">Plain text only. Max ~160 chars per segment.</p>
                    <p className="text-[10px] font-bold text-black">{formData.messageBody.length} characters</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Users size={18} />
                <p className="text-xs font-bold uppercase tracking-wide text-black">Filter your target audience</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-black uppercase tracking-wider">Department</label>
                  <select
                    value={formData.audienceFilter.department}
                    onChange={e => setFormData(prev => ({ ...prev, audienceFilter: { ...prev.audienceFilter, department: e.target.value } }))}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-100 rounded-lg focus:border-blue-600 focus:outline-none text-sm text-black font-bold"
                  >
                    <option value="">All Departments</option>
                    <option value="opening">Opening</option>
                    <option value="retention">Retention</option>
                  </select>
                </div>

                {/* Lead Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-black uppercase tracking-wider">Lead Type</label>
                  <select
                    value={formData.audienceFilter.leadType}
                    onChange={e => setFormData(prev => ({ ...prev, audienceFilter: { ...prev.audienceFilter, leadType: e.target.value } }))}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-100 rounded-lg focus:border-blue-600 focus:outline-none text-sm text-black font-bold"
                  >
                    <option value="">All Lead Types</option>
                    {meta?.leadTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-black uppercase tracking-wider">Source</label>
                  <select
                    value={formData.audienceFilter.source}
                    onChange={e => setFormData(prev => ({ ...prev, audienceFilter: { ...prev.audienceFilter, source: e.target.value } }))}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-100 rounded-lg focus:border-blue-600 focus:outline-none text-sm text-black font-bold"
                  >
                    <option value="">All Sources</option>
                    {meta?.sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Assigned Agent */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-black uppercase tracking-wider">Assigned Agent</label>
                  <select
                    value={formData.audienceFilter.agentName}
                    onChange={e => setFormData(prev => ({ ...prev, audienceFilter: { ...prev.audienceFilter, agentName: e.target.value } }))}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-100 rounded-lg focus:border-blue-600 focus:outline-none text-sm text-black font-bold"
                  >
                    <option value="">All Agents</option>
                    {agents?.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>

                {/* Status — Multi-select checkboxes */}
                <div className="space-y-2 col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-black uppercase tracking-wider">Status</label>
                    {formData.audienceFilter.statuses.length > 0 && (
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, audienceFilter: { ...prev.audienceFilter, statuses: [] } }))}
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        Clear ({formData.audienceFilter.statuses.length} selected)
                      </button>
                    )}
                    {formData.audienceFilter.statuses.length === 0 && (
                      <span className="text-[10px] font-bold text-black opacity-40">All statuses (none selected)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {meta?.statuses.map(status => {
                      const isSelected = formData.audienceFilter.statuses.includes(status);
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleStatus(status)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-left transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-50 text-black font-bold shadow-sm"
                              : "border-gray-100 bg-gray-50 text-black hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${
                            isSelected ? "bg-blue-600 border-blue-600" : "border-black/20 bg-white"
                          }`}>
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-[11px] font-bold capitalize">{status.replace(/_/g, ' ')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Audience count preview */}
              <div className="mt-4 p-6 bg-blue-600 rounded-xl text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Users size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-80">Matching Contacts</p>
                    <p className="text-3xl font-black">
                      {isCountLoading ? "..." : matchCount ?? 0}
                    </p>
                    {formData.audienceFilter.statuses.length > 1 && (
                      <p className="text-[10px] opacity-70 mt-0.5">
                        * Preview shows first selected status only — all {formData.audienceFilter.statuses.length} statuses applied on send
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Audience Reach</p>
                  <p className="text-xs font-bold">Targeted Outreach</p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="text-center space-y-2 mb-8">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-green-50">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-xl font-black text-black">Ready to Launch?</h4>
                <p className="text-sm text-black opacity-60">Review your campaign settings before sending.</p>
              </div>

              <div className="bg-gray-50 rounded-xl border-2 border-gray-100 divide-y divide-gray-200">
                <div className="p-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-black opacity-60 uppercase">Campaign</span>
                  <span className="text-sm font-black text-black">{formData.name}</span>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-black opacity-60 uppercase">Channel</span>
                  <div className="flex items-center gap-1.5">
                    {formData.channel === 'whatsapp' ? <MessageCircle size={14} className="text-[#25D366]" /> : <MessageSquare size={14} className="text-blue-500" />}
                    <span className="text-sm font-black text-black capitalize">{formData.channel}</span>
                  </div>
                </div>
                <div className="p-4 flex justify-between items-start">
                  <span className="text-xs font-bold text-black opacity-60 uppercase">Statuses</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                    {formData.audienceFilter.statuses.length === 0 ? (
                      <span className="text-sm font-black text-black">All</span>
                    ) : (
                      formData.audienceFilter.statuses.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold capitalize">{s.replace(/_/g, ' ')}</span>
                      ))
                    )}
                  </div>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-black opacity-60 uppercase">Audience</span>
                  <span className="text-sm font-black text-black">{matchCount} Contacts</span>
                </div>
                <div className="p-4">
                  <span className="text-xs font-bold text-black opacity-60 uppercase block mb-2">Message Content</span>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs text-black font-medium italic">
                    {formData.channel === 'whatsapp' 
                      ? `Template: ${templates?.find(t => t.sid === formData.templateName)?.friendly_name || formData.templateName}`
                      : formData.messageBody}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl flex gap-3">
                <AlertCircle size={20} className="text-yellow-700 shrink-0" />
                <p className="text-xs text-yellow-800 font-medium leading-relaxed">
                  This will immediately send messages to all <strong>{matchCount}</strong> matched contacts. This action cannot be undone.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={step === 1 ? onClose : handleBack}
            className="px-6 py-2.5 text-sm font-bold text-black hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
          >
            {step === 1 ? 'Cancel' : <><ChevronLeft size={18} /> Back</>}
          </button>
          
          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid) || (step === 3 && !isStep3Valid)}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-sm flex items-center gap-2 shadow-md"
            >
              Next
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createCampaign.isPending || sendCampaign.isPending || (matchCount ?? 0) === 0}
              className="px-10 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-sm flex items-center gap-2 shadow-lg shadow-green-100"
            >
              {(createCampaign.isPending || sendCampaign.isPending) ? (
                <><Loader2 size={18} className="animate-spin" /> Launching...</>
              ) : (
                <><Send size={18} /> Launch Campaign</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
