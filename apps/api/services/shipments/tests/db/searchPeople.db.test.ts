import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { shipmentRepository, type ShipmentListFilters } from "../../repositories/shipment.repository";
import { shipmentTable } from "../../schemas/shipment.schema";

// The Shipments list's search finds Handled By and Holiday Cover by the user's name the grid shows
// (mock council S7-5, and its review: all fields too), against the shipments database. Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const NAMES = new Map([
  ["eva.mala@firma.cz", "Eva Malá"],
  ["jan@firma.cz", "Jan Novák"],
]);

async function found(companyId: string, filters: Partial<ShipmentListFilters>) {
  const { data } = await shipmentRepository.listFiltered(companyId, { searchPeopleNames: NAMES, ...filters, limit: 50, offset: 0, sortDirection: "asc" });
  return data.map((s) => s.jobNumber).sort();
}

describe("the Shipments search by a person's name", () => {
  it("finds Handled By and Holiday Cover by the name, in all fields and in the chosen person column; a legacy 'e-mail — Name' by its text", async () => {
    const companyId = randomUUID();
    await db.insert(shipmentTable).values([
      { companyId, jobNumber: "CZ00000301", personInCharge: "Eva.Mala@firma.cz" },
      { companyId, jobNumber: "CZ00000302", holidayCover: "eva.mala@firma.cz" },
      { companyId, jobNumber: "CZ00000303", personInCharge: "jan@firma.cz" },
      // Legacy text with a name no user has: found by its text.
      { companyId, jobNumber: "CZ00000304", personInCharge: "old@firma.cz — Petr Malý" },
      { companyId, jobNumber: "CZ00000305", customer: "Nobody here" },
    ]);
    // All fields: both person columns, by the name and by the stored text.
    expect(await found(companyId, { search: "mala" })).toEqual(["CZ00000301", "CZ00000302"]);
    expect(await found(companyId, { search: "Eva Malá" })).toEqual(["CZ00000301", "CZ00000302"]);
    expect(await found(companyId, { search: "maly" })).toEqual(["CZ00000304"]);
    expect(await found(companyId, { search: "jan@firma" })).toEqual(["CZ00000303"]);
    // Chosen columns: only the chosen person column.
    expect(await found(companyId, { search: "mala", searchColumns: ["personInCharge"] })).toEqual(["CZ00000301"]);
    expect(await found(companyId, { search: "mala", searchColumns: ["customer"] })).toEqual([]);
    // Without the names (the users could not be read), the stored text still finds the e-mail.
    expect(await found(companyId, { search: "eva.mala", searchPeopleNames: new Map() })).toEqual(["CZ00000301", "CZ00000302"]);
  });
});
