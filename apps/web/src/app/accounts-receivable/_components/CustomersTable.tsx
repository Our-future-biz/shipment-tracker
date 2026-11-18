"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { shownColumns } from "@/lib/tableModel";
import { EMPTY, LINK } from "@/styles/ui";
import { amountText, customerHref, isOverLimit, overLimitTip } from "../_lib/receivables";
import type { CustomerRow } from "../_lib/receivableColumns";
import { StatementMenu } from "./StatementMenu";

// By customer (D7): one row per customer and currency with something left to pay, by age, never converted; the mark
// "Over limit" when what the customer owes in all, converted at today's rates, is above its credit limit. A click sets
// the customer filter and opens Unpaid. Each row has its Statement (step 7): the PDF or CSV of that customer in that
// currency, and for managers "Send by e-mail".

const none = <span className={EMPTY}>—</span>;
const figure = (v: number, currency: string, strong = false) =>
  v ? <span className={`tabular-nums whitespace-nowrap ${strong ? "font-semibold text-slate-900" : ""}`}>{amountText(v, currency)}</span> : none;

function columnsFor(fixingLabel: string): ColumnsType<CustomerRow> {
  const bucket = (title: string, key: "current" | "d1to30" | "d31to60" | "d61to90" | "d90plus", red = false) => ({
    title,
    key,
    align: "right" as const,
    sorter: (a: CustomerRow, b: CustomerRow) => a[key] - b[key],
    render: (_: unknown, c: CustomerRow) => <span className={red && c[key] ? "text-red-600" : ""}>{figure(c[key], c.currency)}</span>,
  });
  return [
    {
      title: "Customer",
      key: "customer",
      sorter: (a, b) => a.customer.localeCompare(b.customer),
      render: (_, c) => (
        <div className="flex flex-wrap items-center gap-1.5 max-w-[300px]">
          <Link href={customerHref(c.customerId)} className={`font-medium truncate ${LINK}`} title={c.customer} onClick={(e) => e.stopPropagation()}>
            {c.customer || "—"}
          </Link>
          {isOverLimit(c.limit ?? undefined) && c.limit && (
            <Tooltip title={overLimitTip(c.limit, fixingLabel)}>
              <Pill tone="red">Over limit</Pill>
            </Tooltip>
          )}
        </div>
      ),
    },
    { title: "Sales Owner", key: "salesOwner", sorter: (a, b) => a.salesOwner.localeCompare(b.salesOwner), render: (_, c) => (c.salesOwner ? <span className="block max-w-[200px] truncate">{c.salesOwner}</span> : none) },
    { title: "Currency", key: "currency", sorter: (a, b) => a.currency.localeCompare(b.currency), render: (_, c) => <span className="tabular-nums">{c.currency}</span> },
    { title: "Unpaid", key: "unpaid", align: "right", sorter: (a, b) => a.unpaid - b.unpaid, render: (_, c) => figure(c.unpaid, c.currency, true) },
    bucket("Current", "current"),
    bucket("1–30", "d1to30", true),
    bucket("31–60", "d31to60", true),
    bucket("61–90", "d61to90", true),
    bucket("90+", "d90plus", true),
    {
      title: "Oldest due",
      key: "oldestDue",
      sorter: (a, b) => (a.oldestDue ?? "").localeCompare(b.oldestDue ?? ""),
      render: (_, c) => (c.oldestDue ? <span className="tabular-nums whitespace-nowrap">{formatDate(c.oldestDue)}</span> : none),
    },
    { title: "Invoices", key: "invoices", align: "right", sorter: (a, b) => a.invoices - b.invoices, render: (_, c) => <span className="tabular-nums">{c.invoices}</span> },
  ];
}

interface CustomersTableProps {
  rows: CustomerRow[] | undefined;
  loading: boolean;
  emptyText: string;
  resetKey: string;
  visible: string[];
  /** The rates' fixing named in the Over limit tooltip */
  fixingLabel: string;
  /** A manager: the Statement menu offers "Send by e-mail" */
  canSend: boolean;
  onOpen: (customerId: string) => void;
}

/** Always shown, last: not a figure to pick in Columns, but what can be done with the row. */
const statementColumn = (canSend: boolean): ColumnsType<CustomerRow>[number] => ({
  title: "Statement",
  key: "statement",
  render: (_, c) => <StatementMenu customerId={c.customerId} customer={c.customer} currency={c.currency} canSend={canSend} />,
});

export function CustomersTable({ rows, loading, emptyText, resetKey, visible, fixingLabel, canSend, onOpen }: CustomersTableProps) {
  return (
    <DataTable<CustomerRow>
      resizeKey="accounts-receivable:customers"
      dataSource={rows}
      columns={[...shownColumns(columnsFor(fixingLabel), visible), statementColumn(canSend)]}
      rowKey="key"
      loading={loading}
      scroll={{ x: "max-content" }}
      resetKey={resetKey}
      locale={{ emptyText }}
      onRow={(c) => ({ onClick: () => onOpen(c.customerId), className: "cursor-pointer" })}
    />
  );
}
