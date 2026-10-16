import { describe, expect, it } from "vitest";
import {
  addBlocked,
  containerKind,
  containerStampBlocked,
  containerStampWrites,
  dropHouse,
  fillPct,
  fillTone,
  moveHouse,
  nextContainerStamp,
  LEGACY_HOUSE,
  openHouses,
  planCandidates,
  planTotals,
  strippingComplete,
  tallyExempt,
} from "./containerPlan";

type M = Parameters<typeof addBlocked>[0] & { id: string; pod: string; etd: string; positionRef: string; gateRef: string };
const T = "2026-10-14T08:00:00.000Z";
const mv = (over: Partial<M> = {}): M => ({
  id: "m1",
  visit: "příjem",
  expReceipt: T,
  impRelease: null,
  leftAt: null,
  receivedAt: null,
  archivedAt: null,
  openExceptions: 0,
  overridden: false,
  container: null,
  pod: "DEHAM",
  etd: "2026-10-20",
  positionRef: "WCZ2026000001",
  gateRef: "G1",
  ...over,
});
const inContainer = (id: string, number: string) =>
  ({ id, number, equipment: "", direction: "Loading", kind: "export", status: "Planning", seal: "", gateInAt: null, gateOutAt: null, stuffedAt: null, stuffedBy: "", tallyOutcome: "", tallyPieces: null, tickedAt: null, tickedBy: "", tallyRequired: false }) as const;

