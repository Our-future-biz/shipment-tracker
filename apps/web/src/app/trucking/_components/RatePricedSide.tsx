"use client";

import type { ReactNode } from "react";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { CARD, HINT, TD, TD_TOTAL, TH } from "@/styles/ui";
import { formatMoney, formatQty, versionLabel } from "../_lib/tariffs";

interface RatePricedSideProps {
  title: ReactNode;
  side: interfaces.PricedSide;
}

// One priced side of a rate (sell, a haulier's buy, internal): which tariff and version, the zone
// and band it fell in, why the chargeable quantity is what it is, and the price lines.
export const RatePricedSide = ({ title, side }: RatePricedSideProps) => (
  <div className={`${CARD} overflow-hidden`}>
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 px-2 py-2">
      <span className="text-[13px] font-semibold text-slate-900">{title}</span>
      <span className={HINT}>
        {side.tariffName} {versionLabel(side)} · zone {side.zoneCode}
        {side.zoneLabel ? ` ${side.zoneLabel}` : ""} · {side.bandLabel}
      </span>
    </div>
    <div className={`px-2 py-2 ${HINT}`}>
      <span className="font-semibold text-slate-700">Chargeable:</span> {side.chargeable.explanation}
    </div>
    <table className="w-full border-collapse tabular-nums">
      <thead>
        <tr>
          <th className={TH}>Line</th>
          <th className={`${TH} !text-right`}>Qty</th>
          <th className={`${TH} !text-right`}>Unit price</th>
          <th className={`${TH} !text-right`}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {side.lines.map((l, i) => (
          <tr key={`${l.code}-${i}`}>
            <td className={TD}>{l.label}</td>
            <td className={`${TD} text-right whitespace-nowrap`}>
              {formatQty(l.qty)} {l.unit}
            </td>
            <td className={`${TD} text-right whitespace-nowrap`}>{formatMoney(l.unitPrice, side.currency)}</td>
            <td className={`${TD} text-right whitespace-nowrap`}>{formatMoney(l.amount, side.currency)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={3} className={`${TD_TOTAL} text-right`}>
            Total
          </td>
          <td className={`${TD_TOTAL} text-right whitespace-nowrap`}>{formatMoney(side.total, side.currency)}</td>
        </tr>
      </tbody>
    </table>
    {side.fx && (
      <div className={`px-2 pb-2 ${HINT}`}>
        = {formatMoney(side.totalCzk, "CZK")} at the ČNB rate {formatQty(side.fx.rate)} of {formatDate(side.fx.date)}
      </div>
    )}
  </div>
);
