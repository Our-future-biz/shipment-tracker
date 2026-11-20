"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingMilestone } from "@/hooks/useShipmentTracking";
import { airWaybillOk } from "@/lib/airWaybill";
import { formatDate } from "@/lib/date";
import { FULL_LOAD } from "@/lib/enums";
import { EMPTY, EMPTY_STATE, HINT, LINK, REF, TD, TH } from "@/styles/ui";
import { RecordedBy } from "./RecordedBy";
import { CELL_LINE, CELL_TEXT, DATE_TEXT, GROUP_BAND, GROUP_GAP, MAIN_TEXT, TABLE, TABLE_BOX, TBODY, TROW } from "./trackingUi";
import { customerStateName, customerStates, type CustomerState } from "./trackingText";

const LEGS: { key: TrackingMilestone["leg"]; label: string }[] = [
  { key: "origin", label: "Origin" },
  { key: "main", label: "Main leg" },
  { key: "destination", label: "Destination" },
];

type RowState = TrackingMilestone["state"] | CustomerState;

const STATE_NAME: Record<RowState, string> = {
  done: "Done",
  next: "Next step",
  late: "Late",
  open: "Still to come",
  planned: "Planned date",
  unconfirmed: "Not yet confirmed",
};

const DOT_CLASS: Record<RowState, string> = {
  done: "border-emerald-600 bg-emerald-600",
  next: "border-indigo-600 bg-indigo-600",
  late: "border-amber-500 bg-amber-500",
  open: "border-slate-300 bg-white",
  planned: "border-slate-200 bg-slate-100",
  unconfirmed: "border-amber-500 bg-white",
};

// The state word's colour in the customer view, as the customer's link prints it (ShipmentStatusView).
const CUSTOMER_STATE_TEXT: Record<CustomerState, string> = {
  done: "text-emerald-700",
  next: "text-indigo-700",
  open: "text-slate-500",
  unconfirmed: "text-amber-700",
};

