import { useState, useCallback } from "react";

export interface CheckboxSelectionResult {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: (allIds: string[]) => void;
  isAllSelected: (allIds: string[]) => boolean;
  clearSelection: () => void;
  selectedCount: number;
}

/**
 * Hook for managing checkbox selection state across table rows.
 * Returns selection state and helper functions.
 */
export function useCheckboxSelection(): CheckboxSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (allIds: string[]) => {
      setSelectedIds((prev) => {
        if (prev.size === allIds.length && allIds.every((id) => prev.has(id))) {
          return new Set();
        }
        return new Set(allIds);
      });
    },
    []
  );

  const isAllSelected = useCallback(
    (allIds: string[]) => {
      if (allIds.length === 0) return false;
      return allIds.every((id) => selectedIds.has(id));
    },
    [selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelected,
    toggle,
    toggleAll,
    isAllSelected,
    clearSelection,
    selectedCount: selectedIds.size,
  };
}
