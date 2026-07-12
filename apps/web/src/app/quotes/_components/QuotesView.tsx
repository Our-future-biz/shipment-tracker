"use client";

import { useState } from "react";
import { Button, Input, Dropdown } from "antd";
import { PlusOutlined, MoreOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useQuotes } from "@/hooks/useQuotes";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";
import { QUOTE_COLUMNS, quoteColWidth, quoteField } from "../_lib/quoteColumns";
import { QuoteEditableCell } from "./QuoteEditableCell";
import { QuoteDetailModal } from "./QuoteDetailModal";
import { NewQuoteModal } from "./NewQuoteModal";

type QuoteItem = interfaces.QuoteItem;

export const QuotesView = () => {
  const { quotes, isLoading, updateQuote, deleteQuote } = useQuotes();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuoteItem | null>(null);
  const [search, setSearch] = useState("");

  const commitField = (quote: QuoteItem, label: string, value: string) => {
    const data = quote.data && typeof quote.data === "object" ? (quote.data as Record<string, unknown>) : {};
    updateQuote({ quoteNumber: quote.quoteNumber, params: { data: { ...data, [label]: value } } }).catch(() =>
      toast.error("Failed to save"),
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteQuote(deleteTarget.quoteNumber);
    setDeleteTarget(null);
    toast.success("Quote deleted");
  };

  const filtered = quotes.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    if (q.quoteNumber.toLowerCase().includes(s)) return true;
    const data = q.data && typeof q.data === "object" ? (q.data as Record<string, unknown>) : {};
    return Object.values(data).some((v) => typeof v === "string" && v.toLowerCase().includes(s));
  });

  const columns: ColumnsType<QuoteItem> = [
    {
      title: "Quote #",
      dataIndex: "quoteNumber",
      fixed: "left",
      width: 150,
      render: (text: string) => (
        <span className="text-indigo-500 font-semibold font-mono cursor-pointer" onClick={() => setSelected(text)}>
          {text}
        </span>
      ),
    },
    ...QUOTE_COLUMNS.map((label) => ({
      title: label,
      key: label,
      width: quoteColWidth(label),
      render: (_: unknown, record: QuoteItem) => (
        <QuoteEditableCell column={label} value={quoteField(record.data, label)} onCommit={(v) => commitField(record, label, v)} />
      ),
    })),
    {
      title: "Created",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => (v ? new Date(v).toLocaleDateString("en-GB") : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, record: QuoteItem) => (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "view", icon: <EyeOutlined />, label: "Open", onClick: () => setSelected(record.quoteNumber) },
              { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => setDeleteTarget(record) },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <PageHeader
          title="Quotes"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewQuoteOpen(true)}>
              New Quote
            </Button>
          }
        />

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <Input
            placeholder="Search quotes..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-60"
          />
          <span className="text-xs text-slate-400">Double-click a cell to edit</span>
        </div>

        <DataTable<QuoteItem>
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No quotes yet" }}
          resetKey={search}
        />

        <ConfirmModal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Quote"
          description={`Delete quote "${deleteTarget?.quoteNumber}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
        />

        <NewQuoteModal
          open={newQuoteOpen}
          onClose={() => setNewQuoteOpen(false)}
          onCreated={(qn) => { setNewQuoteOpen(false); setSelected(qn); }}
        />

        <QuoteDetailModal quoteNumber={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
};
