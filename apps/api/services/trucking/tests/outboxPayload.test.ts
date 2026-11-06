import { describe, expect, it } from "vitest";
import { parseOutboxRow, podFactId, stampFactId, type StampPayload, type TruckingOutboxPayload } from "../lib/outboxPayload";
import type { TruckingOutboxKind } from "../schemas/truckingOutbox.schema";

const row = (kind: TruckingOutboxKind, payload: unknown) => ({ id: "row-1", kind, payload: payload as TruckingOutboxPayload });

describe("parseOutboxRow", () => {
  it("gives each kind its payload", () => {
    expect(parseOutboxRow(row("planned", { pickupDate: "2026-10-20" }))).toEqual({ kind: "planned", payload: { pickupDate: "2026-10-20" } });
    expect(parseOutboxRow(row("billing", {}))).toEqual({ kind: "billing", payload: {} });
    const costs = { sourceRef: "trucking:c1", buying: [], selling: [] };
    expect(parseOutboxRow(row("costs", costs))).toEqual({ kind: "costs", payload: costs });
    expect(parseOutboxRow(row("real_costs", { sourceRef: "trucking:t1", realLines: [] })).kind).toBe("real_costs");
    const announce = { shipmentId: "s", tripRef: "LCZ1", tripKind: "LTL", haulierName: "", plate: "", driver: "", driverPhone: "", expectedAt: "2026-10-20T08:00:00Z" };
    expect(parseOutboxRow(row("expect_departure", announce)).kind).toBe("expect_departure");
    expect(parseOutboxRow(row("expect_arrival", { ...announce, pieces: 2, weightKg: 100, cbm: 1 })).kind).toBe("expect_arrival");
    expect(parseOutboxRow(row("cancel_expected", { shipmentId: "s", tripRef: "LCZ1" })).kind).toBe("cancel_expected");
  });

  it("refuses a payload that does not fit its kind instead of sending it", () => {
    expect(() => parseOutboxRow(row("costs", { sourceRef: "x" }))).toThrow("row-1: the payload does not fit kind costs");
    expect(() => parseOutboxRow(row("planned", { pickupDate: 5 }))).toThrow(/kind planned/);
    expect(() => parseOutboxRow(row("expect_arrival", { shipmentId: "s", tripRef: "L", expectedAt: "x" }))).toThrow(/expect_arrival/);
    expect(() => parseOutboxRow(row("cancel_expected", null))).toThrow(/cancel_expected/);
  });
});

describe("what the job's timeline gets", () => {
  it("takes a stamp, and refuses one it doesn't know", () => {
    const stamp = { stamp: "pickedUp", at: "2026-11-05T09:00:00.000Z" };
    expect(parseOutboxRow(row("stamp", stamp))).toEqual({ kind: "stamp", payload: stamp });
    expect(parseOutboxRow(row("stamp", { ...stamp, voided: true }))).toEqual({ kind: "stamp", payload: { ...stamp, voided: true } });
    expect(() => parseOutboxRow(row("stamp", { stamp: "delivered", at: "x" }))).toThrow(/kind stamp/);
    expect(() => parseOutboxRow(row("stamp", { stamp: "confirmed" }))).toThrow(/kind stamp/);
  });

  it("takes a POD with its file, and refuses one without", () => {
    const pod = { fileName: "pod.pdf", contentType: "application/pdf", sha256: "abc", storageKey: "c/1/x", stampedAt: "2026-11-05T09:00:00.000Z" };
    expect(parseOutboxRow(row("pod", pod)).payload).toEqual(pod);
    expect(() => parseOutboxRow(row("pod", { fileName: "pod.pdf" }))).toThrow();
  });

  it("takes a voided POD by its stamp's instant, and refuses a void that names none", () => {
    const voided = { stampedAt: "2026-11-05T09:00:00.000Z", voided: true };
    expect(parseOutboxRow(row("pod", voided))).toEqual({ kind: "pod", payload: voided });
    expect(() => parseOutboxRow(row("pod", { voided: true }))).toThrow(/kind pod/);
    expect(() => parseOutboxRow(row("pod", { stampedAt: "2026-11-05T09:00:00.000Z", voided: false }))).toThrow(/kind pod/);
  });

  it("takes a delivery advice with its words, and refuses one without", () => {
    const advice = { at: "2026-11-05T09:00:00.000Z", text: "By phone to Jan" };
    expect(parseOutboxRow(row("delivery_advice", advice)).payload).toEqual(advice);
    expect(() => parseOutboxRow(row("delivery_advice", {}))).toThrow();
  });
});

describe("which fact on the job's timeline a stamp is", () => {
  const T1 = "2026-11-05T09:00:00.000Z";
  const T2 = "2026-11-05T11:30:00.000Z";

  it("is the same for a stamp and its void, so the void takes back exactly that fact", () => {
    const stamp: StampPayload = { stamp: "confirmed", at: T1 };
    const itsVoid: StampPayload = { ...stamp, voided: true };
    expect(stampFactId("c1", stamp)).toBe(`stamp:c1:confirmed:${T1}`);
    expect(stampFactId("c1", itsVoid)).toBe(stampFactId("c1", stamp));
  });

  it("is a new one when the stamp is set again after a void, so a void sent late misses it", () => {
    expect(stampFactId("c1", { stamp: "confirmed", at: T2 })).not.toBe(stampFactId("c1", { stamp: "confirmed", at: T1 }));
    expect(stampFactId("c1", { stamp: "pickedUp", at: T1 })).not.toBe(stampFactId("c1", { stamp: "confirmed", at: T1 }));
    expect(stampFactId("c2", { stamp: "confirmed", at: T1 })).not.toBe(stampFactId("c1", { stamp: "confirmed", at: T1 }));
  });

  it("is a POD's by its stamp's instant, not its file (a replaced file keeps the stamp)", () => {
    expect(podFactId("c1", T1)).toBe(`pod:c1:${T1}`);
    expect(podFactId("c1", T2)).not.toBe(podFactId("c1", T1));
  });
});
