"use client";

import { useState } from "react";
import { Tooltip } from "antd";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { useShipmentTracking, useTrackingActions } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { isDetailsManager } from "@/lib/shipmentEditRule";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ShipmentItem } from "@/hooks/useShipments";
import { RecordEventModal } from "../tabs/tracking/RecordEventModal";
import { ReasonModal } from "../tabs/tracking/ReasonModal";
import { TellCustomerModal } from "../tabs/tracking/TellCustomerModal";
import type { NoticeKindValue } from "../tabs/tracking/customerDraft";
import { TICK_EVENTS, TICK_NOTICES, getTasksForDirection } from "./taskDefinitions";
import { businessDayOf, formatDate } from "@/lib/date";
import { LINK } from "@/styles/ui";

export function TasksPanel({ shipment }: { shipment: ShipmentItem }) {
  const { user } = useAuth();
  const { byKey, setCompleted } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  // The first task not done yet is marked, so where the job stopped shows at a glance.
  const nextIdx = taskList.findIndex((d) => !byKey.get(d.key)?.completed);
  const { data: tracking } = useShipmentTracking(shipment.id);
  const { reopenTask } = useTrackingActions(shipment.id);
  // A tick that is also a dated fact asks for its date, for whoever may record it; for anyone else
  // (and on a road job, whose stamps are set in Trucking) it stays a plain tick.
  const [recording, setRecording] = useState<{ kind: string; taskKey: string } | null>(null);
  const [telling, setTelling] = useState<{ kind: NoticeKindValue; taskKey: string } | null>(null);
  const [takingBack, setTakingBack] = useState<{ taskKey: string; label: string } | null>(null);
  const tick = (taskKey: string) => {
    // A tick that means the customer was told opens that; the notice writes the tick.
    const notice = TICK_NOTICES[taskKey];
    if (notice && tracking) {
      setTelling({ kind: notice as NoticeKindValue, taskKey });
      return;
    }
    const kind = TICK_EVENTS[taskKey];
    if (kind && tracking?.recordable.some((r) => r.kind === kind)) setRecording({ kind, taskKey });
    else setCompleted(taskKey, true, user?.id);
  };
  const mayTakeBack = !!user && isDetailsManager(user.role);

  return (
    <div className="space-y-0.5">
      {taskList.map((def, i) => {
        const state = byKey.get(def.key);
        const completed = !!state?.completed;
        return (
          <div key={def.key} className={`flex items-center gap-2.5 min-h-[30px] -mx-2 px-2 rounded-md text-[13px] transition-colors ${
              i === nextIdx ? "bg-indigo-50/70" : "hover:bg-slate-50"
            }`}>
            <Tooltip title={completed ? (mayTakeBack ? "Take back beside the date" : "Only a manager can take a tick back") : def.description}>
              <input
                type="checkbox"
                checked={completed}
                disabled={completed}
                onChange={() => tick(def.key)}
                className="w-4 h-4 shrink-0 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:cursor-default"
              />
            </Tooltip>
            <span className={completed ? "text-slate-400 line-through" : i === nextIdx ? "text-slate-900 font-semibold" : "text-slate-700"}>
              {def.label}
            </span>
            {completed && state?.completedAt && (
              <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap tabular-nums">
                {formatDate(businessDayOf(state.completedAt))}
                {mayTakeBack && (
                  <button
                    type="button"
                    onClick={() => setTakingBack({ taskKey: def.key, label: def.label })}
                    className={`${LINK} ml-2 cursor-pointer bg-transparent border-none p-0 text-[11px]`}
                  >
                    Take back
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {recording && tracking && (
        <RecordEventModal shipment={shipment} tracking={tracking} initialKind={recording.kind} taskKey={recording.taskKey} onClose={() => setRecording(null)} />
      )}
      {telling && tracking && (
        <TellCustomerModal shipment={shipment} tracking={tracking} initialKind={telling.kind} taskKey={telling.taskKey} onClose={() => setTelling(null)} />
      )}
      {takingBack && (
        <ReasonModal
          title={`Take back: ${takingBack.label}`}
          description="The tick goes back to open. Your reason is kept in the shipment's log."
          confirmLabel="Take back"
          onClose={() => setTakingBack(null)}
          onConfirm={async (reason) => {
            try {
              await reopenTask.mutateAsync({ taskKey: takingBack.taskKey, reason });
              return null;
            } catch (err) {
              return apiErrorMessage(err);
            }
          }}
        />
      )}
    </div>
  );
}
