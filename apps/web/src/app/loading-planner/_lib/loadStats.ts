import { balanceOf, floorOverloads, type Balance, type FloorOverload } from "./balance";
import type { ContainerSpec } from "./containers";
import { isOutOfGauge, overhang, type ContainerLoad, type LoadPlan, type PlacedPiece } from "./plan";
import { formatDim, type DimUnit } from "./units";

/** The pieces of one cargo line in a load that sit the same way: one row of the load's table. */
export interface PieceGroup {
  lineId: string;
  name: string;
  count: number;
  /** How many of them stand on another piece. */
  stacked: number;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  crosswise: boolean;
  /** The top of the highest of them above the floor, in mm (a stack counts whole). */
  topMm: number;
  /** Where the first of them stands: from the front wall and from the left side, in mm. */
  at: { fromFront: number; fromLeft: number };
  /** How far these pieces stick out of the container, in mm. */
  over: { length: number; width: number; height: number };
}

export interface LoadStats {
  pieceCount: number;
  payloadPct: number;
  /** Share of the floor under cargo. */
  floorPct: number;
  balance: Balance;
  outOfGauge: boolean;
  /** The highest point of the cargo above the floor, in mm. */
  topMm: number;
  /** A piece is longer than the flat rack's deck, so its end walls are folded down. */
  endWallsFolded: boolean;
  /** The stretches of floor carrying more per metre than the floor is rated for. */
  floorOverloads: FloorOverload[];
  groups: PieceGroup[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** The part of a piece's footprint that lies on the floor (a flat rack's overhang does not). */
function floorArea(piece: PlacedPiece, load: ContainerLoad): number {
  const { internalL, internalW } = load.container;
  const width = Math.min(internalW, piece.x + piece.width) - Math.max(0, piece.x);
  const length = Math.min(internalL, piece.z + piece.length) - Math.max(0, piece.z);
  return Math.max(0, width) * Math.max(0, length);
}

export function pieceGroups(load: ContainerLoad): PieceGroup[] {
  const groups = new Map<string, PieceGroup>();
  for (const piece of load.pieces) {
    const key = `${piece.lineId}|${piece.length}|${piece.width}`;
    const over = overhang(piece, load.container);
    const group = groups.get(key) ?? {
      lineId: piece.lineId,
      name: piece.name,
      count: 0,
      stacked: 0,
      length: piece.length,
      width: piece.width,
      height: piece.height,
      weightKg: piece.weightKg,
      crosswise: piece.crosswise,
      topMm: 0,
      at: { fromFront: Math.max(0, piece.z), fromLeft: Math.max(0, piece.x) },
      over: { length: 0, width: 0, height: 0 },
    };
    group.topMm = Math.max(group.topMm, piece.y + piece.height);
    group.count += 1;
    if (piece.y > 0) group.stacked += 1;
    group.over = { length: Math.max(group.over.length, over.length), width: Math.max(group.over.width, over.width), height: Math.max(group.over.height, over.height) };
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function loadStats(load: ContainerLoad): LoadStats {
  const { container, pieces } = load;
  const onFloor = pieces.filter((piece) => piece.y === 0);
  return {
    pieceCount: pieces.length,
    payloadPct: pct(load.totalWeightKg, container.payloadKg),
    floorPct: pct(onFloor.reduce((total, piece) => total + floorArea(piece, load), 0), container.internalL * container.internalW),
    balance: balanceOf(pieces, container),
    outOfGauge: pieces.some((piece) => isOutOfGauge(piece, container)),
    topMm: Math.max(0, ...pieces.map((piece) => piece.y + piece.height)),
    endWallsFolded: container.group === "flat-rack" && pieces.some((piece) => piece.length > container.internalL),
    floorOverloads: floorOverloads(load),
    groups: pieceGroups(load),
  };
}

/** One overloaded stretch of floor as a sentence, the same on the screen and in the PDF. */
export function floorOverloadText(overload: FloorOverload, container: ContainerSpec, unit: DimUnit): string {
  return (
    `${overload.names.join(", ")}: ${overload.tonnesPerMetre.toFixed(1)} t per metre on ${formatDim(overload.lengthMm, unit)} ${unit} of floor ` +
    `(the floor's limit is ${container.maxTonnesPerMetre} t per metre). Spread the weight over at least ${formatDim(overload.spreadMm, unit)} ${unit}: ` +
    "bedding (timber under the cargo, along the container) or more floor."
  );
}

/** What a load with a piece longer than its flat rack needs, said the same on the screen and in the PDF. */
export const END_WALLS_NOTE = "A piece is longer than the flat rack's deck: the end walls must be folded down (platform), which needs the carrier's approval. Nothing else is loaded on it.";

/**
 * Standard containers and open tops have their doors at the far end of the drawings: positions are
 * measured from the front wall, the closed end. A flat rack has no doors.
 */
export const hasDoors = (container: ContainerSpec): boolean => container.group !== "flat-rack";

export interface PlanTotals {
  /** The equipment of the plan: "2 × 40' DC", in the order of the loads. */
  equipment: { name: string; count: number }[];
  pieces: number;
  weightKg: number;
  notLoaded: number;
  /** Loads whose centre of gravity is within the tolerance. */
  balanced: number;
}

export function planTotals(plan: LoadPlan): PlanTotals {
  const equipment: { name: string; count: number }[] = [];
  for (const load of plan.loads) {
    const entry = equipment.find((e) => e.name === load.container.name);
    if (entry) entry.count += 1;
    else equipment.push({ name: load.container.name, count: 1 });
  }
  return {
    equipment,
    pieces: plan.loads.reduce((total, load) => total + load.pieces.length, 0),
    weightKg: plan.loads.reduce((total, load) => total + load.totalWeightKg, 0),
    notLoaded: plan.notLoaded.reduce((total, entry) => total + entry.colli, 0),
    balanced: plan.loads.filter((load) => balanceOf(load.pieces, load.container).ok).length,
  };
}

// The colours cargo lines are drawn in: Tailwind classes (`fill` for the floor plan, `dot` for the legend)
// and the same colour as `hex` for the 3D view, which cannot read a class.
const LINE_COLOURS = [
  { fill: "fill-indigo-400", dot: "bg-indigo-400", hex: "#818cf8" },
  { fill: "fill-emerald-400", dot: "bg-emerald-400", hex: "#34d399" },
  { fill: "fill-amber-400", dot: "bg-amber-400", hex: "#fbbf24" },
  { fill: "fill-sky-400", dot: "bg-sky-400", hex: "#38bdf8" },
  { fill: "fill-red-400", dot: "bg-red-400", hex: "#f87171" },
  { fill: "fill-slate-400", dot: "bg-slate-400", hex: "#94a3b8" },
  { fill: "fill-indigo-200", dot: "bg-indigo-200", hex: "#c7d2fe" },
  { fill: "fill-emerald-200", dot: "bg-emerald-200", hex: "#a7f3d0" },
  { fill: "fill-amber-200", dot: "bg-amber-200", hex: "#fde68a" },
  { fill: "fill-sky-200", dot: "bg-sky-200", hex: "#bae6fd" },
  { fill: "fill-red-200", dot: "bg-red-200", hex: "#fecaca" },
  { fill: "fill-slate-300", dot: "bg-slate-300", hex: "#cbd5e1" },
] as const;

/** The colour of the cargo line at `index` of the cargo list; the colours repeat after twelve lines. */
export const lineColour = (index: number) => LINE_COLOURS[((index % LINE_COLOURS.length) + LINE_COLOURS.length) % LINE_COLOURS.length] ?? LINE_COLOURS[0];