describe("who may be added", () => {
  it("export containers take inbound cargo received in the warehouse, not on hold, not left", () => {
    expect(containerKind("Loading")).toBe("export");
    expect(addBlocked(mv(), "Loading")).toBeNull();
    expect(addBlocked(mv({ visit: "výdej" }), "Loading")).toMatch(/Outbound/);
    expect(addBlocked(mv({ expReceipt: null }), "Loading")).toMatch(/Not received/);
    expect(addBlocked(mv({ leftAt: T }), "Loading")).toMatch(/left/);
    expect(addBlocked(mv({ openExceptions: 1 }), "Loading")).toMatch(/On hold/);
    expect(addBlocked(mv({ openExceptions: 1, overridden: true }), "Loading")).toBeNull();
    expect(addBlocked(mv({ archivedAt: T }), "Loading")).toBe("Archived");
  });

  it("import containers take outbound cargo not received yet", () => {
    expect(containerKind("Unloading")).toBe("import");
    expect(addBlocked(mv({ visit: "výdej", expReceipt: null }), "Unloading")).toBeNull();
    expect(addBlocked(mv({ visit: "výdej", receivedAt: T }), "Unloading")).toMatch(/Already received/);
    expect(addBlocked(mv(), "Unloading")).toMatch(/Inbound/);
  });

  it("a position is in at most one container", () => {
    expect(addBlocked(mv({ container: inContainer("c2", "MSKU1234565") }), "Loading", "c1")).toBe("In container MSKU1234565");
    expect(addBlocked(mv({ container: inContainer("c1", "MSKU1234565") }), "Loading", "c1")).toBe("Already in this container");
  });

  it("offers candidates by POD, then ETD, then ref", () => {
    const list = [
      mv({ id: "a", pod: "USNYC", etd: "2026-10-18", positionRef: "WCZ2026000003" }),
      mv({ id: "b", pod: "DEHAM", etd: "2026-10-25", positionRef: "WCZ2026000002" }),
      mv({ id: "c", pod: "DEHAM", etd: "2026-10-21", positionRef: "WCZ2026000009" }),
      mv({ id: "d", pod: "DEHAM", etd: "2026-10-21", positionRef: "WCZ2026000001" }),
      mv({ id: "e", expReceipt: null }),
    ];
    expect(planCandidates(list, "Loading").map((m) => m.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("totals against the capacity", () => {
  it("adds up the houses and the fill of the type", () => {
    const t = planTotals("20' DV", [
      { pieces: 10, kg: 14_100, cbm: 15.5 },
      { pieces: 2, kg: 0, cbm: 0 },
    ]);
    expect(t).toMatchObject({ pieces: 12, kg: 14_100, cbm: 15.5, capacityCbm: 31, capacityKg: 28_200, fillCbmPct: 50, fillKgPct: 50, overCapacity: false });
    expect(fillPct(t)).toBe(50);
  });
  it("warns over capacity by volume or weight", () => {
    expect(planTotals("40' HC", [{ pieces: 1, kg: 1000, cbm: 80 }]).overCapacity).toBe(true);
    expect(planTotals("40' HC", [{ pieces: 1, kg: 27_000, cbm: 10 }]).overCapacity).toBe(true);
    expect(fillTone(101)).toBe("bg-red-500");
    expect(fillTone(95)).toBe("bg-amber-500");
    expect(fillTone(40)).toBe("bg-indigo-500");
  });
  it("knows no capacity for an unknown type", () => {
    const t = planTotals("", [{ pieces: 1, kg: 1, cbm: 1 }]);
    expect(t.capacityCbm).toBeNull();
    expect(fillPct(t)).toBeNull();
  });
});

describe("house order", () => {
  it("moves a house up and down, and drops one before another", () => {
    expect(moveHouse(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveHouse(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(dropHouse(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(dropHouse(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
    expect(dropHouse(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});

type C = Parameters<typeof containerStampBlocked>[0];
const house = (over: Partial<C["positions"][number]> = {}) => ({ movementId: "m", stuffedAt: null, tallyOutcome: "", addedBy: "Clerk", visit: "výdej", ...over }) as C["positions"][number];
const ctr = (over: Partial<C> = {}): C => ({ direction: "Unloading", gateInAt: null, strippingStartedAt: null, closedAt: null, gateOutAt: null, positions: [], ...over });

describe("container stamps in strict order", () => {
  it("import: gate-in, start stripping, gate-out once every house is accounted for", () => {
    expect(nextContainerStamp(ctr())).toBe("gateIn");
    expect(containerStampBlocked(ctr(), "strippingStart")).toMatch(/gate-in first/);
    const arrived = ctr({ gateInAt: T, positions: [house(), house({ tallyOutcome: "received" })] });
    expect(nextContainerStamp(arrived)).toBe("strippingStart");
    expect(containerStampBlocked(arrived, "gateOut")).toMatch(/1 house not accounted for/);
    expect(openHouses(arrived)).toHaveLength(1);
    const done = ctr({ gateInAt: T, strippingStartedAt: T, positions: [house({ tallyOutcome: "short" }), house({ tallyOutcome: "received" })] });
    expect(strippingComplete(done)).toBe(true);
    expect(containerStampBlocked(done, "gateOut")).toBeNull();
    expect(containerStampBlocked(done, "close")).toMatch(/Only an export/);
  });

  it("import: an empty container needs the start of stripping; old register links are not tallied", () => {
    expect(containerStampBlocked(ctr({ gateInAt: T }), "gateOut")).toMatch(/Start the stripping first/);
    expect(containerStampBlocked(ctr({ gateInAt: T, strippingStartedAt: T }), "gateOut")).toBeNull();
    const legacy = ctr({ gateInAt: T, positions: [house({ addedBy: LEGACY_HOUSE })] });
    expect(openHouses(legacy)).toHaveLength(0);
    expect(strippingComplete(legacy)).toBe(false);
    expect(containerStampBlocked(legacy, "gateOut")).toBeNull();
    expect(tallyExempt(house({ addedBy: LEGACY_HOUSE }), "Unloading")).toMatch(/old container register/);
    expect(tallyExempt(house({ visit: "příjem" }), "Unloading")).toMatch(/Inbound cargo/);
    expect(tallyExempt(house(), "Unloading")).toBeNull();
  });

  it("export: gate-in, close with something stuffed, then gate-out", () => {
    const planned = ctr({ direction: "Loading", positions: [house()] });
    expect(containerStampBlocked(planned, "close")).toMatch(/gate-in first/);
    const atDock = { ...planned, gateInAt: T };
    expect(nextContainerStamp(atDock)).toBe("close");
    expect(containerStampBlocked(atDock, "close")).toMatch(/Nothing is stuffed/);
    expect(containerStampBlocked(atDock, "gateOut")).toMatch(/Close the stuffing/);
    const stuffed = { ...atDock, positions: [house({ stuffedAt: T }), house()] };
    expect(containerStampBlocked(stuffed, "close")).toBeNull();
    expect(nextContainerStamp({ ...stuffed, closedAt: T })).toBe("gateOut");
    expect(nextContainerStamp({ ...stuffed, closedAt: T, gateOutAt: T })).toBeNull();
  });

  it("says what the export gate-out writes to the shipments", () => {
    const c = { direction: "Loading", plate: "", positions: [house({ stuffedAt: T }), house()] };
    const text = containerStampWrites(c, "gateOut", "4AB 1234");
    expect(text).toMatch(/1 stuffed house leaves the warehouse/);
    expect(text).toMatch(/released date and the truck plate 4AB 1234/);
    expect(text).toMatch(/1 planned house not stuffed stays/);
    expect(containerStampWrites(c, "gateIn")).toMatch(/Nothing is written/);
  });
});
