import { beddingMm, type ContainerSpec } from "./containers";
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
    stacks.set(key, [...(stacks.get(key) ?? []), piece]);
  }
  return [...stacks.values()];
};

const weightOf = (stack: PlacedPiece[]) => stack.reduce((total, p) => total + p.weightKg, 0);

const swapPlaces = (a: PlacedPiece[], b: PlacedPiece[]) => {
  const [ax, az, bx, bz] = [a[0]?.x ?? 0, a[0]?.z ?? 0, b[0]?.x ?? 0, b[0]?.z ?? 0];
  for (const p of a) [p.x, p.z] = [bx, bz];
  for (const p of b) [p.x, p.z] = [ax, az];
};

/**
 * Puts the heavy part of a load in the middle of its length. The floor is cut across wherever no
 * piece lies over the cut; the bands between the cuts can change places without anything colliding.
 * The heaviest band goes in the middle, each next one to the lighter end. A load with a piece overhanging
 * the ends is left as it is.
 */
function heavyBandsToMiddle(pieces: PlacedPiece[], container: ContainerSpec): void {
  if (pieces.some((p) => p.z < 0 || p.z + p.length > container.internalL)) return;

  const bands: { start: number; end: number; pieces: PlacedPiece[] }[] = [];
  for (const piece of [...pieces].sort((a, b) => a.z - b.z)) {
    const last = bands[bands.length - 1];
    if (last && piece.z < last.end) {
      last.end = Math.max(last.end, piece.z + piece.length);
      last.pieces.push(piece);
    } else {
      bands.push({ start: piece.z, end: piece.z + piece.length, pieces: [piece] });
    }
  }
  if (bands.length < 3) return;

  const [heaviest, ...rest] = [...bands].sort((a, b) => weightOf(b.pieces) - weightOf(a.pieces));
  if (!heaviest) return;
  const front: typeof bands = [];
  const back: typeof bands = [];
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

/** Swaps stacks that cover the same floor area (so nothing can collide), heavier ones to the middle. */
function swapEqualStacks(pieces: PlacedPiece[], offCentre: () => number): void {
  const stacks = stacksOf(pieces);
  const sameFloor = (a: PlacedPiece[], b: PlacedPiece[]) => a[0]?.length === b[0]?.length && a[0]?.width === b[0]?.width;
  for (let round = 0; round < stacks.length; round++) {
    let best: { a: PlacedPiece[]; b: PlacedPiece[]; off: number } | null = null;
    const now = offCentre();
    stacks.forEach((a, i) => {
      for (const b of stacks.slice(i + 1)) {
        if (!sameFloor(a, b) || weightOf(a) === weightOf(b)) continue;
        swapPlaces(a, b);
        const off = offCentre();
        swapPlaces(a, b);
        if (off < (best?.off ?? now) - 0.01) best = { a, b, off };
      }
    });
    if (!best) break;
    const { a, b } = best as { a: PlacedPiece[]; b: PlacedPiece[] };
    swapPlaces(a, b);
  }
}

/** Slides the whole load as far towards the middle as the free floor allows. */
function slideToMiddle(pieces: PlacedPiece[], container: ContainerSpec): void {
  // A piece overhanging the floor is already centred, so that direction stays.
  const balance = balanceOf(pieces, container);
  const slide = (wanted: number, starts: number[], ends: number[], floorSize: number) => {
    const least = -Math.min(...starts);
    const most = floorSize - Math.max(...ends);
    return least > most ? 0 : Math.round(Math.min(most, Math.max(least, wanted)));
  };
  const dx = slide(container.internalW / 2 - balance.cogX, pieces.map((p) => p.x), pieces.map((p) => p.x + p.width), container.internalW);
  const dz = slide(container.internalL / 2 - balance.cogZ, pieces.map((p) => p.z), pieces.map((p) => p.z + p.length), container.internalL);
  for (const piece of pieces) {
    piece.x += dx;
    piece.z += dz;
  }
}

/**
 * Brings the centre of gravity of a load towards the middle of the floor, in place. Two ways are
 * tried and the better one kept: the load as it was packed, and the load with its heavy part moved
 * to the middle of its length. Either way equal-sized stacks then change places, heavier ones to
 * the middle, and the whole load slides as far as the free floor allows.
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
    // Slide first, so a swap is judged on the load where it will stand, then slide what the swaps moved.
    slideToMiddle(copy, container);
    swapEqualStacks(copy, offCentre);
    slideToMiddle(copy, container);
    return { copy, off: offCentre() };
  };
  const [asPacked, reordered] = [settle(false), settle(true)];
  const best = reordered.off < asPacked.off - 0.01 ? reordered.copy : asPacked.copy;
  pieces.forEach((piece, index) => {
    piece.x = best[index]?.x ?? piece.x;
    piece.z = best[index]?.z ?? piece.z;
  });
}

export interface BeddingNeed {
  lineId: string;
  name: string;
  /** The load the stack puts on the floor as it stands, in tonnes per running metre. */
  tonnesPerMetre: number;
  /** The length the weight must be spread over to stay within the floor's limit, in mm. */
  beddingMm: number;
}

/**
 * The stacks too heavy for the floor under their own length. They need bedding (timber under the
 * piece, along the container) at least `beddingMm` long. Each stack is judged on its own.
 */
export function beddingNeeds(load: ContainerLoad): BeddingNeed[] {
  const needs: BeddingNeed[] = [];
  for (const stack of stacksOf(load.pieces)) {
    const base = stack.find((p) => p.y === 0);
    if (!base) continue;
    const weight = weightOf(stack);
    const needed = beddingMm(weight, load.container);
    if (needed <= base.length) continue;
    needs.push({ lineId: base.lineId, name: base.name, tonnesPerMetre: weight / base.length, beddingMm: Math.ceil(needed) });
  }
  return needs;
}
