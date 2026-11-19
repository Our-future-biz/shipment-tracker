import { beforeEach, describe, expect, it, vi } from "vitest";

// The hooks of Accounts Payable in the job's buying-cost writes (services/invoicing): each write asks
// services/supplierInvoice before it changes a line of a supplier invoice and matches the lines after it; and a
// second invoice for a charge comes as a line of its own (D19). Run for real against an in-memory stand-in for
// the cost lines; Accounts Payable's service is a spy here (tested in supplierInvoice.service.test).
const ap = vi.hoisted(() => ({ beforeLineChange: vi.fn(), afterLineWrite: vi.fn() }));
vi.mock("../../services/supplierInvoice.service", () => ({ supplierInvoiceService: ap }));
vi.mock("../../repositories/supplierInvoice.repository", () => ({
  supplierInvoiceRepository: { bookedOnOtherJobs: vi.fn(async () => []), idOf: vi.fn(async () => null), fillFromReading: vi.fn(async () => undefined), sharesFollowPaid: vi.fn(async () => undefined), paidDays: vi.fn(async () => new Map<string, string>()) },
}));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
// A selling line's status follow-up (the signed-in user, the outbox) is not what these tests are about.
vi.mock("../../services/sellingStatusFollow", () => ({ statusesFollow: () => ({ after: async () => undefined, deliver: async () => undefined }) }));
vi.mock("~encore/clients", () => ({ quotes: { salesQuoteGet: vi.fn() }, customers: { customerGet: vi.fn() }, auth: { userLookup: vi.fn(async () => ({ users: [] })) } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
const billing = vi.hoisted(() => ({ billed: new Set<string>() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: { countOpenInvoices: vi.fn(async (shipmentId: string) => (billing.billed.has(shipmentId) ? 1 : 0)) } }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: {} }));
vi.mock("../../repositories/truckingLines.repository", () => ({
  truckingLinesRepository: {
    hasBuyingOfCategories: async () => false,
    withShipmentLock: async <T>(_s: string, work: () => Promise<T>) => work(),
  },
}));
vi.mock("../../repositories/invoiceCost.repository", async () => {
  type Row = import("../../schemas/invoiceCost.schema").InvoiceCostRecord;
  const rows: Row[] = [];
  let next = 0;
  const blank = (): Omit<Row, "id" | "companyId" | "shipmentId"> => ({
    createdAt: new Date(next * 1000),
    updatedAt: new Date(next * 1000),
    deletedAt: null,
    category: "",
    description: "",
    estQty: null,
    estAmount: null,
    estCurrency: "CZK",
    realQty: null,
    realAmount: null,
    realCurrency: "CZK",
    unit: "",
    invoiceNumber: "",
    received: false,
    vendor: "",
    haulierId: null,
    supplierCustomerId: null,
    receivedAt: null,
    paidOn: null,
    paidAt: null,
    paidByUserId: null,
    paidBy: null,
    sortOrder: 0,
    sourceQuoteNumber: "",
    sourceTruckingRef: null,
    sourceMasterJobRef: null,
    postedFromLines: false,
    supplierInvoiceId: null,
  });
  const live = (r: Row, id: string, companyId: string, shipmentId: string) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt;
  return {
    rows,
    invoiceCostRepository: {
      async createForCompany(companyId: string, values: Partial<Row>) {
        next += 1;
        const row = { ...blank(), id: `row-${next}`, companyId, shipmentId: "", sortOrder: next, ...values } as Row;
        rows.push(row);
        return row;
      },
      // As the database answers it: the first live line of the code entered on the job, by its order.
      async findByCategory(shipmentId: string, companyId: string, category: string, invoiceNumber?: string) {
        const key = (n: string) => n.replace(/\s+/g, "").toUpperCase();
        return (
          rows
            .filter((r) => r.shipmentId === shipmentId && r.companyId === companyId && r.category === category && !r.deletedAt && !r.postedFromLines && !r.sourceTruckingRef && !r.sourceMasterJobRef)
            .filter((r) => invoiceNumber === undefined || key(r.invoiceNumber) === key(invoiceNumber))
            .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null
        );
      },
      async hasQuoteRows() {
        return false;
      },
      async findLine(id: string, companyId: string, shipmentId: string) {
        return rows.find((r) => live(r, id, companyId, shipmentId)) ?? null;
      },
      async softDeleteLine(id: string, companyId: string, shipmentId: string) {
        const row = rows.find((r) => live(r, id, companyId, shipmentId));
        if (row) row.deletedAt = new Date();
        return !!row;
      },
      async updateLine(id: string, companyId: string, shipmentId: string, data: Partial<Row>) {
        const row = rows.find((r) => live(r, id, companyId, shipmentId));
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
      async findDeletedLine(id: string, companyId: string, shipmentId: string) {
        return rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && r.deletedAt) ?? null;
      },
      async restoreLine(id: string, companyId: string, shipmentId: string) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && r.deletedAt);
        if (!row) return null;
        row.deletedAt = null;
        return row;
      },
    },
  };
});

