// The loading order of a container (Council Outlay 14, P1): the plan's pieces as the steps a
// stuffing gang takes, from the front wall to the doors. Pure, so it is tested without the PDF.
//
// The planner works out where each piece stands; the order follows from the positions alone. A
// container is loaded from its far end: the front wall of a box, the left end wall of a flat rack.
// Across the floor it goes from the left side to the right; a piece that stands on another comes
// right after the one under it, before the floor in front of them is taken.

import type { ContainerLoad, PlacedPiece } from "./plan";

/** One piece in its turn. */
export interface LoadingStep {
  no: number;
  piece: PlacedPiece;
  /** The step of the piece it stands on; null for a piece on the floor. */
  onStep: number | null;
}

/** The pieces of a load in the order they are loaded. */
export function loadingSteps(load: ContainerLoad): LoadingStep[] {
  const ordered = [...load.pieces].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
  const steps: LoadingStep[] = [];
  for (const piece of ordered) {
    // What it stands on: the highest piece placed already at the same spot of the floor, below it.
    const under = piece.y > 0 ? [...steps].reverse().find((s) => s.piece.x === piece.x && s.piece.z === piece.z && s.piece.y < piece.y) : undefined;
    steps.push({ no: steps.length + 1, piece, onStep: under?.no ?? null });
  }
  return steps;
}

/**
 * A stretch of steps that are the same thing done again: places on the floor taken one after the
 * other by pieces of one cargo line, each stood as many high.
 */
export interface LoadingRun {
  fromStep: number;
  toStep: number;
  lineId: string;
  name: string;
  /** All its pieces, those on top counted too. */
  count: number;
  /** How many places on the floor it takes, and how many pieces high each stands. */
  places: number;
  high: number;
  /** How many of its places hold a piece lying crosswise. */
  crosswise: number;
  /** From where to where its places reach, measured from the far end, in mm. */
  fromMm: number;
  toMm: number;
}

/**
 * The loading order as rows for a table. A place on the floor with what stands on it is one unit of
 * work; units that repeat are one row ("steps 1-12: 12 x Pallet, 6 places, 2 high"), so forty
 * pallets do not fill four pages. A row ends when the cargo line or the height of the stack changes.
 */
export function loadingRuns(load: ContainerLoad): LoadingRun[] {
  // The units: each piece on the floor with the steps of the pieces standing on it, which follow it at once.
  const units: { from: number; to: number; base: PlacedPiece; high: number }[] = [];
  for (const step of loadingSteps(load)) {
    const last = units[units.length - 1];
    if (step.piece.y > 0 && last && last.base.x === step.piece.x && last.base.z === step.piece.z) {
      last.to = step.no;
      last.high += 1;
    } else units.push({ from: step.no, to: step.no, base: step.piece, high: 1 });
  }
  const runs: LoadingRun[] = [];
  for (const unit of units) {
    const { base } = unit;
    const last = runs[runs.length - 1];
    if (last && last.lineId === base.lineId && last.high === unit.high) {
      last.toStep = unit.to;
      last.count += unit.high;
      last.places += 1;
      last.crosswise += base.crosswise ? 1 : 0;
      last.fromMm = Math.min(last.fromMm, Math.max(0, base.z));
      last.toMm = Math.max(last.toMm, base.z + base.length);
    } else {
      runs.push({ fromStep: unit.from, toStep: unit.to, lineId: base.lineId, name: base.name, count: unit.high, places: 1, high: unit.high, crosswise: base.crosswise ? 1 : 0, fromMm: Math.max(0, base.z), toMm: base.z + base.length });
    }
  }
  return runs;
}

/** "3" or "1-12": the steps a run covers. */
export const stepsText = (run: Pick<LoadingRun, "fromStep" | "toStep">): string => (run.fromStep === run.toStep ? String(run.fromStep) : `${run.fromStep}-${run.toStep}`);

/** Where a run stands: the stretch of floor it takes, measured from the far end. */
export const whereText = (run: LoadingRun, farEnd: string, size: (mm: number) => string): string => `${size(run.fromMm)} to ${size(run.toMm)} from the ${farEnd}`;

/** How a run is loaded: how many places, how many high, and how many of them crosswise. */
export function howText(run: LoadingRun): string {
  const places = run.places === 1 ? "1 place" : `${run.places} places`;
  const high = run.high > 1 ? `, ${run.high} high (the lower piece first)` : "";
  const cross = run.crosswise === 0 ? "" : run.crosswise === run.places ? (run.places === 1 ? ", crosswise" : ", all crosswise") : `, ${run.crosswise} of them crosswise`;
  return `${places}${high}${cross}`;
}

/** The step number each piece on the floor carries on the drawing: by its place, "x|z". */
export const floorStepNumbers = (load: ContainerLoad): Map<string, number> => new Map(loadingSteps(load).filter((s) => s.piece.y === 0).map((s) => [`${s.piece.x}|${s.piece.z}`, s.no]));
