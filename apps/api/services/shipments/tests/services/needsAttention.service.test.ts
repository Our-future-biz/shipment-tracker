import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ needsAttentionCandidates: vi.fn() }));
const events = vi.hoisted(() => ({ factsOfKinds: vi.fn() }));
const holidays = vi.hoisted(() => ({ _internalHolidaysCzNational: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ holidays }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));

import { CARGO_IN_EVENT_KINDS, NEEDS_ATTENTION_JOB_LIMIT } from "../../lib/needsAttention";
import { CLOSING_NOT_KNOWN, needsAttentionService } from "../../services/needsAttention.service";

// The reads of the Shipments list's Needs Attention, against stand-ins for the repositories: what
// it asks for, in which bounds, what it says when a read fails or is cut, and that callers at the
// same moment share one computation. The rules themselves are tests/needsAttention.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Friday 20 Nov 2026, 00:30 in Prague - still the 19th in UTC. URGENT up to Mon 23, ATTENTION to Wed 25.
const NOW = new Date("2026-11-19T23:30:00Z");

const row = (n: number, over = {}) => ({
  id: `id-${n}`,
  jobNumber: `CZFCL${String(n).padStart(8, "0")}`,
  customerId: null,
  customer: "ACME s.r.o.",
  tradeDirection: "Export",
  status: "Booked [EXP]",
  cargoReadinessDate: null,
  pickupDate: null,
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  actualDeliveryDate: null,
  etaWarehouse: null,
  warehouseReceivedDate: null,
  plannedDeliveryDate: null,
  closingDate: null,
  closingTime: "",
  vgmClosing: null,
  vgmClosingTime: "",
  vgm: "",
  siClosing: null,
  siClosingTime: "",
  shippingInstructions: "",
  ams: "",
  amsDeadline: null,
  amsDeadlineTime: "",
  isf: "",
  isfDeadline: null,
  isfDeadlineTime: "",
  ...over,
});
const event = (shipmentId: string, kind: string) => ({ shipmentId, kind, occurredOn: "2026-11-18", effect: "", resolvedAt: null });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

beforeEach(() => {
  vi.resetAllMocks();
  shipments.needsAttentionCandidates.mockResolvedValue([]);
  events.factsOfKinds.mockResolvedValue([]);
  holidays._internalHolidaysCzNational.mockResolvedValue({ dates: [] });
});

