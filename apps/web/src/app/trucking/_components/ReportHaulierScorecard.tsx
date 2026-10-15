"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import type { HaulierScore } from "@/hooks/useTruckingReports";
import { HAULIER_STATUS_CHIP } from "../_lib/hauliers";
import { claimsText, daysText, haulierStatusLabel, perKgText, sortHauliers } from "../_lib/reports";
import { formatMoney, formatPercent } from "../_lib/tariffs";
import { HaulierStatusChip } from "./HaulierStatusChip";
import { haulierHref } from "./TruckingHauliersTab";

const STATUS_LABELS = (["blocked", "warning", "ok"] as const).map((s) => HAULIER_STATUS_CHIP[s].label);
const byNullable = (a: number | null, b: number | null) => (a ?? -Infinity) - (b ?? -Infinity);

const COLUMNS: AppGridColumn<HaulierScore>[] = [
  {
    key: "name",
    title: "Haulier",
    text: (h) => h.name,
    sorter: (a, b) => a.name.localeCompare(b.name, "cs"),
    render: (_, h) => (
      <Link href={haulierHref(h.haulierCustomerId)} className="font-semibold text-indigo-600 hover:underline">
        {h.name}
      </Link>
    ),
  },
  { key: "status", title: "Status", text: (h) => haulierStatusLabel(h.status), filterOptions: STATUS_LABELS, render: (_, h) => <HaulierStatusChip status={h.status} /> },
  { key: "trips", title: "Trips", align: "right", text: (h) => String(h.trips), sorter: (a, b) => a.trips - b.trips },
  { key: "partnerLegs", title: "Partner deliveries", align: "right", text: (h) => String(h.partnerLegs), sorter: (a, b) => a.partnerLegs - b.partnerLegs },
  { key: "consignments", title: "Consignments", align: "right", text: (h) => String(h.consignments), sorter: (a, b) => a.consignments - b.consignments },
  { key: "onTime", title: "On time", align: "right", text: (h) => formatPercent(h.onTimePercent), sorter: (a, b) => byNullable(a.onTimePercent, b.onTimePercent) },
  {
    key: "firstAttempt",
    title: "First attempt",
    align: "right",
    text: (h) => formatPercent(h.firstAttemptPercent),
    sorter: (a, b) => byNullable(a.firstAttemptPercent, b.firstAttemptPercent),
  },
  { key: "daysToPod", title: "Days to POD", align: "right", text: (h) => daysText(h.avgDaysToPod), sorter: (a, b) => byNullable(a.avgDaysToPod, b.avgDaysToPod) },
  { key: "claims", title: "Claims", align: "right", text: (h) => claimsText(h.claims, h.claimedCzk), sorter: (a, b) => a.claimedCzk - b.claimedCzk },
  { key: "cost", title: "Cost", align: "right", text: (h) => formatMoney(h.costCzk, "CZK"), sorter: (a, b) => a.costCzk - b.costCzk },
  { key: "costPerKg", title: "Cost per kg", align: "right", text: (h) => perKgText(h.costPerKg), sorter: (a, b) => byNullable(a.costPerKg, b.costPerKg) },
  {
    key: "invoicesBlocked",
    title: "Invoices blocked",
    align: "right",
    text: (h) => String(h.invoicesBlocked),
    sorter: (a, b) => a.invoicesBlocked - b.invoicesBlocked,
    render: (_, h) => (h.invoicesBlocked > 0 ? <span className="font-semibold text-red-600">{h.invoicesBlocked} blocked</span> : <span className="text-slate-400">0</span>),
  },
  {
    key: "invoiceDifference",
    title: "Invoice differences",
    align: "right",
    text: (h) => formatMoney(h.invoiceDifferenceCzk, "CZK"),
    sorter: (a, b) => a.invoiceDifferenceCzk - b.invoiceDifferenceCzk,
  },
];

interface ReportHaulierScorecardProps {
  hauliers: HaulierScore[];
}

// How each haulier did in the period: service, claims, cost and invoices; a name opens the haulier page.
export const ReportHaulierScorecard = ({ hauliers }: ReportHaulierScorecardProps) => {
  const rows = useMemo(() => sortHauliers(hauliers), [hauliers]);
  return (
    <>
      <AppGrid<HaulierScore>
        columns={COLUMNS}
        rows={rows}
        rowKey={(h) => h.haulierCustomerId}
        storageKey="trucking:reports:hauliers:v1"
        exportFilePrefix="trucking-haulier-scorecard"
        emptyText="No haulier carried a consignment delivered in this period."
      />
      <p className="m-0 mt-2 text-[11px] text-slate-500">
        Status is the haulier&apos;s status now. Cost is the real cost where an approved haulier invoice exists, else the expected cost. Invoice differences are the
        sum of the differences of its approved invoices, either way.
      </p>
    </>
  );
};
