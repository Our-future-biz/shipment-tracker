import type { ContainerSpec } from "./containers";
import type { ContainerLoad, PlacedPiece } from "./plan";

/** The centre of gravity must lie within this share of the half-length and half-width of the floor. */
export const BALANCE_TOLERANCE_PCT = 10;

export interface Balance {
  /** Centre of gravity on the floor, in mm from the start corner. */
  cogX: number;
  cogZ: number;
  /** How far it is off the middle, as % of the half-length and half-width (0 = centred, 100 = at the edge). */
  alongPct: number;
  acrossPct: number;
  ok: boolean;
}

/** Where the weight of a load sits. Each piece's weight is taken to act at its middle. */
export function balanceOf(pieces: PlacedPiece[], container: ContainerSpec): Balance {
  const midX = container.internalW / 2;
  const midZ = container.internalL / 2;
  const weight = pieces.reduce((total, p) => total + p.weightKg, 0);
  if (weight === 0) return { cogX: midX, cogZ: midZ, alongPct: 0, acrossPct: 0, ok: true };

  const cogX = pieces.reduce((total, p) => total + (p.x + p.width / 2) * p.weightKg, 0) / weight;
  const cogZ = pieces.reduce((total, p) => total + (p.z + p.length / 2) * p.weightKg, 0) / weight;
  const alongPct = ((cogZ - midZ) / midZ) * 100;
  const acrossPct = ((cogX - midX) / midX) * 100;
  const ok = Math.abs(alongPct) <= BALANCE_TOLERANCE_PCT && Math.abs(acrossPct) <= BALANCE_TOLERANCE_PCT;
  return { cogX, cogZ, alongPct, acrossPct, ok };
}

/** The pieces standing on one spot of the floor: the bottom piece and what is stacked on it. */
const stacksOf = (pieces: PlacedPiece[]): PlacedPiece[][] => {
  const stacks = new Map<string, PlacedPiece[]>();
  for (const piece of pieces) {
    const key = `${piece.x}|${piece.z}`;
    const stack = stacks.get(key);
    if (stack) stack.push(piece);
    else stacks.set(key, [piece]);
  }
  return [...stacks.values()];
};

const weightOf = (stack: PlacedPiece[]) => stack.reduce((total, p) => total + p.weightKg, 0);

interface Band {
  start: number;
  end: number;
  pieces: PlacedPiece[];
}

/**
 * The load cut across wherever no piece lies over the cut. The bands between the cuts can move
 * without anything colliding: along the container by changing places, across it each on its own.
 */
function bandsOf(pieces: PlacedPiece[]): Band[] {
  const bands: Band[] = [];
  for (const piece of [...pieces].sort((a, b) => a.z - b.z)) {
    const last = bands[bands.length - 1];
    if (last && piece.z < last.end) {
      last.end = Math.max(last.end, piece.z + piece.length);
      last.pieces.push(piece);
    } else {
      bands.push({ start: piece.z, end: piece.z + piece.length, pieces: [piece] });
    }
  }
  return bands;
}

/**
 * Puts the heavy part of a load in the middle of its length: the heaviest band goes in the middle,
 * each next one to the lighter end. A load with a piece overhanging the ends is left as it is.
 */
function heavyBandsToMiddle(pieces: PlacedPiece[], container: ContainerSpec): void {
  if (pieces.some((p) => p.z < 0 || p.z + p.length > container.internalL)) return;
  const bands = bandsOf(pieces);
  if (bands.length < 3) return;

  const [heaviest, ...rest] = [...bands].sort((a, b) => weightOf(b.pieces) - weightOf(a.pieces));
  if (!heaviest) return;
  const front: Band[] = [];
  const back: Band[] = [];
  let frontWeight = 0;
  let backWeight = 0;
  for (const band of rest) {
    if (frontWeight <= backWeight) {
      front.unshift(band);
      frontWeight += weightOf(band.pieces);
    } else {
      back.push(band);
      backWeight += weightOf(band.pieces);
    }
  }
  let z = 0;
  for (const band of [...front, heaviest, ...back]) {
    for (const piece of band.pieces) piece.z += z - band.start;
    z += band.end - band.start;
  }
}

