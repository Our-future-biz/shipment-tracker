// The one out-of-gauge table of the app (Council Outlay 14, P12): a quote's out-of-gauge block and
// the Loading Planner both read it, so the same cargo never gets two verdicts. Whether cargo stands
// out of an open top or a flat rack, by how much, and how many neighbouring slots on board that
// costs. The measures and the slot rules are indicative - a carrier's own equipment and its stowage
// planner decide.

/** Whether a container type is special equipment for out-of-gauge cargo: open top (OT, HOT) or flat rack (FR, HFR). */
export function isOogType(type: string | undefined): boolean {
  return /\b(OT|HOT|FR|HFR)$/.test((type ?? "").trim());
}

/** Whether the out-of-gauge check knows a type's measures: one it does not is asked about, but not measured. */
export function hasGauge(type: string): boolean {
  return !!GAUGES[type.trim()];
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
  /** Longer cargo an open top still takes when it is loaded through its doors, within these measures. */
  doors?: { length: number; width: number; height: number };
  /**
   * How far past its in-gauge measures a flat rack may still go if the liner confirms it. Cargo up
   * to these measures is not out of gauge, but needs that confirmation; past them it is.
   */
  liner?: { length: number; width: number; height: number };
}
const GAUGES: Record<string, Gauge> = {
  // From the top up to 530 cm long - the height holds for cargo up to the 220 cm width, the roof
  // opening itself is 223 cm wide; through the doors the full 589 cm, as long as the cargo passes them.
  "20' OT": {
    length: 530,
    width: 220,
    height: 234,
    flatRack: false,
    advice: "Roof opening is 223 cm wide. Up to 589 cm long when loaded through the doors: max 232 cm wide and 225 cm high",
    doors: { length: 589, width: 232, height: 225 },
  },
  // From the top up to 535 cm; through the doors the full 589 cm, as long as the cargo passes them.
  "20' HOT": {
    length: 535,
    width: 220,
    height: 264,
    flatRack: false,
    advice: "Up to 589 cm long when loaded through the doors: max 232 cm wide and 255 cm high",
    doors: { length: 589, width: 232, height: 255 },
  },
  // From the top up to 1,150 cm long; through the doors up to 1,200 cm, as long as the cargo passes them.
  "40' OT": {
    length: 1150,
    width: 220,
    height: 234,
    flatRack: false,
    advice: "Up to 1,200 cm long when loaded through the doors: max 232 cm wide and 225 cm high",
    doors: { length: 1200, width: 232, height: 225 },
  },
  // From the top up to 1,150 cm long; through the doors up to 1,200 cm, as long as the cargo passes them.
  "40' HOT": {
    length: 1150,
    width: 216,
    height: 264,
    flatRack: false,
    advice: "Up to 1,200 cm long when loaded through the doors: max 232 cm wide and 255 cm high",
    doors: { length: 1200, width: 232, height: 255 },
  },
  // In gauge; up to the liner limit with the liner's confirmation; out of gauge past it.
  "20' FR": { length: 550, width: 244, height: 218, flatRack: true, liner: { length: 563, width: 244, height: 223 } },
  "40' FR": { length: 1150, width: 244, height: 194, flatRack: true, liner: { length: 1163, width: 244, height: 198 } },
  "40' HFR": { length: 1150, width: 244, height: 224, flatRack: true, liner: { length: 1163, width: 244, height: 226 } },
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
  /** How an open top is loaded with the cargo: from the top, or through its doors where it is too long for the roof opening. */
  loading: "top" | "doors" | null;
  /**
   * The measures of a flat rack's cargo past its in-gauge figure but within the liner limit:
   * not out of gauge, but only with the liner's confirmation. Empty when none.
   */
  liner: { measure: "length" | "width" | "height"; value: number; inGauge: number; limit: number }[];
  /** Slots lost around one such box, counted as 20' slots, by where they are, and all of them. */
  lost: { above: number; left: number; right: number; front: number; back: number; corners: number; total: number };
}

