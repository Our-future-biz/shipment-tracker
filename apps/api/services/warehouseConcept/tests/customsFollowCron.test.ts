import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { followAllCompanies } from "../services/customsFollow.service";
import { dueForListFollow } from "../services/shipmentFollow.service";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementTable } from "../schemas/gateMovement.schema";
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

  // A list call (and each cron run) loaded every record of the company to keep 25; the due ones
  // are picked in SQL now, in the order the follow reads them.
  it("picks the due records in SQL: never read first, then the longest ago; not those read lately, released, gone or unlinked", async () => {
    const c = randomUUID();
    const shipmentIds = Array.from({ length: 6 }, () => randomUUID());
    for (const s of shipmentIds) shipmentData.set(s, { customsStatus: "Paperwork Verified" });
    const [never, longAgo, hourAgo, lately, released, gone] = (await warehouseImportService.importShipments(c, user, shipmentIds)).map((r) => r.movementId!);
    const now = new Date();
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    await db.update(gateMovementTable).set({ shipmentCheckedAt: null }).where(eq(gateMovementTable.id, never!));
    await gateMovementRepository.markShipmentChecked([longAgo!, released!, gone!], c, ago(180));
    await gateMovementRepository.markShipmentChecked([hourAgo!], c, ago(60));
    await gateMovementRepository.markShipmentChecked([lately!], c, ago(1));
    await gateMovementRepository.update(released!, c, { impRelease: now });
    await gateMovementRepository.appendEvents(gone!, c, [{ kind: "shipmentDeleted", label: "Shipment deleted in Shipments", at: now.toISOString(), by: "" }]);
    await gateMovementService.create(c, user, { gateRef: "NO-SHIPMENT", handling: "Import", visit: "výdej" });
    expect((await dueForListFollow(c, now)).map((m) => m.id)).toEqual([never, longAgo, hourAgo]);
    expect(await gateMovementRepository.dueForShipmentFollow(c, { checkedBefore: ago(5), limit: 2, goneEvent: "shipmentDeleted" })).toHaveLength(2);
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
