"use client";

import type { DepartmentResult } from "@/hooks/useTruckingReports";
import { departmentLines, marginText, sortDepartments } from "../_lib/reports";
import { formatMoney } from "../_lib/tariffs";

interface ReportDepartmentCardProps {
  department: DepartmentResult;
}

// The Trucking department's result for the period as a small statement:
// external sell + charged exceptions + internal charges − haulier cost = result, with the internal charges per department.
export const ReportDepartmentCard = ({ department }: ReportDepartmentCardProps) => {
  const byDepartment = sortDepartments(department.internalByDepartment);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <dl className="m-0 text-[13px]">
        {departmentLines(department).map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-100">
            <dt className="text-slate-600">
              <span className="inline-block w-4 font-semibold text-slate-400" aria-hidden>
                {l.sign}
              </span>
              {l.label}
            </dt>
            <dd className="m-0 tabular-nums text-slate-800">{formatMoney(l.amountCzk, "CZK")}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 pt-2">
          <dt className="font-bold text-slate-800">
            <span className="inline-block w-4 text-slate-400" aria-hidden>
              =
            </span>
            Result
          </dt>
          <dd className={`m-0 text-[16px] font-bold tabular-nums ${department.resultCzk < 0 ? "text-red-600" : "text-slate-900"}`}>{marginText(department.resultCzk)}</dd>
        </div>
      </dl>
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Internal charges by department</div>
        {byDepartment.length === 0 ? (
          <p className="m-0 text-[13px] text-slate-400">No internal charges in this period.</p>
        ) : (
          <ul className="m-0 list-none p-0 text-[13px]">
            {byDepartment.map((d) => (
              <li key={d.department} className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-100 last:border-b-0">
                <span className="text-slate-700">
                  {d.department} <span className="text-slate-400">· {d.consignments} consignments</span>
                </span>
                <span className="tabular-nums text-slate-800">{formatMoney(d.amountCzk, "CZK")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="m-0 md:col-span-2 text-[11px] text-slate-500">
        External sell: Road consignments delivered in the period. Charged exceptions: delivery exceptions charged to Road customers. Internal charges: charges whose consignment was delivered in the period (adjustments by the day
        they were made). Haulier cost: all haulier cost of consignments delivered in the period, Road and internal.
      </p>
    </div>
  );
};
