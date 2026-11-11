import { describe, expect, it } from "vitest";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { TenantRepository, type AnyDb } from "../db/repository";

// What the shared update writes: never the row's identity, tenant or deletion, whatever it is given.
const table = pgTable("thing", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  deletedAt: timestamp("deleted_at"),
});

function fakeDb() {
  const sets: Record<string, unknown>[] = [];
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return { where: () => ({ returning: async () => [{ id: "t1" }] }) };
      },
    }),
  };
  return { db: db as unknown as AnyDb, sets };
}

class Things extends TenantRepository<typeof table> {}

describe("the shared update", () => {
  it("writes the fields given but never id, companyId, createdAt or deletedAt", async () => {
    const { db, sets } = fakeDb();
    const things = new Things(db, table, "thing");
    await things.updateForCompany("t1", "c1", { name: "new", companyId: "other-company", id: "t2", deletedAt: null, createdAt: new Date(0) } as never);
    expect(Object.keys(sets[0]!).sort()).toEqual(["name", "updatedAt"]);
    await things.update("t1", { name: "again", companyId: "other-company" } as never);
    expect(Object.keys(sets[1]!).sort()).toEqual(["name", "updatedAt"]);
  });
});
