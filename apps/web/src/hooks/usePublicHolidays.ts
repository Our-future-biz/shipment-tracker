"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

const PUBLIC_HOLIDAYS_KEY = ["public-holidays"];

export const usePublicHolidays = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PUBLIC_HOLIDAYS_KEY,
    queryFn: () => api.holidays.holidayList(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PUBLIC_HOLIDAYS_KEY });

  // Saving happens per source file; the list is refreshed once, after the last one.
  const importMutation = useMutation({
    mutationFn: async (batches: controllers.HolidayImportRequest[]) => {
      let added = 0;
      let skipped = 0;
      for (const batch of batches) {
        const res = await api.holidays.holidayImport(batch);
        added += res.added;
        skipped += res.skipped;
      }
      return { added, skipped };
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.holidays.holidayDelete(id),
    onSuccess: invalidate,
  });

  return {
    holidays: query.data?.holidays ?? [],
    isLoading: query.isLoading,
    importHolidays: importMutation.mutateAsync,
    deleteHoliday: deleteMutation.mutateAsync,
  };
};
