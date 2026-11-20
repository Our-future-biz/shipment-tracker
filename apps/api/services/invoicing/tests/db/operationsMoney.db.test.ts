import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

// The reads of Shipments → Managers' Money tab (Council Outlay 11, step 4) against the invoicing database: which
// supplier invoices are on a set of jobs (by their live lines; a refused one by the lines it keeps), which
// estimates still wait for an invoice, which customer invoice makes a job "invoiced" - and that reading changes
// no row. Each test works in a company of its own. Runs only under `encore test`
// (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { operationsMoneyJobs } from "../../lib/operationsMoney";
import { billingSettingsRepository } from "../../repositories/billingSettings.repository";
import { invoiceRepository } from "../../repositories/invoice.repository";
import { invoiceCostRepository } from "../../repositories/invoiceCost.repository";
import { sellingCostRepository } from "../../repositories/sellingCost.repository";
import { supplierInvoiceRepository as repo } from "../../repositories/supplierInvoice.repository";
import { invoiceFollowupOutboxRepository } from "../../repositories/invoiceFollowupOutbox.repository";
import { followupsOfSellingChange } from "../../services/invoiceFollowups.service";
import { invoiceFollowupOutboxTable as outbox } from "../../schemas/invoiceFollowupOutbox.schema";
import { invoiceLineTable as il, invoiceTable as inv } from "../../schemas/invoice.schema";
import { invoiceCostTable as c } from "../../schemas/invoiceCost.schema";
import { invoiceSellingCostTable as s } from "../../schemas/invoiceSellingCost.schema";
import { supplierInvoiceTable as t } from "../../schemas/supplierInvoice.schema";

const ORIGIN = { source: "typed" as const, userId: null, userEmail: "" };
const RECEIVED = new Date("2026-11-10T09:00:00Z");

const costLine = async (companyId: string, shipmentId: string, over: Partial<typeof c.$inferInsert> = {}) =>
  (await db.insert(c).values({ companyId, shipmentId, category: "ocean_freight", vendor: "MSC", ...over }).returning())[0]!;
const invoiced = (companyId: string, shipmentId: string, number: string, over: Partial<typeof c.$inferInsert> = {}) =>
  costLine(companyId, shipmentId, { invoiceNumber: number, realAmount: "100.00", realCurrency: "EUR", received: true, receivedAt: RECEIVED, ...over });
const sellLine = async (companyId: string, shipmentId: string, over: Partial<typeof s.$inferInsert> = {}) =>
  (await db.insert(s).values({ companyId, shipmentId, category: "ocean_freight", amount: "100.00", currency: "EUR", ...over }).returning())[0]!;
const headersOf = (companyId: string) => db.select().from(t).where(and(eq(t.companyId, companyId), isNull(t.deletedAt)));

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
const invoiceLine = (companyId: string, invoiceId: string, sourceSellingCostId: string) =>
  db.insert(il).values({ companyId, invoiceId, seq: 1, description: "Ocean freight", qty: "1.00", unitPrice: "100.00", unitCurrency: "EUR", net: "100.00", vatCode: "OUT", vatRate: "0.00", sourceSellingCostId });

/** The whole of the three tables a read might touch, as text: the same before and after means nothing was written. */
const snapshot = async (companyId: string) =>
  JSON.stringify([
    await db.select().from(t).where(eq(t.companyId, companyId)).orderBy(t.id),
    await db.select().from(c).where(eq(c.companyId, companyId)).orderBy(c.id),
    await db.select().from(s).where(eq(s.companyId, companyId)).orderBy(s.id),
  ]);

