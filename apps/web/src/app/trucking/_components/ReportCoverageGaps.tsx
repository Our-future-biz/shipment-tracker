"use client";

import Link from "next/link";
import type { CoverageGap } from "@/hooks/useTruckingReports";
import { businessDateTime } from "@/lib/date";
import { HINT, LINK, TD, TH } from "@/styles/ui";
import { GAP_SIDE_LABELS, gapLaneLabel, sortGaps, tariffsHref } from "../_lib/reports";

interface ReportCoverageGapsProps {
  gaps: CoverageGap[];
  levelLabel: (code: string) => string;
}

// Lanes people asked a price for that no tariff could price, most asked first, each with a link to
// the Tariffs tab of its side.
export const ReportCoverageGaps = ({ gaps, levelLabel }: ReportCoverageGapsProps) => {
  const rows = sortGaps(gaps);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Side</th>
            <th className={TH}>Lane</th>
            <th className={TH}>Why not priced</th>
            <th className={`${TH} !text-right`}>Times asked</th>
            <th className={TH}>Last asked</th>
            <th className={TH} aria-label="Link" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-[13px] text-slate-500">
                Every lane asked for in this period was priced.
              </td>
            </tr>
          )}
          {rows.map((g) => (
            <tr key={`${g.side}-${g.scope}-${g.serviceLevel ?? ""}-${g.postcode}-${g.reason}`} className="align-top [&:last-child>td]:border-b-0">
              <td className={`${TD} font-semibold`}>{GAP_SIDE_LABELS[g.side]}</td>
              <td className={`${TD} whitespace-nowrap`}>{gapLaneLabel(g, levelLabel)}</td>
              <td className={TD}>{g.reason}</td>
              <td className={`${TD} text-right tabular-nums`}>{g.count}</td>
              <td className={`${TD} whitespace-nowrap`}>{businessDateTime(g.lastAt)}</td>
              <td className={`${TD} whitespace-nowrap`}>
                <Link href={tariffsHref(g.side)} className={`${LINK} font-semibold`}>
                  Open Tariffs
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`m-0 mt-2 ${HINT}`}>
        Recorded whenever the rate calculator, a quote or a consignment asked for a price no tariff could give (test lanes are not counted). The 50 asked most
        often in the period.
      </p>
    </div>
  );
};
