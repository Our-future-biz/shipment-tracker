"use client";

import { useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { useSupplierRating } from "@/hooks/useSupplierRating";
import { businessDateTime } from "@/lib/date";
import { SupplierRatingStars } from "../../_components/SupplierRatingStars";

interface CustomerSupplierRatingHistoryCardProps {
  customerId: string;
}

const SHOWN = 5;

// Every change of a supplier's rating, newest first, as it was made: the trend a supplier review needs. Each
// change is timed on the company's (Prague) clock, as the header box dates the rating.
export function CustomerSupplierRatingHistoryCard({ customerId }: CustomerSupplierRatingHistoryCardProps) {
  const { history, historyLoading, historyError } = useSupplierRating(customerId);
  const [all, setAll] = useState(false);
  const shown = all ? history : history.slice(0, SHOWN);

  return (
    <SectionCard title="Rating history">
      {historyLoading && <span className="text-xs text-slate-400">Loading…</span>}
      {historyError && <span className="text-xs text-red-600">The rating history could not be read.</span>}
      {!historyLoading && !historyError && history.length === 0 && <span className="text-xs text-slate-500">Not rated yet.</span>}
      {shown.length > 0 && (
        <ol aria-label="Rating changes" className="m-0 flex list-none flex-col gap-2.5 p-0">
          {shown.map((entry) => (
            <li key={entry.id} className="text-[13px]">
              {entry.rating === null ? <span className="text-[12px] font-medium text-slate-500">Rating cleared</span> : <SupplierRatingStars rating={entry.rating} />}
              {entry.reason && <div className="mt-0.5 text-slate-700 [overflow-wrap:anywhere]">{entry.reason}</div>}
              <div className="text-[11px] text-slate-400">
                {entry.setBy || "—"} · {businessDateTime(entry.setAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
      {history.length > SHOWN && (
        <button type="button" onClick={() => setAll((on) => !on)} className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-indigo-600 hover:underline">
          {all ? "Show the latest only" : `Show all ${history.length}`}
        </button>
      )}
    </SectionCard>
  );
}
