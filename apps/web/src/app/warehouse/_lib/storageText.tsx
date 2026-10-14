import type { interfaces } from "@/lib/api/client";
import { nf } from "../gate-log/_lib/gate";

// The storage clock in words — the one free-time calculation of the warehouse (made by the
// server), shown the same way in Positions, the gate job, Remeasurement / Release and the worklist.

type Storage = interfaces.GateStorageInfo;

/** "3 free days left" / "Last free day" / "2 chargeable" / "—" (not started). */
export function freeTimeText(s: Storage): string {
  if (!s.started) return "";
  if (s.chargeableDays > 0) return `${s.chargeableDays} chargeable day${s.chargeableDays === 1 ? "" : "s"}`;
  if (s.freeDaysLeft === 0) return "Last free day";
  return `${s.freeDaysLeft} free day${s.freeDaysLeft === 1 ? "" : "s"} left`;
}

/** Tailwind text colour of the free time: red chargeable, amber expiring, green otherwise. */
export function freeTimeTone(s: Storage): string {
  if (!s.started) return "text-slate-300";
  if (s.chargeableDays > 0) return "text-red-600";
  if (s.state === "Expiring") return "text-amber-600";
  return "text-emerald-600";
}

/** Sort value: least free time first (chargeable days count below zero); not started last. */
export const freeTimeSort = (s: Storage) => (s.started ? s.freeDaysLeft - s.chargeableDays : Number.MAX_SAFE_INTEGER);

/** One line: "Day 9 · 2 chargeable days · est. CZK 240". */
export function storageSummary(s: Storage): string {
  if (!s.started) return "Not started";
  const parts = [`Day ${s.daysInWarehouse}`, freeTimeText(s)];
  if (s.estimatedCzk > 0) parts.push(`est. CZK ${nf(s.estimatedCzk)}`);
  if (s.stopped) parts.push(`stopped ${s.stopDate}`);
  return parts.join(" · ");
}

/** Hover text: how the clock is counted for this record. */
export function storageHint(s: Storage): string {
  if (!s.started)
    return "The storage clock starts at the receipt: the gate-in for inbound cargo; for outbound cargo the tick-off at the stripping tally of its container (without one, the “Received in warehouse” date).";
  return [
    `Received ${s.startDate} (day 1${s.startSource === "tally" ? ", ticked off at the stripping tally" : ""})`,
    `${s.freeDays} free days, last free day ${s.lastFreeDay}`,
    `CZK ${nf(s.dailyCzk)} a day after that (W/M ${nf(s.wm, 2)} × CZK 22, at least CZK 120)`,
    s.stopped ? `Clock stopped ${s.stopDate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function StorageLine({ s }: { s: Storage }) {
  if (!s.started) return <span className="text-slate-400" title={storageHint(s)}>Not started</span>;
  return (
    <span title={storageHint(s)}>
      <span className="tabular-nums">Day {s.daysInWarehouse}</span>
      <span className={`ml-1.5 ${freeTimeTone(s)}`}>{freeTimeText(s)}</span>
      {s.estimatedCzk > 0 && <span className="ml-1.5 text-red-600 tabular-nums">est. CZK {nf(s.estimatedCzk)}</span>}
      {s.stopped && <span className="ml-1.5 text-slate-400">stopped</span>}
    </span>
  );
}
