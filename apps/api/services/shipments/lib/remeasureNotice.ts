// The message the warehouse's "Inform Operations" posts to a shipment's chat: the cargo was
// remeasured, the shipment's figures against the remeasured ones, and the shipment's Person in
// Charge and Holiday Cover tagged, so it reaches their notifications (a chat @mention). Built here,
// on the server, from the shipment as stored and the company's users, so who is tagged is never
// what a browser says. Pure; comment.service posts it.

import { cargoNum, dimensionVolumePerPiece, type PieceSizes } from "../../../lib/cargoVolume";
import { userByEmail, type CompanyUser } from "../../../lib/personPick";

export interface CargoFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/**
 * What the warehouse's screen compared its remeasured lines with: the totals of the shipment's
 * cargo dimension lines (Shipments → Warehouse), or what the shipment declares - its pieces,
 * weight and volume, the dimension lines filling in a missing one (Warehouse Concept's position).
 */
export const COMPARED_WITH = ["dimensions", "declared"] as const;
export type ComparedWith = (typeof COMPARED_WITH)[number];

export interface RemeasureNotice {
  message: string;
  /** Who is tagged: the users the two fields name, each once (the one clicking too, when named). */
  tagged: CompanyUser[];
}

type DimensionLine = PieceSizes & { pieces: string; weightPerPcKg: string };

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** The totals of cargo dimension lines: pieces, pieces × kg per piece, pieces × m³ of a piece. */
export function dimensionFigures(lines: readonly DimensionLine[]): CargoFigures {
  let colli = 0;
  let kg = 0;
  let m3 = 0;
  for (const l of lines) {
    const pieces = cargoNum(l.pieces);
    colli += pieces;
    kg += pieces * cargoNum(l.weightPerPcKg);
    m3 += pieces * dimensionVolumePerPiece(l);
  }
  return { colli, weightKg: round(kg, 1), volumeCbm: round(m3, 3) };
}

/**
 * What a shipment declares: its pieces (shown with thousands separators), weight (tonnes → kg) and
 * volume; a missing one from its cargo dimension lines.
 */
export function declaredFigures(s: { pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null; cargoDimensions?: readonly DimensionLine[] | null }): CargoFigures {
  const dims = dimensionFigures(s.cargoDimensions ?? []);
  const pcs = cargoNum((s.pcs ?? "").replace(/,/g, ""));
  const tons = cargoNum(s.totalWeightTons);
  const cbm = cargoNum(s.totalVolumeCbm);
  return {
    colli: pcs > 0 ? pcs : dims.colli,
    weightKg: tons > 0 ? round(tons * 1000, 1) : dims.weightKg,
    volumeCbm: cbm > 0 ? round(cbm, 3) : dims.volumeCbm,
  };
}

type ShipmentCargo = { pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null; cargoDimensions?: readonly DimensionLine[] | null };

/**
 * The shipment's figures as Shipments → Warehouse and Cargo Details compare the remeasurement with
 * them: the totals of its cargo dimension lines, a figure the lines lack (no kg per piece typed,
 * the weight only in Total Weight) from its Pcs, Total Weight and Total Volume (council finding
 * N1) - else a figure 0 on one side would be skipped and a heavier remeasurement "match". Lacked
 * by any line with pieces, not only by all (review: 1 × 600 kg and 1 piece unweighed are not 600 kg
 * of cargo when Total Weight says 1.2 t), the typed figure is the cargo's while one is typed.
 */
export function dimensionFiguresFilled(s: ShipmentCargo): CargoFigures {
  const lines = s.cargoDimensions ?? [];
  const dims = dimensionFigures(lines);
  const typed = declaredFigures({ pcs: s.pcs, totalWeightTons: s.totalWeightTons, totalVolumeCbm: s.totalVolumeCbm });
  const lacks = (perPiece: (l: DimensionLine) => number) => lines.some((l) => cargoNum(l.pieces) > 0 && !(perPiece(l) > 0));
  const filled = (fromLines: number, fromTyped: number, perPiece: (l: DimensionLine) => number) => (fromTyped > 0 && lacks(perPiece) ? fromTyped : fromLines || fromTyped);
  return {
    colli: dims.colli || typed.colli,
    weightKg: filled(dims.weightKg, typed.weightKg, (l) => cargoNum(l.weightPerPcKg)),
    volumeCbm: filled(dims.volumeCbm, typed.volumeCbm, dimensionVolumePerPiece),
  };
}

/** The shipment's figures a remeasurement is compared with, by what the warehouse's screen compared it with. */
export const shipmentFiguresFor = (s: ShipmentCargo, comparedWith: ComparedWith): CargoFigures =>
  comparedWith === "declared" ? declaredFigures(s) : dimensionFiguresFilled(s);

const figures = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");

/** The history entry of each Inform Operations: old value = the shipment's figures, new = the remeasured ones. */
export const REMEASURE_INFORMED = "remeasureInformed";

