import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultReleaseGates, gateMovementService, needsAttention } from "../services/gateMovement.service";
import { gateFieldsFromShipment, warehouseImportService } from "../services/warehouseImport.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { truckingExpectService } from "../services/truckingExpect.service";
import { shipmentData } from "./shipmentFakes";

// Domestic positions (Trucking's LTL through our hub): in at the gate-in, out with the WH release
// (which stamps the gate-out); no customs, no pick-up PIN.

const { publish, shipmentUpdate } = vi.hoisted(() => ({
  publish: vi.fn(async (_e: unknown) => "msg"),
  shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})),
}));
vi.mock("../topics", () => ({ warehouseGateStamped: { publish } }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const CUSTOMS = /customs|mrn|b\/l|vgm|booking|delivery order|interchange|pick-up pin/i;

describe("Domestic mapping and release gates", () => {
  it("maps a Domestic shipment to an inbound LCL consolidation without customs", () => {
    expect(gateFieldsFromShipment({ tradeDirection: "Domestic", loadType: "Full Load", freightMode: "Road", customsProcedure: "T1" })).toEqual({
      handling: "Domestic",
      visit: "příjem",
      operationType: "LCL consolidation",
      customsMode: "SCP",
      customsStatus: "Waiting For Commercial Paperwork",
    });
  });

  it("leaves Import and Export as they were", () => {
    expect(gateFieldsFromShipment({ tradeDirection: "Import", loadType: "Consolidation" })).toMatchObject({ handling: "Import", visit: "výdej", operationType: "LCL consolidation" });
    expect(gateFieldsFromShipment({ tradeDirection: "Export", loadType: "Full Load", freightMode: "Sea" })).toMatchObject({ handling: "Export", visit: "příjem", operationType: "FCL stuffing" });
    expect(gateFieldsFromShipment({ tradeDirection: "" })).toMatchObject({ handling: "Import", visit: "výdej" });
    expect(defaultReleaseGates("Import", "LCL consolidation", "Paperwork Verified", true).map((g) => g.g)).toEqual([
      "B/L / release order",
      "Customs",
      "Charges",
      "Storage settled",
      "Pick-up PIN verified",
    ]);
    expect(defaultReleaseGates("Export", "FCL stuffing", "Paperwork Verified").map((g) => g.g)).toContain("VGM submitted");
  });

  it("has no customs-related release gate and no pick-up PIN line", () => {
    const gates = defaultReleaseGates("Domestic", "LCL consolidation", "Paperwork Verified", true);
    expect(gates.map((g) => g.g)).toEqual(["Charges", "Storage settled"]);
    expect(gates.some((g) => CUSTOMS.test(g.g))).toBe(false);
    expect(gates.every((g) => g.s === "OK")).toBe(true);
    // Never flagged for a missing MRN.
    expect(
      needsAttention({ visit: "výdej", handling: "Domestic", mrn: "", customsStatus: "Paperwork Verified", status: "In Warehouse", overridden: false, releaseGates: gates, impRelease: null, gateOut: null }),
    ).toBe(false);
  });
});

describe("Domestic positions at the gate", () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockImplementation(async () => "msg");
  });

  async function domestic() {
    const c = randomUUID();
    const shipmentId = randomUUID();
    shipmentData.set(shipmentId, { tradeDirection: "Domestic", customsStatus: "Paperwork Verified" });
    const r = await truckingExpectService.expectArrival(c, user, {
      shipmentId,
      tripRef: "LCZ26-0100",
      tripKind: "PICKUP_RUN",
      haulierName: "Rapid",
      plate: "1AB 2345",
      driver: "",
      driverPhone: "",
      expectedAt: "2026-10-15T08:00:00.000Z",
      pieces: 2,
      weightKg: 400,
      cbm: 1,
    });
    return { c, shipmentId, ...r };
  }

  it("is made inbound, unlinked from the pick-up PIN, with no customs lines; customs changes add none", async () => {
    const { c, gateMovementId } = await domestic();
    const m = await gateMovementService.get(gateMovementId, c);
    expect(m).toMatchObject({ handling: "Domestic", visit: "příjem", operationType: "LCL consolidation", pickupShipmentId: null, pickup: null, needsAttention: false });
    expect(m.releaseGates.map((g) => g.g)).toEqual(["Charges", "Storage settled"]);
    const after = await gateMovementService.update(gateMovementId, c, user, { customsStatus: "Under Customs Clearance" });
    expect(after.releaseGates.some((g) => g.g === "Customs")).toBe(false);
    const refreshed = await warehouseImportService.refreshFromShipment(gateMovementId, c, user);
    expect(refreshed.movement.releaseGates.some((g) => CUSTOMS.test(g.g))).toBe(false);
  });

  it("publishes gateIn on the arrival and gateOut when it leaves (the WH release stamps the gate-out)", async () => {
    const { c, shipmentId, gateMovementId, positionId, wczRef } = await domestic();
    await gateMovementService.stamp(gateMovementId, c, user, "gateIn");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toEqual(expect.objectContaining({ companyId: c, shipmentId, positionId, wczRef, kind: "gateIn", stampKind: "gateIn" }));
    // The received date goes to the shipment, as for any inbound arrival.
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, warehouseReceivedDate: expect.any(String) }), expect.anything());

    // A gate-out of its own is refused: domestic cargo leaves through the WH release.
    await expect(gateMovementService.stamp(gateMovementId, c, user, "gateOut")).rejects.toThrow(/Domestic cargo leaves through WH release/);
    const released = await gateMovementService.stamp(gateMovementId, c, user, "impRelease");
    expect(released.gateOut).not.toBeNull();
    expect(released.status).toBe("Released");
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toMatchObject({ kind: "gateOut", stampKind: "impRelease" });

    // A voided release tells "voided" for the gate-out.
    await gateAdminService.voidStamp(gateMovementId, c, user, "manager", "impRelease", "not gone yet");
    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish.mock.calls[2]![0]).toMatchObject({ kind: "voided", stampKind: "gateOut" });
  });

  it("creates a Domestic position by hand as inbound without customs lines", async () => {
    const c = randomUUID();
    const { movement } = await warehouseImportService.createPosition(c, user, { handling: "Domestic", customer: "Local Ltd" });
    expect(movement).toMatchObject({ handling: "Domestic", visit: "příjem" });
    expect(movement.releaseGates.map((g) => g.g)).toEqual(["Charges", "Storage settled"]);
  });
});
