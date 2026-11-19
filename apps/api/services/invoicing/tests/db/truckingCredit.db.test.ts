import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

// Mock test council Y1 / P1, Z1, n8, n9 against the invoicing database: what a Trucking push writes
// after an invoice (one difference line per currency, replacing any not on an invoice yet), which
// quote road estimates it retires (each side by itself), a consignment priced on an invoiced quote
// road line, the credits owed a partial credit note settles, a set that comes to nothing after a full
// credit, and a house's split rows handed to its statuses' hook when it leaves its master job. Each
// test works in a company and shipment of its own. Runs only under `encore test`
// (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { truckingLinesRepository } from "../../repositories/truckingLines.repository";
import { masterJobCostRepository } from "../../repositories/masterJobCost.repository";
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
    // A row of no set (a hand-entered line) has none.
    const hand = await sellingRow(companyId, shipmentId, { description: "Handling" });
    expect((await truckingLinesRepository.openCreditDiffs(db, companyId, shipmentId, [hand.id])).size).toBe(0);
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
