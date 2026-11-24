"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Input, Select } from "antd";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingNotices } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { EMPTY_STATE, HINT, LINK, REF, TD, TH } from "@/styles/ui";

type Row = interfaces.SailingNoticeRow;
const CHANNELS = [
  { value: "email", label: "By e-mail" },
  { value: "phone", label: "By phone" },
  { value: "other", label: "Another way" },
];
const CHANNEL_WORD: Record<string, string> = { email: "e-mail", phone: "phone", other: "another way" };

/** The rows not told yet: what the tick-all ticks, and what the count says is still to do. */
export const toTell = (rows: readonly Row[]): Row[] => rows.filter((r) => r.told === null);

function NoticeList({ kind, rows, sailingId, intro, empty }: { kind: "sailed" | "rolled"; rows: Row[]; sailingId: string; intro: string; empty: string }) {
  const { record } = useSailingNotices(sailingId);
  const message = useMessages();
  const [ticked, setTicked] = useState<string[]>([]);
  const [channel, setChannel] = useState("email");
  const [note, setNote] = useState("");
  // A row that left the list takes its tick with it.
  useEffect(() => setTicked((now) => now.filter((id) => rows.some((r) => r.shipmentId === id))), [rows]);
  const open = toTell(rows);
  const allOpenTicked = open.length > 0 && open.every((r) => ticked.includes(r.shipmentId));

  const save = async () => {
    try {
      await record.mutateAsync({ kind, shipmentIds: ticked, channel, note: note.trim() || undefined });
      message.success(ticked.length === 1 ? "Recorded: 1 customer told" : `Recorded: ${ticked.length} customers told`);
      setTicked([]);
      setNote("");
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  if (rows.length === 0) return <p className={`${EMPTY_STATE} m-0`}>{empty}</p>;
  return (
    <div>
      <p className={`${HINT} m-0 px-4 pt-3`}>{intro}</p>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-[13px] text-slate-700">{ticked.length === 0 ? "Tick the shipments whose customers you told" : ticked.length === 1 ? "1 ticked: told" : `${ticked.length} ticked: told`}</span>
        <Select aria-label="How the customers were told" className="w-[140px]" value={channel} onChange={setChannel} options={CHANNELS} />
        <Input aria-label="Note for the record" className="!w-[260px]" maxLength={500} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="primary" disabled={ticked.length === 0} loading={record.isPending} onClick={save}>
          Record as told
        </Button>
      </div>
      <div className="overflow-x-auto px-4 pb-3">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-10`}>
                <Checkbox
                  aria-label="Tick all not told yet"
                  checked={allOpenTicked}
                  indeterminate={ticked.length > 0 && !allOpenTicked}
                  disabled={open.length === 0}
                  onChange={(e) => setTicked(e.target.checked ? open.map((r) => r.shipmentId) : [])}
                />
              </th>
              <th className={`${TH} w-[180px]`}>Internal Reference</th>
              <th className={TH}>Customer</th>
              {kind === "rolled" && <th className={TH}>Moved to</th>}
              <th className={`${TH} w-[300px]`}>Customer told</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isTicked = ticked.includes(r.shipmentId);
              return (
                <tr key={r.shipmentId} className={isTicked ? "bg-indigo-50/60" : ""}>
                  <td className={TD}>
                    <Checkbox aria-label={`Tick ${r.jobNumber}`} checked={isTicked} onChange={(e) => setTicked((now) => (e.target.checked ? [...now, r.shipmentId] : now.filter((id) => id !== r.shipmentId)))} />
                  </td>
                  <td className={TD}>
                    <Link href={`/shipments/${r.shipmentId}`} className={`${REF} ${LINK} font-semibold`}>
                      {r.jobNumber || "(no number yet)"}
                    </Link>
                  </td>
                  <td className={TD}>{r.customer || <span className="text-amber-700">No customer on the shipment</span>}</td>
                  {kind === "rolled" && (
                    <td className={TD}>
                      {r.movedTo || "Another sailing"}
                      {r.movedAt && <span className="text-slate-500"> · {formatDateTime(r.movedAt)}</span>}
                      {r.reason && <span className="block text-[12px] text-slate-500">{r.reason}</span>}
                    </td>
                  )}
                  <td className={TD}>
                    {r.told ? (
                      <span className="text-emerald-700">
                        Told by {CHANNEL_WORD[r.told.channel] ?? r.told.channel}
                        <span className="text-slate-500">
                          {" "}
                          · {r.told.byName || "somebody"} · {formatDateTime(r.told.at)}
                        </span>
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">Not told yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// "Customers to tell" on a sailing (Council Outlay 14, C6): after a departure, and after shipments
// were moved on to a later sailing, one list per case says which customers were told and records
// the rest together. Each record is the shipment's own customer notice - it stands on the shipment's
// Tracking tab too. The app sends no e-mail: it keeps your word that the customer was told.
export function CustomersToldCard({ sailingId }: { sailingId: string }) {
  const { notices, isLoading, isError } = useSailingNotices(sailingId);
  if (isLoading) return null;
  if (isError || !notices)
    return (
      <SectionCard title="Customers to tell">
        <p className="m-0 text-[13px] text-slate-700" role="alert">
          The customer notices could not be read.
        </p>
      </SectionCard>
    );
  const open = (notices.hasSailed ? toTell(notices.sailed).length : 0) + toTell(notices.rolled).length;
  return (
    <SectionCard title="Customers to tell" bodyClassName="p-0" extra={open > 0 ? <CountChip count={open} /> : undefined}>
      <h3 className="m-0 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-slate-600">Sailed</h3>
      {notices.hasSailed ? (
        <NoticeList kind="sailed" rows={notices.sailed} sailingId={sailingId} intro="The sailing has left: record which customers were told their cargo sailed." empty="No shipment is on this sailing." />
      ) : (
        <p className={`${EMPTY_STATE} m-0`}>Once the sailing&apos;s stage is set to Departed, its customers are listed here to be told.</p>
      )}
      <h3 className="m-0 border-y border-slate-100 bg-slate-50 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-slate-600">Rolled to a later sailing</h3>
      <NoticeList kind="rolled" rows={notices.rolled} sailingId={sailingId} intro="These shipments were moved on from this sailing: record which customers were told." empty="No shipment was moved on from this sailing." />
      <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-2.5`}>
        The app sends nothing: it records your word that the customer was told, on each shipment&apos;s own Tracking tab. To write the message, open the shipment and use Tell the customer.
      </p>
    </SectionCard>
  );
}