describe("Needs Attention's reads", () => {
  it("reads the holidays once, then the jobs within the two windows of that one day - and no events when no Closing hangs on them", async () => {
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { estimatedDeparture: "2026-11-23" }), row(2, { pickupDate: "2026-11-25" })]);
    const lists = await needsAttentionService.lists(COMPANY, NOW);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledWith({ from: "2026-10-06", to: "2027-01-04" }, { authData: { userID: "", companyID: COMPANY, role: "user" } });
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledTimes(1);
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledWith(COMPANY, { from: "2026-11-20", until: "2026-11-25", passedSince: "2026-11-13" }, NEEDS_ATTENTION_JOB_LIMIT + 1);
    expect(events.factsOfKinds).not.toHaveBeenCalled();
    expect(ids(lists.within24h)).toEqual(["id-1"]);
    expect(ids(lists.within48h)).toEqual(["id-2"]);
    expect(lists).toMatchObject({ capped: false, holidaysKnown: true, notKnown: [] });
  });

  it("counts the working days with the company's own days off: the windows and the read reach further", async () => {
    holidays._internalHolidaysCzNational.mockResolvedValue({ dates: ["2026-11-23"] });
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { estimatedDeparture: "2026-11-24" }), row(2, { estimatedDeparture: "2026-11-26" })]);
    const lists = await needsAttentionService.lists(COMPANY, NOW);
    expect(shipments.needsAttentionCandidates.mock.lastCall![1]).toEqual({ from: "2026-11-20", until: "2026-11-26", passedSince: "2026-11-13" });
    expect(ids(lists.within24h)).toEqual(["id-1"]);
    expect(ids(lists.within48h)).toEqual(["id-2"]);
  });

  it("says so when the holidays could not be read, and still answers: weekends and the public holidays only", async () => {
    holidays._internalHolidaysCzNational.mockRejectedValue(new Error("the holidays service is down"));
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { estimatedDeparture: "2026-11-23" })]);
    const lists = await needsAttentionService.lists(COMPANY, NOW);
    expect(lists.holidaysKnown).toBe(false);
    expect(shipments.needsAttentionCandidates.mock.lastCall![1]).toEqual({ from: "2026-11-20", until: "2026-11-25", passedSince: "2026-11-13" });
    expect(ids(lists.within24h)).toEqual(["id-1"]);
  });

  it("reads the timelines of the jobs with an open Closing only, in one query, and drops a Closing the cargo made", async () => {
    shipments.needsAttentionCandidates.mockResolvedValue([
      row(1, { closingDate: "2026-11-19", closingTime: "14:00" }),
      row(2, { closingDate: "2026-11-23" }),
      row(3, { closingDate: "2026-11-19", warehouseReceivedDate: "2026-11-18" }),
      row(4, { closingDate: "2026-11-19", actualDeparture: "2026-11-19" }),
      row(5, { estimatedArrival: "2026-11-20" }),
    ]);
    events.factsOfKinds.mockResolvedValue([event("id-2", "gate_in")]);
    const lists = await needsAttentionService.lists(COMPANY, NOW);
    expect(events.factsOfKinds).toHaveBeenCalledTimes(1);
    // Only what shows the cargo is in: no holds, rolls, hauliers or PODs.
    expect(events.factsOfKinds).toHaveBeenCalledWith(["id-1", "id-2"], COMPANY, ["picked_up", "loaded", "gate_in"]);
    expect(CARGO_IN_EVENT_KINDS).toEqual(["picked_up", "loaded", "gate_in"]);
    expect(lists.within24h.map((i) => [i.id, i.deadlines.map((d) => `${d.field}${d.missed ? " missed" : ""}`)])).toEqual([
      ["id-1", ["closingDate missed"]],
      ["id-5", ["estimatedArrival"]],
    ]);
    expect(lists.notKnown).toEqual([]);
  });

  it("withholds a missed Closing and names what is not known when the tracking events could not be read - a Closing still ahead and the rest still answer", async () => {
    shipments.needsAttentionCandidates.mockResolvedValue([
      row(1, { closingDate: "2026-11-19" }),
      row(2, { closingDate: "2026-11-19", vgmClosing: "2026-11-20" }),
      // Monday's Closing is still ahead: its date alone says it is due.
      row(3, { closingDate: "2026-11-23" }),
    ]);
    events.factsOfKinds.mockRejectedValue(new Error("the events table is locked"));
    const lists = await needsAttentionService.lists(COMPANY, NOW);
    expect(lists.notKnown).toEqual([CLOSING_NOT_KNOWN]);
    expect(lists.within24h.map((i) => [i.id, i.deadlines.map((d) => d.field)])).toEqual([
      ["id-2", ["vgmClosing"]],
      ["id-3", ["closingDate"]],
    ]);
  });

  it("fails when the jobs could not be read: an empty list would say nothing is due", async () => {
    shipments.needsAttentionCandidates.mockRejectedValue(new Error("the database is away"));
    await expect(needsAttentionService.lists(COMPANY, NOW)).rejects.toThrow("the database is away");
  });

  it("judges at most the limit of jobs and says when there were more", async () => {
    const many = Array.from({ length: NEEDS_ATTENTION_JOB_LIMIT + 1 }, (_, n) => row(n, { estimatedDeparture: "2026-11-20" }));
    shipments.needsAttentionCandidates.mockResolvedValue(many);
    const cut = await needsAttentionService.lists(COMPANY, NOW);
    expect(cut.capped).toBe(true);
    expect(cut.within24h).toHaveLength(NEEDS_ATTENTION_JOB_LIMIT);
    shipments.needsAttentionCandidates.mockResolvedValue(many.slice(0, NEEDS_ATTENTION_JOB_LIMIT));
    expect((await needsAttentionService.lists(COMPANY, NOW)).capped).toBe(false);
  });

  it("names the URGENT list's jobs for the tile and its list: the same ids, in the same order", async () => {
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { estimatedDeparture: "2026-11-25" }), row(2, { pickupDate: "2026-11-23" }), row(3, { siClosing: "2026-11-16" })]);
    expect(await needsAttentionService.urgentIds(COMPANY, NOW)).toEqual(ids((await needsAttentionService.lists(COMPANY, NOW)).within24h));
    expect(await needsAttentionService.urgentIds(COMPANY, NOW)).toEqual(["id-3", "id-2"]);
  });
});

