"use client";

import { useState } from "react";
import { CheckOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { TrackingTick } from "@/hooks/useShipmentTracking";
import { businessDateTime } from "@/lib/date";
import { HINT } from "@/styles/ui";
import { getTasksForDirection } from "../../_components/taskDefinitions";
import { personOrSystem } from "./RecordedBy";
import { CELL_TEXT } from "./trackingUi";

/** The checklist, read-only and folded: work the desk ticked, dated by the click, so it stays out of the timeline. */
export function ChecklistCard({ tradeDirection, freightMode, ticks }: { tradeDirection: string; freightMode: string; ticks: readonly TrackingTick[] }) {
  const [open, setOpen] = useState(false);
  const tasks = getTasksForDirection(tradeDirection, freightMode);
  const byKey = new Map(ticks.map((t) => [t.taskKey, t]));
  const done = tasks.filter((t) => byKey.has(t.key)).length;

  return (
    <SectionCard title="Checklist" fold={{ open, onToggle: () => setOpen((o) => !o), subtitle: `${done} of ${tasks.length} ticked` }} bodyClassName="p-0">
      <ul className="m-0 p-0 list-none divide-y divide-slate-100">
        {tasks.map((task) => {
          const tick = byKey.get(task.key);
          return (
            <li key={task.key} className="flex flex-wrap items-baseline gap-x-2 px-6 py-2 text-[13px] hover:bg-slate-50 transition-colors">
              <span className="w-4 shrink-0 text-emerald-600">{tick && <CheckOutlined aria-label="Ticked" />}</span>
              <span className={tick ? "font-medium text-slate-900" : "text-slate-500"}>{task.label}</span>
              {tick && <span className={`${CELL_TEXT} tabular-nums`}>ticked {businessDateTime(tick.completedAt)} · {personOrSystem(tick.by)}</span>}
            </li>
          );
        })}
      </ul>
      <p className={`${HINT} m-0 px-6 py-3 border-t border-slate-100`}>Tasks are ticked in Shipment Details. The time is the click, not the event.</p>
    </SectionCard>
  );
}
