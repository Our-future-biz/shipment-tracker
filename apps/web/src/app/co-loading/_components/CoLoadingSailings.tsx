"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useCoLoadingSailings, useSailingProfits } from "@/hooks/useCoLoadingServices";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessToday, formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN_PRIMARY, CARD, EMPTY_STATE, HEADING, LINK, REF, TD, TH } from "@/styles/ui";
import { containersWords } from "../_lib/boxUtilization";
import { profitGlance } from "../_lib/earnings";
import { SailingStagePill } from "./SailingStageControl";
import { CUTOFF_TONE, cutoffState, cutoffWords, nextSailingStart, sailingHref, sailingsInOrder } from "../_lib/sailings";
import { canManageServices } from "../_lib/services";
import { BoxFillChip } from "./BoxFillChip";
import { CreateSailingModal } from "./CreateSailingModal";

/** A sailing's profit in the list: the figure, with its margin and any remark underneath. */
function ProfitCell({ profit }: { profit: Parameters<typeof profitGlance>[0] }) {
  const glance = profitGlance(profit);
  // No box costs yet: a quiet dash with the words to hover, so a new service's list is not a column of the same sentence.
  if (profit && profit.moneyKnown && !profit.boxCostsSet)
    return (
      <span className="text-slate-400" title="No box costs yet: the profit shows once they are set on the sailing's Earnings tab.">
        —
      </span>
    );
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={glance.tone === "red" ? "font-semibold text-red-600" : glance.tone === "amber" ? "text-amber-700" : glance.tone === "slate" ? "text-slate-500" : "font-semibold"}>{glance.main}</span>
      {glance.note && <span className="text-[11px] text-slate-500">{glance.note}</span>}
    </span>
  );
}

// A Co-Loading Concept service's sailings over its shipments: those still to come by departure, the
// soonest first, then the ones that have left, folded away (Council Outlay 14, A2). "Create new
// sailing" on the right, above the grid's Export. A closed service takes no new sailing until it is reopened.
export function CoLoadingSailings({ serviceId, closed, frequency }: { serviceId: string; closed: boolean; /** weekly | bi_weekly | ad_hoc: how far the next sailing is moved on */ frequency: string }) {
  const { sailings, isLoading, isError, create } = useCoLoadingSailings(serviceId);
  // Managers and admins see each sailing's profit (Council Outlay 13, D19); nobody else asks for it.
  const { user } = useAuth();
  const isManager = canManageServices(user?.role);
  const { profits, isLoading: profitsLoading } = useSailingProfits(serviceId, isManager);
  const message = useMessages();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showDeparted, setShowDeparted] = useState(false);
  const today = businessToday();
  const { coming, departed } = sailingsInOrder(sailings, today);
  // With nothing to come, the ones that left are the list.
  const departedShown = showDeparted || coming.length === 0;
  const shown = departedShown ? [...coming, ...departed] : coming;

  const button = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      disabled={closed}
      className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <PlusOutlined />
      Create new sailing
    </button>
  );

  let empty: string | null = null;
  if (isLoading) empty = "Loading sailings…";
  else if (isError) empty = "Could not load the sailings.";
  else if (sailings.length === 0)
    empty = closed
      ? "No sailings."
      : "No sailings yet - create the first one with Create new sailing.";

  return (
    <section className={`${CARD} px-4 py-3`} aria-label="Sailings">
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Sailings</h2>
        {closed ? (
          <Tooltip title="The service is closed: it takes no new sailing until it is reopened.">
            {/* A disabled button takes no hover: the span around it shows the reason. */}
            <span className="inline-flex">{button}</span>
          </Tooltip>
        ) : (
          button
        )}
      </div>
      {empty ? (
        <p className={`${EMPTY_STATE} m-0 !py-4`}>{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Vessel</th>
                <th className={TH}>Voyage</th>
                <th className={TH}>Port of Loading</th>
                <th className={TH}>Port of Discharge</th>
                <th className={TH}>HUB</th>
                <th className={TH}>Container Type</th>
                <th className={TH}>Box utilization</th>
                <th className={`${TH} !text-right`}>Shipments</th>
                <th className={TH}>Cut-off</th>
                <th className={TH}>Departure</th>
                {isManager && <th className={`${TH} !text-right`}>Profit</th>}
                <th className={TH}>Created</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const left = departed.includes(s);
                // How near the cut-off is, while the sailing is still to come: amber from 3 days before (Council Outlay 14, D9), red once passed.
                const near = left ? "" : cutoffWords(s.cutoffDate, today);
                const cutoffTone = CUTOFF_TONE[cutoffState(s.cutoffDate, today)];
                return (
                // A sailing opens its own page: by its vessel (a link, so it also opens in a new tab) or anywhere on its row.
                <tr
                  key={s.id}
                  onClick={() => router.push(sailingHref(s))}
                  className={`cursor-pointer hover:bg-slate-50 ${left ? "text-slate-500 [&_td]:!text-slate-500" : ""}`}
                >
                  <td className={TD}>
                    <Link
                      href={sailingHref(s)}
                      onClick={(e) => e.stopPropagation()}
                      className={`${LINK} ${REF} font-semibold`}
                    >
                      {s.vessel}
                    </Link>{" "}
                    <SailingStagePill sailing={s} />
                  </td>
                  <td className={TD}>{s.voyage || "—"}</td>
                  <td className={TD}>{s.pol}</td>
                  <td className={TD}>{s.pod}</td>
                  <td className={TD}>{s.hub}</td>
                  <td className={TD}>{containersWords(s)}</td>
                  <td className={TD}>{s.fill ? <BoxFillChip fill={s.fill} /> : "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.fill ? s.fill.shipments : "—"}</td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {formatDate(s.cutoffDate) || "—"}
                    {near && <span className={`ml-1.5 text-[11px] font-medium ${cutoffTone}`}>{near}</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {formatDate(s.departureDate) || "—"}
                    {left && <span className="ml-1.5 text-[11px] font-medium">left</span>}
                  </td>
                  {isManager && <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{profitsLoading ? "…" : <ProfitCell profit={profits.get(s.id)} />}</td>}
                  <td className={`${TD} whitespace-nowrap text-slate-500`}>
                    {formatDate(s.createdAt)}
                    {s.createdByName ? ` · ${s.createdByName}` : ""}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {/* The sailings that have left stay in the app, a click away. */}
          {coming.length > 0 && departed.length > 0 && (
            <button type="button" className={`${LINK} mt-2 cursor-pointer border-0 bg-transparent p-0 text-[12px]`} aria-expanded={departedShown} onClick={() => setShowDeparted((v) => !v)}>
              {departedShown ? "Hide" : "Show"} the {departed.length === 1 ? "1 sailing that has left" : `${departed.length} sailings that have left`}
            </button>
          )}
        </div>
      )}

      <CreateSailingModal
        open={creating}
        onClose={() => setCreating(false)}
        saving={create.isPending}
        start={nextSailingStart(sailings, frequency, today)}
        onCreate={async (input) => {
          const { sailing } = await create.mutateAsync(input);
          message.success(
            `Sailing ${sailing.vessel}${sailing.voyage ? ` ${sailing.voyage}` : ""} created`,
          );
          return sailing;
        }}
      />
    </section>
  );
}
