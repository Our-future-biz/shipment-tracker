import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// A write of detail rows only asks nobody else; the change events are stand-ins all the same.
vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: {}, quotes: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));

import { db } from "../../db/db";
import { shipmentService, type DetailRows } from "../../services/shipment.service";
import { shipmentTable } from "../../schemas/shipment.schema";
import { containerTable } from "../../schemas/container.schema";
import { cargoDimensionTable } from "../../schemas/cargoDimension.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { cargoItemRepository } from "../../repositories/cargoItem.repository";
import type { CargoDimensionLine, CargoItemLine, ContainerLine } from "../../interfaces/interfaces";

// A shipment's containers and cargo lines written through the shipment service, against the
// shipments database. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db); a plain `vitest run` skips it.

interface Shipment {
  id: string;
  companyId: string;
}

const USER = randomUUID();

const newShipment = async (): Promise<Shipment> => {
  const companyId = randomUUID();
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: "CZ00000001" }).returning();
  return { id: row!.id, companyId };
};
const update = (s: Shipment, rows: DetailRows) => shipmentService.update(s.id, s.companyId, rows, USER);
// What is stored, not what a read shows (a read gives the only container also its loose lines).
const storedDimensions = (s: Shipment) =>
  db.select().from(cargoDimensionTable).where(and(eq(cargoDimensionTable.companyId, s.companyId), eq(cargoDimensionTable.shipmentId, s.id)));
const storedContainers = (s: Shipment) =>
  db.select().from(containerTable).where(and(eq(containerTable.companyId, s.companyId), eq(containerTable.shipmentId, s.id)));
const storedAudit = (s: Shipment) =>
  db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.companyId, s.companyId), eq(shipmentAuditTable.shipmentId, s.id)));

const container = (over: Partial<ContainerLine> = {}): ContainerLine => ({
  containerNumber: "",
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
  ...over,
});
const dim = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
  pieces: "1",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "100",
  weightPerPcKg: "10",
  packageType: "",
  stackable: "",
  ...over,
});
const item = (over: Partial<CargoItemLine> = {}): CargoItemLine => ({
  cargoDescription: "Shoes",
  hsCode: "",
  pieces: "1",
  packageType: "",
  grossWeight: "",
  commercialInvoiceValue: "",
  currency: "EUR",
  ...over,
});

describe("the only container", () => {
  it("keeps its cargo as shipment cargo when it is deleted", async () => {
    const s = await newShipment();
    const A = randomUUID();
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })], cargoItems: [item({ containerId: A })], cargoDimensions: [dim({ containerId: A })] });

    const after = await update(s, { containers: [] });
    expect(after.containers).toEqual([]);
    expect(after.cargoItems).toMatchObject([{ containerId: null, cargoDescription: "Shoes" }]);
    expect(after.cargoDimensions).toMatchObject([{ containerId: null, pieces: "1" }]);
  });

  it("hands its cargo to the container that replaces it, stored under the id the client made", async () => {
    const s = await newShipment();
    const [A, N] = [randomUUID(), randomUUID()];
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })], cargoDimensions: [dim({ containerId: A })] });

    const after = await update(s, { containers: [container({ id: N, containerNumber: "TGHU2205539" })] });
    expect(after.containers?.map((c) => c.id)).toEqual([N]);
    expect((await storedDimensions(s)).map((d) => d.containerId)).toEqual([N]);
  });

  it("gets the loose lines typed before it was added", async () => {
    const s = await newShipment();
    await update(s, { cargoDimensions: [dim()] });
    const A = randomUUID();
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })] });
    expect((await storedDimensions(s)).map((d) => d.containerId)).toEqual([A]);
  });
});

describe("one of two containers", () => {
  it("takes its own cargo with it when it is deleted", async () => {
    const s = await newShipment();
    const [A, B] = [randomUUID(), randomUUID()];
    await update(s, {
      containers: [container({ id: A, containerNumber: "MSKU1234567" }), container({ id: B, containerNumber: "TGHU2205539" })],
      cargoDimensions: [dim({ containerId: A, pieces: "1" }), dim({ containerId: B, pieces: "2" })],
    });

    const after = await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })] });
    expect(after.cargoDimensions).toMatchObject([{ containerId: A, pieces: "1" }]);
    expect(await storedDimensions(s)).toHaveLength(1);
  });
});

