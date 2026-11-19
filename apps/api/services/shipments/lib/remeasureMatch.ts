import type { PieceSizes } from "../../../lib/cargoVolume";
import { projectCargo } from "./cargoProjection";
import { readFigures, roundedFigures } from "./remeasureAccept";
import { informedCharge, informedSource, remeasureVerdict, shipmentFiguresFor, type ChargeKind, type ComparedWith } from "./remeasureNotice";

// Whether a shipment's Cargo Details now say what the warehouse remeasured: the one judgement of
// "matches now", for every reader of an Inform Operations - the shipment's Alerts tab
// (services/alert.service nowMatches) and Shipments → Managers, whose Warehouse Concept
// remeasurement warning ends on it (X4, Y4). Pure.
//
// It compares the shipment as it SHOWS - not its stored Pcs, Total Weight and Total Volume
// alone. Cargo Details saves lines, not those fields, and a job made from a quote never stores a
// Pcs: compared with the stored fields, a warning ran its full week after the lines were put
// right, and a stale stored Pcs could end it falsely. What the shipment shows is
// services/shipment.service enrich: Pcs worked out from its Container and Cargo Details rows
// (lib/cargoProjection projectCargo; the stored Pcs only on a shipment with no rows), Total Weight
// and Total Volume as stored, and its dimension lines, which fill in a figure the others lack
// (lib/remeasureNotice shipmentFiguresFor).

/** A shipment's stored cargo fields, as a row of the shipment table carries them. */
export interface StoredCargo {
  pcs?: string | null;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
}

/** A shipment's detail rows, as stored or as the API serves them: what projectCargo reads, with the dimension lines' sizes. */
export interface CargoRows {
  containers: readonly { packages: string; grossWeight: string; volume: string; teu: string; type: string; packageType: string }[];
  items: readonly { pieces: string; grossWeight: string; packageType: string; hsCode: string; cargoDescription: string }[];
  dimensions: readonly (PieceSizes & { pieces: string; weightPerPcKg: string })[];
}

/** The shipment's cargo as it shows, in the shape lib/remeasureNotice compares (shipmentFiguresFor). */
export interface ShownCargo {
  pcs: string | null;
  totalWeightTons: string | null;
  totalVolumeCbm: string | null;
  cargoDimensions: CargoRows["dimensions"];
}

/**
 * A shipment's cargo as its page shows it (services/shipment.service enrich): the Pcs of its
 * detail rows when it has any - the stored Pcs only when it has none - Total Weight and Total
 * Volume as stored, its dimension lines.
 */
export function shownCargo(stored: StoredCargo, rows: CargoRows): ShownCargo {
  const hasRows = rows.containers.length > 0 || rows.items.length > 0 || rows.dimensions.length > 0;
  return {
    pcs: hasRows ? projectCargo([...rows.containers], [...rows.items], [...rows.dimensions]).pcs : (stored.pcs ?? null),
    totalWeightTons: stored.totalWeightTons ?? null,
    totalVolumeCbm: stored.totalVolumeCbm ?? null,
    cargoDimensions: rows.dimensions,
  };
}

/**
 * What the warehouse's screen compared an Inform Operations with, from its history entry's new
 * value: "declared" (Warehouse Concept), else the dimension lines (Shipments → Warehouse, and an
 * entry written before it was kept) - as the Alerts tab reads it.
 */
export function informedComparedWith(newValue: string | null | undefined): ComparedWith {
  try {
    const v = JSON.parse(newValue ?? "") as { comparedWith?: unknown } | null;
    return v?.comparedWith === "declared" ? "declared" : "dimensions";
  } catch {
    return "dimensions";
  }
}

/**
 * Whether the shipment as it shows now matches what an Inform Operations remeasured (its history
 * entry's new value): its figures compared the way the warehouse's screen compared them
 * (informedComparedWith), with that warehouse's tolerance (informedSource: Warehouse Concept's
 * 5 %), every figure known on both sides alike (lib/remeasureNotice remeasureVerdict). The
 * remeasured figures are rounded as a shipment stores them (kg to 0.1, m³ to 0.001,
 * lib/remeasureAccept roundedFigures): 7 × 13.25 kg remeasured is 92.75 kg, and the Total Weight
 * that takes it over holds 92.8 kg - unrounded, it would never match.
 */
export function matchesNow(shown: ShownCargo, informedNewValue: string | null | undefined, jobCharge?: ChargeKind): boolean {
  const ours = shipmentFiguresFor(shown, informedComparedWith(informedNewValue));
  return remeasureVerdict(ours, roundedFigures(readFigures(informedNewValue)), informedSource(informedNewValue), judgedCharge(informedNewValue, jobCharge)) === "matches";
}

/**
 * What an Inform Operations is judged by: the charge kept on its entry (since council Y9) - what
 * Alerts and the chat said when the warehouse informed - else what the job is charged by now
 * (`jobCharge`, chargeKindOf). Only a reader that knows neither falls to the cautious default, so
 * an older entry of a Full Load job is not read as a W/M change it never was.
 */
export function judgedCharge(informedNewValue: string | null | undefined, jobCharge?: ChargeKind): ChargeKind | undefined {
  return informedCharge(informedNewValue) ?? jobCharge;
}
