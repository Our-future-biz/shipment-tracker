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
 * Brings the centre of gravity of a load towards the middle of the floor, in place:
 * first by swapping stacks that cover the same floor area (so nothing can collide), heavier ones
 * to the middle, then by sliding the whole load as far as the free floor allows.
 */
export function centreLoad(pieces: PlacedPiece[], container: ContainerSpec): void {
  if (pieces.length === 0) return;
  const offCentre = () => {
    const balance = balanceOf(pieces, container);
    return Math.abs(balance.alongPct) + Math.abs(balance.acrossPct);
  };

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

  // Slide the load. A piece overhanging the floor is already centred, so that direction stays.
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
