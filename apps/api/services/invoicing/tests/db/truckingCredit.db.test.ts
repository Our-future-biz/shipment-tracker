import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

// Mock test council Y1 / P1, Z1, n8, n9 against the invoicing database: what a Trucking push writes
// after an invoice (one difference line per currency, replacing any not on an invoice yet), which
// quote road estimates it retires (each side by itself; the one a consignment is priced on only with
// that consignment, its invoice credited), a consignment priced on an invoiced quote road line, the
// credits owed a partial credit note settles (Trucking's, a discount entered by hand), a set that comes
// to nothing after a full credit, and a house's split rows handed to its statuses' hook when it leaves
// its master job. Each test works in a company and shipment of its own. Runs only under `encore test`
// (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { truckingLinesLock, truckingLinesRepository } from "../../repositories/truckingLines.repository";
import { masterJobCostRepository } from "../../repositories/masterJobCost.repository";
import { invoiceRepository, lockInvoiceRow } from "../../repositories/invoice.repository";
import { sellingCostRepository } from "../../repositories/sellingCost.repository";
import { creditNoteRequestRepository } from "../../repositories/creditNoteRequest.repository";
import { stillAskedOn } from "../../services/invoiceDocument.service";
import type { CreditNoteRequestRecord } from "../../schemas/creditNoteRequest.schema";
import { buildBillingQueue, countCreditsOwed } from "../../lib/billingQueue";
import { remainingLines, settleTruckingCredit, type CreditLineCalc } from "../../lib/partialCredit";
import type { SellingLineWrite } from "../../repositories/sellingCost.repository";
import { invoiceLineTable, invoiceTable } from "../../schemas/invoice.schema";
import { invoiceCostTable } from "../../schemas/invoiceCost.schema";
import { invoiceSellingCostTable as s, type InvoiceSellingCostRecord } from "../../schemas/invoiceSellingCost.schema";

/** An issued invoice of the shipment billing these selling rows (status "credited" for one credited in full). */
const invoiceOf = async (companyId: string, shipmentId: string, rows: InvoiceSellingCostRecord[], status: "issued" | "credited" = "issued") => {
  const customerId = randomUUID();
  const [invoice] = await db
    .insert(invoiceTable)
    .values({
      companyId,
      shipmentId,
      kind: "invoice",
      status,
      number: `INV-${randomUUID()}`,
      customerId,
      issueDate: "2026-11-02",
      duzp: "2026-11-01",
      dueDate: "2026-11-16",
      currency: "CZK",
      fxRate: "1.000000",
      net: "1000.00",
      vat: "0.00",
      gross: "1000.00",
      netCzk: "1000.00",
      vatCzk: "0.00",
      grossCzk: "1000.00",
      vatSummary: [],
      supplier: {} as never,
      customer: { customerId, companyName: "Gama Elektro a.s.", address: "", city: "", country: "CZ", ico: "", dic: "", paymentTerms: "14 days" },
      shipment: { jobNumber: "CZ00000031", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
      issuedBy: randomUUID(),
    })
    .returning();
  await db.insert(invoiceLineTable).values(
    rows.map((r, i) => ({
      companyId,
      invoiceId: invoice!.id,
      seq: i + 1,
      description: r.description,
      qty: r.qty ?? "1.00",
      unitPrice: r.amount ?? "0.00",
      unitCurrency: r.currency,
      net: r.amount ?? "0.00",
      vatCode: "OUT" as const,
      vatRate: "0.00",
      sourceSellingCostId: r.id,
    })),
  );
  return invoice!;
};

const sellingRow = async (companyId: string, shipmentId: string, over: Partial<typeof s.$inferInsert> = {}) =>
  (await db.insert(s).values({ companyId, shipmentId, category: "road_freight", description: "Freight", qty: "1.00", amount: "1000.00", currency: "CZK", ...over }).returning())[0]!;

const liveSelling = async (shipmentId: string) =>
  (await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), isNull(s.deletedAt)))).map((r) => [r.sourceTruckingRef, r.amount]).sort();

const push = (amount: string) => [{ category: "road_freight", description: "Freight", customer: "Freight", qty: "1.00", amount, currency: "CZK", invoice: true }];
const job = () => ({ companyId: randomUUID(), shipmentId: randomUUID(), ref: `trucking:consignment:${randomUUID()}` });

/**
 * A partial credit note of `amount` of the invoice line made from `row`, as issuePartialCredit writes it: the
 * credits owed it settles read (openCreditDiffs), its lines (settleTruckingCredit), the document, the negative
 * rows of its own, and what it did to the lines it settles (settleDiffs).
 */
