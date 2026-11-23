import { beddingMm, CONTAINERS, type ContainerSpec } from "./containers";

/** One line of the cargo list. Sizes in mm, weight in kg per piece. */
export interface CargoLine {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  colli: number;
  /** May also be loaded crosswise. When false the piece goes long side along the container. */
  canTurn: boolean;
  stackable: boolean;
}

/** How a piece sits on the floor: `length` runs along the container. */
export interface Footprint {
  length: number;
  width: number;
  /** True when the piece sits crosswise (its short side along the container). */
  crosswise: boolean;
}

/**
 * The ways a piece may sit on a floor. Lengthwise (long side along the container) comes first;
 * which side was typed as "length" does not matter. A piece is never tipped onto its side.
 */
export function footprints(line: CargoLine): Footprint[] {
  const long = Math.max(line.lengthMm, line.widthMm);
  const short = Math.min(line.lengthMm, line.widthMm);
  const ways: Footprint[] = [{ length: long, width: short, crosswise: false }];
  if (line.canTurn && long !== short) ways.push({ length: short, width: long, crosswise: true });
  return ways;
}

/**
 * The ways a piece may sit in this container; empty when the container cannot take it.
 *
 * - A standard container is loaded through its door: the piece must pass the door and fit inside.
 * - An open top is loaded from above: the height is free, the piece must fit the floor.
 * - A flat rack takes any piece lengthwise, overhanging its sides or ends; crosswise only when the
 *   piece stays on the platform.
 * - No container takes a piece so heavy that bedding as long as its whole floor would not carry it.
 */
export function fitIn(container: ContainerSpec, line: CargoLine): Footprint[] {
  if (line.weightKg > container.payloadKg) return [];
  if (beddingMm(line.weightKg, container) > container.internalL) return [];
  const onFloor = (fp: Footprint, maxWidth: number) => fp.length <= container.internalL && fp.width <= maxWidth;

  if (container.group === "flat-rack") {
    return footprints(line).filter((fp) => !fp.crosswise || onFloor(fp, container.internalW));
  }
  const maxWidth = Math.min(container.internalW, container.doorW ?? container.internalW);
  if (container.group === "open-top") return footprints(line).filter((fp) => onFloor(fp, maxWidth));

  const maxHeight = Math.min(container.internalH, container.doorH ?? container.internalH);
  if (line.heightMm > maxHeight) return [];
  return footprints(line).filter((fp) => onFloor(fp, maxWidth));
}

export interface Gauge {
  overLength: boolean;
  overWidth: boolean;
  overHeight: boolean;
}

// The largest piece a standard container takes: the 45' HQ's length and the high-cube door.
const STANDARD = CONTAINERS.filter((c) => c.group === "standard");
const MAX_LENGTH = Math.max(...STANDARD.map((c) => c.internalL));
const MAX_WIDTH = Math.max(...STANDARD.map((c) => c.doorW ?? 0));
const MAX_HEIGHT = Math.max(...STANDARD.map((c) => c.doorH ?? 0));

/** Where a piece is out of gauge, measured against the largest standard container. */
export function gaugeOf(line: CargoLine): Gauge {
  const long = Math.max(line.lengthMm, line.widthMm);
  const short = Math.min(line.lengthMm, line.widthMm);
  return { overLength: long > MAX_LENGTH, overWidth: short > MAX_WIDTH, overHeight: line.heightMm > MAX_HEIGHT };
}

export function gaugeLabel(gauge: Gauge): string {
  const over = [gauge.overLength && "Length", gauge.overWidth && "Width", gauge.overHeight && "Height"].filter(Boolean);
  return over.length === 0 ? "In Gauge" : `Over ${over.join(" + ")}`;
}
