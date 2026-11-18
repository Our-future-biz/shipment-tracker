"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatAmount } from "@/lib/money";
import { EMPTY, LINK, REF } from "@/styles/ui";
import type { PayableExpected } from "../_lib/payables";
import { shownColumns } from "@/lib/tableModel";

// The Expected tab: estimated costs no invoice has come for yet, one row per cost line (there is no invoice to
// group them by) - the month-end accrual list. Not a status of an invoice (D3).

const text = (v: string) => (v ? v : <span className={EMPTY}>—</span>);

const columns: ColumnsType<PayableExpected> = [
  {
    title: "Job",
    key: "job",
    sorter: (a, b) => a.jobNumber.localeCompare(b.jobNumber),
    render: (_, e) => (
      <span className="whitespace-nowrap">
        <Link href={`/shipments/${encodeURIComponent(e.shipmentId)}?tab=costs`} className={`${REF} font-semibold ${LINK}`}>
          {e.jobNumber || "Job"}
        </Link>
        {e.jobBilled && (
          <Tooltip title="The job is invoiced to the customer already, and this cost is still expected">
            <Pill tone="amber" className="ml-1.5">
              Job billed
            </Pill>
          </Tooltip>
        )}
      </span>
    ),
  },
  { title: "Customer", key: "customer", sorter: (a, b) => a.customer.localeCompare(b.customer), render: (_, e) => <span className="block max-w-[220px] truncate" title={e.customer}>{text(e.customer)}</span> },
  { title: "Charge", key: "charge", render: (_, e) => text(e.category ? chargeLabel(e.category) : "") },
  { title: "Description", key: "description", render: (_, e) => <span className="block max-w-[260px] truncate" title={e.description}>{text(e.description)}</span> },
  {
    title: "Vendor",
    key: "vendor",
    sorter: (a, b) => a.vendor.localeCompare(b.vendor),
    render: (_, e) => (
      <span className="whitespace-nowrap">
        {text(e.vendor)}
        {e.vendor && !e.supplierCustomerId && (
          <Tooltip title="Only typed on the line, not a company of the Customer Database">
            <Pill tone="slate" className="ml-1.5">
              Not linked
            </Pill>
          </Tooltip>
        )}
      </span>
    ),
  },
  {
    title: "Estimate",
    key: "estimate",
    align: "right",
    sorter: (a, b) => a.estimate - b.estimate,
    render: (_, e) => <span className="tabular-nums whitespace-nowrap font-semibold text-slate-900">{formatAmount(e.estimate, e.currency)}</span>,
  },
  { title: "Job status", key: "status", render: (_, e) => text(e.jobStatus) },
  { title: "Created", key: "created", sorter: (a, b) => a.createdOn.localeCompare(b.createdOn), render: (_, e) => <span className="tabular-nums whitespace-nowrap">{formatDate(e.createdOn)}</span> },
];

interface ExpectedTableProps {
  rows: PayableExpected[] | undefined;
  loading: boolean;
  emptyText: string;
  resetKey: string;
  /** The columns the user shows (Columns), in table order */
  visible: string[];
}

export function ExpectedTable({ rows, loading, emptyText, resetKey, visible }: ExpectedTableProps) {
  return (
    <DataTable<PayableExpected>
      resizeKey="accounts-payable:expected"
      dataSource={rows}
      columns={shownColumns(columns, visible)}
      rowKey="lineId"
      loading={loading}
      scroll={{ x: "max-content" }}
      resetKey={resetKey}
      locale={{ emptyText }}
    />
  );
}
