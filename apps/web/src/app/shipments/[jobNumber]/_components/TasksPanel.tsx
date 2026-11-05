"use client";

import { Tooltip } from "antd";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getTasksForDirection } from "./taskDefinitions";
import { formatDate } from "@/lib/date";

export function TasksPanel({ shipment }: { shipment: ShipmentItem }) {
  const { user } = useAuth();
  const { byKey, setCompleted } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  // The first task not done yet is marked, so where the job stopped shows at a glance.
  const nextIdx = taskList.findIndex((d) => !byKey.get(d.key)?.completed);

  return (
    <div className="space-y-0.5">
      {taskList.map((def, i) => {
        const state = byKey.get(def.key);
        const completed = !!state?.completed;
        return (
          <div key={def.key} className={`flex items-center gap-2.5 min-h-[30px] -mx-2 px-2 rounded-md text-[13px] transition-colors ${
              i === nextIdx ? "bg-indigo-50/70" : "hover:bg-slate-50"
            }`}>
            <Tooltip title={completed ? "Completed tasks can't be unchecked" : def.description}>
              <input
                type="checkbox"
                checked={completed}
                disabled={completed}
                onChange={() => setCompleted(def.key, true, user?.id)}
                className="w-4 h-4 shrink-0 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:cursor-default"
              />
            </Tooltip>
            <span className={completed ? "text-slate-400 line-through" : i === nextIdx ? "text-slate-900 font-semibold" : "text-slate-700"}>
              {def.label}
            </span>
            {completed && state?.completedAt && (
              <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap tabular-nums">
                {formatDate(state.completedAt)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
