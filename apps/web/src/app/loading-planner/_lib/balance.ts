import { maxWeightOn, maxWeightWithBedding, restingNeeded, tonnesPerMetre, usableLength, type ContainerSpec } from "./containers";
import type { ContainerLoad, PlacedPiece } from "./plan";

/** Across the container the centre of gravity must lie within this share of the half-width of the floor. */
export const BALANCE_TOLERANCE_PCT = 10;
/** Along the container it may be this far off the middle, in mm: what carriers usually allow on a 20' and on a 40' or 45'. */
const ALONG_LIMIT_20_MM = 600;
const ALONG_LIMIT_40_MM = 900;

/** How far off the middle of the floor the centre of gravity of a container may lie, in mm. */
export const balanceLimits = (container: ContainerSpec): { alongMm: number; acrossMm: number } => ({
  alongMm: container.feet <= 20 ? ALONG_LIMIT_20_MM : ALONG_LIMIT_40_MM,
  acrossMm: (container.internalW / 2) * (BALANCE_TOLERANCE_PCT / 100),
});

/** The rule in one line, for a plan with containers of any length. */
export const BALANCE_RULE = "centre of gravity within 60 cm of the middle on a 20', 90 cm on a 40' or 45'";

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
  const limits = balanceLimits(container);
  const ok = Math.abs(cogZ - midZ) <= limits.alongMm && Math.abs(cogX - midX) <= limits.acrossMm;
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
 * the heavier ones nearer the middle of the floor. Kept only when the balance is better for it and
 * the floor still carries every stretch of cargo (a heavy stack may move into a loaded stretch).
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
  if (offCentre() < before - 0.01 && floorHolds(pieces, container)) return;
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

/**
 * Slides the whole load along the container towards the middle, as far as the free floor allows:
 * in a standard container no further than the clearance left free at the doors.
 */
function slideToMiddleAlong(pieces: PlacedPiece[], container: ContainerSpec): void {
  const least = -Math.min(...pieces.map((p) => p.z));
  const most = usableLength(container) - Math.max(...pieces.map((p) => p.z + p.length));
  const dz = clamp(container.internalL / 2 - balanceOf(pieces, container).cogZ, least, most);
  for (const piece of pieces) piece.z += dz;
}

/**
 * Brings the centre of gravity of a load towards the middle of the floor, in place. Two ways are
 * tried and the better one kept: the load as it was packed, and the load with its heavy part moved
 * to the middle of its length. Either way the load slides to the middle of the length, equal-sized
 * stacks change places so the heavier ones stand nearer the middle, and each band of the load
 * moves to the middle of the width. Moving the heavy part closes the gaps between the bands, so
 * that way is taken only when the floor still carries the cargo that then stands end to end.
 */
export function centreLoad(pieces: PlacedPiece[], container: ContainerSpec, keepOrder = false): void {
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
    // With pieces pinned to an end of the container, nothing changes places along it: the load only slides as a whole.
    if (!keepOrder) heavyStacksToMiddle(copy, container, offCentre);
    slideToMiddleAlong(copy, container);
    bandsToMiddleAcross(copy, container);
    return { copy, off: offCentre() };
  };
  const [asPacked, reordered] = [settle(false), keepOrder ? null : settle(true)];
  const best = reordered && reordered.off < asPacked.off - 0.01 && floorHolds(reordered.copy, container) ? reordered.copy : asPacked.copy;
  pieces.forEach((piece, index) => {
    piece.x = best[index]?.x ?? piece.x;
    piece.z = best[index]?.z ?? piece.z;
  });
}

