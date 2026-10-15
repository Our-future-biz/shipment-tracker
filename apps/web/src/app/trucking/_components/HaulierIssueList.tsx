"use client";

import { ExclamationCircleOutlined, StopOutlined } from "@ant-design/icons";
import { sortIssues, type HaulierIssue } from "../_lib/hauliers";

interface HaulierIssueListProps {
  issues: readonly HaulierIssue[];
  /** Show only the first few (a summary card); the rest is counted. */
  limit?: number;
}

// What stands between a haulier and a trip (block) or needs attention soon (warning), block first.
export const HaulierIssueList = ({ issues, limit }: HaulierIssueListProps) => {
  const sorted = sortIssues(issues);
  if (!sorted.length) return <p className="m-0 text-[13px] text-slate-500">No issues — can be put on a trip.</p>;
  const shown = limit ? sorted.slice(0, limit) : sorted;
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {shown.map((i) => {
        const block = i.severity === "block";
        return (
          <li key={i.code} className={`flex items-start gap-2 py-0.5 ${block ? "text-red-700" : "text-amber-700"}`}>
            <span className="mt-[2px] shrink-0">{block ? <StopOutlined aria-hidden /> : <ExclamationCircleOutlined aria-hidden />}</span>
            <span>
              <span className="sr-only">{block ? "Blocks trips: " : "Warning: "}</span>
              {i.message}
            </span>
          </li>
        );
      })}
      {sorted.length > shown.length && <li className="py-0.5 text-slate-500">+{sorted.length - shown.length} more</li>}
    </ul>
  );
};
