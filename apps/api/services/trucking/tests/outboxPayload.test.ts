import { describe, expect, it } from "vitest";
import { parseOutboxRow, type TruckingOutboxPayload } from "../lib/outboxPayload";
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
