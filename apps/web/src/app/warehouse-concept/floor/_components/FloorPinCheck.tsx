"use client";

import { useState } from "react";
import { useGateMovement, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { errorMessage } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { MAX_PIN_TRIES, PICKUP_PIN_GATE, pinCheckMessage, type PinCheckResult } from "@/app/warehouse-concept/gate-log/_lib/steps";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { FloorCard, NeedsConnection, bigPrimary } from "./floorUi";
import { FloorBack } from "./FloorBack";

const TONE_BOX = {
  g: "bg-emerald-50 text-green-800 border-emerald-200",
  a: "bg-orange-50 text-orange-800 border-orange-200",
  r: "bg-red-50 text-red-800 border-red-200",
} as const;

// The pick-up PIN check on the phone: compare the truck with the pick-up from Shipments
// (haulier, plate, driver), type the PIN the driver gives, get match / no match. The same check
// and words as the gate job; the server decides, so it is never queued — offline it waits.
export function FloorPinCheck({ m, onBack }: { m: GateMovement; onBack: () => void }) {
  const toast = useToast();
  const q = useFloorQueue();
  const { verifyPin } = useGateMovement(m.id);
  const [pin, setPin] = useState("");
  const [last, setLast] = useState<{ result: PinCheckResult; tries: number } | null>(null);
  const p = m.pickup;
  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <FloorBack onBack={onBack} title={TERMS.pickupPin} />
        <FloorCard>
          <div className="text-[15px] text-slate-600">No pick-up from Shipments on this position.</div>
        </FloorCard>
      </div>
    );
  }

  const out = m.transportLegs.find((l) => l.leg === "OUT");
  const verified = m.releaseGates.some((g) => g.g === PICKUP_PIN_GATE && g.s === "OK");
  const canCheck = q.online && p.pinSet && !p.locked && !verified && !m.impRelease && /^\d{4,6}$/.test(pin) && !verifyPin.isPending;
  const msg = last ? pinCheckMessage(last.result, last.tries) : p.locked ? pinCheckMessage("locked", p.tries) : null;

  const check = async () => {
    if (!canCheck) return;
    try {
      setLast(await verifyPin.mutateAsync(pin));
    } catch (e) {
      setLast(null);
      if (q.noteNetworkError(e)) toast.warning("The PIN check needs a connection — try again when back online");
      else toast.error(errorMessage(e, "Failed to check the PIN"));
    } finally {
      setPin("");
    }
  };

  const row = (k: string, v: string, mono = false) => (
    <div className="flex items-baseline gap-2 py-1 text-[15px]">
      <span className="w-28 shrink-0 text-slate-500">{k}</span>
      <span className={`min-w-0 flex-1 break-words font-semibold ${mono ? "font-mono" : ""}`}>{v || "—"}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <FloorBack onBack={onBack} title={TERMS.pickupPin} />
      <FloorCard title="Pick-up from Shipments">
        {p.rows.length === 0 ? (
          <div className="text-[15px] text-slate-500">No pick-up entered in Shipments yet.</div>
        ) : (
          p.rows.map((r, i) => (
            <div key={i} className="border-b border-slate-100 pb-1 last:border-b-0">
              {row("Haulier", r.haulier)}
              {row(TERMS.plate, r.licensePlate, true)}
              {row(TERMS.driver, r.driver)}
            </div>
          ))
        )}
      </FloorCard>
      <FloorCard title="Truck at the gate (OUT)">
        {row(TERMS.plate, out?.plate || m.plate, true)}
        {row(TERMS.driver, out?.driver || m.driver)}
      </FloorCard>

      {m.impRelease ? null : verified ? (
        <div className={`rounded-xl border px-4 py-3 text-[16px] font-bold ${TONE_BOX.g}`}>PIN verified — no further check needed.</div>
      ) : (
        <FloorCard title="PIN the driver gives">
          <div className="flex flex-col gap-3">
            {!q.online && <NeedsConnection what="The PIN check" />}
            <div className="text-[14px] text-slate-500">{p.pinSet ? `${p.tries} of ${MAX_PIN_TRIES} tries used` : "Operations make the PIN in Shipments → Warehouse → Pick-up."}</div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              aria-label="PIN the driver gives"
              placeholder="PIN"
              value={pin}
              disabled={!p.pinSet || p.locked || verifyPin.isPending}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && check()}
              className="h-14 rounded-xl border border-slate-300 px-4 text-center font-mono text-[24px] tracking-[0.4em]"
            />
            <button type="button" className={bigPrimary} disabled={!canCheck} onClick={check}>
              {verifyPin.isPending ? "Checking…" : "Check PIN"}
            </button>
          </div>
        </FloorCard>
      )}
      {msg && <div className={`rounded-xl border px-4 py-3 text-[16px] font-bold ${TONE_BOX[msg.tone]}`}>{msg.text}</div>}
    </div>
  );
}
