import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { containerTable } from "../../schemas/container.schema";
import { masterJobTable } from "../../schemas/masterJob.schema";
import { masterJobContainerTable } from "../../schemas/masterJobContainer.schema";
import { shipmentTable } from "../../schemas/shipment.schema";

// The main search (the top bar) against the shipments database: what finds a master job or a
// shipment, and that it stays within the company and its live rows. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db); a plain `vitest run` skips it.

const found = async (companyId: string, q: string) => (await masterJobRepository.searchMain(companyId, q, 10)).rows.map((r) => r.mczNumber);

async function masterJob(companyId: string, mczNumber: string, extra: Partial<typeof masterJobTable.$inferInsert> = {}) {
  const [row] = await db.insert(masterJobTable).values({ companyId, mczNumber, ...extra }).returning();
  return row!;
}

async function house(companyId: string, masterJobId: string, jobNumber: string, containerNumber: string, deleted = false) {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, masterJobId, jobNumber, deletedAt: deleted ? new Date() : null })
    .returning();
  await db.insert(containerTable).values({ companyId, shipmentId: row!.id, containerNumber });
  return row!;
}

describe("main search: master jobs", () => {
  it("finds a job by its number whatever its letters, digits still being typed included", async () => {
    const companyId = randomUUID();
    await masterJob(companyId, "MCZCONSOL00000007");
    await masterJob(companyId, "MCZ00000071");
    expect(await found(companyId, "mcz00000007")).toEqual(["MCZCONSOL00000007"]);
    expect(await found(companyId, "MCZFULL00000007")).toEqual(["MCZCONSOL00000007"]);
    expect((await found(companyId, "MCZ000000")).sort()).toEqual(["MCZ00000071", "MCZCONSOL00000007"]);
    expect(await found(companyId, "mcz0000000")).toEqual(["MCZCONSOL00000007"]);
    expect(await found(companyId, "consol00000007")).toEqual(["MCZCONSOL00000007"]);
  });

  it("finds a job by the containers on its master BL and on its live houses, and by its houses' job numbers", async () => {
    const companyId = randomUUID();
    const job = await masterJob(companyId, "MCZFULL00000001", { vessel: "MSC Aurora" });
    await db.insert(masterJobContainerTable).values({ companyId, masterJobId: job.id, containerNumber: "MSCU1234567" });
    await house(companyId, job.id, "CZ00000101", "TGHU7654321");
    await house(companyId, job.id, "CZ00000102", "CAIU0000001", true);
    expect(await found(companyId, "mscu1234567")).toEqual(["MCZFULL00000001"]);
    expect(await found(companyId, "TGHU7654321")).toEqual(["MCZFULL00000001"]);
    expect(await found(companyId, "CZ00000101")).toEqual(["MCZFULL00000001"]);
    // Every word somewhere: the vessel and a house's container together.
    expect(await found(companyId, "aurora tghu")).toEqual(["MCZFULL00000001"]);
    // A deleted house no longer finds its master job.
    expect(await found(companyId, "CAIU0000001")).toEqual([]);
    expect(await found(companyId, "CZ00000102")).toEqual([]);
  });

  it("keeps to the company's live jobs, the newest first, with how many match in all", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    await masterJob(companyId, "MCZ00000001", { vessel: "Ever Given", createdAt: new Date("2026-01-01T00:00:00Z") });
    await masterJob(companyId, "MCZ00000002", { vessel: "Ever Given", createdAt: new Date("2026-02-01T00:00:00Z") });
    await masterJob(companyId, "MCZ00000003", { vessel: "Ever Given", deletedAt: new Date() });
    await masterJob(other, "MCZ00000004", { vessel: "Ever Given" });
    const { rows, total } = await masterJobRepository.searchMain(companyId, "ever given", 1);
    expect(rows.map((r) => r.mczNumber)).toEqual(["MCZ00000002"]);
    expect(total).toBe(2);
  });
});

describe("main search: shipments", () => {
  it("keeps to the company's live shipments, the newest first, with how many match in all", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    await db.insert(shipmentTable).values([
      { companyId, jobNumber: "CZ00000201", customer: "Železárny Třinec", createdAt: new Date("2026-01-01T00:00:00Z") },
      { companyId, jobNumber: "CZ00000202", customer: "Železárny Třinec", createdAt: new Date("2026-02-01T00:00:00Z") },
      { companyId, jobNumber: "CZ00000203", customer: "Železárny Třinec", deletedAt: new Date() },
      { companyId: other, jobNumber: "CZ00000204", customer: "Železárny Třinec" },
    ]);
    const { rows, total } = await shipmentRepository.searchMain(companyId, "zelezarny trinec", 1);
    expect(rows.map((r) => r.jobNumber)).toEqual(["CZ00000202"]);
    expect(total).toBe(2);
    expect((await shipmentRepository.searchMain(companyId, "cz00000201", 5)).rows.map((r) => r.jobNumber)).toEqual(["CZ00000201"]);
  });
});
