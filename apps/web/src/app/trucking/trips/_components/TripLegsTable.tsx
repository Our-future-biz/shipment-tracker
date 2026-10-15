"use client";

import Link from "next/link";
import type { TripDetail } from "@/hooks/useTruckingConsignments";
import { consignmentHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { formatPsc } from "../../_lib/hauliers";
import { formatMoney, formatQty } from "../../_lib/tariffs";

const th = "text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
const td = "px-3 py-1.5 align-middle";
const place = (psc: string, city: string) => [psc ? formatPsc(psc) : "", city].filter(Boolean).join(" ") || "—";

interface TripLegsTableProps {
  trip: TripDetail;
}

// The legs an LTL trip carries, in stop order, with what each weighs and its share of the trip's
// buy price (split by the haulier's cost-split basis, exact to the cent).
export const TripLegsTable = ({ trip }: TripLegsTableProps) => {
  const byId = new Map(trip.legs.map((l) => [l.id, l]));
  // The stop order names every leg; one it misses (an older answer) goes last.
  const legs = [...trip.stopOrder.map((id) => byId.get(id)).filter((l) => !!l), ...trip.legs.filter((l) => !trip.stopOrder.includes(l.id))];
  const sum = (pick: (l: (typeof legs)[number]) => number) => formatQty(legs.reduce((s, l) => s + pick(l), 0));

  if (!legs.length) return <p className="m-0 text-[13px] text-slate-500">No {TERMS.leg.toLowerCase()}s on this trip — add them on the Planning tab.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className={th}>Stop</th>
            <th className={th}>{TERMS.consignment}</th>
            <th className={th}>Customer</th>
            <th className={th}>From</th>
            <th className={th}>To</th>
            <th className={`${th} !text-right`}>{TERMS.palletPlaces}</th>
            <th className={`${th} !text-right`}>{TERMS.ldm}</th>
            <th className={`${th} !text-right`}>kg</th>
            <th className={th}>{TERMS.adr}</th>
            <th className={`${th} !text-right`}>Cost share</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={l.id} className="border-b border-slate-100 last:border-b-0">
              <td className={`${td} tabular-nums text-slate-500`}>{i + 1}</td>
              <td className={td}>
                <Link href={consignmentHref(l.consignmentId)} className="font-mono font-semibold text-indigo-600 hover:underline">
                  {l.consignmentRef}
                </Link>
              </td>
              <td className={`${td} text-slate-700`}>{l.customerName}</td>
              <td className={`${td} text-slate-600`}>{place(l.fromPostcode, l.fromCity)}</td>
              <td className={`${td} text-slate-600`}>{place(l.toPostcode, l.toCity)}</td>
              <td className={`${td} text-right tabular-nums`}>{formatQty(l.palletPlaces)}</td>
              <td className={`${td} text-right tabular-nums`}>{formatQty(l.ldm)}</td>
              <td className={`${td} text-right tabular-nums`}>{formatQty(l.weightKg)}</td>
              <td className={td}>{l.adr ? <span className="font-semibold text-amber-700">{TERMS.adr}</span> : <span className="text-slate-300">—</span>}</td>
              <td className={`${td} text-right tabular-nums`}>{formatMoney(l.costShareCzk, "CZK")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td className={td} colSpan={5}>
              {legs.length} {legs.length === 1 ? TERMS.leg.toLowerCase() : `${TERMS.leg.toLowerCase()}s`}
            </td>
            <td className={`${td} text-right tabular-nums`}>{sum((l) => l.palletPlaces)}</td>
            <td className={`${td} text-right tabular-nums`}>{sum((l) => l.ldm)}</td>
            <td className={`${td} text-right tabular-nums`}>{sum((l) => l.weightKg)}</td>
            <td className={td} />
            <td className={`${td} text-right tabular-nums`}>{formatMoney(legs.reduce((s, l) => s + (l.costShareCzk ?? 0), 0), "CZK")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
