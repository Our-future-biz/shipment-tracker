"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FilterTemplate {
  id: string;
  name: string;
  filters: { key: string; value: string }[];
}

const PREF_KEY = "shipment-filter-templates";
const QUERY_KEY = ["user-prefs", PREF_KEY];

/**
 * Named sets of the Shipments "Filter by column" filters, saved per user in the
 * database (user preferences), so they follow the user to another computer.
 */
export function useFilterTemplates() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.shipments.userPrefGet(PREF_KEY),
    staleTime: 5 * 60 * 1000,
  });

  const templates: FilterTemplate[] = useMemo(() => {
    if (!data?.value) return [];
    try {
      const parsed: unknown = JSON.parse(data.value);
      return Array.isArray(parsed) ? (parsed as FilterTemplate[]).filter((t) => t && t.id && t.name && Array.isArray(t.filters)) : [];
    } catch {
      return [];
    }
  }, [data?.value]);

  const save = useMutation({
    mutationFn: (next: FilterTemplate[]) => api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify(next) }),
    // Show the change straight away; roll back if the server refuses it.
    onMutate: (next) => {
      const previous = queryClient.getQueryData(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, { value: JSON.stringify(next) });
      return { previous };
    },
    onError: (_e, _next, context) => queryClient.setQueryData(QUERY_KEY, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  /** Saves the filters under a name; an existing template of that name is overwritten. */
  const saveTemplate = async (name: string, filters: FilterTemplate["filters"]) => {
    const trimmed = name.trim();
    const existing = templates.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    const template: FilterTemplate = { id: existing?.id ?? crypto.randomUUID(), name: trimmed, filters };
    await save.mutateAsync(existing ? templates.map((t) => (t.id === existing.id ? template : t)) : [...templates, template]);
    return template;
  };

  const deleteTemplate = (id: string) => save.mutate(templates.filter((t) => t.id !== id));

  return { templates, saveTemplate, deleteTemplate, isSaving: save.isPending };
}