describe("a write of the detail rows", () => {
  it("is all or nothing: one that fails half way leaves the containers, cargo and audit log as they were", async () => {
    const s = await newShipment();
    const A = randomUUID();
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })], cargoDimensions: [dim({ containerId: A })] });
    const logged = (await storedAudit(s)).length;

    // The only container replaced - its cargo moved off it, it deleted, the new one inserted -
    // and then the write of the cargo lines fails.
    const failing = vi.spyOn(cargoItemRepository, "replaceForShipment").mockRejectedValueOnce(new Error("the database went away"));
    try {
      await expect(update(s, { containers: [container({ id: randomUUID(), containerNumber: "TGHU2205539" })], cargoItems: [item()] })).rejects.toThrow("the database went away");
    } finally {
      failing.mockRestore();
    }
    expect((await storedContainers(s)).map((c) => [c.id, c.containerNumber])).toEqual([[A, "MSKU1234567"]]);
    expect((await storedDimensions(s)).map((d) => d.containerId)).toEqual([A]);
    expect(await storedAudit(s)).toHaveLength(logged);
  });

  it("gives a new container whose client-made id another container has an id of its own, and its cargo follows it", async () => {
    const other = await newShipment();
    const taken = randomUUID();
    await update(other, { containers: [container({ id: taken, containerNumber: "MSKU1234567" })] });
    const s = await newShipment();
    const B = randomUUID();

    const after = await update(s, {
      containers: [container({ id: taken, containerNumber: "TGHU2205539" }), container({ id: B, containerNumber: "CSQU3054383" })],
      cargoDimensions: [dim({ containerId: taken, pieces: "1" }), dim({ containerId: B, pieces: "2" })],
    });
    const own = after.containers![0]!.id!;
    expect(own).not.toBe(taken);
    expect(after.cargoDimensions).toMatchObject([{ containerId: own, pieces: "1" }, { containerId: B, pieces: "2" }]);
    expect((await storedContainers(other)).map((c) => [c.id, c.containerNumber])).toEqual([[taken, "MSKU1234567"]]);
  });

  it("takes its turn: writes of the same lines at the same moment never add up their lines", async () => {
    const s = await newShipment();
    await Promise.all(Array.from({ length: 5 }, (_, i) => update(s, { cargoDimensions: [dim({ pieces: `${i}` }), dim({ pieces: `${i}` })] })));
    const stored = await storedDimensions(s);
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((d) => d.pieces)).size).toBe(1);
  });
});

describe("the audit log", () => {
  it("keeps each list a write changed, with its lines before and after, and nothing for the same lines sent again", async () => {
    const s = await newShipment();
    const A = randomUUID();
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })], cargoDimensions: [dim({ containerId: A })] });
    await update(s, { containers: [container({ id: A, containerNumber: "MSKU1234567" })] });

    // The lists' entries (the shipment's own fields that took their defaults have theirs).
    const entries = (await storedAudit(s)).filter((e) => ["containers", "cargoItems", "cargoDimensions", "commercialInvoices"].includes(e.field));
    expect(entries.map((e) => e.field).sort()).toEqual(["cargoDimensions", "containers"]);
    const containers = entries.find((e) => e.field === "containers")!;
    expect(containers).toMatchObject({ userId: USER, oldValue: "[]" });
    expect(JSON.parse(containers.newValue!)).toMatchObject([{ id: A, containerNumber: "MSKU1234567" }]);
  });
});

describe("the dimension unit", () => {
  it("is stored per line and read back, cm when a line names none", async () => {
    const s = await newShipment();
    const after = await update(s, { cargoDimensions: [dim({ lengthCm: "2.54", dimensionUnit: "in" }), dim()] });
    expect(after.cargoDimensions?.map((d) => d.dimensionUnit)).toEqual(["in", "cm"]);
  });

  it("is cm or in, nothing else", async () => {
    const s = await newShipment();
    await expect(db.insert(cargoDimensionTable).values({ companyId: s.companyId, shipmentId: s.id, dimensionUnit: "mm" })).rejects.toMatchObject({
      cause: { constraint: "cargo_dimension_dimension_unit_check" },
    });
  });
});
