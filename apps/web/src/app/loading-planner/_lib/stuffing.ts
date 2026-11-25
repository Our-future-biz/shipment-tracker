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

/** One cargo line's part of a place on the floor: its pieces standing there one on another. */
export interface Layer {
  lineId: string;
  name: string;
  high: number;
}

/**
 * What a place on the floor holds, bottom up: the pieces standing there by cargo line, those of one
 * line one on another as one layer. A place of one line has one layer; a crate with a carton on it
 * (Council Outlay 14, P9: mixed stacking) two.
 */
function layersOf(pieces: readonly PlacedPiece[]): Layer[] {
  const layers: Layer[] = [];
  for (const piece of [...pieces].sort((a, b) => a.y - b.y)) {
    const last = layers[layers.length - 1];
    if (last?.lineId === piece.lineId) last.high += 1;
    else layers.push({ lineId: piece.lineId, name: piece.name, high: 1 });
  }
  return layers;
}

/** The layers of each place on the floor of a load, by the place ("x|z"): a stacked piece stands on its base's own corner. */
export function placesOf(load: ContainerLoad): Map<string, Layer[]> {
  const stacks = new Map<string, PlacedPiece[]>();
  for (const piece of load.pieces) {
    const key = `${piece.x}|${piece.z}`;
    stacks.set(key, [...(stacks.get(key) ?? []), piece]);
  }
  return new Map([...stacks].map(([key, pieces]) => [key, layersOf(pieces)]));
}

/**
 * What a place on the floor drawing says, bottom up: the number of each cargo line standing there,
 * and how many of it high - "3", "3 ×2" for a stack of one line as ever, "1/2" for a piece of line 2
 * on one of line 1, "1/2×2" for two of line 2 on it.
 */
export function placeLabel(layers: readonly Layer[], numberOf: (lineId: string) => number): string {
  if (layers.length === 1) return `${numberOf(layers[0]!.lineId)}${layers[0]!.high > 1 ? ` ×${layers[0]!.high}` : ""}`;
  return layers.map((layer) => `${numberOf(layer.lineId)}${layer.high > 1 ? `×${layer.high}` : ""}`).join("/");
}

/**
 * A place in words for the screen's drawing, bottom up: "3 · Pallet, 2 high" for a stack of one line
 * as ever, "1 · Crate, on it 2 · Carton (2 high)" for a mixed one.
 */
export function placeTitle(layers: readonly Layer[], numberOf: (lineId: string) => number): string {
  const name = (layer: Layer) => `${numberOf(layer.lineId)} · ${layer.name || "Cargo"}`;
  if (layers.length === 1) return `${name(layers[0]!)}${layers[0]!.high > 1 ? `, ${layers[0]!.high} high` : ""}`;
  return layers.map((layer) => `${name(layer)}${layer.high > 1 ? ` (${layer.high} high)` : ""}`).join(", on it ");
}

/**
 * A stretch of steps that are the same thing done again: places on the floor taken one after the
 * other, each holding the same cargo the same way - the same lines, bottom up, as many high.
 */
export interface LoadingRun {
  fromStep: number;
  toStep: number;
  /** The cargo line standing on the floor; `layers` says what stands on it. */
  lineId: string;
  name: string;
  /** What each of its places holds, bottom up; one layer for places of one cargo line. */
  layers: Layer[];
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
 * pallets do not fill four pages. A row ends when what a place holds changes: the cargo lines on it,
 * bottom up, or the height of the stack.
 */
export function loadingRuns(load: ContainerLoad): LoadingRun[] {
  // The units: each piece on the floor with the steps of the pieces standing on it, which follow it at once.
  const units: { from: number; to: number; base: PlacedPiece; pieces: PlacedPiece[] }[] = [];
  for (const step of loadingSteps(load)) {
    const last = units[units.length - 1];
    if (step.piece.y > 0 && last && last.base.x === step.piece.x && last.base.z === step.piece.z) {
      last.to = step.no;
      last.pieces.push(step.piece);
    } else units.push({ from: step.no, to: step.no, base: step.piece, pieces: [step.piece] });
  }
  const makeUp = (layers: readonly Layer[]) => layers.map((layer) => `${layer.lineId}×${layer.high}`).join("/");
  const runs: LoadingRun[] = [];
  for (const unit of units) {
    const { base } = unit;
    const layers = layersOf(unit.pieces);
    const high = unit.pieces.length;
    const last = runs[runs.length - 1];
    if (last && makeUp(last.layers) === makeUp(layers)) {
      last.toStep = unit.to;
      last.count += high;
      last.places += 1;
      last.crosswise += base.crosswise ? 1 : 0;
      last.fromMm = Math.min(last.fromMm, Math.max(0, base.z));
      last.toMm = Math.max(last.toMm, base.z + base.length);
    } else {
      runs.push({ fromStep: unit.from, toStep: unit.to, lineId: base.lineId, name: base.name, layers, count: high, places: 1, high, crosswise: base.crosswise ? 1 : 0, fromMm: Math.max(0, base.z), toMm: base.z + base.length });
    }
  }
  return runs;
}

/**
 * A run's cargo for the loading order's table, layer by layer bottom up as on the drawing: the line
 * numbers ("1/2"), their names, and the colli of each in the same order ("8 + 8"). A run of one line
 * reads as ever: its number, its name and all its colli.
 */
export function runCargo(run: LoadingRun, numberOf: (lineId: string) => number): { numbers: string; names: string; colli: string } {
  if (run.layers.length <= 1) return { numbers: String(numberOf(run.lineId)), names: run.name || "Cargo", colli: String(run.count) };
  return {
    numbers: run.layers.map((layer) => numberOf(layer.lineId)).join("/"),
    names: run.layers.map((layer) => layer.name || "Cargo").join(" / "),
    colli: run.layers.map((layer) => run.places * layer.high).join(" + "),
  };
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
