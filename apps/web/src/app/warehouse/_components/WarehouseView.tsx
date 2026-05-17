"use client";

import { useState } from "react";
import { Button, Popconfirm, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { controllers, interfaces } from "@/lib/api/client";

type WarehouseTaskItem = interfaces.WarehouseTaskItem;

const TYPES = ["Import", "Export", "Customs"];
const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = { High: { bg: "rgba(239,68,68,0.12)", color: "#f87171" }, Medium: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" }, Low: { bg: "rgba(96,165,250,0.12)", color: "#60a5fa" } };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = { Completed: { bg: "rgba(34,197,94,0.12)", color: "#4ade80" }, "In Progress": { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" }, Pending: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" } };

export const WarehouseView = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating } = useWarehouse();

  const handleCreate = async () => { const num = tasks.length + 1; await createTask({ taskId: `WHCZ2026${String(num).padStart(3, "0")}` }); messageApi.success("Task created"); };
  const handleUpdate = async (taskId: string, field: string, value: string) => { await updateTask({ id: taskId, data: { [field]: value } as controllers.WarehouseUpdateRequest }); };
  const handleDelete = async (taskId: string) => { await deleteTask(taskId); messageApi.success("Task deleted"); };

  return (
    <div className="h-full flex flex-col">
      {contextHolder}
      <div className="flex-none flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">Warehouse Tasks ({tasks.length})</span>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleCreate} loading={isCreating}>New Task</Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div> : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[130px]">Task ID</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[100px]">Type</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[90px]">Priority</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[110px]">Status</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[130px]">Assignee</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[110px]">Due Date</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider">Cargo</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider w-[100px]">Weight</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => <WarehouseRow key={task.id} task={task} onUpdate={(field, value) => handleUpdate(task.id, field, value)} onDelete={() => handleDelete(task.id)} />)}
              {tasks.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-gray-400">No warehouse tasks</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const WarehouseRow = ({ task, onUpdate, onDelete }: { task: WarehouseTaskItem; onUpdate: (field: string, value: string) => void; onDelete: () => void }) => {
  const pStyle = PRIORITY_STYLE[task.priority] || { bg: "rgba(96,165,250,0.12)", color: "#60a5fa" };
  const sStyle = STATUS_STYLE[task.status] || { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" };
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors" style={{ height: 32 }}>
      <td className="px-2 font-mono text-teal-600 dark:text-teal-400 font-medium">{task.taskId}</td>
      <td className="px-1"><InlineSelect value={task.type} options={TYPES} onChange={(v) => onUpdate("type", v)} /></td>
      <td className="px-1"><span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: pStyle.bg, color: pStyle.color }}>{task.priority}</span></td>
      <td className="px-1"><span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: sStyle.bg, color: sStyle.color }}>{task.status}</span></td>
      <td className="px-1"><InlineInput value={task.assignee} onChange={(v) => onUpdate("assignee", v)} /></td>
      <td className="px-1"><InlineInput value={task.dueDate} onChange={(v) => onUpdate("dueDate", v)} placeholder="DD.MM.YYYY" /></td>
      <td className="px-1"><InlineInput value={task.cargo} onChange={(v) => onUpdate("cargo", v)} /></td>
      <td className="px-1"><InlineInput value={task.weight} onChange={(v) => onUpdate("weight", v)} /></td>
      <td className="px-1"><Popconfirm title="Delete?" onConfirm={onDelete} okType="danger"><button className="text-gray-300 hover:text-red-500 transition-colors"><DeleteOutlined style={{ fontSize: 10 }} /></button></Popconfirm></td>
    </tr>
  );
};

const InlineInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => {
  const [local, setLocal] = useState(value);
  return <input type="text" value={local} placeholder={placeholder || "—"} onChange={(e) => setLocal(e.target.value)} onBlur={() => { if (local !== value) onChange(local); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="w-full bg-transparent border-none text-[11px] text-gray-700 dark:text-gray-300 px-1 py-1 rounded focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800 focus:ring-1 focus:ring-teal-500/50 placeholder:text-gray-300 dark:placeholder:text-gray-600" />;
};

const InlineSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent border-none text-[11px] text-gray-700 dark:text-gray-300 px-1 py-1 rounded focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800 focus:ring-1 focus:ring-teal-500/50 cursor-pointer">{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
);
