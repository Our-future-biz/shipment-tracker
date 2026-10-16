"use client";

import { businessDateTime } from "@/lib/date";
import type { TruckingEvent } from "@/hooks/useTruckingConsignments";

interface TruckingHistoryProps {
  events: readonly TruckingEvent[];
}

// The append-only history of a consignment or trip, newest first: when, who and what. A voided
// stamp stays in it next to its voiding.
export const TruckingHistory = ({ events }: TruckingHistoryProps) => {
  if (!events.length) return <p className="m-0 text-[13px] text-slate-500">Nothing logged yet.</p>;
  return (
    <ul className="m-0 list-none border-l-2 border-slate-100 p-0 pl-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-xs">
          <span className="w-[112px] shrink-0 font-mono text-slate-400">{businessDateTime(e.at)}</span>
          <span className="font-semibold text-slate-800">{e.summary}</span>
          {e.by && <span className="text-slate-500">· {e.by}</span>}
        </li>
      ))}
    </ul>
  );
};
