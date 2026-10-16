import { describe, expect, it } from "vitest";
import { categoryCounts, categoryOf, historyDays, isCurrentStamp } from "./history";

const ev = (kind: string, at: string, label = kind) => ({ kind, label, at, by: "Eva" });

describe("history categories", () => {
  it("sorts event kinds into categories", () => {
    expect(categoryOf("gateIn")).toBe("stamps");
    expect(categoryOf("stampVoided")).toBe("voids");
    expect(categoryOf("override")).toBe("release");
    expect(categoryOf("pinCheckFailed")).toBe("release");
    expect(categoryOf("pickupPinVerified")).toBe("release");
    expect(categoryOf("exceptionOpened")).toBe("exceptions");
    expect(categoryOf("shipmentUpdateFailed")).toBe("shipment");
    expect(categoryOf("customsFromShipment")).toBe("shipment");
    expect(categoryOf("sectionSaved")).toBe("records");
    expect(categoryOf("labelPrinted")).toBe("records");
    expect(categoryOf("somethingNew")).toBe("records");
  });
  it("puts the container, tally and re-weigh events together, their voids with the voids", () => {
    for (const k of ["reweighed", "addedToContainer", "removedFromContainer", "stuffed", "unstuffed", "leftInContainer", "notLoaded", "tallyReceived", "tallyShort", "tallyNotArrived"]) {
      expect(categoryOf(k)).toBe("cargo");
    }
    expect(categoryOf("tallyVoided")).toBe("voids");
    expect(categoryOf("leftInContainerVoided")).toBe("voids");
    expect(categoryCounts([ev("reweighed", "2026-10-14T08:00:00Z")])).toMatchObject({ cargo: 1 });
  });
  it("counts per category", () => {
    const counts = categoryCounts([ev("gateIn", "2026-10-14T08:00:00Z"), ev("gateOut", "2026-10-14T09:00:00Z"), ev("archived", "2026-10-14T10:00:00Z")]);
    expect(counts).toMatchObject({ stamps: 2, records: 1, voids: 0 });
  });
});

describe("history days", () => {
  const events = [
    ev("created", "2026-10-13T21:30:00Z"), // 23:30 Prague, the 13th
    ev("gateIn", "2026-10-13T22:30:00Z"), // 00:30 Prague, the 14th
    ev("releaseGate", "2026-10-14T08:00:00Z", "first"),
    ev("releaseGate", "2026-10-14T08:00:00Z", "second"),
  ];
  it("groups by Prague day, newest first, same-time events latest first", () => {
    const days = historyDays(events);
    expect(days.map((d) => d.day)).toEqual(["2026-10-14", "2026-10-13"]);
    expect(days[0]!.events.map((e) => e.label)).toEqual(["second", "first", "gateIn"]);
  });
  it("keeps only the chosen categories", () => {
    const days = historyDays(events, ["stamps"]);
    expect(days.flatMap((d) => d.events.map((e) => e.kind))).toEqual(["gateIn"]);
  });
});

describe("current stamp", () => {
  it("is voidable only while the record still carries that stamp", () => {
    const m = { gateIn: "2026-10-14T08:00:00.000Z", gateOut: null, impRelease: null, expDraft: null, expReceipt: null };
    expect(isCurrentStamp(m, { kind: "gateIn", at: "2026-10-14T08:00:00Z" })).toBe(true);
    expect(isCurrentStamp(m, { kind: "gateIn", at: "2026-10-13T08:00:00Z" })).toBe(false); // stamped again since
    expect(isCurrentStamp(m, { kind: "gateOut", at: "2026-10-14T08:00:00Z" })).toBe(false);
    expect(isCurrentStamp(m, { kind: "releaseGate", at: "2026-10-14T08:00:00Z" })).toBe(false);
  });
});
