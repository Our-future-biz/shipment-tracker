"use client";

import { ExclamationCircleOutlined, StopOutlined } from "@ant-design/icons";
import type { interfaces } from "@/lib/api/client";
import { sortFindings } from "../../_lib/tariffs";

interface TariffFindingListProps {
  findings: readonly interfaces.ValidationFinding[];
  /** Show only the first few; the rest is counted. */
  limit?: number;
}

// What the server found when the version was saved: errors (it cannot be activated) first, then
// warnings, each with where in the tariff file it is.
export const TariffFindingList = ({ findings, limit }: TariffFindingListProps) => {
  const sorted = sortFindings(findings);
  if (!sorted.length) return <p className="m-0 text-[13px] text-slate-500">No errors or warnings.</p>;
  const shown = limit ? sorted.slice(0, limit) : sorted;
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {shown.map((f, i) => {
        const error = f.severity === "error";
        return (
          <li key={`${i}-${f.message}`} className={`flex items-start gap-2 py-1 border-b border-slate-100 last:border-b-0 ${error ? "text-red-700" : "text-amber-700"}`}>
            <span className="mt-[2px] shrink-0">{error ? <StopOutlined aria-hidden /> : <ExclamationCircleOutlined aria-hidden />}</span>
            <span className="min-w-0">
              <span className="sr-only">{error ? "Error: " : "Warning: "}</span>
              {f.message}
              {f.where && <span className="block text-[11.5px] text-slate-500">{f.where}</span>}
            </span>
          </li>
        );
      })}
      {sorted.length > shown.length && <li className="py-1 text-slate-500">+{sorted.length - shown.length} more</li>}
    </ul>
  );
};
