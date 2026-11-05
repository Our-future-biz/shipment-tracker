"use client";

import type { PriceSnapshot } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { CARD, HINT, TD, TD_TOTAL } from "@/styles/ui";
import { formatMoney, formatQty } from "../_lib/tariffs";

const SOURCE_TEXT: Record<PriceSnapshot["source"], string> = { TARIFF: "From the tariff", QUOTE: "From the quote", MANUAL: "Agreed price" };

interface PriceSnapshotTableProps {
  price: PriceSnapshot;
}

// A stored price (sell of a consignment, buy of a trip) as it was priced — it is never priced again
// silently: where it came from, its lines and the total.
export const PriceSnapshotTable = ({ price }: PriceSnapshotTableProps) => (
  <div className={`${CARD} overflow-hidden`}>
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-100 px-2 py-2 text-[12px] text-slate-500">
      <span className="text-[13px] font-semibold text-slate-900">{SOURCE_TEXT[price.source]}</span>
      {price.tariffName && (
        <span>
          {price.tariffName}
          {price.versionNo != null ? ` v${price.versionNo}` : ""}
        </span>
      )}
      <span>· priced {businessDateTime(price.ratedAt)}</span>
      {price.overrideReason && <span className="basis-full text-amber-700">Why: {price.overrideReason}</span>}
    </div>
    <table className="w-full border-collapse tabular-nums">
      <tbody>
        {price.lines.map((l, i) => (
          <tr key={`${l.code}-${i}`}>
            <td className={TD}>{l.label}</td>
            <td className={`${TD} text-right whitespace-nowrap`}>
              {formatQty(l.qty)} {l.unit}
            </td>
            <td className={`${TD} text-right whitespace-nowrap`}>{formatMoney(l.amount, price.currency)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={2} className={`${TD_TOTAL} text-right`}>
            Total
          </td>
          <td className={`${TD_TOTAL} text-right whitespace-nowrap`}>{formatMoney(price.total, price.currency)}</td>
        </tr>
      </tbody>
    </table>
    {price.currency !== "CZK" && <div className={`px-2 pb-2 ${HINT}`}>= {formatMoney(price.totalCzk, "CZK")}</div>}
  </div>
);