import * as costRepo from "../../repositories/invoiceCost.repository";
import type { InvoiceCostRecord } from "../../schemas/invoiceCost.schema";
import { invoicingService } from "../../services/invoicing.service";

const rows = (costRepo as unknown as { rows: InvoiceCostRecord[] }).rows;
const live = () => rows.filter((r) => !r.deletedAt);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIP_A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const SHIP_B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const actor = { companyID: COMPANY, userID: "u-clerk" };
// What each ask was given, as it was then (the stand-in's rows are changed in place by the write after it).
const asked: { actor: unknown; line: Record<string, unknown>; changes: unknown }[] = [];
const lastAsked = () => asked.at(-1)!;

beforeEach(() => {
  rows.length = 0;
  billing.billed.clear();
  asked.length = 0;
  ap.beforeLineChange.mockReset().mockImplementation(async (who: unknown, line: Record<string, unknown>, changes: unknown) => {
    asked.push({ actor: who, line: { ...line }, changes: changes === "delete" ? changes : { ...(changes as object) } });
  });
  ap.afterLineWrite.mockReset().mockResolvedValue([]);
});

describe("adding, changing, deleting and restoring a buying line", () => {
  it("matches the line to its supplier invoice after it is added, as typed, and answers it as it is then", async () => {
    ap.afterLineWrite.mockImplementationOnce(async () => {
      rows[0]!.supplierInvoiceId = INV;
      return [INV];
    });
    const item = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", realAmount: "100.00", invoiceNumber: "FV-1" }, "u-clerk");
    expect(ap.afterLineWrite).toHaveBeenCalledWith(actor, { shipmentIds: [SHIP_A] }, "typed");
    expect(item.supplierInvoiceId).toBe(INV);
  });

  it("asks before a line changes, with the supplier unlinked as the write will, and writes nothing when refused", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", realAmount: "100.00", invoiceNumber: "FV-1", vendor: "MSC" }, "u-clerk");
    rows[0]!.supplierInvoiceId = INV;
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Maersk" }, "u-clerk");
    expect(lastAsked()).toEqual({ actor, line: expect.objectContaining({ id: line.id, supplierInvoiceId: INV, vendor: "MSC" }), changes: expect.objectContaining({ vendor: "Maersk", supplierCustomerId: null }) });
    expect(ap.afterLineWrite).toHaveBeenLastCalledWith(actor, { shipmentIds: [SHIP_A] }, "typed");

    ap.beforeLineChange.mockRejectedValueOnce(Object.assign(new Error("paid"), { code: "failed_precondition" }));
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "120.00" }, "u-clerk")).rejects.toMatchObject({ code: "failed_precondition" });
    expect(rows[0]!.realAmount).toBe("100.00");
  });

  it("asks before a line is deleted, keeps it when refused, and matches the lines after", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", realAmount: "100.00", invoiceNumber: "FV-1" }, "u-clerk");
    ap.afterLineWrite.mockClear();
    ap.beforeLineChange.mockRejectedValueOnce(Object.assign(new Error("paid"), { code: "failed_precondition" }));
    await expect(invoicingService.deleteBuyingCost(line.id, COMPANY, SHIP_A, "u-clerk")).rejects.toMatchObject({ code: "failed_precondition" });
    expect(live()).toHaveLength(1);
    expect(ap.afterLineWrite).not.toHaveBeenCalled();

    await invoicingService.deleteBuyingCost(line.id, COMPANY, SHIP_A, "u-clerk");
    expect(lastAsked()).toEqual({ actor, line: expect.objectContaining({ id: line.id }), changes: "delete" });
    expect(live()).toHaveLength(0);
    expect(ap.afterLineWrite).toHaveBeenCalledWith(actor, { shipmentIds: [SHIP_A] }, "typed");

    await invoicingService.restoreBuyingCost(line.id, COMPANY, SHIP_A, undefined, "u-clerk");
    expect(live()).toHaveLength(1);
    expect(ap.afterLineWrite).toHaveBeenLastCalledWith(actor, { shipmentIds: [SHIP_A] }, "typed");
  });
});

