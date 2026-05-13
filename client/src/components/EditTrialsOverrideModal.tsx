/**
 * EditTrialsOverrideModal — Admin-only modal for overriding the Trials count
 * for a specific agent and month.
 *
 * Follows the same styling and patterns as EditWorkingHoursModal.
 * - Fetches existing override via getTrialsOverride
 * - Allows setting a manual trials count (upsertTrialsOverride)
 * - Allows removing the override to revert to Zoho data (deleteTrialsOverride)
 */
import { useState, useEffect } from "react";
import { X, Loader2, Save, Hash, Trash2 } from "lucide-react";
import { trpc } from "../lib/trpc";

interface EditTrialsOverrideModalProps {
  agentName: string;
  month: string;
  currentTrials: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTrialsOverrideModal({
  agentName,
  month,
  currentTrials,
  onClose,
  onSaved,
}: EditTrialsOverrideModalProps) {
  const [trialsCount, setTrialsCount] = useState<string>(String(currentTrials));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing override for this agent/month
  const { data, isLoading } = trpc.openingDashboard.getTrialsOverride.useQuery({
    agentName,
    month,
  });

  const upsertMutation = trpc.openingDashboard.upsertTrialsOverride.useMutation();
  const deleteMutation = trpc.openingDashboard.deleteTrialsOverride.useMutation();

  const hasExistingOverride = !!data?.override;

  // Pre-fill with override value if it exists, otherwise keep current trials
  useEffect(() => {
    if (data?.override) {
      setTrialsCount(String(data.override.trialsCount));
    }
  }, [data]);

  // Parse month for display
  const [yearNum, monthNum] = month.split("-").map(Number);
  const monthLabel = new Date(yearNum, monthNum - 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const handleSave = async () => {
    const parsed = parseInt(trialsCount, 10);
    if (isNaN(parsed) || parsed < 0) {
      setError("Please enter a valid number (0 or greater)");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await upsertMutation.mutateAsync({
        agentName,
        month,
        trialsCount: parsed,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOverride = async () => {
    setDeleting(true);
    setError(null);

    try {
      await deleteMutation.mutateAsync({
        agentName,
        month,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to remove override");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Hash size={18} className="text-indigo-600" />
              Edit Trials Override
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {agentName} · {monthLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-gray-600">Loading override...</span>
            </div>
          ) : (
            <>
              {hasExistingOverride && (
                <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700 font-medium">
                    Override active — Zoho data is being replaced by this manual value.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Trials Count</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={trialsCount}
                    onChange={(e) => {
                      setTrialsCount(e.target.value);
                      setError(null);
                    }}
                    className="mt-1 block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter trials count"
                    autoFocus
                  />
                </label>
                <p className="text-xs text-gray-500">
                  This will override the Zoho-derived trial count for {agentName} in {monthLabel}.
                  Ave/Day and Conversion Rate will be recalculated automatically.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <div>
            {error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasExistingOverride && (
              <button
                onClick={handleRemoveOverride}
                disabled={deleting || saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Remove Override
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
