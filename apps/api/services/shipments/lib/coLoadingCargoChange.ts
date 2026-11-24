// "Cargo changed since linked" (Council Outlay 14, C4): a link to a sailing remembers the weight and
// volume its shipment had on the day it was linked, so the box's rows say what has changed since -
// "+2.4 cbm since linked" - and a change that takes the box over its limit is told to the people
// who must act. Pure.

export interface CargoNow {
  weightKg: number;
  volumeCbm: number;
}

/** A difference smaller than this is rounding, not a change. */
const KG_STEP = 1;
const CBM_STEP = 0.01;
const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/**
 * What a shipment's cargo has changed by since it was linked: now less then, in kg and cbm. Null for
 * a link from before this was remembered, and when nothing changed.
 */
export function sinceLinked(now: CargoNow, linked: { weightKg: number | null; volumeCbm: number | null }): CargoNow | null {
  if (linked.weightKg === null || linked.volumeCbm === null) return null;
  const weightKg = round(now.weightKg - linked.weightKg, 1);
  const volumeCbm = round(now.volumeCbm - linked.volumeCbm, 3);
  const changed = { weightKg: Math.abs(weightKg) >= KG_STEP ? weightKg : 0, volumeCbm: Math.abs(volumeCbm) >= CBM_STEP ? volumeCbm : 0 };
  return changed.weightKg === 0 && changed.volumeCbm === 0 ? null : changed;
}

const signed = (value: number, unit: string, decimals: number) => `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: decimals })} ${unit}`;

/** A change since linking in words: "+2.4 cbm, +350 kg since linked"; "" for none. */
export function sinceLinkedWords(change: CargoNow | null | undefined): string {
  if (!change) return "";
  const parts = [change.volumeCbm !== 0 ? signed(change.volumeCbm, "cbm", 2) : "", change.weightKg !== 0 ? signed(change.weightKg, "kg", 0) : ""].filter(Boolean);
  return parts.length ? `${parts.join(", ")} since linked` : "";
}

export type Meter = { used: number; limit: number; state: string } | null;

/** The box is over its limit by volume or by weight. */
export const boxIsOver = (box: { volume: Meter; weight: Meter }): boolean => [box.volume, box.weight].some((m) => m !== null && (m.state === "over" || m.state === "beyond"));

/** What the box is over by, in words: "volume 66.2 of 64.9 cbm, weight 27,100 of 26,200 kg". */
export function overWords(box: { volume: Meter; weight: Meter }): string {
  const over = (m: Meter) => m !== null && (m.state === "over" || m.state === "beyond");
  const n = (v: number, decimals: number) => v.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return [
    over(box.volume) ? `volume ${n(box.volume!.used, 1)} of ${n(box.volume!.limit, 1)} cbm` : "",
    over(box.weight) ? `weight ${n(box.weight!.used, 0)} of ${n(box.weight!.limit, 0)} kg` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * What to do about the "told that the box is over" mark of a sailing after its box was worked out:
 * "tell" when the box has just gone over and nobody was told, "clear" when it is back within its
 * limits, "keep" otherwise - an over box is told about once, not with every later change.
 */
export const overStep = (over: boolean, alreadyTold: boolean): "tell" | "clear" | "keep" => (over && !alreadyTold ? "tell" : !over && alreadyTold ? "clear" : "keep");
