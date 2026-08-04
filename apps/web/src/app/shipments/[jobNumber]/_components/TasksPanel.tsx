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

  return (
    <div className="space-y-2.5">
      {taskList.map((def) => {
        const state = byKey.get(def.key);
        const completed = !!state?.completed;
        return (
          <div key={def.key} className="flex items-center gap-2.5 text-xs">
            <Tooltip title={completed ? "Completed tasks can't be unchecked" : def.description}>
              <input
                type="checkbox"
                checked={completed}
                disabled={completed}
                onChange={() => setCompleted(def.key, true, user?.id)}
                className="w-[18px] h-[18px] rounded border-slate-300 accent-indigo-500 cursor-pointer disabled:cursor-default"
              />
            </Tooltip>
            <span className={completed ? "text-slate-400 line-through" : "text-slate-600"}>
              {def.label}
            </span>
            {completed && state?.completedAt && (
              <span className="text-[10px] text-slate-300 ml-auto whitespace-nowrap">
                {formatDate(state.completedAt)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
