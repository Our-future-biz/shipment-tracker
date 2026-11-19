import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { db } from "../../db/db";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentClaimRepository } from "../../repositories/shipmentClaim.repository";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentClaimTable, type NewShipmentClaimRecord } from "../../schemas/shipmentClaim.schema";

// The two reads of this database the Money tab of Shipments → Managers adds - its jobs (the active
// ones and those that read Invoiced since lately) and the open cost claims of the jobs asked
// about - against the shipments database: each finds its rows and nothing else. What they ask
// the database, as statements, is tests/repositories/shipment.repository.test.ts and
// tests/repositories/shipmentClaim.repository.test.ts. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

let jobs = 7900;
const newJob = async (companyId: string, over: Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", ...over }).returning();
  return row!;
};
const newClaim = async (companyId: string, shipmentId: string, over: Partial<Omit<NewShipmentClaimRecord, "companyId" | "shipmentId">> = {}) => {
  const [row] = await db.insert(shipmentClaimTable).values({ companyId, shipmentId, kind: "cost", ...over }).returning();
  return row!;
};

describe("the open cost claims of the jobs asked about", () => {
  it("finds the company's open, live claims on costs of those jobs, the oldest first, with what the Money tab reads of each", async () => {
    const companyId = randomUUID();
    const otherCompany = randomUUID();
    const [asked, second, notAsked] = await Promise.all([newJob(companyId), newJob(companyId), newJob(companyId)]);
    const foreign = await newJob(otherCompany);
    const supplierInvoiceId = randomUUID();

    const newer = await newClaim(companyId, asked!.id, { claimAmount: "120.50", claimCurrency: "EUR", supplier: "Maersk", createdAt: new Date("2026-10-10T08:00:00Z") });
    const older = await newClaim(companyId, asked!.id, { supplierInvoiceId, reason: "Overcharged", createdAt: new Date("2026-09-01T08:00:00Z") });
    const blank = await newClaim(companyId, second!.id, { createdAt: new Date("2026-10-20T08:00:00Z") });
    // None of these is an open cost claim of a job asked about.
    await newClaim(companyId, asked!.id, { status: "accepted", closedAt: new Date("2026-10-15T08:00:00Z"), closedBy: "jan@firma.cz" });
    await newClaim(companyId, asked!.id, { status: "rejected" });
    await newClaim(companyId, asked!.id, { status: "withdrawn" });
    await newClaim(companyId, asked!.id, { kind: "cargo", cargoState: "Damaged" });
    await newClaim(companyId, asked!.id, { deletedAt: new Date() });
    await newClaim(companyId, notAsked!.id, { claimAmount: "9.00", claimCurrency: "EUR" });
    await newClaim(otherCompany, foreign.id, { claimAmount: "9.00", claimCurrency: "EUR" });

    const rows = await shipmentClaimRepository.openCostClaimsByShipmentIds(companyId, [asked!.id, second!.id, foreign.id]);
    expect(rows).toEqual([
      { shipmentId: asked!.id, createdAt: older.createdAt, claimAmount: null, claimCurrency: "", supplierInvoiceId, supplier: "", invoiceNumber: "", reason: "Overcharged", amount: "", note: "" },
      { shipmentId: asked!.id, createdAt: newer.createdAt, claimAmount: "120.50", claimCurrency: "EUR", supplierInvoiceId: null, supplier: "Maersk", invoiceNumber: "", reason: "", amount: "", note: "" },
      // A row nobody filled in is read too: lib/managersMoney moneyClaimsOf leaves it out.
      { shipmentId: second!.id, createdAt: blank.createdAt, claimAmount: null, claimCurrency: "", supplierInvoiceId: null, supplier: "", invoiceNumber: "", reason: "", amount: "", note: "" },
    ]);
  });

  it("reads nothing for no job", async () => {
    await expect(shipmentClaimRepository.openCostClaimsByShipmentIds(randomUUID(), [])).resolves.toEqual([]);
  });
});

