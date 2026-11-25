"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Input, Popconfirm } from "antd";
import { AppModal } from "@/components/AppModal";
import { SectionCard } from "@/components/SectionCard";
import { useSailingMasterJob } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT, LINK, REF } from "@/styles/ui";

const many = (n: number) => (n === 1 ? "1 shipment" : `${n} shipments`);

// The sailing's Master Job, on its Linked shipments tab (Council Outlay 14, C2; one per sailing, D16):
// "Create master job" with the sailing's shipments ticked, or an existing one linked by its MCZ
// number. Once it has one, the card shows the Master B/L, the container numbers and seals, and which
// of the sailing's shipments are on it. What a Master Job does to its shipments - the fields it
// copies onto them, the tracking - is the Master Job's own doing, as on the Master Jobs page.
export function SailingMasterJobCard({ sailingId, sailingName, closed }: { sailingId: string; sailingName: string; closed: boolean }) {
  const { data, isLoading, isError, create, link, putOn, unlink } = useSailingMasterJob(sailingId);
  const message = useMessages();
  const [creating, setCreating] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [mcz, setMcz] = useState("");
  const [error, setError] = useState<string | null>(null);
  const free = (data?.shipments ?? []).filter((s) => s.place === "none");
  // The dialog opens with every shipment that is in no Master Job ticked.
  useEffect(() => {
    if (creating) setTicked(free.map((s) => s.shipmentId));
    setError(null);
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating]);

  if (isLoading) return null;
  if (isError || !data)
    return (
      <SectionCard title="Master Job">
        <p className="m-0 text-[13px] text-slate-700" role="alert">
          The sailing&apos;s Master Job could not be read.
        </p>
      </SectionCard>
    );
  const { masterJob, shipments } = data;
  const on = shipments.filter((s) => s.place === "on");
  const other = shipments.filter((s) => s.place === "other");
  const busy = create.isPending || link.isPending || putOn.isPending || unlink.isPending;
  const closedHint = "The service is closed: nothing changes until a manager reopens it.";

  const run = async (what: () => Promise<unknown>, done: string) => {
    try {
      await what();
      message.success(done);
      return true;
    } catch (err) {
      // In the server's words: who may change the shipment, a Master Job of another kind, an invoiced shipment.
      message.error(apiErrorMessage(err));
      return false;
    }
  };

  // The Link button and Enter in the box: one link at a time, so a second Enter while one is sent sends nothing.
  const handleLinkMcz = () => {
    const number = mcz.trim();
    if (closed || busy || !number) return;
    void run(() => link.mutateAsync(number), `Master Job linked to ${sailingName}`).then((ok) => ok && setMcz(""));
  };

  return (
    <SectionCard title="Master Job">
      {masterJob ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <div className={LABEL_TEXT}>Master Job</div>
              <Link href={`/master-jobs?open=${masterJob.id}`} className={`${REF} ${LINK} font-semibold`}>
                {masterJob.mczNumber}
              </Link>
            </div>
            <div>
              <div className={LABEL_TEXT}>Master B/L</div>
              <span className="text-[13px] text-slate-900">{masterJob.masterBolNumber || "—"}</span>
            </div>
            <div>
              <div className={LABEL_TEXT}>Vessel · Voyage</div>
              <span className="text-[13px] text-slate-900">{[masterJob.vessel, masterJob.voyage].filter(Boolean).join(" · ") || "—"}</span>
            </div>
            <div>
              <div className={LABEL_TEXT}>Containers · Seals</div>
              {masterJob.containers.length === 0 ? (
                <span className="text-[13px] text-slate-500">None on the Master Job yet</span>
              ) : (
                <ul className="m-0 list-none p-0 text-[13px] text-slate-900">
                  {masterJob.containers.map((c, i) => (
                    <li key={`${c.containerNumber}-${i}`}>
                      <span className={REF}>{c.containerNumber || "No number yet"}</span>
                      <span className="text-slate-500">
                        {c.sealNumber ? ` · seal ${c.sealNumber}` : " · no seal yet"}
                        {c.type ? ` · ${c.type}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
            <span className="text-[13px] text-slate-700">
              {on.length} of {many(shipments.length)} of this sailing {on.length === 1 ? "is" : "are"} on it
              {masterJob.shipmentCount > on.length ? `; it holds ${masterJob.shipmentCount} in all` : ""}.
            </span>
            {free.length > 0 && (
              <Button size="small" type="primary" disabled={closed || busy} loading={putOn.isPending} title={closed ? closedHint : free.map((s) => s.jobNumber).join(", ")} onClick={() => void run(() => putOn.mutateAsync(free.map((s) => s.shipmentId)), `${many(free.length)} put on ${masterJob.mczNumber}`)}>
                Put the other {free.length} on it
              </Button>
            )}
            <span className="flex-1" />
            <Popconfirm title="Unlink the Master Job from this sailing?" description="The Master Job and the shipments on it stay as they are." okText="Unlink" cancelText="Keep it" onConfirm={() => void run(() => unlink.mutateAsync(), `${masterJob.mczNumber} unlinked from ${sailingName}`)}>
              <Button size="small" disabled={closed || busy} title={closed ? closedHint : undefined}>
                Unlink
              </Button>
            </Popconfirm>
          </div>
          {other.length > 0 && (
            <p className="m-0 text-[13px] text-amber-700" role="status">
              In another Master Job: {other.map((s) => s.jobNumber).join(", ")}. Take {other.length === 1 ? "it" : "them"} off that one first to put {other.length === 1 ? "it" : "them"} on this one.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[13px] text-slate-700">This sailing has no Master Job yet.</span>
          <Button type="primary" disabled={closed || busy || free.length === 0} title={closed ? closedHint : free.length === 0 ? "No shipment of this sailing is free for a new Master Job." : undefined} onClick={() => setCreating(true)}>
            Create master job
          </Button>
          <span className="text-[13px] text-slate-500">or link an existing one:</span>
          <Input aria-label="MCZ number of an existing Master Job" className="!w-[190px]" placeholder="MCZ number" maxLength={40} value={mcz} disabled={closed} onChange={(e) => setMcz(e.target.value)} onPressEnter={handleLinkMcz} />
          <Button disabled={closed || busy || !mcz.trim()} loading={link.isPending} onClick={handleLinkMcz}>
            Link
          </Button>
          {closed && <span className={HINT}>{closedHint}</span>}
        </div>
      )}

      <AppModal
        open={creating}
        onClose={() => !create.isPending && setCreating(false)}
        title={`Create master job for ${sailingName}`}
        subtitle="A new Master Job with the ticked shipments. It starts with what they agree on, and with the sailing's vessel, voyage, departure and cut-off."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreating(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={create.isPending}
              disabled={ticked.length === 0}
              onClick={async () => {
                try {
                  await create.mutateAsync(ticked);
                  message.success(`Master Job created with ${many(ticked.length)}`);
                  setCreating(false);
                } catch (err) {
                  setError(apiErrorMessage(err));
                }
              }}
            >
              Create with {ticked.length}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {shipments.map((s) => (
            <Checkbox key={s.shipmentId} checked={ticked.includes(s.shipmentId)} disabled={s.place !== "none"} onChange={(e) => setTicked((now) => (e.target.checked ? [...now, s.shipmentId] : now.filter((id) => id !== s.shipmentId)))}>
              <span className={`${REF} font-semibold`}>{s.jobNumber}</span> <span className="text-slate-500">· {s.customer || "no customer"}</span>
              {s.place === "other" && <span className="text-amber-700"> · in another Master Job</span>}
            </Checkbox>
          ))}
          <p className={`${HINT} m-0 mt-1`}>
            The Master Job writes its vessel, dates and Master B/L onto its shipments, as on the Master Jobs page. The shipments&apos; own ports are left as they are. Costs entered on the
            Master Job are shared into its shipments and are not counted again on this sailing&apos;s Earnings.
          </p>
          {error && (
            <p className="m-0 text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </AppModal>
    </SectionCard>
  );
}
