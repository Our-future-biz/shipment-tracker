import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { gateExceptionService } from "../services/gateException.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { warehouseRecordsService } from "../services/warehouseRecords.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { dockSlotRepository } from "../repositories/warehouseRecords.repository";
import { gateExceptionRepository } from "../repositories/gateException.repository";

vi.mock("~encore/clients", async () => ({
  shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(async () => ({ shipment: { jobNumber: "SEA-1" } })) },
  auth: (await import("./authFake")).authFake([]),
}));

const user = randomUUID();

// Every release-gate line OK, so only the rule under test can block the release.
async function allGatesOk(id: string, c: string) {
  const m = (await gateMovementRepository.findById(id, c))!;
  await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
}

describe("gate state rules", () => {
  it("never refuses cargo that is already released", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026000001", visit: "výdej" });
    await gateMovementRepository.update(m.id, c, { impRelease: new Date(), status: "Released" });
    await expect(gateMovementService.refuse(m.id, c, user, "too late")).rejects.toThrow(/already released/);
    expect((await gateMovementService.get(m.id, c)).status).toBe("Released");
  });

  it("releases inbound cargo only after it arrived", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026000002", visit: "příjem", handling: "Export" });
    await allGatesOk(m.id, c);
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/has not arrived yet/);
    expect((await gateMovementService.get(m.id, c)).impRelease).toBeNull();
  });
});

describe("removing a position", () => {
  it("cancels its booked dock slots and closes its open exceptions", async () => {
    const c = randomUUID();
    const { task, movement } = await warehouseImportService.createPosition(c, user, { visit: "příjem", handling: "Export", customer: "Alpine" });
    const slot = await warehouseRecordsService.createDockSlot(c, { movementId: movement.id, date: "2026-12-01", time: "08:00", dock: "Dock 1" });
    await gateExceptionService.create(movement.id, c, user, { type: "Damaged", pieces: 1, note: "wet" });
    await gateAdminService.removePosition(task.id, c, user, "user");
    const [after] = await dockSlotRepository.listForMovements([movement.id], c);
    expect(after).toMatchObject({ id: slot.id, status: "Cancelled" });
    const [exception] = await gateExceptionRepository.listForMovements([movement.id], c);
    expect(exception).toMatchObject({ status: "resolved", resolutionNote: expect.stringMatching(/position .* removed/) });
  });
});
