// The pieces, kg and cbm "Copy from Job no." takes over, as the server's import reads them
// (warehouseConcept services/copiedCargo): the typed Pcs, Total Weight / Total Volume; an empty one from
// the job's cargo dimension lines, as Shipments declares it; with no dimension line, from the job's
// other line totals (containers, cargo items) as the job page shows them. User council W3: a job
// declared only in its lines came in as 0 kg / 0 cbm. Pure (tested in copiedFromJob.test.ts).

import { dimensionVolumePerPiece, num as cargoNum } from "@/lib/cargo";
import { copiedCargoFigures } from "./cargoCompare";

type JobCargo = {
  pcs?: string | null;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
  cargoDimensions?: readonly (Parameters<typeof dimensionVolumePerPiece>[0] & { pieces: string; weightPerPcKg: string })[] | null;
  /** The job's computed line totals, shown with thousands separators ("1,850"). */
  totalGrossWeightKg?: string | null;
  totalVolumeM3?: string | null;
};

// A computed total is shown with thousands separators, never a decimal comma.
const shownNum = (v: string | null | undefined) => cargoNum((v ?? "").replace(/,/g, ""));
// Kept to the gram / the thousandth, as the gate record stores them.
const to3 = (n: number) => Math.round(n * 1000) / 1000;

export function copiedFromJob(sh: JobCargo): { colli: number; weightKg: number; measureCbm: number } {
  const typed = copiedCargoFigures(sh);
  let pieces = 0;
  let kg = 0;
  let cbm = 0;
  for (const l of sh.cargoDimensions ?? []) {
    pieces += cargoNum(l.pieces);
    kg += cargoNum(l.pieces) * cargoNum(l.weightPerPcKg);
    cbm += cargoNum(l.pieces) * dimensionVolumePerPiece(l);
  }
  const fallbackKg = kg > 0 ? to3(kg) : shownNum(sh.totalGrossWeightKg);
  const fallbackCbm = cbm > 0 ? to3(cbm) : shownNum(sh.totalVolumeM3);
  return {
    // No Pcs typed: the pieces of the dimension lines, as Shipments' declaredFigures counts them.
    colli: typed.colli > 0 ? typed.colli : Math.max(0, Math.floor(pieces)),
    weightKg: typed.weightKg > 0 ? typed.weightKg : Math.max(0, fallbackKg),
    measureCbm: typed.measureCbm > 0 ? typed.measureCbm : Math.max(0, fallbackCbm),
  };
}
