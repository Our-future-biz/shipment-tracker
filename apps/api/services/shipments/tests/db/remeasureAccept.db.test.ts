import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// Cargo Details → Accept remeasurement against the shipments database: the warehouse's saved lines
// replace the cargo lines and totals in one write with a line in the history, and Costs Breakdown's
// check is kept after it. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
const section = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
const openInvoiceCount = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
vi.mock("~encore/clients", () => ({
  auth: { usersList: async () => ({ users: [] }) },
  customers: {},
  invoicing: { openInvoiceCount, _internalPaidSupplierInvoices: async () => ({ invoiceNumbers: [] }), _internalInvoicedShipments: async () => ({ shipmentIds: [] }) },
  quotes: {},
  warehouse: {
    _internalPickupPlates: async () => ({ plates: [] }),
    warehouseSectionGet: async () => ({ section: { id: "w1", shipmentId: "", section: "job", data: section.data, createdAt: "", updatedAt: "" } }),
  },
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentService } from "../../services/shipment.service";

const USER = randomUUID();
let jobs = 100;

const saved = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]);
const declaredLine = {
  containerId: null,
  pieces: "5",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  weightPerPcKg: "34",
  volumePerPcM3: "",
  packageType: "Cartons",
  stackable: "Stackable / Overstowable",
};

