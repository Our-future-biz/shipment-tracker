"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Button, Modal, Form, Input, Select, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, CheckOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useSalesPref } from "@/hooks/useSalesPrefs";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { needsFollowUp, daysOpen, validityInfo, type SalesQuote } from "../_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "../_lib/types";

interface FollowUpTask {
  id: string;
  company: string;
  contact: string;
  type: string; // Call / Email / Visit
  due: string;
  status: string; // overdue / upcoming / done
  note: string;
}

const TASK_TYPES = ["Call", "Email", "Visit"];
const TASK_STATUSES = ["upcoming", "overdue", "done"];
const STATUS_COLOR: Record<string, string> = { overdue: "red", upcoming: "gold", done: "green" };

export function FollowUpTab() {
  const router = useRouter();
  const { salesQuotes, isLoading } = useSalesQuotes();
  const { value: tasks, setValue: setTasks } = useSalesPref<FollowUpTask[]>("followup_tasks", []);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FollowUpTask | null>(null);
  const [form] = Form.useForm();

  const pending = useMemo(() => salesQuotes.filter((q) => needsFollowUp(q.data)), [salesQuotes]);

  const addTask = async () => {
    const v = await form.validateFields();
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(tasks.length + 1);
    await setTasks([...tasks, { id, ...v }]);
    toast.success("Task added");
    form.resetFields();
    setAddOpen(false);
  };
  const toggleDone = (t: FollowUpTask) =>
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, status: x.status === "done" ? "upcoming" : "done" } : x)));
  const removeTask = (id: string) => setTasks(tasks.filter((x) => x.id !== id));

  const quoteColumns: ColumnsType<SalesQuote> = [
    { title: "Reference", dataIndex: "quoteNumber", width: 160, render: (v: string) => <span className="font-mono text-xs text-indigo-500">{v}</span> },
    { title: "Customer", key: "cust", render: (_: unknown, r) => r.data.customerName || <span className="text-slate-300">—</span> },
    {
      title: "Route",
      key: "route",
      render: (_: unknown, r) => (
        <span className="text-slate-600">
          {r.data.origin || "—"} <span className="text-slate-300">→</span> {r.data.destination || "—"}
        </span>
      ),
    },
    { title: "Service", key: "svc", width: 110, render: (_: unknown, r) => r.data.serviceType || "—" },
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
          "—"
        );
      },
    },
    {
      title: "Days open",
      key: "days",
      width: 110,
      render: (_: unknown, r) => {
        const d = daysOpen(r.data);
        return (
          <span className="inline-flex items-center gap-1.5">
            {d ?? "—"}
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">Follow up</span>
          </span>
        );
      },
    },
    {
      title: "Validity",
      key: "valid",
      width: 120,
      render: (_: unknown, r) => {
        const v = validityInfo(r.data);
        if (!v.date) return <span className="text-slate-300">—</span>;
        return <span className={v.expired ? "text-red-600" : "text-slate-600"}>{v.date}{v.expired ? " (expired)" : ""}</span>;
      },
    },
  ];

  const taskColumns: ColumnsType<FollowUpTask> = [
    { title: "Company", dataIndex: "company", render: (v: string) => <span className="font-medium text-slate-700">{v}</span> },
    { title: "Contact", dataIndex: "contact", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Type", dataIndex: "type", width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: "Due", dataIndex: "due", width: 120, render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <Tag color={STATUS_COLOR[v] ?? "default"}>{v}</Tag> },
    { title: "Note", dataIndex: "note", render: (v: string) => v || <span className="text-slate-300">—</span> },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" icon={<CheckOutlined className={r.status === "done" ? "text-green-500" : "text-slate-400"} />} onClick={() => toggleDone(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-800">Quotes awaiting follow-up</span>
          <span className="text-xs text-slate-400">Quoted or in feedback for 3+ days</span>
        </div>
        <Table<SalesQuote>
          size="small"
          rowKey="quoteNumber"
          loading={isLoading}
          dataSource={pending}
          columns={quoteColumns}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "Nothing needs a follow-up right now" }}
          onRow={(record) => ({ onClick: () => router.push(`/sales/quote/${record.quoteNumber}`), className: "cursor-pointer" })}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-800">Manual follow-up tasks</span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add Task
          </Button>
        </div>
        <Table<FollowUpTask>
          size="small"
          rowKey="id"
          dataSource={tasks}
          columns={taskColumns}
          pagination={false}
          locale={{ emptyText: "No manual tasks" }}
        />
      </div>

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={addTask} title="Add Follow-up Task" okText="Add" destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ type: "Call", status: "upcoming" }} className="pt-2">
          <Form.Item name="company" label="Company" rules={[{ required: true, message: "Company is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="Contact">
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="type" label="Type">
              <Select options={TASK_TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={TASK_STATUSES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
          </div>
          <Form.Item name="due" label="Due">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) removeTask(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Task removed");
        }}
        title="Remove task"
        description={`Remove follow-up task for ${deleteTarget?.company}?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
