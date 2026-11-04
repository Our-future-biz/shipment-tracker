"use client";

import Link from "next/link";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import type { interfaces } from "@/lib/api/client";
import { useHaulierInvoices } from "@/hooks/useTruckingMoney";
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { TruckingStatusChip } from "@/app/trucking/_components/TruckingStatusChip";
import { INVOICE_STATUS_CHIP } from "@/app/trucking/_lib/haulierInvoices";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface CustomerHaulierInvoicesCardProps {
  customerId: string;
}

// What we owe a haulier: its invoices to us as Trucking has them (entered, matched, approved, blocked),
// with the day each approved one was paid once Trucking notes it (Council Outlay 7, step 6b).
export function CustomerHaulierInvoicesCard({ customerId }: CustomerHaulierInvoicesCardProps) {
  const { invoices, isLoading, isError } = useHaulierInvoices({ haulierCustomerId: customerId });

  const columns: ColumnsType<interfaces.HaulierInvoice> = [
    {
      title: "Invoice",
      dataIndex: "invoiceNumber",
      render: (v: string, r) => (
        <Link href={`/trucking/haulier-invoices/${r.id}`} className="font-medium text-indigo-600 hover:underline">
          {v || EMPTY_CELL}
        </Link>
      ),
    },
    { title: "Status", dataIndex: "status", render: (v: interfaces.HaulierInvoiceStatus) => <TruckingStatusChip chip={INVOICE_STATUS_CHIP[v]} /> },
    { title: "Issued", dataIndex: "issueDate", render: (v: string) => formatDate(v) || EMPTY_CELL },
    { title: "Due", dataIndex: "dueDate", render: (v: string | null) => formatDate(v) || EMPTY_CELL },
    { title: "Total", dataIndex: "totalGross", align: "right", render: (v: number, r) => <span className="tabular-nums">{fmtMoney(v, r.currency)}</span> },
    { title: "Paid", key: "paid", render: (_, r) => (r.payment ? formatDate(r.payment.paidOn) : r.status === "APPROVED" ? <span className="text-amber-700">Not yet</span> : EMPTY_CELL) },
  ];

  return (
    <SectionCard title="What we owe · haulier invoices" extra={<span className="text-xs text-slate-400">Approved, not yet paid, is what we owe</span>}>
      {isError ? (
        <span className="text-xs text-red-600">The haulier invoices could not be read.</span>
      ) : (
        <Table<interfaces.HaulierInvoice>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={invoices}
          columns={columns}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: "No invoices from this haulier yet." }}
        />
      )}
    </SectionCard>
  );
}
