"use client";

import { useMemo } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/AppModal";
import { useLoadingPlan } from "@/hooks/useLoadingPlans";
import { usePlannerSettings } from "@/hooks/usePlannerSettings";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { planLoad } from "@/app/loading-planner/_lib/plan";
import { boxesWords, droppedTypes, gaugeWords, planForQuote, putOnQuoteRefusal, type QuoteBox, type QuoteGauge } from "@/app/loading-planner/_lib/planOnQuote";
import { HINT, LABEL_TEXT } from "@/styles/ui";

interface PlanToQuoteModalProps {
  /** The plan to put on the quote; null keeps the dialog closed. */
  planId: string | null;
  onClose: () => void;
  /** The quote as it is on screen now. */
  containers: QuoteBox[];
  oog: QuoteGauge | undefined;
  containerQuote: boolean;
  closed: boolean;
  /** Writes the plan's container lines, and its out-of-gauge block where it has one, into the quote on screen. */
  onConfirm: (containers: QuoteBox[], oog: Required<QuoteGauge> | null) => void;
}

function Change({ what, now, next }: { what: string; now: string; next: string }) {
  const same = now === next;
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className={LABEL_TEXT}>{what}</div>
      <div className="mt-1 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 text-[13px]">
        <span className="text-slate-500">Now</span>
        <span className={same ? "text-slate-700" : "text-slate-500 line-through"}>{now}</span>
        <span className="text-slate-500">From the plan</span>
        <span className="font-medium text-slate-900">
          {next}
          {same && <span className="ml-2 font-normal text-slate-500">(no change)</span>}
        </span>
      </div>
    </div>
  );
}

// "Put the plan on the quote" (Council Outlay 14, P7, D20): the plan's equipment offered as the
// quote's container lines and its cargo's measures as the out-of-gauge block, old against new,
// written into the quote on screen only on Confirm - and saved by the quote like any other edit.
// The plan is worked out anew here from its saved cargo, with the company's rules of today.
export default function PlanToQuoteModal({ planId, onClose, containers, oog, containerQuote, closed, onConfirm }: PlanToQuoteModalProps) {
  const { plan, isLoading, error } = useLoadingPlan(planId);
  const { rules } = usePlannerSettings();
  const found = useMemo(() => (plan ? planForQuote(planLoad(plan.lines, plan.nominated ?? undefined, rules)) : null), [plan, rules]);
  const refusal = found ? putOnQuoteRefusal(found, { containerQuote, closed }) : null;
  const dropped = found ? droppedTypes(containers, found.containers) : [];

  let waiting: string | null = null;
  if (planId && !plan) waiting = isLoading || !error ? "Reading the plan…" : isNotFound(error) ? "This plan does not exist, or it was deleted." : apiErrorMessage(error);

  return (
    <AppModal
      open={planId !== null}
      onClose={onClose}
      size="large"
      title={plan ? `Put "${plan.name}" on the quote` : "Put the plan on the quote"}
      subtitle="The plan's containers become the quote's container lines. The quote saves the change like any other edit of it."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            disabled={!found || refusal !== null}
            onClick={() => {
              if (!found) return;
              onConfirm(found.containers, found.oog);
              onClose();
            }}
          >
            Put on the quote
          </Button>
        </div>
      }
    >
      {waiting ? (
        <p className="m-0 text-[13px] text-slate-700" role="status">
          {waiting}
        </p>
      ) : (
        found && (
          <div className="flex flex-col gap-3">
            <Change what="Containers" now={boxesWords(containers)} next={boxesWords(found.containers)} />
            {/* The out-of-gauge block is written only for a plan with an open top or a flat rack; else it is left as it is. */}
            {found.oog ? (
              <Change what="Out of gauge" now={gaugeWords(oog)} next={gaugeWords(found.oog)} />
            ) : (
              <p className={`${HINT} m-0`}>The plan uses no open top or flat rack: the quote&apos;s out-of-gauge answers are left as they are.</p>
            )}
            {found.notLoaded > 0 && (
              <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
                {found.notLoaded === 1 ? "1 colli of the plan is" : `${found.notLoaded} colli of the plan are`} not loaded: these containers do not hold all the cargo.
              </p>
            )}
            {/* A charge priced per container of a type the quote no longer has counts nothing: said before, not found out after. */}
            {!refusal && dropped.length > 0 && (
              <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
                {dropped.join(" and ")} {dropped.length === 1 ? "leaves" : "leave"} the quote: charges priced per such container count 0 until the new equipment is priced in Pricing.
              </p>
            )}
            {refusal ? (
              <p className="m-0 text-[13px] text-red-600" role="alert">
                {refusal}
              </p>
            ) : (
              <p className={`${HINT} m-0`}>
                The quote&apos;s present container lines are replaced, with the cargo weight per container from the plan. Prices charged per container follow the new numbers, as when
                you change the lines by hand. Out-of-gauge figures are the plan&apos;s cargo against the same table the quote uses.
              </p>
            )}
          </div>
        )
      )}
    </AppModal>
  );
}
