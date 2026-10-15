"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

// "Build stock from gate records" (manager): the gate sync run on every live gate record — first
// as a dry run that only counts, then for real. Refreshes the stock lists, zones, movements and
// the bonded register.

export type StockSyncResult = interfaces.WarehouseStockSyncResult;

export function useStockSync() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (dryRun: boolean) => (await api.warehouse.warehouseStockSync({ dryRun })).result,
    onSuccess: (_r, dryRun) => {
      if (dryRun) return;
      for (const key of ["stock-lines", "zones", "stock-movements", "bonded", "report-summary"]) {
        void queryClient.invalidateQueries({ queryKey: ["warehouse-records", key] });
      }
    },
  });
  return { run: mutation.mutateAsync, isRunning: mutation.isPending };
}

/** "3 lines to create, 1 to close · 2 bonded entries to open" — what the build will do. */
export function stockSyncText(r: StockSyncResult, future: boolean): string {
  const will = (n: number, what: string) => (n ? `${n} ${what}` : "");
  const lines = [
    will(r.linesCreated, future ? "to create" : "created"),
    will(r.linesClosed, future ? "to close" : "closed"),
    will(r.linesVoided, future ? "to void" : "voided"),
    will(r.linesReopened, future ? "to reopen" : "reopened"),
  ].filter(Boolean);
  const bonded = [
    will(r.bondedOpened, future ? "to open" : "opened"),
    will(r.bondedDischarged, future ? "to discharge" : "discharged"),
    will(r.bondedVoided, future ? "to void" : "voided"),
  ].filter(Boolean);
  const parts = [
    lines.length ? `Stock lines: ${lines.join(", ")}` : "Stock lines: nothing to change",
    bonded.length ? `Bonded register: ${bonded.join(", ")}` : "",
  ].filter(Boolean);
  return `${parts.join(" · ")} (${r.positions} gate record${r.positions === 1 ? "" : "s"} checked)`;
}