function MilestoneRow({ m, shownState, customerView, taxDateWords, onOpen, onTellPod }: { m: TrackingMilestone; shownState: RowState; customerView: boolean; taxDateWords: string; onOpen: (tab: string) => void; onTellPod: () => void }) {
  // The customer view shows what the customer's link shows (the server's publicStatusOf): a passed plan
  // is "not yet confirmed", never late, and of the details only the customs row's wording is meant for a customer.
  const state = shownState;
  const detail = customerView && m.key !== "customs" ? "" : m.detail;
  // In the customer view the state word is printed beside the step, in the link's words (User Council E2).
  const customerWord = customerView ? customerStateName(state as CustomerState, !!m.planned) : "";
  const name = customerWord || STATE_NAME[state];
  return (
    <tr className={TROW}>
      <td className={`${TD} !align-top`}>
        <div className="flex items-start gap-2.5 min-w-0">
          <span title={customerView ? undefined : name} aria-hidden={customerView || undefined} className={`mt-[3px] size-3 shrink-0 rounded-full border-2 ${DOT_CLASS[state]}`}>
            {!customerView && <span className="sr-only">{name}</span>}
          </span>
          <div className="min-w-0">
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${MAIN_TEXT}`}>
              {m.label}
              {customerWord && <span className={`text-[12px] font-medium ${CUSTOMER_STATE_TEXT[state as CustomerState]}`}>{customerWord}</span>}
              {/* what the tax date goes by, whether it is firm, the ČNB rates and an invoice, on the pill */}
              {m.taxDate && !customerView && (
                <Tooltip title={taxDateWords || undefined}>
                  <span className="inline-flex" tabIndex={taxDateWords ? 0 : undefined}>
                    <Pill tone="slate">Tax date</Pill>
                  </span>
                </Tooltip>
              )}
              {m.containerNumber && <Pill tone="indigo" className={REF}>{m.containerNumber}</Pill>}
            </div>
            {(m.basis || m.place) && <div className={HINT}>{[m.place, m.basis].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
      </td>
      <td className={`${TD} !align-top text-[13px] text-slate-700 ${DATE_TEXT}`}>
        {m.planned ? (
          <>
            {formatDate(m.planned)}
            {m.plannedTime && ` ${m.plannedTime}`}
            {/* the column is narrow, so on its own line, as the link prints it on a phone */}
            {customerView && state === "unconfirmed" && <div className={HINT}>not yet confirmed</div>}
          </>
        ) : (
          <span className={EMPTY}>—</span>
        )}
        {m.wasPlanned && <div className={`${HINT} !text-amber-700`}>was {formatDate(m.wasPlanned)}</div>}
      </td>
      <td className={`${TD} !align-top`}>
        <div className="flex flex-col items-start gap-1">
          {m.actual ? (
            <span className={`${MAIN_TEXT} ${DATE_TEXT}`}>
              {formatDate(m.actual)}
              {m.actualTime && ` ${m.actualTime}`}
            </span>
          ) : (
            !detail && !(m.lateDays > 0 && !customerView) && <span className={EMPTY}>—</span>
          )}
          {m.lateDays > 0 && !customerView && <Pill tone="amber">Late {m.lateDays} d</Pill>}
          {m.proposed && !customerView && (
            <Pill tone="indigo" title="Confirm it under Events to set the date">
              Proposed {formatDate(m.proposed.day)}{m.proposed.source && ` · ${m.proposed.source}`}
            </Pill>
          )}
          {/* under a date it is its second line; on its own it is the cell's value, in the grid's type */}
          {detail && <div className={m.actual ? HINT : CELL_TEXT}>{detail}</div>}
        </div>
      </td>
      {!customerView && (
        <td className={`${TD} !align-top text-[13px] text-slate-700`}>
          {m.key === "customs" && !m.recorded ? (
            <span className={CELL_LINE}>Follows the paperwork</span>
          ) : m.actual || m.planned ? (
            <RecordedBy recorded={m.recorded} />
          ) : (
            <span className={EMPTY}>—</span>
          )}
          {m.key === "pod" && (
            <span className="block mt-0.5 space-x-3">
              <button type="button" onClick={() => onOpen("documents")} className={`${LINK} cursor-pointer bg-transparent border-none p-0 text-[12px]`}>Open in Documents</button>
              <button type="button" onClick={onTellPod} className={`${LINK} cursor-pointer bg-transparent border-none p-0 text-[12px]`}>Send it to the customer</button>
            </span>
          )}
        </td>
      )}
    </tr>
  );
}

/** Where a ship is, on a public map. Only a sea job has one to look up. */
const vesselMapUrl = (vessel: string) => `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(vessel)}`;

/** What the main leg sails on: route, vessel, master job and containers. */
function MainLegFacts({ shipment, customerView, onOpen }: { shipment: ShipmentItem; customerView: boolean; onOpen: (tab: string) => void }) {
  const containers = (shipment.containers ?? []).map((c) => c.containerNumber).filter(Boolean);
  // A consolidation's house has no box of its own, and a truck or a plane carries none.
  const wantsContainer = shipment.loadType === FULL_LOAD && /sea|rail/i.test(shipment.freightMode ?? "");
  const route = [shipment.pol, shipment.pod].filter(Boolean).join(" → ");
  const vessel = [shipment.vessel, shipment.voyage].filter(Boolean).join(" ");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-normal normal-case tracking-normal text-slate-700">
      {route && <span>{route}</span>}
      {vessel && <span>{vessel}</span>}
      {shipment.vessel && !customerView && /sea/i.test(shipment.freightMode ?? "") && (
        <a href={vesselMapUrl(shipment.vessel)} target="_blank" rel="noopener noreferrer" className={LINK}>
          Where is the vessel?
        </a>
      )}
      {/air/i.test(shipment.freightMode ?? "") && shipment.masterBolNumber && (
        <span className={!customerView && !airWaybillOk(shipment.masterBolNumber) ? "text-amber-700" : undefined} title={!customerView && !airWaybillOk(shipment.masterBolNumber) ? "An air waybill is 3 + 8 digits, the last one the check digit: is this one mistyped?" : undefined}>
          MAWB {shipment.masterBolNumber}
        </span>
      )}
      {/air/i.test(shipment.freightMode ?? "") && shipment.houseBolNumber && <span>HAWB {shipment.houseBolNumber}</span>}
      {shipment.masterJobId && !customerView && (
        <Link href={`/master-jobs?open=${shipment.masterJobId}`} className={LINK}>
          Master job {shipment.masterJobMczNumber}
        </Link>
      )}
      {containers.map((c) => (
        <Pill key={c} tone="indigo" className={REF}>{c}</Pill>
      ))}
      {containers.length === 0 && wantsContainer && !customerView && (
        <button type="button" onClick={() => onOpen("container")} className={`${LINK} cursor-pointer bg-transparent border-none p-0 text-[12px]`}>
          No container yet
        </button>
      )}
    </span>
  );
}

interface TimelineCardProps {
  shipment: ShipmentItem;
  milestones: readonly TrackingMilestone[];
  /** Only what has happened. */
  actualsOnly: boolean;
  /** What can be told to a customer: no names, marks or who-recorded-it. */
  customerView: boolean;
  /** What the tax date (DUZP) goes by and the rates locked for it, in a line (the Tax date pill's tooltip). */
  taxDateWords: string;
  onOpen: (tab: string) => void;
  onTellPod: () => void;
}

/** The dated facts by leg, planned beside actual. */
export function TimelineCard({ shipment, milestones, actualsOnly, customerView, taxDateWords, onOpen, onTellPod }: TimelineCardProps) {
  const rows = actualsOnly ? milestones.filter((m) => m.state === "done") : milestones;
  // Worked out over the whole list, as the link does: which step is next depends on the steps before it.
  const shownForCustomer = customerStates(milestones);
  const nothingDated = milestones.every((m) => !m.planned && !m.actual && !m.detail);
  const columns = customerView ? 3 : 4;

  return (
    <SectionCard title="Timeline" extra={<span className={HINT}>Dates as recorded · times in Prague</span>} bodyClassName="p-0">
      {nothingDated && (
        <p className={`${HINT} m-0 px-6 pt-4`}>
          Nothing planned yet.
          {!customerView && (
            <>
              {" "}
              <button type="button" onClick={() => onOpen("details")} className={`${LINK} cursor-pointer bg-transparent border-none p-0 text-[12px]`}>
                Add ETD and ETA in Shipment Details
              </button>
              .
            </>
          )}
        </p>
      )}
      {rows.length === 0 ? (
        <p className={EMPTY_STATE}>No actual dates recorded yet</p>
      ) : (
        <div className={TABLE_BOX}>
          <table className={`${TABLE} ${customerView ? "min-w-[560px]" : "min-w-[960px]"}`}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Milestone</th>
                <th scope="col" className={`${TH} w-[110px]`}>Planned</th>
                <th scope="col" className={`${TH} w-[250px]`}>Actual</th>
                {!customerView && <th scope="col" className={`${TH} w-[370px]`}>Recorded</th>}
              </tr>
            </thead>
            {LEGS.filter((leg) => rows.some((m) => m.leg === leg.key)).map((leg, li) => {
              const ofLeg = rows.filter((m) => m.leg === leg.key);
              return (
                <tbody key={leg.key} className={TBODY}>
                  {/* Air between the legs (none above the first, which sits under the column heads). */}
                  {li > 0 && (
                    <tr aria-hidden>
                      <td colSpan={columns} className={GROUP_GAP} />
                    </tr>
                  )}
                  <tr>
                    <th scope="rowgroup" colSpan={columns} className={GROUP_BAND}>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>{leg.label}</span>
                        {leg.key === "main" && <MainLegFacts shipment={shipment} customerView={customerView} onOpen={onOpen} />}
                      </span>
                    </th>
                  </tr>
                  {ofLeg.map((m) => (
                    <MilestoneRow key={m.key} m={m} shownState={customerView ? (shownForCustomer.get(m.key) ?? "open") : m.state} customerView={customerView} taxDateWords={taxDateWords} onOpen={onOpen} onTellPod={onTellPod} />
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </SectionCard>
  );
}
