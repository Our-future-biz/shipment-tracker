"use client";

import { Alert, Spin } from "antd";
import { useFxRoeHistory } from "@/hooks/useFx";
import { formatDate, formatDateTime } from "@/lib/date";
import { Badge } from "@/components/Badge";
import { Pill } from "@/components/Pill";
import { EMPTY, EMPTY_STATE, HINT } from "@/styles/ui";
import { fmtPct, FX_AFTER_NUM, FX_KEY, FX_NUM, FX_TABLE_WRAP, FX_TD, FX_TH } from "./fxShared";

export function RoeHistoryTab() {
  const { data, isLoading, isError } = useFxRoeHistory();
  const changes = data?.changes ?? [];

  if (isError) return <Alert type="error" showIcon message="Could not load the ROE history." />;
  if (isLoading) return <div className="flex justify-center py-10"><Spin /></div>;

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className={FX_TABLE_WRAP}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${FX_TH} ${FX_KEY}`}>Effective from</th>
              <th className={`${FX_TH} ${FX_NUM}`}>ROE %</th>
              <th className={`${FX_TH} ${FX_AFTER_NUM}`}>Changed by</th>
              <th className={FX_TH}>Changed at</th>
              <th className={FX_TH}>Note</th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 && (
              <tr>
                <td colSpan={5} className={`${EMPTY_STATE} px-2`}>
                  Never changed — the company uses 100 % (the pure ČNB rate).
                </td>
              </tr>
            )}
            {changes.map((c) => (
              <tr key={c.id} className={c.current ? "bg-indigo-50/60" : ""}>
                <td className={`${FX_TD} ${FX_KEY}`}>
                  {formatDate(c.effectiveFrom)}
                  {c.current && <Badge tone="i" className="ml-2">in force</Badge>}
                  {c.scheduled && <Pill tone="amber" className="ml-2">scheduled</Pill>}
                </td>
                <td className={`${FX_TD} ${FX_NUM} font-semibold !text-slate-900`}>{fmtPct(c.pct)}</td>
                <td className={`${FX_TD} ${FX_AFTER_NUM}`}>{c.changedByName || <span className={EMPTY}>—</span>}</td>
                <td className={`${FX_TD} whitespace-nowrap !text-slate-500`}>{formatDateTime(c.changedAt)}</td>
                <td className={FX_TD}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${HINT} m-0`}>Changes are never edited or deleted. Only admins can change the %.</p>
    </div>
  );
}
