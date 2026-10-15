"use client";

import Link from "next/link";
import type { CoverageGap } from "@/hooks/useTruckingReports";
import { businessDateTime } from "@/lib/date";
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
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Lane</th>
            <th className="px-3 py-2">Why not priced</th>
            <th className="px-3 py-2 text-right">Times asked</th>
            <th className="px-3 py-2">Last asked</th>
            <th className="px-3 py-2" aria-label="Link" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                Every lane asked for in this period was priced.
              </td>
            </tr>
          )}
          {rows.map((g) => (
            <tr key={`${g.side}-${g.scope}-${g.serviceLevel ?? ""}-${g.postcode}-${g.reason}`} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="px-3 py-2 font-semibold text-slate-700">{GAP_SIDE_LABELS[g.side]}</td>
              <td className="px-3 py-2 whitespace-nowrap">{gapLaneLabel(g, levelLabel)}</td>
              <td className="px-3 py-2 text-slate-600">{g.reason}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.count}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{businessDateTime(g.lastAt)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <Link href={tariffsHref(g.side)} className="font-semibold text-indigo-600 hover:underline">
                  Open Tariffs
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[11px] text-slate-500">
        Recorded whenever the rate calculator, a quote or a consignment asked for a price no tariff could give (test lanes are not counted). The 50 asked most
        often in the period.
      </p>
    </div>
  );
};
