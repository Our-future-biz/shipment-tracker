import { balanceLimits, balanceOf, floorOverloads, type Balance, type FloorOverload } from "./balance";
import { BEDDING_END_MM, tonnesPerMetre, type ContainerSpec } from "./containers";
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

/** "600 mm lengthwise, 118 mm sideways": how far off the middle the centre of gravity of this container may lie. */
export function balanceLimitText(container: ContainerSpec, unit: DimUnit): string {
  const limits = balanceLimits(container);
  return `${formatDim(limits.alongMm, unit)} ${unit} lengthwise, ${formatDim(Math.round(limits.acrossMm), unit)} ${unit} sideways`;
}

/** What a container that could not be balanced says. */
export const outOfBalanceText = (container: ContainerSpec, unit: DimUnit): string =>
  `The centre of gravity is further off the middle of the floor than allowed (${balanceLimitText(container, unit)}), and the planner found no better arrangement. Spread the weight over more containers or change the equipment.`;

/**
 * What the company's rules say about a load, as sentences for the screen and the PDF: heavy single
 * pieces in a standard container, and cargo on an open top or flat rack beyond the limits set for
 * a warning. The plan loads them all the same.
 */
export function ruleWarnings(load: ContainerLoad, unit: DimUnit): string[] {
  const { container, pieces } = load;
  const size = (mm: number) => `${formatDim(mm, unit)} ${unit}`;
  const kg = (value: number) => `${value.toLocaleString("en-US")} kg`;
  const names = (found: PlacedPiece[]) => [...new Set(found.map((p) => p.name || "Cargo"))].join(", ");
  const warnings: string[] = [];

  const { heavy, oog } = container;
  if (heavy) {
    const heavyOnes = pieces.filter((p) => p.weightKg > heavy.warnKg);
    if (heavyOnes.length > 0) {
      const most = Math.max(...heavyOnes.map((p) => p.weightKg));
      warnings.push(
        `${names(heavyOnes)}: ${kg(most)} a piece, over the ${kg(heavy.warnKg)} set for a heavy piece in a standard container. Check how it is stuffed: the forklift, the floor under its wheels, and the lashing.`,
      );
    }
  }
  if (oog) {
    const wide = pieces.filter((p) => p.width > oog.widthMm);
    if (wide.length > 0) warnings.push(`${names(wide)}: ${size(Math.max(...wide.map((p) => p.width)))} wide, over the ${size(oog.widthMm)} set for a warning. Check with the carrier before booking.`);
    const overEnd = (p: PlacedPiece) => Math.max(-p.z, p.z + p.length - container.internalL);
    const long = pieces.filter((p) => overEnd(p) > oog.overEndMm);
    if (long.length > 0) warnings.push(`${names(long)}: ${size(Math.max(...long.map(overEnd)))} over one end, over the ${size(oog.overEndMm)} set for a warning. Check with the carrier before booking.`);
    const high = pieces.filter((p) => p.y + p.height > oog.heightMm);
    if (high.length > 0) warnings.push(`${names(high)}: ${size(Math.max(...high.map((p) => p.y + p.height)))} high, over the ${size(oog.heightMm)} set for a warning. Check with the carrier before booking.`);
  }
  return warnings;
}

/** One overloaded stretch of floor as a sentence, the same on the screen and in the PDF. */
export function floorOverloadText(overload: FloorOverload, container: ContainerSpec, unit: DimUnit): string {
  const size = (mm: number) => `${formatDim(mm, unit)} ${unit}`;
  const kg = (value: number) => `${value.toLocaleString("en-US")} kg`;
  const what =
    overload.allowedKg !== undefined
      ? `${kg(overload.weightKg)} resting on ${size(overload.lengthMm)} (${container.group === "flat-rack" ? "this flat rack" : "this floor"} carries ${kg(overload.allowedKg)} on that length)`
      : `${overload.tonnesPerMetre.toFixed(1)} t per metre on ${size(overload.lengthMm)} of floor (the floor's limit is ${tonnesPerMetre(container).toFixed(1)} t per metre)`;
  // Beams reach no further than 1 m beyond each end: a longer spread cannot be laid under this cargo.
  const reach = overload.lengthMm + 2 * BEDDING_END_MM;
  const cure =
    overload.spreadMm === 0
      ? "No length of this floor carries that weight: take it off this container."
      : overload.spreadMm > reach
        ? `It cannot be bedded there: it needs ${size(overload.spreadMm)} of floor, and beams reaching no more than ${size(BEDDING_END_MM)} beyond each end give ${size(reach)}. Take a piece off this stretch.`
        : `Spread the weight over at least ${size(overload.spreadMm)} with beams under the cargo, along the container, reaching no more than ${size(BEDDING_END_MM)} beyond each end of a piece.`;
  return `${overload.names.join(", ")}: ${what}. ${cure}`;
}

/** What a load with a piece longer than its flat rack needs, said the same on the screen and in the PDF. */
export const END_WALLS_NOTE = "A piece is longer than the flat rack's deck: the end walls must be folded down (platform), which needs the carrier's approval. Nothing else is loaded on it.";

/**
 * Standard containers and open tops have their doors at the far end of the drawings: positions are
 * measured from the front wall, the closed end. A flat rack has no doors.
 */
export const hasDoors = (container: ContainerSpec): boolean => container.group !== "flat-rack";

/**
 * Where a row of pieces starts, measured as the drawings are: from the front wall, or on a flat rack
 * from the left end wall. Empty for pieces hanging over the ends, whose overhang says where they are.
 */
export const startText = (group: PieceGroup, container: ContainerSpec, unit: DimUnit): string =>
  group.over.length > 0 ? "" : `${formatDim(group.at.fromFront, unit)} ${unit} from the ${hasDoors(container) ? "front wall" : "left end wall"}`;

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
