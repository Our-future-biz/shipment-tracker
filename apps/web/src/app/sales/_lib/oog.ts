import type { QuoteContainerLine, SalesQuoteData } from "./types";
import { isContainerQuote } from "./salesQuote";

// Out-of-gauge cargo on open-top and flat-rack boxes: whether the cargo stands out of the box,
// by how much, and how many neighbouring slots on board that costs. The measures and the slot
// rules are indicative - a carrier's own equipment and its stowage planner decide.

/** Whether a container type is special equipment for out-of-gauge cargo: open top (OT, HOT) or flat rack (FR). */
export function isOogType(type: string | undefined): boolean {
  return /\b(OT|HOT|FR)$/.test((type ?? "").trim());
}

/** Whether a quote carries such a box: its out-of-gauge requirements are then asked. */
export function hasOogEquipment(data: Pick<SalesQuoteData, "serviceType" | "containers">): boolean {
  return isContainerQuote(data) && (data.containers ?? []).some((c) => isOogType(c.type));
}

// Inside measures in cm the cargo is checked against, by type. A flat rack has no side walls:
// cargo is over-width beyond the box's own width (244 cm, as the slot beside it starts there),
// and over-height above its end posts. An open top has walls: only its roof is open.
interface Gauge {
  length: number;
  width: number;
  height: number;
  flatRack: boolean;
  /** What the user is told of the box besides its measures. */
  advice?: string;
}
const GAUGES: Record<string, Gauge> = {
  // The height holds for cargo up to the 220 cm width; the roof opening itself is 223 cm wide.
  "20' OT": { length: 589, width: 220, height: 234, flatRack: false, advice: "Roof opening is 223 cm wide" },
  "20' HOT": { length: 589, width: 234, height: 265, flatRack: false },
  "40' OT": { length: 1203, width: 234, height: 234, flatRack: false },
  "40' HOT": { length: 1203, width: 234, height: 265, flatRack: false },
  "20' FR": { length: 562, width: 244, height: 223, flatRack: true },
  "40' FR": { length: 1162, width: 244, height: 195, flatRack: true },
};

/** The slot one tier above takes (8'6" box), and the length of a 20' and a 40' slot, in cm. */
const TIER = 259;
const ROW = 244;
const SLOT_LENGTH = { 20: 610, 40: 1219 } as const;

export interface OogCheck {
  type: string;
  /** What the cargo stands out of the box, in cm: width per side, height above, length per end (0 = within). */
  overWidthPerSide: number;
  overHeight: number;
  overLengthPerEnd: number;
  /** What does not go at all: an open top has walls - cargo wider or longer than it needs a flat rack. */
  doesNotFit: string | null;
  /** Slots lost around one such box, by where they are, and all of them. */
  lost: { above: number; left: number; right: number; front: number; back: number; corners: number; total: number };
}

/**
 * The cargo - its overall length, the widest piece and the highest piece, in cm - against one box
 * of `type`. The cargo is taken as centred: what stands out is split evenly to both sides and
 * both ends. A slot is lost for each tier, row or bay the cargo reaches into, and above an
 * over-wide box also the slots diagonally above it.
 */
export function checkOog(type: string, cargo: { length: number; width: number; height: number }): OogCheck | null {
  const gauge = GAUGES[type.trim()];
  if (!gauge) return null;
  const round = (v: number) => Math.max(0, Math.round(v));
  const overWidthPerSide = round((cargo.width - gauge.width) / 2);
  const overHeight = round(cargo.height - gauge.height);
  const overLengthPerEnd = round((cargo.length - gauge.length) / 2);

  let doesNotFit: string | null = null;
  if (!gauge.flatRack && (overWidthPerSide > 0 || overLengthPerEnd > 0)) {
    doesNotFit = `Wider or longer than a ${type} - it needs a flat rack`;
  }

  const slots = (over: number, size: number) => (over > 0 ? Math.ceil(over / size) : 0);
  const slotLength = type.startsWith("20") ? SLOT_LENGTH[20] : SLOT_LENGTH[40];
  const above = slots(overHeight, TIER);
  const side = gauge.flatRack ? slots(overWidthPerSide, ROW) : 0;
  const end = gauge.flatRack ? slots(overLengthPerEnd, slotLength) : 0;
  const corners = above * side * 2;
  return {
    type: type.trim(),
    overWidthPerSide,
    overHeight,
    overLengthPerEnd,
    doesNotFit,
    lost: { above, left: side, right: side, front: end, back: end, corners, total: above + side * 2 + end * 2 + corners },
  };
}

