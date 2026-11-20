"use client";

import { useState } from "react";
import { Input } from "antd";
import type { GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { uuid } from "@/lib/uuid";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { TALLY_CONDITIONS } from "@/app/warehouse-concept/_lib/containerPlan";
import { errorMessage, nf } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { reweighMissing } from "@/app/warehouse-concept/gate-log/_lib/steps";
import { REF } from "@/styles/ui";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { useRecordReceipt, type ReceiptResult } from "../_lib/useReceipt";
import { Chip, FloorCard, NeedsConnection, Stepper, bigDefault, bigPrimary } from "./floorUi";
import { FloorBack } from "./FloorBack";

// The receipt of loose import cargo on the phone (Q19, User Council 20 Nov): an outbound position
// with no container arrives by truck, so no stripping tally receives it. Count the pieces, note the
// condition and the location — what a tally tick keeps — and it is received: its free time starts,
// the stock line opens at the location and its shipment gets the received date. A count that
// differs, or a condition other than Good, offers the Damage / short / over screen (as the tally
// does). Needs a connection (the server receives the cargo and writes to the shipment).

export function FloorReceipt({ m, onBack, onReweigh, onException }: { m: GateMovement; onBack: () => void; onReweigh: () => void; onException: () => void }) {
  const toast = useToast();
  const q = useFloorQueue();
  const record = useRecordReceipt();
  const [pieces, setPieces] = useState(m.colli);
  const [condition, setCondition] = useState("Good");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  // One request id per screen: a second tap (or a retry after a lost answer) is the same receipt.
  const [requestId] = useState(uuid);
  // After the answer: what to offer next. The button stays off, so a second tap records nothing.
  const [done, setDone] = useState<ReceiptResult | null>(null);
  const ref = m.positionRef || m.gateRef;
  const weighFirst = reweighMissing(m);
  const diff = m.colli > 0 && pieces !== m.colli;

  const send = async () => {
    try {
      const res = await record.mutateAsync({ id: m.id, receipt: { pieces, condition, location: location.trim(), note: note.trim(), clientRequestId: requestId } });
      if (res.outcome === "done") toast.success(`${ref} received${m.shipmentId ? " — its shipment gets the received date" : ""}`);
      else toast.info(res.notice || `${ref} was already received`);
      if (res.outcome === "done" && res.suggestExceptions.length) setDone(res);
      else onBack();
    } catch (e) {
      if (q.noteNetworkError(e)) toast.warning(`The ${TERMS.receipt.toLowerCase()} needs a connection — not recorded. Try again when back online.`);
      else toast.error(errorMessage(e, "Failed to record the receipt"));
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-28">
      <FloorBack onBack={onBack} title={TERMS.receipt} />

      <FloorCard>
        <div className={`${REF} text-[16px] font-bold text-slate-900`}>{ref}</div>
        <div className="text-[14px] text-slate-700">{m.customer || "—"}</div>
        <div className="text-[13px] text-slate-500">
          Expected {nf(m.colli)} pcs{m.packing ? ` ${m.packing}` : ""} · {nf(m.weightKg)} kg — loose cargo, no container
        </div>
      </FloorCard>

      {done ? (
        <FloorCard title="Record an exception?">
          <ul className="m-0 mb-3 list-none p-0 text-[14px] text-slate-900">
            {done.suggestExceptions.map((s) => (
              <li key={s.type} className="py-0.5">
                <span className="font-semibold">{s.type}</span>
                {s.type === "Damaged" ? ` — ${condition}` : ` ${s.pieces} pc${s.pieces === 1 ? "" : "s"} against the expected ${nf(m.colli)}`}
              </li>
            ))}
          </ul>
          <p className="m-0 mb-3 text-[13px] text-slate-500">The cargo is received. While an exception is open it is on hold.</p>
          <div className="flex flex-col gap-2">
            <button type="button" className={bigPrimary} onClick={onException}>
              Damage / short / over
            </button>
            <button type="button" className={bigDefault} onClick={onBack}>
              Not now
            </button>
          </div>
        </FloorCard>
      ) : (
        <FloorCard title="Count and check">
          <div className="flex flex-col gap-3">
            {weighFirst && (
              <>
                <div className="text-[14px] font-semibold text-red-600">Re-weigh first — LCL cargo is re-weighed before the receipt</div>
                <button type="button" className={bigPrimary} onClick={onReweigh}>
                  {TERMS.reweigh}
                </button>
              </>
            )}
            <Stepper label="Pieces counted" value={pieces} onChange={setPieces} />
            {diff && (
              <div className="text-[13px] font-semibold text-amber-700">
                {pieces < m.colli ? "Short" : "Over"} {Math.abs(m.colli - pieces)} — an exception is offered after the receipt
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Condition">
              {TALLY_CONDITIONS.map((x) => (
                <Chip key={x} on={condition === x} tone={x === "Good" ? "indigo" : "red"} onClick={() => setCondition(x)}>
                  {x}
                </Chip>
              ))}
            </div>
            <Input value={location} placeholder="Location (zone / rack)" maxLength={100} onChange={(e) => setLocation(e.target.value)} className="!h-12 !text-[16px]" />
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="!text-[16px]" />
          </div>
        </FloorCard>
      )}

      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-[560px]">
            {!q.online && (
              <div className="mb-2">
                <NeedsConnection what={`The ${TERMS.receipt.toLowerCase()}`} />
              </div>
            )}
            <button type="button" className={bigPrimary} disabled={record.isPending || weighFirst || !q.online || !!m.archivedAt} onClick={send}>
              {record.isPending ? "Recording…" : `Record receipt — ${nf(pieces)} pcs`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
