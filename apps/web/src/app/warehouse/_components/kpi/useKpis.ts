"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { KPI_PRESETS, periodRange, type KpiPreset, type KpiRange } from "./kpiPeriod";

// The Reports period, kept in the URL (?period=7d, or ?period=custom&from=…&to=…), and the KPI
// report for it. The query key sits under the report summary key, so every change to the warehouse
// records that refreshes the reports refreshes these figures too.

export function useKpiPeriod(): { preset: KpiPreset; range: KpiRange; setPreset: (p: KpiPreset) => void; setCustom: (r: KpiRange) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("period");
  const preset: KpiPreset = raw && (KPI_PRESETS as readonly string[]).includes(raw) ? (raw as KpiPreset) : "7d";
  const range = periodRange(preset, { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });

  const write = useCallback(
    (next: KpiPreset, custom?: KpiRange) => {
      const q = new URLSearchParams(params.toString());
      if (next === "7d") q.delete("period");
      else q.set("period", next);
      q.delete("from");
      q.delete("to");
      if (next === "custom" && custom) {
        q.set("from", custom.from);
        q.set("to", custom.to);
      }
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  return {
    preset,
    range,
    // Switching to Custom keeps the days shown until a range is picked.
    setPreset: (p) => write(p, p === "custom" ? range : undefined),
    setCustom: (r) => write("custom", r),
  };
}

export function useKpiReport(range: KpiRange) {
  const query = useQuery({
    queryKey: ["warehouse-records", "report-summary", "kpis", range.from, range.to],
    queryFn: async () => (await api.warehouse.warehouseKpis({ from: range.from, to: range.to })).report,
    placeholderData: (prev) => prev,
  });
  return { report: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}
