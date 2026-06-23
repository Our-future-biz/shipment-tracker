"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type TaskItem = interfaces.TaskItem;

export function useShipmentTasks(shipmentId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["shipment-tasks", shipmentId];

  const query = useQuery({
    queryKey,
    queryFn: () => api.shipments.taskList(shipmentId),
    enabled: !!shipmentId,
  });

  const upsert = useMutation({
    mutationFn: ({ taskKey, completed, completedById }: { taskKey: string; completed: boolean; completedById?: string }) =>
      api.shipments.taskUpsert(shipmentId, { taskKey, completed, completedById }),
    onMutate: async ({ taskKey, completed, completedById }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      const nowIso = completed ? new Date().toISOString() : null;
      queryClient.setQueryData(queryKey, (old: { tasks: TaskItem[] } | undefined) => {
        const tasks = old?.tasks ?? [];
        const existing = tasks.find((t) => t.taskKey === taskKey);
        const next: TaskItem = existing
          ? { ...existing, completed, completedAt: nowIso, completedById: completed ? completedById ?? null : null }
          : { id: `optimistic-${taskKey}`, shipmentId, taskKey, completed, completedAt: nowIso, completedById: completed ? completedById ?? null : null };
        const others = tasks.filter((t) => t.taskKey !== taskKey);
        return { tasks: [...others, next] };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const tasks = useMemo(() => query.data?.tasks ?? [], [query.data?.tasks]);

  const byKey = useMemo(() => {
    const map = new Map<string, TaskItem>();
    for (const t of tasks) map.set(t.taskKey, t);
    return map;
  }, [tasks]);

  return {
    tasks,
    byKey,
    isLoading: query.isLoading,
    setCompleted: (taskKey: string, completed: boolean, completedById?: string) =>
      upsert.mutate({ taskKey, completed, completedById }),
  };
}
