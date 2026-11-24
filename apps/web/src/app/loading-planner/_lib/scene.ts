import { balanceLimits, balanceOf } from "./balance";
import type { ContainerLoad, PlacedPiece } from "./plan";

// The 3D picture of a load, in metres. The axes of the picture: X runs along the container, Y up,
// Z across it; the corner the planner measures from is the origin.

export interface SceneBox {
  piece: PlacedPiece;
  /** The middle of the box. */
  centre: [number, number, number];
  size: [number, number, number];
}

export interface SceneFloor {
  length: number;
  width: number;
  /** Height of the walls (or of a flat rack's end walls). */
  height: number;
}

export interface SceneBalance {
  /** Where the weight sits on the floor. */
  cog: [number, number];
  /** The area around the middle the centre of gravity must stay in: half its length and width. */
  tolerance: [number, number];
  ok: boolean;
}

const m = (mm: number) => mm / 1000;

/**
 * A piece by its cargo line and place: it stays the same piece when the plan is worked out again.
 * Kept here, not beside the 3D view, so the page names a piece without loading the 3D library.
 */
export const pieceKey = (piece: PlacedPiece): string => `${piece.lineId}|${piece.x}|${piece.y}|${piece.z}`;

export const sceneFloor = (load: ContainerLoad): SceneFloor => ({
  length: m(load.container.internalL),
  width: m(load.container.internalW),
  height: m(load.container.internalH),
});

export const sceneBoxes = (load: ContainerLoad): SceneBox[] =>
  load.pieces.map((piece) => ({
    piece,
    centre: [m(piece.z + piece.length / 2), m(piece.y + piece.height / 2), m(piece.x + piece.width / 2)],
    size: [m(piece.length), m(piece.height), m(piece.width)],
  }));

export function sceneBalance(load: ContainerLoad): SceneBalance {
  const balance = balanceOf(load.pieces, load.container);
  const limits = balanceLimits(load.container);
  return {
    cog: [m(balance.cogZ), m(balance.cogX)],
    tolerance: [m(limits.alongMm), m(limits.acrossMm)],
    ok: balance.ok,
  };
}

/** The far corners of everything drawn: the container and whatever sticks out of it. */
export function sceneBounds(load: ContainerLoad): { min: [number, number, number]; max: [number, number, number] } {
  const floor = sceneFloor(load);
  const boxes = sceneBoxes(load);
  const low = (axis: 0 | 1 | 2) => Math.min(0, ...boxes.map((b) => b.centre[axis] - b.size[axis] / 2));
  const high = (axis: 0 | 1 | 2, edge: number) => Math.max(edge, ...boxes.map((b) => b.centre[axis] + b.size[axis] / 2));
  return { min: [low(0), 0, low(2)], max: [high(0, floor.length), high(1, floor.height), high(2, floor.width)] };
}

export type CameraView = "perspective" | "top" | "side" | "front";

/**
 * Where the camera stands for a view, looking at the middle of everything drawn: as near as shows
 * all of it in a picture `aspect` times as wide as it is high, through a 45° lens.
 */
export function cameraFor(view: CameraView, load: ContainerLoad, aspect = 2): { position: [number, number, number]; target: [number, number, number] } {
  const { min, max } = sceneBounds(load);
  const target: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const [length, height, width] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const [x, y, z] = target;

  // How far back a picture `across` wide and `up` high needs the camera, measured from its near face.
  const halfLens = Math.tan((45 / 2) * (Math.PI / 180));
  const back = (across: number, up: number, depth: number) => Math.max(up / 2 / halfLens, across / 2 / (halfLens * Math.max(aspect, 0.1))) * 1.1 + depth / 2;

  switch (view) {
    case "top":
      // A hair off straight down, so "up" on screen stays the far side of the container.
      return { position: [x, y + back(length, width, height), z + 0.001], target };
    case "side":
      return { position: [x, y, z + back(length, height, width)], target };
    case "front":
      return { position: [x - back(width, height, length), y, z], target };
    default: {
      // Seen from a corner, the picture is about as wide as the length and half the width together,
      // and its near end comes much closer than its middle: stand well back.
      const reach = back(length * 0.9 + width * 0.5, height + width * 0.6, 0) * 1.9;
      return { position: [x - reach * 0.45, y + reach * 0.5, z + reach * 0.75], target };
    }
  }
}
