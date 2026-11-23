"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "antd";
import { DeleteOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { ShippingContainerIcon } from "@phosphor-icons/react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useLoadingPlans, useLoadingPlanWrites } from "@/hooks/useLoadingPlans";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN, BTN_PRIMARY, CARD, EMPTY, EMPTY_STATE, HINT, ICON_BTN_DANGER, LINK, PAGE_SUBTITLE, PAGE_TITLE, REF, TD, TH } from "@/styles/ui";
import { formatKg } from "../_lib/units";
import { PlannerSettingsModal } from "./PlannerSettingsModal";

const LINK_KIND_LABEL: Record<interfaces.PlanLinkKind, string> = { shipment: "Shipment", quote: "Quote" };

// The Loading Planner's own page: every saved plan of the company, last saved first, a search over
// their names and linked jobs, and New plan. Every user sees and may change all plans.
export function LoadingPlannerOverview() {
  const { plans, capped, isLoading, isError } = useLoadingPlans();
  const { deletePlan, isDeleting } = useLoadingPlanWrites();
  const message = useMessages();
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<interfaces.LoadingPlanSummary | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? plans.filter((plan) => `${plan.name} ${plan.linkRef}`.toLowerCase().includes(q)) : plans;
  }, [plans, query]);

  let empty: string | null = null;
  if (isLoading) empty = "Loading plans…";
  else if (isError) empty = "Could not load the plans.";
  else if (plans.length === 0) empty = "No plans saved yet. Start one with New plan.";
  else if (shown.length === 0) empty = "No plan matches this search.";

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deletePlan(deleting.id);
      message.success(`Plan "${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="bg-slate-50 min-h-full px-4 py-6 sm:px-8">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ShippingContainerIcon size={22} weight="fill" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className={PAGE_TITLE}>Loading Planner</h1>
            <p className={`${PAGE_SUBTITLE} mt-0.5`}>Works out which containers a cargo needs and how it is loaded into them.</p>
          </div>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-3 ${CARD} px-4 py-3`}>
          <Link href="/loading-planner/new" className={`${BTN_PRIMARY} no-underline !text-white`}>
            <PlusOutlined />
            New plan
          </Link>
          <div className="flex flex-1 basis-[220px] justify-center min-w-[200px]">
            <Input
              placeholder="Search by plan name or job number…"
              aria-label="Search plans"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              allowClear
              className="w-[320px] max-w-full"
            />
          </div>
          <button type="button" className={BTN} onClick={() => setSettingsOpen(true)}>
            <SettingOutlined />
            Settings
          </button>
        </div>

        {capped && (
          <p className={`${HINT} m-0`} role="status">
            Only the 500 plans saved last are listed. An older plan still opens from its shipment or quote.
          </p>
        )}

        <div className={`${CARD} overflow-x-auto`}>
          {empty ? (
            <p className={`${EMPTY_STATE} m-0`}>{empty}</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} !pl-4`}>Plan</th>
                  <th className={TH}>Linked to</th>
                  <th className={`${TH} !text-right`}>Colli</th>
                  <th className={`${TH} !text-right`}>Weight</th>
                  <th className={TH}>Last saved</th>
                  <th className={TH}>Made by</th>
                  <th className={`${TH} w-[44px]`} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50">
                    <td className={`${TD} !pl-4`}>
                      <Link href={`/loading-planner/${plan.id}`} className={`${LINK} font-medium`}>
                        {plan.name}
                      </Link>
                    </td>
                    <td className={TD}>
                      {plan.linkKind ? (
                        <span>
                          {LINK_KIND_LABEL[plan.linkKind]} <span className={REF}>{plan.linkRef}</span>
                        </span>
                      ) : (
                        <span className={EMPTY}>—</span>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{plan.colli.toLocaleString("en-US")}</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatKg(plan.weightKg)}</td>
                    <td className={TD}>
                      {formatDateTime(plan.updatedAt)}
                      <span className="text-slate-500"> · {plan.updatedBy}</span>
                    </td>
                    <td className={TD}>{plan.createdBy}</td>
                    <td className={TD}>
                      <button type="button" className={ICON_BTN_DANGER} aria-label={`Delete plan ${plan.name}`} onClick={() => setDeleting(plan)}>
                        <DeleteOutlined />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <PlannerSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The plan disappears from this list for everyone. A shipment or quote it is linked to is not changed."
        confirmLabel="Delete plan"
        danger
        loading={isDeleting}
      />
    </div>
  );
}
