"use client";

import { Button } from "antd";
import { useUsers } from "@/hooks/useUsers";
import { businessDateTime } from "@/lib/date";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { EMPTY_STATE, TD, TH } from "@/styles/ui";
import { historyRows } from "../../../_lib/quoteHistory";
import type { SalesQuoteData } from "../../../_lib/types";
import { whoDid } from "../../../_lib/whoDid";
import { QuoteStatusPill } from "../../../_components/QuoteStatusPill";
import { SalesDialog } from "../../../_components/SalesDialog";

interface QuoteHistoryDialogProps {
  quoteNumber: string;
  /** The quote as the server stored it: its history is the server's (data.timeline). */
  data: SalesQuoteData;
  onClose: () => void;
}

// What History in the quote's toolbar opens, for everybody who may open the quote: every change
// its history records - status, validity, Quoted by, follow-ups, shipments, pricing - newest first,
// with when and who (by e-mail, as every person is shown; "System" for what nobody asked for).
export function QuoteHistoryDialog({ quoteNumber, data, onClose }: QuoteHistoryDialogProps) {
  const { users } = useUsers();
  const rows = historyRows(data);

  return (
    <SalesDialog
      open
      onClose={onClose}
      title={`History of ${quoteNumber}`}
      subtitle="Every change recorded on the quote, newest first"
      size="reading"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {rows.length === 0 ? (
        <p className={EMPTY_STATE}>No history recorded yet</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-[140px]`}>When</th>
                <th scope="col" className={`${TH} w-[150px]`}>What</th>
                <th scope="col" className={TH}>Change</th>
                <th scope="col" className={`${TH} w-[200px]`}>Who</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const who = whoDid(row.userId, row.user, users);
                return (
                  <tr key={i}>
                    <td className={`${TD} tabular-nums whitespace-nowrap`}>{businessDateTime(row.at)}</td>
                    <td className={`${TD} font-medium !text-slate-900`}>{row.what}</td>
                    <td className={`${TD} break-words`}>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {row.status && <QuoteStatusPill status={row.status} />}
                        {row.detail && <span className="whitespace-pre-wrap">{row.detail}</span>}
                        {!row.status && !row.detail && EMPTY_CELL}
                      </span>
                    </td>
                    <td className={`${TD} truncate`} title={who || undefined}>
                      {who || EMPTY_CELL}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SalesDialog>
  );
}
