"use client";

import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { invalidateInvoicingDerived } from "./useInvoiceQueue";

/** Every fx query lives under ["fx"], so one invalidation refreshes them all. */
export const FX_KEYS = {
  all: ["fx"] as const,
  overview: ["fx", "overview"] as const,
  daily: (month: string, all: boolean) => ["fx", "daily", month, all] as const,
  averages: (year: number, all: boolean) => ["fx", "averages", year, all] as const,
  roe: ["fx", "roe"] as const,
  runs: ["fx", "runs"] as const,
  ratesToday: ["fx", "rates-today"] as const,
  alerts: ["fx", "alerts"] as const,
  jobAll: (shipmentId: string) => ["fx", "job", shipmentId] as const,
  /** The job's dates are part of the key, so editing one refetches the rates. */
  job: (shipmentId: string, dates: string[]) => ["fx", "job", shipmentId, ...dates] as const,
};

/** Rates or ROE changed: every fx view and everything priced from them is stale. */
function useInvalidateFx() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: FX_KEYS.all });
    invalidateInvoicingDerived(queryClient);
  }, [queryClient]);
}

export function useFxOverview() {
  return useQuery({
    queryKey: FX_KEYS.overview,
    queryFn: () => api.fx.fxOverview(),
    // Picks up the scheduled pulls (15:00, 15:30, 16:00) while the page is open.
    refetchInterval: (q) => (q.state.data?.sync.state === "ok" ? 5 * 60_000 : 60_000),
  });
}

export function useFxDaily(month: string, all: boolean) {
  return useQuery({ queryKey: FX_KEYS.daily(month, all), queryFn: () => api.fx.fxDaily({ month, all }) });
}

export function useFxAverages(year: number, all: boolean) {
  return useQuery({
    queryKey: FX_KEYS.averages(year, all),
    queryFn: () => api.fx.fxAverages({ year, all }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useFxRoeHistory() {
  return useQuery({ queryKey: FX_KEYS.roe, queryFn: () => api.fx.fxRoeList() });
}

export function useFxImportRuns() {
  return useQuery({ queryKey: FX_KEYS.runs, queryFn: () => api.fx.fxImportRuns({ limit: 50 }) });
}

/** Today's ČNB rates and ROE % — shared by everything that prices "as of today". */
export function useFxRatesToday() {
  return useQuery({ queryKey: FX_KEYS.ratesToday, queryFn: () => api.fx.fxRatesOn({}), staleTime: 10 * 60 * 1000 });
}

/** ČNB fixings still missing after the 16:00 pull (admins only). */
export function useFxAlerts(enabled: boolean) {
  return useQuery({ queryKey: FX_KEYS.alerts, queryFn: () => api.fx.fxAlerts(), enabled, refetchInterval: 60_000 });
}

/** The ČNB rates a job uses: locked at ATA / ATD, provisional by ETA / ETD until then. */
export function useJobFxRates(shipmentId: string | undefined, dates: string[]) {
  return useQuery({
    queryKey: FX_KEYS.job(shipmentId ?? "", dates),
    queryFn: () => api.fx.fxJobRates(shipmentId!),
    enabled: !!shipmentId,
    placeholderData: keepPreviousData,
  });
}

export function useFxSync() {
  const invalidate = useInvalidateFx();
  return useMutation({ mutationFn: () => api.fx.fxSync(), onSuccess: invalidate });
}

export function useSetRoe() {
  const invalidate = useInvalidateFx();
  return useMutation({
    mutationFn: (req: controllers.RoeSetRequest) => api.fx.fxRoeSet(req),
    onSuccess: invalidate,
  });
}

/** For views that notice rates arriving (e.g. a ČNB alert closing) without a mutation. */
export { useInvalidateFx };
