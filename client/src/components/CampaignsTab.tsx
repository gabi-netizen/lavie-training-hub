/**
 * CampaignsTab — Billing Plans management tab for the Max Billing dashboard.
 *
 * Shows a table of all active billing plans (campaigns) with CRUD operations.
 * Uses CSS Grid for table layout. Modals have z-index: 99999.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Phase {
  phase: number;
  productName: string;
  sku: string;
  price: number;
  currency: string;
  triggerType: "immediate" | "days_after_start" | "recurring";
  triggerDays: number;
  mintsoftItems: { SKU: string; Quantity: number }[];
}

interface BillingPlan {
  id: number;
  name: string;
  type: "subscription" | "installment" | "one_time";
  phases: unknown;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const PLAN_TYPES = [
  { value: "subscription", label: "Subscription" },
  { value: "installment", label: "Installment" },
  { value: "one_time", label: "One-Time" },
] as const;

const TRIGGER_TYPES = [
  { value: "immediate", label: "Immediate" },
  { value: "days_after_start", label: "After X days" },
  { value: "recurring", label: "Recurring every X days" },
] as const;

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Empty Phase Template ───────────────────────────────────────────────────
function emptyPhase(phaseNum: number): Phase {
  return {
    phase: phaseNum,
    productName: "",
    sku: "",
    price: 0,
    currency: "GBP",
    triggerType: "immediate",
    triggerDays: 0,
    mintsoftItems: [{ SKU: "", Quantity: 1 }],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function CampaignsTab() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.billingPlans.list.useQuery({});
  const createPlan = trpc.billingPlans.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created successfully");
      utils.billingPlans.list.invalidate();
      setModalOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updatePlan = trpc.billingPlans.update.useMutation({
    onSuccess: () => {
      toast.success("Campaign updated successfully");
      utils.billingPlans.list.invalidate();
      setModalOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deletePlan = trpc.billingPlans.delete.useMutation({
    onSuccess: () => {
      toast.success("Campaign deleted");
      utils.billingPlans.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BillingPlan | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"subscription" | "installment" | "one_time">("subscription");
  const [formPhases, setFormPhases] = useState<Phase[]>([emptyPhase(1)]);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormName("");
    setFormType("subscription");
    setFormPhases([emptyPhase(1)]);
    setModalOpen(true);
  };

  const openEditModal = (plan: BillingPlan) => {
    setEditingPlan(plan);
    setFormName(plan.name);
    setFormType(plan.type);
    const phases = (plan.phases as Phase[]) || [];
    setFormPhases(phases.length > 0 ? phases : [emptyPhase(1)]);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (formPhases.length === 0) {
      toast.error("At least one phase is required");
      return;
    }
    // Validate phases
    for (const p of formPhases) {
      if (!p.productName.trim()) {
        toast.error(`Phase ${p.phase}: Product name is required`);
        return;
      }
    }

    const phasesData = formPhases.map((p, i) => ({
      ...p,
      phase: i + 1,
      mintsoftItems: p.mintsoftItems.filter((item) => item.SKU.trim() !== ""),
    }));

    if (editingPlan) {
      updatePlan.mutate({
        id: editingPlan.id,
        name: formName,
        type: formType,
        phases: phasesData,
      });
    } else {
      createPlan.mutate({
        name: formName,
        type: formType,
        phases: phasesData,
      });
    }
  };

  const addPhase = () => {
    setFormPhases((prev) => [...prev, emptyPhase(prev.length + 1)]);
  };

  const removePhase = (idx: number) => {
    setFormPhases((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, phase: i + 1 })));
  };

  const updatePhase = (idx: number, updates: Partial<Phase>) => {
    setFormPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  };

  const addMintsoftItem = (phaseIdx: number) => {
    setFormPhases((prev) =>
      prev.map((p, i) => (i === phaseIdx ? { ...p, mintsoftItems: [...p.mintsoftItems, { SKU: "", Quantity: 1 }] } : p))
    );
  };

  const removeMintsoftItem = (phaseIdx: number, itemIdx: number) => {
    setFormPhases((prev) =>
      prev.map((p, i) => (i === phaseIdx ? { ...p, mintsoftItems: p.mintsoftItems.filter((_, j) => j !== itemIdx) } : p))
    );
  };

  const updateMintsoftItem = (phaseIdx: number, itemIdx: number, field: "SKU" | "Quantity", value: string | number) => {
    setFormPhases((prev) =>
      prev.map((p, i) =>
        i === phaseIdx
          ? {
              ...p,
              mintsoftItems: p.mintsoftItems.map((item, j) => (j === itemIdx ? { ...item, [field]: value } : item)),
            }
          : p
      )
    );
  };

  const handleDelete = (id: number) => {
    deletePlan.mutate({ id });
    setDeleteConfirm(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Campaigns (Billing Plans)</h2>
          <p className="text-sm text-gray-800 mt-0.5">Manage billing plans that define product phases and triggers</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 transition"
        >
          <Plus size={14} />
          Create Campaign
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-800 font-medium">Loading campaigns...</div>
      ) : !plans || plans.length === 0 ? (
        <div className="text-center py-12 text-gray-800">
          <p className="font-medium">No campaigns yet</p>
          <p className="text-sm mt-1">Create your first billing plan to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Grid Header */}
          <div
            className="grid gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-800 uppercase tracking-wide"
            style={{ gridTemplateColumns: "2fr 1fr 0.7fr 1fr 100px" }}
          >
            <span>Name</span>
            <span>Type</span>
            <span>Phases</span>
            <span>Created</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Grid Rows */}
          {(plans as any[]).map((plan) => (
            <div
              key={plan.id}
              className="grid gap-4 px-5 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition items-center"
              style={{ gridTemplateColumns: "2fr 1fr 0.7fr 1fr 100px" }}
            >
              <span className="text-sm font-semibold text-gray-800 truncate">{plan.name}</span>
              <span className="text-sm text-gray-800">{formatType(plan.type)}</span>
              <span className="text-sm text-gray-800 font-medium">
                {Array.isArray(plan.phases) ? (plan.phases as Phase[]).length : 0}
              </span>
              <span className="text-sm text-gray-800">{formatDate(String(plan.createdAt))}</span>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditModal(plan as any)}
                  className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600 transition"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(plan.id)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", maxWidth: 400, width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
            <h3 className="text-base font-bold text-gray-800 mb-2">Delete Campaign?</h3>
            <p className="text-sm text-gray-800 mb-5">This will deactivate the campaign. Existing contacts assigned to it will not be affected.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", maxWidth: 700, width: "95%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-800">
                {editingPlan ? "Edit Campaign" : "Create Campaign"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={18} className="text-gray-800" />
              </button>
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Campaign Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Trial Campaign"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Type */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PLAN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Phases */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-800">Phases</label>
                <button
                  onClick={addPhase}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                >
                  <Plus size={12} />
                  Add Phase
                </button>
              </div>

              <div className="space-y-4">
                {formPhases.map((phase, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-gray-800 uppercase">Phase {idx + 1}</span>
                      {formPhases.length > 1 && (
                        <button
                          onClick={() => removePhase(idx)}
                          className="text-xs text-red-600 font-semibold hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">Product Name</label>
                        <input
                          type="text"
                          value={phase.productName}
                          onChange={(e) => updatePhase(idx, { productName: e.target.value })}
                          placeholder="e.g. Matinika 60ML"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">SKU</label>
                        <input
                          type="text"
                          value={phase.sku}
                          onChange={(e) => updatePhase(idx, { sku: e.target.value })}
                          placeholder="e.g. mat 60"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={phase.price}
                          onChange={(e) => updatePhase(idx, { price: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">Trigger</label>
                        <select
                          value={phase.triggerType}
                          onChange={(e) => updatePhase(idx, { triggerType: e.target.value as any })}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {TRIGGER_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">
                          {phase.triggerType === "immediate" ? "Days (N/A)" : "Days"}
                        </label>
                        <input
                          type="number"
                          value={phase.triggerDays}
                          onChange={(e) => updatePhase(idx, { triggerDays: parseInt(e.target.value) || 0 })}
                          disabled={phase.triggerType === "immediate"}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Mintsoft Items */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-gray-800">Mintsoft Items</label>
                        <button
                          onClick={() => addMintsoftItem(idx)}
                          className="text-xs text-blue-600 font-semibold hover:text-blue-700"
                        >
                          + Add Item
                        </button>
                      </div>
                      {phase.mintsoftItems.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-center gap-2 mb-1.5">
                          <input
                            type="text"
                            value={item.SKU}
                            onChange={(e) => updateMintsoftItem(idx, itemIdx, "SKU", e.target.value)}
                            placeholder="SKU"
                            className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            value={item.Quantity}
                            onChange={(e) => updateMintsoftItem(idx, itemIdx, "Quantity", parseInt(e.target.value) || 1)}
                            className="w-16 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={1}
                          />
                          {phase.mintsoftItems.length > 1 && (
                            <button
                              onClick={() => removeMintsoftItem(idx, itemIdx)}
                              className="p-1 text-red-500 hover:text-red-700"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createPlan.isPending || updatePlan.isPending}
                className="px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {createPlan.isPending || updatePlan.isPending ? "Saving..." : editingPlan ? "Update Campaign" : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
