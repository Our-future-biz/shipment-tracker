import type { interfaces } from "@/lib/api/client";
import { shipmentCargoFigures } from "@/app/shipments/[jobNumber]/tabs/warehouse/remeasuredLines";

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

/**
 * Where the break-even stands on a meter (managers only): the sailing covers its box costs at
 * `ofLoaded` of what is loaded now, taken with the same mix of cargo. Its place on the bar, and the
 * amount; `onBar` is false when the box cannot take that much.
 */
export function breakEvenMark(kind: MeterKind, meter: BoxMeter, ofLoaded: number | null | undefined): { pct: number; onBar: boolean; words: string } | null {
  if (ofLoaded == null || !(meter.used > 0)) return null;
  const at = meter.used * ofLoaded;
  const onBar = at <= meter.max;
  return {
    pct: Math.min(100, (at / meter.max) * 100),
    onBar,
    words: `${onBar ? `Break-even at ${amount(kind, at)}${at <= meter.used ? ": reached" : ""}` : `Break-even at ${amount(kind, at)}: more than the box takes`}, with the same mix of cargo`,
  };
}

/** A meter's state in words: how much room is left, or by how much it is over. */
export function meterWords(kind: MeterKind, meter: BoxMeter, capacity: NonNullable<BoxUtilization["capacity"]>): string {
  const over = amount(kind, Math.abs(meter.free));
  const many = capacity.containers > 1;
  switch (meter.state) {
    case "room":
      return meter.used > 0 ? `Room for ${amount(kind, meter.free)}` : `Empty: room for ${amount(kind, meter.free)}`;
    case "nearly_full":
      return meter.free > 0 ? `Nearly full: room for ${amount(kind, meter.free)}` : "Full";
    case "over":
      if (kind === "volume") return `Over the planning volume by ${over}. ${many ? "The boxes hold" : "The box holds"} ${cbm(meter.max)} inside, so it may still load if the cargo stows well.`;
      if (capacity.inlandKg !== null) return `Over the inland weight by ${over}. ${many ? "The boxes themselves take" : "The box itself takes"} ${kg(capacity.standardKg)}, so the limit is the leg between the port and the hub.`;
      return capacity.heavyTestedKg
        ? `Over the standard limit by ${over}. ${many ? "Heavy-tested boxes take" : "A heavy-tested box takes"} up to ${kg(capacity.heavyTestedKg)}.`
        : `Over the standard limit by ${over}. Up to ${kg(meter.max)} needs the shipping line's confirmation.`;
    case "beyond":
      if (kind === "volume") return `Over by ${over}: more than ${many ? "the boxes hold" : "the box holds"} inside (${cbm(meter.max)}).`;
      return `Over by ${over}: more than ${many ? `${capacity.containers} × ${capacity.containerType}` : `a ${capacity.containerType}`} can take (${kg(meter.max)}).`;
  }
}

