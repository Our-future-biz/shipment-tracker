"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { Spin, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ChipList } from "@/components/finance/ChipList";
import { useReceivable } from "@/hooks/useReceivables";
import { AGING_LABEL, markChips, REMINDER_LEVEL_LABEL, statusLabel, statusTitle, statusTone } from "@/lib/accountsReceivable";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { shownColumns } from "@/lib/tableModel";
import { EMPTY, HINT, LINK, REF } from "@/styles/ui";
import { amountText, batchSelectable, LIST_CELL_PADDING, LIST_EXPAND_WIDTH, LIST_TICK_WIDTH, LIST_WIDTHS, shipmentHref, shortInvoiceNumber, type ReceivableRow } from "../_lib/receivables";
import { PersonName } from "./PersonName";

// The invoices of a tab: one row per issued invoice, its credit notes folded in (D1), opened to its lines, its credit
// notes and the job's people. A click anywhere else opens the drawer.

const none = <span className={EMPTY}>—</span>;
const day = (v: string | null | undefined) => (v ? <span className="tabular-nums whitespace-nowrap">{formatDate(v)}</span> : none);
const cmp = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "");
const amount = (v: number, currency: string, strong = false) => (
  <span className={`tabular-nums whitespace-nowrap ${strong ? "font-semibold text-slate-900" : ""}`}>{amountText(v, currency)}</span>
);
const text = (v: string, width = "max-w-[220px]") => (v ? <span className={`block ${width} truncate`} title={v}>{v}</span> : none);
/** A person by name, the e-mail on hover (mock test run). */
const person = (email: string) => (email ? <PersonName email={email} className="block max-w-[220px] truncate" /> : none);
/** What a cell of the list may hold: its width less its padding (LIST_WIDTHS). */
const inner = (width: number) => ({ maxWidth: width - LIST_CELL_PADDING });

/**
 * The status and its marks; Overdue is said in the Due column already, so it is not repeated here. The marks wrap under
 * the status in a narrow column (A5): up to three side by side took 253 px; at 170 px Currency still fell off a 1440 px
 * screen (mock test run), so the column is LIST_WIDTHS.status.
 */
function StatusCell({ r }: { r: ReceivableRow }) {
  const chips = markChips(r).filter((c) => c.key !== "overdue");
  return (
    <div className="flex flex-wrap items-center gap-1" style={inner(LIST_WIDTHS.status)}>
      <Tooltip title={statusTitle(r.status)}>
        <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
      </Tooltip>
      <ChipList chips={chips} empty={false} />
    </div>
  );
}

