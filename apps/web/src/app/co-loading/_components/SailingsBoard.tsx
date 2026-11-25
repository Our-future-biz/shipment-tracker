"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoardProfits, useCoLoadingBoard } from "@/hooks/useCoLoadingServices";
import { businessToday, formatDate } from "@/lib/date";
import { BTN, CARD, EMPTY_STATE, HINT, LINK, REF, TD, TH } from "@/styles/ui";
import { byCutoff, freeWords, sailingAttention, serviceAttention } from "../_lib/attention";
import { containersWords } from "../_lib/boxUtilization";
import { profitGlance } from "../_lib/earnings";
import { CUTOFF_TONE, cutoffState, cutoffWords, sailingHref, sailingTitle } from "../_lib/sailings";
import { AttentionChips } from "./AttentionChips";
import { SailingStagePill } from "./SailingStageControl";
import { BoxFillChip } from "./BoxFillChip";

// The board of all services (Council Outlay 14, A6): every open service's sailings still to come in
// one table, by cut-off, each with the room left in its box and what needs a look - the morning's
// "what closes this week?" and sales' "can I still take 8 cbm?" without opening a service. Above it,
// the services that have shipments waiting or no sailing ahead. For everyone, without money; managers
// and admins also see each sailing's profit (D8).
export function SailingsBoard({ isManager }: { isManager: boolean }) {
  const { board, isLoading, isError, refetch } = useCoLoadingBoard();
  const { profits, isLoading: profitsLoading } = useBoardProfits(isManager);
  const router = useRouter();
  const today = businessToday();

  if (isLoading) return <p className={`${HINT} m-0`}>Loading the sailings…</p>;
  if (isError || !board)
    return (
      <p className={`${HINT} m-0 flex flex-wrap items-center gap-2`} role="alert">
        Could not load the sailings.
        <button type="button" className={BTN} onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    );

  const sailings = byCutoff(board.sailings);
  const services = board.services.map((s) => ({ ...s, flags: serviceAttention(s, board.sailings.filter((x) => x.serviceId === s.id).length) })).filter((s) => s.flags.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {services.length > 0 && (
        <section className={`${CARD} px-4 py-3`} aria-label="Services that need a look">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <Link href={`/co-loading/${s.id}`} className={`${LINK} font-semibold`}>
                  {s.name}
                </Link>
                <AttentionChips flags={s.flags} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} px-4 py-3`} aria-label="Sailings still to come">
        {sailings.length === 0 ? (
          <p className={`${EMPTY_STATE} m-0 !py-4`}>No sailing is still to come. Create the next one on its service&apos;s page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Service</th>
                  <th className={TH}>Sailing</th>
                  <th className={TH}>Cut-off</th>
                  <th className={TH}>Departure</th>
                  <th className={TH}>Box utilization</th>
                  <th className={TH}>Room left</th>
                  <th className={`${TH} !text-right`}>Shipments</th>
                  <th className={TH}>Needs a look</th>
                  {isManager && <th className={`${TH} !text-right`}>Profit</th>}
                </tr>
              </thead>
              <tbody>
                {sailings.map((s) => {
                  const near = cutoffWords(s.cutoffDate, today);
                  const profit = profits.get(s.id);
                  const glance = isManager && !profitsLoading ? profitGlance(profit) : null;
                  // Managers also hear of a box with no costs close to its departure; nobody else learns whether costs are set.
                  const flags = sailingAttention(s, today, isManager && profit ? profit.boxCostsSet : undefined);
                  return (
                    // A sailing opens its own page: by its name (a link, so it also opens in a new tab) or anywhere on its row.
                    <tr key={s.id} onClick={() => router.push(sailingHref(s))} className="cursor-pointer hover:bg-slate-50">
                      <td className={TD}>{s.serviceLabel}</td>
                      <td className={TD}>
                        <Link href={sailingHref(s)} onClick={(e) => e.stopPropagation()} className={`${LINK} ${REF} font-semibold`}>
                          {sailingTitle(s)}
                        </Link>{" "}
                        <SailingStagePill sailing={s} />
                        <span className="block text-[11px] text-slate-500">{containersWords(s)}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {formatDate(s.cutoffDate) || "—"}
                        {near && <span className={`block text-[11px] font-medium ${CUTOFF_TONE[cutoffState(s.cutoffDate, today)]}`}>{near}</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatDate(s.departureDate) || "—"}</td>
                      <td className={TD}>{s.fill ? <BoxFillChip fill={s.fill} /> : "—"}</td>
                      <td className={`${TD} whitespace-nowrap tabular-nums ${(s.free.cbm ?? 0) < 0 || (s.free.kg ?? 0) < 0 ? "font-semibold text-red-600" : ""}`}>{freeWords(s.free)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.fill ? s.fill.shipments : "—"}</td>
                      <td className={TD}>
                        <AttentionChips flags={flags} quiet="In order" />
                      </td>
                      {isManager && (
                        <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
                          {!glance ? (
                            "…"
                          ) : profit && profit.moneyKnown && !profit.boxCostsSet ? (
                            <span className="text-slate-400" title="No box costs yet: the profit shows once they are set on the sailing's Earnings tab.">
                              —
                            </span>
                          ) : (
                            <span className="inline-flex flex-col items-end leading-tight">
                              <span className={glance.tone === "red" ? "font-semibold text-red-600" : glance.tone === "amber" ? "text-amber-700" : glance.tone === "slate" ? "text-slate-500" : "font-semibold"}>{glance.main}</span>
                              {glance.note && <span className="text-[11px] text-slate-500">{glance.note}</span>}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className={`${HINT} m-0`}>Every open service&apos;s sailings that have not left yet, by cut-off. A sailing leaves the board once its departure date has passed or it is set to Departed; one with no departure date stays until then.</p>
    </div>
  );
}
