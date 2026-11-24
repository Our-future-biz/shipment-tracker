// A sailing's box as the Loading Planner takes it (Council Outlay 14, C1): the cargo lines of its
// counted shipments, each under its job number, so the box is planned piece by piece and its plan
// can be coloured by shipment. Pure: the service reads the sailing and its shipments, this turns
// them into the planner's cargo.
//
// A shipment's Dimensions rows are its lines. A shipment with typed totals only comes in as one line
// with no sizes - a line to finish, never a guessed cube (D18). A cancelled shipment is not in the box.

import type { SailingPlanCargo, SailingPlanLine, SailingPlanShipment } from "../interfaces/interfaces";
import { cargoNum } from "../../../lib/cargoVolume";
import { STACKABLE } from "./cargoProjection";
import type { BoxShipment } from "./boxUtilization";

/** The most characters a plan keeps of what it is linked to (the Loading Planner's limit on a reference). */
export const PLAN_REFERENCE_MAX = 60;

// "Stackable" was the wording before "Stackable / Overstowable"; rows written then still carry it.
const STACKABLE_WORDS = [STACKABLE, "Stackable", "Overstowable"];
const yes = (v: string) => v.trim().toLowerCase() === "yes";

/** What a plan linked to the sailing shows: "WEEK 51 · Import from Shanghai", cut to the planner's limit. */
export function sailingReference(sailing: { vessel: string; voyage: string }, serviceName: string): string {
  const name = [sailing.vessel, sailing.voyage].filter(Boolean).join(" ");
  return [name, serviceName.trim()].filter(Boolean).join(" · ").slice(0, PLAN_REFERENCE_MAX);
}

/** One shipment's cargo lines for the planner. */
export function planLinesOf(s: Pick<BoxShipment, "dangerous" | "pcs" | "totalWeightTons" | "cargoDimensions">): { lines: SailingPlanLine[]; totalsOnly: boolean } {
  const rows = s.cargoDimensions.filter((d) => cargoNum(d.pieces) > 0 || cargoNum(d.lengthCm) > 0 || cargoNum(d.widthCm) > 0 || cargoNum(d.heightCm) > 0 || cargoNum(d.weightPerPcKg) > 0);
  if (rows.length > 0) {
    return {
      totalsOnly: false,
      lines: rows.map((d) => ({
        packageType: (d.packageType ?? "").trim(),
        pieces: Math.max(1, Math.floor(cargoNum(d.pieces))),
        lengthCm: cargoNum(d.lengthCm),
        widthCm: cargoNum(d.widthCm),
        heightCm: cargoNum(d.heightCm),
        weightPerPcKg: cargoNum(d.weightPerPcKg),
        stackable: STACKABLE_WORDS.includes(d.stackable),
        dangerous: yes(s.dangerous) || !!d.adrUn?.trim() || !!d.adrClass?.trim(),
      })),
    };
  }
  // Totals only: its colli and its weight are known, its sizes are not.
  const pieces = Math.max(1, Math.floor(cargoNum(s.pcs ?? "")));
  const kg = cargoNum(s.totalWeightTons ?? "") * 1000;
  return {
    totalsOnly: true,
    lines: [{ packageType: "", pieces, lengthCm: 0, widthCm: 0, heightCm: 0, weightPerPcKg: kg > 0 ? Math.round((kg / pieces) * 10) / 10 : 0, stackable: false, dangerous: yes(s.dangerous) }],
  };
}

/** The box for the planner: the sailing's containers and its counted shipments' cargo, by job number. */
export function planCargoOf(
  sailing: { id: string; serviceId: string; vessel: string; voyage: string; containerType: string; containerCount: number },
  serviceName: string,
  shipments: readonly (Pick<BoxShipment, "id" | "jobNumber" | "dangerous" | "pcs" | "totalWeightTons" | "cargoDimensions"> & { cancelled: boolean })[],
): SailingPlanCargo {
  const counted: SailingPlanShipment[] = shipments
    .filter((s) => !s.cancelled)
    .map((s) => ({ shipmentId: s.id, jobNumber: s.jobNumber, ...planLinesOf(s) }))
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
  return { sailingId: sailing.id, serviceId: sailing.serviceId, reference: sailingReference(sailing, serviceName), containerType: sailing.containerType, containerCount: sailing.containerCount, shipments: counted };
}
