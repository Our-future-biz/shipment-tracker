import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { customerLinksRepository } from "../../repositories/customerLinks.repository";
import {
  truckingConsignmentTable,
  truckingTripTable,
  type NewTruckingConsignmentRecord,
  type NewTruckingTripRecord,
} from "../../schemas/truckingConsignment.schema";

// The rename statements of Customer Database names against the trucking database. Runs only under
// `encore test` (TRUCKING_DB_TESTS=1 encore test services/trucking/tests/db); a plain `vitest run`
// skips it.

const c = truckingConsignmentTable;
const t = truckingTripTable;
let seq = 0;

const stopOf = (kind: "PICKUP" | "DELIVERY") =>
  ({ id: kind, kind, siteId: null, name: "Alfa", street: "", postcode: "11000", city: "Praha", country: "CZ" }) as unknown as NewTruckingConsignmentRecord["pickup"];

async function consignment(companyId: string, customerId: string, customerName: string, over: Partial<NewTruckingConsignmentRecord> = {}) {
  const [row] = await db
    .insert(c)
    .values({
      companyId,
      ref: `TCZ2026${String(++seq).padStart(6, "0")}`,
      shipmentId: randomUUID(),
      customerId,
      customerName,
      pickupDate: "2026-10-27",
      pickup: stopOf("PICKUP"),
      delivery: stopOf("DELIVERY"),
      load: { pieces: 1 } as NewTruckingConsignmentRecord["load"],
      ...over,
    })
    .returning();
  return row!;
}

async function trip(companyId: string, haulierCustomerId: string, haulierName: string, over: Partial<NewTruckingTripRecord> = {}) {
  const [row] = await db
    .insert(t)
    .values({ companyId, ref: `LCZ2026${String(++seq).padStart(6, "0")}`, haulierCustomerId, haulierName, plannedPickupDate: "2026-10-27", ...over })
    .returning();
  return row!;
}

describe("renaming Customer Database names kept by id", () => {
  it("rewrites only the company's live consignments of the customer whose name differs, without a new version", async () => {
    const company = randomUUID();
    const customer = randomUUID();
    const old = await consignment(company, customer, "Alfa");
    const same = await consignment(company, customer, "Alfa Logistics");
    const cancelled = await consignment(company, customer, "Alfa", { status: "CANCELLED", cancelledAt: new Date() });
    const deleted = await consignment(company, customer, "Alfa", { deletedAt: new Date() });
    const otherCustomer = await consignment(company, randomUUID(), "Alfa");
    const otherCompany = await consignment(randomUUID(), customer, "Alfa");

    expect(await customerLinksRepository.renameConsignmentCustomer(db, company, customer, "Alfa Logistics")).toBe(2);
    const name = async (id: string) => (await db.select().from(c).where(eq(c.id, id)))[0]!;
    expect((await name(old.id)).customerName).toBe("Alfa Logistics");
    expect((await name(old.id)).version).toBe(old.version);
    expect((await name(same.id)).updatedAt).toEqual(same.updatedAt);
    expect((await name(cancelled.id)).customerName).toBe("Alfa Logistics");
    expect((await name(deleted.id)).customerName).toBe("Alfa");
    expect((await name(otherCustomer.id)).customerName).toBe("Alfa");
    expect((await name(otherCompany.id)).customerName).toBe("Alfa");
    // Again: nothing left to change.
    expect(await customerLinksRepository.renameConsignmentCustomer(db, company, customer, "Alfa Logistics")).toBe(0);
  });

  it("rewrites the haulier's trips, without a new version", async () => {
    const company = randomUUID();
    const haulier = randomUUID();
    const a = await trip(company, haulier, "Bravo");
    await trip(company, haulier, "Bravo Trans");
    const other = await trip(company, randomUUID(), "Bravo");

    expect(await customerLinksRepository.renameTripHaulier(db, company, haulier, "Bravo Trans")).toBe(1);
    const row = async (id: string) => (await db.select().from(t).where(eq(t.id, id)))[0]!;
    expect(await row(a.id)).toMatchObject({ haulierName: "Bravo Trans", version: a.version });
    expect((await row(other.id)).haulierName).toBe("Bravo");
    expect(await customerLinksRepository.renameTripHaulier(db, company, haulier, "Bravo Trans")).toBe(0);
  });

  it("a change event's rename writes the name it reads to the consignments and trips, and never a blank one", async () => {
    const company = randomUUID();
    const customer = randomUUID();
    const a = await consignment(company, customer, "Alfa");
    const b = await trip(company, customer, "Alfa");

    expect(await customerLinksRepository.renameCustomer(company, customer, async () => "  Alfa Group ")).toEqual({ consignments: 1, trips: 1 });
    expect(await customerLinksRepository.renameCustomer(company, customer, async () => " ")).toEqual({ consignments: 0, trips: 0 });
    expect(await customerLinksRepository.renameCustomer(company, customer, async () => null)).toEqual({ consignments: 0, trips: 0 });
    expect((await db.select().from(c).where(eq(c.id, a.id)))[0]).toMatchObject({ customerName: "Alfa Group", version: a.version });
    expect((await db.select().from(t).where(eq(t.id, b.id)))[0]).toMatchObject({ haulierName: "Alfa Group", version: b.version });
  });

  it("renames of one customer take turns: the next reads the name only once the one before has committed", async () => {
    const company = randomUUID();
    const customer = randomUUID();
    const row = await consignment(company, customer, "Alfa");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reads: string[] = [];

    const first = customerLinksRepository.renameCustomer(company, customer, async () => {
      reads.push("first");
      await gate;
      return "Alfa Logistics";
    });
    await new Promise((r) => setTimeout(r, 100));
    const second = customerLinksRepository.renameCustomer(company, customer, async () => {
      reads.push("second");
      return "Alfa Group";
    });
    // Another customer doesn't wait.
    const other = randomUUID();
    await consignment(company, other, "Delta");
    expect(await customerLinksRepository.renameCustomer(company, other, async () => "Delta Trans")).toEqual({ consignments: 1, trips: 0 });

    await new Promise((r) => setTimeout(r, 200));
    expect(reads).toEqual(["first"]);
    release();
    await Promise.all([first, second]);

    expect(reads).toEqual(["first", "second"]);
    expect((await db.select().from(c).where(eq(c.id, row.id)))[0]!.customerName).toBe("Alfa Group");
  });

  it("lists every stored name by id with how many live rows hold it", async () => {
    const company = randomUUID();
    const customer = randomUUID();
    const haulier = randomUUID();
    await consignment(company, customer, "Alfa");
    await consignment(company, customer, "Alfa");
    await consignment(company, customer, "ALFA");
    await consignment(company, customer, "Alfa", { deletedAt: new Date() });
    await trip(company, haulier, "Bravo");

    const rows = await customerLinksRepository.storedNames(company);
    const sorted = rows.map((r) => `${r.field}|${r.id === customer ? "customer" : "haulier"}|${r.name}|${r.count}`).sort();
    expect(sorted).toEqual(["consignment.customerName|customer|ALFA|1", "consignment.customerName|customer|Alfa|2", "trip.haulierName|haulier|Bravo|1"]);
  });
});
