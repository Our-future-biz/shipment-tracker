import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// Cargo Details → Accept remeasurement against the shipments database. Since 22 Nov (owner's answer)
// the acceptance is only recorded - one line in the history with the figures before and after and
// the lines accepted - and Cargo Details' lines, totals and container stay as they were. Costs
// Breakdown's check is kept after it. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
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
  const box = { containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "5", packageType: "Cartons", grossWeight: "170", volume: "7.2" };
  const acceptances = (shipmentId: string) =>
    db
      .select()
      .from(shipmentAuditTable)
      .where(and(eq(shipmentAuditTable.shipmentId, shipmentId), eq(shipmentAuditTable.field, "remeasurementAccepted")));

  it("records the figures before and after and the lines accepted, and leaves the cargo lines, totals and container as they were", async () => {
    const s = await newShipment();
    await db.update(shipmentTable).set({ freightMode: "Sea Freight", loadType: "Full Load" }).where(eq(shipmentTable.id, s.id));
    const withBox = await shipmentService.update(s.id, s.companyId, { containers: [box as never] }, USER, "admin");
    section.data = { remeasure_rows: saved };
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();

    const shipment = await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    expect(shipment.cargoDimensions).toMatchObject([{ pieces: "5", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "34", packageType: "Cartons", stackable: "Stackable / Overstowable" }]);
    expect(shipment.pcs).toBe("5");
    expect(Number(shipment.totalWeightTons)).toBe(0.17);
    expect(Number(shipment.totalVolumeCbm)).toBe(7.2);
    expect(shipment.containers).toMatchObject([{ id: withBox.containers![0]!.id, packages: "5", grossWeight: "170", volume: "7.2" }]);
    // What Warehouse, Customs and the Pcs pill read: still the container's own figures.
    expect(shipment).toMatchObject({ totalGrossWeightKg: "170", totalVolumeM3: "7.2" });

    const acceptance = await shipmentService.remeasureAcceptance(s.id, s.companyId);
    expect(acceptance).toMatchObject({
      before: { colli: 5, weightKg: 170, volumeCbm: 7.2 },
      after: { colli: 5, weightKg: 250, volumeCbm: 34.65 },
      lines: saved,
      freightMode: "Sea Freight",
      invoiced: false,
      costsCheckedAt: null,
    });
    expect(await acceptances(s.id)).toHaveLength(1);
  });

  it("refuses lines the warehouse changed meanwhile, lines with nothing to accept and a line not measured in full", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, "[]")).rejects.toThrow(/changed the remeasured lines meanwhile/);
    section.data = {};
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, "")).rejects.toThrow(/nothing to accept/);
    const noKg = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "" }]);
    section.data = { remeasure_rows: noKg };
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, noKg)).rejects.toThrow("Remeasured line 1 has no kg per piece");
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();
  });

  it("is refused to a user who is not the shipment's Handled By or Holiday Cover", async () => {
    const s = await newShipment();
    await db.update(shipmentTable).set({ personInCharge: "someone@else.cz" }).where(eq(shipmentTable.id, s.id));
    section.data = { remeasure_rows: saved };
    await expect(shipmentService.acceptRemeasurement(s.id, { ...s.actor, role: "user" }, saved)).rejects.toThrow(/Handled By or Holiday Cover/);
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toBeNull();
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
    // The first acceptance changed nothing of the shipment: "before" is still its own 5 colli, 170 kg.
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toMatchObject({ before: { colli: 5, weightKg: 170 }, after: { colli: 6, weightKg: 240, volumeCbm: 6 }, costsCheckedAt: null });
  });

  it("refuses the same lines a second time, so a cleared Costs warning stays cleared (council finding m8)", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    await shipmentService.markRemeasureCostsChecked(s.id, s.actor);
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, saved)).rejects.toThrow(/already accepted/);
    expect((await shipmentService.remeasureAcceptance(s.id, s.companyId))!.costsCheckedAt).not.toBeNull();
    expect(await acceptances(s.id)).toHaveLength(1);
  });

  // "Already accepted" is the history alone now: a save of Cargo Details since doesn't open the
  // same lines again (the acceptance never wrote them there); new lines from the warehouse do.
  it("still refuses the same lines after Cargo Details were saved, and accepts the lines the warehouse saved since", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    await shipmentService.update(s.id, s.companyId, { cargoDimensions: [{ ...declaredLine, packageType: "Crates" }] }, USER, "admin");
    await expect(shipmentService.acceptRemeasurement(s.id, s.actor, saved)).rejects.toThrow(/already accepted/);

    const other = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "226", weightPerPcKg: "50" }]);
    section.data = { remeasure_rows: other };
    await new Promise((r) => setTimeout(r, 5));
    await shipmentService.acceptRemeasurement(s.id, s.actor, other);
    expect(await shipmentService.remeasureAcceptance(s.id, s.companyId)).toMatchObject({ lines: other });
    expect(await acceptances(s.id)).toHaveLength(2);
  });

  // Nothing is taken over line for line any more, so dangerous goods no longer send it to be done by hand.
  it("records an acceptance for lines with dangerous goods, and keeps them", async () => {
    const s = await newShipment();
    await shipmentService.update(s.id, s.companyId, { cargoDimensions: [declaredLine, { ...declaredLine, pieces: "1", adrUn: "1993", adrClass: "3" }] as never }, USER, "admin");
    section.data = { remeasure_rows: saved };
    const shipment = await shipmentService.acceptRemeasurement(s.id, s.actor, saved);
    expect(shipment.cargoDimensions).toMatchObject([{ pieces: "5", lengthCm: "120" }, { pieces: "1", adrUn: "1993" }]);
    expect(await acceptances(s.id)).toHaveLength(1);
  });

  it("records one acceptance when two Accepts of the same lines come at once", async () => {
    const s = await newShipment();
    section.data = { remeasure_rows: saved };
    const results = await Promise.allSettled([shipmentService.acceptRemeasurement(s.id, s.actor, saved), shipmentService.acceptRemeasurement(s.id, s.actor, saved)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(String(refused?.reason)).toMatch(/already accepted/);
    expect(await acceptances(s.id)).toHaveLength(1);
  });
});