/**
 * The largest cargo that stays in gauge on every one of `types` - each measure the smallest of
 * theirs - and the type that sets it: what an in-gauge quote is pre-filled with. Null when none
 * of the types has known measures.
 */
export function inGaugeMaximum(types: string[]): { length: number; width: number; height: number; limitedBy: string } | null {
  const known = types.map((t) => [t.trim(), GAUGES[t.trim()]] as const).filter((e): e is readonly [string, Gauge] => !!e[1]);
  if (!known.length) return null;
  // The type with the smallest box decides, its measures each capped by the others'.
  const [limitedBy] = [...known].sort((a, b) => a[1].length * a[1].width * a[1].height - b[1].length * b[1].width * b[1].height)[0]!;
  return {
    length: Math.min(...known.map(([, g]) => g.length)),
    width: Math.min(...known.map(([, g]) => g.width)),
    height: Math.min(...known.map(([, g]) => g.height)),
    limitedBy,
  };
}

/** What the user is told of a box besides its measures ("Roof opening is 223 cm wide"), or null. */
export function gaugeAdvice(type: string): string | null {
  return GAUGES[type.trim()]?.advice ?? null;
}

/** The distinct out-of-gauge types of a quote's container lines, in the order they are listed. */
export function oogTypes(containers: QuoteContainerLine[] | undefined): string[] {
  return [...new Set((containers ?? []).map((c) => c.type.trim()).filter(isOogType))];
}

/**
 * What an out-of-gauge quote still lacks: whether the cargo is in gauge, and its overall length,
 * widest and highest piece - pre-filled with the in-gauge maximum when it is. Null when nothing is
 * missing or the quote has no open top or flat rack.
 */
export function oogMissing(data: Pick<SalesQuoteData, "serviceType" | "containers" | "oog">): string | null {
  if (!hasOogEquipment(data)) return null;
  const o = data.oog ?? {};
  if (typeof o.inGauge !== "boolean") return "Say whether the cargo is in gauge";
  if (!(o.length && o.width && o.height)) return "Enter the cargo's overall length, width and height";
  return null;
}

/** The out-of-gauge details in one line, for the confirmation before moving on: "40' FR · Out of gauge · 1,262 × 300 × 250 cm (L × W × H) · 7 lost slots per container". */
export function oogSummary(data: Pick<SalesQuoteData, "containers" | "oog">): string {
  const o = data.oog ?? {};
  const types = oogTypes(data.containers);
  const parts = [types.join(", "), o.inGauge === true ? "In gauge" : o.inGauge === false ? "Out of gauge" : "In gauge not answered"];
  const fmt = (v: number | undefined) => (v ? v.toLocaleString("en-US") : "?");
  parts.push(`${fmt(o.length)} × ${fmt(o.width)} × ${fmt(o.height)} cm (L × W × H)`);
  if (o.length && o.width && o.height) {
    for (const type of types) {
      const check = checkOog(type, { length: o.length, width: o.width, height: o.height });
      if (check?.doesNotFit) parts.push(`${type}: ${check.doesNotFit.toLowerCase()}`);
      else if (check?.lost.total) parts.push(`${type}: ${check.lost.total} lost slot${check.lost.total === 1 ? "" : "s"} per container`);
    }
  }
  return parts.join(" · ");
}