/**
 * How the remeasured figures stand to the shipment's (owner decision, 18 Nov 2026): "differs" when
 * the pieces, weight or volume is more or less (both known, apart by more than 0.001) - an Alert on
 * the shipment's Alerts tab; "matches" when every figure known on both sides is the same - only the
 * chat message, in Notifications; "unknown" when no figure is known on both sides.
 *
 * A figure only the remeasurement has (mock test council Y9: 5 pcs, 1,000 kg and no volume, the
 * warehouse measured 4.8 m³) is new to the shipment: it "differs" when it changes what the freight
 * is charged by - W/M, or the air chargeable weight - and then also with nothing known on both
 * sides. A Full Load charged per container is not charged by it.
 *
 * Warehouse Concept marks a remeasurement within its tolerance as no variance (council finding
 * L6): any difference in pieces, or more than 5 % on weight, volume or W/M (its _lib/cargoCompare).
 * One of its remeasurements within that tolerance "matches" here too - only its chat message; a new
 * figure of its counts when it moves the charge by more than the tolerance.
 */
export type RemeasureVerdict = "differs" | "matches" | "unknown";

/** The warehouse a remeasurement comes from (interfaces RemeasureSource). */
export type RemeasureFrom = "warehouse" | "warehouseConcept";

/** Warehouse Concept's tolerance on weight, volume and W/M; pieces must match exactly. */
export const CONCEPT_TOLERANCE = 0.05;

/**
 * What a shipment's freight is charged by (the web's lib/chargeBasis): "air" the chargeable weight
 * (the greater of the kg and m³ × 1,000,000 ÷ 6000), "container" per container - a sea or rail Full
 * Load (mock test council P18) - and "wm" the greater of tons and m³ for every other.
 */
export type ChargeKind = "air" | "wm" | "container";
export const CHARGE_KINDS = ["air", "wm", "container"] as const;

export function chargeKindOf(freightMode: string | null | undefined, loadType: string | null | undefined): ChargeKind {
  const mode = (freightMode ?? "").trim().toLowerCase();
  if (mode.startsWith("air")) return "air";
  const fullLoad = (loadType ?? "").trim().toLowerCase() === "full load";
  return fullLoad && (mode === "sea freight" || mode === "rail freight") ? "container" : "wm";
}

/** The air divisor: 6000 cm³ to the kg, as Sales quotes and the web's lib/chargeBasis use. */
const AIR_DIVISOR = 6000;

// The charged figure of `f`: the chargeable weight (kg, 0.1) or W/M (0.001).
const chargedFigure = (f: CargoFigures, kind: "air" | "wm") =>
  kind === "air" ? round(Math.max(f.weightKg, (f.volumeCbm * 1_000_000) / AIR_DIVISOR), 1) : round(Math.max(f.weightKg / 1000, f.volumeCbm), 3);

const both = (a: number, b: number) => a > 0 && b > 0;
const KEYS = ["colli", "weightKg", "volumeCbm"] as const;

/** The figures only the remeasurement has: the shipment's is 0 or not known. */
const added = (shipment: CargoFigures, remeasured: CargoFigures) => KEYS.filter((k) => remeasured[k] > 0 && !(shipment[k] > 0));

/**
 * Whether the remeasured figures change what the freight is charged by. `charge` left out (a reader
 * that does not know the job's mode): when either W/M or the chargeable weight changes, so nothing
 * that may cost money is taken for a match. Warehouse Concept's by more than its tolerance.
 */
export function chargeChanged(shipment: CargoFigures, remeasured: CargoFigures, charge?: ChargeKind, source: RemeasureFrom = "warehouse"): boolean {
  const kinds: ("air" | "wm")[] = charge === undefined ? ["air", "wm"] : charge === "container" ? [] : [charge];
  return kinds.some((k) => {
    const [a, b] = [chargedFigure(shipment, k), chargedFigure(remeasured, k)];
    if (!(a > 0)) return b > 0;
    return source === "warehouseConcept" ? Math.abs((b - a) / a) > CONCEPT_TOLERANCE + 1e-9 : Math.abs(a - b) > 0.001;
  });
}

// W/M as Warehouse Concept compares it: the larger of m³ and tonnes, to 2 decimals.
const wm = (f: CargoFigures) => Math.round(Math.max(f.volumeCbm, f.weightKg / 1000) * 100) / 100;

/** Whether the remeasurement is within Warehouse Concept's tolerance of the shipment's figures (a figure 0 on one side is not compared). */
export function withinConceptTolerance(shipment: CargoFigures, remeasured: CargoFigures): boolean {
  if (both(shipment.colli, remeasured.colli) && shipment.colli !== remeasured.colli) return false;
  const over = (a: number, b: number) => both(a, b) && Math.abs((b - a) / a) > CONCEPT_TOLERANCE + 1e-9;
  return !over(shipment.weightKg, remeasured.weightKg) && !over(shipment.volumeCbm, remeasured.volumeCbm) && !over(wm(shipment), wm(remeasured));
}

