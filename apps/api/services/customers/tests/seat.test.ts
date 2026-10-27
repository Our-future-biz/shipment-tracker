import { describe, expect, it } from "vitest";
import { planSeatNormalize, seatColumns, seatText, type SeatRow } from "../lib/seat";

const created = new Date("2026-03-01T08:00:00Z");
const later = new Date("2026-10-20T08:00:00Z");
const row = (over: Partial<SeatRow> = {}): SeatRow => ({
  id: "c1", companyName: "Alfa s.r.o.", registeredAddress: "Vitějovská, 228/12, Praha, 14300", city: "Praha", country: "CZ", createdAt: created,
  seat: { street: "Vitějovská 228/12", city: "Praha 4", postalCode: "143 00", country: "CZ", updatedAt: created },
  ...over,
});

describe("the customer's seat columns", () => {
  it("are written from the Registered address in the form a hand-typed seat has", () => {
    expect(seatText("Wittelsbacherplatz 2", "80333", "München")).toBe("Wittelsbacherplatz 2, 80333 München");
    expect(seatColumns({ street: "Na Výsluní 5", city: "Brno", postalCode: "602 00", country: "CZ" })).toEqual({
      registeredAddress: "Na Výsluní 5, 602 00 Brno", city: "Brno", country: "CZ",
    });
  });

  it("are emptied without a Registered address, all but the company's country", () => {
    expect(seatColumns(null)).toEqual({ registeredAddress: "", city: "" });
  });
});

describe("planSeatNormalize (the backfill)", () => {
  it("leaves a seat as it was written with the customer: it already matches, in the registry's wording", () => {
    expect(planSeatNormalize([row()])).toEqual({ checked: 1, changes: [], unmatched: [] });
  });

  it("copies a seat edited since into the customer", () => {
    const edited = row({ seat: { street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ", updatedAt: later } });
    expect(planSeatNormalize([edited]).changes).toEqual([
      { customerId: "c1", values: { registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4", country: "CZ" } },
    ]);
  });

  it("writes nothing for an edited seat the customer already shows (a second run)", () => {
    const synced = row({
      registeredAddress: "Na Pankráci 10, 140 00 Praha 4", city: "Praha 4",
      seat: { street: "Na Pankráci 10", city: "Praha 4", postalCode: "140 00", country: "CZ", updatedAt: later },
    });
    expect(planSeatNormalize([synced]).changes).toEqual([]);
  });

  it("lists a customer without a Registered address and leaves it as it is", () => {
    expect(planSeatNormalize([row({ seat: null })])).toEqual({
      checked: 1, changes: [], unmatched: [{ field: "registeredAddress", value: "Alfa s.r.o.", count: 1 }],
    });
  });
});
