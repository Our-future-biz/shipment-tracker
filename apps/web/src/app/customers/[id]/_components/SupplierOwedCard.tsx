"use client";

import Link from "next/link";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useSupplierCosts } from "@/hooks/useSupplierCosts";
import { useHaulierInvoices } from "@/hooks/useTruckingMoney";
import { chargeLabel } from "@/lib/chargeCodes";
import { businessToday, formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { supplierOwed, type OwedItem } from "../../_lib/supplierOwed";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface SupplierOwedCardProps {
  customer: CustomerItem;
  /** Count a haulier's approved Trucking invoices too (only for those who see the Trucking Concept, E12). */
  withHaulierInvoices: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// What we owe a supplier (Council Outlay 7, step 6b): the invoices received and not paid, per currency,
// with what is overdue, from the shipments' Costs Breakdown lines linked to it and, for a haulier, its
// approved Trucking invoices; what is expected (no invoice yet) apart. Lines that only name it as typed
// text are named, not counted. Everyone who sees the supplier's page sees it; nothing is netted.
export function SupplierOwedCard({ customer, withHaulierInvoices }: SupplierOwedCardProps) {
  const costs = useSupplierCosts(customer.id);
  const haulier = useHaulierInvoices(
    { haulierCustomerId: customer.id },
    { enabled: withHaulierInvoices },
  );
  const paymentDays = customer.supplierTerms.paymentDays;
  const owed = supplierOwed(
    costs.lines,
    withHaulierInvoices ? haulier.invoices : [],
    paymentDays,
    businessToday(),
  );
  const loading = costs.isLoading || (withHaulierInvoices && haulier.isLoading);

  const refColumn = {
    title: "Job",
    key: "ref",
    render: (_: unknown, r: OwedItem) => (
      <Link
        href={r.href}
        className={`${r.source === "cost" ? "font-mono" : ""} font-semibold text-indigo-600 hover:underline whitespace-nowrap`}
      >
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
        {r.category && r.description && (
          <span className="block text-[11px] text-slate-500">{r.description}</span>
        )}
      </span>
    ),
  };
  const amountColumn = (title: string) => ({
    title,
    key: "amount",
    align: "right" as const,
    render: (_: unknown, r: OwedItem) =>
      r.amount === null ? (
        <span className="text-xs text-amber-700">No real cost typed</span>
      ) : (
        <span className="tabular-nums whitespace-nowrap">{fmtMoney(r.amount, r.currency)}</span>
      ),
  });

  const owedColumns: ColumnsType<OwedItem> = [
    refColumn,
    chargeColumn,
    { title: "Invoice", dataIndex: "invoiceNumber", render: (v: string) => v || EMPTY_CELL },
    {
      title: "Received",
      dataIndex: "receivedOn",
      render: (v: string) => formatDate(v) || EMPTY_CELL,
    },
    {
      title: "Due",
      key: "due",
      render: (_, r) =>
        !r.dueOn ? (
          <span className="text-slate-400">Not known</span>
        ) : (
          <span className="whitespace-nowrap">
            {formatDate(r.dueOn)}
            {r.overdueDays > 0 && (
              <span className="block text-[11px] font-medium text-red-600">
                {plural(r.overdueDays, "day", "days")} overdue
              </span>
            )}
          </span>
        ),
    },
    amountColumn("Amount"),
  ];
  const expectedColumns: ColumnsType<OwedItem> = [
    refColumn,
    chargeColumn,
    amountColumn("Expected"),
  ];

  return (
    <SectionCard
      title="What we owe"
      extra={
        <span className="text-xs text-slate-400">
          Received and not paid · per currency, not converted
        </span>
      }
    >
      {costs.isError ? (
        <span className="text-xs text-red-600">The shipment costs could not be read.</span>
      ) : (
        <div className="space-y-4">
          {!loading && (
            <div className="flex flex-wrap gap-3">
              {owed.totals.length === 0 ? (
                <span className="text-sm text-slate-500">Nothing owed and nothing expected.</span>
              ) : (
                owed.totals.map((t) => (
                  <div
                    key={t.currency}
                    className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Owed · {t.currency}
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-slate-800">
                      {fmtMoney(t.owed, t.currency)}
                    </div>
                    {t.overdue > 0 && (
                      <div className="text-xs font-medium tabular-nums text-red-600">
                        {fmtMoney(t.overdue, t.currency)} overdue
                      </div>
                    )}
                    {t.expected > 0 && (
                      <div className="text-xs tabular-nums text-slate-500">
                        {fmtMoney(t.expected, t.currency)} expected
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {(owed.withoutAmount > 0 ||
            owed.dueUnknown > 0 ||
            (withHaulierInvoices && haulier.isError)) && (
            <ul className="space-y-0.5 text-xs text-amber-700">
              {owed.withoutAmount > 0 && (
                <li>
                  {plural(owed.withoutAmount, "received line has", "received lines have")} no real
                  cost typed: not in the total.
                </li>
              )}
              {owed.dueUnknown > 0 &&
                (paymentDays === null ? (
                  <li>The payment days are not set (Terms and checks): due days are not known.</li>
                ) : (
                  <li>
                    {plural(owed.dueUnknown, "line was", "lines were")} received before the received
                    day was kept: its due day is not known.
                  </li>
                ))}
              {withHaulierInvoices && haulier.isError && (
                <li>The Trucking haulier invoices could not be read: they are not in the total.</li>
              )}
            </ul>
          )}

          {(loading || owed.totals.length > 0 || owed.owed.length > 0) && (
            <Table<OwedItem>
              size="small"
              rowKey="key"
              loading={loading}
              dataSource={owed.owed}
              columns={owedColumns}
              pagination={TABLE_PAGINATION}
              rowClassName={(r) => (r.overdueDays > 0 ? "bg-red-50/60" : "")}
              locale={{ emptyText: "No received invoice is waiting to be paid." }}
            />
          )}

          {owed.expected.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">
                Expected · {plural(owed.expected.length, "cost", "costs")} with no invoice received
                yet (not in what we owe)
              </div>
              <Table<OwedItem>
                size="small"
                rowKey="key"
                dataSource={owed.expected}
                columns={expectedColumns}
                pagination={TABLE_PAGINATION}
              />
            </div>
          )}

          {costs.typedNames.length > 0 && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Not counted:{" "}
              {costs.typedNames.map((n, i) => (
                <span key={n.vendor}>
                  {i > 0 && ", "}
                  {plural(n.lines, "cost line names", "cost lines name")} “{n.vendor}” as text
                </span>
              ))}
              , not linked to this company. Pick it as the vendor on those lines in Costs Breakdown
              to count them here.
            </div>
          )}
          {costs.truncated && (
            <div className="text-xs text-slate-500">
              Only the newest 500 open cost lines are shown.
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
