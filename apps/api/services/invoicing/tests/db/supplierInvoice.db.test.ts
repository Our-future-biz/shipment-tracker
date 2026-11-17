import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

// Accounts Payable's repository against the invoicing database: how lines are matched to supplier invoices, the
// payment on the lines, a refusal taking them off and a supplier linked - the SQL the service tests stand in for.
// Each test works in a company of its own. Runs only under `encore test`
// (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { supplierInvoiceRepository as repo } from "../../repositories/supplierInvoice.repository";
import { invoiceCostTable as c } from "../../schemas/invoiceCost.schema";
import { masterJobCostTable as m } from "../../schemas/masterJobCost.schema";
import { supplierInvoiceEventTable as ev, supplierInvoiceTable as t } from "../../schemas/supplierInvoice.schema";

const ORIGIN = { source: "typed" as const, userId: null, userEmail: "" };
const RECEIVED = new Date("2026-11-03T09:00:00Z");
const EVENT = { action: "details_changed" as const };

const costLine = async (companyId: string, over: Partial<typeof c.$inferInsert> = {}) =>
  (
    await db
      .insert(c)
      .values({ companyId, shipmentId: randomUUID(), category: "ocean_freight", realAmount: "100.00", realCurrency: "EUR", vendor: "MSC", received: true, receivedAt: RECEIVED, ...over })
      .returning()
  )[0]!;
const masterLine = async (companyId: string, over: Partial<typeof m.$inferInsert> = {}) =>
  (await db.insert(m).values({ companyId, masterJobId: randomUUID(), category: "ocean_freight", realAmount: "100.00", realCurrency: "EUR", vendor: "MSC", ...over }).returning())[0]!;
const invoicesOf = (companyId: string) => db.select().from(t).where(and(eq(t.companyId, companyId), isNull(t.deletedAt)));
const invoice = async (id: string) => (await db.select().from(t).where(eq(t.id, id)))[0]!;
const line = async (id: string) => (await db.select().from(c).where(eq(c.id, id)))[0]!;
const master = async (id: string) => (await db.select().from(m).where(eq(m.id, id)))[0]!;
const eventsOf = async (id: string) => (await db.select().from(ev).where(eq(ev.invoiceId, id))).map((e) => e.action);
/** An invoice of the company decided as given (approved, paid), as a manager would. */
const decided = (id: string, values: Partial<typeof t.$inferInsert>) => db.update(t).set(values).where(eq(t.id, id));

