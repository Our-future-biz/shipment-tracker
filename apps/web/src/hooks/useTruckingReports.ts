"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KpiRange } from "@/app/warehouse/_components/kpi/kpiPeriod";
import { truckingKeys } from "./truckingKeys";
import type { TruckingFile } from "./useTruckingConsignments";

// Trucking reports (Phase 7): KPIs, margin, haulier scorecard, coverage gaps and the department
// result of a period. Shapes are taken from the client methods, so the screens follow the API when
// the client is regenerated.

export type TruckingReport = Awaited<ReturnType<typeof api.trucking.truckingReport>>["report"];
export type TruckingKpi = TruckingReport["kpis"][number];
export type MarginRow = TruckingReport["marginByCustomer"][number];
export type HaulierScore = TruckingReport["hauliers"][number];
export type CoverageGap = TruckingReport["coverageGaps"][number];
export type DepartmentResult = TruckingReport["department"];

/** The report of a period; the figures of the previous period stay on screen while the next one loads. */
export function useTruckingReport(range: KpiRange) {
  const query = useQuery({
    queryKey: truckingKeys.report(range.from, range.to),
    queryFn: async () => (await api.trucking.truckingReport({ from: range.from, to: range.to })).report,
    placeholderData: keepPreviousData,
  });
  return { report: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}

/** The report of a period as an Excel workbook, made on click. */
export const fetchTruckingReportExport = async (range: KpiRange): Promise<TruckingFile> =>
  (await api.trucking.truckingReportExport({ from: range.from, to: range.to })).file;
