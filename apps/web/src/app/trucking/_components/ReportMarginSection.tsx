"use client";

import { useMemo, useState } from "react";
import { Segmented } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { Pill } from "@/components/Pill";
import type { MarginRow, TruckingReport } from "@/hooks/useTruckingReports";
import { TERMS } from "../_lib/glossary";
import { belowFloorText, MARGIN_VIEWS, marginPercentText, marginRows, marginText, marginTotals, type MarginView } from "../_lib/reports";
import { formatMoney } from "../_lib/tariffs";
import { ReportCard } from "./ReportCard";

const FIRST_COLUMN: Record<MarginView, string> = { customer: "Customer", lane: "Lane", serviceLevel: TERMS.serviceLevel };

const money = (n: number) => <span className="tabular-nums">{formatMoney(n, "CZK")}</span>;

// A negative margin is red and says "(loss)", so colour is never the only sign.
const MarginCell = ({ value }: { value: number }) => (
  <span className={`tabular-nums font-semibold ${value < 0 ? "text-red-600" : "text-slate-800"}`}>{marginText(value)}</span>
);

const buildColumns = (view: MarginView): AppGridColumn<MarginRow>[] => [
  {
    key: "label",
    title: FIRST_COLUMN[view],
    text: (r) => r.label,
    sorter: (a, b) => a.label.localeCompare(b.label, "cs"),
    render: (_, r) => <span className="font-medium text-slate-800">{r.label}</span>,
  },
  { key: "consignments", title: "Consignments", align: "right", text: (r) => String(r.consignments), sorter: (a, b) => a.consignments - b.consignments },
  { key: "sell", title: "Sell", align: "right", text: (r) => formatMoney(r.sellCzk, "CZK"), sorter: (a, b) => a.sellCzk - b.sellCzk, render: (_, r) => money(r.sellCzk) },
  { key: "buy", title: "Buy", align: "right", text: (r) => formatMoney(r.buyCzk, "CZK"), sorter: (a, b) => a.buyCzk - b.buyCzk, render: (_, r) => money(r.buyCzk) },
  { key: "margin", title: "Margin", align: "right", text: (r) => marginText(r.marginCzk), sorter: (a, b) => a.marginCzk - b.marginCzk, render: (_, r) => <MarginCell value={r.marginCzk} /> },
  {
    key: "marginPercent",
    title: "Margin %",
    align: "right",
    text: (r) => marginPercentText(r.marginPercent),
    sorter: (a, b) => (a.marginPercent ?? -Infinity) - (b.marginPercent ?? -Infinity),
    render: (_, r) => <span className={`tabular-nums ${(r.marginPercent ?? 0) < 0 ? "text-red-600" : ""}`}>{marginPercentText(r.marginPercent)}</span>,
  },
  {
    key: "belowFloor",
    title: `Below ${TERMS.marginFloor.toLowerCase()}`,
    text: (r) => belowFloorText(r.belowFloor),
    sorter: (a, b) => a.belowFloor - b.belowFloor,
    render: (_, r) =>
      r.belowFloor > 0 ? (
        <Pill tone="amber">
          <WarningOutlined aria-hidden />
          {belowFloorText(r.belowFloor)}
        </Pill>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
];

interface ReportMarginSectionProps {
  report: TruckingReport;
}

// Margin of the period's Road consignments by customer, lane or service level (internal excluded).
export const ReportMarginSection = ({ report }: ReportMarginSectionProps) => {
  const [view, setView] = useState<MarginView>("customer");
  const rows = useMemo(() => marginRows(report, view), [report, view]);
  const columns = useMemo(() => buildColumns(view), [view]);
  const totals = marginTotals(rows);

  return (
    <ReportCard
      title="Margin"
      extra={<Segmented<MarginView> size="small" value={view} onChange={setView} options={MARGIN_VIEWS} aria-label="Margin by" />}
    >
      <AppGrid<MarginRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        storageKey="trucking:reports:margin:v1"
        exportFilePrefix={`trucking-margin-${view}`}
        emptyText="No Road consignment was delivered in this period."
        resetKey={view}
      />
      <p className="m-0 mt-2 text-xs text-slate-600">
        <b>Total:</b> {totals.consignments} consignments · sell {formatMoney(totals.sellCzk, "CZK")} · buy {formatMoney(totals.buyCzk, "CZK")} · margin{" "}
        <span className={totals.marginCzk < 0 ? "font-semibold text-red-600" : "font-semibold"}>{marginText(totals.marginCzk)}</span> ({marginPercentText(totals.marginPercent)})
        {totals.belowFloor > 0 && <span className="text-amber-700"> · {belowFloorText(totals.belowFloor)}</span>}
      </p>
      <p className="m-0 mt-1 text-[11px] text-slate-500">
        Road consignments delivered in the period (Prague days), in CZK — EUR at the rate stored with each price. Internal consignments are left out; they are in
        the department result.
      </p>
    </ReportCard>
  );
};