describe("the supplier invoices on a set of jobs (listOfShipments)", () => {
  it("finds the invoices a live line of the jobs points to - not another job's, not another company's", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const [jobOne, jobTwo, jobOther] = [randomUUID(), randomUUID(), randomUUID()];
    await invoiced(a, jobOne, "FV-1");
    await invoiced(a, jobTwo, "FV-1"); // the same invoice on a second job
    await invoiced(a, jobTwo, "FV-2");
    await invoiced(a, jobOther, "FV-3");
    await invoiced(b, jobOne, "FV-9");
    await repo.sync(a, { all: true }, ORIGIN);
    await repo.sync(b, { all: true }, ORIGIN);

    const numbers = async (ids: string[]) => (await repo.listOfShipments(a, ids)).map((h) => h.numberKey).sort();
    expect(await numbers([jobOne])).toEqual(["FV-1"]);
    expect(await numbers([jobOne, jobTwo])).toEqual(["FV-1", "FV-2"]);
    expect(await numbers([randomUUID()])).toEqual([]);
  });

  it("leaves out an invoice whose only line on the job was deleted, and finds a refused one by the lines it keeps", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const gone = await invoiced(a, job, "GONE-1");
    const refused = await invoiced(a, job, "REF-2", { estAmount: "90.00", estCurrency: "EUR" });
    await repo.sync(a, { all: true }, ORIGIN);
    const byNumber = new Map((await headersOf(a)).map((h) => [h.numberKey, h]));
    // A manager decided the first (so the record stays when its line goes), then its line is deleted.
    await db.update(t).set({ status: "approved", decidedBy: "boss@test.cz", decidedAt: new Date() }).where(eq(t.id, byNumber.get("GONE-1")!.id));
    await db.update(c).set({ deletedAt: new Date() }).where(eq(c.id, gone.id));
    // The second is refused: its line goes back to an estimate, the record keeps it as it was.
    const refusedId = byNumber.get("REF-2")!.id;
    await db.transaction(async (tx) => {
      const kept = await repo.takeLinesOff(tx, a, refusedId);
      await repo.storeRefusedLines(tx, a, refusedId, kept);
      await tx.update(t).set({ status: "refused", decisionReason: "Wrong amount", decidedAt: new Date("2026-11-12T10:00:00Z") }).where(eq(t.id, refusedId));
    });
    expect((await db.select().from(c).where(eq(c.id, refused.id)))[0]).toMatchObject({ supplierInvoiceId: null, realAmount: null });

    const found = await repo.listOfShipments(a, [job]);
    expect(found.map((h) => [h.numberKey, h.status])).toEqual([["REF-2", "refused"]]);
    // The refused invoice is not found on a job its lines were never on.
    expect(await repo.listOfShipments(a, [randomUUID()])).toEqual([]);

    // And in the answer it is the job's refused invoice, its line an estimate waiting for an invoice again.
    const [answer] = operationsMoneyJobs({
      shipmentIds: [job],
      today: "2026-11-18",
      lines: null,
      invoices: null,
      supplierInvoices: { invoices: found, lines: await repo.costLinesOf(a, found.filter((h) => h.status !== "refused").map((h) => h.id)), claims: [], suppliers: new Map() },
      estimates: await repo.expectedLinesOfShipments(a, [job]),
      rates: new Map(),
      noRates: new Map(),
    });
    expect(answer!.supplierInvoices).toMatchObject({ toApprove: 0, refused: 1, lastRefusedOn: "2026-11-12" });
    expect(answer!.estimatesOpen).toMatchObject({ lines: 1, amounts: [{ currency: "EUR", amount: 90 }] });
  });
});

describe("the estimates of a set of jobs still waiting for an invoice (expectedLinesOfShipments)", () => {
  it("are the Expected tab's lines, for the jobs asked", async () => {
    const a = randomUUID();
    const [job, other] = [randomUUID(), randomUUID()];
    const waiting = await costLine(a, job, { estAmount: "250.00", estQty: "2.00", estCurrency: "EUR" });
    await costLine(a, job, { estAmount: "0.00" }); // no value
    await costLine(a, job, { estAmount: "80.00", realAmount: "85.00" }); // the real cost is in
    await costLine(a, job, { estAmount: "80.00", invoiceNumber: "FV-7" }); // an invoice number is typed
    await costLine(a, job, { estAmount: "80.00", sourceMasterJobRef: `master:${randomUUID()}:${randomUUID()}` }); // a master job's share
    await costLine(a, job, { estAmount: "80.00", sourceTruckingRef: `trucking:trip:${randomUUID()}` }); // Trucking's row
    await costLine(a, job, { estAmount: "80.00", deletedAt: new Date() });
    const elsewhere = await costLine(a, other, { estAmount: "40.00" });

    expect((await repo.expectedLinesOfShipments(a, [job])).map((l) => l.id)).toEqual([waiting.id]);
    // The same lines as the Expected tab reads for the whole company.
    const all = (await repo.expectedLines(a, 1000)).map((l) => l.id).sort();
    expect((await repo.expectedLinesOfShipments(a, [job, other])).map((l) => l.id).sort()).toEqual(all);
    expect(all).toEqual([waiting.id, elsewhere.id].sort());
    // Another company sees none of them.
    expect(await repo.expectedLinesOfShipments(randomUUID(), [job, other])).toEqual([]);
  });
});

