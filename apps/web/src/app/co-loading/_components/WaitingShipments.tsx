"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Input, Select } from "antd";
import { useCoLoadingSailings, useLinkToSailing, useSailingUtilization, useWaitingShipments } from "@/hooks/useCoLoadingServices";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { HINT, LINK, REF, TD, TH } from "@/styles/ui";
import { boxCargoOf, cutoffWarning, fillWords, overfillWarning, tableCbm, tableKg, waitingForBox } from "../_lib/boxUtilization";
import { cutoffWords, linkNeedsReason, SAILING_STAGE_LABEL, sailingsInOrder, sailingTitle, stageOf } from "../_lib/sailings";

// "Not on a sailing yet" on a service's page (Council Outlay 14, A5): the service's shipments that
// are in no box, with what each would bring, to tick and put on one of the sailings still to come.
// The morning's question, answered without opening a sailing. Linking is the sailing page's own call,
// so the server holds to the same rules; a box past its cut-off or over its limit is remarked on,
// never refused. Nothing is linked while the service is closed.
export function WaitingShipments({ serviceId, serviceName, serviceMode, closed }: { serviceId: string; serviceName: string; serviceMode: string; closed: boolean }) {
  const { waiting: all, total, isLoading, isError, error } = useWaitingShipments(serviceName);
  const waiting = useMemo(() => waitingForBox(all, serviceMode), [all, serviceMode]);
  const { sailings, isLoading: sailingsLoading, isError: sailingsFailed, error: sailingsError } = useCoLoadingSailings(serviceId);
  const today = businessToday();
  const coming = useMemo(() => sailingsInOrder(sailings, today).coming, [sailings, today]);
  const link = useLinkToSailing();
  const message = useMessages();
  const [ticked, setTicked] = useState<string[]>([]);
  const [to, setTo] = useState<string | null>(null);
  // Asked only for a sailing closed for cargo (Council Outlay 14, C3).
  const [reason, setReason] = useState("");
  // The soonest sailing is the one offered, until another is picked; one that left the list is forgotten.
  const target = coming.find((s) => s.id === to) ?? coming[0] ?? null;
  const { box } = useSailingUtilization(target?.id ?? "");
  // A shipment linked meanwhile leaves the list: its tick goes with it.
  useEffect(() => {
    setTicked((prev) => (prev.every((id) => waiting.some((s) => s.id === id)) ? prev : prev.filter((id) => waiting.some((s) => s.id === id))));
  }, [waiting]);

  if (isLoading) return null;
  // Not "nothing waits": what waits is not known.
  if (isError)
    return (
      <p className="m-0 text-[13px] text-red-600" role="alert">
        Could not load the shipments waiting for a sailing - {apiErrorMessage(error)}.
      </p>
    );
  const picked = waiting.filter((s) => ticked.includes(s.id));
  const added = picked.reduce(
    (sum, s) => {
      const cargo = boxCargoOf(s);
      return { shipments: sum.shipments + 1, weightKg: sum.weightKg + cargo.weightKg, volumeCbm: sum.volumeCbm + cargo.volumeCbm };
    },
    { shipments: 0, weightKg: 0, volumeCbm: 0 },
  );
  const overfill = box && target && box.containerType === target.containerType ? overfillWarning(box, added) : null;
  const pastCutoff = target ? cutoffWarning(target.cutoffDate, today, formatDate(target.cutoffDate)) : null;
  const allTicked = waiting.length > 0 && ticked.length === waiting.length;
  const late = target !== null && linkNeedsReason(target);

  const put = async () => {
    if (!target || picked.length === 0) return;
    try {
      await link.mutateAsync({ sailingId: target.id, shipmentIds: picked.map((s) => s.id), reason: late ? reason.trim() : undefined });
      setReason("");
      message.success(`${picked.length === 1 ? picked[0]!.jobNumber : `${picked.length} shipments`} put on ${sailingTitle(target)}`);
      setTicked([]);
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  // Nothing waits: one quiet line, so the page says it rather than leaving it to be guessed.
  if (waiting.length === 0)
    return (
      <p className={`${HINT} m-0`} role="status">
        No shipment of this service is waiting for a sailing.
      </p>
    );

  return (
    <SectionCard title="Not on a sailing yet" bodyClassName="p-0" extra={<CountChip count={waiting.length} />}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
        {coming.length === 0 && sailingsFailed ? (
          <span className="text-[13px] text-red-600" role="alert">
            Could not load the service&apos;s sailings - {apiErrorMessage(sailingsError)}.
          </span>
        ) : coming.length === 0 && sailingsLoading ? (
          <span className={HINT}>Reading the sailings still to come…</span>
        ) : coming.length === 0 ? (
          <span className="text-[13px] text-slate-700" role="status">
            No sailing still to come: create the next one with Create new sailing above, then put these on it.
          </span>
        ) : (
          <>
            <span className="text-[13px] text-slate-700">Put the ticked ones on</span>
            <Select
              aria-label="Sailing to put the ticked shipments on"
              className="min-w-[320px]"
              value={target?.id}
              onChange={setTo}
              disabled={closed}
              options={coming.map((s) => {
                const near = cutoffWords(s.cutoffDate, today);
                return { value: s.id, label: [sailingTitle(s), linkNeedsReason(s) ? SAILING_STAGE_LABEL[stageOf(s)].toLowerCase() : "", s.cutoffDate ? `cut-off ${formatDate(s.cutoffDate)}${near ? ` (${near})` : ""}` : "no cut-off", s.fill ? fillWords(s.fill) : ""].filter(Boolean).join(" · ") };
              })}
            />
            {late && (
              <Input
                aria-label="Why the shipments still go on this sailing"
                className="!w-[300px]"
                maxLength={300}
                placeholder={`It is ${SAILING_STAGE_LABEL[stageOf(target!)].toLowerCase()}: say why they still go on it`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={closed}
              />
            )}
            <Button type="primary" disabled={closed || picked.length === 0 || (late && !reason.trim())} loading={link.isPending} onClick={put}>
              {picked.length === 0 ? "Put on the sailing" : `Put ${picked.length} on ${target ? sailingTitle(target) : "the sailing"}`}
            </Button>
            {closed && <span className={HINT}>The service is closed: nothing can be linked until it is reopened.</span>}
          </>
        )}
      </div>
      {(overfill || (pastCutoff && picked.length > 0)) && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800" role="status">
          {[picked.length > 0 ? pastCutoff : null, overfill].filter(Boolean).join(" ")}
        </div>
      )}
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[820px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-10`}>
                <Checkbox
                  aria-label="Tick all waiting shipments"
                  checked={allTicked}
                  indeterminate={ticked.length > 0 && !allTicked}
                  disabled={closed || coming.length === 0}
                  onChange={(e) => setTicked(e.target.checked ? waiting.map((s) => s.id) : [])}
                />
              </th>
              <th className={`${TH} w-[160px]`}>Internal Reference</th>
              <th className={TH}>Customer</th>
              <th className={`${TH} w-[200px]`}>Status</th>
              <th className={`${TH} w-[70px] text-right`}>Colli</th>
              <th className={`${TH} w-[100px] text-right`}>Weight (kg)</th>
              <th className={`${TH} w-[100px] text-right`}>Volume (cbm)</th>
              <th className={`${TH} w-[130px]`}>Figures</th>
            </tr>
          </thead>
          <tbody>
            {waiting.map((s) => {
              const { colli, weightKg, volumeCbm } = boxCargoOf(s);
              const missing = [weightKg > 0 ? "" : "weight", volumeCbm > 0 ? "" : "volume"].filter(Boolean);
              const isTicked = ticked.includes(s.id);
              return (
                <tr key={s.id} className={isTicked ? "bg-indigo-50/60" : ""}>
                  <td className={TD}>
                    <Checkbox
                      aria-label={`Tick ${s.jobNumber}`}
                      checked={isTicked}
                      disabled={closed || coming.length === 0}
                      onChange={(e) => setTicked((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                    />
                  </td>
                  <td className={`${TD} truncate`}>
                    <Link href={`/shipments/${s.id}`} className={`${REF} ${LINK} font-semibold`}>
                      {s.jobNumber}
                    </Link>
                  </td>
                  <td className={`${TD} truncate`}>{s.customer ? <span title={s.customer}>{s.customer}</span> : EMPTY_CELL}</td>
                  <td className={`${TD} truncate`}>{s.status ? <span title={s.status}>{s.status}</span> : EMPTY_CELL}</td>
                  {/* A figure that is missing is a dash, never a 0. */}
                  <td className={`${TD} text-right tabular-nums`}>{colli > 0 ? colli.toLocaleString("en-US") : EMPTY_CELL}</td>
                  <td className={`${TD} text-right tabular-nums`}>{weightKg > 0 ? tableKg(weightKg) : EMPTY_CELL}</td>
                  <td className={`${TD} text-right tabular-nums`}>{volumeCbm > 0 ? tableCbm(volumeCbm) : EMPTY_CELL}</td>
                  <td className={TD}>{missing.length > 0 ? <span className="text-[12px] font-medium text-amber-700">No {missing.join(" or ")}</span> : <span className="text-[12px] text-slate-500">Complete</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > all.length && <p className={`${HINT} m-0 mt-2`}>The newest {all.length} of {total} shipments on no sailing are read here.</p>}
      </div>
    </SectionCard>
  );
}
