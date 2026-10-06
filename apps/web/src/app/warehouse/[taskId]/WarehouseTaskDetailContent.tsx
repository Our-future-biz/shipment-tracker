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

// Same sub-tabs and cards as the Warehouse tab of a shipment.
const TABS = [
  { key: "details", label: "Task Details" },
  { key: "pickup", label: "Pick-up" },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm min-w-0">
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
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
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map((tab) => {
            const on = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "flex items-center h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer",
                  on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

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
