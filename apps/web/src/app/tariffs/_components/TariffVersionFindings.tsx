"use client";

import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { CountChip, SectionCard } from "@/components/SectionCard";
import type { interfaces } from "@/lib/api/client";
import { findingRowsText } from "../_lib/railLayoutForm";

interface TariffVersionFindingsProps {
  findings: interfaces.TariffFinding[];
  /** A draft: errors stop its approval, which the card says. */
  isDraft: boolean;
}

const LEVEL = {
  error: { icon: <CloseCircleOutlined />, className: "text-red-600", rowClass: "border-red-100 bg-red-50/60" },
  warning: { icon: <WarningOutlined />, className: "text-amber-600", rowClass: "border-amber-100 bg-amber-50/60" },
} as const;

// What the checks found reading the file: errors first, then warnings, each with how many rows and
// the first of them. A draft with errors cannot be approved.
export const TariffVersionFindings = ({ findings, isDraft }: TariffVersionFindingsProps) => {
  const sorted = [...findings].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  const hasErrors = findings.some((f) => f.level === "error");

  return (
    <SectionCard title="Checks" extra={findings.length > 0 && <CountChip count={findings.length} />}>
      {!findings.length ? (
        <div className="flex items-center gap-2 text-[13px] text-emerald-700">
          <CheckCircleOutlined /> No problems found.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {isDraft && hasErrors && (
            <p className="m-0 text-[13px] text-red-700">Errors stop the draft from being approved. Correct the layout below, or fix the file and upload it again.</p>
          )}
          {isDraft && !hasErrors && <p className="m-0 text-[13px] text-slate-600">Only warnings: check them; the draft can still be approved.</p>}
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {sorted.map((f) => (
              <li key={`${f.code}-${f.column ?? ""}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] ${LEVEL[f.level].rowClass}`}>
                <span className={`mt-0.5 ${LEVEL[f.level].className}`}>{LEVEL[f.level].icon}</span>
                <div className="min-w-0">
                  <div className="text-slate-800">
                    {f.message}
                    {f.column && <span className="ml-1.5 text-slate-500">(column {f.column})</span>}
                  </div>
                  {(f.count > 1 || f.rows.length > 0) && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {f.count > 1 && <span className="tabular-nums">{f.count} rows</span>}
                      {f.count > 1 && f.rows.length > 0 && <span> · </span>}
                      {f.rows.length > 0 && <span className="tabular-nums">{findingRowsText(f)}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};
