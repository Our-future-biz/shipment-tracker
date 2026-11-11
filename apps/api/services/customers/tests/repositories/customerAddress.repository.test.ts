import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The address writes that keep the customer's seat columns in step with its Registered address,
// run against a stand-in for the database that records what is written in the transaction.
const fake = vi.hoisted(() => {
  const state = {
    /** The address before an update (its types), or none. */
    before: [] as { types: string[] }[],
    /** The row an address write returns. */
    address: null as Record<string, unknown> | null,
    /** The live Registered address read for the customer. */
    seat: [] as Record<string, unknown>[],
    customerWrites: [] as { set: Record<string, unknown>; where: SQL }[],
    addressWrites: [] as Record<string, unknown>[],
    /** The address's live site read before it is written again, or none. */
    site: [] as Record<string, unknown>[],
    siteInserts: [] as Record<string, unknown>[],
    siteUpdates: [] as Record<string, unknown>[],
    siteUpdateWheres: [] as SQL[],
  };
  const name = (table: unknown) => (table as { [k: symbol]: string })[Symbol.for("drizzle:Name")];
  const tx = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: () => ({ limit: async () => (name(table) === "customer_site" ? state.site : fields && "types" in fields ? state.before : state.seat) }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        // A site is written without reading it back.
        if (name(table) === "customer_site") {
          state.siteInserts.push(values);
          return {};
        }
        return {
          returning: async () => {
            state.addressWrites.push(values);
            return [{ id: "a1", deletedAt: null, ...values }];
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          if (name(table) === "customer_site") {
            state.siteUpdates.push(set);
            state.siteUpdateWheres.push(where);
            return {};
          }
          return {
            returning: async () => {
              if (name(table) === "customer") {
                state.customerWrites.push({ set, where });
                return [{ id: "c1" }];
              }
              state.addressWrites.push(set);
              return state.address ? [state.address] : [];
            },
          };
        },
      }),
    }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { customerAddressRepository } from "../../repositories/customerAddress.repository";
import { customerTable } from "../../schemas/customer.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const address = (over: Record<string, unknown> = {}) => ({
  id: "a1", customerId: "c1", companyId: COMPANY, types: ["Registered"], label: "", street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ",
  deletedAt: null,
  ...over,
});
const seatOf = (a: Record<string, unknown>) => ({ street: a.street, city: a.city, postalCode: a.postalCode, country: a.country });

beforeEach(() => {
  Object.assign(fake.state, { before: [], address: null, seat: [], customerWrites: [], addressWrites: [], site: [], siteInserts: [], siteUpdates: [], siteUpdateWheres: [] });
});

