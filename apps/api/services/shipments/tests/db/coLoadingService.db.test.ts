import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "../../db/db";
import { coLoadingServiceRepository as repo } from "../../repositories/coLoadingService.repository";
import { coLoadingServiceTable as services } from "../../schemas/coLoadingService.schema";

// The SQL a service's money settings rely on (migration 0109), against the shipments database
// (Council Outlay 14, B4): the default box costs kept as they were given, the minimum earning per
// W/M to the cent, both cleared with null, and one company's service kept from another's. Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const newService = async (companyId: string, more: Partial<typeof services.$inferInsert> = {}) => {
  const [row] = await db
    .insert(services)
    .values({ companyId, name: `Import ${randomUUID().slice(0, 8)}`, serviceName: "ISHA", direction: "import", mode: "sea_lcl", ...more })
    .returning();
  return row!;
};
const defaults = [
  { kind: "origin", amount: null, currency: "EUR", note: "" },
  { kind: "ocean", amount: 2100, currency: "USD", note: "carrier's tariff" },
  { kind: "destination", amount: 300.5, currency: "EUR", note: "" },
];

describe("a service's money settings", () => {
  it("keep the default box costs as given and the minimum to the cent, and are cleared with null", async () => {
    const companyId = randomUUID();
    const s = await newService(companyId);
    expect(await repo.setMoney(s.id, companyId, { defaultBoxCosts: defaults, minEarningPerWm: 85.5 })).toMatchObject({ defaultBoxCosts: defaults, minEarningPerWm: "85.50" });
    expect(await repo.get(s.id, companyId)).toMatchObject({ defaultBoxCosts: defaults, minEarningPerWm: "85.50" });
    expect(await repo.setMoney(s.id, companyId, { defaultBoxCosts: null, minEarningPerWm: null })).toMatchObject({ defaultBoxCosts: null, minEarningPerWm: null });
  });

  it("are written on no service of another company, nor on one deleted", async () => {
    const companyId = randomUUID();
    const s = await newService(companyId);
    expect(await repo.setMoney(s.id, randomUUID(), { defaultBoxCosts: defaults, minEarningPerWm: 10 })).toBeNull();
    expect((await repo.get(s.id, companyId))?.minEarningPerWm).toBeNull();
    await db.update(services).set({ deletedAt: new Date() }).where(eq(services.id, s.id));
    expect(await repo.setMoney(s.id, companyId, { defaultBoxCosts: null, minEarningPerWm: 10 })).toBeNull();
  });
});
