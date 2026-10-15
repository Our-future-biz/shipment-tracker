"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Tooltip } from "antd";
import { CheckCircleFilled, ClockCircleOutlined, MinusCircleOutlined, RightOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { ConsignmentDetail, Leg } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { btnInline } from "@/app/warehouse/gate-log/_components/job/fields";
import { tripHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { legTimeline, promisedText, type LegTimelineState } from "../../_lib/planning";
import { formatMoney } from "../../_lib/tariffs";

const STATE_CLASS: Record<LegTimelineState, string> = {
  done: "border-emerald-200 bg-emerald-50/60",
  current: "border-indigo-300 bg-indigo-50/60",
  waiting: "border-slate-200 bg-white",
  skipped: "border-slate-200 bg-slate-50",
};

const StateIcon = ({ state }: { state: LegTimelineState }) => {
  if (state === "done") return <CheckCircleFilled className="text-emerald-600" aria-label="Done" />;
  if (state === "skipped") return <MinusCircleOutlined className="text-slate-400" aria-label="Not needed" />;
  return <ClockCircleOutlined className={state === "current" ? "text-indigo-600" : "text-slate-300"} aria-label={state === "current" ? "Now" : "Waiting"} />;
};

interface ConsignmentLegsTimelineProps {
  c: ConsignmentDetail;
  /** Opens the partner delivery dialog (LTL with the partner network); null = not allowed now. */
  onPartner: ((leg: Leg) => void) | null;
}

// The road of an LTL consignment through our warehouse: Pick-up run → At our warehouse → Line haul →
// Delivery, each step with its trip, the gate-in time the warehouse confirmed, and the promised date
// — "Estimated" until that gate-in, final after it.
export const ConsignmentLegsTimeline = ({ c, onPartner }: ConsignmentLegsTimelineProps) => {
  const steps = legTimeline(c);
  const promised = promisedText(c);
  const partnerLeg = c.lastMile === "PARTNER" ? (c.legs.find((l) => l.kind === "DELIVERY") ?? null) : null;

  return (
    <SectionCard
      title={`${TERMS.leg}s`}
      extra={
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          Promised <b className="text-slate-900">{promised.text}</b>
          {promised.estimated ? (
            <Tooltip title={promised.note}>
              <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">Estimated</span>
            </Tooltip>
          ) : (
            c.promisedDate && <span className="rounded bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">Final</span>
          )}
        </span>
      }
    >
      <ol className="m-0 flex list-none flex-wrap items-stretch gap-2 p-0" aria-label={`${TERMS.leg}s`}>
        {steps.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <RightOutlined className="self-center text-[10px] text-slate-300" aria-hidden />}
            <li className={`flex min-w-[170px] flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2 text-xs ${STATE_CLASS[s.state]}`}>
              <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                <StateIcon state={s.state} /> {s.label}
              </span>
              <span className="text-slate-600">{s.detail}</span>
              {s.at && <span className="font-mono text-[11px] text-slate-700">{businessDateTime(s.at)}</span>}
              {s.tripId && (
                <Link href={tripHref(s.tripId)} className="font-semibold text-indigo-600 hover:underline">
                  Open {TERMS.trip.toLowerCase()}
                </Link>
              )}
              {s.key === "delivery" && partnerLeg && (
                <span className="flex flex-wrap items-center gap-x-2">
                  {partnerLeg.buy ? <span className="tabular-nums text-slate-700">{formatMoney(partnerLeg.buy.total, partnerLeg.buy.currency)}</span> : <span className="text-amber-700">Partner not priced yet</span>}
                  {onPartner && (
                    <button type="button" className={btnInline} onClick={() => onPartner(partnerLeg)}>
                      {partnerLeg.haulierCustomerId ? "Change partner…" : "Set partner…"}
                    </button>
                  )}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
      {promised.estimated && <p className="mb-0 mt-2 text-[11px] text-slate-500">{promised.note}: the planned pick-up counts as the gate-in day until then.</p>}
    </SectionCard>
  );
};
