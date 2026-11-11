// A shipment's declared cargo as its gate record takes it over (on import and on "Refresh from
// shipment"). The shipment holds free text: pieces shown with thousands separators ("1,353") and a
// weight or volume with a decimal comma ("4,2" t). Read here as Shipments reads its declared figures
// (shipments lib/remeasureNotice declaredFigures) and as the web's "Copy from job" does, so the three
// never disagree. Pure.

import { cargoNum } from "../../../lib/cargoVolume";

export interface CopiedCargo {
  /** Whole pieces: the gate record counts them so. */
  colli: number;
  /** Tonnes to kg, kept to the gram (the column is numeric(12,3)); not rounded to whole kg. */
  weightKg: number;
  measureCbm: number;
}

export function copiedCargo(s: { pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null }): CopiedCargo {
  const colli = Math.floor(cargoNum((s.pcs ?? "").replace(/,/g, "")));
  const tons = cargoNum(s.totalWeightTons);
  const cbm = cargoNum(s.totalVolumeCbm);
  return {
    colli: colli > 0 ? colli : 0,
    weightKg: tons > 0 ? Math.round(tons * 1_000_000) / 1000 : 0,
    measureCbm: cbm > 0 ? cbm : 0,
  };
}