const apart = (shipment: CargoFigures, remeasured: CargoFigures) =>
  KEYS.some((k) => both(shipment[k], remeasured[k]) && Math.abs(shipment[k] - remeasured[k]) > 0.001);

/**
 * `charge`: what the job is charged by (chargeKindOf), for a figure only the remeasurement has; left
 * out, either W/M or the chargeable weight changing makes it differ (chargeChanged).
 */
export function remeasureVerdict(shipment: CargoFigures, remeasured: CargoFigures, source: RemeasureFrom = "warehouse", charge?: ChargeKind): RemeasureVerdict {
  if (apart(shipment, remeasured) && !(source === "warehouseConcept" && withinConceptTolerance(shipment, remeasured))) return "differs";
  if (added(shipment, remeasured).length > 0 && chargeChanged(shipment, remeasured, charge, source)) return "differs";
  return KEYS.some((k) => both(shipment[k], remeasured[k])) ? "matches" : "unknown";
}

/**
 * What the job was charged by when the warehouse informed (an Inform Operations' history entry, its
 * new value): undefined for one written before it was kept - its reader then decides on the job as
 * it is now, or leaves it out (remeasureVerdict).
 */
export function informedCharge(newValue: string | null | undefined): ChargeKind | undefined {
  try {
    const v = JSON.parse(newValue ?? "") as { charge?: unknown } | null;
    return CHARGE_KINDS.find((k) => k === v?.charge);
  } catch {
    return undefined;
  }
}

/** Which warehouse an Inform Operations' history entry (its new value) came from; the Warehouse's for one written before it was kept. */
export function informedSource(newValue: string | null | undefined): RemeasureFrom {
  try {
    const v = JSON.parse(newValue ?? "") as { source?: unknown } | null;
    return v?.source === "warehouseConcept" ? "warehouseConcept" : "warehouse";
  } catch {
    return "warehouse";
  }
}

const signed = (d: number, digits: number) =>
  `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/**
 * "weight +200.0 kg · volume +5.332 CBM": the figures that differ, the remeasured less the
 * shipment's - also one the shipment lacks ("volume +4.800 CBM"), which is new to it.
 */
export function differenceText(shipment: CargoFigures, remeasured: CargoFigures): string {
  const parts: string[] = [];
  const add = (k: (typeof KEYS)[number], label: string, digits: number, unit: string) => {
    const d = remeasured[k] - shipment[k];
    if (remeasured[k] > 0 && Math.abs(d) > 0.001) parts.push(`${label} ${signed(d, digits)}${unit}`);
  };
  add("colli", "colli", 0, "");
  add("weightKg", "weight", 1, " kg");
  add("volumeCbm", "volume", 3, " CBM");
  return parts.join(" · ");
}

// A person field holds a user's e-mail; a stamp keeps the time after " — ".
const personOf = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim();

/**
 * The notice for a shipment whose Person in Charge and Holiday Cover hold `people` (users stored
 * by e-mail). A field naming nobody, or someone who is no user of the company, tags no one; the
 * message still goes to the chat. A note typed with Inform Operations goes with it.
 */
export function remeasureNotice(
  people: { personInCharge?: string | null; holidayCover?: string | null },
  users: readonly CompanyUser[],
  shipment: CargoFigures,
  remeasured: CargoFigures,
  note = "",
  source: RemeasureFrom = "warehouse",
  charge?: ChargeKind,
): RemeasureNotice {
  const tagged: CompanyUser[] = [];
  for (const value of [people.personInCharge, people.holidayCover]) {
    const user = userByEmail(personOf(value), [...users]);
    if (user && !tagged.includes(user)) tagged.push(user);
  }
  const lines = ["Cargo has been remeasured by the warehouse.", `Shipment values: ${figures(shipment)}`, `Remeasured values: ${figures(remeasured)}`];
  const verdict = remeasureVerdict(shipment, remeasured, source, charge);
  const difference = differenceText(shipment, remeasured);
  if (verdict === "differs") lines.push(`Difference: ${difference}`);
  else if (verdict === "matches" && apart(shipment, remeasured)) {
    lines.push(`Difference: ${difference} - within the ${CONCEPT_TOLERANCE * 100} % tolerance.`);
  } else if (difference) {
    // Only figures the shipment lacked, which leave the charge as it was.
    lines.push(`New: ${difference} - the shipment values had none; the charge stays the same.`);
  } else if (verdict === "matches") lines.push("The remeasured values match the shipment values.");
  if (note.trim()) lines.push(`Note: ${note.trim()}`);
  // Written as the chat writes a tag: "@" and the name the @ list shows.
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), tagged };
}
