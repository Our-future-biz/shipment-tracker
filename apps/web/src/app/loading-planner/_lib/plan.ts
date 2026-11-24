import { balanceOf, centreLoad } from "./balance";
import { BEDDING_END_MM, containersWith, GROUP_LABEL, GROUP_ORDER, maxCargoKg, maxWeightWithBedding, usableLength, type ContainerGroup, type ContainerSpec, type PlanRules } from "./containers";
import { findSpot, isFree, mirroredSlots, newFloor, occupy, PLACE_RULES, type Floor, type PlaceRule, type Slot } from "./floor";
import { fitIn, type CargoLine, type Footprint } from "./gauge";

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

/** A stack that may still take a piece: its bottom piece, how high it stands and what it carries. */
interface OpenStack {
  base: PlacedPiece;
  top: number;
  carried: number;
}

/** A stretch of floor under cargo standing end to end, and the weight resting on it. */
interface Stretch {
  from: number;
  to: number;
  weightKg: number;
}

interface Bin {
  container: ContainerSpec;
  /** The most cargo the container takes (maxCargoKg). */
  maxKg: number;
  floor: Floor;
  /** The cargo on the floor as stretches standing apart from each other (see `floorCarries`). */
  stretches: Stretch[];
  /** How free places are chosen on this floor. */
  rule: PlaceRule;
  lines: CargoLine[];
  pieces: PlacedPiece[];
  weightKg: number;
  /** Per cargo line, the stacks that may still take a piece (`at` is the first one not yet full). */
  stacks: Map<string, { items: OpenStack[]; at: number }>;
  /**
   * Cargo lines this container has no room for. A container only fills up, and all pieces of a
   * line are alike, so a line refused once is refused for good: nothing is tried twice.
   */
  full: Set<string>;
  /** The first piece was put in the middle of the length (see `place`). */
  centredFirst: boolean;
  /** Lines for which moving that first piece to the end was tried and did not help. */
  triedFromEnd: Set<string>;
  /** Packed again from the end: the first piece is not put in the middle. */
  fromEnd: boolean;
  /** Under the "mirror" rule: the places worked out for the first cargo line, and how many are taken. */
  slots: { lineId: string; items: Slot[]; at: number } | null;
}

