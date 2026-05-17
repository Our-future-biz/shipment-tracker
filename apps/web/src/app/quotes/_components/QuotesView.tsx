"use client";

import { useState } from "react";
import { Button, Modal, Form, Input, Drawer, Popconfirm, message, Tabs, Typography } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuotes } from "@/hooks/useQuotes";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { interfaces } from "@/lib/api/client";

type QuoteItem = interfaces.QuoteItem;
const { TextArea } = Input;
const { Text } = Typography;

export const QuotesView = () => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteItem | null>(null);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const { quotes, isLoading, createQuote, deleteQuote, isCreating } = useQuotes();

  const handleCreate = async (values: { quoteNumber: string }) => {
    await createQuote({ quoteNumber: values.quoteNumber });
    setCreateModalOpen(false); form.resetFields(); messageApi.success("Quote created");
  };

  const handleDelete = async (quoteNumber: string) => {
    await deleteQuote(quoteNumber); messageApi.success("Quote deleted");
  };

  return (
    <div className="h-full flex flex-col">
      {contextHolder}
      <div className="flex-none flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">Quotes ({quotes.length})</span>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setCreateModalOpen(true)}>New Quote</Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div> : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[160px]">Quote Number</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[120px]">Created</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider">Terms Preview</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors cursor-pointer" style={{ height: 32 }} onClick={() => setSelectedQuote(quote)}>
                  <td className="px-3 font-mono text-teal-600 dark:text-teal-400 font-medium">{quote.quoteNumber}</td>
                  <td className="px-3 text-gray-600 dark:text-gray-400">{quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : "—"}</td>
                  <td className="px-3 text-gray-500 dark:text-gray-500 truncate max-w-[300px]">{quote.terms || "No terms"}</td>
                  <td className="px-2"><Popconfirm title="Delete?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(quote.quoteNumber); }} okType="danger"><button onClick={(e) => e.stopPropagation()} className="text-gray-300 hover:text-red-500 transition-colors"><DeleteOutlined style={{ fontSize: 10 }} /></button></Popconfirm></td>
                </tr>
              ))}
              {quotes.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">No quotes yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Modal title="New Quote" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={() => form.submit()} confirmLoading={isCreating} width={360}>
        <Form form={form} layout="vertical" onFinish={handleCreate} size="small">
          <Form.Item name="quoteNumber" label="Quote Number" rules={[{ required: true }]}><Input placeholder="CZQ00000001" /></Form.Item>
        </Form>
      </Modal>
      <Drawer title={selectedQuote?.quoteNumber ?? ""} open={!!selectedQuote} onClose={() => setSelectedQuote(null)} width={560} destroyOnClose>
        {selectedQuote && <QuoteDetail quote={selectedQuote} />}
      </Drawer>
    </div>
  );
};

const QuoteDetail = ({ quote }: { quote: QuoteItem }) => {
  const [terms, setTerms] = useState(quote.terms ?? "");
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();
  const saveMutation = useMutation({ mutationFn: () => api.quotes.quoteUpdate(quote.quoteNumber, { terms }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); messageApi.success("Terms saved"); } });
  const quoteData = (typeof quote.data === "object" && quote.data) ? quote.data as Record<string, string> : {};
  return (
    <div>{contextHolder}
      <Tabs size="small" items={[
        { key: "details", label: "Details", children: <div className="space-y-1">{Object.entries(quoteData).length > 0 ? Object.entries(quoteData).map(([key, val]) => (<div key={key} className="flex gap-2 text-[11px] py-1 border-b border-gray-100 dark:border-gray-800"><span className="text-gray-500 w-40 flex-none font-medium">{key}</span><span className="text-gray-800 dark:text-gray-200">{String(val)}</span></div>)) : <Text type="secondary" className="text-xs">No data fields yet</Text>}</div> },
        { key: "terms", label: "Terms", children: <div className="space-y-3"><TextArea rows={12} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter quote terms..." className="!text-xs" /><Button size="small" type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save Terms</Button></div> },
      ]} />
    </div>
  );
};
