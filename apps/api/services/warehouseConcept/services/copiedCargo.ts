// A shipment's declared cargo as its gate record takes it over (on import and on "Refresh from
// shipment"). The shipment holds free text: pieces shown with thousands separators ("1,353") and a
// weight or volume with a decimal comma ("4,2" t). Read here as Shipments reads its declared figures
// (shipments lib/remeasureNotice declaredFigures) and as the web's "Copy from job" does, so the three
// never disagree: the typed Pcs, Total Weight / Total Volume, and when one is empty the totals of the
// job's cargo dimension lines (user council W3: a job declared only in its lines came in as 0 kg /
// 0 cbm). A job with no dimension line falls back to the totals its other lines give (containers,
// cargo items), as the job page shows them. Pure.

import { cargoNum, dimensionVolumePerPiece, type PieceSizes } from "../../../lib/cargoVolume";

export interface CopiedCargo {
  /** Whole pieces: the gate record counts them so. */
  colli: number;
  /** Tonnes to kg, kept to the gram (the column is numeric(12,3)); not rounded to whole kg. */
  weightKg: number;
  measureCbm: number;
}

type DimensionLine = PieceSizes & { pieces: string; weightPerPcKg: string };

export interface ShipmentCargo {
  pcs?: string | null;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
  /** The job's cargo dimension lines, as Shipments serves them. */
  cargoDimensions?: readonly DimensionLine[] | null;
  /** The job's computed line totals, shown with thousands separators ("1,850", "7.2"). */
  totalGrossWeightKg?: string | null;
  totalVolumeM3?: string | null;
}

// Kept to the gram / the thousandth, as the columns store them.
const to3 = (n: number) => Math.round(n * 1000) / 1000;
// A computed total is shown with thousands separators, never a decimal comma.
const shownNum = (v: string | null | undefined) => cargoNum((v ?? "").replace(/,/g, ""));

export function copiedCargo(s: ShipmentCargo): CopiedCargo {
  const colli = Math.floor(cargoNum((s.pcs ?? "").replace(/,/g, "")));
  const tons = cargoNum(s.totalWeightTons);
  const cbm = cargoNum(s.totalVolumeCbm);
  const lines = s.cargoDimensions ?? [];
  let linePieces = 0;
  let lineKg = 0;
  let lineCbm = 0;
  for (const l of lines) {
    const pieces = cargoNum(l.pieces);
    linePieces += pieces;
    lineKg += pieces * cargoNum(l.weightPerPcKg);
    lineCbm += pieces * dimensionVolumePerPiece(l);
  }
  const fallbackKg = lineKg > 0 ? to3(lineKg) : shownNum(s.totalGrossWeightKg);
  const fallbackCbm = lineCbm > 0 ? to3(lineCbm) : shownNum(s.totalVolumeM3);
  return {
    // No Pcs typed: the pieces of the dimension lines, as Shipments' declaredFigures counts them.
    colli: colli > 0 ? colli : Math.max(0, Math.floor(linePieces)),
    weightKg: tons > 0 ? Math.round(tons * 1_000_000) / 1000 : fallbackKg > 0 ? fallbackKg : 0,
    measureCbm: cbm > 0 ? cbm : fallbackCbm > 0 ? fallbackCbm : 0,
  };
}
