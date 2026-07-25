"use client";

import { useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { useQuotes } from "@/hooks/useQuotes";
import { useCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fmtMoney } from "../../_lib/constants";

type QuoteRow = { quoteNumber: string; data: Record<string, unknown> };

const asData = (d: unknown): Record<string, unknown> =>
  d && typeof d === "object" ? (d as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const numOf = (v: unknown) => (typeof v === "number" ? v : parseFloat(str(v)) || 0);

const STATUS_TAG: Record<string, string> = { Pending: "gold", Won: "green", Lost: "red" };

export function QuotesTab({ customerId }: { customerId: string }) {
  const { quotes, isLoading, createQuote, updateQuote, deleteQuote } = useQuotes();
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const rows = useMemo<QuoteRow[]>(
    () =>
      quotes
        .map((q) => ({ quoteNumber: q.quoteNumber, data: asData(q.data) }))
        .filter((q) => q.data.customerId === customerId),
    [quotes, customerId],
  );

  const setStatus = async (quoteNumber: string, data: Record<string, unknown>, status: string) => {
    await updateQuote({ quoteNumber, params: { data: { ...data, status } } });
    toast.success(`Quote marked ${status}`);
  };

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const { ref } = await api.quotes.quoteNextRef();
      await createQuote({
        quoteNumber: ref,
        data: {
          customerId,
          customerName: customer?.companyName ?? "",
          status: v.status || "Pending",
          validUntil: v.validUntil ?? "",
          revenue: v.revenue ?? 0,
          description: v.description ?? "",
        },
      });
      toast.success(`Quote ${ref} created`);
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to create quote");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<QuoteRow> = [
    { title: "Reference", dataIndex: "quoteNumber", width: 170, render: (v: string) => <span className="font-mono text-xs text-indigo-500">{v}</span> },
    {
      title: "Status",
      key: "status",
      width: 100,
      render: (_: unknown, r) => {
        const s = str(r.data.status) || "Pending";
        return <Tag color={STATUS_TAG[s] ?? "default"}>{s}</Tag>;
      },
    },
    { title: "Valid until", key: "valid", width: 120, render: (_: unknown, r) => str(r.data.validUntil) || <span className="text-slate-300">—</span> },
    { title: "Revenue", key: "rev", width: 130, align: "right", render: (_: unknown, r) => fmtMoney(numOf(r.data.revenue)) },
    { title: "Description", key: "desc", render: (_: unknown, r) => str(r.data.description) || <span className="text-slate-300">—</span> },
    {
      title: "",
      key: "actions",
      width: 160,
      render: (_: unknown, r) => {
        const s = str(r.data.status) || "Pending";
        return (
          <div className="flex items-center gap-1 justify-end">
            {s === "Pending" && (
              <>
                <Button size="small" type="text" className="text-green-600" onClick={() => setStatus(r.quoteNumber, r.data, "Won")}>
                  Won
                </Button>
                <Button size="small" type="text" danger onClick={() => setStatus(r.quoteNumber, r.data, "Lost")}>
                  Lost
                </Button>
              </>
            )}
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(r.quoteNumber)} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Quotes</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          New Quote
        </Button>
      </div>

      <Table<QuoteRow>
        size="small"
        rowKey="quoteNumber"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No quotes for this customer yet" }}
      />

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={submit} confirmLoading={saving} title="New Quote" okText="Create" destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ status: "Pending", revenue: 0 }} className="pt-2">
          <Form.Item name="status" label="Status">
            <Select options={["Pending", "Won", "Lost"].map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="validUntil" label="Valid until">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="revenue" label="Revenue">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteQuote(deleteTarget);
          setDeleteTarget(null);
          toast.success("Quote deleted");
        }}
        title="Delete quote"
        description={`Delete quote ${deleteTarget}?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
