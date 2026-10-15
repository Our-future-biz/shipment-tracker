"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const JOB_PROFIT_KEY = (from: string, to: string) => ["reports", "job-profit", from, to] as const;

/** Job profit in CZK at monthly ČNB averages for months from..to (YYYY-MM). */
export function useJobProfitReport(range: [string, string] | null) {
  return useQuery({
    queryKey: JOB_PROFIT_KEY(range?.[0] ?? "", range?.[1] ?? ""),
    queryFn: () => api.invoicing.jobProfitReportGet({ from: range![0], to: range![1] }),
    enabled: !!range,
  });
}
