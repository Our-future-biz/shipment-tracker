import { hasGauge, openTopTakes } from "@/lib/oogGauge";
import { CONTAINERS, containersWith, maxCargoKg, maxWeightWithBedding, NO_CLEARANCE, type PlanRules, passHeight, passWidth, tooHeavyToStuff, usableLength, type Clearance, type ContainerSpec } from "./containers";

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
  /** The shipment the line belongs to in a box plan (its job number): what its pieces may be coloured by. It changes nothing in the plan. */
  group?: string;
  /** The line's dangerous goods as its UN number and class, and how it is to be lashed (Council Outlay 14, P11): shown and printed; the plan only warns when classes share a container. */
  un?: string;
  dgClass?: string;
  lashing?: string;
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
 *   with the clearance the container carries left free. A piece too heavy to be stuffed through a
 *   door (the company's rule) is not taken either.
 * - An open top is loaded from above: the height is free, the piece must fit the floor and pass the
 *   roof opening, which is narrower and shorter than the floor - or pass the doors. The openings are
 *   the app's one out-of-gauge table's (@/lib/oogGauge), the same a quote is judged by; a hard-top,
 *   which that table does not hold, opens over its whole floor.
 * - A flat rack takes any piece lengthwise, overhanging its sides or ends; crosswise only when the
 *   piece stays on the platform.
 * - No container takes a piece heavier than its payload, or heavier than its floor carries on the
 *   length the piece rests on, counting the beams the carrier allows under it (maxWeightWithBedding).
 */
const roofTakes = (container: ContainerSpec, fp: Footprint, heightMm: number): boolean =>
  !hasGauge(container.name) || openTopTakes(container.name, { length: fp.length / 10, width: fp.width / 10, height: heightMm / 10 }) !== null;

export function fitIn(container: ContainerSpec, line: CargoLine): Footprint[] {
  if (line.weightKg > maxCargoKg(container)) return [];
  const carried = (fp: Footprint) => line.weightKg <= maxWeightWithBedding(container, fp.length);
  const onFloor = (fp: Footprint, maxWidth: number) => fp.length <= usableLength(container) && fp.width <= maxWidth && carried(fp);

  if (container.group === "flat-rack") {
    return footprints(line).filter((fp) => carried(fp) && (!fp.crosswise || onFloor(fp, container.internalW)));
  }
  const maxWidth = passWidth(container);
  if (container.group === "open-top") return footprints(line).filter((fp) => onFloor(fp, maxWidth) && roofTakes(container, fp, line.heightMm));

  if (line.heightMm > passHeight(container)) return [];
  if (tooHeavyToStuff(container, line.weightKg, Math.max(line.lengthMm, line.widthMm))) return [];
  return footprints(line).filter((fp) => onFloor(fp, maxWidth));
}

export interface Gauge {
  overLength: boolean;
  overWidth: boolean;
  overHeight: boolean;
}

// The largest piece a standard container takes: the length of the 40' (of the 45' HQ when that is
// nominated) and the high-cube door.
const STANDARD = CONTAINERS.filter((c) => c.group === "standard");
const MAX_LENGTH = Math.max(...STANDARD.filter((c) => !c.onRequest).map((c) => c.internalL));
const MAX_LENGTH_ON_REQUEST = Math.max(...STANDARD.map((c) => c.internalL));
const MAX_WIDTH = Math.max(...STANDARD.map((c) => c.doorW ?? 0));
const MAX_HEIGHT = Math.max(...STANDARD.map((c) => c.doorH ?? 0));

/** Where a piece is out of gauge, measured against the largest standard container less the clearance to leave free. */
export function gaugeOf(line: CargoLine, clearance: Clearance = NO_CLEARANCE, with45 = false): Gauge {
  const long = Math.max(line.lengthMm, line.widthMm);
  const short = Math.min(line.lengthMm, line.widthMm);
  return {
    overLength: long > (with45 ? MAX_LENGTH_ON_REQUEST : MAX_LENGTH) - clearance.lengthMm,
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

/**
 * The cargo table's word on a line: "Fits" when a standard container takes the piece, else what it
 * is too much of. A piece of the right size can still be too heavy: for the floor on the length it
 * rests on, or for the weight the company moves out of standard containers.
 */
export function standardLabel(line: CargoLine, rules?: PlanRules, with45 = false): string {
  const size = fitLabel(gaugeOf(line, rules?.clearance, with45));
  if (size !== "Fits") return size;
  const standard = containersWith(rules).filter((c) => c.group === "standard" && (with45 || !c.onRequest));
  return standard.some((c) => fitIn(c, line).length > 0) ? "Fits" : "Too heavy";
}

