import { describe, expect, it } from "vitest";
import { inOnPickupRun, legStamp, nextCheck, saveQueue } from "./transportLegs";

const IN = "2026-11-20T08:00:00.000Z";
const OUT = "2026-11-20T10:00:00.000Z";
const legs = [{ leg: "IN" }, { leg: "OUT" }, { leg: "CFS" }];

describe("the gate stamp a transport leg's row shows (W17)", () => {
  it("inbound cargo: the gate-in on the IN row, the gate-out on the OUT row", () => {
    const m = { visit: "příjem", gateIn: IN, gateOut: OUT, transportLegs: legs };
    expect(legStamp("IN", m)).toBe(IN);
    expect(legStamp("OUT", m)).toBe(OUT);
    expect(legStamp("CFS", m)).toBe("");
  });

  it("outbound cargo: the pick-up truck's gate-in is the OUT row's, never the IN row's", () => {
    const m = { visit: "výdej", gateIn: IN, gateOut: null, transportLegs: legs };
    expect(legStamp("IN", m)).toBe("");
    expect(legStamp("OUT", m)).toBe(IN);
    // Once it leaves, the OUT row shows the gate-out.
    expect(legStamp("OUT", { ...m, gateOut: OUT })).toBe(OUT);
    expect(legStamp("OUT", { ...m, gateIn: null })).toBe("");
  });

  it("outbound cargo a Trucking pick-up run brought in: its gate-in is the IN leg's", () => {
    const trip = (tripKind?: string) => [{ leg: "IN", source: { kind: "trucking", tripRef: "LCZ1", ...(tripKind ? { tripKind } : {}) } }, { leg: "OUT" }];
    const m = { visit: "výdej", gateIn: IN, gateOut: null, transportLegs: trip("PICKUP_RUN") };
    expect(legStamp("IN", m)).toBe(IN);
    expect(legStamp("OUT", m)).toBe("");
    // A marker from before the trip kind was kept is a pick-up run; a delivery run is not.
    expect(legStamp("IN", { ...m, transportLegs: trip() })).toBe(IN);
    expect(legStamp("IN", { ...m, transportLegs: trip("DELIVERY_RUN") })).toBe("");
  });
});

describe("checklist icon click cycle", () => {
  it("goes n/a → done → pending → problem → n/a", () => {
    expect(nextCheck("n")).toBe("g");
    expect(nextCheck("g")).toBe("a");
    expect(nextCheck("a")).toBe("r");
    expect(nextCheck("r")).toBe("n");
    expect(nextCheck(undefined)).toBe("g");
  });
});

describe("inOnPickupRun — a Trucking pick-up run brings the cargo in on the IN leg", () => {
  it("is a pick-up run (or a marker from before the kind was kept), not a delivery run or a hand-typed leg", () => {
    const trip = (tripKind?: string) => [{ leg: "IN", source: { kind: "trucking", tripRef: "LCZ1", ...(tripKind ? { tripKind } : {}) } }];
    expect(inOnPickupRun({ transportLegs: trip("PICKUP_RUN") })).toBe(true);
    expect(inOnPickupRun({ transportLegs: trip() })).toBe(true);
    expect(inOnPickupRun({ transportLegs: trip("DELIVERY_RUN") })).toBe(false);
    expect(inOnPickupRun({ transportLegs: [{ leg: "IN" }] })).toBe(false);
    expect(inOnPickupRun({})).toBe(false);
  });
});

describe("saveQueue — the gate job's saves in turn (W2 review)", () => {
  it("starts each save once the one before settled, also after a failed one", async () => {
    const inTurn = saveQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const first = inTurn(
      () =>
        new Promise<void>((resolve) => {
          order.push("first start");
          releaseFirst = () => {
            order.push("first end");
            resolve();
          };
        }),
    );
    const failing = inTurn(async () => {
      order.push("second");
      throw new Error("refused");
    });
    const third = inTurn(async () => {
      order.push("third");
      return 3;
    });
    await Promise.resolve();
    expect(order).toEqual(["first start"]);
    releaseFirst();
    await first;
    await expect(failing).rejects.toThrow("refused");
    await expect(third).resolves.toBe(3);
    expect(order).toEqual(["first start", "first end", "second", "third"]);
  });
});
