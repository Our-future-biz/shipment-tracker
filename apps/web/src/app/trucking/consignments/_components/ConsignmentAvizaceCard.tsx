"use client";

import { Tooltip } from "antd";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { Badge } from "@/app/warehouse/gate-log/_lib/gate";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { businessDateTime } from "@/lib/date";
import { AVIZACE_BADGE, AVIZACE_CHANNEL_LABELS, agreedWindowText, avizaceState } from "../../_lib/avizace";
import { TERMS } from "../../_lib/glossary";

interface ConsignmentAvizaceCardProps {
  c: ConsignmentDetail;
  onTemplate: () => void;
  onRecord: () => void;
}

// Avizace of the consignment: whether it is needed, how it was agreed, and the text to copy.
export const ConsignmentAvizaceCard = ({ c, onTemplate, onRecord }: ConsignmentAvizaceCardProps) => {
  const state = avizaceState(c);
  const badge = AVIZACE_BADGE[state];
  const a = c.avizace;
  const closed = c.status === "CANCELLED";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{TERMS.avizace}</span>
      <Tooltip title={badge.hint}>
        <span className="inline-flex">
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </span>
      </Tooltip>
      {a ? (
        <span className="min-w-0 flex-1 text-xs text-slate-700">
          {AVIZACE_CHANNEL_LABELS[a.channel]} · {a.contact}
          {agreedWindowText(a.agreedFrom, a.agreedTo) && <span className="font-semibold"> · agreed {agreedWindowText(a.agreedFrom, a.agreedTo)}</span>}
          {a.note && <span className="text-slate-500"> · “{a.note}”</span>}
          <span className="text-slate-400">
            {" "}
            — recorded {businessDateTime(a.at)}
            {a.by ? ` by ${a.by}` : ""}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-xs text-slate-500">
          {state === "pending"
            ? `${c.load.b2c ? "B2C delivery" : "The delivery stop asks for it"} — agree the delivery with the consignee before the ${c.scope === "LTL" ? TERMS.deliveryRun.toLowerCase() : "trip"}.`
            : "Not needed for this delivery; record one anyway if you agreed a time."}
        </span>
      )}
      {!closed && (
        <span className="flex gap-2">
          <button type="button" className={btnDefault} onClick={onTemplate}>
            Avizace text…
          </button>
          <button type="button" className={state === "pending" ? btnPrimary : btnDefault} onClick={onRecord}>
            {a ? "Record again…" : "Record avizace…"}
          </button>
        </span>
      )}
    </div>
  );
};
