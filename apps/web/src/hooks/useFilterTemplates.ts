"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { changeUserPref, readUserPref, userPrefKey } from "./userPrefs";

export interface FilterTemplate {
  id: string;
  name: string;
  filters: { key: string; value: string }[];
}

/** The saved templates out of the stored JSON; anything that is not a list of templates is none. */
export function parseFilterTemplates(stored: string | null | undefined): FilterTemplate[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as FilterTemplate[]).filter((t) => t && t.id && t.name && Array.isArray(t.filters)) : [];
  } catch {
    return [];
  }
}

/**
 * Named sets of the "Filter by column" filters, saved per user in the database (user
 * preferences), so they follow the user to another computer. Each screen has its own
 * list: `scope` names the screen, left out it is the Shipments grid.
 */
export function useFilterTemplates(scope?: string) {
  const queryClient = useQueryClient();
  const PREF_KEY = scope ? `${scope}:filter-templates` : "shipment-filter-templates";
  const QUERY_KEY = useMemo(() => userPrefKey(PREF_KEY), [PREF_KEY]);

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => readUserPref(PREF_KEY),
    staleTime: 5 * 60 * 1000,
  });

  const templates: FilterTemplate[] = useMemo(() => parseFilterTemplates(data?.value), [data?.value]);
  // Known once the saved templates were read. Until then - and when the read failed - the list is
  // only empty, and nothing is saved: a list built on it would replace every saved template.
  const loaded = data !== undefined;

  // Each change is made to the list as the server holds it now, so a template another tab saved
  // meanwhile is kept; one change waits for the one before.
  const change = useMutation({
    mutationFn: (edit: (current: FilterTemplate[]) => FilterTemplate[]) => changeUserPref(queryClient, PREF_KEY, parseFilterTemplates, edit),
    scope: { id: `user-prefs:${PREF_KEY}` },
  });

  /** Saves the filters under a name; an existing template of that name is overwritten. */
  const saveTemplate = async (name: string, filters: FilterTemplate["filters"]) => {
    if (!loaded) throw new Error("The saved templates are not loaded yet");
    const trimmed = name.trim();
    const sameName = (t: FilterTemplate) => t.name.toLowerCase() === trimmed.toLowerCase();
    const next = await change.mutateAsync((current) => {
      const existing = current.find(sameName);
      const template: FilterTemplate = { id: existing?.id ?? crypto.randomUUID(), name: trimmed, filters };
      return existing ? current.map((t) => (t.id === existing.id ? template : t)) : [...current, template];
    });
    return next.find(sameName)!;
  };

  const deleteTemplate = (id: string) => {
    if (!loaded) return;
    change.mutate((current) => current.filter((t) => t.id !== id));
  };

  return { templates, loaded, saveTemplate, deleteTemplate, isSaving: change.isPending };
}