const newBin = (container: ContainerSpec, rule: PlaceRule): Bin => ({
  container,
  maxKg: maxCargoKg(container),
  floor: newFloor(usableLength(container), container.internalW),
  stretches: [],
  rule,
  lines: [],
  pieces: [],
  weightKg: 0,
  stacks: new Map(),
  full: new Set(),
  centredFirst: false,
  triedFromEnd: new Set(),
  fromEnd: false,
  slots: null,
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A piece longer than the deck it lies on: only a flat rack takes one, with its end walls folded down. */
const isOverLength = (piece: { length: number }, container: ContainerSpec) => piece.length > container.internalL;

// The ways each cargo line may sit in each container (fitIn), worked out once: a plan tries the
// same lines in many containers of the same types.
const fitted = new WeakMap<ContainerSpec, WeakMap<CargoLine, Footprint[]>>();

/** The ways a cargo line may sit in the container. */
function waysOf(container: ContainerSpec, line: CargoLine): Footprint[] {
  let known = fitted.get(container);
  if (!known) {
    known = new WeakMap();
    fitted.set(container, known);
  }
  let ways = known.get(line);
  if (!ways) {
    ways = fitIn(container, line);
    known.set(line, ways);
  }
  return ways;
}

/** The stretch a piece of `weightKg` on z..z+length would rest in: it joins every stretch of cargo it touches end to end or beside it. */
function stretchWith(bin: Bin, z: number, length: number, weightKg: number): Stretch {
  const [from, to] = [Math.max(0, z), Math.min(bin.container.internalL, z + length)];
  return bin.stretches
    .filter((s) => s.from <= to && s.to >= from)
    .reduce((joined, s) => ({ from: Math.min(joined.from, s.from), to: Math.max(joined.to, s.to), weightKg: joined.weightKg + s.weightKg }), { from, to, weightKg });
}

/**
 * Whether the floor carries a piece of `weightKg` more on z..z+length. Cargo standing end to end or
 * side by side rests on the floor as one stretch, and the stretch, with beams 1 m beyond its ends,
 * must carry all of it: the rule for a single piece (fitIn), for the cargo that stands together.
 */
function floorCarries(bin: Bin, z: number, length: number, weightKg: number): boolean {
  // The stretch is at least this piece long: when the whole load would be carried on that, any stretch is.
  if (bin.weightKg + weightKg <= maxWeightWithBedding(bin.container, length)) return true;
  const stretch = stretchWith(bin, z, length, weightKg);
  return stretch.weightKg <= maxWeightWithBedding(bin.container, stretch.to - stretch.from);
}

/** Records a piece of `weightKg` on z..z+length in the bin's stretches. */
function rest(bin: Bin, z: number, length: number, weightKg: number): void {
  const joined = stretchWith(bin, z, length, weightKg);
  bin.stretches = [...bin.stretches.filter((s) => s.from > joined.to || s.to < joined.from), joined];
}

/**
 * Stacks one piece on pieces of its own line. A piece carries no more than its own weight, the
 * stack stays under the roof (or the top of the walls), and the floor carries the whole stack on
 * the length it stands on, and the stretch of cargo it stands in.
 */
function stack(bin: Bin, line: CargoLine): boolean {
  const open = bin.stacks.get(line.id);
  if (!open) return false;
  for (; open.at < open.items.length; open.at++) {
    const on = open.items[open.at]!;
    const carried = on.carried + line.weightKg;
    // Pieces of a line are alike: a stack that cannot take this one cannot take the next either.
    if (carried > on.base.weightKg || on.top + line.heightMm > bin.container.internalH) continue;
    if (on.base.weightKg + carried > maxWeightWithBedding(bin.container, on.base.length)) continue;
    if (!floorCarries(bin, on.base.z, on.base.length, line.weightKg)) continue;
    bin.lines.push(line);
    bin.pieces.push({ ...on.base, y: on.top });
    bin.weightKg += line.weightKg;
    rest(bin, on.base.z, on.base.length, line.weightKg);
    on.top += line.heightMm;
    on.carried = carried;
    return true;
  }
  return false;
}

/**
 * The next place worked out in advance for this line (the "mirror" rule), if one is left and still
 * free: once other cargo is on the floor (a load packed again around its heaviest piece), a place
 * may be taken, and the piece then goes where the floor has room. A piece asked into the middle
 * takes no such place.
 */
function nextSlot(bin: Bin, line: CargoLine, inMiddle: boolean): Slot | null {
  if (bin.rule !== "mirror" || inMiddle) return null;
  if (bin.pieces.length === 0 && waysOf(bin.container, line).length === 2) {
    const [long, short] = [Math.max(line.lengthMm, line.widthMm), Math.min(line.lengthMm, line.widthMm)];
    bin.slots = { lineId: line.id, items: mirroredSlots(bin.floor, long, short), at: 0 };
  }
  const slots = bin.slots;
  if (!slots || slots.lineId !== line.id || slots.at >= slots.items.length) return null;
  const slot = slots.items[slots.at++]!;
  return isFree(bin.floor, slot) && floorCarries(bin, slot.z, slot.length, line.weightKg) ? slot : null;
}

/** Puts one piece on the floor, in the way it fits best by the bin's rule. `inMiddle` centres the first piece of a load. */
function placeOnFloor(bin: Bin, line: CargoLine, inMiddle: boolean): boolean {
  const slot = nextSlot(bin, line, inMiddle);
  const ways = slot
    ? [{ fp: { length: slot.length, width: slot.width, crosswise: slot.crosswise }, spot: { x: slot.x, z: slot.z, score: 0 } }]
    : waysOf(bin.container, line)
    .map((fp) => ({ fp, spot: findSpot(bin.floor, fp.length, fp.width, bin.rule, (_x, z) => floorCarries(bin, z, fp.length, line.weightKg)) }))
    .filter((way) => way.spot !== null)
    .sort((a, b) => a.spot!.score - b.spot!.score);
  const best = ways[0];
  if (!best?.spot) return false;

  // The first piece of a load, when it takes the floor's whole width, goes to the middle of the
  // length: the rest of the cargo then fills both ends and the load stays in balance. So does a
  // piece asked into the middle, which is centred across the floor too.
  if (bin.pieces.length === 0 && !bin.fromEnd && !slot) {
    if ((inMiddle || best.fp.width >= bin.floor.width) && best.fp.length < bin.floor.length) {
      best.spot.z = Math.round((bin.floor.length - best.fp.length) / 2);
      bin.centredFirst = !inMiddle;
    }
    if (inMiddle && best.fp.width < bin.floor.width) best.spot.x = Math.round((bin.floor.width - best.fp.width) / 2);
  }
  occupy(bin.floor, best.spot, best.fp.length, best.fp.width);
  const piece: PlacedPiece = {
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
  };
  bin.lines.push(line);
  bin.pieces.push(piece);
  rest(bin, piece.z, piece.length, line.weightKg);
  bin.weightKg += line.weightKg;
  if (line.stackable) {
    const open = bin.stacks.get(line.id) ?? { items: [], at: 0 };
    open.items.push({ base: piece, top: piece.height, carried: 0 });
    bin.stacks.set(line.id, open);
  }
  return true;
}

/**
 * Loads one piece into the bin: on the floor, or else stacked. False when it does not go in.
 * A load holding a piece longer than the deck takes only more such pieces: its end walls are down.
 */
function place(bin: Bin, line: CargoLine, inMiddle = false): boolean {
  if (bin.full.has(line.id)) return false;
  const first = bin.pieces[0];
  const longOnes = first !== undefined && isOverLength(first, bin.container);
  const isLong = Math.max(line.lengthMm, line.widthMm) > bin.container.internalL;
  const fits = bin.weightKg + line.weightKg <= bin.maxKg && (first === undefined || longOnes === isLong);
  if (fits && (placeOnFloor(bin, line, inMiddle) || stack(bin, line))) return true;
  bin.full.add(line.id);
  return false;
}

/** The bin packed again with its first piece at the end and one more piece, or null when that does not take everything. */
function packedFromEnd(bin: Bin, line: CargoLine): Bin | null {
  const again = newBin(bin.container, bin.rule);
  again.fromEnd = true;
  return [...bin.lines, line].every((each) => place(again, each)) ? again : null;
}

/**
 * Loads one piece into the first open container that takes it. A flat rack whose first piece
 * stands in the middle has two short ends; before giving up, it is packed again from the end, which
 * leaves one long space (the load is centred afterwards all the same).
 */
function placeInOne(bins: Bin[], line: CargoLine): boolean {
  if (bins.some((bin) => place(bin, line))) return true;
  for (const [index, bin] of bins.entries()) {
    if (!bin.centredFirst || bin.triedFromEnd.has(line.id)) continue;
    const again = packedFromEnd(bin, line);
    if (again) {
      bins[index] = again;
      return true;
    }
    bin.triedFromEnd.add(line.id);
  }
  return false;
}

/** Whether the piece would stick out of the load's flat rack in a way nothing in the load does yet. */
function bringsNewOverhang(bin: Bin, line: CargoLine): boolean {
  const { container, pieces } = bin;
  if (container.group !== "flat-rack") return false;
  const tooHigh = line.heightMm > container.internalH && !pieces.some((p) => p.y + p.height > container.internalH);
  const tooWide = Math.min(line.lengthMm, line.widthMm) > container.internalW && !pieces.some((p) => p.width > container.internalW);
  return tooHigh || tooWide;
}

/**
 * Fills containers already open with more cargo; returns the pieces that did not go in. A flat
 * rack is not given a piece that would add over-height or over-width the load does not have.
 */
function fill(bins: Bin[], lines: CargoLine[]): CargoLine[] {
  return lines.filter((line) => {
    const takers = bins.filter((bin) => !bringsNewOverhang(bin, line));
    if (takers.length === bins.length) return !placeInOne(bins, line);
    return !takers.some((bin) => place(bin, line));
  });
}

/** Pieces loaded into containers, and the pieces they did not take. */
interface Packing {
  bins: Bin[];
  left: CargoLine[];
}

/** Loads the pieces into as many containers of one type as they need, or null as soon as that is more than `maxBins`. */
function packInto(container: ContainerSpec, lines: CargoLine[], rule: PlaceRule, maxBins: number): Packing | null {
  const bins: Bin[] = [];
  const left: CargoLine[] = [];
  // A line that did not go into an empty container never will.
  const never = new Set<string>();
  for (const line of lines) {
    if (never.has(line.id)) {
      left.push(line);
      continue;
    }
    if (placeInOne(bins, line)) continue;
    const fresh = newBin(container, rule);
    if (place(fresh, line)) {
      if (bins.length === maxBins) return null;
      bins.push(fresh);
    } else {
      never.add(line.id);
      left.push(line);
    }
  }
  return { bins, left };
}

/** Total overhang of the loads in mm: beyond the ends, and beyond the sides and top. */
function overhangOf(bins: { container: ContainerSpec; pieces: PlacedPiece[] }[]): { ends: number; sidesAndTop: number } {
  let ends = 0;
  let sidesAndTop = 0;
  for (const bin of bins) {
    for (const piece of bin.pieces) {
      const over = overhang(piece, bin.container);
      ends += over.length;
      sidesAndTop += over.width + over.height;
    }
  }
  return { ends, sidesAndTop };
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

/**
 * The pieces loaded into one type by each way of laying out a floor; the best result is kept. Null
 * when every way takes more than `maxBins` containers.
 *
 * Every way leaves out the same pieces (those no empty container of the type takes), and only a flat
 * rack has overhang beyond the ends, so on other equipment a way taking more containers than the
 * best so far cannot be better (see `cost`) and is given up as soon as it does.
 */
function bestPacking(container: ContainerSpec, lines: CargoLine[], maxBins = Infinity): Packing | null {
  let best: Packing | null = null;
  for (const rule of PLACE_RULES) {
    const limit = best && container.group !== "flat-rack" ? Math.min(maxBins, best.bins.length) : maxBins;
    const packed = packInto(container, lines, rule, limit);
    if (packed && (!best || cheaper(cost(packed.bins, packed.left.length), cost(best.bins, best.left.length)))) best = packed;
  }
  return best;
}

/** Moves a load into a smaller or lower container when all of it fits there just as well. */
function shrink(bin: Bin, candidates: ContainerSpec[]): Bin {
  const smaller = candidates
    .filter((c) => !c.hardTop || bin.container.hardTop)
    .filter((c) => c.feet < bin.container.feet || (c.feet === bin.container.feet && c.internalH < bin.container.internalH))
    .sort((a, b) => a.feet - b.feet || a.internalH - b.internalH);
  for (const container of smaller) {
    const packed = bestPacking(container, bin.lines, 1);
    const only = packed?.bins[0];
    if (!packed || packed.left.length > 0 || !only) continue;
    const [before, after] = [overhangOf([bin]), overhangOf([only])];
    if (after.ends <= before.ends && after.sidesAndTop <= before.sidesAndTop) return only;
  }
  return bin;
}

/**
 * How many containers of this type may be taken before the packing cannot beat the best so far:
 * fewer pieces left out wins outright, more loses outright, and with as many left out the fewer
 * containers win (unless on flat racks, where overhang beyond the ends counts first).
 */
function binsToBeat(container: ContainerSpec, lines: CargoLine[], best: Packing | null): number {
  if (!best || container.group === "flat-rack") return Infinity;
  const leftOut = lines.filter((line) => waysOf(container, line).length === 0).length;
  if (leftOut === best.left.length) return best.bins.length;
  return leftOut < best.left.length ? Infinity : 0;
}

/**
 * Loads the pieces into the best of the candidate types; returns what none of them took. The
 * largest type is tried first: its packing is the one to beat, so smaller types give up early.
 */
function loadGroup(candidates: ContainerSpec[], lines: CargoLine[]): Packing {
  const bins: Bin[] = [];
  let left = lines;
  let types = [...candidates].sort((a, b) => b.internalL * b.internalW - a.internalL * a.internalW || b.internalH - a.internalH);
  while (left.length > 0 && types.length > 0) {
    let best: (Packing & { container: ContainerSpec }) | null = null;
    for (const container of types) {
      const packed = bestPacking(container, left, binsToBeat(container, left, best));
      if (!packed || packed.bins.length === 0) continue;
      if (!best || cheaper(cost(packed.bins, packed.left.length), cost(best.bins, best.left.length))) best = { container, ...packed };
    }
    if (!best) break;
    bins.push(...best.bins.map((bin) => shrink(bin, candidates)));
    left = best.left;
    types = types.filter((c) => c !== best.container);
  }
  return { bins, left };
}

const offCentre = (bin: Bin): number => {
  const balance = balanceOf(bin.pieces, bin.container);
  return Math.abs(balance.alongPct) + Math.abs(balance.acrossPct);
};

/**
 * A load centred as well as its packing allows. One that is still out of balance is packed once
 * more around its heaviest piece, set in the middle of the floor, and that packing is kept when it
 * takes every piece and balances better: a heavy piece no longer sits in a corner with the light
 * cargo beside it.
 */
function balanced(bin: Bin): Bin {
  centreLoad(bin.pieces, bin.container);
  if (balanceOf(bin.pieces, bin.container).ok) return bin;

  const heaviest = bin.lines.reduce((a, b) => (b.weightKg > a.weightKg ? b : a), bin.lines[0]!);
  const rest = [...bin.lines];
  rest.splice(rest.indexOf(heaviest), 1);
  const again = newBin(bin.container, bin.rule);
  if (!place(again, heaviest, true) || !rest.every((line) => place(again, line))) return bin;
  centreLoad(again.pieces, again.container);
  return offCentre(again) < offCentre(bin) ? again : bin;
}

// ── The plan ──

const kg = (value: number) => `${value.toLocaleString("en-US")} kg`;

/** Why none of the allowed containers takes this piece. */
function refusal(line: CargoLine, allowed: ContainerSpec[], all: ContainerSpec[]): string {
  if (allowed.length === 0) return "No equipment is nominated.";
  const most = Math.max(...allowed.map(maxCargoKg));
  if (line.weightKg > most) return `Weighs ${kg(line.weightKg)} a piece; the most any allowed container carries is ${kg(most)}.`;
  // Too heavy for the length it rests on, in every allowed container: say what the best of them carries there.
  const long = Math.max(line.lengthMm, line.widthMm);
  const best = allowed.reduce((a, b) => (maxWeightWithBedding(b, long) > maxWeightWithBedding(a, long) ? b : a));
  if (line.weightKg > maxWeightWithBedding(best, long)) {
    return `Weighs ${kg(line.weightKg)} on ${long.toLocaleString("en-US")} mm of floor: too much per metre for any allowed container, even with ${BEDDING_END_MM.toLocaleString("en-US")} mm of beams under each end. The most on that length is ${kg(maxWeightWithBedding(best, long))}, on a ${best.name}.`;
  }
  const taker = GROUP_ORDER.flatMap((group) => all.filter((c) => c.group === group)).find((c) => fitIn(c, line).length > 0);
  if (!taker) return "Does not fit any container.";
  // When that kind of equipment is nominated, only its size or strength is wrong: name the type.
  const kindNominated = allowed.some((c) => c.group === taker.group);
  return `Does not fit the nominated equipment. ${kindNominated ? `A ${taker.name} would take it` : `It needs ${GROUP_LABEL[taker.group]}`}.`;
}

type Waiting = Record<ContainerGroup, CargoLine[]>;

/**
 * Every piece of the cargo list, largest footprint first, under the first kind of equipment that
 * takes it: standard, then open top, then flat rack. `refused` holds the pieces nothing allowed takes.
 */
function sortedPieces(lines: CargoLine[], allowed: ContainerSpec[]): { waiting: Waiting; refused: CargoLine[] } {
  const area = (line: CargoLine) => line.lengthMm * line.widthMm;
  const waiting: Waiting = { standard: [], "open-top": [], "flat-rack": [] };
  const refused: CargoLine[] = [];
  for (const line of [...lines].sort((a, b) => area(b) - area(a) || b.weightKg - a.weightKg)) {
    // A count that is not whole is rounded up: no part of the cargo is left out unseen.
    const colli = Math.max(0, Math.ceil(line.colli));
    const group = GROUP_ORDER.find((g) => allowed.some((c) => c.group === g && fitIn(c, line).length > 0));
    const target = group ? waiting[group] : refused;
    for (let i = 0; i < colli; i++) target.push(line);
  }
  return { waiting, refused };
}

/**
 * One plan, with each load centred. Flat racks are loaded first and filled up with other cargo
 * before any other container is opened; open tops likewise before standard containers.
 *
 * @param flatRacks the flat-rack types this plan may open
 * @param openTops the open-top types this plan may open
 * @param packStandard loads the pieces left for standard containers, each load centred
 */
function buildPlan(
  sorted: { waiting: Waiting; refused: CargoLine[] },
  allowed: ContainerSpec[],
  all: ContainerSpec[],
  flatRacks: ContainerSpec[],
  openTops: ContainerSpec[],
  packStandard: (lines: CargoLine[]) => Packing,
): LoadPlan {
  const flat = loadGroup(flatRacks, sorted.waiting["flat-rack"]);
  const afterFlat = { open: fill(flat.bins, sorted.waiting["open-top"]), standard: fill(flat.bins, sorted.waiting.standard) };

  const open = loadGroup(openTops, afterFlat.open);
  const standard = packStandard(fill(open.bins, afterFlat.standard));

  const notLoaded = new Map<string, NotLoaded>();
  const note = (line: CargoLine, reason: string) => {
    const entry = notLoaded.get(line.id) ?? { lineId: line.id, name: line.name, colli: 0, reason };
    entry.colli += 1;
    notLoaded.set(line.id, entry);
  };
  for (const line of sorted.refused) note(line, refusal(line, allowed, all));
  for (const line of [...flat.left, ...open.left, ...standard.left]) note(line, "No room was found for it in the allowed equipment.");

  // The standard containers come centred with their share; the rest is centred here.
  const loads = [...standard.bins, ...[...open.bins, ...flat.bins].map(balanced)].map((bin) => ({
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
 * size decides how many other containers are opened. Where the cargo needs one, the planner
 * therefore tries each flat-rack and open-top type in turn (and the mix of them) and keeps the
 * plan that loads the most with the least overhang, the fewest containers and the smallest
 * equipment. Cargo that needs neither is planned once.
 *
 * @param nominated ids of the container types to use; leave out to let the planner choose from all
 *   but the 45' and the hard-tops, which it takes only when they are nominated
 * @param rules the company's rules: clearance, heavy pieces, out-of-gauge warning limits; none when left out
 */
export function planLoad(lines: CargoLine[], nominated?: string[], rules?: PlanRules): LoadPlan {
  const all = containersWith(rules);
  const allowed = nominated ? all.filter((c) => nominated.includes(c.id)) : all.filter((c) => !c.onRequest);
  const sorted = sortedPieces(lines, allowed);
  const choices = (group: ContainerGroup) => {
    const types = allowed.filter((c) => c.group === group);
    return types.length > 1 && sorted.waiting[group].length > 0 ? [types, ...types.map((type) => [type])] : [types];
  };
  const planCost = (plan: LoadPlan) => cost(plan.loads, sum(plan.notLoaded.map((n) => n.colli)));
  // Plans that leave the same pieces to standard containers load them alike: each such share is packed once.
  const standardTypes = allowed.filter((c) => c.group === "standard");
  const shares = new Map<string, Packing>();
  const packStandard = (left: CargoLine[]): Packing => {
    const key = left.map((line) => line.id).join(" ");
    let share = shares.get(key);
    if (!share) {
      const packed = loadGroup(standardTypes, left);
      share = { bins: packed.bins.map(balanced), left: packed.left };
      shares.set(key, share);
    }
    return share;
  };

  let best: LoadPlan | null = null;
  for (const flatRacks of choices("flat-rack")) {
    for (const openTops of choices("open-top")) {
      const plan = buildPlan(sorted, allowed, all, flatRacks, openTops, packStandard);
      if (!best || cheaper(planCost(plan), planCost(best))) best = plan;
    }
  }
  return best ?? { loads: [], notLoaded: [] };
}