/**
 * Among stacks that cover the same floor area (so they can change places without colliding), puts
 * the heavier ones nearer the middle of the floor. Kept only when the balance is better for it.
 */
function heavyStacksToMiddle(pieces: PlacedPiece[], container: ContainerSpec, offCentre: () => number): void {
  const groups = new Map<string, PlacedPiece[][]>();
  for (const stack of stacksOf(pieces)) {
    const key = `${stack[0]?.length}x${stack[0]?.width}`;
    const group = groups.get(key);
    if (group) group.push(stack);
    else groups.set(key, [stack]);
  }
  const before = offCentre();
  const was = pieces.map((p) => [p.x, p.z] as const);
  // How far a place is from the middle of the floor, each way measured against the floor's half-size.
  const fromMiddle = (x: number, z: number, piece: PlacedPiece) =>
    Math.hypot((x + piece.width / 2) / (container.internalW / 2) - 1, (z + piece.length / 2) / (container.internalL / 2) - 1);

  for (const group of groups.values()) {
    const first = group[0]?.[0];
    if (!first || group.length < 2 || group.every((stack) => weightOf(stack) === weightOf(group[0]!))) continue;
    const places = group.map((stack) => [stack[0]!.x, stack[0]!.z] as const).sort((a, b) => fromMiddle(a[0], a[1], first) - fromMiddle(b[0], b[1], first));
    const heaviestFirst = [...group].sort((a, b) => weightOf(b) - weightOf(a));
    heaviestFirst.forEach((stack, index) => {
      const [x, z] = places[index]!;
      for (const piece of stack) [piece.x, piece.z] = [x, z];
    });
  }
  if (offCentre() < before - 0.01) return;
  pieces.forEach((piece, index) => ([piece.x, piece.z] = was[index]!));
}

const clamp = (value: number, least: number, most: number) => (least > most ? 0 : Math.round(Math.min(most, Math.max(least, value))));

/** Moves each band across the container towards the middle, as far as its own free margin allows. */
function bandsToMiddleAcross(pieces: PlacedPiece[], container: ContainerSpec): void {
  for (const band of bandsOf(pieces)) {
    const weight = weightOf(band.pieces);
    if (weight === 0) continue;
    const cogX = band.pieces.reduce((total, p) => total + (p.x + p.width / 2) * p.weightKg, 0) / weight;
    // A band with a piece overhanging the sides is already centred: its margin is negative and it stays.
    const least = -Math.min(...band.pieces.map((p) => p.x));
    const most = container.internalW - Math.max(...band.pieces.map((p) => p.x + p.width));
    const dx = clamp(container.internalW / 2 - cogX, least, most);
    for (const piece of band.pieces) piece.x += dx;
  }
}

/** Slides the whole load along the container towards the middle, as far as the free floor allows. */
function slideToMiddleAlong(pieces: PlacedPiece[], container: ContainerSpec): void {
  const least = -Math.min(...pieces.map((p) => p.z));
  const most = container.internalL - Math.max(...pieces.map((p) => p.z + p.length));
  const dz = clamp(container.internalL / 2 - balanceOf(pieces, container).cogZ, least, most);
  for (const piece of pieces) piece.z += dz;
}

/**
 * Brings the centre of gravity of a load towards the middle of the floor, in place. Two ways are
 * tried and the better one kept: the load as it was packed, and the load with its heavy part moved
 * to the middle of its length. Either way the load slides to the middle of the length, equal-sized
 * stacks change places so the heavier ones stand nearer the middle, and each band of the load
 * moves to the middle of the width.
 */
