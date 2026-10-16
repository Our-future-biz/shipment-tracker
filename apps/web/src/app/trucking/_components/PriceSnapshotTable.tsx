"use client";

import type { PriceSnapshot } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { formatMoney, formatQty } from "../_lib/tariffs";

const SOURCE_TEXT: Record<PriceSnapshot["source"], string> = { TARIFF: "From the tariff", QUOTE: "From the quote", MANUAL: "Agreed price" };

interface PriceSnapshotTableProps {
  price: PriceSnapshot;
}

// A stored price (sell of a consignment, buy of a trip) as it was priced — it is never priced again
// silently: where it came from, its lines and the total.
export const PriceSnapshotTable = ({ price }: PriceSnapshotTableProps) => (
  <div className="rounded-lg border border-slate-200 bg-white">
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-100 px-3 py-2 text-[12px] text-slate-500">
      <span className="text-[13px] font-semibold text-slate-800">{SOURCE_TEXT[price.source]}</span>
      {price.tariffName && (
        <span>
          {price.tariffName}
          {price.versionNo != null ? ` v${price.versionNo}` : ""}
        </span>
      )}
      <span>· priced {businessDateTime(price.ratedAt)}</span>
      {price.overrideReason && <span className="basis-full text-amber-700">Why: {price.overrideReason}</span>}
    </div>
    <table className="w-full border-collapse text-[12px] tabular-nums">
      <tbody>
        {price.lines.map((l, i) => (
          <tr key={`${l.code}-${i}`} className="border-b border-slate-50">
            <td className="px-3 py-1 text-slate-700">{l.label}</td>
            <td className="px-3 py-1 text-right whitespace-nowrap">
              {formatQty(l.qty)} {l.unit}
            </td>
            <td className="px-3 py-1 text-right whitespace-nowrap">{formatMoney(l.amount, price.currency)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-slate-700">
            Total
          </td>
          <td className="px-3 py-1.5 text-right font-bold text-slate-900 whitespace-nowrap">{formatMoney(price.total, price.currency)}</td>
        </tr>
      </tbody>
    </table>
    {price.currency !== "CZK" && <div className="px-3 pb-2 text-[11.5px] text-slate-500">= {formatMoney(price.totalCzk, "CZK")}</div>}
  </div>
);
