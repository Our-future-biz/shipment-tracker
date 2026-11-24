import type { interfaces, lib } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";
import type { DraftLine, JobLink } from "./cargoForm";
import { linesFromShipment, sameJobNumber } from "./jobCargo";
import { isReadLineComplete } from "./readCargo";
import { DIM_UNITS, type DimUnit } from "./units";

// The planner page's own decisions, kept out of its components so they are tested.

// The unit a user last typed sizes in is kept in their browser: a convenience, so the page works without it.
const UNIT_KEY = "loading-planner-unit";

/** The remembered unit, or mm when none (or something else) is stored, or the browser keeps nothing. */
export function rememberedUnit(): DimUnit {
  try {
    const unit = window.localStorage.getItem(UNIT_KEY);
    return DIM_UNITS.find((u) => u === unit) ?? "mm";
  } catch {
    return "mm";
  }
}

export function rememberUnit(unit: DimUnit): void {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // Private windows and blocked storage: the unit is simply not remembered.
  }
}

/** The job a saved plan is linked to, or null for a what-if plan. */
export const linkOf = (plan: interfaces.LoadingPlanItem | null): JobLink | null =>
  plan?.linkKind && plan.linkId ? { kind: plan.linkKind, id: plan.linkId, ref: plan.linkRef } : null;

/**
 * The link on screen once a save comes back. The server names the job as it is called now, so its
 * reference is taken while the link is the one that was sent; a link the user changed while the
 * save was on its way (unlinked, or linked to another job) stays as they left it, still unsaved.
 */
export function linkAfterSave(onScreen: JobLink | null, saved: interfaces.LoadingPlanItem): JobLink | null {
  const stored = linkOf(saved);
  return onScreen && stored && onScreen.kind === stored.kind && onScreen.id === stored.id ? stored : onScreen;
}

/**
 * What to do with the plan as the server has it now: nothing while it is the version on screen
 * (or an older one), take it over at once while nothing here is unsaved, or else offer it and let
 * the user choose.
 */
export function newerVersionStep(server: interfaces.LoadingPlanItem | null, onScreen: interfaces.LoadingPlanItem | null, dirty: boolean): "adopt" | "offer" | null {
  if (!server || !onScreen || server.updatedAt <= onScreen.updatedAt) return null;
  return dirty ? "offer" : "adopt";
}

/** A line read from a document whose name and figures are already in the plan: most likely the same document read twice. */
export const alreadyInPlan = (line: lib.CargoLineRead, plan: DraftLine[]): boolean =>
  isReadLineComplete(line) &&
  plan.some(
    (have) =>
      have.name.trim().toLowerCase() === line.name.trim().toLowerCase() &&
      have.lengthMm === line.lengthMm &&
      have.widthMm === line.widthMm &&
      have.heightMm === line.heightMm &&
      have.weightKg === line.weightKg &&
      have.colli === line.colli,
  );

/** How a shipment is looked up: by its id (a page that has it), or by the job number the user typed. */
export const shipmentLookup = (key: string): { id: string } | { jobNumber: string } => (isUuid(key) ? { id: key } : { jobNumber: key.trim() });

/**
 * The shipment that carries the job number, among those the list's search found by its digits: the
 * same number must come back, whatever letters it carries now (CZ00000053 is CZLCL00000053 once its
 * Freight Mode is set).
 */
export const shipmentWithJobNumber = <T extends { jobNumber?: string | null }>(found: T[], jobNumber: string): T | undefined =>
  found.find((s) => sameJobNumber(s.jobNumber ?? "", jobNumber));

/**
 * A shipment's cargo as planner lines: the Dimensions rows of its Cargo Details, or, while it has
 * none yet, the dimensions booked with its quote.
 */
export function shipmentLines(
  shipment: { cargoDimensions?: interfaces.CargoDimensionLine[] | null; bookedDimensions?: interfaces.CargoDimensionLine[] | null },
  newId: () => string,
): DraftLine[] {
  const own = linesFromShipment(shipment.cargoDimensions, newId);
  return own.length > 0 ? own : linesFromShipment(shipment.bookedDimensions, newId);
}
