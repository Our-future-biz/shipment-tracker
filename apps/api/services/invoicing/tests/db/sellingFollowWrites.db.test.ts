import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The writes of a valued selling line other than a hand-written one - a Trucking push, a split row's
// amount set or approved, its removal approved - hand what they did to the line to the hook the job's
// statuses follow by (services/sellingStatusFollow), in their own transaction, with the rows as they
// were and as they are now. The hook itself is a stand-in here (its rules have their unit tests): what
// is checked is what the SQL gives it. Each test works in a company and shipment of its own. Runs only
// under `encore test` (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { truckingLinesRepository } from "../../repositories/truckingLines.repository";
import { sellingAmountRequestRepository } from "../../repositories/sellingAmountRequest.repository";
import type { SellingLineWrite } from "../../repositories/sellingCost.repository";
import { invoiceLineTable, invoiceTable } from "../../schemas/invoice.schema";
import { invoiceCostTable } from "../../schemas/invoiceCost.schema";
import { invoiceSellingCostTable as s, type InvoiceSellingCostRecord } from "../../schemas/invoiceSellingCost.schema";
import { sellingAmountRequestTable } from "../../schemas/sellingAmountRequest.schema";

/** An issued invoice of the shipment billing these selling rows. */
const invoiceOf = async (companyId: string, shipmentId: string, rows: InvoiceSellingCostRecord[]) => {
  const customerId = randomUUID();
  const [invoice] = await db
    .insert(invoiceTable)
    .values({
      companyId,
      shipmentId,
      kind: "invoice",
      status: "issued",
      number: `INV-${randomUUID()}`,
      customerId,
      issueDate: "2026-11-02",
      duzp: "2026-11-01",
      dueDate: "2026-11-16",
      currency: "CZK",
      fxRate: "1.000000",
      net: "10000.00",
      vat: "0.00",
      gross: "10000.00",
      netCzk: "10000.00",
      vatCzk: "0.00",
      grossCzk: "10000.00",
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
  (await db.insert(s).values({ companyId, shipmentId, category: "road_freight", description: "Freight", qty: "1.00", amount: "10000.00", currency: "CZK", ...over }).returning())[0]!;

const values = (w: SellingLineWrite) => [w.before?.amount ?? null, w.now?.amount ?? null, w.now?.description ?? w.before?.description ?? ""];

describe("a Trucking push hands its selling writes to the hook", () => {
  const push = (amount: string) => [{ category: "road_freight", description: "Freight", customer: "Freight", qty: "1.00", amount, currency: "CZK", invoice: true }];

  it("names the difference line it adds to a set on an issued invoice, as a new line, in the push's transaction", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const ref = `trucking:consignment:${randomUUID()}`;
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    const after = vi.fn(async (tx: unknown, writes: SellingLineWrite[]) => {
      // In the push's own transaction: the line is there for it, not yet for anyone else.
      expect(tx).not.toBe(db);
      expect(writes).toHaveLength(1);
    });

    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("12240.00"), "Price change after invoice", after);

    expect(after).toHaveBeenCalledTimes(1);
    const writes = after.mock.calls[0]![1];
    expect(writes.map(values)).toEqual([[null, "2240.00", "Price change after invoice"]]);
  });

  it("hands the lines it took away and the ones it put in, when nothing of the set was invoiced", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const ref = `trucking:consignment:${randomUUID()}`;
    await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref, amount: "9000.00" });
    const after = vi.fn(async () => undefined);

    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("9500.00"), "Price change after invoice", after);

    const writes = (after.mock.calls[0] as unknown as [unknown, SellingLineWrite[]])[1];
    expect(writes.map(values)).toEqual([
      ["9000.00", null, "Freight"],
      [null, "9500.00", "Freight"],
    ]);
  });

  it("hands nothing when the push changed no selling line, and works as before with no hook", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const ref = `trucking:consignment:${randomUUID()}`;
    const billed = await sellingRow(companyId, shipmentId, { sourceTruckingRef: ref });
    await invoiceOf(companyId, shipmentId, [billed]);
    const after = vi.fn(async () => undefined);
    // The same price as invoiced: no difference line.
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("10000.00"), "Price change after invoice", after);
    expect(after).not.toHaveBeenCalled();
    await truckingLinesRepository.replace(companyId, shipmentId, ref, [], push("10500.00"));
    const live = await db.select().from(s).where(eq(s.shipmentId, shipmentId));
    expect(live.filter((r) => !r.deletedAt).map((r) => r.amount).sort()).toEqual(["10000.00", "500.00"]);
  });
});

