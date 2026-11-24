import { CONTAINERS } from "./containers";
import { loadStats, planTotals } from "./loadStats";
import type { LoadPlan } from "./plan";

// "Compare alternatives" (Council Outlay 14, P6): the same cargo planned into other equipment, side
// by side with the plan on screen - 20' boxes against a 40' high cube - before one is chosen.

/** What a plan comes to, in the figures two plans are compared by. */
export interface CompareFigures {
  /** "2 × 20' DC + 1 × 40' FR"; "" when nothing is loaded. */
  containers: string;
  count: number;
  /** Colli the plan found no place for. */
  notLoaded: number;
  /** Share of all the floors under cargo, and of all the payloads used; 0 with no container. */
  floorPct: number;
  payloadPct: number;
  /** Containers out of gauge, and those needing the liner's confirmation. */
  outOfGauge: number;
  linerConfirm: number;
}

export function compareFigures(plan: LoadPlan): CompareFigures {
  const totals = planTotals(plan);
  const stats = plan.loads.map((load) => ({ load, stats: loadStats(load) }));
  const floor = plan.loads.reduce((sum, l) => sum + l.container.internalL * l.container.internalW, 0);
  const payload = plan.loads.reduce((sum, l) => sum + l.container.payloadKg, 0);
  return {
    containers: totals.equipment.map((e) => `${e.count} × ${e.name}`).join(" + "),
    count: plan.loads.length,
    notLoaded: totals.notLoaded,
    floorPct: floor > 0 ? stats.reduce((sum, s) => sum + s.stats.floorPct * s.load.container.internalL * s.load.container.internalW, 0) / floor : 0,
    payloadPct: payload > 0 ? (totals.weightKg / payload) * 100 : 0,
    outOfGauge: stats.filter((s) => s.stats.outOfGauge).length,
    linerConfirm: stats.filter((s) => s.stats.linerConfirm).length,
  };
}

/** The most alternatives shown beside the plan. */
export const MAX_ALTERNATIVES = 3;

/** The alternatives a comparison opens with: each usual standard type by itself, the 20' against the 40's. */
export const FIRST_ALTERNATIVES: string[][] = [["20dc"], ["40dc"], ["40hc"]];

/** The names of nominated types, in the planner's own order: "20' DC, 40' HC"; "Planner chooses" for none nominated. */
export const equipmentWords = (nominated: readonly string[] | null): string =>
  nominated === null ? "Planner chooses" : CONTAINERS.filter((c) => nominated.includes(c.id)).map((c) => c.name).join(", ") || "Nothing nominated";

/** Whether two nominations allow the same equipment, in any order. */
export const sameEquipment = (a: readonly string[] | null, b: readonly string[] | null): boolean =>
  a === null || b === null ? a === b : a.length === b.length && a.every((id) => b.includes(id));
