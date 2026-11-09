"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Button, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { DataTable } from "@/components/DataTable";
import { KpiTile, profitTone } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { StatusBadge } from "@/components/StatusBadge";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { LABEL_TEXT, LINK, REF } from "@/styles/ui";
import { periodBasisLabel, provisionalText } from "../_lib/jobPeriod";
import { monthBreakdown, type BreakdownGroup } from "../_lib/monthBreakdown";
import { SalesDialog } from "./SalesDialog";

type Row = interfaces.JobProfitRow;

const czk = (v: number) => fmtMoney(v, "CZK", true);
const tone = (v: number) => (v >= 0 ? "text-emerald-600" : "text-red-600");

const CELL = "py-1.5 text-[13px] border-b border-slate-100 tabular-nums";

// One way of cutting the month: a line per freight mode or customer.
function GroupTable({ title, groups }: { title: string; groups: BreakdownGroup[] }) {
  return (
    <div className="min-w-0">
      <h3 className={`m-0 mb-1.5 ${LABEL_TEXT}`}>{title}</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr className={`text-left ${LABEL_TEXT}`}>
            <th scope="col" className="sr-only">{title.replace(/^By /, "")}</th>
            <th scope="col" className="py-1 text-right font-semibold">Jobs</th>
            <th scope="col" className="py-1 text-right font-semibold">Revenue</th>
            <th scope="col" className="py-1 text-right font-semibold">Profit</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <td className={`${CELL} pr-2 max-w-[200px] truncate`} title={g.label}>{g.label}</td>
              <td className={`${CELL} text-right`}>{g.jobs}</td>
              <td className={`${CELL} text-right whitespace-nowrap pl-2`}>{czk(g.revenueCzk)}</td>
              <td className={`${CELL} text-right whitespace-nowrap pl-2 ${tone(g.profitCzk)}`}>{czk(g.profitCzk)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const columns: ColumnsType<Row> = [
  {
    title: "Internal Reference",
    dataIndex: "jobNumber",
    render: (v: string, r) => <Link href={`/shipments/${r.shipmentId}`} className={`${REF} ${LINK}`}>{v}</Link>,
  },
  { title: "Customer", dataIndex: "customer", render: (v: string) => v || <span className="text-slate-300">—</span> },
  { title: "Freight Mode", dataIndex: "freightMode", render: (v: string) => v || <span className="text-slate-300">—</span> },
  { title: "Shipment Status", dataIndex: "status", render: (v: string) => <StatusBadge status={v} /> },
  {
    title: "Dated by",
    key: "date",
    render: (_: unknown, r) => (
      <span className="whitespace-nowrap">
        {periodBasisLabel(r.basis)} {formatDate(r.date)}
        {r.provisional && (
          <Tooltip title={provisionalText(r.basis)}>
            <Pill tone="amber" className="ml-1.5">provisional</Pill>
          </Tooltip>
        )}
      </span>
    ),
  },
  { title: "Revenue (CZK)", dataIndex: "revenueCzk", align: "right", sorter: (a, b) => a.revenueCzk - b.revenueCzk, render: (v: number) => czk(v) },
  { title: "Costs (CZK)", dataIndex: "costCzk", align: "right", sorter: (a, b) => a.costCzk - b.costCzk, render: (v: number) => czk(v) },
  {
    title: "Profit (CZK)",
    dataIndex: "profitCzk",
    align: "right",
    sorter: (a, b) => a.profitCzk - b.profitCzk,
    render: (v: number, r) => (
      <span className={tone(v)}>
        {czk(v)}
        {r.unconverted.length > 0 && (
          <Tooltip title={`No ČNB average for ${r.unconverted.join(", ")} — left out`}>
            <span className="ml-1 text-warn">*</span>
          </Tooltip>
        )}
      </span>
    ),
  },
];

interface MonthBreakdownDialogProps {
  /** YYYY-MM; null keeps the dialog closed. */
  month: string | null;
  rows: readonly Row[];
  onClose: () => void;
}

// A month of Job Profit in full: its totals, by freight mode, by customer and job by job. It is
// always the whole month, whatever the report's search has narrowed the list below to.
export function MonthBreakdownDialog({ month, rows, onClose }: MonthBreakdownDialogProps) {
  const breakdown = useMemo(() => (month ? monthBreakdown(rows, month) : null), [rows, month]);
  return (
    <SalesDialog
      open={!!month}
      onClose={onClose}
      size="wide"
      title={month ? dayjs(`${month}-01`).format("MMMM YYYY") : ""}
      subtitle="CZK at the month's ČNB average, without the ROE %"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {breakdown && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <KpiTile label="Jobs" value={String(breakdown.totals.jobs)} />
            <KpiTile label="Revenue" value={czk(breakdown.totals.revenueCzk)} />
            <KpiTile label="Costs" value={czk(breakdown.totals.costCzk)} />
            <KpiTile label="Profit" value={czk(breakdown.totals.profitCzk)} tone={profitTone(breakdown.totals.profitCzk)} />
            <KpiTile label="Margin" value={`${breakdown.totals.margin}%`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <GroupTable title="By freight mode" groups={breakdown.byFreightMode} />
            <GroupTable title="By customer" groups={breakdown.byCustomer} />
          </div>
          <DataTable<Row> dataSource={breakdown.rows} columns={columns} rowKey="shipmentId" scroll={{ x: "max-content" }} resetKey={month} />
        </>
      )}
    </SalesDialog>
  );
}