describe("the Money tab's read of the jobs", () => {
  const SINCE = "2026-08-20";
  const old = new Date("2026-01-10T08:00:00Z");
  /** A job that reads Invoiced, created and last changed long before the window unless a test says otherwise. */
  const INVOICED = { invoicingStatus: "Invoiced", createdAt: old, updatedAt: old };

  it("is every active job as the cockpit reads them, and the invoiced ones that were taxed - or last changed - on the day given or later", async () => {
    const companyId = randomUUID();
    const customerId = randomUUID();
    const active = await newJob(companyId, { createdAt: new Date("2026-11-01T08:00:00Z"), customerId });
    const inBilling = await newJob(companyId, { createdAt: new Date("2026-11-02T08:00:00Z"), status: "Billing [IMP]", invoicingStatus: "Not Invoiced" });
    // Invoiced, an import by its ATA: on the day itself it is in, the day before it is out.
    const byAta = await newJob(companyId, { ...INVOICED, actualArrival: SINCE });
    await newJob(companyId, { ...INVOICED, actualArrival: "2026-08-19" });
    // An export goes by its ATD, whatever its ATA says; a Domestic job and one of the Road Department by their delivery.
    const byAtd = await newJob(companyId, { ...INVOICED, createdAt: new Date("2026-01-11T08:00:00Z"), tradeDirection: "Export", actualDeparture: "2026-09-01", actualArrival: "2026-01-01" });
    await newJob(companyId, { ...INVOICED, tradeDirection: "Export", actualDeparture: "2026-08-01", actualArrival: "2026-10-01" });
    const byDelivery = await newJob(companyId, { ...INVOICED, createdAt: new Date("2026-01-12T08:00:00Z"), tradeDirection: "Domestic", actualDeliveryDate: "2026-10-05", actualArrival: "2026-01-01" });
    const roadByDelivery = await newJob(companyId, { ...INVOICED, createdAt: new Date("2026-01-13T08:00:00Z"), department: "Road Department", actualDeliveryDate: "2026-10-06" });
    await newJob(companyId, { ...INVOICED, department: "Road Department", actualDeliveryDate: "2026-08-01", actualArrival: "2026-10-01" });
    // An old tax date, invoiced lately: its last change keeps it in - 19 Aug 22:30 UTC is the 20th in Prague.
    const invoicedLately = await newJob(companyId, { ...INVOICED, createdAt: new Date("2026-01-14T08:00:00Z"), actualArrival: "2026-08-01", updatedAt: new Date("2026-08-19T22:30:00Z") });
    await newJob(companyId, { ...INVOICED, actualArrival: "2026-08-01", updatedAt: new Date("2026-08-19T21:30:00Z") });
    // No tax date at all: by its last change alone.
    const noTaxDate = await newJob(companyId, { ...INVOICED, createdAt: new Date("2026-01-15T08:00:00Z"), updatedAt: new Date("2026-11-10T08:00:00Z") });
    await newJob(companyId, INVOICED);
    // Never: cancelled, deleted, another company's.
    await newJob(companyId, { ...INVOICED, status: CANCELLED_STATUS, actualArrival: "2026-11-01" });
    await newJob(companyId, { status: CANCELLED_STATUS });
    await newJob(companyId, { ...INVOICED, actualArrival: "2026-11-01", deletedAt: new Date() });
    await newJob(randomUUID(), { ...INVOICED, actualArrival: "2026-11-01" });

    const rows = await shipmentRepository.managersMoneyRows(companyId, SINCE, { active: 100, invoiced: 100 });
    // The newest first, by when they were created - here every active job is newer than every invoiced one.
    expect(rows.map((r) => r.id)).toEqual([inBilling.id, active.id, noTaxDate.id, invoicedLately.id, roadByDelivery.id, byDelivery.id, byAtd.id, byAta.id]);
    expect(rows.map((r) => r.invoicingStatus)).toEqual(["Not Invoiced", "", "Invoiced", "Invoiced", "Invoiced", "Invoiced", "Invoiced", "Invoiced"]);
    expect(rows.find((r) => r.id === active.id)).toMatchObject({ customerId, jobNumber: active.jobNumber });
    expect(rows.find((r) => r.id === inBilling.id)!.customerId).toBeNull();
    // The one column of the cockpit's read it leaves out.
    expect(rows[0]).not.toHaveProperty("arrivalNoticeSent");
    // The active jobs are exactly the cockpit's.
    expect((await shipmentRepository.managersCockpitRows(companyId, 100)).map((r) => r.id)).toEqual([inBilling.id, active.id]);
    // Each group is cut by itself, the newest of it kept: the active jobs cut to one still leave every invoiced one read…
    expect((await shipmentRepository.managersMoneyRows(companyId, SINCE, { active: 1, invoiced: 100 })).map((r) => r.id)).toEqual([
      inBilling.id,
      noTaxDate.id,
      invoicedLately.id,
      roadByDelivery.id,
      byDelivery.id,
      byAtd.id,
      byAta.id,
    ]);
    // …and the other way round.
    expect((await shipmentRepository.managersMoneyRows(companyId, SINCE, { active: 100, invoiced: 2 })).map((r) => r.id)).toEqual([inBilling.id, active.id, noTaxDate.id, invoicedLately.id]);
  });
});
