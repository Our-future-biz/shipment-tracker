import { describe, expect, it } from "vitest";
import { floorHolds } from "./balance";
import { CONTAINERS, DEFAULT_RULES, maxCargoKg, maxWeightWithBedding, passHeight, passWidth, usableLength, type PlanRules } from "./containers";
import type { CargoLine } from "./gauge";
import { gaugeCheckOf } from "./loadStats";
import { planLoad, type LoadPlan, type PlacedPiece } from "./plan";

// What every plan must keep, whatever the cargo: checked on a few hundred cargo lists drawn by a
// seeded random generator, so a failure always comes back the same way.

/** The same numbers in [0, 1) for the same seed (a linear congruential generator). */
function generator(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** What the cargo may carry besides its sizes: a top-load limit (P9), pins to an end or a container number (P8). */
interface Extras {
  topLoad: boolean;
  pins: boolean;
}

/** Cargo lists drawn at random; without extras the very lists drawn before pins and top-load limits existed. */
function randomCargo(random: () => number, extras: Extras): CargoLine[] {
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)]!;
  const lines: CargoLine[] = Array.from({ length: 1 + Math.floor(random() * 5) }, (_, i) => {
    const big = random() < 0.25;
    const line: CargoLine = {
      id: `line-${i}`,
      name: `Cargo ${i}`,
      lengthMm: big ? pick([3000, 5000, 6000, 8000, 11000, 13000, 15000]) : pick([400, 600, 800, 1000, 1100, 1200, 1500, 2000, 2500]),
      widthMm: big ? pick([1000, 2000, 2300, 2500, 3000, 3600]) : pick([300, 500, 800, 1000, 1100, 1200]),
      heightMm: pick([500, 800, 1000, 1300, 2000, 2300, 2650, 3000, 3300]),
      weightKg: big ? pick([2000, 5000, 9000, 12000, 15000, 20000]) : pick([10, 100, 400, 800, 1500, 3000, 6000, 12000]),
      colli: 1 + Math.floor(random() * (big ? 2 : 12)),
      canTurn: random() < 0.7,
      stackable: random() < 0.5,
    };
    if (extras.topLoad && random() < 0.5) line.topLoadKg = pick([50, 100, 300, 1000, 3000, 10000]);
    if (extras.pins && random() < 0.3) line.pinEnd = pick(["front", "doors"] as const);
    if (extras.pins && random() < 0.3) line.pinBox = pick([1, 2, 3]);
    return line;
  });
  // Pallets that turn, with dense blocks: laid out the textbook way ("mirror") and packed again around the blocks.
  if (random() < 0.3) {
    lines.push({ id: "pallet", name: "Pallet", lengthMm: pick([1200, 1140, 1300]), widthMm: pick([800, 1000, 1100]), heightMm: 1000, weightKg: pick([150, 500]), colli: 4 + Math.floor(random() * 20), canTurn: true, stackable: random() < 0.4 });
    lines.push({ id: "block", name: "Steel block", lengthMm: pick([600, 700, 900]), widthMm: pick([500, 600]), heightMm: 1000, weightKg: pick([1300, 2600, 4000]), colli: 2 + Math.floor(random() * 3), canTurn: true, stackable: false });
  }
  return lines;
}

