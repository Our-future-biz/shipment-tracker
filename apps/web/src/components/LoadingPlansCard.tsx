"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useLoadingPlans } from "@/hooks/useLoadingPlans";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { formatKg } from "@/app/loading-planner/_lib/units";
import { BTN_BAR, EMPTY_STATE, LINK, TD, TH } from "@/styles/ui";

interface LoadingPlansCardProps {
  kind: interfaces.PlanLinkKind;
  /** The shipment's or the quote's id. */
  id: string;
  /** What a new plan is opened with: the shipment's id, or the quote's reference. */
  newPlanKey: string;
  /** The job has no cargo lines a plan could start from: the card then shows only when plans exist. */
  onlyWithPlans?: boolean;
  /**
   * Sends what the job's page has not saved yet and resolves once the server has it: a new plan reads
   * the job's cargo from the server. False when the save was refused (the page says why): no plan opens.
   */
  beforeNewPlan?: () => Promise<boolean>;
}

// The loading plans linked to a shipment or a quote, on that job's page, and the way to a new one
// that starts with the job's cargo. A plan never changes the job.
export function LoadingPlansCard({ kind, id, newPlanKey, onlyWithPlans = false, beforeNewPlan }: LoadingPlansCardProps) {
  const { plans, isLoading, isError } = useLoadingPlans({ kind, id });
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  if (onlyWithPlans && plans.length === 0) return null;

  const newPlanHref = `/loading-planner/new?${kind}=${encodeURIComponent(newPlanKey)}`;
  // A plain click waits for the job's last edit to be saved, then opens the plan. Still a link: a
  // middle click or one with a modifier key opens the plan in another tab, as a link does.
  const handleNewPlan = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!beforeNewPlan || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (await beforeNewPlan()) router.push(newPlanHref);
    } finally {
      setSaving(false);
    }
  };

  let empty: string | null = null;
  if (isLoading) empty = "Loading…";
  else if (isError) empty = "Could not load the loading plans.";
  else if (plans.length === 0) empty = `No loading plan yet. New loading plan starts one with the cargo of this ${kind}.`;

  return (
    <SectionCard
      title="Loading plans"
      bodyClassName="p-0"
      extra={
        <>
          {plans.length > 0 && <CountChip count={plans.length} />}
          <Link href={newPlanHref} onClick={handleNewPlan} aria-busy={saving} className={`${BTN_BAR} no-underline`}>
            {saving ? <LoadingOutlined /> : <PlusOutlined />}
            New loading plan
          </Link>
        </>
      }
    >
      {empty ? (
        <p className={`${EMPTY_STATE} m-0`}>{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} !pl-4`}>Plan</th>
                <th className={`${TH} !text-right`}>Colli</th>
                <th className={`${TH} !text-right`}>Weight</th>
                <th className={TH}>Last saved</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className={`${TD} !pl-4`}>
                    <Link href={`/loading-planner/${plan.id}`} className={`${LINK} font-medium`}>
                      {plan.name}
                    </Link>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{plan.colli.toLocaleString("en-US")}</td>
                  <td className={`${TD} text-right tabular-nums`}>{formatKg(plan.weightKg)}</td>
                  <td className={TD}>
                    {formatDateTime(plan.updatedAt)}
                    <span className="text-slate-500"> · {plan.updatedBy}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