const creditNoteOf = async (companyId: string, shipmentId: string, invoiceId: string, row: InvoiceSellingCostRecord, amount: number) => {
  const [line] = await db.select().from(invoiceLineTable).where(and(eq(invoiceLineTable.invoiceId, invoiceId), eq(invoiceLineTable.sourceSellingCostId, row.id)));
  const asked: CreditLineCalc = {
    sourceSellingCostId: row.id, description: row.description, qty: -1, unitPrice: amount, unitCurrency: row.currency, net: -amount, vatCode: "OUT", vatRate: 0, fxRate: 1, correctsLineId: line!.id,
  };
  const owed = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [row.id]);
  const settled = settleTruckingCredit([asked], (rowId) => (rowId ? (owed.get(rowId) ?? []) : []), randomUUID);
  const net = settled.lines.reduce((sum, l) => sum + l.net, 0).toFixed(2);
  const customerId = randomUUID();
  await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(invoiceTable)
      .values({
        companyId, shipmentId, kind: "credit_note", status: "issued", number: `CN-${randomUUID()}`, correctsInvoiceId: invoiceId, creditReason: "Agreed discount", customerId,
        issueDate: "2026-11-12", duzp: "2026-11-01", dueDate: "2026-11-16", currency: "CZK", fxRate: "1.000000",
        net, vat: "0.00", gross: net, netCzk: net, vatCzk: "0.00", grossCzk: net, vatSummary: [], supplier: {} as never,
        customer: { customerId, companyName: "Gama Elektro a.s.", address: "", city: "", country: "CZ", ico: "", dic: "", paymentTerms: "14 days" },
        shipment: { jobNumber: "CZ00000031", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
        issuedBy: randomUUID(),
      })
      .returning();
    await tx.insert(invoiceLineTable).values(
      settled.lines.map((l, i) => ({
        companyId, invoiceId: note!.id, seq: i + 1, description: l.description, qty: "-1.00", unitPrice: l.unitPrice.toFixed(2), unitCurrency: l.unitCurrency,
        net: l.net.toFixed(2), fxRate: "1", vatCode: "OUT" as const, vatRate: "0.00", sourceSellingCostId: l.sourceSellingCostId, correctsLineId: l.correctsLineId,
      })),
    );
    await sellingCostRepository.insertCreditRows(tx, companyId, shipmentId, note!, settled.ownRows.map((l) => ({ id: l.sourceSellingCostId, sourceRowId: row.id, lineText: l.description, amount: l.unitPrice, currency: l.unitCurrency, vatCode: l.vatCode })));
    await truckingLinesRepository.settleDiffs(tx, companyId, shipmentId, settled.shrink, settled.rest);
  });
  return settled;
};

/** The credits owed as the Money tab (creditOwedShipmentIds) and the billing queue (countCreditsOwed) count them. */
const creditsOwed = async (companyId: string, shipmentId: string) => {
  const [rows, open] = await Promise.all([sellingCostRepository.listLiveByShipments([shipmentId], companyId), invoiceRepository.listOpenInvoicesWithSources([shipmentId], companyId)]);
  return { jobs: await invoiceRepository.creditOwedShipmentIds(companyId, 10), lines: countCreditsOwed(rows, open).get(shipmentId) ?? 0 };
};

describe("a Trucking price changed after the invoice (Y1 / P1)", () => {
  it("bills one difference line per currency, replacing any not on an invoice yet: lowered, put back, raised, pushed again", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    const after = vi.fn(async (_tx: unknown, _writes: SellingLineWrite[]) => undefined);

    // Lowered: a credit owed of 50.
    const down = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"), "Price change after invoice", after);
    expect(down.differences).toEqual([{ sourceRef: `${ref}:diff:1`, currency: "CZK", amount: -50 }]);
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:1`, "-50.00"]]);

    // Put back: the open −50 goes, nothing comes - never a +50 beside it that comes to nothing.
    const back = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"), "Price change after invoice", after);
    expect(back.differences).toEqual([]);
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"]]);
    expect(after.mock.calls.at(-1)![1].map((w) => [w.before?.amount ?? null, w.now?.amount ?? null])).toEqual([["-50.00", null]]);

    // Raised: one +100 line, numbered after any the set ever had.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"), "Price change after invoice", after);
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:2`, "100.00"]]);

    // The same push again writes nothing.
    after.mockClear();
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"), "Price change after invoice", after);
    expect(after).not.toHaveBeenCalled();
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:2`, "100.00"]]);
  });

  it("a difference line on an invoice (or settled by a credit note) stays; only what changed since is billed", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"));
    const [diff] = await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, `${ref}:diff:1`)));
    await invoiceOf(companyId, shipmentId, [diff!]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1050.00"));
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:1`, "100.00"], [`${ref}:diff:2`, "-50.00"]]);
  });
});

