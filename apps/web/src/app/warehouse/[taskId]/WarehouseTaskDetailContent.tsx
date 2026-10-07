"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Spin, Modal, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useWarehouse } from "@/hooks/useWarehouse";
import { TaskMeta, StandaloneDimensions } from "../_components/WarehouseTaskDetail";
import { PickupSection } from "../_components/sections/PickupSection";
import { JobNotes, ActionPushButtons } from "../_components/sections/JobExtras";
import { SectionCard as Card, PillTabs } from "@/components/SectionCard";

// Same sub-tabs and cards as the Warehouse tab of a shipment.
const TABS = [
  { key: "details", label: "Task Details" },
  { key: "pickup", label: "Pick-up" },
];

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
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-slate-800 font-mono m-0">{task.taskId}</h1>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-6 flex flex-col gap-5">
        <PillTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {activeTab === "details" && (
          <>
            <TaskMeta task={task} />
            <JobNotes ownerId={task.id} messageApi={messageApi} />
            <StandaloneDimensions ownerId={task.id} messageApi={messageApi} />
            <ActionPushButtons ownerId={task.id} messageApi={messageApi} />
          </>
        )}

        {activeTab === "pickup" && (
          <Card title="Pick-up">
            <PickupSection ownerId={task.id} messageApi={messageApi} />
          </Card>
        )}
      </div>
    </div>
  );
}
