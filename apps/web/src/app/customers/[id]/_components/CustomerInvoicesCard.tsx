"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Table, Tooltip } from "antd";
import { CheckOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { ChipList } from "@/components/finance/ChipList";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerInvoices, useCustomerOwed } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { ReceivableItem } from "@/hooks/useReceivables";
import { arInvoiceHref, markChips, statusLabel, statusTitle, statusTone } from "@/lib/accountsReceivable";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { HINT, REF } from "@/styles/ui";
import { daysOverdue, effectiveStatus, isSettled, leftToPayText, typedStatusMark } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { CustomerCountChip } from "./CustomerCountChip";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface CustomerInvoicesCardProps {
  customerId: string;
  currency: string;
  // The business day (Prague) a typed row's due day is compared with.
  today: string;
}

const overdueText = (days: number) => `${days} day${days === 1 ? "" : "s"} overdue`;

// The customer's invoices (D19): the ones issued in Invoicing, with the same words and links as Finance → Accounts
// Receivable, where their payments are noted; and, apart, the rows typed by hand into the customer's list, which only
// a manager marks paid or deletes (D9). Invoices are not created here.
export function CustomerInvoicesCard({ customerId, currency, today }: CustomerInvoicesCardProps) {
  const toast = useToast();
  const { ledger, canAct, isLoading, isError } = useCustomerOwed(customerId);
  const { updateInvoice, deleteInvoice } = useCustomerInvoices(customerId);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { issued, typed } = ledger;

  // A refusal says why (an invoice issued in Invoicing, a user who is not a manager): its words are shown.
  const handleMarkPaid = async (invoice: InvoiceItem) => {
    setPayingId(invoice.id);
    try {
      await updateInvoice({ id: invoice.id, params: { status: "Paid" } });
      toast.success(`Invoice ${invoice.invoiceNumber} marked as paid`);
    } catch (err) {
      toast.error(`Invoice ${invoice.invoiceNumber} was not marked as paid: ${apiErrorMessage(err)}`);
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
    } catch (err) {
      toast.error(`Invoice ${deleteTarget.invoiceNumber} was not deleted: ${apiErrorMessage(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const issuedColumns: ColumnsType<ReceivableItem> = [
    {
      title: "Invoice #",
      dataIndex: "number",
      render: (v: string, r) => (
        <Tooltip title="Open on Accounts Receivable">
          <Link href={arInvoiceHref(r.id)} className={`${REF} font-semibold text-indigo-600 hover:text-indigo-700 hover:underline`}>
            {v}
          </Link>
        </Tooltip>
      ),
    },
    { title: "Job", dataIndex: "jobNumber", render: (v: string) => (v ? <span className={REF}>{v}</span> : EMPTY_CELL) },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, r) => (
        <div className="flex flex-wrap items-center gap-1">
          <Tooltip title={statusTitle(r.status)}>
            <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
          </Tooltip>
          {/* The days overdue are said in the Due column. */}
          <ChipList chips={markChips(r).filter((c) => c.key !== "overdue")} empty={false} />
        </div>
      ),
    },
    // Each invoice in its own currency, never converted.
    { title: "Amount", dataIndex: "gross", align: "right", render: (v: number, r) => fmtMoney(v, r.currency) },
    {
      title: "Left to pay",
      dataIndex: "leftToPay",
      align: "right",
      // Below 0 (credited or paid beyond the amount): what is to be refunded, as Accounts Receivable's drawer says it.
      render: (v: number, r) =>
        v === 0 ? EMPTY_CELL : <span className={r.marks.includes("overdue") ? "font-semibold text-red-600" : "font-semibold text-slate-900"}>{leftToPayText(v, r.currency)}</span>,
    },
    { title: "Issued", dataIndex: "issueDate", render: (v: string) => formatDate(v) || EMPTY_CELL },
    {
      title: "Due",
      dataIndex: "dueDate",
      render: (v: string, r) => (
        <div className="whitespace-nowrap">
          {formatDate(v) || EMPTY_CELL}
          {/* Counted by the server, by the day in Prague. */}
          {r.marks.includes("overdue") && <div className="text-[12px] font-semibold text-red-600">{overdueText(r.daysOverdue)}</div>}
        </div>
      ),
    },
  ];

  const typedColumns: ColumnsType<InvoiceItem> = [
    {
      title: "Invoice #",
      dataIndex: "invoiceNumber",
      render: (v: string) => <span className="tabular-nums font-semibold text-slate-900">{v}</span>,
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      // In Accounts Receivable's words: the stored "Open" is shown as "Unpaid".
      render: (_: unknown, invoice) => {
        const mark = typedStatusMark(effectiveStatus(invoice, today));
        return <Pill tone={mark.tone}>{mark.label}</Pill>;
      },
    },
    { title: "Amount", dataIndex: "amount", align: "right", render: (v: number, r) => fmtMoney(v, r.currency || currency) },
    { title: "Issued", dataIndex: "issuedAt", render: (v: string) => formatDate(v) || EMPTY_CELL },
    { title: "Due", dataIndex: "dueDate", render: (v: string) => formatDate(v) || EMPTY_CELL },
    {
      title: "Days overdue",
      key: "daysOverdue",
      align: "right",
      render: (_: unknown, invoice) => {
        const days = daysOverdue(invoice, today);
        return days > 0 ? <span className="font-semibold text-red-600">{days}</span> : EMPTY_CELL;
      },
    },
    ...(canAct
      ? [
          {
            title: "",
            key: "actions",
            width: 150,
            render: (_: unknown, invoice: InvoiceItem) => (
              <div className="flex justify-end gap-1">
                {!isSettled(invoice) && (
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
        ]
      : []),
  ];

  return (
    <>
      <SectionCard title="Invoices" bodyClassName="p-2" extra={<CustomerCountChip count={issued.length} />}>
        <p className={`m-0 px-2 pt-1 pb-2 ${HINT}`}>
          Issued in Invoicing. A payment is noted on Finance → Accounts Receivable: open an invoice there.
        </p>
        <Table<ReceivableItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={isError ? [] : [...issued]}
          columns={issuedColumns}
          scroll={{ x: "max-content" }}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: isError ? "Could not load invoices." : "No invoices issued yet" }}
        />
      </SectionCard>

      {!isError && typed.length > 0 && (
        <SectionCard title="Entered by hand" bodyClassName="p-2" extra={<CustomerCountChip count={typed.length} />}>
          <p className={`m-0 px-2 pt-1 pb-2 ${HINT}`}>
            Typed into the customer&apos;s list, not issued in Invoicing.{" "}
            {canAct ? "Only a manager marks one paid or deletes it." : "Only a manager can mark one paid or delete it."}
          </p>
          <Table<InvoiceItem>
            size="small"
            rowKey="id"
            dataSource={[...typed]}
            columns={typedColumns}
            scroll={{ x: "max-content" }}
            pagination={TABLE_PAGINATION}
          />
        </SectionCard>
      )}

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