export function centreLoad(pieces: PlacedPiece[], container: ContainerSpec): void {
  if (pieces.length === 0) return;
  const settle = (reorder: boolean) => {
    const copy = pieces.map((piece) => ({ ...piece }));
    const offCentre = () => {
      const balance = balanceOf(copy, container);
      return Math.abs(balance.alongPct) + Math.abs(balance.acrossPct);
    };
    if (reorder) heavyBandsToMiddle(copy, container);
    // Slide first, so a change of places is judged on the load where it will stand.
    slideToMiddleAlong(copy, container);
    bandsToMiddleAcross(copy, container);
    heavyStacksToMiddle(copy, container, offCentre);
    slideToMiddleAlong(copy, container);
    bandsToMiddleAcross(copy, container);
    return { copy, off: offCentre() };
  };
  const [asPacked, reordered] = [settle(false), settle(true)];
  const best = reordered.off < asPacked.off - 0.01 ? reordered.copy : asPacked.copy;
  pieces.forEach((piece, index) => {
    piece.x = best[index]?.x ?? piece.x;
    piece.z = best[index]?.z ?? piece.z;
  });
}

/** A stretch of floor that carries more per metre than the container's floor is rated for. */
export interface FloorOverload {
  /** The cargo lines standing on the stretch, by name. */
  names: string[];
  /** Where the stretch starts and how long it is, in mm from the front wall. */
  fromMm: number;
  lengthMm: number;
  /** The weight resting on the stretch, in kg. */
  weightKg: number;
  /** The heaviest cross-section of the stretch, in tonnes per running metre. */
  tonnesPerMetre: number;
  /** The length of floor that weight must be spread over to stay within the limit, in mm. */
  spreadMm: number;
}

/**
 * Where the floor is overloaded. The floor is rated in tonnes per running metre across its whole
 * width, so pieces standing side by side count together: at every cross-section the weight per
 * metre of each stack standing there is added up (a stack spreads its weight evenly over its own
 * length). Neighbouring cross-sections over the limit make one stretch. The cargo of a stretch
 * needs bedding (timber under it, along the container) or more floor: `spreadMm` in all.
 */
export function floorOverloads(load: ContainerLoad): FloorOverload[] {
  const { container } = load;
  const limit = container.maxTonnesPerMetre; // 1 t/m is 1 kg/mm
  // Each stack as the stretch of floor it rests on and the weight it puts on every mm of it.
  const rests = stacksOf(load.pieces).flatMap((stack) => {
    const base = stack.find((p) => p.y === 0);
    if (!base) return [];
    const from = Math.max(0, base.z);
    const to = Math.min(container.internalL, base.z + base.length);
    return to > from ? [{ from, to, perMm: weightOf(stack) / (to - from), name: base.name }] : [];
  });
  const cuts = [...new Set(rests.flatMap((r) => [r.from, r.to]))].sort((a, b) => a - b);

  type Open = FloorOverload & { nameSet: Set<string> };
  const overloads: Open[] = [];
  let open: Open | null = null;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [from, to] = [cuts[i]!, cuts[i + 1]!];
    const here = rests.filter((r) => r.from <= from && r.to >= to);
    const perMm = here.reduce((total, r) => total + r.perMm, 0);
    if (perMm <= limit + 1e-9) {
      open = null;
      continue;
    }
    if (!open) {
      open = { names: [], nameSet: new Set(), fromMm: from, lengthMm: 0, weightKg: 0, tonnesPerMetre: 0, spreadMm: 0 };
      overloads.push(open);
    }
    open.lengthMm += to - from;
    open.weightKg += perMm * (to - from);
    open.tonnesPerMetre = Math.max(open.tonnesPerMetre, perMm);
    for (const r of here) open.nameSet.add(r.name || "Cargo");
  }
  return overloads.map(({ nameSet, ...overload }) => ({
    ...overload,
    names: [...nameSet],
    weightKg: Math.round(overload.weightKg),
    spreadMm: Math.ceil(overload.weightKg / limit),
  }));
}
