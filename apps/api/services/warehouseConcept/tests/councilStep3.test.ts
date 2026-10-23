import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateExceptionService } from "../services/gateException.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { containerService } from "../services/container.service";
import { reweighService } from "../services/reweigh.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { reopenChargeableStorage } from "../services/storageSettled.service";
import { addDays, pragueDate } from "../services/storage";
import { shipmentData } from "./shipmentFakes";

// Council Outlay 5, step 3: the warehouse behaviours the managers' cockpit asked for.

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

// A stand-alone export position (cargo arriving, příjem) whose release gates are all OK.
async function armedPosition(c = randomUUID()) {
  const { movement } = await warehouseImportService.createPosition(c, user, { handling: "Export", customsStatus: "Customs Cleared/Released", colli: 10, weightKg: 1000, measureCbm: 4 });
  await gateMovementRepository.update(movement.id, c, { releaseGates: movement.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
  await gateMovementService.stamp(movement.id, c, user, "gateIn");
  return { c, id: movement.id };
}

describe("an exception opened after an override takes the override back (decision 14)", () => {
  it("clears the override, logs it, and the release gates count again", async () => {
    const { c, id } = await armedPosition();
    const over = await gateMovementService.override(id, c, user, "customer agreed");
    expect(over.overridden).toBe(true);
    expect(over.events.at(-1)).toMatchObject({ kind: "override", gates: expect.arrayContaining([{ g: "Customs", s: "OK" }]) });
    const m = await gateExceptionService.create(id, c, user, { type: "Damaged", pieces: 2, note: "wet cartons", source: "manual" });
    expect(m.overridden).toBe(false);
    expect(m.armed).toBe(false);
    expect(m.events.map((e) => e.kind)).toContain("overrideCleared");
  });
});

// An import container with houses: outgoing (výdej) positions linked to shipments, 10 pieces each.
async function importContainer(n = 1) {
  const c = randomUUID();
  const res = await warehouseImportService.importShipments(c, user, Array.from({ length: n }, () => randomUUID()));
  const houses = res.map((r) => r.movementId!);
  for (const h of houses) await gateMovementRepository.update(h, c, { colli: 10, weightKg: 1000 });
  const box = await records.createContainer(c, { number: "MSKU 611 902-7", equipment: "40' HC", direction: "Unloading" }, user);
  await containerService.addPositions(box.id, c, user, houses);
  return { c, box, houses };
}

describe("the stripping tally opens the Short exception itself (decision 11)", () => {
  it("not arrived opens Short for every piece; voiding the tally resolves it", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    const res = await containerService.tally(box.id, c, user, "user", h, { outcome: "not_arrived", reason: "not on the manifest" });
    expect(res.suggestException).toBeNull();
    const held = await gateMovementService.get(h, c);
    expect(held.openExceptions).toBe(1);
    expect(held.exceptions[0]).toMatchObject({ type: "Short", pieces: 10, note: "not on the manifest", source: "tally" });

    await containerService.voidTally(box.id, c, user, "manager", h, "wrong house");
    const after = await gateMovementService.get(h, c);
    expect(after.openExceptions).toBe(0);
    expect(after.exceptions[0]).toMatchObject({ status: "resolved", resolutionNote: "Tally voided: wrong house" });
  });

  it("a short count without pieces counted opens nothing", async () => {
    const { c, box, houses } = await importContainer(1);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.tally(box.id, c, user, "user", houses[0]!, { outcome: "short", reason: "seems short" });
    expect((await gateMovementService.get(houses[0]!, c)).openExceptions).toBe(0);
  });
});

describe("a container with T1 / RDT houses leaves only with their MRN (decision 16)", () => {
  it("refuses the gate-out without the MRN and allows it with one", async () => {
    const c = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    const id = r!.movementId!;
    await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export", colli: 4, weightKg: 2000, measureCbm: 6, customsMode: "T1", customsStatus: "Paperwork Verified", mrn: "" });
    await gateMovementService.stamp(id, c, user, "expDraft");
    await reweighService.record(id, c, user, { weighedKg: 2000 });
    await gateMovementService.stamp(id, c, user, "expReceipt");
    const box = await records.createContainer(c, { number: "TGHU 123 456-0", equipment: "20' DV", direction: "Loading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, id, true);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "CZ0084412" });
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut")).rejects.toThrow(/under customs control \(T1 transit\) with no MRN/);
    await gateMovementRepository.update(id, c, { mrn: "26CZ5100001234A7" });
    const out = await containerService.stamp(box.id, c, user, "user", "gateOut");
    expect(out.container.status).toBe("Gone out");
  });
});

describe("Storage settled goes back to Pending when storage becomes chargeable (decision 19)", () => {
  // Outbound LCL cargo received 20 days ago (typed received date), every release gate OK.
  async function chargeable(c: string) {
    const { movement } = await warehouseImportService.createPosition(c, user, { handling: "Import", operationType: "LCL consolidation", customsStatus: "Customs Cleared/Released", colli: 2, weightKg: 500, measureCbm: 2 });
    await gateMovementRepository.update(movement.id, c, {
      loadInDate: addDays(pragueDate(new Date()), -20),
      status: "In Warehouse",
      releaseGates: movement.releaseGates.map((g) => ({ ...g, s: "OK" as const })),
    });
    return movement.id;
  }
  const settled = async (id: string, c: string) => (await gateMovementService.get(id, c)).releaseGates.find((g) => g.g === "Storage settled");

  it("the clock reopens the line once; a person's tick stands", async () => {
    const c = randomUUID();
    const id = await chargeable(c);
    expect((await gateMovementService.get(id, c)).storage.state).toBe("Chargeable");
    expect(await reopenChargeableStorage(c)).toBe(1);
    expect(await settled(id, c)).toMatchObject({ s: "Pending" });
    expect((await gateMovementService.get(id, c)).events.at(-1)).toMatchObject({ kind: "storageSettledReopened", by: "Warehouse" });
    await gateMovementService.setReleaseGate(id, c, user, "Storage settled", true);
    expect(await reopenChargeableStorage(c)).toBe(0);
    expect(await settled(id, c)).toMatchObject({ s: "OK" });
  });

  it("the WH release reopens it first and is refused", async () => {
    const c = randomUUID();
    const id = await chargeable(c);
    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow();
    expect(await settled(id, c)).toMatchObject({ s: "Pending" });
    expect((await gateMovementService.get(id, c)).impRelease).toBeNull();
  });
});

describe("only a manager gives more than 7 free days (decision 19)", () => {
  it("refuses a user, allows a manager, and anyone up to the default", async () => {
    const { c, id } = await armedPosition();
    await expect(gateMovementService.update(id, c, user, { freeDays: 14 }, "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect((await gateMovementService.update(id, c, user, { freeDays: 5 }, "user")).freeDays).toBe(5);
    expect((await gateMovementService.update(id, c, user, { freeDays: 14 }, "manager")).freeDays).toBe(14);
    await expect(gateMovementService.create(c, user, { gateRef: `G-${randomUUID().slice(0, 6)}`, freeDays: 30 }, "user")).rejects.toMatchObject({ code: "permission_denied" });
  });
});

describe("the closing date comes from the shipment (decision 7)", () => {
  it("is read with the customs status and logged", async () => {
    const c = randomUUID();
    const s = randomUUID();
    shipmentData.set(s, { customsStatus: "Paperwork Verified", closingDate: "2026-10-30" } as never);
    const [r] = await warehouseImportService.importShipments(c, user, [s]);
    const id = r!.movementId!;
    expect((await gateMovementService.get(id, c)).closingDate).toBe("2026-10-30");
    shipmentData.set(s, { customsStatus: "Paperwork Verified", closingDate: "2026-11-02" } as never);
    await gateMovementService.followShipments(c, { id, force: true });
    const m = await gateMovementService.get(id, c);
    expect(m.closingDate).toBe("2026-11-02");
    expect(m.events.at(-1)).toMatchObject({ kind: "closingFromShipment", label: "Closing date from shipment: 2026-11-02", detail: "was 2026-10-30" });
  });
});

describe("'Shipment may need correcting' has a Dismiss; the phone reports a discarded write", () => {
  it("stays until dismissed, then the Dismiss is refused", async () => {
    const { c, id } = await armedPosition();
    await gateMovementRepository.appendEvents(id, c, [{ kind: "shipmentMayNeedCorrecting", label: "Shipment may need correcting", at: new Date().toISOString(), by: "", detail: "gate-in voided" }]);
    expect((await gateMovementService.get(id, c)).correctionNeeded).toMatchObject({ detail: "gate-in voided" });
    const m = await gateAdminService.dismissCorrection(id, c, user);
    expect(m.correctionNeeded).toBeNull();
    await expect(gateAdminService.dismissCorrection(id, c, user)).rejects.toThrow(/Nothing to correct/);
  });

  it("logs what the phone discarded, and refuses a report without words", async () => {
    const { c, id } = await armedPosition();
    await gateAdminService.reportFloorWriteLost(id, c, user, { label: "Survey (receipt)", recordedAt: "2026-10-22T06:00:00Z", reason: "older than 12 hours" });
    expect((await gateMovementService.get(id, c)).events.at(-1)).toMatchObject({
      kind: "floorWriteLost",
      label: "Floor mode: Survey (receipt) — discarded on the phone, not sent",
      detail: expect.stringContaining("older than 12 hours"),
    });
    await expect(gateAdminService.reportFloorWriteLost(id, c, user, { label: " ", recordedAt: "2026-10-22T06:00:00Z" })).rejects.toThrow(/what was discarded/);
  });
});
