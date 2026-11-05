"use client";

import Link from "next/link";
import type { TripDetail } from "@/hooks/useTruckingConsignments";
import { consignmentHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { formatMoney, formatQty } from "../../_lib/tariffs";
import { place } from "../../_lib/format";
import { EMPTY, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";

const placeOrDash = (psc: string, city: string) => place(psc, city) || <span className={EMPTY}>—</span>;

interface TripLegsTableProps {
  trip: TripDetail;
}

// The legs an LTL trip carries, in stop order, with what each weighs and its share of the trip's
// buy price (split by the haulier's cost-split basis, exact to the cent).
export const TripLegsTable = ({ trip }: TripLegsTableProps) => {
  const byId = new Map(trip.legs.map((l) => [l.legId, l]));
  // The stop order names every leg; one it misses (an older answer) goes last.
  const legs = [...trip.stopOrder.map((id) => byId.get(id)).filter((l) => !!l), ...trip.legs.filter((l) => !trip.stopOrder.includes(l.legId))];
  const sum = (pick: (l: (typeof legs)[number]) => number) => formatQty(legs.reduce((s, l) => s + pick(l), 0));

  if (!legs.length) return <p className="m-0 px-2 py-3 text-[13px] text-slate-500">No {TERMS.leg.toLowerCase()}s on this trip — add them on the Planning tab.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr>
            <th className={TH}>Stop</th>
            <th className={TH}>{TERMS.consignment}</th>
            <th className={TH}>Customer</th>
            <th className={TH}>From</th>
            <th className={TH}>To</th>
            <th className={`${TH} !text-right`}>{TERMS.palletPlaces}</th>
            <th className={`${TH} !text-right`}>{TERMS.ldm}</th>
            <th className={`${TH} !text-right`}>kg</th>
            <th className={TH}>{TERMS.adr}</th>
            <th className={`${TH} !text-right`}>Cost share</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={l.legId}>
              <td className={`${TD} tabular-nums`}>{i + 1}</td>
              <td className={TD}>
                <Link href={consignmentHref(l.consignmentId)} className={`${LINK} ${REF} font-semibold`}>
                  {l.consignmentRef}
                </Link>
              </td>
              <td className={TD}>{l.customerName}</td>
              <td className={TD}>{placeOrDash(l.fromPostcode, l.fromCity)}</td>
              <td className={TD}>{placeOrDash(l.toPostcode, l.toCity)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatQty(l.palletPlaces)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatQty(l.ldm)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatQty(l.weightKg)}</td>
              <td className={TD}>{l.adr ? <span className="font-semibold text-amber-700">{TERMS.adr}</span> : <span className={EMPTY}>—</span>}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatMoney(l.costShareCzk, "CZK")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={TD_TOTAL} colSpan={5}>
              {legs.length} {legs.length === 1 ? TERMS.leg.toLowerCase() : `${TERMS.leg.toLowerCase()}s`}
            </td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{sum((l) => l.palletPlaces)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{sum((l) => l.ldm)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{sum((l) => l.weightKg)}</td>
            <td className={TD_TOTAL} />
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{formatMoney(legs.reduce((s, l) => s + (l.costShareCzk ?? 0), 0), "CZK")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
