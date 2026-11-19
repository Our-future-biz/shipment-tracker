import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const usersList = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { usersList }, customers: {}, invoicing: {}, quotes: {}, warehouse: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));

import { db } from "../../db/db";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentUserLinksService } from "../../services/shipmentUserLinks.service";

// Migration 0088 against the shipments database: the users' ids beside Handled By and Holiday
// Cover, filled by the daily backfill (services/shipmentUserLinks.service). Runs only under
// `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const JAN = { id: randomUUID(), email: "jan@firma.cz", displayName: "Jan Novák" };
const EVA = { id: randomUUID(), email: "eva@firma.cz", displayName: "Eva Malá" };
const LEFT = randomUUID();

let jobs = 0;
const newJob = async (companyId: string, over: Partial<typeof shipmentTable.$inferInsert> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${String(++jobs).padStart(8, "0")}`, ...over }).returning();
  return row!;
};
const idsOf = async (ids: string[]) =>
  new Map(
    (await db.select({ id: shipmentTable.id, p: shipmentTable.personInChargeUserId, c: shipmentTable.holidayCoverUserId, at: shipmentTable.updatedAt }).from(shipmentTable).where(inArray(shipmentTable.id, ids))).map((r) => [r.id, r]),
  );

describe("the backfill of the users' ids", () => {
  it("links each live job's people to their active users, clears the id of an empty field and keeps that of somebody who left", async () => {
    const companyId = randomUUID();
    usersList.mockResolvedValue({ users: [JAN, EVA] });
    const a = await newJob(companyId, { personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz" });
    const b = await newJob(companyId, { personInCharge: "Eva@Firma.cz — Eva Malá", holidayCover: "", holidayCoverUserId: JAN.id });
    const c = await newJob(companyId, { personInCharge: "left@firma.cz", personInChargeUserId: LEFT });
    const d = await newJob(companyId, { personInCharge: "Petr" });
    const gone = await newJob(companyId, { personInCharge: "jan@firma.cz", deletedAt: new Date() });
    const other = await newJob(randomUUID(), { personInCharge: "jan@firma.cz" });

    expect(await shipmentUserLinksService.backfill(companyId)).toBe(2);
    const after = await idsOf([a.id, b.id, c.id, d.id, gone.id, other.id]);
    expect([after.get(a.id)!.p, after.get(a.id)!.c]).toEqual([JAN.id, EVA.id]);
    expect([after.get(b.id)!.p, after.get(b.id)!.c]).toEqual([EVA.id, null]);
    expect(after.get(c.id)!.p).toBe(LEFT);
    expect(after.get(d.id)!.p).toBeNull();
    // A deleted job and another company's are not touched; nobody edited the jobs.
    expect(after.get(gone.id)!.p).toBeNull();
    expect(after.get(other.id)!.p).toBeNull();
    expect(after.get(a.id)!.at).toEqual(a.updatedAt);

    // Safe to run again: nothing more to write.
    expect(await shipmentUserLinksService.backfill(companyId)).toBe(0);
  });

  it("writes only the rows that still hold the value it read: an edit made since keeps its own id", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId, { personInCharge: "eva@firma.cz", personInChargeUserId: EVA.id });
    const changed = await shipmentRepository.setUserLinks(companyId, [{ field: "personInCharge", value: "jan@firma.cz", userId: JAN.id }]);
    expect(changed).toBe(0);
    const [row] = await db.select().from(shipmentTable).where(eq(shipmentTable.id, job.id));
    expect(row!.personInChargeUserId).toBe(EVA.id);
  });

  it("reads each distinct value of the two fields once", async () => {
    const companyId = randomUUID();
    await newJob(companyId, { personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz" });
    await newJob(companyId, { personInCharge: "jan@firma.cz", holidayCover: "" });
    const values = await shipmentRepository.personValuesOf(companyId);
    expect(values.filter((v) => v.field === "personInCharge").map((v) => v.value)).toEqual(["jan@firma.cz"]);
    expect(values.filter((v) => v.field === "holidayCover").map((v) => v.value).sort()).toEqual(["", "eva@firma.cz"]);
  });
});
