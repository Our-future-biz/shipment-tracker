"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { useTrackingActions, type TrackingAttention } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { BTN_GHOST, BTN_SM, HINT } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import type { NoticeKindValue } from "./customerDraft";
import { movedDaysLabel, noticeKindOfMoved } from "./trackingText";

const ACTUAL_OF: Record<string, string> = { ETA: "ATA", ETD: "ATD" };

interface RowProps {
  item: TrackingAttention;
  /** Closes the exception; null when this person may not (the server's rule for its kind). */
  onClose: ((eventId: string) => void) | null;
  closing: boolean;
  onTell: () => void;
}

function Row({ item, onClose, closing, onTell }: RowProps) {
  if (item.kind === "not_told") {
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <Pill tone="amber">Customer not told</Pill>
        <span className="text-[13px] text-slate-700 tabular-nums">
          {item.what}: told {formatDate(item.from)}, now {item.to ? formatDate(item.to) : "no date"}
        </span>
        <span className={HINT}>told {businessDateTime(item.at)} · {personOrSystem(item.by)}</span>
        <button type="button" onClick={onTell} className={`${BTN_GHOST} ${BTN_SM} ml-auto`}>
          Tell the customer
        </button>
      </li>
    );
  }
  if (item.kind === "exception") {
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <Pill tone="red">{item.what}</Pill>
        <span className="text-[13px] text-slate-700">{item.note}</span>
        <span className={HINT}>since {formatDate(item.to)} · {personOrSystem(item.by)}</span>
        {onClose && item.eventId && (
          <button type="button" disabled={closing} onClick={() => onClose(item.eventId!)} className={`${BTN_GHOST} ${BTN_SM} ml-auto`}>
            Close
          </button>
        )}
      </li>
    );
  }
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

interface AttentionCardProps {
  shipmentId: string;
  items: readonly TrackingAttention[];
  /** Whether this person may record (and so close) an event of this kind. */
  mayRecord: (kind: string) => boolean;
  onTell: (kind: NoticeKindValue) => void;
}

/** What needs a look: what people reported and what the dates show. Not there when nothing does. */
export function AttentionCard({ shipmentId, items, mayRecord, onTell }: AttentionCardProps) {
  const { resolve } = useTrackingActions(shipmentId);
  if (items.length === 0) return null;
  return (
    <SectionCard title="Exceptions" extra={<CountChip count={items.length} />} bodyClassName="p-0">
      <ul className="m-0 p-0 list-none divide-y divide-slate-100">
        {items.map((item) => (
          <Row
            key={item.eventId ?? `${item.kind}-${item.milestoneKey}`}
            item={item}
            // An exception's milestoneKey is its kind.
            onClose={mayRecord(item.milestoneKey) ? (id) => resolve.mutate(id) : null}
            closing={resolve.isPending}
            // A not-told row's milestoneKey is the field that moved.
            onTell={() => onTell(noticeKindOfMoved(item.milestoneKey))}
          />
        ))}
      </ul>
    </SectionCard>
  );
}
