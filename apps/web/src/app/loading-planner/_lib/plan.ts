import { balanceOf, beddingNeeded, beddingOf, centreLoad, floorOverloads, type Rest } from "./balance";
import { BEDDING_END_MM, containersWith, GROUP_LABEL, GROUP_ORDER, maxCargoKg, maxWeightOn, maxWeightWithBedding, tonnesPerMetre, usableLength, type ContainerGroup, type ContainerSpec, type PlanRules } from "./containers";
import { comesFirst, findSpot, freeSpots, isFree, mirroredSlots, newFloor, occupy, PLACE_RULES, type Floor, type PlaceRule, type PlaceSpot, type Slot, type Spot } from "./floor";
import { fitIn, type CargoLine, type Footprint } from "./gauge";
import { hasGauge, openTopTakes } from "@/lib/oogGauge";

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
  /** The container number its cargo is pinned to (Council Outlay 14, P8): this load is what that number stands for. Left out for a container of cargo with no number. */
  pinBox?: number;
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
  /** Pins the plan could not keep, as sentences (Council Outlay 14, P8); left out when every pin holds or none is set. */
  pinNotes?: string[];
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

/**
 * A piece on the floor that carries other cargo on top (Council Outlay 14, P9), with what stands on
 * it so far: how high the column stands, the footprint of its top piece - the next one must rest
 * on it whole - and how much more it may carry: the least any piece in it still bears.
 */
interface Column {
  base: PlacedPiece;
  line: CargoLine;
  top: number;
  length: number;
  width: number;
  /** kg the column may still take on top. */
  room: number;
  /** kg of the whole column, the base with it. */
  weightKg: number;
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
  /** The weight of each stack, by the piece on the floor under it: the cargo as the floor carries it (see `restsIn`). */
  stackKg: Map<PlacedPiece, number>;
  /** How free places are chosen on this floor. */
  rule: PlaceRule;
  lines: CargoLine[];
  pieces: PlacedPiece[];
  weightKg: number;
  /** Per cargo line, the stacks that may still take a piece (`at` is the first one not yet full). */
  stacks: Map<string, { items: OpenStack[]; at: number }>;
  /** The floor pieces that carry other cargo on top; empty unless a line has a top-load limit. */
  columns: Column[];
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
  /** Packed by the end-pin rules (`layouts`): its packing holds a line pinned to an end. */
  endPins: boolean;
  /** A piece whose place would add bedding takes the place that adds the least (`withLeastBedding`). */
  lessBedding: boolean;
  /** Under the "mirror" rule: the places worked out for the first cargo line, and how many are taken. */
  slots: { lineId: string; items: Slot[]; at: number } | null;
}

/**
 * End pins (Council Outlay 14, P8) keep the order along a container: a packing of cargo with a line
 * pinned to the front wall or the doors lays its floors out from the front wall only and sets no
 * first piece in the middle, and a container holding such a line is centred without changing
 * places. Cargo with no end pin is packed and centred as it always was, in the same plan too.
 */
const FRONT_ONLY: readonly PlaceRule[] = ["front"];
const hasEndPin = (lines: readonly CargoLine[]): boolean => lines.some((line) => line.pinEnd);
/** The layouts a floor is tried in: all of them, or from the front wall only for cargo with an end pinned. */
const layouts = (lines: readonly CargoLine[]): readonly PlaceRule[] => (hasEndPin(lines) ? FRONT_ONLY : PLACE_RULES);

/** Where a line's pieces go along the container: 0 at the front wall (first in), 2 at the doors (last in), 1 anywhere between - every line of cargo with no end pin. */
const endRank = (line: CargoLine): number => (line.pinEnd === "front" ? 0 : line.pinEnd === "doors" ? 2 : 1);

/** Pieces in the order they are loaded: those pinned to the front wall first, those pinned to the doors last, each largest footprint first, then heaviest. */
const inLoadingOrder = (lines: readonly CargoLine[]): CargoLine[] => {
  const area = (line: CargoLine) => line.lengthMm * line.widthMm;
  return [...lines].sort((a, b) => endRank(a) - endRank(b) || area(b) - area(a) || b.weightKg - a.weightKg);
};

/**
 * A container for a packing. `endPins` when the packing holds a line pinned to an end: its first
 * piece then stays where the layout puts it, at the front wall. `lessBedding` when its pieces are
 * placed to need the least bedding (`withLessBedding`).
 */
