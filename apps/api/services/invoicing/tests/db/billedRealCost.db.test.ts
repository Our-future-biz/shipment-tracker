import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

// A billed job's late real cost against the invoicing database (mock council M1, S1-06): the moment a job was first
// billed, and the write of a line's real cost made only on the real cost as it was read. Each test works in a
// company of its own. Runs only under `encore test` (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { invoiceRepository } from "../../repositories/invoice.repository";
import { invoiceCostRepository } from "../../repositories/invoiceCost.repository";
import { invoiceTable as inv } from "../../schemas/invoice.schema";
import { invoiceCostTable as c } from "../../schemas/invoiceCost.schema";
import { supplierInvoiceTable as si } from "../../schemas/supplierInvoice.schema";

const costLine = async (companyId: string, shipmentId: string, over: Partial<typeof c.$inferInsert> = {}) =>
  (await db.insert(c).values({ companyId, shipmentId, category: "ocean_freight", vendor: "DHL", invoiceNumber: "DHL-7781", received: true, ...over }).returning())[0]!;

const customerInvoice = async (companyId: string, shipmentId: string, over: Partial<typeof inv.$inferInsert> = {}) => {
  const customerId = randomUUID();
  return (
    await db
      .insert(inv)
      .values({
        companyId,
        shipmentId,
        kind: "invoice",
        status: "issued",
        number: `INV-${randomUUID()}`,
        customerId,
        issueDate: "2026-11-05",
        duzp: "2026-11-04",
        dueDate: "2026-11-19",
        currency: "EUR",
        fxRate: "25.000000",
        net: "100.00",
        vat: "0.00",
        gross: "100.00",
        netCzk: "2500.00",
        vatCzk: "0.00",
        grossCzk: "2500.00",
        vatSummary: [],
        supplier: {} as never,
        customer: { customerId, companyName: "Gama Elektro a.s.", address: "", city: "", country: "CZ", ico: "", dic: "", paymentTerms: "14 days" },
        shipment: { jobNumber: "CZ00000053", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
        issuedBy: randomUUID(),
        ...over,
      })
      .returning()
  )[0]!;
};

describe("when a job was first billed (mock council M1)", () => {
  it("is the making of its first invoice that stands: not a credited or cancelled one", async () => {
    const a = randomUUID();
    const job = randomUUID();
    expect(await invoiceRepository.firstBilledAt(job, a)).toBeNull();
    await customerInvoice(a, job, { status: "credited", createdAt: new Date("2026-11-01T08:00:00Z") });
    await customerInvoice(a, job, { status: "cancelled", createdAt: new Date("2026-11-02T08:00:00Z") });
    await customerInvoice(a, job, { createdAt: new Date("2026-11-09T08:00:00Z") });
    await customerInvoice(a, job, { createdAt: new Date("2026-11-05T08:00:00Z") });
    expect((await invoiceRepository.firstBilledAt(job, a))?.toISOString()).toBe("2026-11-05T08:00:00.000Z");
    // Another company's invoice of the same job id is not this one's.
    expect(await invoiceRepository.firstBilledAt(job, randomUUID())).toBeNull();
  });
});

describe("a billed line's real cost written on it as read (mock council S1-06)", () => {
  it("goes through while the line still has it, the amount compared as a number", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const line = await costLine(a, job);
    const first = await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1450.00" }, undefined, { realAmount: null });
    expect(first?.realAmount).toBe("1450.00");
    const second = await invoiceCostRepository.updateLine(line.id, a, job, { realCurrency: "USD" }, undefined, { realAmount: "1450", realCurrency: "CZK" });
    expect(second).toMatchObject({ realAmount: "1450.00", realCurrency: "USD" });
  });

  it("writes nothing once someone else changed it meanwhile", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const line = await costLine(a, job);
    // Both read "no real cost yet"; the first lands.
    await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1000.00" }, undefined, { realAmount: null });
    expect(await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1450.00" }, undefined, { realAmount: null })).toBeNull();
    expect(await invoiceCostRepository.updateLine(line.id, a, job, { realQty: "2" }, undefined, { realAmount: "1000.00", realQty: "3" })).toBeNull();
    expect(await invoiceCostRepository.updateLine(line.id, a, job, { realCurrency: "EUR" }, undefined, { realAmount: "1000.00", realCurrency: "USD" })).toBeNull();
    const [now] = await db.select().from(c).where(eq(c.id, line.id));
    expect(now).toMatchObject({ realAmount: "1000.00", realQty: null, realCurrency: "CZK" });
  });

  it("is as before with nothing read to hold it to", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const line = await costLine(a, job, { realAmount: "1000.00" });
    expect(await invoiceCostRepository.updateLine(line.id, a, job, { description: "late DHL" })).toMatchObject({ description: "late DHL", realAmount: "1000.00" });
  });
});