describe("what makes a job invoiced, and a line not yet invoiced", () => {
  it("takes the first open invoice's issue day: not a credited one, a cancelled one or a credit note", async () => {
    const a = randomUUID();
    const [open, credited, cancelled, never] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await customerInvoice(a, open, { issueDate: "2026-11-09" });
    await customerInvoice(a, open, { issueDate: "2026-11-05" });
    const was = await customerInvoice(a, credited, { status: "credited", issueDate: "2026-11-03" });
    await customerInvoice(a, credited, { kind: "credit_note", correctsInvoiceId: was.id, issueDate: "2026-11-06", net: "-100.00", gross: "-100.00", netCzk: "-2500.00", grossCzk: "-2500.00" });
    await customerInvoice(a, cancelled, { status: "cancelled", issueDate: "2026-11-04" });

    const billedOn = await invoiceRepository.firstBilledOn(a, [open, credited, cancelled, never]);
    expect([...billedOn.entries()]).toEqual([[open, "2026-11-05"]]);
  });

  it("counts a selling line as invoiced only while the invoice it is on stands - and reads the lot without writing a row", async () => {
    const a = randomUUID();
    const [job, creditedJob] = [randomUUID(), randomUUID()];
    const billed = await sellLine(a, job);
    await sellLine(a, job, { amount: "40.00", invoice: false }); // not ticked: still work not yet invoiced
    await sellLine(a, job, { amount: "900.00", currency: "CZK" });
    const back = await sellLine(a, creditedJob);
    const standing = await customerInvoice(a, job);
    await invoiceLine(a, standing.id, billed.id);
    const reversed = await customerInvoice(a, creditedJob, { status: "credited" });
    await invoiceLine(a, reversed.id, back.id);
    await costLine(a, job, { category: "container_detention", realAmount: "120.00", realCurrency: "EUR" });
    await invoiced(a, job, "FV-1");
    await repo.sync(a, { all: true }, ORIGIN);

    const before = await snapshot(a);
    const ids = [job, creditedJob];
    const [selling, buying, billing, openInvoices, billedOn, headers, estimates] = [
      await sellingCostRepository.listByShipmentIds(a, ids),
      await invoiceCostRepository.listByShipmentIds(a, ids),
      await billingSettingsRepository.currenciesOf(a, ids),
      await invoiceRepository.listOpenInvoicesWithSources(ids, a),
      await invoiceRepository.firstBilledOn(a, ids),
      await repo.listOfShipments(a, ids),
      await repo.expectedLinesOfShipments(a, ids),
    ];
    const jobs = operationsMoneyJobs({
      shipmentIds: ids,
      today: "2026-11-18",
      lines: { selling, buying, billingCurrency: new Map(billing.map((b) => [b.shipmentId, b.billingCurrency])) },
      invoices: { open: openInvoices, billedOn },
      supplierInvoices: { invoices: headers, lines: await repo.costLinesOf(a, headers.map((h) => h.id)), claims: [], suppliers: new Map() },
      estimates,
      rates: new Map([[job, { EUR: 25 }], [creditedJob, { EUR: 25 }]]),
      noRates: new Map(),
    });
    expect(await snapshot(a)).toBe(before);

    expect(jobs[0]).toMatchObject({
      // 40 EUR not ticked and 900 CZK are not on the invoice; the 100 EUR line is.
      notYetInvoiced: [{ currency: "CZK", amount: 900 }, { currency: "EUR", amount: 40 }],
      untickedSelling: [{ currency: "EUR", amount: 40 }],
      invoicedOn: "2026-11-05",
      sellingLines: 3,
      costLines: 2,
      // Sold (ticked): 100 EUR + 900 CZK = 3400; cost: 120 + 100 EUR = 5500.
      totals: { sellingCzk: 3400, realCzk: 5500, costCzk: 5500, profitCzk: -2100, missingCurrencies: [] },
      notRecharged: [{ code: "container_detention", currency: "EUR", amount: 120 }],
      // Booked on 10 Nov, after the invoice of 5 Nov.
      supplierInvoices: { toApprove: 1, lastRefusedOn: null, afterBilling: [{ number: "FV-1", bookedOn: "2026-11-10", currency: "EUR", amount: 100, aboveEstimate: false }] },
    });
    // The credited invoice bills nothing any more: its line is work not yet invoiced, and the job is not invoiced.
    expect(jobs[1]).toMatchObject({ notYetInvoiced: [{ currency: "EUR", amount: 100 }], invoicedOn: null });
  });
});