const newBin = (container: ContainerSpec, rule: PlaceRule, endPins = false, lessBedding = false): Bin => ({
  container,
  maxKg: maxCargoKg(container),
  floor: newFloor(usableLength(container), container.internalW),
  stretches: [],
  stackKg: new Map(),
  rule,
  lines: [],
  pieces: [],
  weightKg: 0,
  stacks: new Map(),
  columns: [],
  full: new Set(),
  centredFirst: false,
  triedFromEnd: new Set(),
  fromEnd: endPins,
  endPins,
  lessBedding,
  slots: null,
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A piece longer than the deck it lies on: only a flat rack takes one, with its end walls folded down. */
const isOverLength = (piece: { length: number }, container: ContainerSpec) => piece.length > container.internalL;

/**
 * Whether a piece sitting the way `fp` says may stand with its top `topMm` above the floor: under
 * the roof, or the top of the walls. A piece too big for an open top's roof opening goes in through
 * the doors (fitIn), so on another piece it stands no higher than the doors let it in - by the one
 * out-of-gauge table, whose verdict on the load (gaugeCheckOf) then says the same.
 */
function topFits(container: ContainerSpec, fp: Footprint, topMm: number): boolean {
  if (topMm > container.internalH) return false;
  if (container.group !== "open-top" || !hasGauge(container.name)) return true;
  return openTopTakes(container.name, { length: fp.length / 10, width: fp.width / 10, height: topMm / 10 }) !== null;
}

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

/** A piece of `weightKg` on z..z+length of the floor. */
interface Resting {
  z: number;
  length: number;
  weightKg: number;
}

/** The part of the floor under a piece on z..z+length: a flat rack's overhang rests on nothing. */
const floorUnder = (bin: Bin, z: number, length: number): [number, number] => [Math.max(0, z), Math.min(bin.container.internalL, z + length)];

/** The bin's stacks resting within from..to of the floor, from the front wall on, with a piece more when one is given. */
function restsIn(bin: Bin, from: number, to: number, more?: Resting): Rest[] {
  const rests: Rest[] = [];
  const add = ({ z, length, weightKg }: Resting) => {
    const [start, end] = floorUnder(bin, z, length);
    if (end > start && start >= from && end <= to) rests.push({ from: start, to: end, weightKg });
  };
  for (const [base, weightKg] of bin.stackKg) add({ z: base.z, length: base.length, weightKg });
  if (more) add(more);
  return rests.sort((a, b) => a.from - b.from);
}

/** The bedding the bin's cargo needs, in mm in all: what the plan would advise for it (beddingNeeded). */
const binBedding = (bin: Bin): number => beddingNeeded(restsIn(bin, -Infinity, Infinity), bin.container);

/**
 * How much the bedding the floor needs grows, in mm, when a piece comes to rest so; below 0 when it
 * shrinks. Bedding is needed stretch by stretch of cargo, so only the stretch the piece would stand
 * in is weighed, with the piece and without it (`before` keeps the latter, by stretch).
 */
function beddingAdded(bin: Bin, piece: Resting, before: Map<string, number>): number {
  const { from, to } = stretchWith(bin, piece.z, piece.length, piece.weightKg);
  const key = `${from}|${to}`;
  const was = before.get(key) ?? beddingNeeded(restsIn(bin, from, to), bin.container);
  before.set(key, was);
  return beddingNeeded(restsIn(bin, from, to, piece), bin.container) - was;
}

/**
 * Whether a piece may add to the bedding the floor needs; when not, it adds none. Bedding is needed
 * by a stretch of cargo heavier than the floor carries on its length, and on a wooden or steel floor
 * by any part of the floor carrying more per metre than it is rated for: the stretch the piece would
 * stand in, or the floor under it, is then so.
 */
function mayAddBedding(bin: Bin, piece: Resting): boolean {
  const { container } = bin;
  // The whole load resting on the piece's own length is carried as it is: so is any stretch it would stand in.
  if (bin.weightKg + piece.weightKg > maxWeightOn(container, piece.length)) {
    const joined = stretchWith(bin, piece.z, piece.length, piece.weightKg);
    if (joined.weightKg > maxWeightOn(container, joined.to - joined.from)) return true;
  }
  if (container.group === "flat-rack") return false;
  // The heaviest cross-section of the floor under the piece, with it, in kg per mm: 1 t per metre is 1 kg per mm.
  const [from, to] = floorUnder(bin, piece.z, piece.length);
  const under: (Rest & { perMm: number })[] = [];
  for (const [base, weightKg] of bin.stackKg) {
    const [start, end] = floorUnder(bin, base.z, base.length);
    if (start < to && end > from) under.push({ from: start, to: end, weightKg, perMm: weightKg / (end - start) });
  }
  const cuts = [...new Set([from, to, ...under.flatMap((r) => [r.from, r.to])])].filter((cut) => cut >= from && cut <= to).sort((a, b) => a - b);
  const own = piece.weightKg / (to - from);
  return cuts.slice(1).some((end, i) => own + sum(under.filter((r) => r.from <= cuts[i]! && r.to >= end).map((r) => r.perMm)) > tonnesPerMetre(container) + 1e-9);
}

/** A way a piece may sit, and where. */
interface Placement {
  fp: Footprint;
  spot: Spot;
}

/**
 * Where a piece goes in a packing that looks for the least bedding (`lessBedding`), when the place
 * its layout chose would add bedding: heavy pieces standing abreast may need beams under them where,
 * end to end, they would need none or less. Of every free place it may take, either way round it may
 * sit, the piece then takes the one that adds the least bedding (beddingAdded); of places adding as
 * little, the one the layout ranks first, and the layout's own choice before them all. A piece whose
 * place adds no bedding stays where the layout put it; so does every piece of a packing that holds
 * cargo pinned to an end: the order along the container the pins keep comes first.
 */
function withLeastBedding(bin: Bin, line: CargoLine, rule: PlaceRule, chosen: Placement): Placement {
  if (!bin.lessBedding || bin.endPins || line.pinEnd) return chosen;
  if (!mayAddBedding(bin, { z: chosen.spot.z, length: chosen.fp.length, weightKg: line.weightKg })) return chosen;
  const before = new Map<string, number>();
  // What a place adds depends only on where along the container the piece stands: each such place is weighed once.
  const weighed = new Map<string, number | null>();
  const addedAt = (z: number, length: number): number | null => {
    const key = `${z}|${length}`;
    let added = weighed.get(key);
    if (added === undefined) {
      added = floorCarries(bin, z, length, line.weightKg) ? beddingAdded(bin, { z, length, weightKg: line.weightKg }, before) : null;
      weighed.set(key, added);
    }
    return added;
  };
  let least = addedAt(chosen.spot.z, chosen.fp.length) ?? 0;
  if (least <= 0) return chosen;
  let best: { fp: Footprint; spot: PlaceSpot; way: number } | null = null;
  // The order the layout ranks places in: by score, the way the piece sits (lengthwise first), the free rectangle.
  const ranksBefore = (spot: PlaceSpot, way: number, than: { spot: PlaceSpot; way: number }) =>
    spot.score !== than.spot.score || way === than.way ? comesFirst(spot, than.spot) : way < than.way;
  for (const [way, fp] of waysOf(bin.container, line).entries()) {
    for (const spot of freeSpots(bin.floor, fp.length, fp.width, rule)) {
      const added = addedAt(spot.z, fp.length);
      if (added === null) continue;
      if (added < least || (added === least && best !== null && ranksBefore(spot, way, best))) {
        least = added;
        best = { fp, spot, way };
      }
    }
  }
  return best ?? chosen;
}

/**
 * Stacks one piece on pieces of its own line. A piece carries no more than its own weight, the
 * stack stays under the roof (or the top of the walls, and on an open top a piece that goes in
 * through the doors no higher than they are: topFits), and the floor carries the whole stack on
 * the length it stands on, and the stretch of cargo it stands in.
 */
function stack(bin: Bin, line: CargoLine): boolean {
  const open = bin.stacks.get(line.id);
  if (!open) return false;
  for (; open.at < open.items.length; open.at++) {
    const on = open.items[open.at]!;
    const carried = on.carried + line.weightKg;
    // Pieces of a line are alike: a stack that cannot take this one cannot take the next either.
    if (carried > on.base.weightKg || !topFits(bin.container, on.base, on.top + line.heightMm)) continue;
    if (on.base.weightKg + carried > maxWeightWithBedding(bin.container, on.base.length)) continue;
    if (!floorCarries(bin, on.base.z, on.base.length, line.weightKg)) continue;
    bin.lines.push(line);
    bin.pieces.push({ ...on.base, y: on.top });
    bin.weightKg += line.weightKg;
    rest(bin, on.base.z, on.base.length, line.weightKg);
    bin.stackKg.set(on.base, (bin.stackKg.get(on.base) ?? 0) + line.weightKg);
    on.top += line.heightMm;
    on.carried = carried;
    return true;
  }
  return false;
}

/**
 * Stands one piece on a piece that carries other cargo on top (Council Outlay 14, P9): the first
 * column it rests on whole, either way round it may sit, that still bears its weight - every piece
 * under it does - with the column under the roof (topFits) and the floor carrying it. It stands on
 * the base's own corner, so the two are one stack to everything that moves or draws the load. A
 * piece with an end pin stands only on cargo of the same pin, and cargo with none only on cargo with
 * none: nothing pinned to the doors rides on the front wall's.
 */
function stackMixed(bin: Bin, line: CargoLine): boolean {
  if (bin.columns.length === 0) return false;
  const top = (column: Column) => column.top + line.heightMm;
  for (const column of bin.columns) {
    if (column.room < line.weightKg || top(column) > bin.container.internalH) continue;
    if (endRank(column.line) !== endRank(line)) continue;
    if (column.weightKg + line.weightKg > maxWeightWithBedding(bin.container, column.base.length)) continue;
    const fp = waysOf(bin.container, line).find((way) => way.length <= column.length && way.width <= column.width && topFits(bin.container, way, top(column)));
    if (!fp || !floorCarries(bin, column.base.z, column.base.length, line.weightKg)) continue;
    bin.lines.push(line);
    bin.pieces.push({ lineId: line.id, name: line.name, x: column.base.x, y: column.top, z: column.base.z, length: fp.length, width: fp.width, height: line.heightMm, weightKg: line.weightKg, crosswise: fp.crosswise });
    bin.weightKg += line.weightKg;
    rest(bin, column.base.z, column.base.length, line.weightKg);
    bin.stackKg.set(column.base, (bin.stackKg.get(column.base) ?? 0) + line.weightKg);
    column.top += line.heightMm;
    column.length = fp.length;
    column.width = fp.width;
    column.weightKg += line.weightKg;
    // What stands on it from now on is carried by this piece too.
    column.room = Math.min(column.room - line.weightKg, line.topLoadKg ?? 0);
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
  // A piece pinned to the doors takes the free place nearest them, whatever the layout.
  const rule = line.pinEnd === "doors" ? "doors" : bin.rule;
  const slot = nextSlot(bin, line, inMiddle);
  const ways = slot
    ? [{ fp: { length: slot.length, width: slot.width, crosswise: slot.crosswise }, spot: { x: slot.x, z: slot.z, score: 0 } }]
    : waysOf(bin.container, line)
    .map((fp) => ({ fp, spot: findSpot(bin.floor, fp.length, fp.width, rule, (_x, z) => floorCarries(bin, z, fp.length, line.weightKg)) }))
    .filter((way) => way.spot !== null)
    .sort((a, b) => a.spot!.score - b.spot!.score);
  const chosen = ways[0];
  if (!chosen?.spot) return false;
  let best: Placement = { fp: chosen.fp, spot: chosen.spot };

  // The first piece of a load, when it takes the floor's whole width, goes to the middle of the
  // length: the rest of the cargo then fills both ends and the load stays in balance. So does a
  // piece asked into the middle, which is centred across the floor too. A first piece stands
  // alone: it needs the same bedding wherever it stands.
  if (bin.pieces.length === 0) {
    if (!bin.fromEnd && !slot) {
      if ((inMiddle || best.fp.width >= bin.floor.width) && best.fp.length < bin.floor.length) {
        best.spot.z = Math.round((bin.floor.length - best.fp.length) / 2);
        bin.centredFirst = !inMiddle;
      }
      if (inMiddle && best.fp.width < bin.floor.width) best.spot.x = Math.round((bin.floor.width - best.fp.width) / 2);
    }
  } else best = withLeastBedding(bin, line, rule, best);
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
  bin.stackKg.set(piece, line.weightKg);
  bin.weightKg += line.weightKg;
  // A line with a top-load limit carries by that limit, its own kind and others alike; one without, its own kind when it is stackable.
  if (line.topLoadKg) {
    bin.columns.push({ base: piece, line, top: piece.height, length: piece.length, width: piece.width, room: line.topLoadKg, weightKg: line.weightKg });
  } else if (line.stackable) {
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
  // A piece pinned to the front wall goes in before anything that is not: a container that already
  // holds other cargo no longer takes it, so nothing ends up between it and the wall.
  const frontFirst = line.pinEnd !== "front" || bin.lines.every((l) => l.pinEnd === "front");
  const fits = frontFirst && bin.weightKg + line.weightKg <= bin.maxKg && (first === undefined || longOnes === isLong);
  if (fits && (placeOnFloor(bin, line, inMiddle) || stack(bin, line) || stackMixed(bin, line))) return true;
  bin.full.add(line.id);
  return false;
}

/** The bin packed again with its first piece at the end and one more piece, or null when that does not take everything. */
function packedFromEnd(bin: Bin, line: CargoLine): Bin | null {
  const again = newBin(bin.container, bin.rule, bin.endPins, bin.lessBedding);
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

/**
 * Loads the pieces into as many containers of one type as they need, or null as soon as that is more
 * than `maxBins`. `lessBedding`: each piece is placed to add the least bedding (withLeastBedding).
 */
function packInto(container: ContainerSpec, lines: CargoLine[], rule: PlaceRule, maxBins: number, lessBedding = false): Packing | null {
  const bins: Bin[] = [];
  const left: CargoLine[] = [];
  // A line that did not go into an empty container never will.
  const never = new Set<string>();
  const endPins = hasEndPin(lines);
  for (const line of lines) {
    if (never.has(line.id)) {
      left.push(line);
      continue;
    }
    if (placeInOne(bins, line)) continue;
    const fresh = newBin(container, rule, endPins, lessBedding);
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

/** A packing with the way of laying out a floor it was loaded by. */
interface Packed extends Packing {
  rule: PlaceRule;
}

/**
 * The pieces loaded into one type by each way of laying out a floor; the best result is kept. Null
 * when every way takes more than `maxBins` containers.
 *
 * Every way leaves out the same pieces (those no empty container of the type takes), and only a flat
 * rack has overhang beyond the ends, so on other equipment a way taking more containers than the
 * best so far cannot be better (see `cost`) and is given up as soon as it does.
 */
function bestPacking(container: ContainerSpec, lines: CargoLine[], maxBins = Infinity): Packed | null {
  let best: Packed | null = null;
  for (const rule of layouts(lines)) {
    const limit = best && container.group !== "flat-rack" ? Math.min(maxBins, best.bins.length) : maxBins;
    const packed = packInto(container, lines, rule, limit);
    if (packed && (!best || cheaper(cost(packed.bins, packed.left.length), cost(best.bins, best.left.length)))) best = { ...packed, rule };
  }
  return best;
}

/** The bedding the cargo of a packing needs, in mm in all (binBedding). */
const beddingOfBins = (bins: Bin[]): number => sum(bins.map((bin) => binBedding(bin)));

/**
 * A packing that needs bedding, loaded once more by the same way of laying out the floor, each piece
 * taking the place that adds the least bedding (withLeastBedding). That packing is kept when it needs
 * less bedding and is no worse by `cost` - beams are never paid for with a container more or a piece
 * left out -, and the packing as it was otherwise. Cargo with an end pinned keeps its packing.
 */
function withLessBedding(container: ContainerSpec, lines: CargoLine[], packed: Packed): Packing {
  if (hasEndPin(lines)) return packed;
  const bedding = beddingOfBins(packed.bins);
  if (bedding === 0) return packed;
  // More containers than it took cannot be better, unless on flat racks (see bestPacking).
  const less = packInto(container, lines, packed.rule, container.group === "flat-rack" ? Infinity : packed.bins.length, true);
  if (!less || beddingOfBins(less.bins) >= bedding || cheaper(cost(packed.bins, packed.left.length), cost(less.bins, less.left.length))) return packed;
  return less;
}

/** Moves a load into a smaller or lower container when all of it fits there just as well. `lessBedding`: packed there to need less bedding (withLessBedding). */
function shrink(bin: Bin, candidates: ContainerSpec[], lessBedding: boolean): Bin {
  const smaller = candidates
    .filter((c) => !c.hardTop || bin.container.hardTop)
    .filter((c) => c.feet < bin.container.feet || (c.feet === bin.container.feet && c.internalH < bin.container.internalH))
    .sort((a, b) => a.feet - b.feet || a.internalH - b.internalH);
  for (const container of smaller) {
    const best = bestPacking(container, bin.lines, 1);
    const packed = best && lessBedding ? withLessBedding(container, bin.lines, best) : best;
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
 * `lessBedding`: the best packing, when it needs bedding, is also loaded to need less (withLessBedding).
 */
function loadGroup(candidates: ContainerSpec[], lines: CargoLine[], lessBedding: boolean): Packing {
  const bins: Bin[] = [];
  let left = lines;
  let types = [...candidates].sort((a, b) => b.internalL * b.internalW - a.internalL * a.internalW || b.internalH - a.internalH);
  while (left.length > 0 && types.length > 0) {
    let best: (Packed & { container: ContainerSpec }) | null = null;
    for (const container of types) {
      const packed = bestPacking(container, left, binsToBeat(container, left, best));
      if (!packed || packed.bins.length === 0) continue;
      if (!best || cheaper(cost(packed.bins, packed.left.length), cost(best.bins, best.left.length))) best = { container, ...packed };
    }
    if (!best) break;
    const { container } = best;
    const chosen = lessBedding ? withLessBedding(container, left, best) : best;
    bins.push(...chosen.bins.map((bin) => shrink(bin, candidates, lessBedding)));
    left = chosen.left;
    types = types.filter((c) => c !== container);
  }
  return { bins, left };
}

/**
 * A container holding cargo pinned to an end, centred by sliding it as a whole: packing it again
 * around its heaviest piece would move the pinned ones. One its own packing filled with no end pin,
 * which then took end-pinned cargo (a pinned container, a flat rack or an open top filled up with
 * the rest of the cargo), is also packed again by the end-pin rules - from the front wall, in loading
 * order, no first piece in the middle - and that packing is kept when it takes all of the cargo and,
 * slid as well, leaves fewer pinned pieces away from their end (piecesNotKept), or as few with the
 * load no further off the middle. A container with no end-pinned cargo is never packed so.
 */
function slidWithEndPins(bin: Bin): Bin {
  centreLoad(bin.pieces, bin.container, true);
  if (bin.endPins) return bin;
  const again = newBin(bin.container, "front", true);
  if (!inLoadingOrder(bin.lines).every((line) => place(again, line))) return bin;
  centreLoad(again.pieces, again.container, true);
  const lineOf = new Map(bin.lines.map((line) => [line.id, line]));
  const [away, awayBefore] = [piecesNotKept(again.pieces, lineOf).length, piecesNotKept(bin.pieces, lineOf).length];
  return away < awayBefore || (away === awayBefore && offCentre(again) <= offCentre(bin)) ? again : bin;
}

const offCentre = (bin: Bin): number => {
  const balance = balanceOf(bin.pieces, bin.container);
  return Math.abs(balance.alongPct) + Math.abs(balance.acrossPct);
};

/**
 * A load centred as well as its packing allows. One that is still out of balance is packed once
 * more around its heaviest piece, set in the middle of the floor, and that packing is kept when it
 * takes every piece and balances better: a heavy piece no longer sits in a corner with the light
 * cargo beside it. A container holding cargo pinned to an end only slides (slidWithEndPins).
 */
function balanced(bin: Bin): Bin {
  if (hasEndPin(bin.lines)) return slidWithEndPins(bin);
  centreLoad(bin.pieces, bin.container);
  if (balanceOf(bin.pieces, bin.container).ok) return bin;

  const heaviest = bin.lines.reduce((a, b) => (b.weightKg > a.weightKg ? b : a), bin.lines[0]!);
  const rest = [...bin.lines];
  rest.splice(rest.indexOf(heaviest), 1);
  const again = newBin(bin.container, bin.rule, false, bin.lessBedding);
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
  const waiting: Waiting = { standard: [], "open-top": [], "flat-rack": [] };
  const refused: CargoLine[] = [];
  for (const line of inLoadingOrder(lines)) {
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
 * @param lessBedding packings that need bedding are also tried placing pieces to need less (loadGroup)
 */
function buildPlan(
  sorted: { waiting: Waiting; refused: CargoLine[] },
  allowed: ContainerSpec[],
  all: ContainerSpec[],
  flatRacks: ContainerSpec[],
  openTops: ContainerSpec[],
  packStandard: (lines: CargoLine[]) => Packing,
  lessBedding: boolean,
): LoadPlan {
  const flat = loadGroup(flatRacks, sorted.waiting["flat-rack"], lessBedding);
  const afterFlat = { open: fill(flat.bins, sorted.waiting["open-top"]), standard: fill(flat.bins, sorted.waiting.standard) };

  const open = loadGroup(openTops, afterFlat.open, lessBedding);
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
 * A plan that asks for bedding (heavy cargo resting on too short a stretch of floor) is worked out
 * once more, its heavy pieces placed to need less: end to end where abreast they would need beams
 * (withLeastBedding). That plan is kept when it needs less bedding at no cost - no container more,
 * no piece left out, no pin given up. A plan that needs no bedding is the plan as it always was.
 *
 * @param nominated ids of the container types to use; leave out to let the planner choose from all
 *   but the 45' and the hard-tops, which it takes only when they are nominated
 * @param rules the company's rules: clearance, heavy pieces, out-of-gauge warning limits; none when left out
 */
export function planLoad(lines: CargoLine[], nominated?: string[], rules?: PlanRules): LoadPlan {
  const all = containersWith(rules);
  const allowed = nominated ? all.filter((c) => nominated.includes(c.id)) : all.filter((c) => !c.onRequest);
  // Cargo with no pin at all is planned without the pin rules.
  const planned = (lessBedding: boolean, only?: Mix) =>
    lines.some((line) => line.pinEnd || line.pinBox) ? planPinned(lines, allowed, all, lessBedding, only) : planSorted(sortedPieces(lines, allowed), allowed, all, lessBedding, only);
  const { plan: plain, mix } = planned(false);
  const bedding = planBedding(plain);
  if (bedding === 0) return plain;
  // With the flat racks and open tops that plan took: no other mix of them cost less.
  const less = planned(true, mix).plan;
  const pinsGivenUp = (less.pinNotes?.length ?? 0) > (plain.pinNotes?.length ?? 0);
  return planBedding(less) < bedding && !cheaper(planCost(plain), planCost(less)) && !pinsGivenUp ? less : plain;
}

/** The flat-rack and open-top types a plan may open (see planSorted). */
interface Mix {
  flatRacks: ContainerSpec[];
  openTops: ContainerSpec[];
}

/** What a plan costs (see `cost`): the colli it leaves out, then its containers. */
const planCost = (plan: LoadPlan): number[] => cost(plan.loads, sum(plan.notLoaded.map((n) => n.colli)));

/**
 * The bedding a plan asks for, in mm in all: for each stretch of floor its loads are warned about
 * (floorOverloads), how much more floor than the stretch its weight must be spread over.
 */
const planBedding = (plan: LoadPlan): number => sum(plan.loads.flatMap((load) => floorOverloads(load).map(beddingOf)));

/**
 * The plan of pieces already sorted under the kind of equipment each needs: every mix of the allowed
 * flat-rack and open-top types is tried, or `only` the one given, and the best plan kept with its
 * mix. `lessBedding` as for buildPlan.
 */
function planSorted(sorted: { waiting: Waiting; refused: CargoLine[] }, allowed: ContainerSpec[], all: ContainerSpec[], lessBedding: boolean, only?: Mix): { plan: LoadPlan; mix: Mix } {
  const choices = (group: ContainerGroup) => {
    const types = allowed.filter((c) => c.group === group);
    return types.length > 1 && sorted.waiting[group].length > 0 ? [types, ...types.map((type) => [type])] : [types];
  };
  const mixes = only ? [only] : choices("flat-rack").flatMap((flatRacks) => choices("open-top").map((openTops) => ({ flatRacks, openTops })));
  // Plans that leave the same pieces to standard containers load them alike: each such share is packed once.
  const standardTypes = allowed.filter((c) => c.group === "standard");
  const shares = new Map<string, Packing>();
  const packStandard = (left: CargoLine[]): Packing => {
    const key = left.map((line) => line.id).join(" ");
    let share = shares.get(key);
    if (!share) {
      const packed = loadGroup(standardTypes, left, lessBedding);
      share = { bins: packed.bins.map(balanced), left: packed.left };
      shares.set(key, share);
    }
    return share;
  };

  let best: { plan: LoadPlan; mix: Mix } | null = null;
  for (const mix of mixes) {
    const plan = buildPlan(sorted, allowed, all, mix.flatRacks, mix.openTops, packStandard, lessBedding);
    if (!best || cheaper(planCost(plan), planCost(best.plan))) best = { plan, mix };
  }
  return best ?? { plan: { loads: [], notLoaded: [] }, mix: { flatRacks: [], openTops: [] } };
}

/** Why pinned cargo is not loaded; `place` is the plan's container that stands for its number, when it has one. */
const PINNED_FULL = (box: number, place?: number) => `Pinned to container no. ${box}${place ? ` (#${place} of the plan)` : ""}, which has no room for it with the other cargo pinned there.`;

/**
 * A plan with pins (Council Outlay 14, P8).
 *
 * Lines pinned to a container number are loaded first, each number into one container of its own:
 * the type that takes the most of them, of the kind of equipment the neediest of them needs. What
 * does not go into that one container is not loaded, and says so - it is never sent to another
 * container on the quiet. The other cargo then fills those containers before any more is opened,
 * and the rest is planned as ever. The pinned containers come first in the plan, in the order of
 * their numbers, each load carrying its number (`pinBox`): a number is the user's name for a
 * container, not its place, so pins 2 and 5 are the plan's #1 and #2, and everything that names a
 * pinned number says which of the plan's containers it is.
 *
 * A line pinned to the front wall is placed before all other cargo of its container and one pinned
 * to the doors after it, against the door end; `balanced` keeps that order through the centring.
 * `lessBedding` and `only` as for planSorted, which plans the cargo with no container number; the
 * plan comes with the mix of flat-rack and open-top types it took.
 */
function planPinned(lines: CargoLine[], allowed: ContainerSpec[], all: ContainerSpec[], lessBedding: boolean, only?: Mix): { plan: LoadPlan; mix: Mix } {
  const notLoaded = new Map<string, NotLoaded>();
  const note = (line: CargoLine, reason: string) => {
    const entry = notLoaded.get(line.id) ?? { lineId: line.id, name: line.name, colli: 0, reason };
    entry.colli += 1;
    notLoaded.set(line.id, entry);
  };

  const boxes = [...new Set(lines.flatMap((line) => (line.pinBox ? [line.pinBox] : [])))].sort((a, b) => a - b);
  const pinned: { box: number; bin: Bin }[] = [];
  for (const box of boxes) {
    const sorted = sortedPieces(lines.filter((line) => line.pinBox === box), allowed);
    for (const line of sorted.refused) note(line, refusal(line, allowed, all));
    const pieces = inLoadingOrder([...sorted.waiting["flat-rack"], ...sorted.waiting["open-top"], ...sorted.waiting.standard]);
    if (pieces.length === 0) continue;
    // The kind of equipment the neediest piece needs takes them all: a flat rack any piece, an open top what a standard container takes.
    const group: ContainerGroup = sorted.waiting["flat-rack"].length > 0 ? "flat-rack" : sorted.waiting["open-top"].length > 0 ? "open-top" : "standard";
    // A packing of them: the one container they go into, the pieces that stay out, and what that costs.
    const priced = (packed: Packing) => {
      const [first, ...others] = packed.bins;
      if (!first) return null;
      const out = [...others.flatMap((bin) => bin.lines), ...packed.left];
      return { bin: first, out, cost: [out.length, ...cost([first], 0)] };
    };
    let best: (NonNullable<ReturnType<typeof priced>> & { container: ContainerSpec; packed: Packed }) | null = null;
    for (const container of allowed.filter((c) => c.group === group)) {
      const packed = bestPacking(container, pieces);
      const price = packed && priced(packed);
      if (packed && price && (!best || cheaper(price.cost, best.cost))) best = { ...price, container, packed };
    }
    // Where that container needs bedding, they are loaded once more by the same layout, each piece placed to add
    // the least of it (withLeastBedding); that packing is kept when the container needs less and it costs no more.
    if (best && lessBedding && !hasEndPin(pieces) && binBedding(best.bin) > 0) {
      const less = priced(packInto(best.container, pieces, best.packed.rule, Infinity, true)!);
      if (less && binBedding(less.bin) < binBedding(best.bin) && !cheaper(best.cost, less.cost)) best = { ...best, ...less };
    }
    if (!best) {
      for (const line of pieces) note(line, PINNED_FULL(box));
      continue;
    }
    for (const line of best.out) note(line, PINNED_FULL(box, pinned.length + 1));
    pinned.push({ box, bin: best.bin });
  }

  // The cargo with no container number fills the pinned containers first, the neediest kind first, as a flat rack in use is filled.
  const free = sortedPieces(lines.filter((line) => !line.pinBox), allowed);
  const bins = pinned.map((entry) => entry.bin);
  const waiting: Waiting = {
    "flat-rack": fill(bins, free.waiting["flat-rack"]),
    "open-top": fill(bins, free.waiting["open-top"]),
    standard: fill(bins, free.waiting.standard),
  };
  const { plan: rest, mix } = planSorted({ waiting, refused: free.refused }, allowed, all, lessBedding, only);
  for (const entry of rest.notLoaded) {
    const seen = notLoaded.get(entry.lineId);
    if (seen) seen.colli += entry.colli;
    else notLoaded.set(entry.lineId, entry);
  }
  const loads = [
    ...pinned.map(({ box }, index) => {
      // fill() may have packed a pinned container again from its end: the one in `bins` is the one loaded.
      const loaded = balanced(bins[index]!);
      return { container: loaded.container, pieces: loaded.pieces, totalWeightKg: loaded.weightKg, pinBox: box };
    }),
    ...rest.loads,
  ];
  const pinNotes = pinsNotKept(loads, lines);
  return { plan: { loads, notLoaded: [...notLoaded.values()], ...(pinNotes.length > 0 ? { pinNotes } : {}) }, mix };
}

/**
 * The pins a plan did not keep, as sentences; none when all hold. A piece pinned to the front wall
 * must have no other cargo between it and the wall, one pinned to the doors none between it and the
 * doors - cargo of its own pin, and cargo standing beside it, do not count. Lines with one
 * container number must be in one container, lines with different numbers in different ones.
 * The plan's containers are named by their place in it ("#2"), a pinned number as "container no. 2".
 */
export function pinsNotKept(loads: readonly ContainerLoad[], lines: readonly CargoLine[]): string[] {
  const lineOf = new Map(lines.map((line) => [line.id, line]));
  const notes: string[] = [];
  const named = (ids: Iterable<string>) => [...new Set([...ids].map((id) => lineOf.get(id)?.name || "Cargo"))].join(", ");
  loads.forEach((load, index) => {
    const blocked = { front: new Set<string>(), doors: new Set<string>() };
    for (const piece of piecesNotKept(load.pieces, lineOf)) blocked[lineOf.get(piece.lineId)!.pinEnd!].add(piece.lineId);
    const end = hasDoorsOf(load.container) ? { front: "the front wall", doors: "the doors" } : { front: "the left end", doors: "the right end" };
    if (blocked.front.size > 0) notes.push(`Container #${index + 1}: ${named(blocked.front)} could not be kept at ${end.front}; other cargo stands before it.`);
    if (blocked.doors.size > 0) notes.push(`Container #${index + 1}: ${named(blocked.doors)} could not be kept at ${end.doors}; other cargo stands behind it.`);
  });
  const whereOf = new Map<number, Set<number>>();
  loads.forEach((load, index) => {
    for (const piece of load.pieces) {
      const box = lineOf.get(piece.lineId)?.pinBox;
      if (box) whereOf.set(box, (whereOf.get(box) ?? new Set()).add(index));
    }
  });
  for (const [box, where] of whereOf) {
    if (where.size > 1) notes.push(`The cargo pinned to container no. ${box} is in ${where.size} containers: ${[...where].map((index) => `#${index + 1}`).join(", ")}.`);
  }
  return notes;
}

const hasDoorsOf = (container: ContainerSpec): boolean => container.group !== "flat-rack";

/**
 * The pieces on the floor pinned to an end that other cargo stands between and their end: before a
 * piece pinned to the front wall, behind one pinned to the doors. Cargo of the same pin, and cargo
 * standing beside the piece, do not count; nor does cargo on top of other cargo.
 */
function piecesNotKept(pieces: readonly PlacedPiece[], lineOf: ReadonlyMap<string, CargoLine>): PlacedPiece[] {
  return pieces.filter((piece) => {
    const end = lineOf.get(piece.lineId)?.pinEnd;
    if (!end || piece.y > 0) return false;
    return pieces.some((other) => {
      if (other === piece || other.y > 0 || lineOf.get(other.lineId)?.pinEnd === end) return false;
      const beside = other.x >= piece.x + piece.width || other.x + other.width <= piece.x;
      if (beside) return false;
      return end === "front" ? other.z + other.length <= piece.z : other.z >= piece.z + piece.length;
    });
  });
}
