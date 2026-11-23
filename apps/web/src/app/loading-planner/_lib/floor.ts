// The floor of one container as a set of free rectangles ("MaxRects"): the free rectangles overlap,
// and each is as large as it can be. Placing a piece cuts every free rectangle it touches.
// x runs across the container, z along it; both start at 0 in one corner.

export interface Rect {
  x: number;
  z: number;
  width: number;
  length: number;
}

export interface Floor {
  length: number;
  width: number;
  free: Rect[];
}

export interface Spot {
  x: number;
  z: number;
  /** How snugly the piece fits the free rectangle; lower is better. */
  score: number;
}

export const newFloor = (length: number, width: number): Floor => ({ length, width, free: [{ x: 0, z: 0, width, length }] });

/**
 * The best free place for a piece of this size, or null when there is none. A piece wider or longer
 * than the floor (flat racks only) needs the floor's whole width or length and is centred on it,
 * so its x or z comes out negative.
 */
export function findSpot(floor: Floor, length: number, width: number): Spot | null {
  const needLength = Math.min(length, floor.length);
  const needWidth = Math.min(width, floor.width);
  let best: (Spot & { rect: Rect }) | null = null;

  for (const rect of floor.free) {
    if (needLength > rect.length || needWidth > rect.width) continue;
    // Best short side fit; ties go to the rectangle nearest the start corner.
    const score = Math.min(rect.width - needWidth, rect.length - needLength);
    const better = !best || score < best.score || (score === best.score && (rect.z < best.rect.z || (rect.z === best.rect.z && rect.x < best.rect.x)));
    if (better) best = { x: rect.x, z: rect.z, score, rect };
  }
  if (!best) return null;
  return { x: best.x + (needWidth - width) / 2, z: best.z + (needLength - length) / 2, score: best.score };
}

/** Marks the part of the floor under a piece as used. */
export function occupy(floor: Floor, spot: Spot, length: number, width: number): void {
  const x0 = Math.max(0, spot.x);
  const z0 = Math.max(0, spot.z);
  const x1 = Math.min(floor.width, spot.x + width);
  const z1 = Math.min(floor.length, spot.z + length);

  const next: Rect[] = [];
  for (const rect of floor.free) {
    const rx1 = rect.x + rect.width;
    const rz1 = rect.z + rect.length;
    const apart = x0 >= rx1 || x1 <= rect.x || z0 >= rz1 || z1 <= rect.z;
    if (apart) {
      next.push(rect);
      continue;
    }
    if (x0 > rect.x) next.push({ x: rect.x, z: rect.z, width: x0 - rect.x, length: rect.length });
    if (x1 < rx1) next.push({ x: x1, z: rect.z, width: rx1 - x1, length: rect.length });
    if (z0 > rect.z) next.push({ x: rect.x, z: rect.z, width: rect.width, length: z0 - rect.z });
    if (z1 < rz1) next.push({ x: rect.x, z: z1, width: rect.width, length: rz1 - z1 });
  }
  // Keep only the rectangles no other rectangle contains.
  const inside = (a: Rect, b: Rect) => a.x >= b.x && a.z >= b.z && a.x + a.width <= b.x + b.width && a.z + a.length <= b.z + b.length;
  floor.free = next.filter((a, i) => !next.some((b, j) => i !== j && inside(a, b) && (!inside(b, a) || j < i)));
}