describe("matching lines to supplier invoices (sync)", () => {
  it("books one invoice for a supplier's number on two jobs, and keeps another company's lines apart", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const one = await costLine(a, { invoiceNumber: "FV 1", vendor: "MSC" });
    const two = await costLine(a, { invoiceNumber: "fv1", vendor: " msc " });
    const theirs = await costLine(b, { invoiceNumber: "FV1", vendor: "MSC" });

    const { gained } = await repo.sync(a, { all: true }, ORIGIN);

    const [booked, ...more] = await invoicesOf(a);
    expect(more).toEqual([]);
    expect(booked).toMatchObject({ status: "booked", numberKey: "FV1", source: "typed", receivedAt: RECEIVED });
    expect(gained).toEqual([booked!.id]);
    expect((await line(one.id)).supplierInvoiceId).toBe(booked!.id);
    expect((await line(two.id)).supplierInvoiceId).toBe(booked!.id);
    expect(await eventsOf(booked!.id)).toEqual(["booked"]);
    // The other company's line is not looked at, and has no invoice.
    expect(await invoicesOf(b)).toEqual([]);
    expect((await line(theirs.id)).supplierInvoiceId).toBeNull();
  });

  it("takes an invoice gathered from lines all paid before Accounts Payable existed as approved and paid on their last day", async () => {
    const a = randomUUID();
    await costLine(a, { invoiceNumber: "OLD-1", paidOn: "2026-10-01", paidAt: new Date("2026-10-01T10:00:00Z"), paidBy: "boss@test.cz" });
    await costLine(a, { invoiceNumber: "OLD-1", paidOn: "2026-10-05", paidAt: new Date("2026-10-05T10:00:00Z"), paidBy: "boss@test.cz" });
    // One unpaid line: the invoice still waits.
    await costLine(a, { invoiceNumber: "OLD-2", paidOn: "2026-10-01", paidAt: new Date("2026-10-01T10:00:00Z") });
    await costLine(a, { invoiceNumber: "OLD-2" });

    await repo.sync(a, { all: true }, { source: "backfill" });

    const byNumber = new Map((await invoicesOf(a)).map((h) => [h.numberKey, h]));
    expect(byNumber.get("OLD-1")).toMatchObject({ status: "approved", paidOn: "2026-10-05", decisionReason: "Paid before Accounts Payable existed", paidByUserId: null });
    expect(await eventsOf(byNumber.get("OLD-1")!.id)).toEqual(expect.arrayContaining(["booked", "paid"]));
    expect(byNumber.get("OLD-2")).toMatchObject({ status: "booked", paidOn: null });
  });

  it("lets go of an invoice whose only line lost its number, but keeps one a manager decided", async () => {
    const a = randomUUID();
    const typo = await costLine(a, { invoiceNumber: "TYPO" });
    const kept = await costLine(a, { invoiceNumber: "KEPT" });
    await repo.sync(a, { all: true }, ORIGIN);
    const byNumber = new Map((await invoicesOf(a)).map((h) => [h.numberKey, h]));
    await decided(byNumber.get("KEPT")!.id, { status: "approved" });

    await db.update(c).set({ invoiceNumber: "" }).where(eq(c.id, typo.id));
    await db.update(c).set({ invoiceNumber: "" }).where(eq(c.id, kept.id));
    await repo.sync(a, { shipmentIds: [typo.shipmentId, kept.shipmentId] }, ORIGIN);

    expect((await line(typo.id)).supplierInvoiceId).toBeNull();
    expect((await invoicesOf(a)).map((h) => h.numberKey)).toEqual(["KEPT"]);
  });

  it("joins a new master-job line to the invoice its sibling is on once that invoice is linked to a supplier", async () => {
    const a = randomUUID();
    const masterJobId = randomUUID();
    const supplier = randomUUID();
    const freight = await masterLine(a, { masterJobId, invoiceNumber: "FV 9", vendor: "MSC" });
    await repo.sync(a, { masterJobIds: [masterJobId] }, { source: "master_job" });
    const booked = (await invoicesOf(a))[0]!;
    expect(booked).toMatchObject({ supplierKey: "n:msc", source: "master_job" });
    const linked = await repo.linkSupplier(a, booked, { id: supplier, name: "MSC Czech" }, EVENT);
    expect(linked).toMatchObject({ id: booked.id, supplierKey: `c:${supplier}` });

    const thc = await masterLine(a, { masterJobId, category: "thc", invoiceNumber: "fv9", vendor: "msc" });
    // The same supplier text and number on another master job is another bill.
    const elsewhere = await masterLine(a, { invoiceNumber: "FV9", vendor: "MSC" });
    expect(await repo.idOfMasterSibling(a, masterJobId, "msc", "FV9")).toBe(booked.id);
    expect(await repo.idOfMasterSibling(a, elsewhere.masterJobId, "MSC", "FV9")).toBeNull();
    await repo.sync(a, { masterJobIds: [masterJobId, elsewhere.masterJobId] }, { source: "master_job" });

    expect((await master(freight.id)).supplierInvoiceId).toBe(booked.id);
    expect((await master(thc.id)).supplierInvoiceId).toBe(booked.id);
    const other = (await master(elsewhere.id)).supplierInvoiceId;
    expect(other).not.toBe(booked.id);
    expect((await invoice(other!)).supplierKey).toBe("n:msc");
    expect(await invoicesOf(a)).toHaveLength(2);
  });
});

describe("linking a supplier (linkSupplier)", () => {
  it("merges into the supplier's own invoice of that number: the lines move, this one goes, an approved one waits again", async () => {
    const a = randomUUID();
    const supplier = randomUUID();
    const byText = await costLine(a, { invoiceNumber: "M-1", vendor: "MSC" });
    const ofSupplier = await costLine(a, { invoiceNumber: "M-1", vendor: "MSC", supplierCustomerId: supplier });
    await repo.sync(a, { all: true }, ORIGIN);
    const from = (await line(byText.id)).supplierInvoiceId!;
    const into = (await line(ofSupplier.id)).supplierInvoiceId!;
    expect(from).not.toBe(into);
    await decided(into, { status: "approved", decidedBy: "boss@test.cz" });

    const merged = await repo.linkSupplier(a, await invoice(from), { id: supplier, name: "MSC Czech" }, EVENT);

    expect(merged).toMatchObject({ id: into, status: "booked", decidedBy: "" });
    expect(await line(byText.id)).toMatchObject({ supplierInvoiceId: into, supplierCustomerId: supplier });
    expect((await invoice(from)).deletedAt).not.toBeNull();
    expect(await repo.liveIds(a, [from, into])).toEqual(new Set([into]));
  });

  it("writes nothing when the supplier's invoice of that number is paid already", async () => {
    const a = randomUUID();
    const supplier = randomUUID();
    const byText = await costLine(a, { invoiceNumber: "P-1", vendor: "MSC" });
    const ofSupplier = await costLine(a, { invoiceNumber: "P-1", supplierCustomerId: supplier });
    await repo.sync(a, { all: true }, ORIGIN);
    const from = (await line(byText.id)).supplierInvoiceId!;
    await decided((await line(ofSupplier.id)).supplierInvoiceId!, { status: "approved", paidOn: "2026-11-10" });

    expect(await repo.linkSupplier(a, await invoice(from), { id: supplier, name: "MSC Czech" }, EVENT)).toBe("paid");
    expect(await line(byText.id)).toMatchObject({ supplierInvoiceId: from, supplierCustomerId: null });
    expect((await invoice(from)).deletedAt).toBeNull();
  });
});

