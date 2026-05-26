"use client";

import { useState } from "react";
import { Button, Table, Dropdown } from "antd";
import { PlusOutlined, DeleteOutlined, MoreOutlined } from "@ant-design/icons";
import { useWarehouse } from "@/hooks/useWarehouse";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { toast } from "@/lib/toast";
import type { controllers, interfaces } from "@/lib/api/client";
import type { ColumnsType } from "antd/es/table";

type WarehouseTaskItem = interfaces.WarehouseTaskItem;

const TYPES = ["Import", "Export", "Customs"];

export const WarehouseView = () => {
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating } = useWarehouse();
  const [deleteTarget, setDeleteTarget] = useState<WarehouseTaskItem | null>(null);
  const [searchText, setSearchText] = useState("");

  const handleCreate = async () => {
    const num = tasks.length + 1;
    await createTask({ taskId: `WHCZ2026${String(num).padStart(3, "0")}` });
    toast.success("Task created");
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
      render: (text: string) => (
        <span style={{ color: "#6366f1", fontWeight: 600, fontFamily: "monospace" }}>{text}</span>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 110,
      render: (val: string, record: WarehouseTaskItem) => (
        <InlineSelect value={val} options={TYPES} onChange={(v) => handleUpdate(record.id, "type", v)} />
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
    <div style={{ background: "#f8fafc", minHeight: "100%", padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader
          title="Warehouse"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={isCreating}>
              + New Task
            </Button>
          }
        />

        <AppCard>
          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="Search tasks..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                maxWidth: 320,
                width: "100%",
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                color: "#334155",
                outline: "none",
                background: "#fff",
              }}
            />
          </div>
          <Table
            dataSource={filteredTasks}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}
            locale={{ emptyText: "No warehouse tasks" }}
          />
        </AppCard>

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
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        fontSize: 12,
        color: "#334155",
        padding: "4px 4px",
        borderRadius: 4,
        outline: "none",
      }}
    />
  );
};

const InlineSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      background: "transparent",
      border: "none",
      fontSize: 12,
      color: "#334155",
      padding: "4px 4px",
      borderRadius: 4,
      outline: "none",
      cursor: "pointer",
    }}
  >
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);
