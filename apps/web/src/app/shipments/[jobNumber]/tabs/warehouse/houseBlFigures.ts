import type { DeclaredFigures } from "@/lib/cargo";
import type { CargoFigures } from "./RemeasureCompare";

// The Colli, weight and volume of the shipment's own House B/L, as Document Reading read it (owner's answer
// 22 Nov), kept in the warehouse's job section (house_bl_figures) apart from the warehouse's remeasured
// lines: the Warehouse tab shows them as "Bill Of Lading Details" beside the remeasured figures, never as
// one of them. Pure.

export const HOUSE_BL_KEY = "house_bl_figures";

/** The figures as kept: the House B/L they are of, and when they were read. */
export interface HouseBlFigures extends CargoFigures {
  houseBol: string;
  readAt: string;
}

const figure = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** The kept figures; null when there are none or they can't be read. */
export function readHouseBlFigures(json: string | undefined): HouseBlFigures | null {
  try {
    const o: unknown = JSON.parse(json || "null");
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const r = o as Record<string, unknown>;
    const out = {
      houseBol: typeof r.houseBol === "string" ? r.houseBol : "",
      readAt: typeof r.readAt === "string" ? r.readAt : "",
      colli: figure(r.colli),
      weightKg: figure(r.weightKg),
      volumeCbm: figure(r.volumeCbm),
    };
    return out.colli || out.weightKg || out.volumeCbm ? out : null;
  } catch {
    return null;
  }
}

/**
 * The House B/L's figures as what a consolidation's Dimensions are checked against (owner's answer 22 Nov):
 * its container is the master's box, whose figures are the whole box, not this house. Nothing declared
 * while no B/L was read ("/ —"). The weight to 0.1 kg, as kept.
 */
export function houseBlDeclaredFigures(f: CargoFigures | null): DeclaredFigures {
  const text = (n: number | undefined) => (n && n > 0 ? String(n) : "");
  return { packages: text(f?.colli), grossWeight: text(f?.weightKg), volume: text(f?.volumeCbm), kgDecimals: 1 } as DeclaredFigures;
}
