"use client";

import { Button, Spin } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useShipmentHistory } from "@/hooks/useShipmentHistory";
import { CARD, CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY, HINT, TD, TH } from "@/styles/ui";
import { historyRows } from "./historyRows";

// The job's history for managers (Council Outlay 11, step 6): every change recorded on it, newest
// first - the field, what it was and what it became, who changed it and when (Prague time). 50 a page;
// "Load older" reads the page before. The server holds the tab to managers too.

/** A value, cut with "…" after two lines where its column ends; the whole of it in its title. */
function Value({ text }: { text: string }) {
  return text ? (
    <span className="block line-clamp-2 whitespace-pre-line break-words text-slate-900" title={text}>
      {text}
    </span>
  ) : (
    <span className={EMPTY}>—</span>
  );
}

export function HistoryTab({ shipmentId }: { shipmentId: string }) {
  const { pages, isLoading, isError, error, refetch, hasOlder, loadOlder, loadingOlder } = useShipmentHistory(shipmentId);
  const rows = historyRows(pages);

  return (
    <section className={`${CARD} min-w-0 overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>
          <HistoryOutlined />
        </span>
        <h3 className={`${CARD_TITLE} min-w-0`}>History</h3>
        {/* Only the job's own record is logged here (shipment_audit): cost lines have no change log
            yet and tracking events have their own tab, so the heading does not promise them (council O14 / Q7). */}
        <span className={`${HINT} ml-auto`}>
          Changes to the job&apos;s details, newest first · Prague time. Costs and tracking events are on their own tabs.
        </span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : isError && rows.length === 0 ? (
        <div className={`px-4 py-8 text-center ${HINT}`}>
          Could not load the history - {apiErrorMessage(error)}.{" "}
          <Button size="small" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className={`px-4 py-8 text-center ${HINT}`}>No change is recorded on this job yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} w-[140px]`}>When</th>
                  <th className={`${TH} w-[200px]`}>What</th>
                  <th className={TH}>Was</th>
                  <th className={TH}>Became</th>
                  <th className={`${TH} w-[200px]`}>Who</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.when}</td>
                    <td className={TD}>
                      <span className="block truncate text-slate-900" title={r.label}>
                        {r.label}
                      </span>
                      {r.cut && <span className={HINT}>A value is cut at 2,000 characters</span>}
                    </td>
                    <td className={TD}>
                      <Value text={r.from} />
                    </td>
                    <td className={TD}>
                      <Value text={r.to} />
                    </td>
                    <td className={TD}>
                      <span className="block truncate text-slate-900" title={r.who}>
                        {r.who}
                      </span>
                      {r.whoHint && (
                        <span className={`${HINT} block truncate`} title={r.whoHint}>
                          {r.whoHint}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
            <span className={isError ? "text-[12px] text-red-600" : HINT}>
              {isError
                ? `Could not load the older changes - ${apiErrorMessage(error)}`
                : `${rows.length} ${rows.length === 1 ? "change" : "changes"}${hasOlder ? " so far" : ", all there are"}`}
            </span>
            {hasOlder && (
              <Button size="small" loading={loadingOlder} onClick={() => loadOlder()}>
                Load older
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
