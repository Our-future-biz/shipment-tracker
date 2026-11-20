import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: {}, quotes: {}, warehouse: {}, warehouseConcept: {}, trucking: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));

import { db } from "../../db/db";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";

// The Invoicing page's All and To bill lists against the shipments database: a job with a charge added after its
// invoice (lateChargeIds, User Council B4 / Q9) is listed whatever its status - but only the company's own live jobs
// the other filters keep (system-21 mock council review: All's OR once stood outside its brackets and escaped them).
// Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db); a plain `vitest run` skips it.

let jobs = 900;
type JobData = Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">>;
const newJob = async (companyId: string, over: JobData = {}) => {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", status: "Booking Confirmation Pending", ...over })
    .returning();
  return row!;
};
const listed = async (companyId: string, filters: { invoicing: string; mode?: string; lateChargeIds: string[] }) => {
  const { data, total } = await shipmentRepository.listFiltered(companyId, { ...filters, limit: 200, offset: 0, sortDirection: "asc" });
  expect(total).toBe(data.length);
  return data.map((s) => s.id).sort();
};

describe("the Invoicing page's late-charge jobs", () => {
  it("lists a late-charge job in All and To bill only when it is the company's, live, and kept by the other filters", async () => {
    const companyId = randomUUID();
    // Neither released (Billing) nor invoiced: only the late charge takes these jobs into All and To bill.
    const late = await newJob(companyId, { invoicingStatus: "Not Invoiced" });
    const deleted = await newJob(companyId, { invoicingStatus: "Not Invoiced", deletedAt: new Date() });
    const air = await newJob(companyId, { freightMode: "Air Freight", invoicingStatus: "Not Invoiced" });
    const otherCompany = await newJob(randomUUID(), { invoicingStatus: "Not Invoiced" });
    const lateChargeIds = [late.id, deleted.id, air.id, otherCompany.id];

    for (const invoicing of ["all", "billing"]) {
      // The company's live late-charge jobs, the deleted one and the other company's left out.
      expect(await listed(companyId, { invoicing, lateChargeIds })).toEqual([late.id, air.id].sort());
      // The mode filter leaves the air job out, late charge or not.
      expect(await listed(companyId, { invoicing, mode: "sea", lateChargeIds })).toEqual([late.id]);
    }
  });
});
