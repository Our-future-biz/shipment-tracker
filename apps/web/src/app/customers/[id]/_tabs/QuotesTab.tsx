"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { computeTotals, validityInfo, fmt, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "@/app/sales/_lib/types";

// Customers only carry sales quotes (the QCZ… lifecycle quotes from the Sales
// module); creating one here opens the full quote workflow prefilled with this
// customer.
export function QuotesTab({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { salesQuotes, isLoading, createQuote, isCreating, deleteQuote } = useSalesQuotes();
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const rows = useMemo(
    () => salesQuotes.filter((q) => q.data.customerId === customerId),
    [salesQuotes, customerId],
  );

  const newQuote = async () => {
    if (!customer) return;
    try {
      const ref = await createQuote({
        customerId,
        customerName: customer.companyName,
        customerLabel: customer.label,
      });
      toast.success(`Quote ${ref} created`);
      router.push(`/sales/quote/${ref}`);
    } catch {
      toast.error("Failed to create quote");
    }
  };

  const columns: ColumnsType<SalesQuote> = [
    { title: "Reference", dataIndex: "quoteNumber", width: 170, render: (v: string) => <span className="font-mono text-xs text-indigo-500">{v}</span> },
    {
      title: "Status",
      key: "status",
      width: 120,
      render: (_: unknown, r) => {
        const s = QUOTE_STATUS_MAP[r.data.quoteStatus ?? ""];
        return s ? (
          <span className="rounded-xl text-[11px] font-medium px-2.5 py-0.5" style={{ backgroundColor: s.color.bg, color: s.color.text }}>
            {s.label}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
    },
    { title: "Service", key: "svc", width: 110, render: (_: unknown, r) => r.data.serviceType || <span className="text-slate-300">—</span> },
    {
      title: "Route",
      key: "route",
      width: 180,
      render: (_: unknown, r) =>
        r.data.origin || r.data.destination ? (
          <span className="text-slate-600">
            {r.data.origin || "—"} <span className="text-slate-300">→</span> {r.data.destination || "—"}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      title: "Valid until",
      key: "valid",
      width: 130,
      render: (_: unknown, r) => {
        const v = validityInfo(r.data);
        if (!v.date) return <span className="text-slate-300">—</span>;
        return <span className={v.expired ? "text-red-600" : "text-slate-600"}>{v.date}{v.expired ? " (expired)" : ""}</span>;
      },
    },
    {
      title: "Selling",
      key: "selling",
      width: 130,
      align: "right",
      render: (_: unknown, r) => {
        const t = computeTotals(r.data);
        return t.selling ? fmt(t.selling, r.data.currency) : <span className="text-slate-300">—</span>;
      },
    },
    { title: "Created", dataIndex: "createdAt", width: 110, render: (v: string) => v?.slice(0, 10) ?? "—" },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(r.quoteNumber);
          }}
        />
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Quotes</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} loading={isCreating} onClick={newQuote}>
          New Quote
        </Button>
      </div>

      <Table<SalesQuote>
        size="small"
        rowKey="quoteNumber"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No quotes for this customer yet" }}
        onRow={(record) => ({ onClick: () => router.push(`/sales/quote/${record.quoteNumber}`), className: "cursor-pointer" })}
      />

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
