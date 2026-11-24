"use client";

import Link from "next/link";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useServiceTrend } from "@/hooks/useCoLoadingServices";
import { formatDate } from "@/lib/date";
import { EMPTY_STATE, HINT, LINK, REF, TD, TH } from "@/styles/ui";
import { trendArrow, trendWords } from "../_lib/earnings";

const eur = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Arrow({ way }: { way: "up" | "down" | "same" | null }) {
  if (way === "up") return <ArrowUpOutlined className="ml-1 text-[11px] text-emerald-600" aria-label="more than the sailing before" />;
  if (way === "down") return <ArrowDownOutlined className="ml-1 text-[11px] text-red-600" aria-label="less than the sailing before" />;
  return null;
}

// A service's trend, for managers (Council Outlay 14, B5): its last sailings that have left - up to
// eight - with how full each was, what it made and whether it covered its box costs, an arrow
// against the sailing before, and what they come to together. Live figures: worked out now from the
// shipments' costs as they stand, not a closing snapshot.
export function ServiceTrendCard({ serviceId }: { serviceId: string }) {
  const { trend, isLoading, isError } = useServiceTrend(serviceId, true);
  if (isLoading) return null;
  if (isError || !trend)
    return (
      <SectionCard title="Trend">
        <p className="m-0 text-[13px] text-slate-700" role="alert">
          The trend could not be worked out.
        </p>
      </SectionCard>
    );
  const rows = trend.sailings;
  return (
    <SectionCard title="Trend" bodyClassName="p-0" extra={rows.length > 0 ? <CountChip count={rows.length} /> : undefined}>
      {rows.length === 0 ? (
        <p className={`${EMPTY_STATE} m-0`}>{trendWords(trend)} The trend starts with the first sailing that leaves.</p>
      ) : (
        <>
          <p className="m-0 border-b border-slate-100 px-4 py-2.5 text-[13px] font-medium text-slate-800">{trendWords(trend)}</p>
          <div className="overflow-x-auto px-4 py-3">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Sailing</th>
                  <th className={`${TH} w-[120px]`}>Departure</th>
                  <th className={`${TH} w-[110px] text-right`}>Box full</th>
                  <th className={`${TH} w-[170px] text-right`}>Profit (EUR)</th>
                  <th className={`${TH} w-[90px] text-right`}>Margin</th>
                  <th className={`${TH} w-[150px]`}>Break-even</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, index) => {
                  const before = rows[index - 1];
                  return (
                    <tr key={s.sailingId}>
                      <td className={TD}>
                        <Link href={`/co-loading/${serviceId}/sailings/${s.sailingId}`} className={`${REF} ${LINK} font-semibold`}>
                          {s.name}
                        </Link>
                      </td>
                      <td className={`${TD} tabular-nums`}>{formatDate(s.departureDate) || "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {s.fullPct === null ? "—" : `${s.fullPct}%`}
                        <Arrow way={trendArrow(s.fullPct, before?.fullPct)} />
                      </td>
                      <td className={`${TD} text-right tabular-nums ${s.profitEur !== null && s.profitEur < 0 ? "text-red-600" : ""}`}>
                        {s.profitEur === null ? <span className="text-slate-500">not known</span> : eur(s.profitEur)}
                        <Arrow way={trendArrow(s.profitEur, before?.profitEur)} />
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{s.marginPct === null ? "—" : `${s.marginPct}%`}</td>
                      <td className={TD}>{s.belowBreakEven === null ? <span className="text-slate-500">not known</span> : s.belowBreakEven ? <span className="font-medium text-red-600">Below</span> : <span className="text-emerald-700">Covered</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-2.5`}>
        Live figures, the oldest first: worked out now from each shipment&apos;s Costs Breakdown and the sailing&apos;s box costs as they stand, so they move when those do. A profit is &quot;not
        known&quot; while a sailing has no box costs or an amount has no EUR rate. Arrows compare with the sailing before.
      </p>
    </SectionCard>
  );
}
