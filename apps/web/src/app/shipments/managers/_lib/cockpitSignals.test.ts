import { describe, expect, it } from "vitest";
import type { OpsCockpitRow, OpsCockpitTiles } from "@/hooks/useShipmentsManagersCockpit";
import { shipmentsManagersHref } from "./cockpitAddress";
import {
  CARD_TAG_LIMIT,
  SIGNAL_FAMILIES,
  figureText,
  hasSignal,
  listWithSignal,
  notKnownText,
  signalFigure,
  signalOf,
  tagsShown,
  windowWithSignal,
  type SignalFamily,
} from "./cockpitSignals";

// Every kind the server gives a tag (apps/api services/shipments/lib/managersCockpit SIGNAL_KINDS).
const SERVER_KINDS = [
  "owner",
  "not_user",
  "cutoff",
  "booking",
  "cargo_ready",
  "departure",
  "arrival",
  "free_time",
  "customs",
  "paperwork",
  "dangerous",
  "bl",
  "arrival_notice",
  "delivery",
  "warehouse",
  "road",
  "air",
  "request",
  "import_instructions",
  "remeasurement",
  "status_stuck",
  "credit",
  "master_job",
  "tracking",
  "billing",
  "customer_told",
];

const family = (key: string): SignalFamily => {
  const found = SIGNAL_FAMILIES.find((f) => f.key === key);
  if (!found) throw new Error(`no signal family ${key}`);
  return found;
};

const tag = (kind: string | undefined, urgent = false, text = kind ?? "plain") => ({ text, urgent, kind });
let seq = 0;
const row = (...kinds: (string | undefined)[]): OpsCockpitRow => ({
  kind: "job",
  id: `id-${++seq}`,
  jobNumber: `CZ${String(seq).padStart(8, "0")}`,
  customer: "",
  mode: "sea",
  tradeDirection: "Import",
  status: "",
  handledBy: "",
  holidayCover: "",
  area: "details",
  tags: kinds.map((k) => tag(k)),
});
const whole = (rows: OpsCockpitRow[]) => ({ total: rows.length, rows });
const tiles = (signals: Record<string, number>, over: Partial<OpsCockpitTiles> = {}): OpsCockpitTiles => ({
  active: 0,
  cutoffsDue: 0,
  noHandledBy: 0,
  handledByNotUser: 0,
  bookingPending: 0,
  etdEtaMoved: 0,
  freeTime: 0,
  customsUrgent: 0,
  notReleased: 0,
  openClaims: 0,
  signals,
  ...over,
});

describe("Shipments → Managers: the signal tiles", () => {
  it("draws nine, in the order agreed", () => {
    expect(SIGNAL_FAMILIES.map((f) => f.label)).toEqual([
      "Cut-offs due or missed",
      "Booking at risk",
      "Customs to look at",
      "Paperwork not ready",
      "Free time",
      "Delivery and POD",
      "Departure and arrival late",
      "Waiting for approval",
      "Handled By is not a user",
    ]);
  });

  it("holds only kinds the server gives, each in one family, under a key that is one of its kinds", () => {
    const kinds = SIGNAL_FAMILIES.flatMap((f) => f.kinds);
    for (const kind of kinds) expect(SERVER_KINDS, kind).toContain(kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(SIGNAL_FAMILIES.map((f) => f.key)).size).toBe(SIGNAL_FAMILIES.length);
    for (const f of SIGNAL_FAMILIES) expect(f.kinds, f.key).toContain(f.key);
  });

  it("puts delivery, road and warehouse on one tile, departure and arrival on another", () => {
    expect(family("delivery").kinds).toEqual(["delivery", "road", "warehouse"]);
    expect(family("departure").kinds).toEqual(["departure", "arrival"]);
  });

  it("names Customs for every customs tag it counts, and lists them in its hint", () => {
    const customs = family("customs");
    expect(customs.label).toBe("Customs to look at");
    expect(customs.showing).toBeUndefined();
    for (const part of ["deadline", "hold", "T1", "MRN", "3 working days"]) expect(customs.hint, part).toContain(part);
  });

  it("filters Handled By is not a user by its own kind, under its own name", () => {
    const notUser = family("not_user");
    expect(notUser.kinds).toEqual(["not_user"]);
    expect(notUser.label).toBe("Handled By is not a user");
    // The chip says what the tile says, and nothing promises the jobs nobody handles.
    expect(notUser.showing).toBeUndefined();
    expect(notUser.note).toBeUndefined();
  });

  it("says plainly that Cut-offs' cards hold more than its figure counts", () => {
    expect(family("cutoff").figure).toBe("cutoffsDue");
    expect(family("cutoff").note).toBe("The cards then show every job with a cut-off tag, also the ones in the two working days after.");
  });

  it("says in one line what each counts", () => {
    for (const f of SIGNAL_FAMILIES) {
      expect(f.hint, f.key).not.toBe("");
      expect(f.hint, f.key).not.toContain("\n");
    }
  });
});

