"use client";

import { CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, WarningFilled } from "@ant-design/icons";
import { businessDateTime } from "@/lib/date";
import { formatAmount as formatMoney } from "@/lib/money";
import { floorText, marginState, marginText, type RoadMargin } from "../../../_lib/roadQuote";
import { MiniButton } from "./QuoteButtons";
import type { MarginInquiryItem } from "@/hooks/useMarginInquiries";

interface QuoteMarginPanelProps {
  margin: RoadMargin;
  // A manager may approve a margin below the floor.
  canApprove: boolean;
  onApprove: () => void;
  // The newest question to a manager about this quote's margin, and the rep's ask / withdraw.
  inquiry?: MarginInquiryItem | null;
  onAsk?: () => void;
  onWithdraw?: (inquiryId: string) => void;
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
export const QuoteMarginPanel = ({ margin, canApprove, onApprove, inquiry, onAsk, onWithdraw }: QuoteMarginPanelProps) => {
  const state = marginState(margin);
  const waiting = inquiry?.status === "pending" ? inquiry : null;
  // A rejection still matters while the margin waits for an approval.
  const rejected = state === "needsApproval" && inquiry?.status === "rejected" ? inquiry : null;
  // Anybody below the floor may ask a manager (Council Outlay 6); a manager may also approve at once.
  const canAsk = state === "needsApproval" && !margin.problem && !waiting && !canApprove && !!onAsk;
  const tone = state === "needsApproval" ? "border-red-200 bg-red-50/60" : state === "approved" ? "border-green-200 bg-green-50/60" : "border-slate-200 bg-white";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
          <Figure label="Selling (CZK)" value={formatMoney(margin.sellingCzk, "CZK")} />
          <Figure label="Buying (CZK)" value={formatMoney(margin.buyingCzk, "CZK")} />
          <Figure label="Margin" value={marginText(margin.marginCzk, margin.marginPercent)} />
          <Figure label={`Margin floor · ${margin.mode}`} value={floorText(margin)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canAsk && <MiniButton onClick={onAsk}>{rejected ? "Ask again…" : "Ask for approval…"}</MiniButton>}
          {state === "needsApproval" && canApprove && !margin.problem && <MiniButton onClick={onApprove}>Approve margin…</MiniButton>}
        </div>
      </div>

      {state === "needsApproval" && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-red-700">
          <WarningFilled className="mt-0.5" aria-hidden />
          <span>
            <b>{margin.noBuying ? "No buying lines." : "Below margin floor."}</b>{" "}
            {margin.noBuying ? "Without buying the margin can't be judged: enter the buying, or a manager approves it." : "Needs a manager's approval before the quote is sent or marked Ready to send."}
            {margin.approval &&
              !margin.approvalValid &&
              ` The approval of ${marginText(margin.approval.marginCzk, margin.approval.marginPercent)} no longer covers it${margin.approvalEnded ? `: ${margin.approvalEnded}` : ""}.`}
          </span>
        </div>
      )}
      {waiting && (
        <div className="mt-2 flex flex-wrap items-start gap-1.5 text-[12.5px] text-amber-800">
          <ClockCircleFilled className="mt-0.5" aria-hidden />
          <span className="min-w-0">
            <b>Waiting for a manager</b> · asked by {waiting.requestedByName || "a colleague"} on {businessDateTime(waiting.requestedAt)} ({waiting.reason})
            {waiting.notifyName ? ` · ${waiting.notifyName} is told` : " · the admins are told"}
          </span>
          {onWithdraw && (
            <button type="button" onClick={() => onWithdraw(waiting.id)} className="ml-1 p-0 border-none bg-transparent text-[12.5px] font-semibold text-amber-800 underline cursor-pointer">
              Withdraw
            </button>
          )}
        </div>
      )}
      {rejected && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-red-700">
          <CloseCircleFilled className="mt-0.5" aria-hidden />
          <span>
            <b>Rejected</b> by {rejected.decidedByName || "a manager"}
            {rejected.decidedAt ? ` on ${businessDateTime(rejected.decidedAt)}` : ""}: {rejected.comment}
          </span>
        </div>
      )}
      {state === "approved" && margin.approval && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-green-800">
          <CheckCircleFilled className="mt-0.5" aria-hidden />
          <span>
            Approved by {margin.approval.byName} on {businessDateTime(margin.approval.at)}: {margin.approval.reason}
          </span>
        </div>
      )}
      {margin.problem && <div className="mt-1.5 text-[12.5px] text-amber-700">{margin.problem}</div>}
    </div>
  );
};
