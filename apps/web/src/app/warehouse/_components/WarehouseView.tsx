"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Dropdown } from "antd";
import { PlusOutlined, DeleteOutlined, MoreOutlined, SearchOutlined } from "@ant-design/icons";
import { useWarehouse } from "@/hooks/useWarehouse";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import type { controllers, interfaces } from "@/lib/api/client";
import type { ColumnsType } from "antd/es/table";
import { WAREHOUSE_TYPES } from "./WarehouseTaskDetail";

type WarehouseTaskItem = interfaces.WarehouseTaskItem;

export const WarehouseView = () => {
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating } = useWarehouse();
  const toast = useToast();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<WarehouseTaskItem | null>(null);
  const [searchText, setSearchText] = useState("");

  const handleCreate = async () => {
    // Next WHCZ2026### from the highest existing number (survives deletes).
    let max = 0;
    for (const t of tasks) {
      const m = /WHCZ2026(\d+)/.exec(t.taskId);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    const res = await createTask({ taskId: `WHCZ2026${String(max + 1).padStart(3, "0")}` });
    toast.success("Task created");
    router.push(`/warehouse/${res.task.id}`);
  };

  const handleUpdate = async (taskId: string, field: string, value: string) => {
    await updateTask({ id: taskId, data: { [field]: value } as controllers.WarehouseUpdateRequest });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteTask(deleteTarget.id);
    setDeleteTarget(null);
    toast.success("Task deleted");
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return t.taskId.toLowerCase().includes(s) || t.assignee.toLowerCase().includes(s) || t.cargo.toLowerCase().includes(s);
  });

  const columns: ColumnsType<WarehouseTaskItem> = [
    {
      title: "Task ID",
      dataIndex: "taskId",
      key: "taskId",
      width: 140,
      render: (text: string, record: WarehouseTaskItem) => (
        <span className="text-indigo-500 font-semibold font-mono cursor-pointer" onClick={() => router.push(`/warehouse/${record.id}`)}>{text}</span>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 110,
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineSelect value={val} options={WAREHOUSE_TYPES} onChange={(v) => handleUpdate(record.id, "type", v)} />
      ),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      width: 100,
      render: (val: string) => <StatusBadge status={val} />,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (val: string) => <StatusBadge status={val} />,
    },
    {
      title: "Assignee",
      dataIndex: "assignee",
      key: "assignee",
      width: 140,
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineInput value={val} onChange={(v) => handleUpdate(record.id, "assignee", v)} />
      ),
    },
    {
      title: "Due Date",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 120,
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineInput value={val} onChange={(v) => handleUpdate(record.id, "dueDate", v)} placeholder="DD.MM.YYYY" />
      ),
    },
    {
      title: "Cargo",
      dataIndex: "cargo",
      key: "cargo",
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineInput value={val} onChange={(v) => handleUpdate(record.id, "cargo", v)} />
      ),
    },
    {
      title: "Weight",
      dataIndex: "weight",
      key: "weight",
      width: 100,
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineInput value={val} onChange={(v) => handleUpdate(record.id, "weight", v)} />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, record: WarehouseTaskItem) => (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
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
          title="Warehouse"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={isCreating}>
              New Task
            </Button>
          }
        />

        {/* Filter bar */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <Input
            placeholder="Search tasks..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            className="w-60"
          />
        </div>

        <DataTable<WarehouseTaskItem>
          dataSource={filteredTasks}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No warehouse tasks" }}
          resetKey={searchText}
        />

        <ConfirmModal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Task"
          description={`Are you sure you want to delete task "${deleteTarget?.taskId}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
        />
      </div>
    </div>
  );
};

const InlineInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => {
  const [local, setLocal] = useState(value);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder || "\u2014"}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full bg-transparent border-none text-xs text-slate-700 px-1 py-1 rounded outline-none"
    />
  );
};

const InlineSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-transparent border-none text-xs text-slate-700 px-1 py-1 rounded outline-none cursor-pointer"
  >
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);
