import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateFieldsFromShipment, MAX_IMPORT, warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementService } from "../services/gateMovement.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { failingShipments, notFound, shipmentData } from "./shipmentFakes";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
afterEach(() => vi.restoreAllMocks());

describe("shipment to gate mapping", () => {
  const map = (s: Parameters<typeof gateFieldsFromShipment>[0]) => gateFieldsFromShipment(s);

  it("takes the direction from the trade direction", () => {
    expect(map({ tradeDirection: "Export" })).toMatchObject({ handling: "Export", visit: "příjem" });
    expect(map({ tradeDirection: "Import" })).toMatchObject({ handling: "Import", visit: "výdej" });
    expect(map({})).toMatchObject({ handling: "Import", visit: "výdej" });
  });

  it("maps the operation type from load type, freight mode and container", () => {
    expect(map({ loadType: "Full Load", freightMode: "Sea Freight", tradeDirection: "Import" }).operationType).toBe("FCL stripping");
    expect(map({ loadType: "Full Load", freightMode: "Rail Freight", tradeDirection: "Export" }).operationType).toBe("FCL stuffing");
    expect(map({ loadType: "Full Load", freightMode: "Road Freight", containerNumber: "MSKU1234567" }).operationType).toBe("FCL stripping");
    expect(map({ loadType: "Full Load", freightMode: "Road Freight" }).operationType).toBe("Cargo storage");
    expect(map({ loadType: "Full Load", freightMode: "Air Freight" }).operationType).toBe("Cargo storage");
    expect(map({ loadType: "Consolidation", freightMode: "Sea Freight" }).operationType).toBe("LCL consolidation");
    expect(map({ loadType: "Project Shipment", freightMode: "Sea Freight" }).operationType).toBe("Cargo storage");
    expect(map({ loadType: "" }).operationType).toBe("LCL consolidation");
  });

  it("keeps a customs procedure the gate knows, else SCP; a valid customs status, else the first", () => {
    expect(map({ customsProcedure: "T1" }).customsMode).toBe("T1");
    expect(map({ customsProcedure: "c-goods" }).customsMode).toBe("C-Goods");
    expect(map({ customsProcedure: "JSD" }).customsMode).toBe("JSD");
    expect(map({ customsProcedure: "Something else" }).customsMode).toBe("SCP");
    expect(map({ customsStatus: "Under Customs Clearance" }).customsStatus).toBe("Under Customs Clearance");
    expect(map({ customsStatus: "nonsense" }).customsStatus).toBe("Waiting For Commercial Paperwork");
  });
});

describe("import in one request", () => {
  it("reports created, already in the warehouse and failed per shipment, using no reference on failure", async () => {
    const c = randomUUID();
    const [ok, gone, already] = [randomUUID(), randomUUID(), randomUUID()];
    failingShipments.set(gone, notFound());
    shipmentData.set(ok, { jobNumber: "SEA-1", tradeDirection: "Export", loadType: "Full Load", freightMode: "Sea Freight", customsProcedure: "T1", customer: "Alpine" });
    await warehouseImportService.importShipments(c, user, [already]);

    const results = await warehouseImportService.importShipments(c, user, [ok, gone, already, ok]);
    expect(results.map((r) => [r.shipmentId, r.outcome])).toEqual([
      [ok, "created"],
      [gone, "failed"],
      [already, "already"],
    ]);
    expect(results[0]).toMatchObject({ jobNumber: "SEA-1", ref: expect.stringMatching(/000002$/), movementId: expect.any(String) });
    expect(results[1]).toMatchObject({ reason: "Shipment not found", taskId: null, ref: "" });
    expect(results[2]).toMatchObject({ ref: expect.stringMatching(/000001$/), movementId: expect.any(String) });

    const row = await gateMovementService.get(results[0]!.movementId!, c);
    expect(row).toMatchObject({ handling: "Export", visit: "příjem", operationType: "FCL stuffing", customsMode: "T1", customer: "Alpine", jobNumber: "SEA-1" });
    expect(row.releaseGates.map((g) => g.g)).toContain("VGM submitted");
    // The failed shipment used no number: the next one continues at 000003.
    expect((await warehouseImportService.importShipments(c, user, [randomUUID()]))[0]!.ref).toMatch(/000003$/);
  });

  it("makes one position when the same shipment is imported twice at once", async () => {
    const c = randomUUID();
    const s = randomUUID();
    const res = await Promise.all([1, 2, 3].map(() => warehouseImportService.importShipments(c, user, [s])));
    expect(res.map((r) => r[0]!.outcome).sort()).toEqual(["already", "already", "created"]);
    expect(new Set(res.map((r) => r[0]!.taskId)).size).toBe(1);
    expect((await gateMovementService.list(c)).filter((m) => m.shipmentId === s)).toHaveLength(1);
  });

  it("rolls the position back when its gate record cannot be made", async () => {
    const c = randomUUID();
    const s = randomUUID();
    vi.spyOn(gateMovementRepository, "create").mockRejectedValueOnce(new Error("insert failed"));
    expect((await warehouseImportService.importShipments(c, user, [s]))[0]).toMatchObject({ outcome: "failed", reason: "insert failed" });
    expect(await warehouseTaskRepository.listAll(c)).toEqual([]);
    expect((await warehouseImportService.importShipments(c, user, [s]))[0]).toMatchObject({ outcome: "created", ref: expect.stringMatching(/000001$/) });
  });

  it("refuses an empty or too large import", async () => {
    await expect(warehouseImportService.importShipments(randomUUID(), user, [])).rejects.toThrow(/at least one/);
    await expect(warehouseImportService.importShipments(randomUUID(), user, Array.from({ length: MAX_IMPORT + 1 }, () => randomUUID()))).rejects.toThrow(/At most/);
  });
});

