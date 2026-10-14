"use client";

import { Alert, Spin } from "antd";
import { useFxRoeHistory } from "@/hooks/useFx";
import { formatDate, formatDateTime } from "@/lib/date";
import { CELL, TH, fmtPct } from "./fxShared";

export function RoeHistoryTab() {
  const { data, isLoading, isError } = useFxRoeHistory();
  const changes = data?.changes ?? [];

  if (isError) return <Alert type="error" showIcon message="Could not load the ROE history." />;
  if (isLoading) return <div className="flex justify-center py-10"><Spin /></div>;

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Effective from</th>
              <th className={`${TH} text-right`}>ROE %</th>
              <th className={TH}>Changed by</th>
              <th className={TH}>Changed at</th>
              <th className={TH}>Note</th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[13.5px] text-slate-400">
                  Never changed — the company uses 100 % (the pure ČNB rate).
                </td>
              </tr>
            )}
            {changes.map((c) => (
              <tr key={c.id} className={c.current ? "bg-indigo-50/60" : ""}>
                <td className={CELL}>
                  {formatDate(c.effectiveFrom)}
                  {c.current && <span className="ml-2 text-[11.5px] font-semibold text-indigo-700">in force</span>}
                  {c.scheduled && <span className="ml-2 text-[11.5px] font-semibold text-warn">scheduled</span>}
                </td>
                <td className={`${CELL} text-right tabular-nums font-semibold`}>{fmtPct(c.pct)}</td>
                <td className={CELL}>{c.changedByName || "—"}</td>
                <td className={`${CELL} text-slate-500`}>{formatDateTime(c.changedAt)}</td>
                <td className={`${CELL} text-slate-600`}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-slate-400 m-0">Changes are never edited or deleted. Only admins can change the %.</p>
    </div>
  );
}