/** A stretch of floor that carries more than the container's floor is rated for. */
export interface FloorOverload {
  /** The cargo lines standing on the stretch, by name. */
  names: string[];
  /** Where the stretch starts and how long it is, in mm from the front wall. */
  fromMm: number;
  lengthMm: number;
  /** The weight resting on the stretch, in kg. */
  weightKg: number;
  /** In tonnes per running metre: the heaviest cross-section of a stretch judged per metre, the average of one weighed by its length. */
  tonnesPerMetre: number;
  /** The length of floor that weight must be spread over to stay within the limit, in mm; 0 when no length of this floor carries it. */
  spreadMm: number;
  /** For cargo weighed by the length it rests on: what the floor carries on the length of the stretch, in kg. */
  allowedKg?: number;
}

/** A stack of cargo as the floor carries it: the stretch of floor it rests on, in mm from the front wall, and its weight. */
export interface Rest {
  from: number;
  to: number;
  weightKg: number;
}

/** Each stack as the stretch of floor it rests on (the part on the floor), with its weight and the name of its cargo, from the front wall on. */
const restsOf = (pieces: PlacedPiece[], container: ContainerSpec): (Rest & { name: string })[] =>
  stacksOf(pieces)
    .flatMap((stack) => {
      const base = stack.find((p) => p.y === 0);
      if (!base) return [];
      const [from, to] = [Math.max(0, base.z), Math.min(container.internalL, base.z + base.length)];
      return to > from ? [{ from, to, weightKg: weightOf(stack), name: base.name || "Cargo" }] : [];
    })
    .sort((a, b) => a.from - b.from);

/** Cargo standing end to end or side by side rests on the floor as one: the unbroken stretches of the cargo resting so (`rests` from the front wall on). */
function stretchesOf(rests: readonly Rest[]): Rest[] {
  const stretches: Rest[] = [];
  for (const rest of rests) {
    const last = stretches[stretches.length - 1];
    if (last && rest.from <= last.to) {
      last.to = Math.max(last.to, rest.to);
      last.weightKg += rest.weightKg;
    } else stretches.push({ from: rest.from, to: rest.to, weightKg: rest.weightKg });
  }
  return stretches;
}

/**
 * Whether the floor carries every stretch of cargo with beams 1 m beyond its ends: the most the
 * planner loads on a floor, the rule for a single piece applied to the cargo that stands together.
 */
export const floorHolds = (pieces: PlacedPiece[], container: ContainerSpec): boolean =>
  stretchesOf(restsOf(pieces, container)).every((s) => s.weightKg <= maxWeightWithBedding(container, s.to - s.from));

/**
 * An overloaded stretch of floor, before it is named: `perMetre` is the heaviest cross-section of a
 * stretch judged per metre (in kg per mm), `alone` the stack that is a point load on a flat rack.
 */
interface Overloaded<R extends Rest> extends Rest {
  perMetre?: number;
  alone?: R;
}

const sameExtent = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from === b.from && a.to === b.to;

/** The stretches of floor the cargo resting so overloads (see floorOverloads), from the front wall on; `rests` are its stacks, from the front wall on. */
function overloadedBy<R extends Rest>(rests: readonly R[], container: ContainerSpec): Overloaded<R>[] {
  const overTable = (s: Rest) => s.weightKg > maxWeightOn(container, s.to - s.from);
  if (container.group === "flat-rack") {
    // Cargo standing end to end rests on the rack as one.
    const together = stretchesOf(rests).filter(overTable);
    // A piece (or stack) too heavy for its own length is a point load, whatever stands beside it; when
    // the cargo beside it stands on the very same length, that stretch says it, with the weight of both.
    const alone = rests.filter((r) => overTable(r) && !together.some((s) => sameExtent(s, r))).map((r) => ({ from: r.from, to: r.to, weightKg: r.weightKg, alone: r }));
    return [...alone, ...together].sort((a, b) => a.from - b.from);
  }
  const limit = tonnesPerMetre(container); // 1 t/m is 1 kg/mm
  // The weight each stack puts on every mm of the floor it rests on.
  const perMm = rests.map((r) => r.weightKg / (r.to - r.from));
  const cuts = [...new Set(rests.flatMap((r) => [r.from, r.to]))].sort((a, b) => a - b);

  // The stretches over the rating per metre, each with its heaviest cross-section in kg per mm.
  const perMetre: (Overloaded<R> & { perMetre: number })[] = [];
  let open: (typeof perMetre)[number] | null = null;
  // The stacks over the cross-section, kept in the order of `rests` and added up in it: a stack joins
  // where it starts and leaves where it ends (`rests` go from the front wall on).
  let under: number[] = [];
  let next = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [from, to] = [cuts[i]!, cuts[i + 1]!];
    under = under.filter((k) => rests[k]!.to >= to);
    for (; next < rests.length && rests[next]!.from <= from; next++) if (rests[next]!.to >= to) under.push(next);
    let here = 0;
    for (const k of under) here += perMm[k]!;
    if (here <= limit + 1e-9) {
      open = null;
      continue;
    }
    if (!open) {
      open = { from, to, weightKg: 0, perMetre: 0 };
      perMetre.push(open);
    }
    open.to = to;
    open.weightKg += here * (to - from);
    open.perMetre = Math.max(open.perMetre, here);
  }
  // A whole stretch over the table, unless it is the very stretch already found over the rating per metre.
  const long = stretchesOf(rests).filter((s) => overTable(s) && !perMetre.some((o) => sameExtent(o, s)));
  return [...perMetre, ...long].sort((a, b) => a.from - b.from);
}

