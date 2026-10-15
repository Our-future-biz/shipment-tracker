"use client";

import { StarFilled } from "@ant-design/icons";
import type { RateLevelResult } from "@/hooks/useTrucking";
import { isPriced, isUnpriced } from "../_lib/tariffs";
import { HaulierIssueList } from "./HaulierIssueList";
import { RatePricedSide } from "./RatePricedSide";
import { RateUnpricedNote } from "./RateUnpricedNote";

interface RateResultDetailProps {
  result: RateLevelResult;
  includeBuy: boolean;
}

// The expanded row of a service level: the sell price line by line, every haulier that can run
// it (best first), the blocked ones left out and why, and the internal price.
export const RateResultDetail = ({ result, includeBuy }: RateResultDetailProps) => (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 py-1">
    <div className="flex flex-col gap-3">
      {isPriced(result.sell) && <RatePricedSide title="Sell" side={result.sell} />}
      {isUnpriced(result.sell) && <RateUnpricedNote title="Sell" reason={result.sell.reason} />}
      {isPriced(result.internal) && <RatePricedSide title="Internal" side={result.internal} />}
      {isUnpriced(result.internal) && <RateUnpricedNote title="Internal" reason={result.internal.reason} />}
    </div>
    {includeBuy && (
      <div className="flex flex-col gap-3">
        {result.buy.length === 0 && <RateUnpricedNote title="Buy" reason="No haulier has an active buy tariff covering this lane and service level." />}
        {result.buy.map((b, i) => (
          <RatePricedSide
            key={b.tariffVersionId}
            side={b}
            title={
              <span className="inline-flex items-center gap-1.5">
                {i === 0 && <span className="rounded bg-indigo-50 px-1.5 text-[10.5px] font-bold uppercase text-indigo-600">Best</span>}
                {b.ownerName ?? "Haulier"}
                {b.preferred && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <StarFilled aria-hidden /> preferred lane
                  </span>
                )}
              </span>
            }
          />
        ))}
        {result.excluded.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
            <div className="mb-1 text-[12.5px] font-semibold text-red-800">Left out — blocked hauliers</div>
            {result.excluded.map((x) => (
              <div key={x.customerId} className="py-1 border-t border-red-100 first:border-t-0">
                <div className="text-[12.5px] font-semibold text-slate-800">{x.name}</div>
                <HaulierIssueList issues={x.issues} />
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);
