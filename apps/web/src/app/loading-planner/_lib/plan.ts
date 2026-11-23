import { CONTAINERS, GROUP_LABEL, GROUP_ORDER, type ContainerGroup, type ContainerSpec } from "./containers";
import { findSpot, newFloor, occupy, type Floor } from "./floor";
import { fitIn, type CargoLine } from "./gauge";

/** One piece as loaded. x runs across the container, z along it, y up from the floor; all in mm. */
export interface PlacedPiece {
  lineId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  crosswise: boolean;
}

export interface ContainerLoad {
  container: ContainerSpec;
  pieces: PlacedPiece[];
  totalWeightKg: number;
}

export interface NotLoaded {
  lineId: string;
  name: string;
  colli: number;
  reason: string;
}

export interface LoadPlan {
  loads: ContainerLoad[];
  /** Every piece is either in a load or listed here with the reason. */
  notLoaded: NotLoaded[];
}

/** How far a piece sticks out of its container, in mm (0 = inside). */
export function overhang(piece: PlacedPiece, container: ContainerSpec): { length: number; width: number; height: number } {
  return {
    length: Math.max(0, piece.length - container.internalL),
    width: Math.max(0, piece.width - container.internalW),
    height: Math.max(0, piece.y + piece.height - container.internalH),
  };
}

export function isOutOfGauge(piece: PlacedPiece, container: ContainerSpec): boolean {
  const over = overhang(piece, container);
  return over.length > 0 || over.width > 0 || over.height > 0;
}

// ── One container being filled ──

interface Bin {
  container: ContainerSpec;
  floor: Floor;
  lines: CargoLine[];
  pieces: PlacedPiece[];
  weightKg: number;
}

const newBin = (container: ContainerSpec): Bin => ({
  container,
  floor: newFloor(container.internalL, container.internalW),
  lines: [],
  pieces: [],
  weightKg: 0,
});

/** Puts one piece on the bin's floor, in the way it fits most snugly. False when it does not go in. */
function place(bin: Bin, line: CargoLine): boolean {
  if (bin.weightKg + line.weightKg > bin.container.payloadKg) return false;
  const ways = fitIn(bin.container, line)
    .map((fp) => ({ fp, spot: findSpot(bin.floor, fp.length, fp.width) }))
    .filter((way) => way.spot !== null)
    .sort((a, b) => a.spot!.score - b.spot!.score);
  const best = ways[0];
  if (!best?.spot) return false;

  occupy(bin.floor, best.spot, best.fp.length, best.fp.width);
  bin.lines.push(line);
  bin.pieces.push({
    lineId: line.id,
    name: line.name,
    x: best.spot.x,
    y: 0,
    z: best.spot.z,
    length: best.fp.length,
    width: best.fp.width,
    height: line.heightMm,
    weightKg: line.weightKg,
    crosswise: best.fp.crosswise,
  });
  bin.weightKg += line.weightKg;
  return true;
}

/** Adds pieces to containers already open; returns the pieces that did not go in. */
function fill(bins: Bin[], lines: CargoLine[]): CargoLine[] {
  return lines.filter((line) => !bins.some((bin) => place(bin, line)));
}