// What of the cargo is over a limit, in words, with the place it is over at: "too long for the
// roof opening (max 535 cm)", "too long and wide for a 20' OT (max 589 cm long, 220 cm wide)".
// Only the measures the limit has are compared.
function tooBig(cargo: { length: number; width: number; height: number }, max: Partial<Record<"length" | "width" | "height", number>>, at: string): string {
  const word = { length: "long", width: "wide", height: "high" } as const;
  const over = (["length", "width", "height"] as const).filter((m) => max[m] !== undefined && cargo[m] > max[m]!);
  if (!over.length) return `too big ${at}`;
  const words = over.map((m) => word[m]);
  const said = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  const cm = (m: (typeof over)[number]) => `${max[m]!.toLocaleString("en-US")} cm`;
  const limits = over.length === 1 ? cm(over[0]!) : over.map((m) => `${cm(m)} ${word[m]}`).join(", ");
  return `too ${said} ${at} (max ${limits})`;
}
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
  // A flat rack's cargo is out of gauge in a measure only past the liner limit; what stands out is
  // then counted from the in-gauge figure. Up to the limit it asks for the liner's confirmation.
  const outside = (m: "length" | "width" | "height") => cargo[m] > (gauge.liner?.[m] ?? gauge[m]);
  const liner: OogCheck["liner"] = gauge.liner
    ? (["length", "width", "height"] as const)
        .filter((m) => cargo[m] > gauge[m] && !outside(m))
        .map((m) => ({ measure: m, value: cargo[m], inGauge: gauge[m], limit: gauge.liner![m] }))
    : [];
  let overWidthPerSide = outside("width") ? round((cargo.width - gauge.width) / 2) : 0;
  let overHeight = outside("height") ? round(cargo.height - gauge.height) : 0;
  let overLengthPerEnd = outside("length") ? round((cargo.length - gauge.length) / 2) : 0;

  let doesNotFit: string | null = null;
  let loading: OogCheck["loading"] = null;
  if (!gauge.flatRack) {
    // An open top is loaded from the top - its walls hold the width and length, and only the
    // height may stand out of the roof - or, where it has door measures, through its doors with
    // cargo too long for the roof opening that passes them.
    const fromTop = overWidthPerSide === 0 && overLengthPerEnd === 0;
    const doors = gauge.doors;
    const throughDoors = !!doors && cargo.length <= doors.length && cargo.width <= doors.width && cargo.height <= doors.height;
    if (fromTop && !(throughDoors && overHeight > 0)) {
      loading = "top";
    } else if (throughDoors) {
      loading = "doors";
      overWidthPerSide = overHeight = overLengthPerEnd = 0;
    } else {
      const walls = { length: gauge.length, width: gauge.width };
      doesNotFit = doors
        ? `${capitalise(tooBig(cargo, walls, "for the roof opening"))} and ${tooBig(cargo, doors, "for the doors")} - it needs a flat rack`
        : `${capitalise(tooBig(cargo, walls, `for a ${type}`))} - it needs a flat rack`;
    }
  }

  // Slots are counted as 20' slots: the slot above or beside a 40' box is a 40' slot - two of
  // them - so a 40' box loses double for its over-height and over-width. Over-length reaches into
  // the bay at each end, one slot per bay whatever the box.
  const slots = (over: number, size: number) => (over > 0 ? Math.ceil(over / size) : 0);
  const forty = !type.startsWith("20");
  const perSlot = forty ? 2 : 1;
  const slotLength = forty ? SLOT_LENGTH[40] : SLOT_LENGTH[20];
  const tiers = slots(overHeight, TIER);
  const rows = gauge.flatRack ? slots(overWidthPerSide, ROW) : 0;
  const end = gauge.flatRack ? slots(overLengthPerEnd, slotLength) : 0;
  const above = tiers * perSlot;
  const side = rows * perSlot;
  const corners = tiers * rows * 2 * perSlot;
  return {
    type: type.trim(),
    overWidthPerSide,
    overHeight,
    overLengthPerEnd,
    doesNotFit,
    loading,
    liner,
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

/** The in-gauge measures of a type in cm, and whether it is a flat rack; null for a type the table does not hold. What an out-of-gauge request is measured against. */
export function gaugeMeasures(type: string): { length: number; width: number; height: number; flatRack: boolean } | null {
  const gauge = GAUGES[type.trim()];
  return gauge ? { length: gauge.length, width: gauge.width, height: gauge.height, flatRack: gauge.flatRack } : null;
}

/**
 * How an open top takes one piece (its length along the box, width and height in cm): from the top
 * through the roof opening - any height - or through its doors; null when neither, and for a type
 * the table does not know: such a piece needs a flat rack. The planner loads by this, piece by piece.
 */
export function openTopTakes(type: string, piece: { length: number; width: number; height: number }): "top" | "doors" | null {
  const gauge = GAUGES[type.trim()];
  if (!gauge || gauge.flatRack) return null;
  if (piece.length <= gauge.length && piece.width <= gauge.width) return "top";
  const doors = gauge.doors;
  return doors && piece.length <= doors.length && piece.width <= doors.width && piece.height <= doors.height ? "doors" : null;
}
