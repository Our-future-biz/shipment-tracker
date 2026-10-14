"use client";

import { useQuery } from "@tanstack/react-query";
import { Spin } from "antd";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date";
import { CELL, FX_KEYS, TH } from "./fxShared";

const STATUS: Record<string, string> = {
  ok: "text-emerald-700",
  no_new_data: "text-slate-500",
  failed: "text-red-600 font-semibold",
  running: "text-indigo-600",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "New rates stored",
  no_new_data: "Already current",
  failed: "Failed",
  running: "Running",
};

export function ImportLogTab() {
  const { data, isLoading } = useQuery({ queryKey: FX_KEYS.runs, queryFn: () => api.fx.fxImportRuns({ limit: 50 }) });
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
            <th className={`${TH} text-right`}>Rates added</th>
            <th className={TH}>Newest ČNB fixing</th>
            <th className={TH}>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-[13.5px] text-slate-400">No imports yet.</td>
            </tr>
          )}
          {runs.map((r) => (
            <tr key={r.id}>
              <td className={`${CELL} whitespace-nowrap`}>{formatDateTime(r.startedAt)}</td>
              <td className={`${CELL} text-slate-600`}>{r.trigger}</td>
              <td className={`${CELL} ${STATUS[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
              <td className={`${CELL} text-right tabular-nums`}>{r.rowsAdded}</td>
              <td className={CELL}>{formatDate(r.latestValidDate)}</td>
              <td className={`${CELL} text-[13px] text-red-600 max-w-[360px] truncate`} title={r.error}>{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