describe("quote road estimates and Trucking's lines", () => {
  const quoteRows = async (companyId: string, shipmentId: string) => {
    const selling = await sellingRow(companyId, shipmentId, { sourceQuoteNumber: "Q-1", description: "Delivery", category: "delivery" });
    const [buying] = await db
      .insert(invoiceCostTable)
      .values({ companyId, shipmentId, category: "delivery", estAmount: "800.00", estCurrency: "CZK", sourceQuoteNumber: "Q-1" })
      .returning();
    return { selling, buying: buying! };
  };
  const live = async (table: typeof s | typeof invoiceCostTable, id: string) => !(await db.select().from(table).where(eq(table.id, id)))[0]!.deletedAt;
  const roadBuying = [{ category: "road_freight", description: "Internal trucking", estQty: "1.00", estAmount: "700.00", estCurrency: "CZK", realQty: "1.00", realCurrency: "CZK", unit: "", vendor: "", haulierId: null }];

  it("an internal job's push of its buying line alone keeps the customer's road charge, and retires only the buying estimate (Z1)", async () => {
    const { companyId, shipmentId } = job();
    const { selling, buying } = await quoteRows(companyId, shipmentId);
    await truckingLinesRepository.replace(companyId, shipmentId, `trucking:internal:${randomUUID()}`, roadBuying, []);
    expect(await live(s, selling.id)).toBe(true);
    expect(await live(invoiceCostTable, buying.id)).toBe(false);
  });

  it("a push of road selling lines alone retires the quote's road selling line, not its buying estimate", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling, buying } = await quoteRows(companyId, shipmentId);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1200.00"));
    expect(await live(s, selling.id)).toBe(false);
    expect(await live(invoiceCostTable, buying.id)).toBe(true);
  });

  it("a consignment priced on the quote's invoiced road line bills only its difference from it (n8)", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling } = await quoteRows(companyId, shipmentId);
    await invoiceOf(companyId, shipmentId, [selling]);
    const first = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"));
    expect(first.differences).toEqual([{ sourceRef: `${ref}:diff:1`, currency: "CZK", amount: 100 }]);
    // The set keeps a marker of the quote line it is priced on (B1), valued at nothing.
    const marker = `${ref}:quote:${selling.id}`;
    expect(await liveSelling(shipmentId)).toEqual([[`${ref}:diff:1`, "100.00"], [marker, "0.00"], [null, "1000.00"]].sort());
    // Re-priced at the quote's price: the open difference goes - the leg is billed once, by the quote line.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    expect(await liveSelling(shipmentId)).toEqual([[marker, "0.00"], [null, "1000.00"]].sort());
    // A second consignment of the job is not priced on the same quote line: it is billed in full.
    const other = `trucking:consignment:${randomUUID()}`;
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"));
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("400.00"));
    expect(await liveSelling(shipmentId)).toEqual([[other, "400.00"], [`${ref}:diff:2`, "100.00"], [marker, "0.00"], [null, "1000.00"]].sort());
  });

  it("a consignment priced exactly at the quote line stays priced on it after another consignment has rows; the other is billed in full (B1)", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling } = await quoteRows(companyId, shipmentId);
    await invoiceOf(companyId, shipmentId, [selling]);
    const marker = `${ref}:quote:${selling.id}`;
    // Priced exactly at the invoiced quote line: nothing to bill - only the marker says so.
    const exact = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    expect(exact.differences).toEqual([]);
    expect(await liveSelling(shipmentId)).toEqual([[marker, "0.00"], [null, "1000.00"]].sort());
    // Another consignment comes: it is not priced on the line the first one is - billed in full, and no marker of its own.
    const other = `trucking:consignment:${randomUUID()}`;
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("400.00"));
    // The first one re-priced: only what it differs by from the quote line, never its own full amount beside it.
    const lower = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    expect(lower.differences).toEqual([{ sourceRef: `${ref}:diff:1`, currency: "CZK", amount: -50 }]);
    expect(await liveSelling(shipmentId)).toEqual([[other, "400.00"], [`${ref}:diff:1`, "-50.00"], [marker, "0.00"], [null, "1000.00"]].sort());
    // The other one re-priced stays billed on its own rows (replaced, not on an invoice).
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("450.00"));
    expect(await liveSelling(shipmentId)).toEqual([[other, "450.00"], [`${ref}:diff:1`, "-50.00"], [marker, "0.00"], [null, "1000.00"]].sort());
  });

  it("the other order: a consignment pushed after the one priced at the quote line - then the first cancelled - owes back the quote line (B1)", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling } = await quoteRows(companyId, shipmentId);
    await invoiceOf(companyId, shipmentId, [selling]);
    const marker = `${ref}:quote:${selling.id}`;
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    const other = `trucking:consignment:${randomUUID()}`;
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("400.00"));
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("400.00"));
    expect(await liveSelling(shipmentId)).toEqual([[other, "400.00"], [marker, "0.00"], [null, "1000.00"]].sort());
    // The first consignment cancelled: the leg the customer paid on the quote line is a credit owed.
    const cancelled = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], []);
    expect(cancelled.differences).toEqual([{ sourceRef: `${ref}:diff:1`, currency: "CZK", amount: -1000 }]);
    // Never a marker of the other one: only one consignment is priced on the line.
    const markers = (await liveSelling(shipmentId)).filter(([r]) => String(r).includes(":quote:"));
    expect(markers).toEqual([[marker, "0.00"]]);
  });

  it("the quote line's invoice credited: another consignment's road push leaves the line the first one is priced on, so the leg is billed again; the first one's own push takes it over", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling } = await quoteRows(companyId, shipmentId);
    const invoice = await invoiceOf(companyId, shipmentId, [selling]);
    const marker = `${ref}:quote:${selling.id}`;
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    expect(await liveSelling(shipmentId)).toEqual([[marker, "0.00"], [null, "1000.00"]].sort());
    // Credited in full: the quote line is on no invoice any more - it bills the leg on the next one.
    await db.update(invoiceTable).set({ status: "credited" }).where(eq(invoiceTable.id, invoice.id));
    const other = `trucking:consignment:${randomUUID()}`;
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("400.00"));
    expect(await live(s, selling.id)).toBe(true);
    expect(await liveSelling(shipmentId)).toEqual([[other, "400.00"], [marker, "0.00"], [null, "1000.00"]].sort());
    // The first consignment re-priced: its own lines bill the leg now, in place of the quote line - never both.
    const after = vi.fn(async (_tx: unknown, _writes: SellingLineWrite[]) => undefined);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"), "Price change after invoice", after);
    expect(await live(s, selling.id)).toBe(false);
    expect(await liveSelling(shipmentId)).toEqual([[other, "400.00"], [ref, "1000.00"]].sort());
    // The quote line taken away and the consignment's own line come in its place: the job's status follows both.
    expect(after.mock.calls[0]![1].map((w) => [w.before?.description ?? null, w.now?.amount ?? null])).toEqual([["Delivery", null], [null, "1000.00"]]);
  });

  it("the quote line's invoice credited, then the consignment priced on it cancelled: the quote line goes with it, so the leg is not billed again", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling, buying } = await quoteRows(companyId, shipmentId);
    const invoice = await invoiceOf(companyId, shipmentId, [selling]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    await db.update(invoiceTable).set({ status: "credited" }).where(eq(invoiceTable.id, invoice.id));
    const after = vi.fn(async (_tx: unknown, _writes: SellingLineWrite[]) => undefined);
    // Cancelled: the push brings no lines at all - still, the leg the quote line billed is gone with the consignment.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], [], "Price change after invoice", after);
    expect(await live(s, selling.id)).toBe(false);
    expect(await liveSelling(shipmentId)).toEqual([]);
    // A charge the job no longer has: its status follows. The buying estimate is no business of a selling push.
    expect(after.mock.calls[0]![1].map((w) => [w.before?.description ?? null, w.before?.amount ?? null, w.now])).toEqual([["Delivery", "1000.00", null]]);
    expect(await live(invoiceCostTable, buying.id)).toBe(true);
  });

  it("the quote line's invoice credited, the consignment's difference line still on another invoice, then the consignment cancelled: the quote line goes, and what the difference billed is owed back", async () => {
    const { companyId, shipmentId, ref } = job();
    const { selling } = await quoteRows(companyId, shipmentId);
    const quoteInvoice = await invoiceOf(companyId, shipmentId, [selling]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1100.00"));
    const [diff] = await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, `${ref}:diff:1`)));
    await invoiceOf(companyId, shipmentId, [diff!]);
    await db.update(invoiceTable).set({ status: "credited" }).where(eq(invoiceTable.id, quoteInvoice.id));
    const cancelled = await truckingLinesRepository.replace(companyId, shipmentId, ref, [], []);
    expect(await live(s, selling.id)).toBe(false);
    expect(cancelled.differences).toEqual([
      { sourceRef: `${ref}:diff:1`, currency: "CZK", amount: 100 },
      { sourceRef: `${ref}:diff:2`, currency: "CZK", amount: -100 },
    ]);
  });

  it("a re-push of a set left off the invoice keeps the day it first came on the job (m6)", async () => {
    const { companyId, shipmentId, ref } = job();
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1000.00"));
    const firstDay = new Date("2026-10-01T08:00:00Z");
    await db.update(s).set({ createdAt: firstDay }).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, ref)));
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("1200.00"));
    const [row] = await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, ref), isNull(s.deletedAt)));
    expect(row!.amount).toBe("1200.00");
    expect(row!.createdAt.toISOString()).toBe(firstDay.toISOString());
  });
});

