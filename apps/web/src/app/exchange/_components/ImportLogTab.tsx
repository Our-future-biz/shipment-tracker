"use client";

import { Alert, Spin } from "antd";
import { useFxImportRuns } from "@/hooks/useFx";
import { formatDate, formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { Badge } from "@/components/Badge";
import { Pill } from "@/components/Pill";
import { EMPTY_STATE } from "@/styles/ui";
import { FX_AFTER_NUM, FX_KEY, FX_NUM, FX_TABLE_WRAP, FX_TD, FX_TH } from "./fxShared";

const STATUS_LABEL: Record<interfaces.ImportRunStatus, string> = {
  ok: "New rates stored",
  no_new_data: "Already current",
  failed: "Failed",
  running: "Running",
};

// A run's result as a status pill; one still running in the app's indigo.
function StatusMark({ status }: { status: interfaces.ImportRunStatus }) {
  if (status === "running") return <Badge tone="i">{STATUS_LABEL[status]}</Badge>;
  const tone = status === "ok" ? "green" : status === "failed" ? "red" : "slate";
  return <Pill tone={tone}>{STATUS_LABEL[status]}</Pill>;
}

export function ImportLogTab() {
  const { data, isLoading, isError } = useFxImportRuns();
  if (isError) return <Alert type="error" showIcon message="Could not load the import log." />;
  if (isLoading) return <div className="flex justify-center py-10"><Spin /></div>;
  const runs = data?.runs ?? [];

  return (
    <div className={`${FX_TABLE_WRAP} mt-1`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${FX_TH} ${FX_KEY}`}>Started</th>
            <th className={FX_TH}>Trigger</th>
            <th className={FX_TH}>Result</th>
            <th className={`${FX_TH} ${FX_NUM}`}>Rates added</th>
            <th className={`${FX_TH} ${FX_AFTER_NUM}`}>Newest ČNB fixing</th>
            <th className={FX_TH}>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && (
            <tr>
              <td colSpan={6} className={`${EMPTY_STATE} px-2`}>No imports yet.</td>
            </tr>
          )}
          {runs.map((r) => (
            <tr key={r.id}>
              <td className={`${FX_TD} ${FX_KEY}`}>{formatDateTime(r.startedAt)}</td>
              <td className={`${FX_TD} capitalize`}>{r.trigger}</td>
              <td className={FX_TD}><StatusMark status={r.status} /></td>
              <td className={`${FX_TD} ${FX_NUM} !text-slate-900`}>{r.rowsAdded}</td>
              <td className={`${FX_TD} ${FX_AFTER_NUM} whitespace-nowrap`}>{formatDate(r.latestValidDate)}</td>
              <td className={`${FX_TD} !text-red-600 max-w-[360px] truncate`} title={r.error}>{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
