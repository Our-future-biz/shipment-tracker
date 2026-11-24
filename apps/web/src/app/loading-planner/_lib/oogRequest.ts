import { gaugeMeasures } from "@/lib/oogGauge";
import { gaugeCheckOf, isOog } from "./loadStats";
import type { ContainerLoad } from "./plan";

// The out-of-gauge request of one container (Council Outlay 14, P10): what a carrier's form asks -
// how far the cargo stands out on each side, above and over each end, its weight and where its
// centre of gravity lies - as figures, and as text to copy into the form. Measured on the cargo as
// the plan stows it, against the in-gauge measures of the app's one out-of-gauge table. Indicative:
// the carrier's own equipment and its stowage planner decide.

export interface OogRequest {
  /** The container's place in the plan, from 1, and its type. */
  number: number;
  type: string;
  flatRack: boolean;
  colli: number;
  /** What the cargo is, each name once. */
  cargo: string[];
  /** The cargo as a whole, in cm: its length along the container, its width, its highest point above the floor. */
  overall: { length: number; width: number; height: number };
  /** What it is measured against, in cm. */
  inGauge: { length: number; width: number; height: number };
  /** What stands out, in whole cm; 0 where nothing does. Left and right across the floor; front is the front wall (a flat rack's left end wall), back the door end. */
  overWidth: { left: number; right: number };
  overHeight: number;
  overLength: { front: number; back: number };
  weightKg: number;
  /** With the empty container's weight: an estimate. */
  grossKg: number;
  /** The centre of gravity in cm: from the front wall (left end wall), from the left side, above the floor. */
  gravity: { fromFront: number; fromLeft: number; height: number };
  /** Slots lost around the container, counted as 20' slots; the table's figure, with the cargo taken as centred. */
  lostSlots: number;
}

const cm = (mm: number) => Math.round(mm / 10);
// To the nearest cm: the plan centres a piece to the millimetre, and 1 mm off is no centimetre more on one side.
const over = (mm: number) => Math.max(0, Math.round(mm / 10));

/**
 * The request of a load, or null: for a standard container, an empty one, a type the table does not
 * hold (the hard-tops) and cargo the table calls in gauge - there is nothing to request then.
 */
export function oogRequestOf(load: ContainerLoad, number: number): OogRequest | null {
  const { container, pieces } = load;
  const gauge = gaugeMeasures(container.name);
  const check = gaugeCheckOf(load);
  if (!gauge || !check || !isOog(check) || pieces.length === 0) return null;
  const minX = Math.min(...pieces.map((p) => p.x));
  const maxX = Math.max(...pieces.map((p) => p.x + p.width));
  const minZ = Math.min(...pieces.map((p) => p.z));
  const maxZ = Math.max(...pieces.map((p) => p.z + p.length));
  const top = Math.max(...pieces.map((p) => p.y + p.height));
  const midX = container.internalW / 2;
  const midZ = container.internalL / 2;
  const weight = pieces.reduce((sum, p) => sum + p.weightKg, 0);
  const at = (pick: (p: (typeof pieces)[number]) => number) => (weight > 0 ? pieces.reduce((sum, p) => sum + p.weightKg * pick(p), 0) / weight : 0);
  // An open top has walls: nothing stands out sideways or over an end, only above.
  const sides = gauge.flatRack;
  return {
    number,
    type: container.name,
    flatRack: gauge.flatRack,
    colli: pieces.length,
    cargo: [...new Set(pieces.map((p) => p.name || "Cargo"))],
    overall: { length: Math.ceil((maxZ - minZ) / 10), width: Math.ceil((maxX - minX) / 10), height: Math.ceil(top / 10) },
    inGauge: { length: gauge.length, width: gauge.width, height: gauge.height },
    overWidth: sides ? { left: over(midX - minX - gauge.width * 5), right: over(maxX - midX - gauge.width * 5) } : { left: 0, right: 0 },
    overHeight: over(top - gauge.height * 10),
    overLength: sides ? { front: over(midZ - minZ - gauge.length * 5), back: over(maxZ - midZ - gauge.length * 5) } : { front: 0, back: 0 },
    weightKg: Math.round(weight),
    grossKg: Math.round(weight + container.tareKg),
    gravity: { fromFront: cm(at((p) => p.z + p.length / 2)), fromLeft: cm(at((p) => p.x + p.width / 2)), height: cm(at((p) => p.y + p.height / 2)) },
    lostSlots: check.lost.total,
  };
}

const n = (value: number) => value.toLocaleString("en-US");

/** The request as text for a carrier's form or an e-mail: one fact a line, in cm and kg. */
export function oogRequestText(request: OogRequest, planName: string): string {
  const front = request.flatRack ? "left end" : "front wall";
  const back = request.flatRack ? "right end" : "door end";
  const lines = [
    "OUT-OF-GAUGE REQUEST",
    planName.trim() ? `Plan: ${planName.trim()}` : "",
    `Container: ${request.type} (no. ${request.number} of the plan)`,
    `Cargo: ${n(request.colli)} colli - ${request.cargo.join(", ")}`,
    `Cargo overall (L x W x H): ${n(request.overall.length)} x ${n(request.overall.width)} x ${n(request.overall.height)} cm`,
    `In gauge up to (L x W x H): ${n(request.inGauge.length)} x ${n(request.inGauge.width)} x ${n(request.inGauge.height)} cm`,
    `Over-width: left ${n(request.overWidth.left)} cm, right ${n(request.overWidth.right)} cm`,
    `Over-height: ${n(request.overHeight)} cm`,
    `Over-length: ${front} ${n(request.overLength.front)} cm, ${back} ${n(request.overLength.back)} cm`,
    `Cargo weight: ${n(request.weightKg)} kg (with the container, estimated: ${n(request.grossKg)} kg)`,
    `Centre of gravity: ${n(request.gravity.fromFront)} cm from the ${front}, ${n(request.gravity.fromLeft)} cm from the left side, about ${n(request.gravity.height)} cm above the floor`,
    request.lostSlots > 0 ? `Lost slots, indicative: ${n(request.lostSlots)} (counted as 20' slots)` : "",
    "Figures from our loading plan; the weight is the cargo's as declared.",
  ];
  return lines.filter(Boolean).join("\n");
}