describe("upsertCost (a cost posted by charge code) and the second invoice for a charge (D19)", () => {
  it("lands the first invoice on the estimate, and matches the lines as read", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "900.00", estCurrency: "EUR" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" }, "u-clerk");
    expect(live()).toEqual([expect.objectContaining({ estAmount: "900.00", realAmount: "950.00", invoiceNumber: "F-1" })]);
    expect(lastAsked()).toEqual({ actor, line: expect.objectContaining({ invoiceNumber: "" }), changes: expect.objectContaining({ realAmount: "950.00", invoiceNumber: "F-1" }) });
    expect(ap.afterLineWrite).toHaveBeenLastCalledWith(actor, { shipmentIds: [SHIP_A] }, "reading");
  });

  it("brings another invoice's number as a line of its own on an unbilled job, without the estimate", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "900.00", estCurrency: "EUR" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" });
    ap.beforeLineChange.mockClear();
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "40.00", realCurrency: "EUR", invoiceNumber: "f 2" });
    expect(live().map((r) => [r.invoiceNumber, r.estAmount, r.realAmount])).toEqual([
      ["F-1", "900.00", "950.00"],
      ["f 2", null, "40.00"],
    ]);
    // The first invoice's line was not touched: only the new line is asked about, as joining its invoice.
    expect(ap.beforeLineChange).toHaveBeenCalledTimes(1);
    expect(lastAsked()).toEqual({ actor: expect.anything(), line: { supplierInvoiceId: null, shipmentId: SHIP_A }, changes: expect.objectContaining({ invoiceNumber: "f 2" }) });
  });

  it("posts over the line when it holds the same invoice (spaces and case aside), asking first", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "960.00", realCurrency: "EUR", invoiceNumber: "f-1 " });
    expect(live()).toEqual([expect.objectContaining({ realAmount: "960.00" })]);
    // The first post asked about the new line joining F-1, the second about changing the line F-1 is on.
    expect(ap.beforeLineChange).toHaveBeenCalledTimes(2);
    expect(lastAsked()).toEqual({ actor: expect.anything(), line: expect.objectContaining({ invoiceNumber: "F-1" }), changes: expect.objectContaining({ realAmount: "960.00" }) });
    // Refused (a paid invoice): the line stays as paid.
    ap.beforeLineChange.mockRejectedValueOnce(Object.assign(new Error("paid"), { code: "failed_precondition" }));
    await expect(invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "970.00", invoiceNumber: "F-1" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(live()).toEqual([expect.objectContaining({ realAmount: "960.00" })]);
  });

  it("replaces the line's invoice when asked to (a split's Replace)", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "40.00", invoiceNumber: "F-2" }, "u-clerk", { replace: true });
    expect(live().map((r) => [r.invoiceNumber, r.realAmount])).toEqual([["F-2", "40.00"]]);
    expect(lastAsked()).toEqual({ actor, line: expect.objectContaining({ invoiceNumber: "F-1" }), changes: expect.objectContaining({ invoiceNumber: "F-2" }) });
  });

  it("a split over shipments replaces only where Replace is asked for", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "10.00", realCurrency: "EUR", invoiceNumber: "OLD" });
    await invoicingService.upsertCost(SHIP_B, COMPANY, "ocean_freight", { realAmount: "20.00", realCurrency: "EUR", invoiceNumber: "OLD" });
    await invoicingService.splitCost(
      COMPANY,
      { category: "ocean_freight", total: "100.00", currency: "EUR", invoiceNumber: "NEW", lines: [{ shipmentId: SHIP_A, weight: 1 }, { shipmentId: SHIP_B, weight: 1 }], overwriteShipmentIds: [SHIP_A] },
      "u-clerk",
    );
    expect(live().map((r) => [r.shipmentId, r.invoiceNumber, r.realAmount])).toEqual([
      [SHIP_A, "NEW", "50.00"],
      [SHIP_B, "OLD", "20.00"],
    ]);
  });

  // Posted again - a corrected amount, or the same document read a second time - an invoice goes onto the line it
  // is on already, not as a third line (D19).
  it("posts a second invoice again over its own line, not as a third line", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "40.00", realCurrency: "EUR", invoiceNumber: "F-2" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "45.00", realCurrency: "EUR", invoiceNumber: "F-2" });
    expect(live().map((r) => [r.invoiceNumber, r.realAmount])).toEqual([
      ["F-1", "950.00"],
      ["F-2", "45.00"],
    ]);
  });
});
