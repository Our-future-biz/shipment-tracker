import { sql } from "drizzle-orm";
import { gateMovementTable } from "../schemas/gateMovement.schema";
import { warehouseReweighTable } from "../schemas/warehouseReweigh.schema";

// Re-weighing of LCL cargo ("VGM" as the warehouse uses the word): the warehouse weighs every LCL
// shipment on receipt. Pure rules, no imports from the services (no import cycle).
//
//   who needs it   LCL positions: operation type LCL… or load type Consolidation — never FCL /
//                  container yard positions, never Domestic (its gate-in is the receipt).
//   when           inbound (export) before the WH receipt; import before its house is ticked
//                  received at the stripping tally.
//   comparison     against the declared gross weight, with the remeasurement tolerance: more
//                  than 5 % either way is a variance (flagged, "Inform Operations").
//   history        append-only; a correction is a new weighing and the latest counts.

/** More than this share off the declared weight is a variance (the remeasurement tolerance). */
export const REWEIGH_TOLERANCE = 0.05;
export const MAX_REWEIGH_KG = 100_000;

const isFcl = (operationType: string) => /^(FCL|Container yard)/.test(operationType);

/**
 * The position is LCL cargo, so the warehouse re-weighs it before its receipt. Never Domestic
 * cargo: its gate-in is the receipt (a cross-dock does not re-weigh every pallet).
 */
export const needsReweigh = (m: { operationType: string; loadType: string; handling?: string }) =>
  m.handling !== "Domestic" && !isFcl(m.operationType) && (/^LCL/.test(m.operationType) || m.loadType === "Consolidation");

const t = gateMovementTable;
const r = warehouseReweighTable;

/** needsReweigh in SQL, on the gate movement being updated. */
export const needsReweighSql = sql`(${t.handling} <> 'Domestic' AND ${t.operationType} !~ '^(FCL|Container yard)' AND (${t.operationType} ~ '^LCL' OR ${t.loadType} = 'Consolidation'))`;

/** The movement has a re-weighing (checked at the moment of the UPDATE). */
export const hasReweighSql = sql`EXISTS (SELECT 1 FROM ${r} rw WHERE rw.movement_id = ${t.id} AND rw.deleted_at IS NULL)`;

/** Either it needs no re-weighing, or it has one. */
export const reweighOkSql = sql`(NOT ${needsReweighSql} OR ${hasReweighSql})`;

export const REWEIGH_FIRST = "LCL cargo is re-weighed before the receipt — record the re-weigh first";

/** Weighed against declared: the share off (+ heavier, − lighter) and whether it is a variance. */
export function reweighVariance(weighedKg: number, declaredKg: number | null | undefined): { pct: number | null; flagged: boolean } {
  if (!declaredKg || declaredKg <= 0 || !(weighedKg > 0)) return { pct: null, flagged: false };
  const pct = (weighedKg - declaredKg) / declaredKg;
  return { pct: Math.round(pct * 10_000) / 10_000, flagged: Math.abs(pct) > REWEIGH_TOLERANCE + 1e-9 };
}

/** "+4.6 %" / "−3.0 %" */
export const pctText = (p: number | null) => (p == null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(1)} %`);

/** "1 234.5 kg" */
export const kgText = (kg: number) => `${(Math.round(kg * 10) / 10).toLocaleString("en-GB").replace(/,/g, " ")} kg`;
