"use client";

import { CheckCircleFilled, WarningFilled } from "@ant-design/icons";
import { formatDateTime } from "@/lib/date";
import { formatMoney } from "@/app/trucking/_lib/tariffs";
import { floorText, marginState, marginText, type RoadMargin } from "../../../_lib/roadQuote";
import { MiniButton } from "./QuoteButtons";

interface QuoteMarginPanelProps {
  margin: RoadMargin;
  // A manager may approve a margin below the floor.
  canApprove: boolean;
  onApprove: () => void;
}

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-[13px] font-semibold text-slate-800 tabular-nums whitespace-nowrap">{value}</div>
  </div>
);

// The margin of a road quote in CZK against the margin floor, as the server works it out from the
// stored lines: above the floor; below it and approved by a manager; or below it and waiting for
// one - then the quote cannot be sent or marked Ready to send.
export const QuoteMarginPanel = ({ margin, canApprove, onApprove }: QuoteMarginPanelProps) => {
  const state = marginState(margin);
  const tone = state === "needsApproval" ? "border-red-200 bg-red-50/60" : state === "approved" ? "border-green-200 bg-green-50/60" : "border-slate-200 bg-white";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
          <Figure label="Selling (CZK)" value={formatMoney(margin.sellingCzk, "CZK")} />
          <Figure label="Buying (CZK)" value={formatMoney(margin.buyingCzk, "CZK")} />
          <Figure label="Margin" value={marginText(margin.marginCzk, margin.marginPercent)} />
          <Figure label="Margin floor" value={floorText(margin)} />
        </div>
        {state === "needsApproval" && canApprove && !margin.problem && <MiniButton onClick={onApprove}>Approve margin…</MiniButton>}
      </div>

      {state === "needsApproval" && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-red-700">
          <WarningFilled className="mt-0.5" aria-hidden />
          <span>
            <b>Below margin floor.</b> Needs a manager&apos;s approval before the quote is sent or marked Ready to send.
            {margin.approval && !margin.approvalValid && ` The approval of ${marginText(margin.approval.marginCzk, margin.approval.marginPercent)} no longer covers it.`}
          </span>
        </div>
      )}
      {state === "approved" && margin.approval && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-green-800">
          <CheckCircleFilled className="mt-0.5" aria-hidden />
          <span>
            Approved by {margin.approval.byName} on {formatDateTime(margin.approval.at)}: {margin.approval.reason}
          </span>
        </div>
      )}
      {margin.problem && <div className="mt-1.5 text-[12.5px] text-amber-700">{margin.problem}</div>}
    </div>
  );
};