describe("the payment on the lines (setLinesPaid)", () => {
  it("stamps the lines not paid yet, and taking it back unstamps those only; one taken from the lines, all of them", async () => {
    const a = randomUUID();
    const before = await costLine(a, { invoiceNumber: "PAY-1", paidOn: "2026-10-01", paidAt: new Date("2026-10-01T10:00:00Z"), paidBy: "old@test.cz" });
    const open = await costLine(a, { invoiceNumber: "PAY-1", received: false, receivedAt: null });
    await repo.sync(a, { all: true }, ORIGIN);
    const id = (await line(open.id)).supplierInvoiceId!;
    const paidAt = new Date("2026-11-15T10:30:00.123Z");
    const userId = randomUUID();

    await db.transaction((tx) => repo.setLinesPaid(tx, a, id, { pay: { paidOn: "2026-11-15", paidAt, paidByUserId: userId, paidBy: "boss@test.cz" } }));
    expect(await line(open.id)).toMatchObject({ received: true, paidOn: "2026-11-15", paidAt, paidBy: "boss@test.cz" });
    expect((await line(open.id)).receivedAt).not.toBeNull();
    // Paid before Accounts Payable existed: its own day stays.
    expect(await line(before.id)).toMatchObject({ paidOn: "2026-10-01", paidBy: "old@test.cz" });

    await db.transaction((tx) => repo.setLinesPaid(tx, a, id, { takeBack: { paidOn: "2026-11-15", paidAt, fromLines: false } }));
    expect(await line(open.id)).toMatchObject({ paidOn: null, paidAt: null, paidBy: null });
    expect(await line(before.id)).toMatchObject({ paidOn: "2026-10-01" });

    await db.transaction((tx) => repo.setLinesPaid(tx, a, id, { takeBack: { paidOn: "2026-10-01", paidAt: null, fromLines: true } }));
    expect(await line(before.id)).toMatchObject({ paidOn: null, paidBy: null });
  });

  it("gives a master job's shares on the jobs the paid state of the line's invoice, and takes it back with it", async () => {
    const a = randomUUID();
    const ml = await masterLine(a, { invoiceNumber: "MJ-1" });
    await repo.sync(a, { masterJobIds: [ml.masterJobId] }, { source: "master_job" });
    const id = (await master(ml.id)).supplierInvoiceId!;
    const share = await costLine(a, { sourceMasterJobRef: `master:${ml.masterJobId}:${ml.id}`, received: false, receivedAt: null });

    await decided(id, { status: "approved", paidOn: "2026-11-12", paidAt: new Date("2026-11-12T09:00:00Z"), paidBy: "boss@test.cz" });
    await repo.sharesFollowPaid(null, a, { invoiceId: id });
    expect(await line(share.id)).toMatchObject({ received: true, paidOn: "2026-11-12", paidBy: "boss@test.cz" });
    expect(await repo.paidDays(a, [id])).toEqual(new Map([[id, "2026-11-12"]]));

    await decided(id, { paidOn: null, paidAt: null, paidBy: "" });
    await repo.sharesFollowPaid(null, a, { masterJobId: ml.masterJobId });
    expect(await line(share.id)).toMatchObject({ paidOn: null });
    expect(await repo.paidDays(a, [id])).toEqual(new Map());
  });
});

describe("a refusal taking the lines off (takeLinesOff)", () => {
  it("puts an estimated line back to its estimate, deletes any other, clears a master job's line, and answers them as they were", async () => {
    const a = randomUUID();
    const estimated = await costLine(a, { invoiceNumber: "R-1", estAmount: "90.00", estCurrency: "EUR" });
    const typed = await costLine(a, { invoiceNumber: "R-1", category: "thc", realAmount: "20.00" });
    await repo.sync(a, { all: true }, ORIGIN);
    const id = (await line(estimated.id)).supplierInvoiceId!;
    const ml = await masterLine(a, { invoiceNumber: "R-1", supplierInvoiceId: id });

    const kept = await db.transaction((tx) => repo.takeLinesOff(tx, a, id));

    expect(kept).toHaveLength(3);
    expect(kept).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "invoice_cost", lineId: estimated.id, ownerId: estimated.shipmentId, realAmount: "100.00" }),
        expect.objectContaining({ table: "invoice_cost", lineId: typed.id, category: "thc", realAmount: "20.00" }),
        expect.objectContaining({ table: "master_job_cost", lineId: ml.id, ownerId: ml.masterJobId, realAmount: "100.00" }),
      ]),
    );
    expect(await line(estimated.id)).toMatchObject({ deletedAt: null, estAmount: "90.00", realAmount: null, invoiceNumber: "", received: false, supplierInvoiceId: null });
    expect((await line(typed.id)).deletedAt).not.toBeNull();
    expect(await master(ml.id)).toMatchObject({ realAmount: null, invoiceNumber: "", supplierInvoiceId: null });
  });
});