// System-21 mock council review of M1: when a line's real amount came is the line's own (migration 0041's trigger),
// whatever writes it - never its supplier invoice record's, which a backfill or a relink makes again later.
describe("when a line's real cost came (invoice_cost.real_cost_at)", () => {
  const atOf = async (id: string) => (await db.select({ at: c.realCostAt }).from(c).where(eq(c.id, id)))[0]!.at;

  it("is stamped when the real amount goes from none to one, kept while it stays, cleared with it", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const line = await costLine(a, job, { invoiceNumber: "" });
    expect(line.realCostAt).toBeNull();
    // A change that is no real amount stamps nothing.
    await invoiceCostRepository.updateLine(line.id, a, job, { realCurrency: "USD" });
    expect(await atOf(line.id)).toBeNull();
    const typed = await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1450.00" });
    expect(typed?.realCostAt).toBeInstanceOf(Date);
    const first = typed!.realCostAt!.toISOString();
    // Put right, renumbered, written with a stamp of its own: the moment it came stays.
    await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1405.00", invoiceNumber: "DHL-7781" });
    await invoiceCostRepository.updateLine(line.id, a, job, { realCostAt: new Date("2030-01-01T00:00:00Z") });
    expect((await atOf(line.id))?.toISOString()).toBe(first);
    // Taken off (a refused invoice): cleared, and a real cost that comes again is stamped anew.
    await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: null });
    expect(await atOf(line.id)).toBeNull();
    await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1400.00" });
    expect(await atOf(line.id)).toBeInstanceOf(Date);
  });

  it("is stamped on a line written with its real cost, and none on one without", async () => {
    const a = randomUUID();
    const job = randomUUID();
    expect((await costLine(a, job, { realAmount: "10.00" })).realCostAt).toBeInstanceOf(Date);
    expect((await costLine(a, job, { estAmount: "10.00" })).realCostAt).toBeNull();
    // A line written with its real cost as it came before (as a test or a copy may) keeps that moment.
    expect((await costLine(a, job, { realAmount: "10.00", realCostAt: new Date("2026-11-01T09:00:00Z") })).realCostAt?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    // Nothing written with no real cost holds a moment.
    expect((await costLine(a, job, { realCostAt: new Date("2026-11-01T09:00:00Z") })).realCostAt).toBeNull();
  });
});

describe("a late real cost put right only while its supplier invoice is booked and unpaid (system-21 mock council review)", () => {
  const apInvoice = async (companyId: string, over: Partial<typeof si.$inferInsert> = {}) =>
    (await db.insert(si).values({ companyId, supplierKey: "n:dhl", vendor: "DHL", invoiceNumber: "DHL-7781", numberKey: `DHL-${randomUUID()}`, ...over }).returning())[0]!;

  it("goes through while booked and unpaid, the line still on it; not once it is approved, or the line moved", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const invoice = await apInvoice(a);
    const line = await costLine(a, job, { realAmount: "1450.00", supplierInvoiceId: invoice.id });
    const fix = (amount: string, asRead: string, openInvoiceId = invoice.id) =>
      invoiceCostRepository.updateLine(line.id, a, job, { realAmount: amount }, undefined, { realAmount: asRead, openInvoiceId });
    expect(await fix("1405.00", "1450.00")).toMatchObject({ realAmount: "1405.00" });
    // Another invoice than the one read: nothing.
    expect(await fix("1400.00", "1405.00", (await apInvoice(a)).id)).toBeNull();
    // Approved between the read and the write: nothing.
    await db.update(si).set({ status: "approved" }).where(eq(si.id, invoice.id));
    expect(await fix("1400.00", "1405.00")).toBeNull();
    // Paid: nothing either.
    await db.update(si).set({ paidOn: "2026-11-15" }).where(eq(si.id, invoice.id));
    expect(await fix("1400.00", "1405.00")).toBeNull();
    const [now] = await db.select().from(c).where(eq(c.id, line.id));
    expect(now).toMatchObject({ realAmount: "1405.00" });
  });

  it("is another company's invoice of the same id for none", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const invoice = await apInvoice(randomUUID());
    const line = await costLine(a, job, { realAmount: "1450.00", supplierInvoiceId: invoice.id });
    expect(await invoiceCostRepository.updateLine(line.id, a, job, { realAmount: "1405.00" }, undefined, { realAmount: "1450.00", openInvoiceId: invoice.id })).toBeNull();
  });
});