describe("Shipments → Managers: the signal in the address", () => {
  it("reads a family by its key, none for nothing or for what it does not know", () => {
    expect(signalOf("cutoff")?.key).toBe("cutoff");
    expect(signalOf("free_time")?.key).toBe("free_time");
    expect(signalOf("not_user")?.key).toBe("not_user");
    expect(signalOf(" Customs ")?.key).toBe("customs");
    expect(signalOf(null)).toBeNull();
    expect(signalOf("")).toBeNull();
    expect(signalOf("everything")).toBeNull();
  });

  it("reads one of a family's kinds as the family", () => {
    expect(signalOf("road")?.key).toBe("delivery");
    expect(signalOf("warehouse")?.key).toBe("delivery");
    expect(signalOf("arrival")?.key).toBe("departure");
  });

  it("is no filter for a kind that has no tile", () => {
    // "owner" is Nobody in Handled By: a list tile opens those jobs.
    for (const kind of ["owner", "dangerous", "bl", "credit", "master_job", "tracking", "billing"]) expect(signalOf(kind), kind).toBeNull();
  });

  it("reads back what the page writes", () => {
    for (const f of SIGNAL_FAMILIES) {
      const href = shipmentsManagersHref({ mode: "sea", signal: f.key });
      expect(signalOf(new URLSearchParams(href.split("?")[1]).get("signal")), f.key).toBe(f);
    }
  });
});

describe("Shipments → Managers: the cards narrowed to a signal", () => {
  it("knows a row by any tag of the family, urgent or not", () => {
    expect(hasSignal(row("customs", "cutoff"), family("cutoff"))).toBe(true);
    expect(hasSignal(row("road"), family("delivery"))).toBe(true);
    expect(hasSignal(row("warehouse", "billing"), family("delivery"))).toBe(true);
    expect(hasSignal(row("customs", "billing"), family("cutoff"))).toBe(false);
    expect(hasSignal(row(), family("cutoff"))).toBe(false);
  });

  it("does not take a job nobody handles for one handled by somebody who is not a user", () => {
    expect(hasSignal(row("not_user"), family("not_user"))).toBe(true);
    expect(hasSignal(row("owner"), family("not_user"))).toBe(false);
    const [nobody, gone] = [row("owner"), row("not_user", "cutoff")];
    expect(listWithSignal(whole([nobody, gone]), family("not_user"))).toEqual({ total: 1, rows: [gone], listed: 2, cut: false });
  });

  it("never matches a tag that names no kind", () => {
    for (const f of SIGNAL_FAMILIES) expect(hasSignal(row(undefined), f), f.key).toBe(false);
  });

  it("leaves a card as it is for no signal", () => {
    const rows = [row("cutoff"), row("customs")];
    expect(listWithSignal(whole(rows), null)).toEqual({ total: 2, rows, listed: 2, cut: false });
    // A cut card keeps the server's total.
    expect(listWithSignal({ total: 340, rows }, null)).toEqual({ total: 340, rows, listed: 2, cut: true });
  });

  it("keeps the rows carrying the signal, in the card's order, and counts them", () => {
    const [a, b, c, d] = [row("cutoff"), row("customs"), row("booking", "cutoff"), row("road")];
    expect(listWithSignal(whole([a, b, c, d]), family("cutoff"))).toEqual({ total: 2, rows: [a, c], listed: 4, cut: false });
    expect(listWithSignal(whole([a, b, c, d]), family("delivery"))).toEqual({ total: 1, rows: [d], listed: 4, cut: false });
    expect(listWithSignal(whole([a, b]), family("request"))).toEqual({ total: 0, rows: [], listed: 2, cut: false });
  });

  it("counts a cut card among the rows listed, and says it is cut", () => {
    const rows = [row("cutoff"), row("customs"), row("cutoff")];
    expect(listWithSignal({ total: 260, rows }, family("cutoff"))).toMatchObject({ total: 2, listed: 3, cut: true });
  });

  it("says among how many rows a cut card was looked through: the rows listed, not the rows found", () => {
    const listed = Array.from({ length: 200 }, (_, i) => row(i < 12 ? "cutoff" : "customs"));
    const narrowed = listWithSignal({ total: 260, rows: listed }, family("cutoff"));
    expect(narrowed.total).toBe(12);
    expect(windowWithSignal("today or the next working day", narrowed)).toBe("today or the next working day · among the first 200");
    expect(windowWithSignal("the two working days after", narrowed)).toBe("the two working days after · among the first 200");
  });

  it("adds nothing to the window of a card the server listed whole, or of one not there yet", () => {
    const narrowed = listWithSignal(whole([row("cutoff"), row("customs")]), family("cutoff"));
    expect(windowWithSignal("today or the next working day", narrowed)).toBe("today or the next working day");
    expect(windowWithSignal("today or the next working day", undefined)).toBe("today or the next working day");
  });
});

