"use client";

import { useState } from "react";
import { Button, Form, Input, Drawer, Table, Tabs, Typography, Dropdown } from "antd";
import { PlusOutlined, MoreOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useQuotes } from "@/hooks/useQuotes";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { AppModal } from "@/components/AppModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";
import type { ColumnsType } from "antd/es/table";

type QuoteItem = interfaces.QuoteItem;
const { TextArea } = Input;
const { Text } = Typography;

export const QuotesView = () => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuoteItem | null>(null);
  const [searchText, setSearchText] = useState("");
  const [form] = Form.useForm();
  const { quotes, isLoading, createQuote, deleteQuote, isCreating } = useQuotes();
  const toast = useToast();

  const handleCreate = async (values: { quoteNumber: string }) => {
    await createQuote({ quoteNumber: values.quoteNumber });
    setCreateModalOpen(false);
    form.resetFields();
    toast.success("Quote created");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteQuote(deleteTarget.quoteNumber);
    setDeleteTarget(null);
    toast.success("Quote deleted");
  };

  const filteredQuotes = quotes.filter((q) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return q.quoteNumber.toLowerCase().includes(s) || (q.terms || "").toLowerCase().includes(s);
  });

  const columns: ColumnsType<QuoteItem> = [
    {
      title: "Quote #",
      dataIndex: "quoteNumber",
      key: "quoteNumber",
      width: 180,
      render: (text: string) => (
        <span className="text-indigo-500 font-semibold font-mono cursor-pointer">{text}</span>
      ),
      onCell: (record) => ({
        onClick: () => setSelectedQuote(record),
      }),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (val: string) => val ? new Date(val).toLocaleDateString() : "\u2014",
    },
    {
      title: "Terms Preview",
      dataIndex: "terms",
      key: "terms",
      ellipsis: true,
      render: (val: string) => (
        <span className="text-slate-500">{val || "No terms"}</span>
      ),
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
              { key: "view", icon: <EyeOutlined />, label: "View", onClick: () => setSelectedQuote(record) },
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
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          title="Quotes"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              + New Quote
            </Button>
          }
        />

        <AppCard>
          <div className="mb-4">
            <Input
              placeholder="Search quotes..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="max-w-xs rounded-lg"
              allowClear
            />
          </div>
          <Table
            dataSource={filteredQuotes}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            className="border border-slate-200 rounded-lg overflow-hidden"
            onRow={(record) => ({
              style: { cursor: "pointer" },
              onClick: () => setSelectedQuote(record),
            })}
            locale={{ emptyText: "No quotes yet" }}
          />
        </AppCard>

        <AppModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="New Quote"
          size="small"
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
              <Button type="primary" onClick={() => form.submit()} loading={isCreating}>Create</Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="quoteNumber" label="Quote Number" rules={[{ required: true }]}>
              <Input placeholder="CZQ00000001" />
            </Form.Item>
          </Form>
        </AppModal>

        <ConfirmModal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Quote"
          description={`Are you sure you want to delete quote "${deleteTarget?.quoteNumber}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
        />

        <Drawer
          title={selectedQuote?.quoteNumber ?? ""}
          open={!!selectedQuote}
          onClose={() => setSelectedQuote(null)}
          width={560}
          destroyOnClose
        >
          {selectedQuote && <QuoteDetail quote={selectedQuote} />}
        </Drawer>
      </div>
    </div>
  );
};

const QuoteDetail = ({ quote }: { quote: QuoteItem }) => {
  const [terms, setTerms] = useState(quote.terms ?? "");
  const queryClient = useQueryClient();
  const toast = useToast();
  const saveMutation = useMutation({
    mutationFn: () => api.quotes.quoteUpdate(quote.quoteNumber, { terms }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Terms saved");
    },
  });
  const quoteData = (typeof quote.data === "object" && quote.data) ? quote.data as Record<string, string> : {};

  return (
    <div>
      <Tabs
        size="small"
        items={[
          {
            key: "details",
            label: "Details",
            children: (
              <div>
                {Object.entries(quoteData).length > 0 ? (
                  Object.entries(quoteData).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex gap-2 text-xs py-1.5 border-b border-slate-200"
                    >
                      <span className="text-slate-500 w-40 shrink-0 font-medium">{key}</span>
                      <span className="text-slate-800">{String(val)}</span>
                    </div>
                  ))
                ) : (
                  <Text type="secondary" className="text-xs">No data fields yet</Text>
                )}
              </div>
            ),
          },
          {
            key: "terms",
            label: "Terms",
            children: (
              <div className="flex flex-col gap-3">
                <TextArea
                  rows={12}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter quote terms..."
                  className="text-xs"
                />
                <Button
                  size="small"
                  type="primary"
                  onClick={() => saveMutation.mutate()}
                  loading={saveMutation.isPending}
                >
                  Save Terms
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};
