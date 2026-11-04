import { beforeEach, describe, expect, it, vi } from "vitest";

// The rating write, run against a stand-in for the database that records what each statement sets.
const fake = vi.hoisted(() => {
  const state = { sets: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], returning: [] as unknown[] };
  const tx = {
    update: () => ({ set: (values: Record<string, unknown>) => { state.sets.push(values); return { where: () => ({ returning: async () => state.returning }) }; } }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { state.inserts.push(values); } }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerSupplierRatingRepository } from "../../repositories/customerSupplierRating.repository";

beforeEach(() => {
  fake.state.sets = [];
  fake.state.inserts = [];
  fake.state.returning = [{ id: "c1" }];
});

describe("setting a supplier rating", () => {
  it("writes the customer and its history row together, at the same moment", async () => {
    const row = await customerSupplierRatingRepository.setRating("co", "c1", { rating: 4, reason: "Reliable", setBy: "martin@ourfuture.biz", setByUserId: "u1" });
    expect(row).toEqual({ id: "c1" });
    const [set] = fake.state.sets;
    expect(set).toMatchObject({ supplierRating: 4, supplierRatingReason: "Reliable", supplierRatingBy: "martin@ourfuture.biz", supplierRatingByUserId: "u1" });
    expect(set!.supplierRatingAt).toBeInstanceOf(Date);
    expect(fake.state.inserts).toEqual([
      { companyId: "co", customerId: "c1", rating: 4, reason: "Reliable", setBy: "martin@ourfuture.biz", setByUserId: "u1", createdAt: set!.updatedAt, updatedAt: set!.updatedAt },
    ]);
  });

  it("clears the customer back to not rated, while the history says who cleared it", async () => {
    await customerSupplierRatingRepository.setRating("co", "c1", { rating: null, reason: "", setBy: "lukas@ourfuture.biz", setByUserId: "u3" });
    expect(fake.state.sets[0]).toMatchObject({ supplierRating: null, supplierRatingReason: "", supplierRatingBy: "", supplierRatingByUserId: null, supplierRatingAt: null });
    expect(fake.state.inserts[0]).toMatchObject({ rating: null, setBy: "lukas@ourfuture.biz", setByUserId: "u3" });
  });

  it("keeps no history for a customer that is not there", async () => {
    fake.state.returning = [];
    expect(await customerSupplierRatingRepository.setRating("co", "gone", { rating: 5, reason: "", setBy: "x", setByUserId: null })).toBeNull();
    expect(fake.state.inserts).toEqual([]);
  });
});