/** Everything wrong with a plan, in words; empty for a sound one. */
function faults(cargo: CargoLine[], plan: LoadPlan, rules?: PlanRules): string[] {
  const found: string[] = [];
  const lineOf = new Map(cargo.map((line) => [line.id, line]));

  const planned = new Map<string, number>();
  for (const load of plan.loads) for (const piece of load.pieces) planned.set(piece.lineId, (planned.get(piece.lineId) ?? 0) + 1);
  for (const entry of plan.notLoaded) planned.set(entry.lineId, (planned.get(entry.lineId) ?? 0) + entry.colli);
  for (const line of cargo) if (planned.get(line.id) !== line.colli) found.push(`${line.name}: ${line.colli} colli, ${planned.get(line.id) ?? 0} loaded or listed`);

  for (const load of plan.loads) {
    const { container, pieces } = load;
    const at = container.name;
    if (load.totalWeightKg !== pieces.reduce((total, p) => total + p.weightKg, 0)) found.push(`${at}: the total weight is not the pieces' weight`);
    if (load.totalWeightKg > maxCargoKg(container)) found.push(`${at}: ${load.totalWeightKg} kg over its ${maxCargoKg(container)} kg`);
    if (!floorHolds(pieces, container)) found.push(`${at}: a stretch of cargo heavier than the floor carries`);

    for (const piece of pieces) {
      const line = lineOf.get(piece.lineId)!;
      if (piece.height !== line.heightMm) found.push(`${at}: ${piece.name} tipped`);
      if (piece.crosswise && !line.canTurn) found.push(`${at}: ${piece.name} turned`);
      if (piece.y > 0 && piece.y + piece.height > container.internalH) found.push(`${at}: ${piece.name} stacked over the walls`);
      if (container.group === "flat-rack") continue;
      if (piece.x < 0 || piece.z < 0 || piece.x + piece.width > container.internalW || piece.z + piece.length > container.internalL) found.push(`${at}: ${piece.name} outside the floor`);
      if (rules && piece.z + piece.length > usableLength(container)) found.push(`${at}: ${piece.name} in the clearance at the doors`);
      if (container.group === "standard" && (piece.width > passWidth(container) || piece.height > passHeight(container) || piece.y + piece.height > container.internalH)) {
        found.push(`${at}: ${piece.name} does not pass the door or stands over the roof`);
      }
    }
    // An open top is loaded with what passes its roof opening or its doors, each piece at the height it stands.
    const doesNotFit = gaugeCheckOf(load)?.doesNotFit;
    if (doesNotFit) found.push(`${at}: called "${doesNotFit}"`);

    pieces.forEach((a, i) => {
      for (const b of pieces.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.z + a.length <= b.z || b.z + b.length <= a.z || a.y + a.height <= b.y || b.y + b.height <= a.y;
        if (!apart) found.push(`${at}: ${a.name} and ${b.name} in the same space`);
      }
    });

    // A stack: the pieces on one place of the floor, an upper one on its base's corner (P9). Each rests
    // whole on the one under it, and carries what stands above it within its top-load limit - or,
    // without one, only its own kind, no more than its own weight.
    const stacks = new Map<string, PlacedPiece[]>();
    for (const piece of pieces) stacks.set(`${piece.x}|${piece.z}`, [...(stacks.get(`${piece.x}|${piece.z}`) ?? []), piece]);
    for (const stack of stacks.values()) {
      const sorted = [...stack].sort((a, b) => a.y - b.y);
      const base = sorted[0]!;
      if (base.y !== 0) found.push(`${at}: ${base.name} floats`);
      sorted.forEach((piece, index) => {
        const under = sorted[index - 1];
        if (under && (under.y + under.height !== piece.y || piece.length > under.length || piece.width > under.width)) found.push(`${at}: ${piece.name} does not rest whole on ${under.name}`);
        const above = sorted.slice(index + 1);
        if (above.length === 0) return;
        const carried = above.reduce((total, p) => total + p.weightKg, 0);
        const own = lineOf.get(piece.lineId)!;
        if (own.topLoadKg) {
          if (carried > own.topLoadKg) found.push(`${at}: ${piece.name} carries ${carried} kg, over its top-load limit of ${own.topLoadKg} kg`);
        } else if (!own.stackable || above.some((p) => p.lineId !== piece.lineId) || carried > piece.weightKg) {
          found.push(`${at}: ${piece.name} carries other cargo, or more than its own weight`);
        }
      });
      const weight = sorted.reduce((total, p) => total + p.weightKg, 0);
      if (weight > maxWeightWithBedding(container, base.length)) found.push(`${at}: a stack heavier than the floor carries on its length`);
    }
  }

  // Pins (P8). A container number: all of its cargo that is loaded in the one container the plan says
  // stands for it, and no other number's there. An end: kept, or said not to be.
  const notes = plan.pinNotes ?? [];
  plan.loads.forEach((load, index) => {
    const at = `#${index + 1} ${load.container.name}`;
    for (const piece of load.pieces) {
      const own = lineOf.get(piece.lineId)!;
      if (own.pinBox && own.pinBox !== load.pinBox) found.push(`${at}: ${piece.name}, pinned to container no. ${own.pinBox}, in container no. ${load.pinBox ?? "none"}`);
      if (!own.pinEnd || piece.y > 0) continue;
      const blocked = load.pieces.some((o) => {
        if (lineOf.get(o.lineId)!.pinEnd === own.pinEnd || o.x >= piece.x + piece.width || o.x + o.width <= piece.x) return false;
        return own.pinEnd === "front" ? o.z + o.length <= piece.z : o.z >= piece.z + piece.length;
      });
      if (blocked && !notes.some((n) => n.startsWith(`Container #${index + 1}:`) && n.includes(piece.name))) found.push(`${at}: ${piece.name} not kept at its end, and not said`);
    }
  });
  const numbers = plan.loads.flatMap((load) => (load.pinBox ? [load.pinBox] : []));
  if (new Set(numbers).size !== numbers.length) found.push(`a container number stands for two containers: ${numbers.join(", ")}`);
  return found;
}

describe("every plan", () => {
  it.each([
    ["without pins or top-load limits", { topLoad: false, pins: false }],
    ["with top-load limits", { topLoad: true, pins: false }],
    ["with pins", { topLoad: false, pins: true }],
    ["with pins and top-load limits", { topLoad: true, pins: true }],
  ] as const)("keeps every piece, in its own space, within the container's limits: %s", (_, extras) => {
    const random = generator(20261124);
    const problems: string[] = [];
    for (let i = 0; i < 400; i++) {
      const cargo = randomCargo(random, extras);
      const rules = random() < 0.5 ? DEFAULT_RULES : undefined;
      const nominated = random() < 0.2 ? CONTAINERS.filter(() => random() < 0.4).map((c) => c.id) : undefined;
      const found = faults(cargo, planLoad(cargo, nominated, rules), rules);
      if (found.length > 0) problems.push(`${JSON.stringify({ cargo, nominated, rules: rules !== undefined })}: ${found.slice(0, 3).join("; ")}`);
    }
    expect(problems).toEqual([]);
  });
});