describe("the customer's seat follows its Registered address", () => {
  it("a new Registered address is written to the customer, only where its columns differ", async () => {
    fake.state.seat = [seatOf(address())];
    await customerAddressRepository.createWithSeat(COMPANY, { customerId: "c1", types: ["Registered"], label: "", street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ" });
    expect(fake.state.customerWrites).toHaveLength(1);
    expect(fake.state.customerWrites[0]!.set).toMatchObject({ registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4", country: "CZ" });
    const { sql, params } = new PgDialect().sqlToQuery(fake.state.customerWrites[0]!.where);
    expect(sql).toContain(`"${getTableName(customerTable)}"."company_id" = $`);
    expect(sql).toContain('"customer"."deleted_at" is null');
    expect(sql).toContain('("customer"."registered_address" <> $');
    expect(params).toEqual(expect.arrayContaining(["c1", COMPANY, "Na Pankráci 10, 140 00 Praha 4", "Praha 4", "CZ"]));
  });

  it("other addresses leave the customer alone", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, { customerId: "c1", types: ["Pickup"], label: "", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02", country: "CZ" });
    fake.state.before = [{ types: ["Pickup"] }];
    fake.state.address = address({ types: ["Pickup"], city: "Kolín" });
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { city: "Kolín" });
    fake.state.address = address({ types: ["Delivery"] });
    await customerAddressRepository.softDeleteWithSeat("a1", COMPANY);
    expect(fake.state.customerWrites).toEqual([]);
  });

  it("an edit of the Registered address reaches the customer", async () => {
    fake.state.before = [{ types: ["Registered"] }];
    fake.state.address = address({ city: "Praha 5", postalCode: "150 00" });
    fake.state.seat = [seatOf(fake.state.address)];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { city: "Praha 5", postalCode: "150 00" });
    expect(fake.state.customerWrites.map((w) => w.set)).toEqual([
      expect.objectContaining({ registeredAddress: "Na Pankráci 10, 150 00 Praha 5", city: "Praha 5", country: "CZ" }),
    ]);
  });

  it("a type change counts both ways: made Registered it is the seat, retyped away it leaves none", async () => {
    fake.state.before = [{ types: ["Billing"] }];
    fake.state.address = address();
    fake.state.seat = [seatOf(address())];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { types: ["Registered"] });
    fake.state.before = [{ types: ["Registered"] }];
    fake.state.address = address({ types: ["Billing"] });
    fake.state.seat = [];
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { types: ["Billing"] });
    expect(fake.state.customerWrites.map((w) => w.set)).toEqual([
      expect.objectContaining({ registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4" }),
      expect.objectContaining({ registeredAddress: "", city: "" }),
    ]);
    expect(fake.state.customerWrites[1]!.set).not.toHaveProperty("country");
  });

  it("an address that is everything at once is the seat too", async () => {
    fake.state.seat = [seatOf(address())];
    await customerAddressRepository.createWithSeat(COMPANY, {
      customerId: "c1",
      types: ["Registered", "Billing", "Pickup", "Delivery"],
      label: "",
      street: "Na Pankráci 10",
      city: "Praha 4",
      postalCode: "140 00",
      country: "CZ",
    });
    expect(fake.state.customerWrites.map((w) => w.set)).toEqual([expect.objectContaining({ registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4" })]);
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

describe("a Pickup / Delivery address's site", () => {
  const pickup = { customerId: "c1", types: ["Pickup" as const], label: "Plant", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02", country: "CZ" };

  it("is added with the address, its postcode as sites keep it and the Sites tab's details", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, pickup, { openingHours: "7-15" });
    expect(fake.state.siteInserts).toEqual([
      {
        label: "Plant", kind: "loading", street: "Průmyslová 5", postcode: "28002", city: "Kolín", country: "CZ",
        openingHours: "7-15", companyId: COMPANY, customerId: "c1", addressId: "a1",
      },
    ]);
  });

  it("follows the address, used for both once it is also Delivery, its map position cleared when it moved", async () => {
    fake.state.before = [{ types: ["Pickup"] }];
    fake.state.site = [{ id: "s1", street: "Průmyslová 5", postcode: "28002", city: "Kolín", country: "CZ" }];
    fake.state.address = address({ ...pickup, types: ["Pickup", "Delivery"], street: "Průmyslová 7" });
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { types: ["Pickup", "Delivery"], street: "Průmyslová 7" });
    expect(fake.state.siteInserts).toEqual([]);
    expect(fake.state.siteUpdates).toEqual([expect.objectContaining({ kind: "both", street: "Průmyslová 7", lat: null, lng: null })]);
  });

  it("goes when the address is neither Pickup nor Delivery any more, or is deleted", async () => {
    fake.state.before = [{ types: ["Pickup"] }];
    fake.state.site = [{ id: "s1", street: "Průmyslová 5", postcode: "28002", city: "Kolín", country: "CZ" }];
    fake.state.address = address({ ...pickup, types: ["Billing"] });
    await customerAddressRepository.updateWithSeat("a1", COMPANY, { types: ["Billing"] });
    fake.state.address = address({ ...pickup, deletedAt: new Date() });
    await customerAddressRepository.softDeleteWithSeat("a1", COMPANY);
    expect(fake.state.siteUpdates).toEqual([expect.objectContaining({ deletedAt: expect.any(Date) }), expect.objectContaining({ deletedAt: expect.any(Date) })]);
  });

  it("is refused, with the address, when a Czech postcode is not 5 digits", async () => {
    await expect(customerAddressRepository.createWithSeat(COMPANY, { ...pickup, postalCode: "Kolín" })).rejects.toThrow(/5 digits/);
    expect(fake.state.siteInserts).toEqual([]);
  });

  it("made the default, the customer's other default site stops being it first, in the same transaction", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, pickup, { isDefault: true });
    expect(fake.state.siteUpdates).toEqual([{ isDefault: false, updatedAt: expect.any(Date) }]);
    const cleared = new PgDialect().sqlToQuery(fake.state.siteUpdateWheres[0]!);
    expect(cleared.sql).toContain('"customer_site"."customer_id" = $');
    expect(cleared.params).toEqual(expect.arrayContaining([COMPANY, "c1", true]));
    expect(fake.state.siteInserts).toEqual([expect.objectContaining({ isDefault: true, addressId: "a1" })]);

    // An existing site made the default keeps its own flag: only the others are cleared.
    Object.assign(fake.state, { siteInserts: [], siteUpdates: [], siteUpdateWheres: [] });
    fake.state.before = [{ types: ["Pickup"] }];
    fake.state.site = [{ id: "s1", street: "Průmyslová 5", postcode: "28002", city: "Kolín", country: "CZ" }];
    fake.state.address = address({ ...pickup });
    await customerAddressRepository.updateWithSeat("a1", COMPANY, {}, { isDefault: true });
    expect(fake.state.siteUpdates).toEqual([{ isDefault: false, updatedAt: expect.any(Date) }, expect.objectContaining({ isDefault: true })]);
    const others = new PgDialect().sqlToQuery(fake.state.siteUpdateWheres[0]!);
    expect(others.sql).toContain('"customer_site"."id" <> $');
    expect(others.params).toContain("s1");
  });

  it("not made the default, no other site is touched", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, pickup, { openingHours: "7-15" });
    await customerAddressRepository.createWithSeat(COMPANY, pickup, { isDefault: false });
    expect(fake.state.siteUpdates).toEqual([]);
  });

  it("is not added for an address that is no Pickup or Delivery", async () => {
    await customerAddressRepository.createWithSeat(COMPANY, { ...pickup, types: ["Billing"] });
    expect(fake.state.siteInserts).toEqual([]);
    expect(fake.state.siteUpdates).toEqual([]);
  });
});
