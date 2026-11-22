import type { DeclaredFigures } from "@/lib/cargo";
import { freightKindOf } from "../../_components/taskDefinitions";
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

// A B/L number as two are compared (as the server's billOfLadingKey): letters and digits, upper case.
const bolKey = (ref: string | null | undefined) => (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The kept figures of the shipment's House B/L `houseBol`; null when there are none, they can't be read, or
 * they were read from another House B/L (review of system-23): after the shipment's House B/L is corrected,
 * the old one's figures are not its Bill Of Lading Details. The two compared by letters and digits, any case;
 * figures kept without the B/L they were read from still count.
 */
export function readHouseBlFigures(json: string | undefined, houseBol: string | null | undefined): HouseBlFigures | null {
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
    if (bolKey(out.houseBol) && bolKey(out.houseBol) !== bolKey(houseBol)) return null;
    return out.colli || out.weightKg || out.volumeCbm ? out : null;
  } catch {
    return null;
  }
}

/**
 * Whether a job's Cargo Details lines are held against its House B/L's figures (owner's answer 22 Nov): only on a
 * sea Consolidation with containers, whose container is the master's box, its figures the whole box's. A road
 * consolidation (Trucking's LTL jobs, roadJob.service), an air one or a sea one with no container has no
 * master's box: its lines are checked as before - its container's figures, or its own Colli, Total Weight and
 * Total Volume (review of system-23). The load type read in any case, as the server reads it (jobNumber same()),
 * how the job travels as everywhere on the page (freightKindOf); `containers`: the job's saved containers.
 */
export function heldToHouseBl(
  s: { loadType?: string | null; tradeDirection?: string | null; freightMode?: string | null; department?: string | null },
  containers: number,
): boolean {
  return (s.loadType ?? "").trim().toLowerCase() === "consolidation" && freightKindOf(s.tradeDirection, s.freightMode, s.department) === "sea" && containers > 0;
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
