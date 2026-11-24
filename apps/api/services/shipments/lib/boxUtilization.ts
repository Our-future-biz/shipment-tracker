// How full a Co-Loading Concept sailing's box is (Council Outlay 12): the cargo of its linked
// shipments against what its container type takes, by volume and by weight. Pure: the service reads
// the sailing and its shipments, this works the figures out.
//
// A shipment's figures are the ones its own page shows (dimensionFiguresFilled: its cargo dimension
// lines, a figure they lack from its typed totals). A cancelled shipment stays listed and is not
// counted. A shipment without a weight or a volume counts as zero and is named: a total with gaps
// says so. Over the limit is a state to show, never an error.

import type { ContainerCapacity } from "../../../lib/containerCapacity";
import type { BoxFill, BoxMeter, BoxMeterState, BoxUtilization, BoxUtilizationRow } from "../interfaces/interfaces";
import { NOT_STACKABLE } from "./cargoProjection";
import { dimensionFiguresFilled } from "./remeasureNotice";

/** A meter turns "nearly full" from this share of its limit (decision D9: as Warehouse and Trucking). */
export const NEARLY_FULL_PCT = 90;

/** A linked shipment as the box's fill reads it. */
export interface BoxShipment {
  id: string;
  jobNumber: string;
  customer: string;
  status: string;
  /** The shipment is cancelled (its status says so): listed, not counted. */
  cancelled: boolean;
  /** Why it is an odd one in this box (lib/coLoadingSailing oddInBox): "Air Freight", "Full Load"; null when it belongs. */
  odd: string | null;
  dangerous: string;
  outOfGauge: string;
  temperatureControlled: string;
  pcs: string | null;
  totalWeightTons: string | null;
  totalVolumeCbm: string | null;
  cargoDimensions: { pieces: string; lengthCm: string; widthCm: string; heightCm: string; weightPerPcKg: string; volumePerPcM3: string | null; stackable: string; adrUn?: string | null; adrClass?: string | null; packageType?: string }[];
}

/**
 * The dangerous goods a shipment's cargo lines name, each once: "UN 1263 · class 3", or one of the
 * two alone where a line gives only that. Empty when no line names any.
 */
export function adrOf(lines: readonly { adrUn?: string | null; adrClass?: string | null }[]): string[] {
  const named = lines.map((l) => [l.adrUn?.trim() ? `UN ${l.adrUn.trim()}` : "", l.adrClass?.trim() ? `class ${l.adrClass.trim()}` : ""].filter(Boolean).join(" · ")).filter(Boolean);
  return [...new Set(named)];
}

/** The dangerous-goods classes among these marks ("UN 1263 · class 3" → "3"), each once, in order. */
export const adrClassesOf = (adr: readonly string[]): string[] => [...new Set(adr.flatMap((a) => /class (\S+)/.exec(a)?.[1] ?? []))].sort();

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const yes = (v: string) => v.trim().toLowerCase() === "yes";

/**
 * A share of a limit as a whole percentage that never claims more than is true: 99.6% is 99, not
 * 100, and anything over the limit is at least 101 (rounded to the nearest from there).
 */
export function wholePct(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  const pct = (used / limit) * 100;
  return pct > 100 ? Math.max(101, Math.round(pct)) : Math.floor(pct + 1e-9);
}

/** One meter: what is used of a limit, and of the most the box can ever take. */
export function meterOf(used: number, limit: number, max: number, decimals: number): BoxMeter {
  const pct = wholePct(used, limit);
  let state: BoxMeterState = "room";
  if (used > max) state = "beyond";
  else if (used > limit) state = "over";
  else if (pct >= NEARLY_FULL_PCT) state = "nearly_full";
  return { used: round(used, decimals), limit, max, pct, free: round(limit - used, decimals), state };
}

/** A density no cargo has: most often kilograms typed where tonnes were asked, or the other way round. */
const oddDensity = (weightKg: number, volumeCbm: number) => weightKg > 0 && volumeCbm > 0 && (weightKg / volumeCbm > 3000 || weightKg / volumeCbm < 20);

/** What a company and a service add to a box's own capacity. */
export interface BoxPlanning {
  /** The share of the inside volume planned with, in whole percent: what `capacity.planningCbm` was worked out with. */
  planningPct: number;
  /** The service's lower cargo weight for the inland leg, in kg per container; null for none. */
  inlandWeightKg: number | null;
  /** How many containers the sailing has: `capacity` is already theirs together (lib/containerCapacity capacityOf). */
  containers: number;
}

/**
 * The fill of a box. `capacity` is null for a container type the capacity table does not have. An
 * inland weight below the box's own limit becomes the limit of the weight meter: the box is full
 * when the road or rail leg is.
 */
