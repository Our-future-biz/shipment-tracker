"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

export interface ColumnTemplate {
  id: string;
  name: string;
  columns: string[];
}

// Named, per-user column templates persisted server-side (auth service).
// Identity is derived server-side from the JWT — we send it as a Bearer token.
export function useColumnTemplates(userId: string | undefined, token: string | null) {
  const queryClient = useQueryClient();
  const authorization = token ? `Bearer ${token}` : "";
  const queryKey = ["columnTemplates", userId];

  const query = useQuery({
    queryKey,
    queryFn: () => api.auth.columnTemplatesList({ authorization }),
    enabled: !!token,
  });

  const templates: ColumnTemplate[] = (query.data?.templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    columns: t.columns,
  }));

  const upsert = useMutation({
    mutationFn: (params: { name: string; columns: string[] }) =>
      api.auth.columnTemplatesUpsert({ authorization, name: params.name, columns: params.columns }),
    // Optimistic so drag/toggle edits to the active template reflect instantly.
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<controllers.ListColumnTemplatesResponse>(queryKey);
      queryClient.setQueryData<controllers.ListColumnTemplatesResponse>(queryKey, (old) => {
        if (!old) return old;
        const exists = old.templates.some((t) => t.name.toLowerCase() === params.name.toLowerCase());
        const templates = exists
          ? old.templates.map((t) =>
              t.name.toLowerCase() === params.name.toLowerCase() ? { ...t, columns: params.columns } : t,
            )
          : [...old.templates, { id: `optimistic-${params.name}`, userId: "", name: params.name, columns: params.columns }];
        return { ...old, templates };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    // Replace the optimistic placeholder with the real server row (real id) so a
    // freshly-created template can be activated by id before the refetch lands.
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.ListColumnTemplatesResponse>(queryKey, (old) => {
        if (!old) return old;
        const t = res.template;
        const others = old.templates.filter(
          (x) => x.id !== t.id && x.name.toLowerCase() !== t.name.toLowerCase(),
        );
        return { ...old, templates: [...others, t] };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.auth.columnTemplatesDelete(id, { authorization }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<controllers.ListColumnTemplatesResponse>(queryKey);
      queryClient.setQueryData<controllers.ListColumnTemplatesResponse>(queryKey, (old) =>
        old ? { ...old, templates: old.templates.filter((t) => t.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    templates,
    templatesLoaded: query.isSuccess,
    saveTemplate: (name: string, columns: string[]) => {
      const trimmed = name.trim();
      if (!token || !trimmed) return;
      upsert.mutate({ name: trimmed, columns });
    },
    createTemplate: async (name: string, columns: string[]): Promise<ColumnTemplate | null> => {
      const trimmed = name.trim();
      if (!token || !trimmed) return null;
      const res = await upsert.mutateAsync({ name: trimmed, columns });
      return { id: res.template.id, name: res.template.name, columns: res.template.columns };
    },
    deleteTemplate: (id: string) => {
      if (!token) return;
      deleteMutation.mutate(id);
    },
  };
}
