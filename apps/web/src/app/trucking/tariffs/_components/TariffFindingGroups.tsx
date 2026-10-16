"use client";

import { Alert } from "antd";
import type { interfaces } from "@/lib/api/client";
import { WHOLE_VERSION, groupFindings } from "../../_lib/tariffUpload";
import { TariffFindingList } from "./TariffFindingList";

interface TariffFindingGroupsProps {
  findings: readonly interfaces.ValidationFinding[];
}

// The check of an uploaded tariff file: what must be fixed in the file and uploaded again, then what
// can be accepted, each grouped by the sheet it is on, with the row and column.
export const TariffFindingGroups = ({ findings }: TariffFindingGroupsProps) => {
  const sections = groupFindings(findings);
  const errors = sections.find((s) => s.severity === "error")?.count ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {errors > 0 ? (
        <Alert
          type="error"
          showIcon
          message={`${errors} error${errors === 1 ? "" : "s"} — this version cannot be activated.`}
          description="Errors must be fixed in the file and uploaded again before this version can be activated; warnings can be accepted."
        />
      ) : (
        <Alert
          type={sections.length ? "warning" : "success"}
          showIcon
          message={sections.length ? "No errors. Warnings can be accepted — read them before activating." : "No errors or warnings."}
          description={sections.length ? "Errors must be fixed in the file and uploaded again; warnings can be accepted." : undefined}
        />
      )}

      {sections.map((section) => (
        <div key={section.severity} className="flex flex-col gap-2">
          <h4 className={`m-0 text-[12px] font-bold uppercase tracking-wide ${section.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
            {section.severity === "error" ? "Errors" : "Warnings"} · {section.count}
          </h4>
          {section.groups.map((g) => (
            <div key={g.sheet} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="mb-1 text-[12px] font-semibold text-slate-700">{g.sheet === WHOLE_VERSION ? g.sheet : `Sheet ${g.sheet}`}</div>
              <TariffFindingList findings={g.findings} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
