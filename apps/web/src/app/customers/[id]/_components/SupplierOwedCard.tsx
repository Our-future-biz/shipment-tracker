"use client";

import Link from "next/link";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { KPI_TILE_CLASS } from "@/components/KpiTile";
import { SectionCard } from "@/components/SectionCard";
import { KPI_VALUE, LABEL_TEXT, LINK } from "@/styles/ui";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useSupplierCosts } from "@/hooks/useSupplierCosts";
import { chargeLabel } from "@/lib/chargeCodes";
import { businessDayOf, formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { supplierOwed, type OwedFigures, type OwedItem, type OwedTotal } from "../../_lib/supplierOwed";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

// The server says whether a haulier's Trucking invoices are included: only for those who see the Trucking
// Concept (E12; Council Review 5, C-1).
interface SupplierOwedCardProps {
  customer: CustomerItem;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const VAT_LABEL = { without: "without VAT", with: "with VAT" } as const;
// A haulier invoice's day is its issue day (yyyy-mm-dd), a cost line's the moment it was received.
const dayOf = (r: OwedItem) => formatDate(r.source === "cost" ? businessDayOf(r.receivedAt) : r.receivedAt);

// What we owe a supplier (Council Outlay 7, step 6b; Council Review 5): the invoices received and not paid,
// per currency, with what is overdue, from the shipments' Costs Breakdown lines linked to it and, for a
// haulier, its approved Trucking invoices (read by the server, for those who see the Trucking Concept); what
// is expected (no invoice yet) and what came before payments were noted here, each apart and not counted.
// Lines that only name it as typed text are named, not counted. Everyone who sees the supplier's page sees
// it; nothing is netted or converted, and figures without VAT are never added to those with it.
export function SupplierOwedCard({ customer }: SupplierOwedCardProps) {
  const { costs, isLoading, isError } = useSupplierCosts(customer.id);
  const owed = supplierOwed(costs);
  const withInvoices = owed.haulierInvoices === "included";
  // A haulier whose Trucking invoices this user does not see: what is shown is the shipment costs only (E-10).
  const invoicesLeftOut = owed.haulierInvoices === "hidden";
  const nothing = !isLoading && !owed.owed.length && !owed.expected.length && !owed.untracked.length;

  const refColumn = {
    title: "Job",
    key: "ref",
    render: (_: unknown, r: OwedItem) => (
      <Link href={r.href} className={`${r.source === "cost" ? "tabular-nums" : ""} font-semibold whitespace-nowrap ${LINK}`}>
        {r.ref}
      </Link>
    ),
  };
  const chargeColumn = {
    title: "Charge",
    key: "charge",
    render: (_: unknown, r: OwedItem) => (
      <span>
        {r.category ? chargeLabel(r.category) : r.description}
        {r.category && r.description && <span className="block text-[11px] text-slate-500">{r.description}</span>}
      </span>
    ),
  };
  const invoiceColumn = { title: "Invoice", dataIndex: "invoiceNumber", render: (v: string) => v || EMPTY_CELL };
  const amountColumn = (title: string) => ({
    title,
    key: "amount",
    align: "right" as const,
    render: (_: unknown, r: OwedItem) =>
      r.amount === null ? (
        <span className="text-xs text-amber-700">No real cost typed</span>
      ) : (
        <span className="whitespace-nowrap tabular-nums">
          {fmtMoney(r.amount, r.currency)}
          <span className="block text-[11px] text-slate-400">{VAT_LABEL[r.vat]}</span>
        </span>
      ),
  });

  const owedColumns: ColumnsType<OwedItem> = [
    refColumn,
    chargeColumn,
    invoiceColumn,
    { title: "Received", key: "received", render: (_, r) => dayOf(r) || EMPTY_CELL },
    {
      title: "Due",
      key: "due",
      render: (_, r) =>
        !r.dueOn ? (
          <span className="text-slate-400">Not known</span>
        ) : (
          <span className="whitespace-nowrap">
            {formatDate(r.dueOn)}
            {r.overdueDays > 0 && <span className="block text-[11px] font-medium text-red-600">{plural(r.overdueDays, "day", "days")} overdue</span>}
          </span>
        ),
    },
    amountColumn("Amount"),
  ];
  const expectedColumns: ColumnsType<OwedItem> = [refColumn, chargeColumn, amountColumn("Expected")];
  const untrackedColumns: ColumnsType<OwedItem> = [refColumn, chargeColumn, invoiceColumn, amountColumn("Amount")];

  // "Showing 300 of 412": the lists are the most urgent (or newest); the totals cover all.
  const shownOf = (shown: number, all: number) => (all > shown ? ` · the first ${shown} of ${all}` : "");

  return (
    <SectionCard title="What we owe">
      {isError ? (
        <span className="text-xs text-red-600">The shipment costs could not be read.</span>
      ) : (
        <div className="space-y-4">
          <p className="m-0 text-xs text-slate-500">
            Received and not paid, per currency and never converted. Shipment costs are as typed in Costs Breakdown (without VAT){withInvoices ? ", haulier invoices with VAT" : ""}.
          </p>

          {nothing && <span className="text-sm text-slate-500">{invoicesLeftOut ? "Nothing owed and nothing expected on the shipment costs." : "Nothing owed and nothing expected."}</span>}
          {invoicesLeftOut && <div className="text-xs text-slate-500">Trucking&apos;s haulier invoices are not included here.</div>}
          {owed.totals.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {owed.totals.map((t) => (
                <OwedTile key={t.currency} total={t} />
              ))}
            </div>
          )}

          {(owed.withoutAmount > 0 || owed.costsDueUnknown > 0 || owed.invoicesDueUnknown > 0 || owed.haulierInvoices === "unavailable") && (
            <ul className="m-0 space-y-0.5 pl-4 text-xs text-amber-700">
              {owed.withoutAmount > 0 && <li>{plural(owed.withoutAmount, "received cost line has", "received cost lines have")} no real cost typed: not in the total.</li>}
              {owed.costsDueUnknown > 0 && <li>The payment days are not set (Terms and checks): due days of the shipment costs are not known.</li>}
              {owed.invoicesDueUnknown > 0 && <li>{plural(owed.invoicesDueUnknown, "haulier invoice has", "haulier invoices have")} no due day in Trucking.</li>}
              {owed.haulierInvoices === "unavailable" && <li>The Trucking haulier invoices could not be read: they are not in the total.</li>}
            </ul>
          )}

          {(isLoading || owed.owed.length > 0) && (
            <div className="min-w-0">
              <div className={`${LABEL_TEXT} mb-1`}>
                Owed · most overdue first{shownOf(owed.owed.length, owed.counts.owed)}
              </div>
              <Table<OwedItem>
                size="small"
                rowKey="key"
                loading={isLoading}
                dataSource={owed.owed}
                columns={owedColumns}
                pagination={TABLE_PAGINATION}
                scroll={{ x: "max-content" }}
                rowClassName={(r) => (r.overdueDays > 0 ? "bg-red-50/60" : "")}
              />
            </div>
          )}

          {owed.expected.length > 0 && (
            <div className="min-w-0">
              <div className={`${LABEL_TEXT} mb-1`}>
                Expected · {plural(owed.counts.expected, "cost", "costs")} with no invoice received yet, not in what we owe{shownOf(owed.expected.length, owed.counts.expected)}
              </div>
              <Table<OwedItem> size="small" rowKey="key" dataSource={owed.expected} columns={expectedColumns} pagination={TABLE_PAGINATION} scroll={{ x: "max-content" }} />
            </div>
          )}

          {owed.untracked.length > 0 && (
            <div className="min-w-0">
              <div className={`${LABEL_TEXT} mb-1`}>
                Before payment tracking · {plural(owed.counts.untracked, "invoice", "invoices")} received or approved before payments were noted here, not counted
                {shownOf(owed.untracked.length, owed.counts.untracked)}
              </div>
              <p className="m-0 mb-1 text-[11px] text-slate-500">
                They may have been paid already. Mark the ones that were paid in Costs Breakdown or Trucking, and they leave this list.
              </p>
              <Table<OwedItem> size="small" rowKey="key" dataSource={owed.untracked} columns={untrackedColumns} pagination={TABLE_PAGINATION} scroll={{ x: "max-content" }} />
            </div>
          )}

          {costs.typedNames.length > 0 && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Not counted:{" "}
              {costs.typedNames.map((n, i) => (
                <span key={n.vendor}>
                  {i > 0 && ", "}
                  {plural(n.lines, "cost line names", "cost lines name")} “{n.vendor}” as text
                </span>
              ))}
              , not linked to this company. Pick it as the vendor on those lines in Costs Breakdown to count them here.
            </div>
          )}
          {owed.invoicesTruncated && <div className="text-xs text-slate-500">This haulier has more than 10,000 unpaid Trucking invoices: the latest due are left out of the totals.</div>}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * One currency: what is owed and how much of it is overdue, the shipment costs (without VAT) and the haulier
 * invoices (with VAT) each on its own and never added (C-9), and what stays apart.
 */
function OwedTile({ total: t }: { total: OwedTotal }) {
  return (
    <div className={`${KPI_TILE_CLASS} !min-w-[200px] space-y-1.5`}>
      <div className={LABEL_TEXT}>Owed · {t.currency}</div>
      {t.costs && <OwedFigure figures={t.costs} currency={t.currency} label="Shipment costs, without VAT" />}
      {t.invoices && <OwedFigure figures={t.invoices} currency={t.currency} label="Haulier invoices, with VAT" />}
      {t.costs && t.costs.expected > 0 && <div className="text-xs text-slate-500 tabular-nums">{fmtMoney(t.costs.expected, t.currency)} expected, without VAT</div>}
    </div>
  );
}

function OwedFigure({ figures: f, currency, label }: { figures: OwedFigures; currency: string; label: string }) {
  return (
    <div>
      <div className={KPI_VALUE}>{fmtMoney(f.owed, currency)}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
      {f.overdue > 0 && <div className="text-xs font-medium text-red-600 tabular-nums">{fmtMoney(f.overdue, currency)} overdue</div>}
      {f.untracked > 0 && <div className="text-xs text-slate-400 tabular-nums">{fmtMoney(f.untracked, currency)} before payment tracking</div>}
    </div>
  );
}