describe("repair of positions without a gate record", () => {
  it("is for managers and makes records only from shipments it can read", async () => {
    const c = randomUUID();
    const [a, b] = [randomUUID(), randomUUID()];
    const ta = (await warehouseTaskRepository.createForShipment(c, a)).task;
    const tb = (await warehouseTaskRepository.createForShipment(c, b)).task;
    failingShipments.set(b, new Error("shipments unavailable"));
    await expect(warehouseImportService.repairMissingRows(c, user, "user")).rejects.toThrow(/manager/);
    const res = await warehouseImportService.repairMissingRows(c, user, "manager");
    expect(res).toEqual({ created: 1, failed: [{ taskId: tb.id, ref: tb.taskId, reason: "shipments unavailable" }] });
    const rows = await gateMovementService.list(c);
    expect(rows.map((m) => m.warehouseTaskId)).toEqual([ta.id]);
    expect((await warehouseImportService.repairMissingRows(c, user, "admin")).created).toBe(0);
  });
});

describe("refresh from shipment", () => {
  it("copies the shipment again and rebuilds the gates only before a stamp", async () => {
    const c = randomUUID();
    const s = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [s]);
    const id = r!.movementId!;
    await gateMovementService.setReleaseGate(id, c, user, "B/L / release order", true);

    shipmentData.set(s, { customer: "New Customer", loadType: "Full Load", freightMode: "Sea Freight", customsProcedure: "T1", customsStatus: "Customs Cleared/Released" });
    const { movement, changed } = await warehouseImportService.refreshFromShipment(id, c, user);
    expect(changed).toEqual(expect.arrayContaining(["customer", "load type", "freight mode", "customs status", "customs mode"]));
    expect(movement).toMatchObject({ customer: "New Customer", operationType: "FCL stripping", customsMode: "T1", customsStatus: "Customs Cleared/Released" });
    expect(movement.releaseGates.find((g) => g.g === "Customs")).toMatchObject({ s: "OK" });
    // The Pick-up PIN line is kept, the FCL lines are new.
    expect(movement.releaseGates.map((g) => g.g)).toEqual(expect.arrayContaining(["Delivery order + PIN from carrier", "Interchange signed", "Pick-up PIN verified"]));
    expect(movement.events.at(-1)).toMatchObject({ kind: "refreshedFromShipment", label: expect.stringMatching(/^Refreshed from shipment: .*release gates rebuilt/) });

    // After a stamp the operation type stays.
    await gateMovementService.stamp(id, c, user, "gateIn");
    shipmentData.set(s, { customer: "Third", loadType: "Consolidation", customsStatus: "Customs Cleared/Released" });
    const again = await warehouseImportService.refreshFromShipment(id, c, user);
    expect(again.movement).toMatchObject({ customer: "Third", operationType: "FCL stripping", loadType: "Consolidation" });
    expect(again.changed).not.toContain("customs mode");
    expect(again.movement.events.at(-1)!.detail).toMatch(/customer: New Customer → Third/);

    // Once stamped, values the gate may have corrected are kept; blank ones are filled.
    await gateMovementRepository.update(id, c, { colli: 12, containerNumber: "" });
    shipmentData.set(s, { customer: "Third", loadType: "Consolidation", customsStatus: "Customs Cleared/Released", pcs: "10", containerNumber: "MSCU1234567" } as never);
    const third = await warehouseImportService.refreshFromShipment(id, c, user);
    expect(third.movement).toMatchObject({ colli: 12, containerNumber: "MSCU1234567" });
    expect(third.changed).toEqual(["container"]);
    expect(third.differs).toEqual(["pieces: gate 12, shipment 10"]);
    expect(third.movement.events.at(-1)!.detail).toMatch(/kept \(differs from shipment\) — pieces: gate 12, shipment 10/);
  });

  it("is only for records linked to a shipment", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "X1" });
    await expect(warehouseImportService.refreshFromShipment(m.id, c, user)).rejects.toThrow(/not linked/);
  });
});
