import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentRefCounterRepository, formatRef } from "../../repositories/shipmentRefCounter.repository";
import { shipmentTable } from "../../schemas/shipment.schema";
import { masterJobTable } from "../../schemas/masterJob.schema";

// Job and MCZ numbers against the shipments database. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db); a plain `vitest run` skips it.

const consecutive = (from: number, n: number, sequence: "CZ" | "MCZ" = "CZ") =>
  Array.from({ length: n }, (_, i) => formatRef(sequence, from + i));

describe("job numbers", () => {
  it("gives ten shipments created at the same moment ten distinct consecutive numbers", async () => {
    const companyId = randomUUID();
    const created = await Promise.all(Array.from({ length: 10 }, () => shipmentRepository.createWithJobNumber(companyId, {})));
    expect(created.map((s) => s.jobNumber).sort()).toEqual(consecutive(1, 10));
  });

  it("continues after the highest number stored, an archived shipment's included, and never reuses one", async () => {
    const companyId = randomUUID();
    await db.insert(shipmentTable).values([
      { companyId, jobNumber: "CZ00000041" },
      { companyId, jobNumber: "CZ00000057", deletedAt: new Date() },
      // Not CZ numbers: a CZQ reference and free text.
      { companyId, jobNumber: "CZQ00000999" },
      { companyId, jobNumber: "IMPORT-1" },
    ]);
    expect(await shipmentRefCounterRepository.peek(companyId, "CZ")).toBe("CZ00000058");
    const first = await shipmentRepository.createWithJobNumber(companyId, {});
    expect(first.jobNumber).toBe("CZ00000058");
    await shipmentRepository.softDeleteForCompany(first.id, companyId);
    expect((await shipmentRepository.createWithJobNumber(companyId, {})).jobNumber).toBe("CZ00000059");
  });

  it("gives the number back when the create is rolled back", async () => {
    const companyId = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await shipmentRefCounterRepository.allocate(tx, companyId, "CZ");
        throw new Error("insert failed");
      }),
    ).rejects.toThrow(/insert failed/);
    expect((await shipmentRepository.createWithJobNumber(companyId, {})).jobNumber).toBe("CZ00000001");
  });

  it("numbers each company on its own", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await shipmentRepository.createWithJobNumber(a, {});
    expect((await shipmentRepository.createWithJobNumber(b, {})).jobNumber).toBe("CZ00000001");
  });
});

describe("MCZ numbers", () => {
  it("gives ten master jobs created at the same moment ten distinct consecutive numbers, after one typed in by hand", async () => {
    const companyId = randomUUID();
    await db.insert(masterJobTable).values({ companyId, mczNumber: "MCZ00000007" });
    const created = await Promise.all(Array.from({ length: 10 }, () => masterJobRepository.createWithMczNumber(companyId)));
    expect(created.map((m) => m.mczNumber).sort()).toEqual(consecutive(8, 10, "MCZ"));
  });
});