describe("callers at the same moment", () => {
  const OTHER = "86f202b1-7449-441b-9c5b-5bf4d89f8d99";
  /** A read that answers when the test says so. */
  const held = () => {
    let release!: (rows: unknown[]) => void;
    const rows = new Promise<unknown[]>((resolve) => (release = resolve));
    return { rows, release };
  };

  // Without a `now` of its own a caller is answered as of the clock: held here at the instant above.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("share one computation while it is pending: the cards and the tile's count of one page load cost one", async () => {
    const read = held();
    shipments.needsAttentionCandidates.mockReturnValue(read.rows);
    const cards = needsAttentionService.lists(COMPANY);
    const tile = needsAttentionService.urgentIds(COMPANY);
    const list = needsAttentionService.urgentIds(COMPANY);
    read.release([row(1, { estimatedDeparture: "2026-11-20" }), row(2, { closingDate: "2026-11-23" })]);
    expect(ids((await cards).within24h)).toEqual(["id-1", "id-2"]);
    expect(await tile).toEqual(["id-1", "id-2"]);
    expect(await list).toEqual(["id-1", "id-2"]);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledTimes(1);
    expect(events.factsOfKinds).toHaveBeenCalledTimes(1);
  });

  it("keep nothing once it is answered: the next request reads again, so an edit shows at once", async () => {
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { vgmClosing: "2026-11-20", vgm: "Pending" })]);
    expect(await needsAttentionService.urgentIds(COMPANY)).toEqual(["id-1"]);
    // Somebody confirms the VGM.
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { vgmClosing: "2026-11-20", vgm: "Confirmed (Green)" })]);
    expect(await needsAttentionService.urgentIds(COMPANY)).toEqual([]);
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledTimes(2);
  });

  it("share nothing across companies", async () => {
    const [mine, theirs] = [held(), held()];
    shipments.needsAttentionCandidates.mockImplementation((companyId: string) => (companyId === COMPANY ? mine.rows : theirs.rows));
    const a = needsAttentionService.urgentIds(COMPANY);
    const b = needsAttentionService.urgentIds(OTHER);
    mine.release([row(1, { estimatedDeparture: "2026-11-20" })]);
    theirs.release([row(2, { estimatedDeparture: "2026-11-20" })]);
    expect(await a).toEqual(["id-1"]);
    expect(await b).toEqual(["id-2"]);
    expect(shipments.needsAttentionCandidates.mock.calls.map((call) => call[0])).toEqual([COMPANY, OTHER]);
  });

  it("fail together when the shared read fails, and the next request tries again", async () => {
    shipments.needsAttentionCandidates.mockRejectedValueOnce(new Error("the database is away"));
    const [first, second] = await Promise.allSettled([needsAttentionService.lists(COMPANY), needsAttentionService.urgentIds(COMPANY)]);
    expect(first).toMatchObject({ status: "rejected", reason: new Error("the database is away") });
    expect(second).toMatchObject({ status: "rejected", reason: new Error("the database is away") });
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledTimes(1);
    shipments.needsAttentionCandidates.mockResolvedValue([row(1, { estimatedDeparture: "2026-11-20" })]);
    expect(await needsAttentionService.urgentIds(COMPANY)).toEqual(["id-1"]);
  });

  it("a caller that names its instant is answered for that instant, alone", async () => {
    const read = held();
    shipments.needsAttentionCandidates.mockReturnValueOnce(read.rows).mockResolvedValue([row(1, { estimatedDeparture: "2026-11-27" })]);
    const shared = needsAttentionService.urgentIds(COMPANY);
    // A week later that ETD is today: judged on its own, not on the pending answer of the 20th.
    expect(await needsAttentionService.urgentIds(COMPANY, new Date("2026-11-27T10:00:00Z"))).toEqual(["id-1"]);
    read.release([row(1, { estimatedDeparture: "2026-11-27" })]);
    expect(await shared).toEqual([]);
    expect(shipments.needsAttentionCandidates).toHaveBeenCalledTimes(2);
  });
});
