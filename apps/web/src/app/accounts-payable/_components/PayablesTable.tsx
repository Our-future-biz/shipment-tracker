"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { EMPTY, LINK, REF } from "@/styles/ui";
import { PayableLines } from "./PayableLines";
import { MarkPills } from "./MarkPills";
import { haulierChip, haulierInvoiceHref, statusChip, type PayableRow } from "../_lib/payables";
import { shownColumns } from "@/lib/tableModel";

// The invoices of a tab: one row per supplier invoice (D1), opened to its lines; Trucking's haulier invoices
// beside them for superadmins, read-only, a click opening them in Trucking (D17).

const day = (v: string | null) => (v ? <span className="tabular-nums whitespace-nowrap">{formatDate(v)}</span> : <span className={EMPTY}>—</span>);
const cmp = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "");

const supplierOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.supplier : r.haulier.haulierName);
const numberOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.invoiceNumber : r.haulier.invoiceNumber);
const bookedOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.bookedOn : null);
const issueOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.issueDate : r.haulier.issueDate);
const dueOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.due : r.haulier.dueDate);

function Jobs({ jobs }: { jobs: string[] }) {
  if (!jobs.length) return <span className={EMPTY}>—</span>;
  const [first, ...rest] = jobs;
  return (
    <span className={`${REF} whitespace-nowrap`} title={jobs.join(", ")}>
      {first}
      {rest.length > 0 && <span className="text-slate-500"> +{rest.length}</span>}
    </span>
  );
}

const columns: ColumnsType<PayableRow> = [
  {
    title: "Supplier",
    key: "supplier",
    sorter: (a, b) => supplierOf(a).localeCompare(supplierOf(b)),
    render: (_, r) => (
      <div className="flex flex-wrap items-center gap-1.5 max-w-[260px]">
        <span className="font-medium text-slate-900 truncate" title={supplierOf(r)}>
          {supplierOf(r) || "—"}
        </span>
        {r.source === "ap" && !r.invoice.supplierCustomerId && !r.invoice.haulierId && (
          <Tooltip title="The supplier is only typed: link it to a company of the Customer Database before it is approved">
            <Pill tone="amber">Not linked</Pill>
          </Tooltip>
        )}
        {r.source === "haulier" && (
          <Tooltip title="A haulier invoice from Trucking: approved, rejected and paid there">
            <Pill tone="indigo">Trucking</Pill>
          </Tooltip>
        )}
      </div>
    ),
  },
  {
    title: "Invoice number",
    key: "number",
    sorter: (a, b) => numberOf(a).localeCompare(numberOf(b)),
    render: (_, r) => (
      <span className="whitespace-nowrap">
        {r.source === "haulier" ? (
          <Link href={haulierInvoiceHref(r.haulier.id)} className={`${REF} font-semibold ${LINK}`} onClick={(e) => e.stopPropagation()}>
            {r.haulier.invoiceNumber || "—"}
          </Link>
        ) : (
          <span className={`${REF} font-semibold text-slate-900`}>{r.invoice.invoiceNumber || "—"}</span>
        )}
        {r.source === "ap" && r.invoice.kind === "credit_note" && (
          <Pill tone="slate" className="ml-1.5">
            Credit note
          </Pill>
        )}
      </span>
    ),
  },
  { title: "Jobs", key: "jobs", render: (_, r) => <Jobs jobs={r.source === "ap" ? r.invoice.jobs : r.haulier.refs} /> },
  { title: "Booked on", key: "booked", sorter: (a, b) => cmp(bookedOf(a), bookedOf(b)), render: (_, r) => day(bookedOf(r)) },
  { title: "Issue date", key: "issue", sorter: (a, b) => cmp(issueOf(a), issueOf(b)), render: (_, r) => day(issueOf(r)) },
  {
    title: "Due",
    key: "due",
    sorter: (a, b) => cmp(dueOf(a), dueOf(b)),
    render: (_, r) => {
      const due = dueOf(r);
      if (!due) return <span className={EMPTY}>—</span>;
      return (
        <div className="whitespace-nowrap">
          <span className="tabular-nums">{formatDate(due)}</span>
          {/* Not on the invoice: the booked day plus the supplier's payment days. */}
          {r.source === "ap" && r.invoice.dueSource === "terms" && (
            <Tooltip title="Not given on the invoice: the day it was booked plus the supplier's payment days">
              <div className="text-[11px] text-slate-500">from terms</div>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  {
    title: "Amount",
    key: "amount",
    align: "right",
    render: (_, r) =>
      r.source === "haulier" ? (
        <Tooltip title="With VAT, as Trucking keeps it: never added to the totals without VAT">
          <div className="tabular-nums whitespace-nowrap font-semibold text-slate-900">
            {formatAmount(r.haulier.gross, r.haulier.currency)}
            <div className="text-[11px] font-normal text-slate-500">with VAT</div>
          </div>
        </Tooltip>
      ) : (
        // Per currency, without VAT, never converted.
        <div className="tabular-nums whitespace-nowrap font-semibold text-slate-900">
          {r.invoice.amounts.length ? r.invoice.amounts.map((a) => <div key={a.currency}>{formatAmount(a.amount, a.currency)}</div>) : <span className={EMPTY}>—</span>}
        </div>
      ),
  },
  {
    title: "Status",
    key: "status",
    render: (_, r) => {
      const chip = r.source === "ap" ? statusChip(r.invoice) : haulierChip(r.haulier);
      return (
        <Tooltip title={chip.tip}>
          <Pill tone={chip.tone}>{chip.label}</Pill>
        </Tooltip>
      );
    },
  },
  {
    title: "Marks",
    key: "marks",
    render: (_, r) =>
      r.source === "ap" ? (
        <MarkPills invoice={r.invoice} />
      ) : (
        <div className="flex flex-wrap gap-1 max-w-[280px]">
          {r.haulier.daysOverdue > 0 && <Pill tone="red">{`${r.haulier.daysOverdue} ${r.haulier.daysOverdue === 1 ? "day" : "days"} overdue`}</Pill>}
          {r.haulier.claimed > 0 && (
            <Tooltip title="Trucking nets a haulier's claims off the lines">
              <Pill tone="amber">Claimed {formatAmount(r.haulier.claimed, r.haulier.currency)}</Pill>
            </Tooltip>
          )}
        </div>
      ),
  },
];

interface PayablesTableProps {
  rows: PayableRow[] | undefined;
  loading: boolean;
  emptyText: string;
  resetKey: string;
  /** The columns the user shows (Columns), in table order */
  visible: string[];
  onOpen: (invoiceId: string) => void;
}

export function PayablesTable({ rows, loading, emptyText, resetKey, visible, onOpen }: PayablesTableProps) {
  const router = useRouter();
  return (
    <DataTable<PayableRow>
      resizeKey="accounts-payable:invoices"
      dataSource={rows}
      columns={shownColumns(columns, visible)}
      rowKey="key"
      loading={loading}
      scroll={{ x: "max-content" }}
      resetKey={resetKey}
      locale={{ emptyText }}
      expandable={{
        rowExpandable: (r) => r.source === "ap",
        expandedRowRender: (r) => (r.source === "ap" ? <PayableLines lines={r.invoice.lines} /> : null),
      }}
      onRow={(r) => ({
        // The expand arrow and the links stop their own clicks; anywhere else opens the invoice.
        onClick: () => (r.source === "ap" ? onOpen(r.invoice.id) : router.push(haulierInvoiceHref(r.haulier.id))),
        className: "cursor-pointer",
      })}
    />
  );
}
