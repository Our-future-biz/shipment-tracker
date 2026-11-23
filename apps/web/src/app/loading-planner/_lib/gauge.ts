import { CONTAINERS, maxCargoKg, NO_CLEARANCE, passHeight, passWidth, usableLength, type Clearance, type ContainerSpec } from "./containers";

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
  /** Dangerous goods, as the job says. Shown beside the line; it changes nothing in the plan. */
  dg?: boolean;
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
 * - A standard container is loaded through its door: the piece must pass the door and fit inside,
 *   with the clearance the container carries left free.
 * - An open top is loaded from above: the height is free, the piece must fit the floor.
 * - A flat rack takes any piece lengthwise, overhanging its sides or ends; crosswise only when the
 *   piece stays on the platform.
 * - No container takes a piece heavier than its payload, or than its floor carries over its whole length.
 */
export function fitIn(container: ContainerSpec, line: CargoLine): Footprint[] {
  if (line.weightKg > maxCargoKg(container)) return [];
  const onFloor = (fp: Footprint, maxWidth: number) => fp.length <= usableLength(container) && fp.width <= maxWidth;

  if (container.group === "flat-rack") {
    return footprints(line).filter((fp) => !fp.crosswise || onFloor(fp, container.internalW));
  }
  const maxWidth = passWidth(container);
  if (container.group === "open-top") return footprints(line).filter((fp) => onFloor(fp, maxWidth));

  if (line.heightMm > passHeight(container)) return [];
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

/** Where a piece is out of gauge, measured against the largest standard container less the clearance to leave free. */
export function gaugeOf(line: CargoLine, clearance: Clearance = NO_CLEARANCE): Gauge {
  const long = Math.max(line.lengthMm, line.widthMm);
  const short = Math.min(line.lengthMm, line.widthMm);
  return {
    overLength: long > MAX_LENGTH - clearance.lengthMm,
    overWidth: short > MAX_WIDTH - clearance.doorWidthMm,
    overHeight: line.heightMm > MAX_HEIGHT - clearance.doorHeightMm,
  };
}

/**
 * Whether a standard container takes the piece through its doors, in the cargo table's words:
 * "Fits", or what it is too much of. ("Out of gauge" is kept for a container whose cargo sticks out.)
 */
export function fitLabel(gauge: Gauge): string {
  const over = [gauge.overLength && "long", gauge.overWidth && "wide", gauge.overHeight && "high"].filter(Boolean);
  return over.length === 0 ? "Fits" : `Too ${over.join(" + too ")}`;
}
