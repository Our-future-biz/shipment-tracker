import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentChangesService } from "../services/shipmentChanges.service";
import { shipmentData } from "./shipmentFakes";

// F6: a person's change of a shipment in Shipments reaches its gate record - the ETA as Refresh
// from shipment copies it, the plate only before the gate saw the vehicle - and never over the
// gate's own later edit.

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

async function linked() {
  const c = randomUUID();
  const s = randomUUID();
  shipmentData.set(s, { tradeDirection: "Import", estimatedArrival: "2026-11-24" });
  const [r] = await warehouseImportService.importShipments(c, user, [s]);
  const id = r!.movementId!;
  await gateMovementRepository.update(id, c, { plate: "3AB 1234" });
  return { c, s, id };
}

describe("a shipment's change on its gate record", () => {
  it("takes the new ETA and plate while the record still has the shipment's old ones, logged on the record", async () => {
    const { c, s, id } = await linked();
    const changes = { estimatedArrival: { from: "2026-11-24", to: "2026-11-25" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } };
    await expect(shipmentChangesService.follow(c, user, s, changes)).resolves.toEqual({ kept: [] });
    const m = (await gateMovementRepository.findById(id, c))!;
    expect(m).toMatchObject({ eta: "2026-11-25", plate: "4CD 5678" });
    expect(m.events.at(-1)).toMatchObject({ kind: "refreshedFromShipment", label: "From shipment: ETA, plate", detail: "ETA: 2026-11-24 → 2026-11-25; plate: 3AB 1234 → 4CD 5678" });
    // Sent again (a retry): nothing more changes, nothing more is logged.
    const events = m.events.length;
    await expect(shipmentChangesService.follow(c, user, s, changes)).resolves.toEqual({ kept: [] });
    expect((await gateMovementRepository.findById(id, c))!.events).toHaveLength(events);
  });

  it("keeps the gate's own value, and the plate once the gate stamped the vehicle", async () => {
    const { c, s, id } = await linked();
    await gateMovementRepository.update(id, c, { eta: "2026-11-26", gateIn: new Date() });
    const { kept } = await shipmentChangesService.follow(c, user, s, { estimatedArrival: { from: "2026-11-24", to: "2026-11-25" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } });
    expect(kept).toHaveLength(2);
    expect((await gateMovementRepository.findById(id, c))!).toMatchObject({ eta: "2026-11-26", plate: "3AB 1234" });
  });

  it("touches no other company's records", async () => {
    const { c, s, id } = await linked();
    await shipmentChangesService.follow(randomUUID(), user, s, { estimatedArrival: { from: "2026-11-24", to: "2026-11-25" } });
    expect((await gateMovementRepository.findById(id, c))!.eta).toBe("2026-11-24");
  });
});