describe("a credit owed, given on a credit note", () => {
  it("finds the open difference line below nothing of the set a credited row belongs to, and settles it in part", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const diffs = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id]);
    const [owed] = diffs.get(billed.id)!;
    expect(owed).toMatchObject({ ref: `${ref}:diff:1`, currency: "CZK", amount: -50 });

    // Credited 30 of the 50: the line comes down to −30 (the credit note's), the rest stays owed as a line of its own.
    await db.transaction((tx) => truckingLinesRepository.settleDiffs(tx, companyId, shipmentId, [{ id: owed!.id, amount: 30 }], [{ fromId: owed!.id, amount: 20 }]));
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:1`, "-30.00"], [`${ref}:diff:2`, "-20.00"]]);
  });

  it("writes a rest under the id it was given, so a later line of the same credit note bills it (m8)", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const [owed] = (await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id])).get(billed.id)!;
    const restId = randomUUID();
    await db.transaction((tx) => truckingLinesRepository.settleDiffs(tx, companyId, shipmentId, [{ id: owed!.id, amount: 30 }], [{ fromId: owed!.id, amount: 20, id: restId }]));
    const [rest] = await db.select().from(s).where(eq(s.id, restId));
    expect([rest!.sourceTruckingRef, rest!.amount]).toEqual([`${ref}:diff:2`, "-20.00"]);
  });

  it("a credited quote road line a consignment is priced on settles that consignment's credit owed (M2)", async () => {
    const { companyId, shipmentId, ref } = job();
    const quote = await sellingRow(companyId, shipmentId, { sourceQuoteNumber: "Q-1", description: "Delivery", category: "delivery" });
    await invoiceOf(companyId, shipmentId, [quote]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const diffs = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [quote.id]);
    expect(diffs.get(quote.id)).toEqual([expect.objectContaining({ ref: `${ref}:diff:1`, currency: "CZK", amount: -50 })]);
    // A row of no set (a hand-entered line) gives the job's credit owed all the same: there is no other way to give it.
    const hand = await sellingRow(companyId, shipmentId, { description: "Handling" });
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [hand.id])).get(hand.id)).toEqual([
      expect.objectContaining({ ref: `${ref}:diff:1`, currency: "CZK", amount: -50 }),
    ]);
  });

  it("a credited row settles its own set's credit owed first, then the job's others in Costs Breakdown order; a job owed nothing has none", async () => {
    const { companyId, shipmentId, ref } = job();
    const other = `trucking:consignment:${randomUUID()}`;
    const mine = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    const theirs = await sellingRow(companyId, shipmentId, { sourceTruckingRef: other, amount: "400.00" });
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [mine.id])).size).toBe(0);
    await invoiceOf(companyId, shipmentId, [mine, theirs]);
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [mine.id])).size).toBe(0);
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("370.00"));
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", amount: "-20.00", sortOrder: 1000 });
    // A line above nothing, and the rows a master job's split keeps, are no credit owed it settles.
    await sellingRow(companyId, shipmentId, { description: "Handling", amount: "80.00", sortOrder: 1001 });
    await sellingRow(companyId, shipmentId, { description: "Demurrage share", amount: "-10.00", sourceMasterJobRef: `master:${randomUUID()}:${randomUUID()}`, sortOrder: 1002 });
    const owed = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [mine.id, theirs.id]);
    expect(owed.get(mine.id)!.map((d) => [d.ref, d.amount])).toEqual([[`${ref}:diff:1`, -50], [`${other}:diff:1`, -30], [null, -20]]);
    expect(owed.get(theirs.id)!.map((d) => [d.ref, d.amount])).toEqual([[`${other}:diff:1`, -30], [`${ref}:diff:1`, -50], [null, -20]]);
    expect(owed.get(theirs.id)!.at(-1)!.id).toBe(discount.id);
  });

  it("a discount entered after the invoice is a credit owed like Trucking's: a partial credit note of any line gives it - it never comes off the next invoice as well", async () => {
    const { companyId, shipmentId } = job();
    const billed = await sellingRow(companyId, shipmentId, { description: "Ocean freight", category: "ocean_freight" });
    const invoice = await invoiceOf(companyId, shipmentId, [billed]);
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", category: "ocean_freight", amount: "-50.00" });
    expect(await creditsOwed(companyId, shipmentId)).toEqual({ jobs: [shipmentId], lines: 1 });

    // The manager approves a partial credit note of 50 of the freight line: its line bills the discount, no negative row of its own.
    const credit = await creditNoteOf(companyId, shipmentId, invoice.id, billed, 50);
    expect(credit.ownRows).toEqual([]);
    expect(credit.lines.map((l) => l.sourceSellingCostId)).toEqual([discount.id]);
    // Nothing below nothing is left on no document: no credit owed, and the next invoice has nothing to take off.
    expect(await creditsOwed(companyId, shipmentId)).toEqual({ jobs: [], lines: 0 });
    expect((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId)).has(discount.id)).toBe(true);
  });

  it("a discount credited in part comes down to what was credited, and the rest stays owed as a line like it", async () => {
    const { companyId, shipmentId } = job();
    const billed = await sellingRow(companyId, shipmentId, { description: "Ocean freight", category: "ocean_freight" });
    const invoice = await invoiceOf(companyId, shipmentId, [billed]);
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", category: "ocean_freight", amount: "-50.00", vatCode: "OUT" });
    const credit = await creditNoteOf(companyId, shipmentId, invoice.id, billed, 30);
    expect(credit.lines.map((l) => l.sourceSellingCostId)).toEqual([discount.id]);
    const live = (await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), isNull(s.deletedAt)))).filter((r) => r.description === "Discount");
    expect(live.map((r) => [r.id === discount.id, r.amount, r.sourceTruckingRef, r.invoice, r.vatCode]).sort()).toEqual([
      [false, "-20.00", null, true, "OUT"],
      [true, "-30.00", null, true, "OUT"],
    ]);
    // The rest is still owed - it goes on the next invoice or the next credit note, once.
    expect(await creditsOwed(companyId, shipmentId)).toEqual({ jobs: [shipmentId], lines: 1 });
  });

  it("after a full credit, retires a set that comes to nothing on no invoice (a consignment cancelled after the invoice); keeps one still billed", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    const invoice = await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], []);
    expect(await liveSelling(shipmentId)).toEqual([[ref, "1000.00"], [`${ref}:diff:1`, "-1000.00"]]);
    // Still on the open invoice: kept.
    expect(await db.transaction((tx) => truckingLinesRepository.retireNettedSets(tx, companyId, shipmentId))).toEqual([]);
    // Credited in full: it could never be invoiced again (an invoice of nothing is refused) - it goes.
    await db.update(invoiceTable).set({ status: "credited" }).where(eq(invoiceTable.id, invoice.id));
    const gone = await db.transaction((tx) => truckingLinesRepository.retireNettedSets(tx, companyId, shipmentId));
    expect(gone).toHaveLength(2);
    expect(await liveSelling(shipmentId)).toEqual([]);
  });
});

describe("a partial credit note asked before Trucking changed the price (mock test S20-195)", () => {
  // The request's moment: what was written before it is its basis, what comes after makes it stale.
  const requestedNow = async () => {
    await new Promise((r) => setTimeout(r, 20));
    const at = new Date();
    await new Promise((r) => setTimeout(r, 20));
    return at;
  };

  it("sees a credit owed Trucking replaced while the request waited (20 owed → 10), though both reads at the approval agree", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref, amount: "420.00", currency: "EUR" });
    await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], [{ ...push("400.00")[0]!, currency: "EUR" }]);
    const asked = await requestedNow();
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(false);

    // The dispatcher's 400 → 410 while it waits: the −20 goes, a −10 comes.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], [{ ...push("410.00")[0]!, currency: "EUR" }]);
    const first = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id]);
    const again = await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id]);
    expect(first.get(billed.id)!.map((d) => d.amount)).toEqual([-10]);
    expect(again).toEqual(first);
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(true);
  });

  it("sees a credit owed taken away since (the price put back), and one that came since", async () => {
    const back = job();
    const billed = await sellingRow(back.companyId, back.shipmentId, { sourceTruckingRef: back.ref });
    await invoiceOf(back.companyId, back.shipmentId, [billed]);
    await truckingLinesRepository.replace(back.companyId, back.shipmentId, back.ref, [], push("950.00"));
    const asked = await requestedNow();
    await truckingLinesRepository.replace(back.companyId, back.shipmentId, back.ref, [], push("1000.00"));
    expect((await truckingLinesRepository.openCreditDiffs(db, back.companyId, back.shipmentId, [billed.id])).size).toBe(0);
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, back.companyId, back.shipmentId, asked)).toBe(true);

    const came = job();
    const row = await sellingRow(came.companyId, came.shipmentId, { sourceTruckingRef: came.ref });
    await invoiceOf(came.companyId, came.shipmentId, [row]);
    const askedOnNothing = await requestedNow();
    await truckingLinesRepository.replace(came.companyId, came.shipmentId, came.ref, [], push("980.00"));
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, came.companyId, came.shipmentId, askedOnNothing)).toBe(true);
  });

  it("keeps the approval for unchanged prices: the same push again, a price raised, a charge entered, or a credit note's own row written since are no change of what is owed", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    const invoice = await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const asked = await requestedNow();
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    await sellingRow(companyId, shipmentId, { description: "Handling", amount: "80.00" });
    await sellingRow(companyId, shipmentId, { description: "Credited on CN-1", amount: "-30.00", sourceCreditNoteId: invoice.id });
    // A raised price of another consignment is a charge to bill, no credit owed.
    const other = `trucking:consignment:${randomUUID()}`;
    const theirs = await sellingRow(companyId, shipmentId, { sourceTruckingRef: other, amount: "400.00" });
    await invoiceOf(companyId, shipmentId, [theirs]);
    await truckingLinesRepository.replace(companyId, shipmentId, other, [], push("450.00"));
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(false);
  });

  // Review of S20-195: whether a row is owed hangs on the documents billing it, and none of them writes the row.
  it("(1) sees an invoice that took the credit owed off since: no row was written, both reads find nothing owed", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref, amount: "400.00", currency: "EUR" });
    await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], [{ ...push("380.00")[0]!, currency: "EUR" }]);
    const [owed] = (await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id])).get(billed.id)!;
    const asked = await requestedNow();
    expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, asked)).toBe(false);

    // Invoice C: +80 handling and the −20, for 60.
    const handling = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "80.00", currency: "EUR" });
    const [diff] = await db.select().from(s).where(eq(s.id, owed!.id));
    await invoiceOf(companyId, shipmentId, [handling, diff!]);
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id])).size).toBe(0);
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(false);
    expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, asked)).toBe(true);
  });

  it("(2) sees a partial credit note of another invoice that settled the credit owed since", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    const other = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "300.00" });
    const otherInvoice = await invoiceOf(companyId, shipmentId, [other]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("950.00"));
    const asked = await requestedNow();
    await creditNoteOf(companyId, shipmentId, otherInvoice.id, other, 50);
    expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, asked)).toBe(true);
  });

  it("(3) sees another invoice credited in full or cancelled since: its rows below nothing are owed again, and no row was written", async () => {
    for (const end of ["credited", "cancelled"] as const) {
      const { companyId, shipmentId } = job();
      const freight = await sellingRow(companyId, shipmentId, { description: "Ocean freight", amount: "1000.00" });
      await invoiceOf(companyId, shipmentId, [freight]);
      const handling = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "100.00" });
      const discount = await sellingRow(companyId, shipmentId, { description: "Discount", amount: "-20.00" });
      const second = await invoiceOf(companyId, shipmentId, [handling, discount]);
      expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [freight.id])).size).toBe(0);
      const asked = await requestedNow();
      await db.transaction(async (tx) => {
        const done = end === "credited" ? await invoiceRepository.markCredited(tx, second.id, companyId) : await invoiceRepository.markCancelled(tx, second.id, companyId, second.issueDate);
        expect(done).toBe(true);
      });
      expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [freight.id])).get(freight.id)!.map((d) => d.id)).toEqual([discount.id]);
      expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(false);
      expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, asked)).toBe(true);
    }
  });

  it("an open invoice's PDF stored since changes nothing owed; a hand line edited in place since is seen whatever it is now", async () => {
    const { companyId, shipmentId } = job();
    const freight = await sellingRow(companyId, shipmentId, { description: "Ocean freight", amount: "1000.00" });
    const invoice = await invoiceOf(companyId, shipmentId, [freight]);
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", amount: "-20.00" });
    const asked = await requestedNow();
    expect(await invoiceRepository.setPdfIfMissing(invoice.id, companyId, `pdf/${invoice.id}`, "sha")).toBe(true);
    expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, asked)).toBe(false);
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(false);
    // −20 → +5 in place: today's value is above nothing, but it was owed when the request was asked.
    expect(await sellingCostRepository.writeUnlessInvoiced(discount.id, companyId, shipmentId, { data: { amount: "5.00" } })).toMatchObject({ amount: "5.00" });
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, asked)).toBe(true);
  });
});

describe("a partial credit note request keeps what was owed when it was asked (review of system-22)", () => {
  /**
   * A request asked as creditNoteRequestService.ask asks it (requests.create): its time is the database's - its
   * transaction's start - and what is owed on `creditedRows`, read under the invoice's and the shipment's locks, is kept.
   */
  const askOf = async (invoice: { id: string; companyId: string; shipmentId: string; number: string; currency: string; gross: string }, creditedRows: string[]) => {
    const request = await creditNoteRequestRepository.create(
      {
        companyId: invoice.companyId, shipmentId: invoice.shipmentId, invoiceId: invoice.id, invoiceNumber: invoice.number, currency: invoice.currency, lines: [],
        net: "20.00", vat: "0.00", gross: "20.00", invoiceGross: invoice.gross, reason: "Agreed discount", requestedById: randomUUID(),
      },
      { creditedRows },
    );
    expect(request?.owedWhenAsked).toBeTruthy();
    // What is written after the ask is dated after it by the app's clock as well.
    await new Promise((r) => setTimeout(r, 20));
    return request!;
  };
  /** What the approval sees under its locks, as issuePartialCredit's beforeInsert reads it: whether the request is still asked on what is owed. */
  const approvalSees = (request: CreditNoteRequestRecord, creditedRows: string[]) =>
    db.transaction(async (tx) => {
      await lockInvoiceRow(tx, request.companyId, request.invoiceId);
      await truckingLinesLock(tx, request.shipmentId);
      const now = await truckingLinesRepository.openCreditDiffs(tx, request.companyId, request.shipmentId, creditedRows);
      return stillAskedOn(tx, request, request.shipmentId, now);
    });

  it("keeps the approval when a line was only moved in the list since the ask (a Duplicate or an Undo renumbers every row below), though the clock would refuse it", async () => {
    const { companyId, shipmentId } = job();
    const freight = await sellingRow(companyId, shipmentId, { description: "Ocean freight", sortOrder: 1 });
    const invoice = await invoiceOf(companyId, shipmentId, [freight]);
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", amount: "-20.00", sortOrder: 2 });
    const handling = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "80.00", sortOrder: 3 });
    const request = await askOf(invoice, [freight.id]);
    expect(request.owedWhenAsked!.credits).toEqual([[freight.id, [{ id: discount.id, ref: null, currency: "CZK", amount: -20 }]]]);

    // A Duplicate of the freight: every row below it moves down one - a sort order only (updateSellingCost's
    // onlyReorders), the one write the invoiced line takes as well.
    for (const [row, sortOrder] of [[freight, 1], [discount, 3], [handling, 4]] as const) {
      expect(await sellingCostRepository.updateLine(row.id, companyId, shipmentId, { sortOrder })).toMatchObject({ sortOrder });
    }
    // The handling's text changed by hand: nothing owed either.
    expect(await sellingCostRepository.writeUnlessInvoiced(handling.id, companyId, shipmentId, { data: { description: "Handling at the terminal" } })).toMatchObject({ amount: "80.00" });
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, request.requestedAt)).toBe(true);
    expect(await approvalSees(request, [freight.id])).toBe(true);
  });

  it("refuses the approval once Trucking pushed a price after the ask, even one whose row is dated before it - the push began first and waited on the lock", async () => {
    const { companyId, shipmentId, ref } = job();
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    const invoice = await invoiceOf(companyId, shipmentId, [billed]);
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("980.00"));
    const request = await askOf(invoice, [billed.id]);
    expect(request.owedWhenAsked!.credits.map(([row, owed]) => [row, owed.map((d) => d.amount)])).toEqual([[billed.id, [-20]]]);
    expect(await approvalSees(request, [billed.id])).toBe(true);

    // 980 → 990, committed after the ask: the −20 goes, a −10 comes.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("990.00"));
    expect(await approvalSees(request, [billed.id])).toBe(false);
    // Dated as of its transaction's start, before the ask's: the clock misses it, what is owed does not.
    const before = new Date(request.requestedAt.getTime() - 1000);
    await db.update(s).set({ createdAt: before, updatedAt: before }).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, `${ref}:diff:2`)));
    await db.update(s).set({ updatedAt: before }).where(and(eq(s.shipmentId, shipmentId), eq(s.sourceTruckingRef, `${ref}:diff:1`)));
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [billed.id])).get(billed.id)!.map((d) => d.amount)).toEqual([-10]);
    expect(await truckingLinesRepository.creditsOwedChangedSince(db, companyId, shipmentId, request.requestedAt)).toBe(false);
    expect(await approvalSees(request, [billed.id])).toBe(false);
  });

  it("keeps the approval when a credited invoice's PDF is stored after the ask (its first download), though the clock would refuse it; an invoice issued since refuses it", async () => {
    const { companyId, shipmentId } = job();
    const freight = await sellingRow(companyId, shipmentId, { description: "Ocean freight", amount: "1000.00" });
    const invoice = await invoiceOf(companyId, shipmentId, [freight]);
    const handling = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "100.00" });
    const credited = await invoiceOf(companyId, shipmentId, [handling], "credited");
    const request = await askOf(invoice, [freight.id]);
    expect([...request.owedWhenAsked!.documents].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [{ id: invoice.id, status: "issued" }, { id: credited.id, status: "credited" }].sort((a, b) => a.id.localeCompare(b.id)),
    );

    expect(await invoiceRepository.setPdfIfMissing(credited.id, companyId, `pdf/${credited.id}`, "sha")).toBe(true);
    expect(await invoiceRepository.documentsChangedSince(db, companyId, shipmentId, request.requestedAt)).toBe(true);
    expect(await approvalSees(request, [freight.id])).toBe(true);

    // Another invoice of the job issued since - it may have taken a credit owed off: refused, though it wrote no row.
    const storage = await sellingRow(companyId, shipmentId, { description: "Storage", amount: "50.00" });
    await invoiceOf(companyId, shipmentId, [storage]);
    expect(await approvalSees(request, [freight.id])).toBe(false);
  });

  it("refuses the approval once another invoice of the job was credited after the ask: its rows below nothing are owed again", async () => {
    const { companyId, shipmentId } = job();
    const freight = await sellingRow(companyId, shipmentId, { description: "Ocean freight", amount: "1000.00" });
    const invoice = await invoiceOf(companyId, shipmentId, [freight]);
    const handling = await sellingRow(companyId, shipmentId, { description: "Handling", amount: "100.00" });
    const discount = await sellingRow(companyId, shipmentId, { description: "Discount", amount: "-20.00" });
    const second = await invoiceOf(companyId, shipmentId, [handling, discount]);
    const request = await askOf(invoice, [freight.id]);
    expect(request.owedWhenAsked!.credits).toEqual([]);
    expect(await approvalSees(request, [freight.id])).toBe(true);
    await db.transaction(async (tx) => expect(await invoiceRepository.markCredited(tx, second.id, companyId)).toBe(true));
    expect(await approvalSees(request, [freight.id])).toBe(false);
  });
});

describe("a whole credit note after partial ones (tester A, CZFCL00000161)", () => {
  it("leaves the invoice and its credit notes at nothing, and the job bills again what the whole credit note reversed: 1,340 of 1,430, the partial credits standing", async () => {
    const { companyId, shipmentId } = job();
    const freight = await sellingRow(companyId, shipmentId, { category: "ocean_freight", description: "Ocean freight", amount: "1200.00", currency: "EUR" });
    const thc = await sellingRow(companyId, shipmentId, { category: "othc", description: "Origin terminal handling", amount: "180.00", currency: "EUR" });
    const bl = await sellingRow(companyId, shipmentId, { category: "bl_fee", description: "B/L fee", amount: "50.00", currency: "EUR" });
    const invoice = await invoiceOf(companyId, shipmentId, [freight, thc, bl]);
    // CN-002 (−80 of THC) and CN-003 (−10 of freight): a row "Credited on CN…" each, billed by its credit note.
    await creditNoteOf(companyId, shipmentId, invoice.id, thc, 80);
    await creditNoteOf(companyId, shipmentId, invoice.id, freight, 10);
    const creditRows = (await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), isNull(s.deletedAt)))).filter((r) => r.sourceCreditNoteId);
    expect(creditRows.map((r) => r.amount).sort()).toEqual(["-10.00", "-80.00"]);
    expect([...(await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId))].sort()).toEqual([freight.id, thc.id, bl.id, ...creditRows.map((r) => r.id)].sort());

    // The whole credit note, as credit() writes it: what is left of each line (1,190 + 100 + 50), the invoice Credited.
    const notes = await invoiceRepository.creditNotesOf(invoice.id, companyId);
    const left = remainingLines(await invoiceRepository.getLines(invoice.id, companyId), await invoiceRepository.linesOf(notes.map((n) => n.id), companyId));
    expect(left.map((l) => l.remainingAmount)).toEqual([1190, 100, 50]);
    await db.transaction(async (tx) => {
      const [whole] = await tx
        .insert(invoiceTable)
        .values({ ...notes[0]!, id: undefined, number: `CN-${randomUUID()}`, net: "-1340.00", gross: "-1340.00", netCzk: "-1340.00", grossCzk: "-1340.00", createdAt: undefined, updatedAt: undefined })
        .returning();
      await tx.insert(invoiceLineTable).values(
        left.map((l, i) => ({
          companyId, invoiceId: whole!.id, seq: i + 1, description: l.description, qty: "-1.00", unitPrice: l.remainingAmount.toFixed(2), unitCurrency: l.unitCurrency,
          net: (-l.remainingNet).toFixed(2), fxRate: "1", vatCode: "OUT" as const, vatRate: "0.00", sourceSellingCostId: l.sourceSellingCostId, correctsLineId: l.lineId,
        })),
      );
      expect(await invoiceRepository.markCredited(tx, invoice.id, companyId)).toBe(true);
    });

    // Nothing of the job is billed now; the next invoice bills the charges and the credits they kept: 1,340.
    expect((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId)).size).toBe(0);
    const rows = (await db.select().from(s).where(and(eq(s.shipmentId, shipmentId), isNull(s.deletedAt)))).filter((r) => r.invoice);
    const [entry] = buildBillingQueue({ rows, openInvoices: [], billingCurrencies: new Map([[shipmentId, "EUR"]]), rates: { EUR: 25 }, roePct: 0 });
    expect(entry).toMatchObject({ rowsToBill: 5, amountToBill: 1340 });
    // No credit owed: the job has no open invoice, its rows below nothing go on its next invoice with the rest.
    expect(await creditsOwed(companyId, shipmentId)).toEqual({ jobs: [], lines: 0 });
  });
});

describe("a house leaving its master job (n9)", () => {
  it("hands the split rows it gives up to its statuses' hook, per shipment, in the write's transaction", async () => {
    const companyId = randomUUID();
    const masterJobId = randomUUID();
    const [stays, leaves] = [randomUUID(), randomUUID()];
    const ref = `master:${masterJobId}:${randomUUID()}`;
    await sellingRow(companyId, stays, { category: "container_demurrage", amount: "60.00", sourceMasterJobRef: ref });
    const dropped = await sellingRow(companyId, leaves, { category: "container_demurrage", amount: "40.00", sourceMasterJobRef: ref });
    const hook = vi.fn(async (tx: unknown, _writes: SellingLineWrite[]) => {
      expect(tx).not.toBe(db);
    });
    const followOf = vi.fn(() => hook);
    await masterJobCostRepository.dropSplitRowsOutside(companyId, masterJobId, async () => [stays], followOf);
    expect(followOf.mock.calls).toEqual([[leaves]]);
    expect(hook.mock.calls[0]![1]).toEqual([{ before: expect.objectContaining({ id: dropped.id, amount: "40.00" }), now: null }]);
  });
});
