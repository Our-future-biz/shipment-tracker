"use client";

import { useMemo, useState } from "react";
import { fold } from "@/lib/fold";
import type { ColumnFiltersPopoverProps, StoredFilter } from "@/components/ColumnFiltersPopover";
import type { ColumnPickerPopoverProps } from "@/components/ColumnPickerPopover";
import { storedGridFilters, withFilterId, type GridFilter } from "@/components/gridFilters";
import { useColumnPrefs } from "@/hooks/useColumnPrefs";
import { useColumnTemplates } from "@/hooks/useColumnTemplates";
import { useFilterTemplates } from "@/hooks/useFilterTemplates";
import { useAuth } from "@/lib/auth/AuthContext";
import { CHECK_KEY, knownFilters, normalizeColumns, type TableModel } from "../_lib/payableColumns";

// One table's Filter and Columns, wired as Finance → Invoicing's queue wires them (Council Outlay 9, the page): the
// filter rows kept here, their named sets in the user's preferences, the columns shown per user in this browser and
// their named sets on the server, all under the table's scope. The bar's check chips are filter rows too, so the
// Filter panel shows them and a saved set keeps them.

export function useTableControls<R, K extends string>(m: TableModel<R, K>) {
  const { user, token } = useAuth();
  const [filters, setFilters] = useState<GridFilter[]>([]);
  const active = useMemo(() => storedGridFilters(filters), [filters]);

  const prefs = useColumnPrefs(user?.id, m.view);
  const columnTemplates = useColumnTemplates(user?.id, token, m.scope);
  const filterTemplates = useFilterTemplates(m.scope);
  const visible = useMemo(() => normalizeColumns(m, prefs.visible), [m, prefs.visible]);
  // Nothing is saved before the user is known: the layout is stored per user.
  const ready = !!user?.id;

  const hasCheck = (label: string) => active.some((f) => f.key === CHECK_KEY && fold(f.value) === fold(label));
  const toggleCheck = (label: string) =>
    setFilters((now) =>
      now.some((f) => f.key === CHECK_KEY && fold(f.value.trim()) === fold(label))
        ? now.filter((f) => !(f.key === CHECK_KEY && fold(f.value.trim()) === fold(label)))
        : [...now, withFilterId({ key: CHECK_KEY, value: label })],
    );

  const filterProps: ColumnFiltersPopoverProps = {
    filters,
    onChange: setFilters,
    columns: m.filterColumns,
    // A saved row on a column or a check the table no longer has is dropped, not left to empty the list.
    templates: filterTemplates.templates.map((t) => ({ ...t, filters: knownFilters(m, t.filters) })),
    onSaveTemplate: async (name: string, saved: StoredFilter[]) => {
      await filterTemplates.saveTemplate(name, saved);
    },
    onDeleteTemplate: filterTemplates.deleteTemplate,
    isSaving: filterTemplates.isSaving,
    defaultColumn: m.first,
  };

  const columnProps: ColumnPickerPopoverProps = {
    columns: m.columns,
    fixedKeys: [m.first],
    allKeys: m.view.defaults,
    visible,
    onChange: (keys: string[]) => {
      if (ready) prefs.save(normalizeColumns(m, keys));
    },
    // Normalized, so a template shows as chosen when it equals the columns shown.
    templates: columnTemplates.templates.map((t) => ({ ...t, columns: normalizeColumns(m, t.columns) })),
    onSaveTemplate: async (name: string) => {
      // The server tells names apart by case: an existing one keeps its spelling, so no near-duplicate is added.
      const existing = columnTemplates.templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
      const saved = await columnTemplates.createTemplate(existing?.name ?? name, visible);
      if (!saved) throw new Error("Not signed in");
    },
    onDeleteTemplate: columnTemplates.deleteTemplate,
    ready,
  };

  return { filters: active, clear: () => setFilters([]), hasCheck, toggleCheck, visible, filterProps, columnProps };
}