// A charge added after invoicing (mock test council X1 / K14): the line's write and the follow-up that moves the
// shipment's statuses commit together, under the job's newest open invoice.
describe("a selling line written after invoicing", () => {
  const ACTOR = { userId: randomUUID(), role: "user" };
  const outboxOf = (companyId: string) => db.select().from(outbox).where(eq(outbox.companyId, companyId)).orderBy(outbox.createdAt);

  it("is kept under the job's newest open invoice - not a credited, cancelled one or a credit note, not another job's", async () => {
    const a = randomUUID();
    const [job, none] = [randomUUID(), randomUUID()];
    await customerInvoice(a, job, { createdAt: new Date("2026-11-05T09:00:00Z") });
    const newest = await customerInvoice(a, job, { createdAt: new Date("2026-11-09T09:00:00Z") });
    const credited = await customerInvoice(a, job, { status: "credited", createdAt: new Date("2026-11-12T09:00:00Z") });
    await customerInvoice(a, job, { status: "cancelled", createdAt: new Date("2026-11-13T09:00:00Z") });
    await customerInvoice(a, job, { kind: "credit_note", correctsInvoiceId: credited.id, createdAt: new Date("2026-11-14T09:00:00Z"), net: "-100.00", gross: "-100.00", netCzk: "-2500.00", grossCzk: "-2500.00" });
    await customerInvoice(a, none, { status: "credited" });
    expect(await invoiceRepository.latestOpenInvoiceId(job, a)).toBe(newest.id);
    expect(await invoiceRepository.latestOpenInvoiceId(none, a)).toBeNull();
    expect(await invoiceRepository.latestOpenInvoiceId(job, randomUUID())).toBeNull();
  });

  it("writes the line and its follow-up in one transaction: a follow-up that fails leaves no line, one that is written names the invoice", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const invoice = await customerInvoice(a, job);
    const values = { shipmentId: job, category: "container_storage", amount: "150.00", qty: "2", currency: "EUR" };

    await expect(
      sellingCostRepository.createLine(a, values, async () => {
        throw new Error("the outbox is not there");
      }),
    ).rejects.toThrow("the outbox is not there");
    expect(await db.select().from(s).where(eq(s.companyId, a))).toEqual([]);

    const seen: unknown[] = [];
    const row = await sellingCostRepository.createLine(a, values, async (tx, before, after) => {
      seen.push([before, after?.id]);
      const invoiceId = (await invoiceRepository.latestOpenInvoiceId(job, a, tx))!;
      await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfSellingChange({ companyId: a, shipmentId: job, invoiceId, change: "added", charge: "Container Storage 300.00 EUR" }, ACTOR));
    });
    expect(seen).toEqual([[null, row.id]]);
    expect((await outboxOf(a)).map((r) => [r.kind, r.invoiceId, r.shipmentId, r.payload, r.status])).toEqual([
      ["status_after_credit", invoice.id, job, { shipmentId: job, charge: "Container Storage 300.00 EUR" }, "pending"],
    ]);
  });

  it("hands its hook the line as it was and as it is - none once deleted - and none for a line on an issued invoice, which is refused", async () => {
    const a = randomUUID();
    const job = randomUUID();
    const late = await sellLine(a, job, { amount: "0.00" });
    const billed = await sellLine(a, job);
    const invoice = await customerInvoice(a, job);
    await invoiceLine(a, invoice.id, billed.id);
    const seen: [string | null, string | null][] = [];
    const after = async (_tx: unknown, before: { amount: string | null } | null, now: { amount: string | null } | null) => {
      seen.push([before?.amount ?? null, now?.amount ?? null]);
    };

    await sellingCostRepository.writeUnlessInvoiced(late.id, a, job, { data: { amount: "320.00" } }, { after });
    await sellingCostRepository.writeUnlessInvoiced(late.id, a, job, { delete: true }, { after });
    expect(await sellingCostRepository.writeUnlessInvoiced(billed.id, a, job, { data: { amount: "1.00" } }, { after })).toBe("invoiced");
    expect(seen).toEqual([
      ["0.00", "320.00"],
      ["320.00", null],
    ]);
  });
});

