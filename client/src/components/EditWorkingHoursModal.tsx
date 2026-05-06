/**
 * EditWorkingHoursModal — Admin-only modal for editing agent daily working hours.
 *
 * Shows a list of all days from agent_daily_hours for the selected agent/month.
 * Allows editing hours, adding new days, and deleting entries.
 * Auto-calculates working_day_value on save.
 */
import { useState, useEffect } from "react";
import { X, Loader2, Plus, Trash2, Save, Clock } from "lucide-react";
import { trpc } from "../lib/trpc";

interface EditWorkingHoursModalProps {
  agentName: string;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DayEntry {
  id: number | null; // null for new entries
  date: string;
  hoursTracked: number;
  workingDayValue: number;
  isNew?: boolean;
  isModified?: boolean;
  isDeleted?: boolean;
}

function calculateWorkingDayValue(hours: number): number {
  if (hours >= 7) return 1.0;
  return Math.round((hours / 8) * 100) / 100;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function EditWorkingHoursModal({
  agentName,
  month,
  onClose,
  onSaved,
}: EditWorkingHoursModalProps) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newHours, setNewHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing daily hours for this agent/month
  const { data, isLoading, refetch } = trpc.openingDashboard.getAgentDailyHours.useQuery({
    agentName,
    month,
  });

  const upsertMutation = trpc.openingDashboard.upsertAgentDailyHours.useMutation();
  const deleteMutation = trpc.openingDashboard.deleteAgentDailyHours.useMutation();

  // Initialize entries from fetched data
  useEffect(() => {
    if (data?.days) {
      setEntries(
        data.days.map((d) => ({
          id: d.id,
          date: d.date,
          hoursTracked: d.hoursTracked,
          workingDayValue: d.workingDayValue,
          isNew: false,
          isModified: false,
          isDeleted: false,
        }))
      );
    }
  }, [data]);

  const hubstaffName = data?.hubstaffName || agentName;

  // Update hours for an entry
  const handleHoursChange = (index: number, value: string) => {
    const hours = parseFloat(value) || 0;
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              hoursTracked: hours,
              workingDayValue: calculateWorkingDayValue(hours),
              isModified: true,
            }
          : entry
      )
    );
  };

  // Mark an entry for deletion
  const handleDelete = (index: number) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, isDeleted: true } : entry
      )
    );
  };

  // Undo deletion
  const handleUndoDelete = (index: number) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, isDeleted: false } : entry
      )
    );
  };

  // Add a new day entry
  const handleAddDay = () => {
    if (!newDate) {
      setError("Please select a date");
      return;
    }
    const hours = parseFloat(newHours) || 0;
    if (hours < 0 || hours > 24) {
      setError("Hours must be between 0 and 24");
      return;
    }

    // Check if date already exists
    const existing = entries.find((e) => e.date === newDate && !e.isDeleted);
    if (existing) {
      setError("This date already exists. Edit the existing entry instead.");
      return;
    }

    setEntries((prev) => [
      ...prev,
      {
        id: null,
        date: newDate,
        hoursTracked: hours,
        workingDayValue: calculateWorkingDayValue(hours),
        isNew: true,
        isModified: true,
        isDeleted: false,
      },
    ]);
    setNewDate("");
    setNewHours("");
    setError(null);
  };

  // Save all changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Process deletions
      const toDelete = entries.filter((e) => e.isDeleted && e.id !== null);
      for (const entry of toDelete) {
        await deleteMutation.mutateAsync({ id: entry.id! });
      }

      // Process upserts (new or modified entries that aren't deleted)
      const toUpsert = entries.filter(
        (e) => !e.isDeleted && (e.isNew || e.isModified)
      );
      for (const entry of toUpsert) {
        await upsertMutation.mutateAsync({
          agentName: hubstaffName,
          date: entry.date,
          hoursTracked: entry.hoursTracked,
        });
      }

      // Refetch and notify parent
      await refetch();
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // Check if there are unsaved changes
  const hasChanges = entries.some((e) => e.isNew || e.isModified || e.isDeleted);

  // Get the month's date range for the date picker
  const [yearNum, monthNum] = month.split("-").map(Number);
  const minDate = `${month}-01`;
  const maxDate = `${month}-${new Date(yearNum, monthNum, 0).getDate().toString().padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Clock size={18} className="text-indigo-600" />
              Edit Working Hours
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {agentName}
              {hubstaffName !== agentName && (
                <span className="text-gray-400"> ({hubstaffName})</span>
              )}
              {" · "}
              {new Date(yearNum, monthNum - 1).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
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
        <div className="overflow-y-auto max-h-[55vh] p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-gray-600">Loading hours...</span>
            </div>
          ) : (
            <>
              {/* Existing entries */}
              {entries.filter((e) => !e.isNew).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No daily hours recorded for this month yet.
                </p>
              )}
              <div className="space-y-2">
                {entries.map((entry, idx) => {
                  if (entry.isNew) return null; // New entries shown below
                  return (
                    <div
                      key={entry.id || `new-${idx}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        entry.isDeleted
                          ? "bg-red-50 border-red-200 opacity-60"
                          : entry.isModified
                          ? "bg-amber-50 border-amber-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatDate(entry.date)}
                        </p>
                        <p className="text-xs text-gray-500">{entry.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="24"
                          value={entry.hoursTracked}
                          onChange={(e) => handleHoursChange(idx, e.target.value)}
                          disabled={entry.isDeleted}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                        />
                        <span className="text-xs text-gray-500 w-8">hrs</span>
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            entry.workingDayValue >= 1
                              ? "bg-green-100 text-green-700"
                              : entry.workingDayValue > 0
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {entry.workingDayValue.toFixed(2)}d
                        </span>
                        {entry.isDeleted ? (
                          <button
                            onClick={() => handleUndoDelete(idx)}
                            className="p-1 text-indigo-600 hover:bg-indigo-100 rounded transition-colors"
                            title="Undo delete"
                          >
                            <Plus size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(idx)}
                            className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* New entries (shown with a different style) */}
                {entries
                  .filter((e) => e.isNew && !e.isDeleted)
                  .map((entry, idx) => {
                    const realIdx = entries.findIndex(
                      (e) => e === entry
                    );
                    return (
                      <div
                        key={`new-${idx}`}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-green-50 border-green-200"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {formatDate(entry.date)}
                            <span className="ml-2 text-xs text-green-600 font-normal">
                              (new)
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">{entry.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="24"
                            value={entry.hoursTracked}
                            onChange={(e) =>
                              handleHoursChange(realIdx, e.target.value)
                            }
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <span className="text-xs text-gray-500 w-8">hrs</span>
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              entry.workingDayValue >= 1
                                ? "bg-green-100 text-green-700"
                                : entry.workingDayValue > 0
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {entry.workingDayValue.toFixed(2)}d
                          </span>
                          <button
                            onClick={() => handleDelete(realIdx)}
                            className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Add new day section */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Add New Day
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    min={minDate}
                    max={maxDate}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="24"
                    placeholder="Hours"
                    value={newHours}
                    onChange={(e) => setNewHours(e.target.value)}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={handleAddDay}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 transition-colors"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
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
            {hasChanges && !error && (
              <p className="text-xs text-amber-600 font-medium">
                Unsaved changes
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
