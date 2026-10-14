"use client";

import { useState } from "react";
import { Input } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { Badge } from "../../_lib/gate";
import { MAX_PIN_TRIES, PICKUP_PIN_GATE, pinCheckMessage, type PinCheckResult } from "../../_lib/steps";
import { btnPrimary, Section } from "./fields";

const TONE_BOX = {
  g: "bg-emerald-50 text-green-700 border-emerald-200",
  a: "bg-orange-50 text-orange-700 border-orange-200",
  r: "bg-red-50 text-red-700 border-red-200",
} as const;

// Outbound cargo of a position linked to a shipment leaves against the pick-up PIN operations
// made in Shipments. The clerk compares the truck with the pick-up rows, types the PIN the
// driver gives and gets match / no match; a match sets the Pick-up PIN line of the release
// gates OK. The PIN itself is never shown here.
export function PickupPinCheck({ m, verifyPin }: { m: GateMovement; verifyPin: (pin: string) => Promise<{ result: PinCheckResult; tries: number }> }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ result: PinCheckResult; tries: number } | null>(null);
  const p = m.pickup;
  if (!p) return null;

  const out = m.transportLegs.find((l) => l.leg === "OUT");
  const truckPlate = out?.plate || m.plate;
  const truckDriver = out?.driver || m.driver;
  const verified = m.releaseGates.some((g) => g.g === PICKUP_PIN_GATE && g.s === "OK");
  // Once verified, further tries would only use up the PIN's shared tries (other gate rows of
  // the same shipment need them), so the check is closed until operations make a new PIN.
  const canCheck = p.pinSet && !p.locked && !verified && /^\d{4,6}$/.test(pin) && !busy;
  const msg = last ? pinCheckMessage(last.result, last.tries) : null;

  const check = async () => {
    if (!canCheck) return;
    setBusy(true);
    try {
      setLast(await verifyPin(pin));
    } catch {
      // The caller reports the error.
      setLast(null);
    } finally {
      setPin("");
      setBusy(false);
    }
  };

  const status = !p.pinSet ? (
    <Badge tone="r">Not generated yet</Badge>
  ) : p.locked ? (
    <Badge tone="r">Locked</Badge>
  ) : verified ? (
    <Badge tone="g">Verified</Badge>
  ) : (
    <Badge tone="b">Set</Badge>
  );

  return (
    <Section title={TERMS.pickupPin} icon={<KeyOutlined />} extra={status}>
      <div className="text-[11px] text-slate-500 mb-2">
        Pick-up from Shipments — compare with the truck at the gate.
        {p.pinSet && p.pinCreatedAt ? ` PIN generated ${formatDateTime(p.pinCreatedAt)}${p.pinCreatedBy ? ` · ${p.pinCreatedBy}` : ""}.` : ""}
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-2 font-semibold">Haulier</th>
            <th className="py-1 pr-2 font-semibold">{TERMS.plate}</th>
            <th className="py-1 font-semibold">{TERMS.driver}</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1 pr-2 text-slate-800 break-words">{r.haulier || "—"}</td>
              <td className="py-1 pr-2 font-mono text-slate-800">{r.licensePlate || "—"}</td>
              <td className="py-1 text-slate-800 break-words">{r.driver || "—"}</td>
            </tr>
          ))}
          {p.rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-1.5 text-slate-400">
                No pick-up entered in Shipments yet.
              </td>
            </tr>
          )}
          <tr className="text-slate-500">
            <td className="pt-1.5 pr-2 italic">Truck at the gate (OUT)</td>
            <td className="pt-1.5 pr-2 font-mono">{truckPlate || "—"}</td>
            <td className="pt-1.5">{truckDriver || "—"}</td>
          </tr>
        </tbody>
      </table>

      {m.impRelease ? null : verified ? (
        <div className={`mt-3 rounded border px-2.5 py-1.5 text-xs font-semibold ${TONE_BOX.g}`}>PIN verified — no further check needed.</div>
      ) : (
        <div className="mt-3">
          <div className="text-[11px] text-slate-500 mb-1.5">
            {p.pinSet ? `${p.tries} of ${MAX_PIN_TRIES} tries used` : "Operations make the PIN in Shipments → Warehouse → Pick-up."}
          </div>
          <div className="flex gap-2">
            <Input
              size="middle"
              className="!w-40 font-mono tracking-[0.3em]"
              placeholder="PIN"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              disabled={!p.pinSet || p.locked || busy}
              aria-label="PIN the driver gives"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onPressEnter={check}
            />
            <button type="button" className={btnPrimary} disabled={!canCheck} onClick={check}>
              Check PIN
            </button>
          </div>
          {msg && <div className={`mt-2 rounded border px-2.5 py-1.5 text-xs font-semibold ${TONE_BOX[msg.tone]}`}>{msg.text}</div>}
          {!msg && p.locked && <div className={`mt-2 rounded border px-2.5 py-1.5 text-xs font-semibold ${TONE_BOX.r}`}>{pinCheckMessage("locked", p.tries).text}</div>}
        </div>
      )}
    </Section>
  );
}
