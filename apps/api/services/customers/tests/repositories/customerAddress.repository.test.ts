import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The address writes that keep the customer's seat columns in step with its Registered address,
// run against a stand-in for the database that records what is written in the transaction.
const fake = vi.hoisted(() => {
  const state = {
    /** The address before an update (its type), or none. */
    before: [] as { type: string }[],
    /** The row an address write returns. */
    address: null as Record<string, unknown> | null,
    /** The live Registered address read for the customer. */
    seat: [] as Record<string, unknown>[],
    customerWrites: [] as { set: Record<string, unknown>; where: SQL }[],
    addressWrites: [] as Record<string, unknown>[],
  };
  const name = (table: unknown) => (table as { [k: symbol]: string })[Symbol.for("drizzle:Name")];
  const tx = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({ where: () => ({ limit: async () => ("type" in fields ? state.before : state.seat) }) }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.addressWrites.push(values);
          return [{ id: "a1", ...values }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            if (name(table) === "customer") {
              state.customerWrites.push({ set, where });
              return [{ id: "c1" }];
            }
            state.addressWrites.push(set);
            return state.address ? [state.address] : [];
          },
        }),
      }),
    }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerAddressRepository } from "../../repositories/customerAddress.repository";
import { customerTable } from "../../schemas/customer.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const address = (over: Record<string, unknown> = {}) => ({
  id: "a1", customerId: "c1", companyId: COMPANY, type: "Registered", label: "", street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ",
  ...over,
});
const seatOf = (a: Record<string, unknown>) => ({ street: a.street, city: a.city, postalCode: a.postalCode, country: a.country });

beforeEach(() => {
  Object.assign(fake.state, { before: [], address: null, seat: [], customerWrites: [], addressWrites: [] });
});

describe("the customer's seat follows its Registered address", () => {
  it("a new Registered address is written to the customer, only where its columns differ", async () => {
    fake.state.seat = [seatOf(address())];
    await customerAddressRepository.createWithSeat(COMPANY, { customerId: "c1", type: "Registered", label: "", street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ" });
    expect(fake.state.customerWrites).toHaveLength(1);
    expect(fake.state.customerWrites[0]!.set).toMatchObject({ registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4", country: "CZ" });
    const { sql, params } = new PgDialect().sqlToQuery(fake.state.customerWrites[0]!.where);
    expect(sql).toContain(`"${getTableName(customerTable)}"."company_id" = $`);
    expect(sql).toContain('"customer"."deleted_at" is null');
    expect(sql).toContain('("customer"."registered_address" <> $');
    expect(params).toEqual(expect.arrayContaining(["c1", COMPANY, "Na Pankráci 10, 140 00 Praha 4", "Praha 4", "CZ"]));
  });

  it("other addresses leave the customer alone", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, { customerId: "c1", type: "Pickup", label: "", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02", country: "CZ" });
    fake.state.before = [{ type: "Pickup" }];
    fake.state.address = address({ type: "Pickup", city: "Kolín" });
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { city: "Kolín" });
    fake.state.address = address({ type: "Delivery" });
    await customerAddressRepository.softDeleteWithSeat("a1", COMPANY);
    expect(fake.state.customerWrites).toEqual([]);
  });

  it("an edit of the Registered address reaches the customer", async () => {
    fake.state.before = [{ type: "Registered" }];
    fake.state.address = address({ city: "Praha 5", postalCode: "150 00" });
    fake.state.seat = [seatOf(fake.state.address)];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { city: "Praha 5", postalCode: "150 00" });
    expect(fake.state.customerWrites.map((w) => w.set)).toEqual([
      expect.objectContaining({ registeredAddress: "Na Pankráci 10, 150 00 Praha 5", city: "Praha 5", country: "CZ" }),
    ]);
  });

  it("a type change counts both ways: made Registered it is the seat, retyped away it leaves none", async () => {
    fake.state.before = [{ type: "Billing" }];
    fake.state.address = address();
    fake.state.seat = [seatOf(address())];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { type: "Registered" });
    fake.state.before = [{ type: "Registered" }];
    fake.state.address = address({ type: "Billing" });
    fake.state.seat = [];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { type: "Billing" });
    expect(fake.state.customerWrites.map((w) => w.set)).toEqual([
      expect.objectContaining({ registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4" }),
      expect.objectContaining({ registeredAddress: "", city: "" }),
    ]);
    expect(fake.state.customerWrites[1]!.set).not.toHaveProperty("country");
  });

  it("a deleted Registered address empties the customer's address and city, the country stays", async () => {
    fake.state.address = address();
    await customerAddressRepository.softDeleteWithSeat("a1", COMPANY);
    expect(fake.state.customerWrites).toHaveLength(1);
    expect(fake.state.customerWrites[0]!.set).toMatchObject({ registeredAddress: "", city: "" });
    expect(fake.state.customerWrites[0]!.set).not.toHaveProperty("country");
  });

  it("an address that isn't there writes nothing", async () => {
    await expect(customerAddressRepository.updateWithSeat("x", COMPANY, { city: "Brno" })).resolves.toBeNull();
    await expect(customerAddressRepository.softDeleteWithSeat("x", COMPANY)).resolves.toBeNull();
    expect(fake.state.addressWrites).toHaveLength(1); // only the delete's attempt; the update stopped at the read
    expect(fake.state.customerWrites).toEqual([]);
  });
});
