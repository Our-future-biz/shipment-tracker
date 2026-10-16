import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { failingShipments, shipmentData } from "./shipmentFakes";

const { shipmentGet } = vi.hoisted(() => ({ shipmentGet: vi.fn() }));
vi.mock("~encore/clients", async () => ({
  shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet },
  auth: (await import("./authFake")).authFake([]),
}));

const user = randomUUID();

beforeEach(async () => {
  const { getShipment } = await import("./shipmentFakes");
  shipmentGet.mockReset();
  shipmentGet.mockImplementation(getShipment);
});

async function linked(customsStatus = "Paperwork Verified") {
  const c = randomUUID();
  const s = randomUUID();
  shipmentData.set(s, { customsStatus });
  const [r] = await warehouseImportService.importShipments(c, user, [s]);
  // As if last read long ago.
  await gateMovementRepository.markShipmentChecked([r!.movementId!], c, new Date(Date.now() - 60 * 60_000));
  shipmentGet.mockClear();
  return { c, s, id: r!.movementId! };
}

const customsOf = (m: { releaseGates: { g: string; s: string; note: string }[] }) => m.releaseGates.find((g) => g.g === "Customs");

describe("customs status follows the shipment", () => {
  it("updates the status and the Customs line when the job is opened, logged", async () => {
    const { c, s, id } = await linked();
    shipmentData.set(s, { customsStatus: "Customs Cleared/Released" });
    const m = (await gateMovementService.followShipments(c, { id }), await gateMovementService.get(id, c));
    expect(m.customsStatus).toBe("Customs Cleared/Released");
    expect(customsOf(m)).toEqual({ g: "Customs", s: "OK", note: "released" });
    expect(m.events.at(-1)).toMatchObject({ kind: "customsFromShipment", label: "Customs status from shipment: Customs Cleared/Released", by: "Shipments" });
    expect(m.shipmentCheckedAt).not.toBeNull();
  });

  it("reads a shipment again only after a while, unless asked to refresh", async () => {
    const { c, id } = await linked();
    (await gateMovementService.followShipments(c, { id }), await gateMovementService.get(id, c));
    (await gateMovementService.followShipments(c, { id }), await gateMovementService.get(id, c));
    await gateMovementService.followShipments(c);
    expect(shipmentGet).toHaveBeenCalledTimes(1);
    (await gateMovementService.followShipments(c, { id, force: true }), await gateMovementService.get(id, c));
    expect(shipmentGet).toHaveBeenCalledTimes(2);
  });

  it("follows in the list too", async () => {
    const { c, s, id } = await linked();
    shipmentData.set(s, { customsStatus: "Under Customs Clearance" });
    await gateMovementService.followShipments(c);
    const rows = await gateMovementService.list(c);
    expect(rows.find((m) => m.id === id)).toMatchObject({ customsStatus: "Under Customs Clearance" });
    // Reads never fetch (or write).
    shipmentGet.mockClear();
    await gateMovementService.list(c);
    expect(shipmentGet).not.toHaveBeenCalled();
  });

  it("leaves released records as they were released", async () => {
    const { c, s, id } = await linked();
    await gateMovementRepository.update(id, c, { impRelease: new Date(), status: "Released" });
    shipmentData.set(s, { customsStatus: "Customs Cleared/Released" });
    const m = (await gateMovementService.followShipments(c, { id, force: true }), await gateMovementService.get(id, c));
    expect(m.customsStatus).toBe("Paperwork Verified");
    expect(shipmentGet).not.toHaveBeenCalled();
  });

  it("leaves the record unchanged when the shipment cannot be read", async () => {
    const { c, s, id } = await linked();
    failingShipments.set(s, new Error("shipments unavailable"));
    const m = (await gateMovementService.followShipments(c, { id }), await gateMovementService.get(id, c));
    expect(m.customsStatus).toBe("Paperwork Verified");
    expect(m.events.some((e) => e.kind === "customsFromShipment")).toBe(false);
    failingShipments.delete(s);
  });

  it("does not let a slow Shipments hold up the list", async () => {
    const { c, id } = await linked();
    shipmentGet.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    await gateMovementService.followShipments(c);
    const rows = await gateMovementService.list(c);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(rows.find((m) => m.id === id)!.customsStatus).toBe("Paperwork Verified");
  });
});
