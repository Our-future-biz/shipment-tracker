"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { useTrackingActions, type TrackingAttention } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { BTN_BAR } from "@/styles/ui";
import { CELL_TEXT } from "./trackingUi";
import { personOrSystem } from "./RecordedBy";
import type { NoticeKindValue } from "./customerDraft";
import { movedDaysLabel, noticeKindOfMoved } from "./trackingText";

// One row of the list: on a wide screen its parts sit in the list's columns (pill, text, who/when,
// button), so every row's text starts at one line; on a narrow one they wrap.
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2.5 hover:bg-slate-50 transition-colors sm:col-span-4 sm:grid sm:grid-cols-subgrid";
const PILL_CELL = "justify-self-start";
const ROW_TEXT = "min-w-0 text-[13px] text-slate-700";
// who and when, in the grid's 13px text like the rest of the row
const META = `${CELL_TEXT} whitespace-nowrap`;
const BUTTON_CELL = "ml-auto sm:col-start-4 sm:ml-0 sm:justify-self-end";

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
      <li className={ROW}>
        <Pill tone="amber" className={PILL_CELL}>Customer not told</Pill>
        <span className={`${ROW_TEXT} tabular-nums`}>
          {item.what}: told {formatDate(item.from)}, now {item.to ? formatDate(item.to) : "no date"}
        </span>
        <span className={META}>told {businessDateTime(item.at)} · {personOrSystem(item.by)}</span>
        <button type="button" onClick={onTell} className={`${BTN_BAR} ${BUTTON_CELL}`}>
          Tell the customer
        </button>
      </li>
    );
  }
  if (item.kind === "exception") {
    return (
      <li className={ROW}>
        <Pill tone="red" className={PILL_CELL}>{item.what}</Pill>
        <span className={ROW_TEXT}>{item.note}</span>
        <span className={META}>since {formatDate(item.to)} · {personOrSystem(item.by)}</span>
        {onClose && item.eventId && (
          <button type="button" disabled={closing} onClick={() => onClose(item.eventId!)} className={`${BTN_BAR} ${BUTTON_CELL}`}>
            Close
          </button>
        )}
      </li>
    );
  }
  if (item.kind === "late") {
    return (
      <li className={ROW}>
        <Pill tone="red" className={PILL_CELL}>{item.what} passed {item.days} d ago</Pill>
        <span className={ROW_TEXT}>
          {item.what} {formatDate(item.to)}, no {ACTUAL_OF[item.what] ?? "actual date"} recorded.
        </span>
      </li>
    );
  }
  return (
    <li className={ROW}>
      <Pill tone={item.days > 0 ? "amber" : "slate"} className={PILL_CELL}>{item.what} moved {movedDaysLabel(item.days)}</Pill>
      <span className={`${ROW_TEXT} tabular-nums`}>{formatDate(item.from)} → {formatDate(item.to)}</span>
      <span className={META}>{personOrSystem(item.by)} · {businessDateTime(item.at)}</span>
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
      <ul className="m-0 p-0 list-none divide-y divide-slate-100 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
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
