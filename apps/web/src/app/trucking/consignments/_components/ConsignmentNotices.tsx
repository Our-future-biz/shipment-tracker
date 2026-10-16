"use client";

import { Alert, Tooltip } from "antd";
import { businessDateTime } from "@/lib/date";
import { btnDefault } from "@/components/buttons";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";

type Notice = ConsignmentDetail["notices"][number];

interface ConsignmentNoticesProps {
  notices: Notice[];
  /** "" = the user may clear; otherwise why not (tooltip) */
  clearReason: string;
  onClear: (notice: Notice) => void;
}

// The consignment's notices (a price change after the invoice, a credit owed by the haulier, an
// internal charge not priced): each stays in Needs attention until a manager clears it, saying how
// it was dealt with (logged in the history).
export const ConsignmentNotices = ({ notices, clearReason, onClear }: ConsignmentNoticesProps) => {
  if (!notices.length) return null;
  return (
    <Alert
      className="mt-3"
      type="warning"
      showIcon
      message={notices.length === 1 ? "Notice" : `${notices.length} notices`}
      description={
        <ul className="m-0 list-none p-0">
          {notices.map((n) => (
            <li key={n.key} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="text-[13px] text-slate-700">
                {n.text} <span className="text-[11px] text-slate-400">· {businessDateTime(n.at)}</span>
              </span>
              <Tooltip title={clearReason || undefined}>
                <span className="inline-flex">
                  <button type="button" className={btnDefault} disabled={!!clearReason} aria-label={clearReason ? `Clear notice — ${clearReason}` : undefined} onClick={() => onClear(n)}>
                    Clear notice
                  </button>
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      }
    />
  );
};