/** What the scale under a meter says: its limit and the most the box can take. */
export function meterScale(kind: MeterKind, capacity: NonNullable<BoxUtilization["capacity"]>): string {
  if (kind === "volume") return `planning ${number(capacity.planningCbm ?? 0, 1)} (${capacity.planningPct}%) · inside ${cbm(capacity.insideCbm ?? 0)}`;
  if (capacity.inlandKg !== null) return `inland ${number(capacity.inlandKg, 0)} · standard ${number(capacity.standardKg, 0)} · at most ${kg(capacity.maxKg)}`;
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

/**
 * A percentage as a whole one, as the server gives the box's meters (lib/boxUtilization wholePct):
 * never rounded up to 100 - 99.6% is 99, not the whole box - and anything over 100 at least 101.
 */
export const wholePct = (pct: number): number => (pct > 100 ? Math.max(101, Math.round(pct)) : Math.floor(pct + 1e-9));

/** A shipment's share of the box, by the measure it takes more of: "24% of weight". */
export function shareWords(row: BoxRow): string | null {
  const [w, v] = [row.weightSharePct, row.volumeSharePct];
  if (w === null && v === null) return null;
  const byWeight = v === null || (w !== null && w > v);
  const pct = byWeight ? w! : v!;
  if (!(pct > 0)) return null;
  return `${pct < 1 ? "under 1" : wholePct(pct)}% of ${byWeight ? "weight" : "volume"}`;
}

/** What is worth saying about a shipment's row, each as a short label with its tone. */
export function rowNotes(row: BoxRow): { text: string; tone: "amber" | "red" | "slate" }[] {
  const notes: { text: string; tone: "amber" | "red" | "slate" }[] = [];
  if (!row.counted) notes.push({ text: "Cancelled: not counted", tone: "slate" });
  if (row.counted && row.weightMissing && row.volumeMissing) notes.push({ text: "Weight and volume missing", tone: "amber" });
  else if (row.counted && row.weightMissing) notes.push({ text: "Weight missing", tone: "amber" });
  else if (row.counted && row.volumeMissing) notes.push({ text: "Volume missing", tone: "amber" });
  if (row.implausible) notes.push({ text: "Check the figures", tone: "red" });
  if (row.odd) notes.push({ text: `${row.odd}: not what this box is for`, tone: "amber" });
  if (row.notStackable) notes.push({ text: "Not stackable", tone: "slate" });
  if (row.dangerous) notes.push({ text: "Dangerous goods", tone: "slate" });
  if (row.outOfGauge) notes.push({ text: "Out of gauge", tone: "slate" });
  if (row.temperatureControlled) notes.push({ text: "Temperature controlled", tone: "slate" });
  return notes;
}

/** The dangerous and special cargo of a box (Council Outlay 14, A11): what the stuffing and the co-loader must know of. */
export interface SpecialCargo {
  /** The counted shipments with dangerous cargo, each with the UN numbers and classes its cargo lines name. */
  dangerous: { shipmentId: string; jobNumber: string; customer: string; adr: string[] }[];
  /** The classes among them, each once. */
  classes: string[];
  notStackable: number;
  outOfGauge: number;
  temperatureControlled: number;
  /** Two or more classes share the box: segregation is to be checked. */
  mixedClasses: boolean;
  /** A dangerous shipment whose lines name no UN number or class. */
  unnamed: number;
}

/** A box's dangerous and special cargo, from its counted rows; null when it holds none of it. */
export function specialCargoOf(box: BoxUtilization): SpecialCargo | null {
  const counted = box.rows.filter((r) => r.counted);
  const dangerous = counted.filter((r) => r.dangerous).map((r) => ({ shipmentId: r.shipmentId, jobNumber: r.jobNumber, customer: r.customer, adr: r.adr ?? [] }));
  const count = (pick: (r: BoxRow) => boolean) => counted.filter(pick).length;
  const [notStackable, outOfGauge, temperatureControlled] = [count((r) => r.notStackable), count((r) => r.outOfGauge), count((r) => r.temperatureControlled)];
  if (dangerous.length === 0 && notStackable + outOfGauge + temperatureControlled === 0) return null;
  const classes = [...new Set(dangerous.flatMap((d) => d.adr.flatMap((a) => /class (\S+)/.exec(a)?.[1] ?? [])))].sort();
  return { dangerous, classes, notStackable, outOfGauge, temperatureControlled, mixedClasses: classes.length > 1, unnamed: dangerous.filter((d) => d.adr.length === 0).length };
}

/** How full the box is, for the tile: "92% full", "Over: 104%", "Empty", or a dash when the type has no capacity. */
export function fullWords(box: BoxUtilization): string {
  if (box.fullPct === null) return "—";
  if (box.totals.shipments === 0) return "Empty";
  return box.fullPct > 100 ? `Over: ${box.fullPct}%` : `${box.fullPct}% full`;
}

export type BoxFill = interfaces.BoxFill;

/** The fill in short of a box read in full: what the sailing's header shows, the same as its row on the list. */
export function fillOfBox(box: BoxUtilization): BoxFill {
  const short = (meter: BoxMeter | null) => (meter ? { pct: meter.pct, state: meter.state } : null);
  return {
    volume: short(box.volume),
    weight: short(box.weight),
    fullPct: box.fullPct,
    shipments: box.totals.shipments,
    missing: box.rows.filter((r) => r.counted && (r.weightMissing || r.volumeMissing)).length,
  };
}

/**
 * A box's fill as one line of words, for a tooltip and for screen readers: "Volume 80%, weight 91%
 * (nearly full) · 5 shipments · 1 without a figure".
 */
export function fillWords(fill: BoxFill): string {
  const state = (s: BoxMeter["state"]) => (s === "nearly_full" ? " (nearly full)" : s === "over" ? " (over the limit)" : s === "beyond" ? " (more than the box takes)" : "");
  const meters = [fill.volume && `volume ${fill.volume.pct}%${state(fill.volume.state)}`, fill.weight && `weight ${fill.weight.pct}%${state(fill.weight.state)}`].filter(Boolean).join(", ");
  const parts = [
    meters ? meters.charAt(0).toUpperCase() + meters.slice(1) : "No capacity known for this container type",
    `${fill.shipments} ${fill.shipments === 1 ? "shipment" : "shipments"}`,
    fill.missing > 0 && `${fill.missing} without a figure`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * What a shipment brings into a box, by the box's own rule (server lib/boxUtilization,
 * dimensionFiguresFilled): its Dimensions lines, a figure they lack from its typed totals. Link
 * shipments and a row whose box is still being read say what the box will count.
 */
export const boxCargoOf = (s: Parameters<typeof shipmentCargoFigures>[0]): { colli: number; weightKg: number; volumeCbm: number } => shipmentCargoFigures(s);

/** What shipments about to be linked would add to the box. */
export interface AddedCargo {
  shipments: number;
  weightKg: number;
  volumeCbm: number;
}

/**
 * The warning before shipments are linked to a box they would overfill: which limit they would
 * pass and by how much. null when the box still takes them, or has no capacity to judge by.
 * A warning only: the overflow is the user's decision, and linking is never refused for it.
 */
export function overfillWarning(box: BoxUtilization, added: AddedCargo): string | null {
  if (added.shipments === 0) return null;
  const after = (meter: BoxMeter | null, more: number) => (meter ? { used: meter.used + more, over: meter.used + more - meter.limit, pct: Math.max(101, Math.round(((meter.used + more) / meter.limit) * 100)) } : null);
  const [volume, weight] = [after(box.volume, added.volumeCbm), after(box.weight, added.weightKg)];
  const overs = [volume && volume.over > 0 && `volume to ${volume.pct}% (over by ${cbm(volume.over)})`, weight && weight.over > 0 && `weight to ${weight.pct}% (over by ${kg(weight.over)})`].filter(Boolean);
  if (overs.length === 0) return null;
  return `Linking ${added.shipments === 1 ? "this shipment" : `these ${added.shipments} shipments`} would bring the box's ${overs.join(" and its ")}. You can still link ${added.shipments === 1 ? "it" : "them"}.`;
}

/**
 * Why a shipment is an odd one in a box of a service of this mode, or null when it belongs there:
 * another mode of transport, or - in a consolidation box - a shipment with a container of its own
 * (Full Load) or a project shipment. Such a shipment is not linked. Both are read trimmed and in any
 * case, as the server reads them: the server holds the same rule (lib/coLoadingSailing oddInBox).
 */
export function oddInBox(serviceMode: string, shipment: { freightMode?: string | null; loadType?: string | null }): string | null {
  const same = (value: string, name: string) => value.trim().toLowerCase() === name.toLowerCase();
  const mode = (shipment.freightMode ?? "").trim();
  const load = shipment.loadType ?? "";
  const wanted: Record<string, string> = { sea_lcl: "Sea Freight", sea_fcl: "Sea Freight", air: "Air Freight", rail: "Rail Freight", road: "Road Freight" };
  const want = wanted[serviceMode];
  if (want && mode && !same(mode, want)) return mode;
  if (serviceMode === "sea_lcl") return ["Full Load", "Project Shipment"].find((name) => same(load, name)) ?? null;
  return null;
}

/** Why the picked shipments cannot be linked as they are: some are not what the box is for (the server refuses them: Council Review 7, K3). null when none is odd. */
export function oddWarning(kinds: string[]): string | null {
  if (kinds.length === 0) return null;
  const named = [...new Set(kinds)].join(", ");
  return kinds.length === 1 ? `This shipment is ${named}: not what this box is for. Untick it to link the others.` : `${kinds.length} of these shipments are not what this box is for (${named}). Untick them to link the others.`;
}

/** Why a shipment was taken off a sailing, in words. */
export function removedReasonWords(r: { reason: string; note?: string; movedTo?: string }): string {
  if (r.reason === "moved") return `Moved to ${r.movedTo || "another sailing"}${r.note ? `: ${r.note}` : ""}`;
  return r.reason === "shipment_deleted" ? "The shipment was deleted" : r.reason === "removed" ? "Removed by hand" : "Not recorded";
}

/** A sailing's containers in words: "40' HC", or "2 × 40' HC" when it has several. */
export const containersWords = (s: { containerType: string; containerCount?: number }): string => ((s.containerCount ?? 1) > 1 ? `${s.containerCount} × ${s.containerType}` : s.containerType);

/**
 * The remark when shipments are linked after the sailing's cut-off; null before it, on the day
 * itself, and when the sailing has none. `cutoffDate` and `today` are YYYY-MM-DD; `shown` is the
 * cut-off as the app writes dates.
 */
export const cutoffWarning = (cutoffDate: string | null | undefined, today: string, shown: string): string | null =>
  cutoffDate && today > cutoffDate ? `The cut-off of this sailing was ${shown}. You can still link shipments.` : null;

