"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCustomerInvoices, type InvoiceItem } from "@/hooks/useCustomerInvoices";
import { useCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtMoney, INVOICE_STATUSES } from "../../_lib/constants";

export function FinanceTab({ customerId }: { customerId: string }) {
  const { invoices, isLoading, createInvoice, updateInvoice, deleteInvoice } = useCustomerInvoices(customerId);
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceItem | null>(null);
  const [form] = Form.useForm();

  const openTotal = invoices
    .filter((i) => i.status === "Open")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const overdueTotal = invoices
    .filter((i) => i.status === "Overdue")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await createInvoice(values);
      toast.success("Invoice added");
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to add invoice");
    }
  };

  const markPaid = async (record: InvoiceItem) => {
    try {
      await updateInvoice({ id: record.id, params: { status: "Paid" } });
      toast.success("Marked paid");
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  const dash = <span className="text-slate-300">—</span>;

  const columns: ColumnsType<InvoiceItem> = [
    {
      title: "Invoice #",
      dataIndex: "invoiceNumber",
      render: (v: string) => <span className="font-mono text-xs text-indigo-500">{v}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (_: unknown, record: InvoiceItem) => <StatusBadge status={record.status} />,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      align: "right",
      render: (_: unknown, record: InvoiceItem) => fmtMoney(record.amount),
    },
    {
      title: "Issued",
      dataIndex: "issuedAt",
      render: (v: string) => v || dash,
    },
    {
      title: "Due",
      dataIndex: "dueDate",
      render: (v: string) => v || dash,
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_: unknown, record: InvoiceItem) => (
        <div className="flex items-center justify-end gap-1">
          {record.status !== "Paid" && (
            <Button type="text" size="small" onClick={() => markPaid(record)}>
              Mark paid
            </Button>
          )}
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setDeleteTarget(record)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Open Invoices</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(openTotal)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Overdue</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(overdueTotal)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Credit Limit</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(customer?.creditLimit ?? 0)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Total Turnover</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(customer?.totalRevenue ?? 0)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Invoices</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Invoice
        </Button>
      </div>

      <Table<InvoiceItem>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={invoices}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No invoices yet" }}
      />

      <Modal
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={submit}
        title="Add Invoice"
        okText="Add"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ status: "Open", amount: 0 }} className="pt-2">
          <Form.Item
            name="invoiceNumber"
            label="Invoice #"
            rules={[{ required: true, message: "Invoice number is required" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Amount">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={INVOICE_STATUSES.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="issuedAt" label="Issued">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="dueDate" label="Due">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteInvoice(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Invoice removed");
        }}
        title="Remove invoice"
        description={`Remove ${deleteTarget?.invoiceNumber}?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