describe("Shipments → Managers: a signal tile's figure", () => {
  const empty = whole([]);

  it("is the server's count of the rows with the family's one kind", () => {
    const cockpit = { tiles: tiles({ booking: 7, customs: 3, paperwork: 0 }), urgent: empty, attention: empty };
    expect(signalFigure(family("booking"), cockpit)).toEqual({ count: 7, atLeast: false });
    expect(signalFigure(family("customs"), cockpit)).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("paperwork"), cockpit)).toEqual({ count: 0, atLeast: false });
  });

  it("is the urgent cut-offs for Cut-offs due or missed, not every row with a cut-off tag", () => {
    const cockpit = { tiles: tiles({ cutoff: 9 }, { cutoffsDue: 4 }), urgent: empty, attention: empty };
    expect(signalFigure(family("cutoff"), cockpit)).toEqual({ count: 4, atLeast: false });
  });

  it("is step 1's figure for Handled By is not a user, and not known when the users could not be read", () => {
    expect(signalFigure(family("not_user"), { tiles: tiles({ owner: 12, not_user: 2 }, { handledByNotUser: 2 }), urgent: empty, attention: empty })).toEqual({ count: 2, atLeast: false });
    const unknown = signalFigure(family("not_user"), { tiles: tiles({ owner: 12, not_user: 0 }, { handledByNotUser: null }), urgent: empty, attention: empty });
    expect(unknown.count).toBeNull();
    expect(figureText(unknown)).toBe("–");
  });

  it("counts a row with two kinds of one family once", () => {
    const urgent = whole([row("delivery", "road"), row("road"), row("customs")]);
    const attention = whole([row("warehouse"), row("cutoff")]);
    // Per kind the server says delivery 1, road 2, warehouse 1: four tags' worth on three rows.
    const cockpit = { tiles: tiles({ delivery: 1, road: 2, warehouse: 1 }), urgent, attention };
    expect(signalFigure(family("delivery"), cockpit)).toEqual({ count: 3, atLeast: false });
  });

  it("says at least when a card is cut and the rest may hold more", () => {
    const urgent = { total: 260, rows: [row("departure"), row("arrival"), row("departure", "arrival")] };
    const cockpit = { tiles: tiles({ departure: 20, arrival: 15 }), urgent, attention: empty };
    // 20 rows have a departure tag, so at least 20; at most 35.
    const figure = signalFigure(family("departure"), cockpit);
    expect(figure).toEqual({ count: 20, atLeast: true });
    expect(figureText(figure)).toBe("20+");
  });

  it("is exact for a cut card when only one of the kinds counts anything", () => {
    const urgent = { total: 260, rows: [row("departure")] };
    const cockpit = { tiles: tiles({ departure: 20, arrival: 0 }), urgent, attention: empty };
    expect(signalFigure(family("departure"), cockpit)).toEqual({ count: 20, atLeast: false });
  });

  it("reads a kind the answer does not hold as none", () => {
    expect(signalFigure(family("request"), { tiles: tiles({}), urgent: empty, attention: empty })).toEqual({ count: 0, atLeast: false });
  });

  it("does not fall over an answer from before step 2: no signals, tags and rows that name no kind", () => {
    // As the old answer comes off the wire: the fields are not there at all.
    const old = JSON.parse(JSON.stringify({ ...tiles({}, { cutoffsDue: 3, handledByNotUser: 1 }), signals: undefined })) as OpsCockpitTiles;
    const oldRow = JSON.parse(JSON.stringify({ ...row(undefined, undefined), kind: undefined })) as OpsCockpitRow;
    expect(old).not.toHaveProperty("signals");
    expect(oldRow).not.toHaveProperty("kind");
    expect(oldRow.tags[0]).not.toHaveProperty("kind");
    const urgent = { total: 260, rows: [oldRow] };
    const cockpit = { tiles: old, urgent, attention: empty };
    for (const f of SIGNAL_FAMILIES) expect(() => signalFigure(f, cockpit), f.key).not.toThrow();
    // What step 1 counted is still shown; what it did not count reads as none.
    expect(signalFigure(family("cutoff"), cockpit)).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("not_user"), cockpit)).toEqual({ count: 1, atLeast: false });
    expect(signalFigure(family("booking"), cockpit)).toEqual({ count: 0, atLeast: false });
    expect(signalFigure(family("delivery"), cockpit)).toEqual({ count: 0, atLeast: false });
    // The cards narrow to nothing, and a row's tags are drawn as they are.
    expect(listWithSignal(urgent, family("delivery"))).toMatchObject({ total: 0, rows: [], listed: 1, cut: true });
    expect(tagsShown(urgent.rows[0]!.tags, family("delivery"), CARD_TAG_LIMIT).shown).toHaveLength(2);
  });

  it("shows the figure as it is, zero included", () => {
    expect(figureText({ count: 0, atLeast: false })).toBe("0");
    expect(figureText({ count: 14, atLeast: false })).toBe("14");
  });
});

