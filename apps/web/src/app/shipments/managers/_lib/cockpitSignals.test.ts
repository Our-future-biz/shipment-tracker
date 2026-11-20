import { describe, expect, it } from "vitest";
import type { OpsCockpitRow, OpsCockpitTiles } from "@/hooks/useShipmentsManagersCockpit";
import { shipmentsManagersHref } from "./cockpitAddress";
import {
  CARD_TAG_LIMIT,
  EMPTY_WITH_SIGNAL,
  SIGNAL_FAMILIES,
  LOAD_FAILED,
  cardWithSignal,
  familyOf,
  figureText,
  hasSignal,
  isAnswerLoading,
  listWithSignal,
  loadFailedText,
  notKnownText,
  serverCard,
  showingLabel,
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
  "todo",
  "mention",
  "not_touched",
  "away",
  "claim",
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
/** The tiles of an answer: `families` - the server's count of each signal tile - and the per-kind `signals`. */
const tiles = (families: Record<string, number>, over: Partial<OpsCockpitTiles> = {}): OpsCockpitTiles => ({
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
  signals: {},
  families,
  ...over,
});

describe("Shipments → Managers: the signal tiles", () => {
  it("draws thirteen, in the order agreed: step 3's two come last", () => {
    expect(SIGNAL_FAMILIES.map((f) => f.label)).toEqual([
      "Cut-offs due or missed",
      "Booking at risk",
      "Customs to look at",
      "Paperwork not ready",
      "Free time",
      "Delivery, warehouse and road",
      "Departure and arrival late",
      "Cargo claims",
      "Jobs waiting for approval",
      "Handled By is not a user",
      "Away",
      "To-dos and @mentions",
      "Not touched",
    ]);
  });

  it("puts late to-dos and unread @mentions on one tile, and the jobs nobody touched on their own", () => {
    expect(family("todo").kinds).toEqual(["todo", "mention"]);
    expect(family("not_touched").kinds).toEqual(["not_touched"]);
    // Each is the server's count of the tile: neither has a figure of a narrower rule.
    expect(family("todo").figure).toBeUndefined();
    expect(family("not_touched").figure).toBeUndefined();
  });

  it("gives step 6's away and cargo claims a tile each, counted by the server's count of their kind", () => {
    expect(family("away").kinds).toEqual(["away"]);
    expect(family("claim").kinds).toEqual(["claim"]);
    expect(family("away").figure).toBeUndefined();
    expect(signalFigure(family("away"), { tiles: tiles({ away: 3, not_user: 1 }) })).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("claim"), { tiles: tiles({ claim: 2 }) })).toEqual({ count: 2, atLeast: false });
    // Where the time limits are switched is said on hover, and that they are off until confirmed.
    expect(family("claim").note).toContain("Settings tab");
    // One tile for all three: Handled By away with no cover, both away, the cover away - under the same address key.
    expect(signalOf("away")?.label).toBe("Away");
    expect(family("away").hint).toMatch(/no Holiday Cover.*both away.*Holiday Cover away/);
  });

  it("says Jobs waiting for approval counts a request to release before payment too - and not what approving one does", () => {
    const request = family("request");
    expect(request.hint).toContain("a request to release the job before payment");
    // Jobs here, requests on the Approvals tab: the unit of each count is said (M21).
    expect(request.label).toMatch(/^Jobs /);
    expect(request.note).toBe("They are answered on the Approvals tab, whose count is every request waiting, however new.");
    // Approving gives the job a pass; the release is made afterwards. Nothing here says otherwise.
    for (const text of [request.hint, request.note ?? ""]) expect(text).not.toMatch(/approving|releases the job/i);
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

  it("names the warehouse and the road on the delivery tile, and on its chip (step 5)", () => {
    const delivery = family("delivery");
    expect(delivery.label).toBe("Delivery, warehouse and road");
    expect(delivery.showing).toBeUndefined();
    expect(showingLabel(delivery)).toBe("Delivery, warehouse and road");
    expect(delivery.hint).toBe("Planned delivery or pick-up passed, POD missing, the haulier not confirmed, and what our warehouse or Trucking reports on the job");
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

  it("says plainly that Cut-offs' URGENT card is its figure, and ATTENTION the cut-offs after (m17)", () => {
    expect(family("cutoff").figure).toBe("cutoffsDue");
    expect(family("cutoff").note).toBe("URGENT then lists the jobs this counts; ATTENTION the jobs with a cut-off in the two working days after.");
  });

  it("counts a Holiday Cover who is no user under \"Handled By is not a user\" (S16)", () => {
    expect(family("not_user").label).toBe("Handled By is not a user");
    expect(family("not_user").hint).toBe("Handled By or Holiday Cover names somebody who is not an active user of the company");
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

  it("reads an @mention as To-dos and @mentions, and Not touched by its own key", () => {
    expect(signalOf("todo")?.key).toBe("todo");
    expect(signalOf("mention")?.key).toBe("todo");
    expect(signalOf("not_touched")?.key).toBe("not_touched");
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
  it("is the server's count of the tile, over every row of the page", () => {
    const cockpit = { tiles: tiles({ booking: 7, customs: 3, paperwork: 0 }) };
    expect(signalFigure(family("booking"), cockpit)).toEqual({ count: 7, atLeast: false });
    expect(signalFigure(family("customs"), cockpit)).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("paperwork"), cockpit)).toEqual({ count: 0, atLeast: false });
  });

  it("is the urgent cut-offs for Cut-offs due or missed, not every row with a cut-off tag", () => {
    const cockpit = { tiles: tiles({ cutoff: 9 }, { cutoffsDue: 4 }) };
    expect(signalFigure(family("cutoff"), cockpit)).toEqual({ count: 4, atLeast: false });
  });

  it("is step 1's figure for Handled By is not a user, and not known when the users could not be read", () => {
    expect(signalFigure(family("not_user"), { tiles: tiles({ not_user: 2 }, { handledByNotUser: 2 }) })).toEqual({ count: 2, atLeast: false });
    const unknown = signalFigure(family("not_user"), { tiles: tiles({ not_user: 0 }, { handledByNotUser: null }) });
    expect(unknown.count).toBeNull();
    expect(figureText(unknown)).toBe("–");
  });

  it("is the server's count for a tile of several kinds - a row with two of them counted once there - not the sum of its kinds", () => {
    // Per kind the server says delivery 1, road 2, warehouse 1: four tags' worth on three rows.
    const cockpit = { tiles: tiles({ delivery: 3, todo: 3 }, { signals: { delivery: 1, road: 2, warehouse: 1, todo: 2, mention: 2 } }) };
    expect(signalFigure(family("delivery"), cockpit)).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("todo"), cockpit)).toEqual({ count: 3, atLeast: false });
  });

  it("is exact whatever the cards hold: cut at their limit, or narrowed by the server to another tile", () => {
    // The cards are not read at all: a tile's figure is never "12+", and a click on another tile changes none.
    const cockpit = { tiles: tiles({ departure: 35, not_touched: 1 }), urgent: { total: 260, rows: [row("cutoff")] }, attention: whole([]) };
    expect(signalFigure(family("departure"), cockpit)).toEqual({ count: 35, atLeast: false });
    expect(figureText(signalFigure(family("departure"), cockpit))).toBe("35");
    expect(signalFigure(family("not_touched"), cockpit)).toEqual({ count: 1, atLeast: false });
  });

  it("reads a tile the answer does not count as none", () => {
    expect(signalFigure(family("request"), { tiles: tiles({}) })).toEqual({ count: 0, atLeast: false });
  });

  it("does not fall over an answer from before the server counted the tiles: no families, tags and rows that name no kind", () => {
    // As the old answer comes off the wire: the fields are not there at all.
    const old = JSON.parse(JSON.stringify({ ...tiles({}, { cutoffsDue: 3, handledByNotUser: 1 }), families: undefined, signals: undefined })) as OpsCockpitTiles;
    const oldRow = JSON.parse(JSON.stringify({ ...row(undefined, undefined), kind: undefined })) as OpsCockpitRow;
    expect(old).not.toHaveProperty("families");
    expect(oldRow).not.toHaveProperty("kind");
    expect(oldRow.tags[0]).not.toHaveProperty("kind");
    const cockpit = { tiles: old };
    for (const f of SIGNAL_FAMILIES) expect(() => signalFigure(f, cockpit), f.key).not.toThrow();
    // What step 1 counted is still shown; what it did not count reads as none.
    expect(signalFigure(family("cutoff"), cockpit)).toEqual({ count: 3, atLeast: false });
    expect(signalFigure(family("not_user"), cockpit)).toEqual({ count: 1, atLeast: false });
    expect(signalFigure(family("booking"), cockpit)).toEqual({ count: 0, atLeast: false });
    expect(signalFigure(family("delivery"), cockpit)).toEqual({ count: 0, atLeast: false });
    // A row's tags are drawn as they are.
    expect(tagsShown(oldRow.tags, family("delivery"), CARD_TAG_LIMIT).shown).toHaveLength(2);
  });

  it("shows the figure as it is, zero included", () => {
    expect(figureText({ count: 0, atLeast: false })).toBe("0");
    expect(figureText({ count: 14, atLeast: false })).toBe("14");
  });
});

describe("Shipments → Managers: a card the server narrowed", () => {
  it("is shown as the server sent it: every row of the signal counted, the first of them listed", () => {
    // The server narrowed before it cut: 260 rows have the signal, 200 are listed.
    const rows = Array.from({ length: 200 }, () => row("not_touched"));
    expect(serverCard({ total: 260, rows })).toEqual({ total: 260, rows, listed: 200, cut: false });
    expect(serverCard(whole([]))).toEqual({ total: 0, rows: [], listed: 0, cut: false });
  });

  it("says no \"among the first\": nothing of the signal was left out of the narrowing", () => {
    const card = { title: "Urgent", window: "act today", empty: "Nothing urgent.", dialog: "URGENT jobs", linkLabel: "Show" };
    const narrowed = serverCard({ total: 260, rows: Array.from({ length: 200 }, () => row("not_touched")) });
    expect(windowWithSignal("act today", narrowed)).toBe("act today");
    expect(cardWithSignal(card, "urgent", family("not_touched"), narrowed)).toEqual({ ...card, empty: EMPTY_WITH_SIGNAL.urgent, dialog: "URGENT jobs · Not touched" });
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

describe("Shipments → Managers: a load that failed", () => {
  it("says the server's own words when it cannot answer just now: My reports with the users unreadable", () => {
    const said = "Who reports to you could not be read just now: try again in a moment";
    expect(loadFailedText({ code: "unavailable", message: said })).toBe(said);
    // As the client throws it: an Error with a code.
    expect(loadFailedText(Object.assign(new Error(said), { code: "unavailable", status: 503 }))).toBe(said);
  });

  it("says its plain line for anything else - a fault's own words are not for the page", () => {
    expect(loadFailedText({ code: "internal", message: "an internal error occurred" })).toBe(LOAD_FAILED);
    expect(loadFailedText({ code: "unknown", message: "request failed: status 502" })).toBe(LOAD_FAILED);
    expect(loadFailedText({ code: "permission_denied", message: "Managers only" })).toBe(LOAD_FAILED);
    expect(loadFailedText(new TypeError("Failed to fetch"))).toBe(LOAD_FAILED);
    expect(loadFailedText({ code: "unavailable", message: "  " })).toBe(LOAD_FAILED);
    expect(loadFailedText({ code: "unavailable" })).toBe(LOAD_FAILED);
    expect(loadFailedText(null)).toBe(LOAD_FAILED);
    expect(loadFailedText(undefined)).toBe(LOAD_FAILED);
    expect(loadFailedText("unavailable")).toBe(LOAD_FAILED);
    expect(LOAD_FAILED).toBe("Could not load Operations.");
  });

  it("says another tab's plain line when given one - and still the server's own words when it refuses", () => {
    const plain = "Could not load the money.";
    expect(loadFailedText({ code: "internal", message: "an internal error occurred" }, plain)).toBe(plain);
    expect(loadFailedText(null, plain)).toBe(plain);
    const said = "Who reports to you could not be read just now: try again in a moment";
    expect(loadFailedText({ code: "unavailable", message: said }, plain)).toBe(said);
  });
});

describe("Shipments → Managers: an answer that is still to come", () => {
  const asked = { enabled: true, isPending: false, isPlaceholderData: false };

  it("is loading while there is no answer yet - also when nothing is being fetched: no connection, the request held back", () => {
    // What the query reports offline on a first load: pending, and not fetching. It must not read as zeros.
    expect(isAnswerLoading({ ...asked, isPending: true })).toBe(true);
  });

  it("is loading while only the answer to an earlier filter is at hand", () => {
    expect(isAnswerLoading({ ...asked, isPlaceholderData: true })).toBe(true);
  });

  it("is not loading once the answer is there, nor after the load failed", () => {
    expect(isAnswerLoading(asked)).toBe(false);
  });

  it("is never loading for a question that is not asked: another tab is shown", () => {
    expect(isAnswerLoading({ enabled: false, isPending: true, isPlaceholderData: false })).toBe(false);
    expect(isAnswerLoading({ enabled: false, isPending: false, isPlaceholderData: true })).toBe(false);
  });
});

describe("Shipments → Managers: families of another tab", () => {
  const families: SignalFamily[] = [
    { key: "margin", kinds: ["margin"], label: "Margin", hint: "" },
    { key: "suppliers", kinds: ["supplier_invoice", "cost_after_billing"], label: "Suppliers", showing: "Supplier invoices", hint: "" },
  ];

  it("finds a family among the families given, by its key or by one of its kinds", () => {
    expect(familyOf(families, "margin")?.key).toBe("margin");
    expect(familyOf(families, " Margin ")?.key).toBe("margin");
    expect(familyOf(families, "cost_after_billing")?.key).toBe("suppliers");
    // The Cockpit's families are not these.
    expect(familyOf(families, "cutoff")).toBeNull();
    expect(familyOf(families, "")).toBeNull();
    expect(familyOf(families, null)).toBeNull();
    expect(signalOf("margin")).toBeNull();
  });

  it("narrows any row that carries tags with a kind, and keeps the row as it is", () => {
    const rows = [
      { id: "a", tags: [{ text: "Loss", urgent: true, kind: "margin" }] },
      { id: "b", tags: [{ text: "Claimed", urgent: false, kind: "supplier_invoice" }] },
      { id: "c", tags: [{ text: "Loss", urgent: true, kind: "margin" }, { text: "After billing", urgent: false, kind: "cost_after_billing" }] },
    ];
    const narrowed = listWithSignal({ total: 250, rows }, families[1]!);
    expect(narrowed.rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(narrowed).toMatchObject({ total: 2, listed: 3, cut: true });
    expect(listWithSignal({ total: 3, rows }, null)).toEqual({ total: 3, rows, listed: 3, cut: false });
  });
});

describe("Shipments → Managers: a card in the words of what it shows", () => {
  const card = { title: "Urgent", window: "act today", empty: "Nothing urgent.", dialog: "URGENT jobs", linkLabel: "Show" };
  const customs = family("customs");
  const cutoff = family("cutoff");

  it("is the card as it is for no signal", () => {
    expect(cardWithSignal(card, "urgent", null, { listed: 200, cut: true })).toBe(card);
  });

  it("narrowed, names the signal in the dialog's title and claims no more than none with this signal", () => {
    expect(cardWithSignal(card, "urgent", customs, { listed: 12, cut: false })).toEqual({
      ...card,
      empty: EMPTY_WITH_SIGNAL.urgent,
      dialog: "URGENT jobs · Customs to look at",
    });
    expect(cardWithSignal(card, "attention", customs, undefined).empty).toBe("No ATTENTION job with this signal.");
    // The chip's shorter name where the family has one.
    expect(showingLabel(cutoff)).toBe("Cut-offs");
    expect(cardWithSignal(card, "urgent", cutoff, undefined).dialog).toBe("URGENT jobs · Cut-offs");
  });

  it("narrowed in a card the server cut, says among how many it looked", () => {
    expect(cardWithSignal(card, "urgent", customs, { listed: 200, cut: true }).window).toBe("act today · among the first 200");
    expect(cardWithSignal(card, "urgent", customs, { listed: 12, cut: false }).window).toBe("act today");
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
