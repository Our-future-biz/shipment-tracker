import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { followAllCompanies } from "../services/customsFollow.service";
import { shipmentData } from "./shipmentFakes";

// The customs follow on a clock (Council Outlay 5, step 2): no user calls it, so Shipments is read
// as the company's service identity; a record whose shipment was deleted is not read again.

const { shipmentGet, internalServiceUser } = vi.hoisted(() => ({ shipmentGet: vi.fn(), internalServiceUser: vi.fn(async () => ({ userId: "svc-warehouse" })) }));
vi.mock("~encore/clients", async () => ({
  shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet },
  auth: { ...(await import("./authFake")).authFake([]), _internalServiceUser: internalServiceUser },
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
  shipmentData.set(s, { customsStatus: "Paperwork Verified" });
  const [r] = await warehouseImportService.importShipments(c, user, [s]);
  await gateMovementRepository.markShipmentChecked([r!.movementId!], c, new Date(Date.now() - 60 * 60_000));
  shipmentGet.mockClear();
  return { c, s, id: r!.movementId! };
}

describe("customs follow cron", () => {
  it("finds the companies with linked open records and reads their shipments as the service identity", async () => {
    const { c, s, id } = await linked();
    expect(await gateMovementRepository.companiesFollowingShipments()).toContain(c);

    shipmentData.set(s, { customsStatus: "Customs Cleared/Released" });
    const spy = vi.spyOn(gateMovementRepository, "companiesFollowingShipments").mockResolvedValueOnce([c]);
    expect(await followAllCompanies()).toBe(1);
    spy.mockRestore();

    expect(shipmentGet).toHaveBeenCalledWith({ shipmentId: s }, { authData: { userID: "svc-warehouse", companyID: c, role: "user" } });
    const m = await gateMovementService.get(id, c);
    expect(m.customsStatus).toBe("Customs Cleared/Released");
    expect(m.releaseGates.find((g) => g.g === "Customs")).toMatchObject({ s: "OK" });
  });

  it("does not read a shipment deleted in Shipments again", async () => {
    const { c, id } = await linked();
    await gateMovementRepository.appendEvents(id, c, [{ kind: "shipmentDeleted", label: "Shipment deleted in Shipments — position kept (its gate record has stamps)", at: new Date().toISOString(), by: "" }]);
    await gateMovementService.followShipments(c, { asService: true });
    expect(shipmentGet).not.toHaveBeenCalled();
  });

  it("one company's failure does not stop the others", async () => {
    const a = await linked();
    const b = await linked();
    shipmentData.set(b.s, { customsStatus: "Customs Cleared/Released" });
    const follow = vi.spyOn(gateMovementService, "followShipments");
    follow.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(gateMovementRepository, "companiesFollowingShipments").mockResolvedValueOnce([a.c, b.c]);
    expect(await followAllCompanies()).toBe(1);
    spy.mockRestore();
    follow.mockRestore();
    expect((await gateMovementService.get(b.id, b.c)).customsStatus).toBe("Customs Cleared/Released");
  });
});