describe("Shipments → Managers: the tags a row shows", () => {
  const tags = ["customs", "cutoff", "booking", "free_time", "paperwork", "billing"].map((k) => tag(k));

  it("shows them all in the server's order when nothing limits them", () => {
    expect(tagsShown(tags, null)).toEqual({ shown: tags, more: [] });
  });

  it("shows the first four on a card and keeps the rest for +N more", () => {
    const { shown, more } = tagsShown(tags, null, CARD_TAG_LIMIT);
    expect(CARD_TAG_LIMIT).toBe(4);
    expect(shown.map((t) => t.kind)).toEqual(["customs", "cutoff", "booking", "free_time"]);
    expect(more.map((t) => t.kind)).toEqual(["paperwork", "billing"]);
  });

  it("has nothing more for a row with four tags or fewer", () => {
    expect(tagsShown(tags.slice(0, 4), null, CARD_TAG_LIMIT).more).toEqual([]);
    expect(tagsShown([], null, CARD_TAG_LIMIT)).toEqual({ shown: [], more: [] });
  });

  it("puts the tags of the signal the cards are narrowed to first, the others as they were", () => {
    const { shown, more } = tagsShown(tags, family("paperwork"), CARD_TAG_LIMIT);
    expect(shown.map((t) => t.kind)).toEqual(["paperwork", "customs", "cutoff", "booking"]);
    expect(more.map((t) => t.kind)).toEqual(["free_time", "billing"]);
  });

  it("keeps a family's own tags in the server's order", () => {
    const mixed = [tag("customs"), tag("road", true, "first"), tag("billing"), tag("delivery", false, "second")];
    expect(tagsShown(mixed, family("delivery")).shown.map((t) => t.text)).toEqual(["first", "second", "customs", "billing"]);
  });
});

describe("Shipments → Managers: what is not known right now", () => {
  it("joins the parts with commas", () => {
    expect(notKnownText(["documents", "Master Jobs"])).toBe("documents, Master Jobs");
    expect(notKnownText(["containers without free time"])).toBe("containers without free time");
  });

  it("joins them with semicolons when a part's own name has a comma", () => {
    expect(notKnownText(["tracking events (Closing, holds, rolled, pick-up, POD)", "containers without free time"])).toBe(
      "tracking events (Closing, holds, rolled, pick-up, POD); containers without free time",
    );
  });
});
