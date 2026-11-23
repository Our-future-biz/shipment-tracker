import type { interfaces } from "@/lib/api/client";

// The words and figures of a sailing's Box utilization tab (Council Outlay 12). The server works
// the fill out (lib/boxUtilization); here it is only put into words, the same on every screen that
// shows it.

export type BoxUtilization = interfaces.BoxUtilization;
export type BoxMeter = interfaces.BoxMeter;
export type BoxRow = interfaces.BoxUtilizationRow;
export type MeterKind = "volume" | "weight";

const number = (value: number, decimals: number) => value.toLocaleString("en-US", { maximumFractionDigits: decimals });

/** A volume: "52.4 cbm". */
export const cbm = (value: number) => `${number(value, 1)} cbm`;
/** A weight: "24,100 kg". */
export const kg = (value: number) => `${number(value, 0)} kg`;
/** A figure of the shipments table, without its unit: to the kilogram, to a hundredth of a cbm. */
export const tableKg = (value: number) => number(value, 0);
export const tableCbm = (value: number) => number(value, 2);
export const tableFreightTons = (value: number) => number(value, 2);

const amount = (kind: MeterKind, value: number) => (kind === "volume" ? cbm(value) : kg(value));

/** "52.4 of 64.9 cbm": what is used of the limit. */
export const usedOfLimit = (kind: MeterKind, meter: BoxMeter) => `${number(meter.used, kind === "volume" ? 1 : 0)} of ${amount(kind, meter.limit)}`;

/** The colour of a meter's bar and words: indigo with room, amber when nearly full, red when over. */
export const meterTone = (meter: BoxMeter): "indigo" | "amber" | "red" => (meter.state === "room" ? "indigo" : meter.state === "nearly_full" ? "amber" : "red");

/** The share of the bar that is filled, and where the limit's mark stands: the bar runs to the most the box can ever take. */
export const meterBar = (meter: BoxMeter) => ({
  filledPct: Math.min(100, Math.max(0, (meter.used / meter.max) * 100)),
  limitPct: Math.min(100, (meter.limit / meter.max) * 100),
});

/** A meter's state in words: how much room is left, or by how much it is over. */
export function meterWords(kind: MeterKind, meter: BoxMeter, capacity: NonNullable<BoxUtilization["capacity"]>): string {
  const over = amount(kind, Math.abs(meter.free));
  switch (meter.state) {
    case "room":
      return meter.used > 0 ? `Room for ${amount(kind, meter.free)}` : `Empty: room for ${amount(kind, meter.free)}`;
    case "nearly_full":
      return meter.free > 0 ? `Nearly full: room for ${amount(kind, meter.free)}` : "Full";
    case "over":
      if (kind === "volume") return `Over the planning volume by ${over}. The box holds ${cbm(meter.max)} inside, so it may still load if the cargo stows well.`;
      return capacity.heavyTestedKg
        ? `Over the standard limit by ${over}. A heavy-tested box takes up to ${kg(capacity.heavyTestedKg)}.`
        : `Over the standard limit by ${over}. Up to ${kg(meter.max)} needs the shipping line's confirmation.`;
    case "beyond":
      return kind === "volume" ? `Over by ${over}: more than the box holds inside (${cbm(meter.max)}).` : `Over by ${over}: more than a ${capacity.containerType} can take (${kg(meter.max)}).`;
  }
}

/** What the scale under a meter says: its limit and the most the box can take. */
export function meterScale(kind: MeterKind, capacity: NonNullable<BoxUtilization["capacity"]>): string {
  if (kind === "volume") return `planning ${number(capacity.planningCbm ?? 0, 1)} · inside ${cbm(capacity.insideCbm ?? 0)}`;
  return capacity.heavyTestedKg ? `standard ${number(capacity.standardKg, 0)} · heavy tested ${kg(capacity.heavyTestedKg)}` : `standard ${number(capacity.standardKg, 0)} · at most ${kg(capacity.maxKg)}`;
}

/** Why a container type has no volume meter. */
export const noVolumeWords = (containerType: string) =>
  /FR$/.test(containerType) ? "A flat rack has no walls: its volume is not measured." : `No inside sizes are known for a ${containerType} yet: its volume is not measured.`;

/**
 * The warning over the meters when figures are missing: a total with gaps is too low, and says so.
 * null when every counted shipment has both figures.
 */
export function missingNote(box: BoxUtilization): string | null {
  const { weight, volume } = box.missing;
  const total = box.totals.shipments;
  if (weight === 0 && volume === 0) return null;
  const of = (count: number, what: string) => `${count} of ${total} ${total === 1 ? "shipment" : "shipments"} ${count === 1 ? "has" : "have"} no ${what}`;
  if (weight > 0 && volume > 0) return `${of(weight, "weight")} and ${volume} ${volume === 1 ? "has" : "have"} no volume: the box is fuller than shown.`;
  return weight > 0 ? `${of(weight, "weight")}: the box is heavier than shown.` : `${of(volume, "volume")}: the box is fuller than shown.`;
}

/** A shipment's share of the box, by the measure it takes more of: "24% of weight". */
export function shareWords(row: BoxRow): string | null {
  const [w, v] = [row.weightSharePct, row.volumeSharePct];
  if (w === null && v === null) return null;
  const byWeight = v === null || (w !== null && w > v);
  const pct = byWeight ? w! : v!;
  if (!(pct > 0)) return null;
  return `${pct < 1 ? "under 1" : Math.round(pct)}% of ${byWeight ? "weight" : "volume"}`;
}

/** What is worth saying about a shipment's row, each as a short label with its tone. */
export function rowNotes(row: BoxRow): { text: string; tone: "amber" | "red" | "slate" }[] {
  const notes: { text: string; tone: "amber" | "red" | "slate" }[] = [];
  if (!row.counted) notes.push({ text: "Cancelled: not counted", tone: "slate" });
  if (row.counted && row.weightMissing && row.volumeMissing) notes.push({ text: "Weight and volume missing", tone: "amber" });
  else if (row.counted && row.weightMissing) notes.push({ text: "Weight missing", tone: "amber" });
  else if (row.counted && row.volumeMissing) notes.push({ text: "Volume missing", tone: "amber" });
  if (row.implausible) notes.push({ text: "Check the figures", tone: "red" });
  if (row.notStackable) notes.push({ text: "Not stackable", tone: "slate" });
  if (row.dangerous) notes.push({ text: "Dangerous goods", tone: "slate" });
  if (row.outOfGauge) notes.push({ text: "Out of gauge", tone: "slate" });
  if (row.temperatureControlled) notes.push({ text: "Temperature controlled", tone: "slate" });
  return notes;
}

/** How full the box is, for the tile: "92% full", "Over: 104%", "Empty", or a dash when the type has no capacity. */
export function fullWords(box: BoxUtilization): string {
  if (box.fullPct === null) return "—";
  if (box.totals.shipments === 0) return "Empty";
  return box.fullPct > 100 ? `Over: ${box.fullPct}%` : `${box.fullPct}% full`;
}
