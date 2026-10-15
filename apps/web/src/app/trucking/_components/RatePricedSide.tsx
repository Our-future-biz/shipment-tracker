"use client";

import type { ReactNode } from "react";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { formatMoney, formatQty, versionLabel } from "../_lib/tariffs";

interface RatePricedSideProps {
  title: ReactNode;
  side: interfaces.PricedSide;
}

// One priced side of a rate (sell, a haulier's buy, internal): which tariff and version, the zone
// and band it fell in, why the chargeable quantity is what it is, and the price lines.
export const RatePricedSide = ({ title, side }: RatePricedSideProps) => (
  <div className="rounded-lg border border-slate-200 bg-white">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 px-3 py-2">
      <span className="text-[13px] font-semibold text-slate-800">{title}</span>
      <span className="text-[11.5px] text-slate-500">
        {side.tariffName} {versionLabel(side)} · zone {side.zoneCode}
        {side.zoneLabel ? ` ${side.zoneLabel}` : ""} · {side.bandLabel}
      </span>
    </div>
    <div className="px-3 py-2 text-[12px] text-slate-600">
      <span className="font-semibold text-slate-700">Chargeable:</span> {side.chargeable.explanation}
    </div>
    <table className="w-full border-collapse text-[12px] tabular-nums">
      <thead>
        <tr className="border-y border-slate-100 text-[10.5px] uppercase tracking-wide text-slate-500">
          <th className="px-3 py-1 text-left font-semibold">Line</th>
          <th className="px-3 py-1 text-right font-semibold">Qty</th>
          <th className="px-3 py-1 text-right font-semibold">Unit price</th>
          <th className="px-3 py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {side.lines.map((l, i) => (
          <tr key={`${l.code}-${i}`} className="border-b border-slate-50">
            <td className="px-3 py-1 text-slate-700">{l.label}</td>
            <td className="px-3 py-1 text-right whitespace-nowrap">
              {formatQty(l.qty)} {l.unit}
            </td>
            <td className="px-3 py-1 text-right whitespace-nowrap">{formatMoney(l.unitPrice, side.currency)}</td>
            <td className="px-3 py-1 text-right whitespace-nowrap">{formatMoney(l.amount, side.currency)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={3} className="px-3 py-1.5 text-right font-semibold text-slate-700">
            Total
          </td>
          <td className="px-3 py-1.5 text-right font-bold text-slate-900 whitespace-nowrap">{formatMoney(side.total, side.currency)}</td>
        </tr>
      </tbody>
    </table>
    {side.fx && (
      <div className="px-3 pb-2 text-[11.5px] text-slate-500">
        = {formatMoney(side.totalCzk, "CZK")} at the ČNB rate {formatQty(side.fx.rate)} of {formatDate(side.fx.date)}
      </div>
    )}
  </div>
);