describe("the jobs owing their customer a credit (creditOwedShipmentIds, M3)", () => {
  it("is every job with an open invoice and a line below nothing on no document billing now - however long ago invoiced", async () => {
    const a = randomUUID();
    const [owes, settled, notInvoiced, credited] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    // Invoiced long ago, a price lowered since: owed.
    const billed = await sellLine(a, owes);
    await invoiceLine(a, (await customerInvoice(a, owes, { issueDate: "2025-01-10", duzp: "2025-01-10", dueDate: "2025-01-24" })).id, billed.id);
    await sellLine(a, owes, { amount: "-50.00", sourceTruckingRef: `trucking:consignment:${randomUUID()}:diff:1` });
    // The credit given on a partial credit note of the open invoice: settled, nothing owed.
    const settledRow = await sellLine(a, settled);
    const open = await customerInvoice(a, settled);
    await invoiceLine(a, open.id, settledRow.id);
    const diff = await sellLine(a, settled, { amount: "-20.00" });
    await invoiceLine(a, (await customerInvoice(a, settled, { kind: "credit_note", correctsInvoiceId: open.id, gross: "-20.00" })).id, diff.id);
    // A discount on a job not invoiced yet: billed with the rest, owed to nobody.
    await sellLine(a, notInvoiced, { amount: "-30.00" });
    // Its only invoice credited in full: nothing stands invoiced, so nothing is owed back yet.
    const creditedRow = await sellLine(a, credited);
    await invoiceLine(a, (await customerInvoice(a, credited, { status: "credited" })).id, creditedRow.id);
    await sellLine(a, credited, { amount: "-10.00" });
    // A deleted line, and another company's job owing a credit: never.
    await sellLine(a, settled, { amount: "-5.00", deletedAt: new Date() });
    const b = randomUUID();
    const theirs = randomUUID();
    const theirRow = await sellLine(b, theirs);
    await invoiceLine(b, (await customerInvoice(b, theirs)).id, theirRow.id);
    await sellLine(b, theirs, { amount: "-40.00" });

    const before = await snapshot(a);
    expect(await invoiceRepository.creditOwedShipmentIds(a, 100)).toEqual([owes]);
    expect(await invoiceRepository.creditOwedShipmentIds(b, 100)).toEqual([theirs]);
    // Read only.
    expect(await snapshot(a)).toBe(before);
  });
});

describe("the jobs with a charge added after their invoice (lateChargeShipmentIds, User Council B4 / Q9)", () => {
  it("is every job with an open invoice and a line above nothing on no document billing now - CZFCL00000055 among them", async () => {
    const a = randomUUID();
    const [job55, allBilled, notInvoiced, credited, owesOnly] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    // CZFCL00000055: its freight invoiced (3,589.66 EUR) while "Booking Confirmation Pending", demurrage EUR 150 added after.
    const freight = await sellLine(a, job55, { amount: "3589.66" });
    await invoiceLine(a, (await customerInvoice(a, job55, { gross: "3589.66" })).id, freight.id);
    await sellLine(a, job55, { category: "demurrage", amount: "150.00" });
    // Every charge on its invoice: nothing to bill.
    const billed = await sellLine(a, allBilled);
    await invoiceLine(a, (await customerInvoice(a, allBilled)).id, billed.id);
    // No invoice yet: it waits for Billing as any job does.
    await sellLine(a, notInvoiced);
    // Its only invoice credited in full: To bill lists it once operations release it again (Billing).
    const creditedRow = await sellLine(a, credited);
    await invoiceLine(a, (await customerInvoice(a, credited, { status: "credited" })).id, creditedRow.id);
    await sellLine(a, credited, { category: "demurrage", amount: "150.00" });
    // A price lowered after the invoice is a credit owed, no charge to bill; a line of no value, or deleted, neither.
    const owedRow = await sellLine(a, owesOnly);
    await invoiceLine(a, (await customerInvoice(a, owesOnly)).id, owedRow.id);
    await sellLine(a, owesOnly, { amount: "-50.00" });
    await sellLine(a, owesOnly, { amount: "0.00" });
    await sellLine(a, owesOnly, { amount: "80.00", deletedAt: new Date() });
    // Another company's job with a late charge: never.
    const b = randomUUID();
    const theirs = randomUUID();
    const theirRow = await sellLine(b, theirs);
    await invoiceLine(b, (await customerInvoice(b, theirs)).id, theirRow.id);
    await sellLine(b, theirs, { amount: "40.00" });

    const before = await snapshot(a);
    expect(await invoiceRepository.lateChargeShipmentIds(a, 100)).toEqual([job55]);
    expect(await invoiceRepository.lateChargeShipmentIds(b, 100)).toEqual([theirs]);
    // Read only.
    expect(await snapshot(a)).toBe(before);
  });
});

describe("the selling rows an Invoicing queue view reads (listLiveByShipments)", () => {
  it("carry the partial credit note a row came from, so 'Lines invoiced' leaves it out (user council B19)", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const charge = await sellLine(companyId, shipmentId);
    const creditNoteId = randomUUID();
    const creditRow = await sellLine(companyId, shipmentId, { amount: "-20.00", sourceCreditNoteId: creditNoteId });
    const rows = await sellingCostRepository.listLiveByShipments([shipmentId], companyId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(charge.id)?.sourceCreditNoteId ?? null).toBeNull();
    expect(byId.get(creditRow.id)?.sourceCreditNoteId).toBe(creditNoteId);
  });
});
