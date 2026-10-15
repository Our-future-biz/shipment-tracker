"use client";

import type { ReactNode } from "react";
import { Tooltip } from "antd";
import type { ConsignmentDetail, TripDetail } from "@/hooks/useTruckingConsignments";
import { formatDate, formatDateTime } from "@/lib/date";
import { btnInline } from "@/app/warehouse/gate-log/_components/job/fields";
import { buyLabel, marginBlocks, marginText, type ActionState } from "../../_lib/consignments";
import { promisedText } from "../../_lib/planning";
import { TERMS } from "../../_lib/glossary";
import { formatPsc } from "../../_lib/hauliers";
import { formatMoney, formatQty } from "../../_lib/tariffs";

type Stop = ConsignmentDetail["pickup"];

const card = "bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0";
const cardLabel = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

const Line = ({ k, v, tone = "" }: { k: string; v: ReactNode; tone?: string }) => (
  <div className="flex items-baseline gap-2 text-xs">
    <span className="shrink-0 text-slate-500">{k}</span>
    <span className={`ml-auto text-right font-semibold break-words ${tone || "text-slate-900"}`}>{v || "—"}</span>
  </div>
);

const place = (s: Stop) => [s.postcode && s.country === "CZ" ? formatPsc(s.postcode) : s.postcode, s.city].filter(Boolean).join(" ");
const windowText = (s: Stop) => (s.windowFrom || s.windowTo ? `${formatDateTime(s.windowFrom) || "…"} – ${formatDateTime(s.windowTo) || "…"}` : "");

interface ConsignmentStatusCardsProps {
  c: ConsignmentDetail;
  trip: TripDetail | null;
  levelLabel: string;
  approveMargin: ActionState;
  onApproveMargin: () => void;
  /** An internal consignment's charge in its month of delivery; null until delivered and priced. */
  internalPrice: { amount: number; notPriced: boolean } | null;
}

// Three cards under the header: Route (stops, dates, promise), Load (what is carried) and Money
// (sell — or, for an internal consignment, its internal price —, buy, margin against the floor and its approval).
export const ConsignmentStatusCards = ({ c, trip, levelLabel, approveMargin, onApproveMargin, internalPrice }: ConsignmentStatusCardsProps) => {
  const l = c.load;
  const promised = promisedText(c);
  const ltl = c.scope === "LTL";
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
      <div className={card}>
        <div className={cardLabel}>Route · {levelLabel}</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          <Line k="Pick-up" v={`${c.pickup.name} · ${place(c.pickup)}`} />
          <Line k="Planned" v={`${formatDate(c.pickupDate)}${windowText(c.pickup) ? ` · ${windowText(c.pickup)}` : ""}`} />
          <Line k="Delivery" v={`${c.delivery.name} · ${place(c.delivery)}`} />
          <Line
            k="Promised"
            v={
              promised.estimated ? (
                <Tooltip title={promised.note}>
                  <span>
                    {promised.text} <span className="rounded bg-amber-50 px-1 text-[11px] text-amber-700">Estimated</span>
                  </span>
                </Tooltip>
              ) : (
                promised.text
              )
            }
          />
          {ltl && c.gateInAt && <Line k="Gate-in" v={formatDateTime(c.gateInAt)} />}
          {windowText(c.delivery) && <Line k="Delivery window" v={windowText(c.delivery)} />}
          {ltl ? (
            <Line k="Last mile" v={`${c.selfDelivered ? "Brought by the customer · " : ""}${c.lastMile === "PARTNER" ? TERMS.partnerNetwork : `Own ${TERMS.deliveryRun.toLowerCase()}`}`} />
          ) : (
            <Line k={TERMS.haulier} v={trip ? `${trip.haulierName}${trip.tractorPlate ? ` · ${trip.tractorPlate}` : ""}` : "No trip yet"} tone={trip ? "" : "text-amber-700"} />
          )}
        </div>
      </div>
      <div className={card}>
        <div className={cardLabel}>Load · {ltl ? TERMS.ltl : TERMS.ftl}</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          <Line k="Pieces" v={formatQty(l.pieces)} />
          <Line k={TERMS.palletPlaces} v={formatQty(l.palletPlaces)} />
          <Line k={TERMS.ldm} v={formatQty(l.ldm)} />
          <Line k="Weight" v={`${formatQty(l.weightKg)} kg${c.chargeableKg != null ? ` · chargeable ${formatQty(c.chargeableKg)} kg` : ""}`} />
          {l.cbm > 0 && <Line k="Volume" v={`${formatQty(l.cbm)} m³`} />}
          <Line
            k="Extras"
            v={
              [l.adr ? `${TERMS.adr} UN ${l.adrUn} cl. ${l.adrClass}${l.adrPackingGroup ? ` PG ${l.adrPackingGroup}` : ""}` : "", l.nonStackable ? "non-stackable" : "", l.tailLift ? TERMS.tailLift.toLowerCase() : "", l.b2c ? "B2C" : ""]
                .filter(Boolean)
                .join(", ") || "None"
            }
            tone={l.adr ? "text-amber-700" : ""}
          />
        </div>
      </div>
      <div className={card}>
        <div className={cardLabel}>Money</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {c.internal ? (
            <Line
              k="Internal price"
              v={
                internalPrice
                  ? `${formatMoney(internalPrice.amount, "CZK")}${internalPrice.notPriced ? " · Not priced" : ""}`
                  : `Priced from the ${TERMS.internalTariff.toLowerCase()} on delivery`
              }
              tone={internalPrice?.notPriced ? "text-red-600" : ""}
            />
          ) : (
            <Line k="Sell" v={c.sell ? `${formatMoney(c.sell.total, c.sell.currency)}${c.sell.currency !== "CZK" ? ` (${formatMoney(c.sell.totalCzk, "CZK")})` : ""}` : "Not priced"} />
          )}
          <Line k={buyLabel(c)} v={c.buyCzk != null ? formatMoney(c.buyCzk, "CZK") : ltl ? "With the trips' shares" : "With the trip"} />
          <Line k="Margin" v={marginText(c)} tone={marginBlocks(c) ? "text-red-600" : c.belowFloor ? "text-amber-700" : "text-emerald-700"} />
        </div>
        {c.belowFloor && (
          <div className={`mt-2 rounded-md px-2.5 py-1.5 text-[11.5px] ${c.marginApproved ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
            {c.marginApproval ? (
              <>
                Below the {TERMS.marginFloor.toLowerCase()} — approved by {c.marginApproval.byName} on {formatDateTime(c.marginApproval.at)} at {formatMoney(c.marginApproval.marginCzk, "CZK")}: “{c.marginApproval.reason}”
              </>
            ) : (
              <>
                <span className="font-semibold">Below the {TERMS.marginFloor.toLowerCase()}</span> — needs a manager&apos;s approval before the transport order goes out.
                <Tooltip title={approveMargin.allowed ? undefined : approveMargin.reason}>
                  <span className="mt-1.5 flex">
                    <button type="button" className={btnInline} disabled={!approveMargin.allowed} onClick={onApproveMargin}>
                      Approve margin…
                    </button>
                  </span>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
