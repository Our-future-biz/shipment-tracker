"use client";

import { Alert, Spin } from "antd";
import { useFxImportRuns } from "@/hooks/useFx";
import { formatDate, formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { Badge } from "@/components/Badge";
import { Pill } from "@/components/Pill";
import { TD, TH } from "@/styles/ui";

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
    <div className="overflow-x-auto border border-slate-200 rounded-xl mt-1">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Started</th>
            <th className={TH}>Trigger</th>
            <th className={TH}>Result</th>
            <th className={`${TH} !text-right`}>Rates added</th>
            <th className={TH}>Newest ČNB fixing</th>
            <th className={TH}>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-8 text-center text-[13px] text-slate-400">No imports yet.</td>
            </tr>
          )}
          {runs.map((r) => (
            <tr key={r.id}>
              <td className={`${TD} whitespace-nowrap`}>{formatDateTime(r.startedAt)}</td>
              <td className={TD}>{r.trigger}</td>
              <td className={TD}><StatusMark status={r.status} /></td>
              <td className={`${TD} text-right tabular-nums`}>{r.rowsAdded}</td>
              <td className={TD}>{formatDate(r.latestValidDate)}</td>
              <td className={`${TD} !text-red-600 max-w-[360px] truncate`} title={r.error}>{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
