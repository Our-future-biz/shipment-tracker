"use client";

import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { getTasksForDirection } from "../_components/taskDefinitions";

export function TrackingTab({ shipment }: { shipment: ShipmentItem }) {
  const taskList = getTasksForDirection(shipment.tradeDirection);
  const { tasks } = useShipmentTasks(shipment.id);

  const completedTasks = tasks
    .filter((t) => t.completed && t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (completedTasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <p className="text-center text-slate-400 text-sm py-8">No tracking events yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-sm" />
        {completedTasks.map((task, i) => {
          const def = taskList.find((t) => t.key === task.taskKey);
          const isLatest = i === 0;
          return (
            <div key={task.taskKey} className="relative mb-4">
              <div
                className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 ${
                  isLatest
                    ? "border-indigo-500 bg-indigo-500"
                    : "border-slate-300 bg-white"
                }`}
              />
              <div>
                <p className={`text-sm font-medium ${isLatest ? "text-indigo-500" : "text-slate-700"}`}>
                  {def?.label || task.taskKey}
                </p>
                {def?.description && (
                  <p className="text-xs text-slate-500">{def.description}</p>
                )}
                <p className="text-[11px] text-slate-400">
                  {new Date(task.completedAt!).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