export function boxUtilization(containerType: string, capacity: ContainerCapacity | null, shipments: readonly BoxShipment[], planning: BoxPlanning): BoxUtilization {
  // The inland weight is a container's: together the containers carry that many times it.
  const inlandAll = planning.inlandWeightKg === null ? null : planning.inlandWeightKg * planning.containers;
  const inlandKg = capacity && inlandAll !== null && inlandAll < capacity.standardKg ? inlandAll : null;
  const volumeLimit = capacity?.planningCbm ?? null;
  const weightLimit = capacity ? (inlandKg ?? capacity.standardKg) : null;

  const rows: BoxUtilizationRow[] = shipments.map((s) => {
    const figures = dimensionFiguresFilled(s);
    const counted = !s.cancelled;
    const weightKg = round(figures.weightKg, 1);
    const volumeCbm = round(figures.volumeCbm, 3);
    const tooBig = capacity !== null && (weightKg > capacity.maxKg || (capacity.insideCbm !== null && volumeCbm > capacity.insideCbm));
    return {
      shipmentId: s.id,
      jobNumber: s.jobNumber,
      customer: s.customer,
      status: s.status,
      counted,
      colli: figures.colli,
      weightKg,
      volumeCbm,
      freightTons: round(Math.max(weightKg / 1000, volumeCbm), 3),
      weightMissing: !(weightKg > 0),
      volumeMissing: !(volumeCbm > 0),
      weightSharePct: weightLimit ? round((weightKg / weightLimit) * 100, 1) : null,
      volumeSharePct: volumeLimit ? round((volumeCbm / volumeLimit) * 100, 1) : null,
      notStackable: s.cargoDimensions.some((d) => d.stackable === NOT_STACKABLE),
      // A line that names a UN number or a class makes it dangerous cargo too, whatever the shipment's own tick says.
      dangerous: yes(s.dangerous) || adrOf(s.cargoDimensions).length > 0,
      adr: adrOf(s.cargoDimensions),
      outOfGauge: yes(s.outOfGauge),
      temperatureControlled: yes(s.temperatureControlled),
      odd: s.odd,
      implausible: tooBig || oddDensity(weightKg, volumeCbm),
    };
  });

  const counted = rows.filter((r) => r.counted);
  const sum = (pick: (r: BoxUtilizationRow) => number) => counted.reduce((total, r) => total + pick(r), 0);
  const weightKg = round(sum((r) => r.weightKg), 1);
  const volumeCbm = round(sum((r) => r.volumeCbm), 3);

  const volume = capacity && capacity.planningCbm !== null && capacity.insideCbm !== null ? meterOf(volumeCbm, capacity.planningCbm, capacity.insideCbm, 3) : null;
  const weight = capacity && weightLimit !== null ? meterOf(weightKg, weightLimit, capacity.maxKg, 1) : null;
  const fuller = volume && weight ? (volume.pct > weight.pct ? "volume" : "weight") : volume ? "volume" : weight ? "weight" : null;
  const fullPct = fuller === "volume" ? volume!.pct : fuller === "weight" ? weight!.pct : null;

  // Biggest share of the box first: the candidates to leave behind when it is over.
  const share = (r: BoxUtilizationRow) => Math.max(r.weightSharePct ?? 0, r.volumeSharePct ?? 0, 0);
  rows.sort((a, b) => Number(b.counted) - Number(a.counted) || share(b) - share(a) || b.volumeCbm - a.volumeCbm || a.jobNumber.localeCompare(b.jobNumber));

  return {
    containerType,
    capacity: capacity ? { ...capacity, inlandKg, planningPct: planning.planningPct, containers: planning.containers } : null,
    volume,
    weight,
    fullPct,
    // With nothing loaded neither limit is the nearer one.
    limitedBy: counted.length > 0 && fullPct !== null && fullPct > 0 ? fuller : null,
    totals: {
      shipments: counted.length,
      colli: sum((r) => r.colli),
      weightKg,
      volumeCbm,
      freightTons: round(sum((r) => r.freightTons), 3),
    },
    missing: {
      weight: counted.filter((r) => r.weightMissing).length,
      volume: counted.filter((r) => r.volumeMissing).length,
    },
    notCounted: rows.length - counted.length,
    rows,
  };
}

/** A box's fill in short, for a list of sailings. */
export function boxFillOf(box: BoxUtilization): BoxFill {
  const short = (meter: BoxMeter | null) => (meter ? { pct: meter.pct, state: meter.state } : null);
  return {
    volume: short(box.volume),
    weight: short(box.weight),
    fullPct: box.fullPct,
    shipments: box.totals.shipments,
    missing: box.rows.filter((r) => r.counted && (r.weightMissing || r.volumeMissing)).length,
  };
}
