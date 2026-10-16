"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STOCK_RECORD_KEYS, warehouseRecordKeys } from "./warehouseKeys";

// "Build stock from gate records" (manager): the gate sync run on every live gate record — first
// as a dry run that only counts, then for real. Refreshes the stock lists, zones, movements and
// the bonded register.
export function useStockSync() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (dryRun: boolean) => (await api.warehouseConcept.warehouseStockSync({ dryRun })).result,
    onSuccess: (_r, dryRun) => {
      if (dryRun) return;
      for (const key of STOCK_RECORD_KEYS) {
        void queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of(key) });
      }
    },
  });
  return { run: mutation.mutateAsync, isRunning: mutation.isPending };
}

