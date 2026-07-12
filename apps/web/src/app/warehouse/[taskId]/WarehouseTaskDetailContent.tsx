"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Spin, Modal, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useWarehouse } from "@/hooks/useWarehouse";
import { TaskMeta, StandaloneDimensions } from "../_components/WarehouseTaskDetail";
import { SpreadsheetSection, CUSTOMS_COLUMNS, INVOICING_COLUMNS } from "../_components/sections/SpreadsheetSection";
import { PickupSection } from "../_components/sections/PickupSection";
import { JobNotes, ActionPushButtons } from "../_components/sections/JobExtras";

const TABS = [
  { key: "details", label: "Details" },
  { key: "customs", label: "Customs" },
  { key: "pickup", label: "Pick-up" },
  { key: "invoicing", label: "Invoicing" },
];

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-5 ${className}`}>
      {title && <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider m-0 mb-4">{title}</h3>}
      {children}
    </div>
  );
}

export function WarehouseTaskDetailContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const { tasks, isLoading, deleteTask } = useWarehouse();
  const [messageApi, contextHolder] = message.useMessage();
  const [activeTab, setActiveTab] = useState("details");

  const task = tasks.find((t) => t.id === taskId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-10 text-center text-slate-500">
        Task not found.{" "}
        <Link href="/warehouse" className="text-indigo-500">
          Back to Warehouse
        </Link>
      </div>
    );
  }

  const handleDelete = () => {
    Modal.confirm({
      title: "Delete task",
      content: `Delete ${task.taskId}? This cannot be undone.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteTask(task.id);
        router.push("/warehouse");
      },
    });
  };

  return (
    <div className="bg-slate-50 min-h-full">
      {contextHolder}

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[22px] font-bold text-slate-800 font-mono m-0">{task.taskId}</h1>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
            Delete
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-500 border-indigo-500"
                  : "font-normal text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-6">
        <Card title="Task Details" className="mb-4">
          <TaskMeta task={task} />
        </Card>

        {activeTab === "details" && (
          <div className="space-y-4">
            <Card>
              <JobNotes ownerId={task.id} messageApi={messageApi} />
            </Card>
            <Card>
              <StandaloneDimensions ownerId={task.id} messageApi={messageApi} />
            </Card>
            <Card>
              <ActionPushButtons ownerId={task.id} messageApi={messageApi} />
            </Card>
          </div>
        )}

        {activeTab === "customs" && (
          <Card>
            <SpreadsheetSection ownerId={task.id} section="customs" title="Customs Details" columns={CUSTOMS_COLUMNS} messageApi={messageApi} />
          </Card>
        )}

        {activeTab === "pickup" && (
          <Card>
            <PickupSection ownerId={task.id} messageApi={messageApi} />
          </Card>
        )}

        {activeTab === "invoicing" && (
          <Card>
            <SpreadsheetSection ownerId={task.id} section="invoicing" title="Invoice Records" columns={INVOICING_COLUMNS} messageApi={messageApi} />
          </Card>
        )}
      </div>
    </div>
  );
}
