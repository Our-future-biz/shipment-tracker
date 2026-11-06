"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import type { TrackingAttention } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { HINT } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import { movedDaysLabel } from "./trackingText";

const ACTUAL_OF: Record<string, string> = { ETA: "ATA", ETD: "ATD" };

function Row({ item }: { item: TrackingAttention }) {
  if (item.kind === "late") {
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <Pill tone="red">{item.what} passed {item.days} d ago</Pill>
        <span className="text-[13px] text-slate-700">
          {item.what} {formatDate(item.to)}, no {ACTUAL_OF[item.what] ?? "actual date"} recorded.
        </span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <Pill tone={item.days > 0 ? "amber" : "slate"}>{item.what} moved {movedDaysLabel(item.days)}</Pill>
      <span className="text-[13px] text-slate-700 tabular-nums">{formatDate(item.from)} → {formatDate(item.to)}</span>
      <span className={HINT}>{personOrSystem(item.by)} · {businessDateTime(item.at)}</span>
    </li>
  );
}

/** What needs a look, worked out from the shipment's dates. Not there when nothing does. */
export function AttentionCard({ items }: { items: readonly TrackingAttention[] }) {
  if (items.length === 0) return null;
  return (
    <SectionCard title="Exceptions" extra={<CountChip count={items.length} />} bodyClassName="p-0">
      <ul className="m-0 p-0 list-none divide-y divide-slate-100">
        {items.map((item) => (
          <Row key={`${item.kind}-${item.milestoneKey}`} item={item} />
        ))}
      </ul>
    </SectionCard>
  );
}