const newShipment = async () => {
  const companyId = randomUUID();
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZRM${jobs++}`, tradeDirection: "Export", freightMode: "Air Freight", pcs: "5", totalWeightTons: "0.1700", totalVolumeCbm: "7.2000" })
    .returning();
  const actor = { userID: USER, companyID: companyId, role: "admin" };
  await shipmentService.update(row!.id, companyId, { cargoDimensions: [declaredLine] }, USER, "admin");
  return { id: row!.id, companyId, actor };
};

afterEach(() => {
  vi.restoreAllMocks();
  section.data = {};
  openInvoiceCount.mockReset();
  openInvoiceCount.mockImplementation(async () => ({ count: 0 }));
});

describe("accepting the warehouse's remeasurement", () => {
  it("replaces the cargo lines and totals, keeps the package type and records the figures before and after", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();

    const shipment = await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    expect(shipment.cargoDimensions).toMatchObject([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50", packageType: "Cartons", stackable: "Stackable / Overstowable" }]);
    expect(shipment.pcs).toBe("5");
    expect(Number(shipment.totalWeightTons)).toBe(0.25);
    expect(Number(shipment.totalVolumeCbm)).toBe(34.65);

    const acceptance = await shipmentService.remeasureAcceptance(s.id, s.companyId);
    expect(acceptance).toMatchObject({ before: { colli: 5, weightKg: 170, volumeCbm: 7.2 }, after: { colli: 5, weightKg: 250, volumeCbm: 34.65 }, freightMode: "Air Freight", invoiced: false, costsCheckedAt: null });
  });

  it("refuses lines the warehouse changed meanwhile, and lines with nothing to accept", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, "[]")).rejects.toThrow(/changed the remeasured lines meanwhile/);
    section.data = {};
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, "")).rejects.toThrow(/nothing to accept/);
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();
  });

  it("is refused to a user who is not the shipment's Handled By or Holiday Cover", async () => {
    const s = await newShipment();
    await db.update(shipmentTable).set({ personInCharge: "someone@else.cz" }).where(eq(shipmentTable.id, s.id));
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, { ...s.actor, role: "user" }, saved)).rejects.toThrow(/Handled By or Holiday Cover/);
  });

  it("keeps Costs Breakdown's check until the next acceptance, and says when the job is invoiced", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.markRemeasureCostsChecked(s.id, s.actor)).rejects.toThrow(/No remeasurement was accepted/);
    await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    openInvoiceCount.mockImplementation(async () => ({ count: 1 }));
    const checked = await shipmentService.markRemeasureCostsChecked(s.id, s.actor);
    expect(checked).toMatchObject({ invoiced: true });
    expect(checked!.costsCheckedAt).not.toBeNull();

    const again = JSON.stringify([{ pieces: "6", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "40" }]);
    section.data = { remeasure_rows: again };
    await new Promise((r) => setTimeout(r, 5));
    await shipmentService.acceptRemeasurement(s.id, s.actor, again);
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toMatchObject({ before: { colli: 5, weightKg: 250 }, after: { colli: 6, weightKg: 240, volumeCbm: 6 }, costsCheckedAt: null });
  });

  it("refuses the same lines a second time, so a cleared Costs warning stays cleared (council finding m8)", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    await shipmentService.markRemeasureCostsChecked(s.id, s.actor);
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, saved)).rejects.toThrow(/already accepted/);
    expect((await shipmentService.remeasureAcceptance(s.id, s.companyId))!.costsCheckedAt).not.toBeNull();
  });

  it("gives a sea job's only container the accepted figures, with its line in the history (council finding X3)", async () => {
    const s = await newShipment();
    await db.update(shipmentTable).set({ freightMode: "Sea Freight", loadType: "Full Load" }).where(eq(shipmentTable.id, s.id));
    const box = { containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "5", packageType: "Cartons", grossWeight: "170", volume: "7.2" };
    const withBox = await shipmentService.update(s.id, s.companyId, { containers: [box as never] }, USER, "admin");
    section.data = { remeasure_rows: saved };
    const shipment = await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    expect(shipment.containers).toMatchObject([{ id: withBox.containers![0]!.id, packages: "5", grossWeight: "250", volume: "34.65" }]);
    // What Warehouse, Customs and the Pcs pill read: the container's figures, now the accepted ones.
    expect(shipment).toMatchObject({ pcs: "5", totalGrossWeightKg: "250", totalVolumeM3: "34.65" });
  });

  // Review: Cargo Details saved between the acceptance's read and its write turn. The other save is
  // made just before the acceptance's own write starts (its call of update), after it read the rows.
  it("refuses when a second container was saved meanwhile, and both containers stay with their cargo", async () => {
    const s = await newShipment();
    await db.update(shipmentTable).set({ freightMode: "Sea Freight", loadType: "Full Load" }).where(eq(shipmentTable.id, s.id));
    const box = { containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "5", packageType: "Cartons", grossWeight: "170", volume: "7.2" };
    const withBox = await shipmentService.update(s.id, s.companyId, { containers: [box as never] }, USER, "admin");
    const first = withBox.containers![0]!;
    const realUpdate = shipmentService.update.bind(shipmentService);
    vi.spyOn(shipmentService, "update").mockImplementationOnce(async (...args) => {
      await realUpdate(s.id, s.companyId, { containers: [first, { ...box, containerNumber: "TGHU1234567" } as never] }, USER, "admin");
      return realUpdate(...args);
    });
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, saved)).rejects.toThrow(/Cargo Details changed meanwhile/);
    const after = await shipmentService.getById(s.id, s.companyId);
    expect(after!.containers!.map((c) => c.containerNumber).sort()).toEqual(["MSKU1234567", "TGHU1234567"]);
    expect(after!.containers!.find((c) => c.id === first.id)).toMatchObject({ packages: "5", grossWeight: "170" });
    expect(after!.cargoDimensions).toMatchObject([{ lengthCm: "120", weightPerPcKg: "34" }]);
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();
  });

  it("refuses when dangerous goods were added to the lines meanwhile, and keeps them", async () => {
    const s = await newShipment();
    const realUpdate = shipmentService.update.bind(shipmentService);
    vi.spyOn(shipmentService, "update").mockImplementationOnce(async (...args) => {
      await realUpdate(s.id, s.companyId, { cargoDimensions: [declaredLine, { ...declaredLine, pieces: "1", adrUn: "1993", adrClass: "3" }] as never }, USER, "admin");
      return realUpdate(...args);
    });
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, saved)).rejects.toThrow(/Cargo Details changed meanwhile/);
    expect((await shipmentService.getById(s.id, s.companyId))!.cargoDimensions).toMatchObject([{ pieces: "5" }, { pieces: "1", adrUn: "1993" }]);
  });

  it("records one acceptance when two Accepts of the same lines come at once", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    const results = await Promise.allSettled([shipmentService.acceptRemeasurement(s.id, s.actor, saved), shipmentService.acceptRemeasurement(s.id, s.actor, saved)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(String(refused?.reason)).toMatch(/already accepted/);
    const entries = await db
      .select()
      .from(shipmentAuditTable)
      .where(and(eq(shipmentAuditTable.shipmentId, s.id), eq(shipmentAuditTable.field, "remeasurementAccepted")));
    expect(entries).toHaveLength(1);
  });
});