// The table's order and its widths (user council A5): the number shortened in its middle and the customer cut, each
// whole on hover, the credit notes under the number, Status right after it - so the mock's columns up to Currency fit a
// 1440 px screen, as LIST_WIDTHS sums them. The order is receivableColumns' RECEIVABLE_COLUMNS, which the shown columns follow.
const columns: ColumnsType<ReceivableRow> = [
  {
    title: "Invoice number",
    key: "number",
    width: LIST_WIDTHS.number,
    sorter: (a, b) => a.number.localeCompare(b.number),
    render: (_, r) => {
      const shown = shortInvoiceNumber(r.number);
      return (
        <div className="whitespace-nowrap">
          {shown === r.number ? (
            <span className={`${REF} font-semibold text-slate-900`}>{r.number || "—"}</span>
          ) : (
            <Tooltip title={r.number}>
              <span className={`${REF} font-semibold text-slate-900`} aria-label={r.number}>
                {shown}
              </span>
            </Tooltip>
          )}
          {r.creditNoteNumbers.length > 0 && (
            <Tooltip title={`Credit notes: ${r.creditNoteNumbers.join(", ")}`}>
              <div className="text-[11px] text-slate-500">+{r.creditNoteNumbers.length} CN</div>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  { title: "Status", key: "status", width: LIST_WIDTHS.status, render: (_, r) => <StatusCell r={r} /> },
  {
    title: "Customer",
    key: "customer",
    width: LIST_WIDTHS.customer,
    sorter: (a, b) => a.customer.localeCompare(b.customer),
    render: (_, r) =>
      r.customer ? (
        <span className="block truncate font-medium text-slate-900" style={inner(LIST_WIDTHS.customer)} title={r.customer}>
          {r.customer}
        </span>
      ) : (
        none
      ),
  },
  {
    title: "Job",
    key: "job",
    width: LIST_WIDTHS.job,
    sorter: (a, b) => a.jobNumber.localeCompare(b.jobNumber),
    render: (_, r) =>
      r.shipmentId ? (
        <Link href={shipmentHref(r.shipmentId)} className={`${REF} whitespace-nowrap ${LINK}`} onClick={(e) => e.stopPropagation()}>
          {r.jobNumber || "Job"}
        </Link>
      ) : (
        <span className={REF}>{r.jobNumber || "—"}</span>
      ),
  },
  {
    title: "Due",
    key: "due",
    width: LIST_WIDTHS.due,
    sorter: (a, b) => cmp(a.dueDate, b.dueDate),
    render: (_, r) =>
      r.status === "cancelled" ? (
        none
      ) : (
        <div className="whitespace-nowrap">
          <span className="tabular-nums">{formatDate(r.dueDate)}</span>
          {r.daysOverdue > 0 && (
            <Tooltip title="Past its due day, by the day in Prague">
              <div className="text-[11px] font-medium text-red-600">
                {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue
              </div>
            </Tooltip>
          )}
        </div>
      ),
  },
  {
    // On two lines: a title in one line made the column wider than its amounts.
    title: (
      <>
        Amount
        <br />
        with VAT
      </>
    ),
    key: "gross",
    width: LIST_WIDTHS.gross,
    align: "right",
    sorter: (a, b) => a.gross - b.gross,
    render: (_, r) => amount(r.gross, r.currency),
  },
  {
    title: "Left to pay",
    key: "left",
    width: LIST_WIDTHS.left,
    align: "right",
    sorter: (a, b) => a.leftToPay - b.leftToPay,
    render: (_, r) =>
      r.status === "cancelled" && r.leftToPay === 0 ? (
        none
      ) : (
        <span className={r.leftToPay < 0 ? "text-amber-700" : ""}>{amount(r.leftToPay, r.currency, r.leftToPay > 0)}</span>
      ),
  },
  { title: "Currency", key: "currency", width: LIST_WIDTHS.currency, sorter: (a, b) => a.currency.localeCompare(b.currency), render: (_, r) => <span className="tabular-nums">{r.currency}</span> },
  {
    title: "Paid",
    key: "paid",
    sorter: (a, b) => cmp(a.lastPaidOn, b.lastPaidOn),
    render: (_, r) =>
      r.paid > 0 ? (
        <Tooltip title="Paid by the customer, as noted by a manager">
          <div className="whitespace-nowrap">
            {amount(r.paid, r.currency)}
            <div className="text-[11px] text-slate-500 tabular-nums">{r.lastPaidOn ? formatDate(r.lastPaidOn) : "day not known"}</div>
          </div>
        </Tooltip>
      ) : (
        none
      ),
  },
  { title: "Issued", key: "issued", sorter: (a, b) => cmp(a.issueDate, b.issueDate), render: (_, r) => day(r.issueDate) },
  { title: "DUZP", key: "duzp", sorter: (a, b) => cmp(a.duzp, b.duzp), render: (_, r) => day(r.duzp) },
  {
    title: "Amount in CZK",
    key: "czk",
    align: "right",
    sorter: (a, b) => a.grossCzk - b.grossCzk,
    render: (_, r) => (
      <Tooltip title="With VAT, as the invoice states it in CZK (the ČNB rate of its tax date): not converted here">
        {amount(r.grossCzk, "CZK")}
      </Tooltip>
    ),
  },
  { title: "Credited", key: "credited", align: "right", sorter: (a, b) => a.credited - b.credited, render: (_, r) => (r.credited ? amount(r.credited, r.currency) : none) },
  { title: "Sales Owner", key: "salesOwner", sorter: (a, b) => a.salesOwner.localeCompare(b.salesOwner), render: (_, r) => text(r.salesOwner) },
  {
    title: "Person in Charge",
    key: "pic",
    sorter: (a, b) => a.personInCharge.localeCompare(b.personInCharge),
    render: (_, r) => (
      <div>
        {person(r.personInCharge)}
        {r.holidayCover && (
          <div className="text-[11px] text-slate-500 max-w-[220px] truncate">
            Holiday Cover: <PersonName email={r.holidayCover} />
          </div>
        )}
      </div>
    ),
  },
  { title: "Issued by", key: "issuedBy", sorter: (a, b) => a.issuedBy.localeCompare(b.issuedBy), render: (_, r) => person(r.issuedBy) },
  { title: "Payment terms", key: "terms", render: (_, r) => text(r.paymentTerms) },
  {
    title: "Last reminder",
    key: "reminder",
    sorter: (a, b) => cmp(a.lastRemindedOn, b.lastRemindedOn),
    render: (_, r) =>
      r.reminderLevel > 0 ? (
        <div className="whitespace-nowrap">
          {REMINDER_LEVEL_LABEL[Math.min(r.reminderLevel, 3) as 1 | 2 | 3]}
          <div className="text-[11px] text-slate-500 tabular-nums">{formatDate(r.lastRemindedOn)}</div>
        </div>
      ) : (
        none
      ),
  },
  { title: "Aging", key: "aging", render: (_, r) => (r.agingBucket ? <span className="whitespace-nowrap">{AGING_LABEL[r.agingBucket]}</span> : none) },
];

/** The row opened: its lines, credit notes and the job's people, read from the invoice itself. */
function RowDetail({ r }: { r: ReceivableRow }) {
  const query = useReceivable(r.id);
  const detail = query.data;
  if (query.isLoading) return <Spin size="small" />;
  if (!detail) return <div className={HINT}>Could not load the invoice: {apiErrorMessage(query.error)}</div>;
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-slate-700 px-2">
      <div>
        {detail.lines.length ? detail.lines.map((l) => `${l.description || "Line"} ${amountText(l.net, r.currency)}`).join(" · ") : "No lines."}
        {r.vat ? ` · VAT ${amountText(r.vat, r.currency)}` : ""}
      </div>
      {detail.creditNotes.length > 0 && (
        <div>
          {detail.creditNotes.map((c) => (
            <div key={c.id}>
              Credit note <span className={REF}>{c.number}</span> · {formatDate(c.issueDate)} · {amountText(c.gross, r.currency)}
              {c.full ? " · the whole invoice" : ""}
              {c.reason && ` · “${c.reason}”`}
            </div>
          ))}
        </div>
      )}
      <div className={HINT}>
        Person in Charge: {r.personInCharge ? <PersonName email={r.personInCharge} /> : "—"}
        {r.holidayCover && (
          <>
            {" · Holiday Cover: "}
            <PersonName email={r.holidayCover} />
          </>
        )}{" "}
        · Sales Owner: {r.salesOwner || "—"}
      </div>
    </div>
  );
}

interface ReceivablesTableProps {
  rows: ReceivableRow[] | undefined;
  loading: boolean;
  emptyText: string;
  resetKey: string;
  /** The columns the user shows (Columns), in table order */
  visible: string[];
  onOpen: (invoiceId: string) => void;
  /**
   * The tick boxes of one payment over several invoices (step 7): given only for a manager on Unpaid and Overdue. Only
   * an invoice still owed can be ticked.
   */
  selection?: { keys: string[]; onChange: (keys: string[]) => void };
}

export function ReceivablesTable({ rows, loading, emptyText, resetKey, visible, onOpen, selection }: ReceivablesTableProps) {
  return (
    <DataTable<ReceivableRow>
      resizeKey="accounts-receivable:invoices"
      dataSource={rows}
      columns={shownColumns(columns, visible)}
      rowKey="id"
      loading={loading}
      scroll={{ x: "max-content" }}
      resetKey={resetKey}
      locale={{ emptyText }}
      expandable={{ expandedRowRender: (r) => <RowDetail r={r} />, columnWidth: LIST_EXPAND_WIDTH }}
      rowSelection={
        selection
          ? {
              selectedRowKeys: selection.keys,
              onChange: (keys) => selection.onChange(keys.map(String)),
              preserveSelectedRowKeys: true,
              getCheckboxProps: (r) => ({ disabled: !batchSelectable(r), "aria-label": `Tick ${r.number} for one payment` }),
              fixed: true,
              columnWidth: LIST_TICK_WIDTH,
            }
          : undefined
      }
      onRow={(r) => ({
        // The expand arrow and the links stop their own clicks, the tick box ticks the row; anywhere else opens the invoice.
        onClick: (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest(".ant-table-selection-column")) return;
          onOpen(r.id);
        },
        className: "cursor-pointer",
      })}
    />
  );
}