describe("a split row's amount hands its write to the hook", () => {
  const splitJob = async (amount = "89.89") => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const ref = `master:${randomUUID()}`;
    await db.insert(invoiceCostTable).values({ companyId, shipmentId, category: "container_demurrage", estAmount: "89.89", estCurrency: "EUR", sourceMasterJobRef: ref });
    const row = await sellingRow(companyId, shipmentId, { category: "container_demurrage", description: "Demurrage", amount, currency: "EUR", sourceMasterJobRef: ref });
    return { companyId, shipmentId, row };
  };
  const who = { userId: randomUUID(), userEmail: "rep@example.test", jobNumber: "CZ00000024" };

  it("a number at or above the cost, written at once: the row as it was and as it is now", async () => {
    const { companyId, shipmentId, row } = await splitJob();
    const after = vi.fn(async () => undefined);
    const out = await sellingAmountRequestRepository.change(companyId, shipmentId, row.id, { amount: "120.00", reason: "", ...who }, after);
    expect(out.outcome).toBe("saved");
    expect(after).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: row.id, amount: "89.89" }), expect.objectContaining({ id: row.id, amount: "120.00" }));
  });

  it("a request asked: nothing written, nothing handed on", async () => {
    const { companyId, shipmentId, row } = await splitJob();
    const after = vi.fn(async () => undefined);
    const out = await sellingAmountRequestRepository.change(companyId, shipmentId, row.id, { amount: "50.00", reason: "Customer goodwill", ...who }, after);
    expect(out.outcome).toBe("asked");
    expect(after).not.toHaveBeenCalled();
  });

  it("an approval: the new amount, or the row taken away, for the request's shipment; a rejection hands nothing on", async () => {
    const manager = { comment: "", userId: randomUUID(), userEmail: "boss@example.test" };
    for (const kind of ["amount", "remove"] as const) {
      const { companyId, shipmentId, row } = await splitJob();
      const [request] = await db
        .insert(sellingAmountRequestTable)
        .values({ companyId, shipmentId, sellingCostId: row.id, kind, currency: "EUR", costAmount: "89.89", currentAmount: "89.89", requestedAmount: kind === "remove" ? "0.00" : "50.00", reason: "Customer goodwill", requestedById: who.userId })
        .returning();
      const after = vi.fn(async () => undefined);
      const followOf = vi.fn(() => after);
      const out = await sellingAmountRequestRepository.answer(companyId, request!.id, { approve: true, ...manager }, followOf);
      expect(out.outcome).toBe("done");
      expect(followOf).toHaveBeenCalledWith(shipmentId);
      expect(after).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: row.id, amount: "89.89" }),
        kind === "remove" ? null : expect.objectContaining({ id: row.id, amount: "50.00" }),
      );
    }

    const { companyId, shipmentId, row } = await splitJob();
    const [request] = await db
      .insert(sellingAmountRequestTable)
      .values({ companyId, shipmentId, sellingCostId: row.id, currency: "EUR", costAmount: "89.89", currentAmount: "89.89", requestedAmount: "50.00", reason: "Customer goodwill", requestedById: who.userId })
      .returning();
    const followOf = vi.fn(() => vi.fn(async () => undefined));
    await sellingAmountRequestRepository.answer(companyId, request!.id, { approve: false, comment: "Too low", userId: randomUUID(), userEmail: "boss@example.test" }, followOf);
    expect(followOf).not.toHaveBeenCalled();
  });
});