/**
 * Where the floor is overloaded. A wooden or steel floor is rated in tonnes per running metre across
 * its whole width, so pieces standing side by side count together: at every cross-section the
 * weight per metre of each stack standing there is added up (a stack spreads its weight evenly over
 * its own length). Neighbouring cross-sections over the limit make one stretch. Over a longer
 * length a floor carries less than its rating per metre (the carrier's table), so every unbroken
 * stretch of cargo is also weighed against what the floor carries on that length. The cargo of an
 * overloaded stretch needs bedding (timber under it, along the container) or more floor: `spreadMm`
 * in all.
 *
 * A flat rack is not rated per metre but by the length the cargo rests on: there every piece (or
 * stack) and every unbroken stretch of cargo is weighed against what the rack carries on that length.
 */
export function floorOverloads(load: ContainerLoad): FloorOverload[] {
  const { container } = load;
  const rests = restsOf(load.pieces, container);
  // A stretch is the cargo resting on it; a point load, its own stack.
  const namesOn = (o: Overloaded<(typeof rests)[number]>) => (o.alone ? [o.alone.name] : [...new Set(rests.filter((r) => r.from < o.to && r.to > o.from).map((r) => r.name))]);
  return overloadedBy(rests, container).map((o) => ({
    names: namesOn(o),
    fromMm: o.from,
    lengthMm: o.to - o.from,
    weightKg: Math.round(o.weightKg),
    tonnesPerMetre: o.perMetre ?? o.weightKg / (o.to - o.from),
    spreadMm: restingNeeded(container, o.weightKg) ?? 0,
    ...(o.perMetre === undefined ? { allowedKg: maxWeightOn(container, o.to - o.from) } : {}),
  }));
}

/** How much more floor than an overloaded stretch its weight must be spread over, in mm: the bedding it needs. */
const beddingFor = (container: ContainerSpec, o: Rest): number => Math.max(0, (restingNeeded(container, o.weightKg) ?? 0) - (o.to - o.from));

/** The bedding an overloaded stretch needs: how much more floor than the stretch its weight must be spread over, in mm. */
export const beddingOf = (overload: FloorOverload): number => Math.max(0, overload.spreadMm - overload.lengthMm);

/**
 * The bedding cargo resting on the floor so needs, in mm in all: the bedding of every stretch of
 * floor the plan would warn about (floorOverloads). The planner weighs a place for a heavy piece by it.
 * `rests`: the stacks, from the front wall on.
 */
export const beddingNeeded = (rests: readonly Rest[], container: ContainerSpec): number =>
  overloadedBy(rests, container).reduce((total, o) => total + beddingFor(container, o), 0);