/** Loads the pieces into as many containers of one type as they need. */
function packInto(container: ContainerSpec, lines: CargoLine[]): { bins: Bin[]; left: CargoLine[] } {
  const bins: Bin[] = [];
  const left: CargoLine[] = [];
  for (const line of lines) {
    if (bins.some((bin) => place(bin, line))) continue;
    const fresh = newBin(container);
    if (place(fresh, line)) bins.push(fresh);
    else left.push(line);
  }
  return { bins, left };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Total overhang of the loads in mm: beyond the ends, and beyond the sides and top. */
function overhangOf(bins: { container: ContainerSpec; pieces: PlacedPiece[] }[]): { ends: number; sidesAndTop: number } {
  const all = bins.flatMap((bin) => bin.pieces.map((piece) => overhang(piece, bin.container)));
  return { ends: sum(all.map((o) => o.length)), sidesAndTop: sum(all.map((o) => o.width + o.height)) };
}

// Smaller is better, compared left to right: pieces left over, overhang beyond the ends, containers
// used, hard-tops among them, total container length, overhang beyond the sides and top, total
// container height.
function cost(bins: { container: ContainerSpec; pieces: PlacedPiece[] }[], leftOver: number): number[] {
  const over = overhangOf(bins);
  const hardTops = bins.filter((b) => b.container.hardTop).length;
  return [leftOver, over.ends, bins.length, hardTops, sum(bins.map((b) => b.container.feet)), over.sidesAndTop, sum(bins.map((b) => b.container.internalH))];
}

const cheaper = (a: number[], b: number[]) => {
  for (const [index, value] of a.entries()) {
    const other = b[index] ?? 0;
    if (value !== other) return value < other;
  }
  return false;
};

/** Moves a load into a smaller or lower container when all of it fits there just as well. */
function shrink(bin: Bin, candidates: ContainerSpec[]): Bin {
  const smaller = candidates
    .filter((c) => !c.hardTop || bin.container.hardTop)
    .filter((c) => c.feet < bin.container.feet || (c.feet === bin.container.feet && c.internalH < bin.container.internalH))
    .sort((a, b) => a.feet - b.feet || a.internalH - b.internalH);
  for (const container of smaller) {
    const packed = packInto(container, bin.lines);
    const [only, ...others] = packed.bins;
    if (packed.left.length > 0 || !only || others.length > 0) continue;
    const [before, after] = [overhangOf([bin]), overhangOf([only])];
    if (after.ends <= before.ends && after.sidesAndTop <= before.sidesAndTop) return only;
  }
  return bin;
}

/** Loads the pieces into the best of the candidate types; returns what none of them took. */
function loadGroup(candidates: ContainerSpec[], lines: CargoLine[]): { bins: Bin[]; left: CargoLine[] } {
  const bins: Bin[] = [];
  let left = lines;
  let types = candidates;
  while (left.length > 0 && types.length > 0) {
    let best: { container: ContainerSpec; bins: Bin[]; left: CargoLine[] } | null = null;
    for (const container of types) {
      const packed = packInto(container, left);
      if (packed.bins.length === 0) continue;
      if (!best || cheaper(cost(packed.bins, packed.left.length), cost(best.bins, best.left.length))) best = { container, ...packed };
    }
    if (!best) break;
    bins.push(...best.bins.map((bin) => shrink(bin, candidates)));
    left = best.left;
    types = types.filter((c) => c !== best.container);
  }
  return { bins, left };
}

// ── The plan ──

const kg = (value: number) => `${value.toLocaleString("en-US")} kg`;

/** Why none of the allowed containers takes this piece. */
function refusal(line: CargoLine, allowed: ContainerSpec[]): string {
  if (allowed.length === 0) return "No equipment is nominated.";
  const maxPayload = Math.max(...allowed.map((c) => c.payloadKg));
  if (line.weightKg > maxPayload) return `Weighs ${kg(line.weightKg)}; the heaviest payload of the equipment is ${kg(maxPayload)}.`;
  const needed = GROUP_ORDER.find((group) => CONTAINERS.some((c) => c.group === group && fitIn(c, line).length > 0));
  return needed ? `Does not fit the nominated equipment; it needs ${GROUP_LABEL[needed]}.` : "Does not fit any container.";
}

/**
 * One plan. Each piece goes to the first kind of equipment that takes it: standard, then open top,
 * then flat rack. Flat racks are loaded first and filled up with other cargo before any other
 * container is opened; open tops likewise before standard containers.
 *
 * @param flatRacks the flat-rack types this plan may open
 * @param openTops the open-top types this plan may open
 */
function buildPlan(lines: CargoLine[], allowed: ContainerSpec[], flatRacks: ContainerSpec[], openTops: ContainerSpec[]): LoadPlan {
  const ofGroup = (group: ContainerGroup) => allowed.filter((c) => c.group === group);
  const area = (line: CargoLine) => line.lengthMm * line.widthMm;

  // One entry per piece, largest footprint first.
  const pieces = lines
    .flatMap((line) => Array.from({ length: Math.max(0, Math.floor(line.colli)) }, () => line))
    .sort((a, b) => area(b) - area(a) || b.weightKg - a.weightKg);

  const waiting: Record<ContainerGroup, CargoLine[]> = { standard: [], "open-top": [], "flat-rack": [] };
  const refused: CargoLine[] = [];
  for (const piece of pieces) {
    const group = GROUP_ORDER.find((g) => ofGroup(g).some((c) => fitIn(c, piece).length > 0));
    if (group) waiting[group].push(piece);
    else refused.push(piece);
  }

  const flat = loadGroup(flatRacks, waiting["flat-rack"]);
  waiting["open-top"] = fill(flat.bins, waiting["open-top"]);
  waiting.standard = fill(flat.bins, waiting.standard);

  const open = loadGroup(openTops, waiting["open-top"]);
  waiting.standard = fill(open.bins, waiting.standard);

  const standard = loadGroup(ofGroup("standard"), waiting.standard);

  const notLoaded = new Map<string, NotLoaded>();
  const note = (line: CargoLine, reason: string) => {
    const entry = notLoaded.get(line.id) ?? { lineId: line.id, name: line.name, colli: 0, reason };
    entry.colli += 1;
    notLoaded.set(line.id, entry);
  };
  for (const line of refused) note(line, refusal(line, allowed));
  for (const line of [...flat.left, ...open.left, ...standard.left]) note(line, "No room was found for it in the equipment.");

  const loads = [...standard.bins, ...open.bins, ...flat.bins].map((bin) => ({
    container: bin.container,
    pieces: bin.pieces,
    totalWeightKg: bin.weightKg,
  }));
  return { loads, notLoaded: [...notLoaded.values()] };
}

/**
 * Builds the loading plan.
 *
 * A flat rack or open top that the cargo needs is also filled with the rest of the cargo, so its
 * size decides how many other containers are opened. The planner therefore tries each flat-rack
 * and open-top type in turn (and the mix of them) and keeps the plan that loads the most with the
 * least overhang, the fewest containers and the smallest equipment.
 *
 * @param nominated ids of the container types to use; leave out to let the planner choose from all
 */
export function planLoad(lines: CargoLine[], nominated?: string[]): LoadPlan {
  const allowed = nominated ? CONTAINERS.filter((c) => nominated.includes(c.id)) : CONTAINERS;
  const choices = (group: ContainerGroup) => {
    const types = allowed.filter((c) => c.group === group);
    return types.length > 1 ? [types, ...types.map((type) => [type])] : [types];
  };
  const planCost = (plan: LoadPlan) => cost(plan.loads, sum(plan.notLoaded.map((n) => n.colli)));

  let best: LoadPlan | null = null;
  for (const flatRacks of choices("flat-rack")) {
    for (const openTops of choices("open-top")) {
      const plan = buildPlan(lines, allowed, flatRacks, openTops);
      if (!best || cheaper(planCost(plan), planCost(best))) best = plan;
    }
  }
  return best ?? { loads: [], notLoaded: [] };
}
