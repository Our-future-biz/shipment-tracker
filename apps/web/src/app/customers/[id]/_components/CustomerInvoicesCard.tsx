"use client";

import { useState } from "react";
import { Button, Table, Tag } from "antd";
import { CheckOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { INVOICE_STATUS_COLORS } from "../../_lib/constants";
import { daysOverdue, effectiveStatus, isPaid } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { CustomerCountChip } from "./CustomerCountChip";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface CustomerInvoicesCardProps {
  customerId: string;
  currency: string;
}

// The one list of the customer's invoices: mark as paid, delete. Invoices are not created here.
export function CustomerInvoicesCard({ customerId, currency }: CustomerInvoicesCardProps) {
  const toast = useToast();
  const { invoices, isLoading, isError, updateInvoice, deleteInvoice } = useCustomerInvoices(customerId);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleMarkPaid = async (invoice: InvoiceItem) => {
    setPayingId(invoice.id);
    try {
      await updateInvoice({ id: invoice.id, params: { status: "Paid" } });
      toast.success(`Invoice ${invoice.invoiceNumber} marked as paid`);
    } catch {
      toast.error("Failed to update the invoice");
    } finally {
      setPayingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice(deleteTarget.id);
      toast.success("Invoice deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete the invoice");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<InvoiceItem> = [
    {
      title: "Invoice #",
      dataIndex: "invoiceNumber",
      render: (v: string) => <span className="font-mono font-semibold text-slate-800">{v}</span>,
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      render: (_: unknown, invoice) => {
        const status = effectiveStatus(invoice);
        return (
          <Tag color={INVOICE_STATUS_COLORS[status] ?? "default"} className="!m-0">
            {status}
          </Tag>
        );
      },
    },
    { title: "Amount", dataIndex: "amount", align: "right", render: (v: number) => fmtMoney(v, currency) },
    { title: "Issued", dataIndex: "issuedAt", render: (v: string) => formatDate(v) || EMPTY_CELL },
    { title: "Due", dataIndex: "dueDate", render: (v: string) => formatDate(v) || EMPTY_CELL },
    {
      title: "Days overdue",
      key: "daysOverdue",
      align: "right",
      render: (_: unknown, invoice) => {
        const days = daysOverdue(invoice);
        return days > 0 ? <span className="font-semibold text-red-600">{days}</span> : EMPTY_CELL;
      },
    },
    {
      title: "",
      key: "actions",
      width: 150,
      render: (_: unknown, invoice) => (
        <div className="flex justify-end gap-1">
          {!isPaid(invoice) && (
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              loading={payingId === invoice.id}
              // One update at a time keeps the row spinner truthful.
              disabled={payingId !== null && payingId !== invoice.id}
              onClick={() => handleMarkPaid(invoice)}
            >
              Mark paid
            </Button>
          )}
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete invoice ${invoice.invoiceNumber}`}
            onClick={() => setDeleteTarget(invoice)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <SectionCard
        title="Invoices"
        bodyClassName="p-2"
        extra={<CustomerCountChip count={invoices.length} />}
      >
        <Table<InvoiceItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={invoices}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: isError ? "Could not load invoices." : "No invoices yet" }}
        />
      </SectionCard>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete invoice"
        description={deleteTarget ? `Delete invoice ${deleteTarget.invoiceNumber}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}
