import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Buying costs posted by charge code (master jobs, document reading) and the split of one
// invoice over shipments, run for real against an in-memory stand-in for the cost lines.
// Accounts Payable's record is matched after each cost write (services/supplierInvoice): stood in for here.
vi.mock("../../services/supplierInvoice.service", () => ({ supplierInvoiceService: { beforeLineChange: vi.fn(async () => undefined), afterLineWrite: vi.fn(async () => []) } }));
// The supplier invoices a line can be on, by id: how a late real cost is told from one in before the billing (M1).
const apInvoices = vi.hoisted(() => new Map<string, { createdAt: Date; status: string; paidOn: string | null }>());
vi.mock("../../repositories/supplierInvoice.repository", () => ({
  supplierInvoiceRepository: {
    bookedOnOtherJobs: vi.fn(async () => []),
    idOf: vi.fn(async () => null),
    fillFromReading: vi.fn(async () => undefined),
    sharesFollowPaid: vi.fn(async () => undefined),
    paidDays: vi.fn(async () => new Map<string, string>()),
    byId: vi.fn(async (_c: string, id: string) => apInvoices.get(id) ?? null),
  },
}));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
// A selling line's status follow-up (the signed-in user, the outbox) is not what these tests are about.
vi.mock("../../services/sellingStatusFollow", () => ({ statusesFollow: () => ({ after: async () => undefined, deliver: async () => undefined }) }));
const customerGet = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ quotes: { salesQuoteGet: vi.fn() }, customers: { customerGet }, auth: { userLookup: vi.fn(async () => ({ users: [{ id: "u1", email: "Jana@OurFuture.biz" }] })) } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
// The shipments with an issued invoice not credited: billed (lib/billedLock).
const billing = vi.hoisted(() => ({ billed: new Set<string>(), billedAt: new Date("2026-11-10T10:00:00Z") }));
vi.mock("../../repositories/invoice.repository", () => ({
  invoiceRepository: {
    countOpenInvoices: vi.fn(async (shipmentId: string) => (billing.billed.has(shipmentId) ? 1 : 0)),
    firstBilledAt: vi.fn(async (shipmentId: string) => (billing.billed.has(shipmentId) ? billing.billedAt : null)),
  },
}));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: {} }));
const trucking = vi.hoisted(() => ({ kept: new Set<string>() }));
vi.mock("../../repositories/truckingLines.repository", () => ({
  truckingLinesRepository: {
    hasBuyingOfCategories: async (_c: string, shipmentId: string, categories: string[]) => categories.some((c) => trucking.kept.has(`${shipmentId}|${c}`)),
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
    realCostAt: null,
  });
  // As the database stamps when a line's real amount came (migration 0041): set when it goes from none to one, kept
  // while it stays, cleared with it. Its moment here: after the billing on a billed job, before it on one not billed.
  const stamped = (before: Row | null, after: Row) => {
    if (after.realAmount == null) after.realCostAt = null;
    else if (!before || before.realAmount == null) after.realCostAt = billing.billed.has(after.shipmentId) ? new Date("2026-11-12T09:00:00Z") : new Date("2026-11-01T09:00:00Z");
    else after.realCostAt = before.realCostAt;
    return after;
  };
  return {
    rows,
    invoiceCostRepository: {
      async createForCompany(companyId: string, values: Partial<Row>) {
        next += 1;
        const row = stamped(null, { ...blank(), id: `row-${next}`, companyId, shipmentId: "", ...values } as Row);
        rows.push(row);
        return row;
      },
      async findByCategory(shipmentId: string, companyId: string, category: string) {
        return rows.find((r) => r.shipmentId === shipmentId && r.companyId === companyId && r.category === category) ?? null;
      },
      async hasQuoteRows(companyId: string, shipmentId: string) {
        return rows.some((r) => r.shipmentId === shipmentId && r.companyId === companyId && r.sourceQuoteNumber !== "");
      },
      // As read from the database: a copy, so a write by someone else meanwhile is not seen in it.
      async findLine(id: string, companyId: string, shipmentId: string) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt);
        return row ? { ...row } : null;
      },
      async softDeleteLine(id: string, companyId: string, shipmentId: string) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt);
        if (row) row.deletedAt = new Date();
        return !!row;
      },
      async updateLine(
        id: string,
        companyId: string,
        shipmentId: string,
        data: Partial<Row>,
        receivedStamp?: Date,
        asRead?: Partial<Pick<Row, "realQty" | "realAmount" | "realCurrency">> & { openInvoiceId?: string },
      ) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt);
        if (!row) return null;
        // As the database's condition: the real cost still as it was read (numbers compared as numbers), else nothing.
        const same = (a: string | null, b: string | null | undefined, numeric: boolean) => (a === null || b == null ? a === (b ?? null) : numeric ? Number(a) === Number(b) : a === b);
        if (asRead) {
          const { openInvoiceId, ...cost } = asRead;
          for (const [k, v] of Object.entries(cost) as [keyof typeof cost, string | null][]) if (!same(row[k], v, k !== "realCurrency")) return null;
          // ... and the line still on that supplier invoice, booked and unpaid.
          const invoice = openInvoiceId !== undefined ? apInvoices.get(openInvoiceId) : undefined;
          if (openInvoiceId !== undefined && (row.supplierInvoiceId !== openInvoiceId || invoice?.status !== "booked" || invoice.paidOn)) return null;
        }
        // As the database stamps it: from the row as it is when written.
        const receivedAt = receivedStamp ? (row.received ? row.receivedAt : receivedStamp) : undefined;
        const before = { ...row };
        Object.assign(row, data, receivedStamp ? { receivedAt } : {});
        return stamped(before, row);
      },
      async findDeletedLine(id: string, companyId: string, shipmentId: string) {
        return rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && r.deletedAt) ?? null;
      },
      async restoreLine(id: string, companyId: string, shipmentId: string, sortOrder?: number) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && r.deletedAt);
        if (!row) return null;
        Object.assign(row, { deletedAt: null }, sortOrder === undefined ? {} : { sortOrder });
        return row;
      },
    },
  };
});

import * as costRepo from "../../repositories/invoiceCost.repository";
import { invoicingService } from "../../services/invoicing.service";
import { supplierInvoiceService } from "../../services/supplierInvoice.service";

const rows = (costRepo as unknown as { rows: { shipmentId: string; category: string; estAmount: string | null; realAmount: string | null; vendor: string; realCostAt?: Date | null }[] }).rows;

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIP_A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const SHIP_B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const SHIP_C = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";

// What Costs Breakdown counts for a row: the real cost once there is one, else the estimate.
const counted = (shipmentId: string) =>
  rows.filter((r) => r.shipmentId === shipmentId).reduce((a, r) => a + Number(r.realAmount ?? r.estAmount ?? 0), 0);

beforeEach(() => {
  rows.length = 0;
  trucking.kept.clear();
  billing.billed.clear();
  apInvoices.clear();
});

describe("guards against counting a Trucking cost twice", () => {
  it("refuses a cost posted by code (document reading) onto a job whose cost of that code Trucking keeps", async () => {
    trucking.kept.add(`${SHIP_A}|road_freight`);
    await expect(invoicingService.upsertCost(SHIP_A, COMPANY, "road_freight", { realAmount: "950.00" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Job CZ00000001 has its road freight cost from Trucking: enter the haulier's invoice in Trucking (Haulier invoices), not here, or it is counted twice",
    });
    // Another code of the same job is fine.
    await invoicingService.upsertCost(SHIP_A, COMPANY, "customs", { realAmount: "50.00" });
    // the road codes count as one cost: a "pickup" posted onto Trucking's "road_freight" is refused too
    await expect(invoicingService.upsertCost(SHIP_A, COMPANY, "pickup", { realAmount: "120.00" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(rows).toHaveLength(1);
  });

  it("refuses a master job's split before writing anything when one of its jobs has the code from Trucking", async () => {
    trucking.kept.add(`${SHIP_B}|road_freight`);
    const split = invoicingService.splitCost(COMPANY, {
      category: "road_freight",
      total: "300.00",
      currency: "EUR",
      invoiceNumber: "INV-9",
      lines: [
        { shipmentId: SHIP_A, weight: 1 },
        { shipmentId: SHIP_B, weight: 2 },
      ],
    });
    await expect(split).rejects.toMatchObject({ code: "failed_precondition" });
    expect(rows).toEqual([]);
  });
});

describe("upsertCost", () => {
  it("posts a real cost onto the estimate of its code: one row, counted once", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "road_freight", estAmount: "900.00", estCurrency: "EUR" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "road_freight", { realAmount: "950.00", realCurrency: "EUR", invoiceNumber: "F-1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "road_freight", estAmount: "900.00", realAmount: "950.00" });
    expect(counted(SHIP_A)).toBe(950);
  });

  it("stores a category given as a label under its code, so both ways meet on one row", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "Road freight", estAmount: "900.00" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "road_freight", { realAmount: "950.00" });
    expect(rows.map((r) => r.category)).toEqual(["road_freight"]);
  });

  it("creates the line when the shipment has none of the code", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "100.00" });
    await invoicingService.upsertCost(SHIP_A, COMPANY, "customs", { realAmount: "50.00" });
    expect(rows.map((r) => r.category)).toEqual(["ocean_freight", "customs"]);
  });

  it("refuses a haulier that is not a company id", async () => {
    await expect(invoicingService.addBuyingCost(SHIP_A, COMPANY, { haulierId: "DHL" })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("splitCost", () => {
  const split = (extra: Partial<Parameters<typeof invoicingService.splitCost>[1]> = {}) =>
    invoicingService.splitCost(COMPANY, {
      category: "ocean_freight",
      total: "100.00",
      currency: "EUR",
      invoiceNumber: " F-7 ",
      lines: [
        { shipmentId: SHIP_A, weight: 1 },
        { shipmentId: SHIP_B, weight: 1 },
        { shipmentId: SHIP_C, weight: 1 },
      ],
      ...extra,
    });

  it("posts parts that add up to the total to the cent", async () => {
    const result = await split();
    expect(result.map((l) => [l.amount, l.written])).toEqual([
      ["33.34", true],
      ["33.33", true],
      ["33.33", true],
    ]);
    expect(rows.map((r) => [r.shipmentId, r.category, r.realAmount])).toEqual([
      [SHIP_A, "ocean_freight", "33.34"],
      [SHIP_B, "ocean_freight", "33.33"],
      [SHIP_C, "ocean_freight", "33.33"],
    ]);
  });

  it("records the vendor on each part when given", async () => {
    await split({ vendor: " Vanguard Logistics " });
    expect(rows.map((r) => r.vendor)).toEqual(["Vanguard Logistics", "Vanguard Logistics", "Vanguard Logistics"]);
  });

  it("writes nothing on a dry run", async () => {
    const result = await split({ dryRun: true });
    expect(result.map((l) => l.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(result.every((l) => !l.written)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("skips a shipment of weight 0", async () => {
    const result = await split({ lines: [{ shipmentId: SHIP_A, weight: 0 }, { shipmentId: SHIP_B, weight: 2 }] });
    expect(result.map((l) => [l.amount, l.written])).toEqual([
      [null, false],
      ["100.00", true],
    ]);
    expect(rows.map((r) => r.shipmentId)).toEqual([SHIP_B]);
  });

  it("keeps a real cost a shipment already has, unless told to overwrite it", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "10.00", realCurrency: "USD", invoiceNumber: "OLD" });
    await invoicingService.upsertCost(SHIP_B, COMPANY, "ocean_freight", { realAmount: "20.00", realCurrency: "USD", invoiceNumber: "OLD" });
    const result = await split({ overwriteShipmentIds: [SHIP_B] });
    expect(result[0]).toMatchObject({ amount: "33.34", written: false, existing: { realAmount: "10.00", realCurrency: "USD", invoiceNumber: "OLD" } });
    expect(result[1]).toMatchObject({ amount: "33.33", written: true });
    expect(rows.map((r) => r.realAmount)).toEqual(["10.00", "33.33", "33.33"]);
  });

  it("refuses what it cannot split", async () => {
    await expect(split({ lines: [{ shipmentId: SHIP_A, weight: 0 }] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(split({ total: "0" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(split({ lines: [{ shipmentId: SHIP_A, weight: 1 }, { shipmentId: SHIP_A, weight: 1 }] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(split({ lines: [{ shipmentId: "x", weight: 1 }] })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("a billed shipment", () => {
  const BILLED = /billed.*Credit the invoice/;

  it("takes no estimate by charge code", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "100.00" });
    billing.billed.add(SHIP_A);
    await expect(invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { estAmount: "1" })).rejects.toThrow(BILLED);
    await expect(invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { estCurrency: "EUR" })).rejects.toThrow(BILLED);
    expect(rows).toEqual([expect.objectContaining({ estAmount: "100.00", realAmount: null })]);
  });

  it("takes a late supplier invoice typed by hand: its number, then its real cost (User Council Q1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00", estCurrency: "USD" });
    billing.billed.add(SHIP_A);
    // No number yet: the real cost waits for it.
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450" })).rejects.toThrow(/Fill in the invoice number first/);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "TESTUC-AP-001", received: true });
    // Its quantity and currency, then its amount, each saved on its own while the line has no real amount.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realQty: "1" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "USD" });
    const saved = await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450.00" });
    expect(saved).toMatchObject({ invoiceNumber: "TESTUC-AP-001", realQty: "1", realAmount: "1450.00", realCurrency: "USD", estAmount: "1500.00" });
    // Once its amount is in, the real cost stays as it is, as the rest of the billed buying does - here no supplier
    // invoice was booked for it after the billing (Accounts Payable is stood in for): for one that was, see below (M1).
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "EUR" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    // The estimate stays as billed.
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { estAmount: "1450" })).rejects.toThrow(BILLED);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400", vendor: "Maersk" })).rejects.toThrow(BILLED);
    expect(rows).toEqual([expect.objectContaining({ estAmount: "1500.00", realAmount: "1450.00", realCurrency: "USD" })]);
  });

  it("keeps a late real cost open until its supplier invoice is approved or paid (mock council M1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00", estCurrency: "CZK", realCurrency: "CZK" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "DHL-7781", received: true });
    // Accounts Payable books the number after the billing, as its sync does.
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-late" });
    // Typed left to right: the amount, then its currency - the estimate's CZK is not kept for a USD invoice.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450.00" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "USD" });
    // A typo is put right while nobody has approved it.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1405.00" });
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1405.00", realCurrency: "USD", estAmount: "1500.00", estCurrency: "CZK" })]);
    // The estimate still stays as billed.
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { estAmount: "1450" })).rejects.toThrow(BILLED);
    // Approved, or paid: it stays as it is, and is put right on Accounts Payable.
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "approved", paidOn: null });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400" })).rejects.toThrow(/approved or paid, so the real cost stays as it is/);
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "approved", paidOn: "2026-11-15" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "EUR" })).rejects.toThrow(/approved or paid/);
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1405.00", realCurrency: "USD" })]);
  });

  it("keeps a real cost that was on the line when billed as billed, whenever its supplier invoice record was made (mock council M1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "X-1", received: true, realAmount: "1000.00" });
    apInvoices.set("si-early", { createdAt: new Date("2026-11-01T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-early" });
    billing.billed.add(SHIP_A);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    // System-21 mock council review: its record made after the billing - gathered by the Accounts Payable backfill, or
    // made again when its supplier was relinked - opens nothing: the real cost came before the billing.
    apInvoices.set("si-early", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    // A refused invoice's line is no late one either.
    apInvoices.set("si-early", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "refused", paidOn: null });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00" })]);
  });

  it("keeps an amount typed before the billing as billed when its number is typed after it (system-21 mock council review)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00", realAmount: "1000.00" });
    billing.billed.add(SHIP_A);
    // The number goes on after the billing, and Accounts Payable books a new record for it then.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "DHL-7781", received: true });
    apInvoices.set("si-new", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-new" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00", invoiceNumber: "DHL-7781" })]);
  });

  it("refuses a late real cost's fix when its supplier invoice is approved between the read and the write (system-21 mock council review)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "DHL-7781", received: true });
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-late" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450.00" });
    // The fix of the late real cost asks Accounts Payable to keep an approval as approved, not to send it back.
    vi.mocked(supplierInvoiceService.beforeLineChange).mockClear();
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1405.00" });
    expect(vi.mocked(supplierInvoiceService.beforeLineChange).mock.lastCall?.[3]).toEqual({ keepDecided: true });
    // A manager approves it after the rule read it as booked, before the write.
    vi.mocked(supplierInvoiceService.beforeLineChange).mockImplementationOnce(async () => {
      apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "approved", paidOn: null });
    });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400.00" })).rejects.toThrow(/approved or paid, so the real cost stays as it is/);
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1405.00" })]);
    // A line with no real cost yet asks nothing of the kind.
    vi.mocked(supplierInvoiceService.beforeLineChange).mockClear();
    const other = await invoicingService.addBuyingCost(SHIP_B, COMPANY, { category: "ocean_freight", estAmount: "10.00" });
    billing.billed.add(SHIP_B);
    await invoicingService.updateBuyingCost(other.id, COMPANY, SHIP_B, { invoiceNumber: "F-9", realAmount: "12.00" });
    expect(vi.mocked(supplierInvoiceService.beforeLineChange).mock.lastCall?.[3]).toBeUndefined();
  });

  it("refuses the later of two saves of one billed line's real cost at once (mock council S1-06)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "F-1", received: true });
    // Someone else's amount lands between this save's read and its write - after the billing, as the database stamps it.
    const meanwhile = (amount: string) =>
      vi.mocked(supplierInvoiceService.beforeLineChange).mockImplementationOnce(async () => {
        rows[0]!.realAmount = amount;
        rows[0]!.realCostAt ??= new Date("2026-11-12T09:00:00Z");
      });
    meanwhile("1000.00");
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450" })).rejects.toMatchObject({
      code: "aborted",
      message: expect.stringMatching(/changed meanwhile by someone else/),
    });
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00" })]);
    // The same on a late real cost still open: the other's change is not overwritten.
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-late" });
    meanwhile("1100.00");
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450" })).rejects.toMatchObject({ code: "aborted" });
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1100.00" })]);
    // With nobody else meanwhile it goes through.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450" });
    expect(Number(rows[0]!.realAmount)).toBe(1450);
  });

  it("refuses a billed line's real cost typed on what the page loaded before someone else's save (mock test run F1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "F-1", received: true });
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-late" });
    // Both loaded the line with no real cost. The first save goes in; the second, typed on the empty line, is refused.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1000.00", realAmountWas: "" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1450", realAmountWas: "" })).rejects.toMatchObject({
      code: "aborted",
      message: expect.stringMatching(/changed meanwhile by someone else/),
    });
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00" })]);
    // A stale amount, quantity or currency the page loaded: each refused, nothing written.
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400", realAmountWas: "900" })).rejects.toMatchObject({ code: "aborted" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400", realAmountWas: "1000", realQtyWas: "2" })).rejects.toMatchObject({ code: "aborted" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "USD", realCurrencyWas: "EUR" })).rejects.toMatchObject({ code: "aborted" });
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00", realQty: null, realCurrency: "CZK" })]);
    // Loaded as it is - the amount compared as a number, whatever its decimals - it goes through, the "was" not written.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1405.00", realAmountWas: "1000", realQtyWas: "", realCurrencyWas: "CZK" });
    expect(rows[0]).toMatchObject({ realAmount: "1405.00", realQty: null, realCurrency: "CZK" });
    expect(rows[0]).not.toHaveProperty("realAmountWas");
    // A save landing between the read and the write is still caught: the write is made on what the page sent.
    vi.mocked(supplierInvoiceService.beforeLineChange).mockImplementationOnce(async () => {
      rows[0]!.realAmount = "1300.00";
    });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1400", realAmountWas: "1405" })).rejects.toMatchObject({ code: "aborted" });
    expect(rows[0]).toMatchObject({ realAmount: "1300.00" });
  });

  it("refuses a currency picked on a real cost whose amount someone else changed, every save sending all three (mock test run F1, M1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "F-1", received: true });
    apInvoices.set("si-late", { createdAt: new Date("2026-11-12T09:00:00Z"), status: "booked", paidOn: null });
    Object.assign(rows[0]!, { supplierInvoiceId: "si-late" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1000.00", realAmountWas: "", realQtyWas: "", realCurrencyWas: "CZK" });
    // B saves 1200; A, who loaded 1000 CZK, then picks EUR: refused, B's amount does not end up in A's currency.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "1200.00", realAmountWas: "1000", realQtyWas: "", realCurrencyWas: "CZK" });
    await expect(
      invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "EUR", realAmountWas: "1000", realQtyWas: "", realCurrencyWas: "CZK" }),
    ).rejects.toMatchObject({ code: "aborted", message: expect.stringMatching(/changed meanwhile by someone else/) });
    expect(rows[0]).toMatchObject({ realAmount: "1200.00", realCurrency: "CZK" });
    // A quantity landing between the read and the write of a currency save is caught too: the write is made on all three.
    vi.mocked(supplierInvoiceService.beforeLineChange).mockImplementationOnce(async () => {
      Object.assign(rows[0]!, { realQty: "2.00" });
    });
    await expect(
      invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "EUR", realAmountWas: "1200", realQtyWas: "", realCurrencyWas: "CZK" }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(rows[0]).toMatchObject({ realQty: "2.00", realCurrency: "CZK" });
    // Sent as it is, the currency goes in.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realCurrency: "EUR", realAmountWas: "1200", realQtyWas: "2", realCurrencyWas: "CZK" });
    expect(rows[0]).toMatchObject({ realAmount: "1200.00", realQty: "2.00", realCurrency: "EUR" });
  });

  it("asks nothing of the real cost the page loaded on a job not billed, nor of a change that leaves the cost alone (mock test run F1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", realAmount: "100.00" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "120.00", realAmountWas: "90" });
    expect(rows[0]).toMatchObject({ realAmount: "120.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { sortOrder: 3, realAmountWas: "90" });
    expect(rows[0]).toMatchObject({ realAmount: "120.00", sortOrder: 3 });
  });

  it("keeps a real cost that was in when the customer was billed, number or not (User Council review, Major 1)", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "1500.00" });
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "X-1", received: true, realAmount: "1000.00" });
    billing.billed.add(SHIP_A);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { realQty: "2" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "X-2", realAmount: "500" })).rejects.toThrow(/a real cost already on the line stays as billed/);
    expect(rows).toEqual([expect.objectContaining({ realAmount: "1000.00", invoiceNumber: "X-1" })]);
  });

  it("still takes a supplier's invoice onto an estimate that has none yet", async () => {
    await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", estAmount: "100.00" });
    billing.billed.add(SHIP_A);
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "95.00", invoiceNumber: "F-1" });
    expect(rows).toEqual([expect.objectContaining({ estAmount: "100.00", realAmount: "95.00" })]);
  });

  it("adds a second supplier invoice as a row of its own instead of replacing the first", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "95.00", invoiceNumber: "F-1", vendor: "Maersk" });
    billing.billed.add(SHIP_A);
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "40.00", invoiceNumber: "F-2", vendor: "Maersk" });
    expect(rows.map((r) => [r.shipmentId, r.category, r.realAmount])).toEqual([
      [SHIP_A, "ocean_freight", "95.00"],
      [SHIP_A, "ocean_freight", "40.00"],
    ]);
    // An invoice number alone is a posted invoice too.
    rows.length = 0;
    billing.billed.clear();
    await invoicingService.upsertCost(SHIP_B, COMPANY, "customs", { invoiceNumber: "C-1" });
    billing.billed.add(SHIP_B);
    await invoicingService.upsertCost(SHIP_B, COMPANY, "customs", { realAmount: "12.00", invoiceNumber: "C-2" });
    expect(rows.map((r) => r.realAmount)).toEqual([null, "12.00"]);
  });

  it("keeps its real cost in a split, Replace or not, and says it is billed", async () => {
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "10.00", invoiceNumber: "OLD" });
    await invoicingService.upsertCost(SHIP_B, COMPANY, "ocean_freight", { realAmount: "20.00", invoiceNumber: "OLD" });
    billing.billed.add(SHIP_B);
    billing.billed.add(SHIP_C);
    const result = await invoicingService.splitCost(COMPANY, {
      category: "ocean_freight",
      total: "100.00",
      currency: "EUR",
      invoiceNumber: "F-7",
      lines: [
        { shipmentId: SHIP_A, weight: 1 },
        { shipmentId: SHIP_B, weight: 1 },
        { shipmentId: SHIP_C, weight: 1 },
      ],
      overwriteShipmentIds: [SHIP_A, SHIP_B],
    });
    expect(result.map((l) => [l.shipmentId, l.written, l.billed])).toEqual([
      [SHIP_A, true, false],
      [SHIP_B, false, true],
      // Billed without a real cost of the code: the part is posted, as a supplier's invoice is.
      [SHIP_C, true, true],
    ]);
    expect(rows.map((r) => [r.shipmentId, r.realAmount])).toEqual([
      [SHIP_A, "33.34"],
      [SHIP_B, "20.00"],
      [SHIP_C, "33.33"],
    ]);
  });
});

describe("a shipment priced from a quote", () => {
  // The line Copy from quote leaves: the quote's charge and estimate, marked with the quote.
  const quoteLine = () =>
    costRepo.invoiceCostRepository.createForCompany(COMPANY, {
      shipmentId: SHIP_A,
      category: "ocean_freight",
      description: "Ocean freight",
      estQty: "1.00",
      estAmount: "150.00",
      estCurrency: "EUR",
      sourceQuoteNumber: "QCZ20261022001",
    });

  it("keeps the quote's estimate on its line and takes the real cost and vendor", async () => {
    const line = await quoteLine();
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { estAmount: "140" })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { category: "handling" })).rejects.toMatchObject({ code: "failed_precondition" });
    const saved = await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { estAmount: "150", vendor: "Maersk", realAmount: "160", realCurrency: "EUR" });
    // the mock keeps amounts as written; the database pads them
    expect(saved).toMatchObject({ estAmount: "150", vendor: "Maersk", realAmount: "160", sourceQuoteNumber: "QCZ20261022001" });
  });

  it("does not delete the quote's line", async () => {
    const line = await quoteLine();
    await expect(invoicingService.deleteBuyingCost(line.id, COMPANY, SHIP_A)).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("gives a line added by hand a real cost only", async () => {
    await quoteLine();
    await expect(invoicingService.addBuyingCost(SHIP_A, COMPANY, { estQty: "1", estAmount: "50" })).rejects.toMatchObject({ code: "failed_precondition" });
    const added = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { realQty: "1", realAmount: "40", realCurrency: "EUR", category: "handling" });
    await expect(invoicingService.updateBuyingCost(added.id, COMPANY, SHIP_A, { estAmount: "40" })).rejects.toMatchObject({ code: "failed_precondition" });
    // a shipment without the quote's lines takes an estimate typed in
    await expect(invoicingService.addBuyingCost(SHIP_B, COMPANY, { estQty: "1", estAmount: "50" })).resolves.toMatchObject({ estAmount: "50" });
  });

  it("lands a cost posted by code on the quote's line without touching its estimate", async () => {
    await quoteLine();
    await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { estAmount: "999", realAmount: "155.00", realCurrency: "EUR" });
    expect(rows.filter((r) => r.shipmentId === SHIP_A)).toMatchObject([{ estAmount: "150.00", realAmount: "155.00" }]);
  });
});

describe("a buying cost's supplier and payment (Council Review 5)", () => {
  const SUPPLIER = "3d55a500-d6f8-4def-8e95-82e77493cabb";

  it("links only a live supplier of the Customer Database, checked when the link changes", async () => {
    const { APIError } = await import("../../../../lib/tests/encoreApi.stub");
    customerGet.mockResolvedValueOnce({ customer: { roles: ["customer"] } });
    await expect(invoicingService.addBuyingCost(SHIP_A, COMPANY, { vendor: "Kovo", supplierCustomerId: SUPPLIER })).rejects.toThrow(/no supplier/);
    customerGet.mockRejectedValueOnce(APIError.notFound("Customer not found"));
    await expect(invoicingService.addBuyingCost(SHIP_A, COMPANY, { vendor: "Gone", supplierCustomerId: SUPPLIER })).rejects.toThrow(/not a company of the Customer Database/);
    customerGet.mockResolvedValue({ customer: { roles: ["shipping_line"] } });
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { vendor: "Maersk", supplierCustomerId: SUPPLIER });
    expect(line.supplierCustomerId).toBe(SUPPLIER);
    customerGet.mockClear();
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Maersk", supplierCustomerId: SUPPLIER });
    expect(customerGet).not.toHaveBeenCalled();
  });

  afterEach(() => vi.useRealTimers());
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  it("keeps who marked a cost paid and when, and clears them when the payment is taken back", async () => {
    at("2026-11-01T09:00:00Z");
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { vendor: "Maersk", invoiceNumber: "INV-1", received: true, realAmount: "10" } as never);
    at("2026-11-04T09:00:00Z");
    const paid = await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { paidOn: "2026-11-01" }, "u1");
    expect(paid).toMatchObject({ paidOn: "2026-11-01", paidBy: "jana@ourfuture.biz" });
    expect(paid.paidAt).not.toBeNull();
    const back = await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { paidOn: "" }, "u1");
    expect(back).toMatchObject({ paidOn: "", paidBy: "", paidAt: null });
  });

  it("is paid no earlier than the Prague day its invoice was received, unless that day is not known (C-8)", async () => {
    // 23:30 UTC on 31 Oct is 1 Nov in Prague.
    at("2026-10-31T23:30:00Z");
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { invoiceNumber: "INV-1", received: true, realAmount: "10" } as never);
    at("2026-11-04T09:00:00Z");
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { paidOn: "2026-10-31" }, "u1")).rejects.toThrow("The day it was paid cannot be before its invoice was received (2026-11-01)");
    await expect(invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { paidOn: "2026-11-01" }, "u1")).resolves.toMatchObject({ paidOn: "2026-11-01" });
    // Ticked Received and paid in one go: received today, so paid today.
    const other = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { realAmount: "5" });
    await expect(invoicingService.updateBuyingCost(other.id, COMPANY, SHIP_A, { received: true, paidOn: "2026-11-03" }, "u1")).rejects.toThrow(/before its invoice was received/);
    // A line received before that day was kept is paid on any day.
    const old = await costRepo.invoiceCostRepository.createForCompany(COMPANY, { shipmentId: SHIP_A, received: true, realAmount: "7" });
    await expect(invoicingService.updateBuyingCost(old.id, COMPANY, SHIP_A, { paidOn: "2020-01-01" }, "u1")).resolves.toMatchObject({ paidOn: "2020-01-01" });
  });

  it("is stamped received when ticked again after it was unticked meanwhile (C-5)", async () => {
    at("2026-11-02T09:00:00Z");
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { realAmount: "5" });
    const ticked = await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { invoiceNumber: "INV-1", received: true });
    expect(ticked.receivedAt).toBe("2026-11-02T09:00:00.000Z");
    // A second tick keeps the first stamp.
    at("2026-11-03T09:00:00Z");
    expect((await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { received: true })).receivedAt).toBe("2026-11-02T09:00:00.000Z");
    // Unticked, then ticked by someone who read it still received: stamped again, never received without a stamp.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { received: false });
    const row = rows.find((r) => (r as unknown as { id: string }).id === line.id) as unknown as { received: boolean; receivedAt: Date | null };
    expect(row).toMatchObject({ received: false, receivedAt: null });
    expect((await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { received: true })).receivedAt).toBe("2026-11-03T09:00:00.000Z");
  });

  it("loses its supplier link when the vendor is written without one (C-7)", async () => {
    customerGet.mockResolvedValue({ customer: { roles: ["shipping_line"] } });
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { category: "ocean_freight", vendor: "Maersk", supplierCustomerId: SUPPLIER });
    // The same text sent again keeps it.
    expect((await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Maersk" })).supplierCustomerId).toBe(SUPPLIER);
    expect((await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Hapag" })).supplierCustomerId).toBeNull();
    // A cost posted by code (document reading, a master job's split) with another vendor too.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Maersk", supplierCustomerId: SUPPLIER });
    expect((await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "10", vendor: "Maersk" })).supplierCustomerId).toBe(SUPPLIER);
    expect((await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "10", vendor: "Vanguard" })).supplierCustomerId).toBeNull();
    // No vendor in the write: the link stays.
    await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { vendor: "Maersk", supplierCustomerId: SUPPLIER });
    expect((await invoicingService.upsertCost(SHIP_A, COMPANY, "ocean_freight", { realAmount: "11" })).supplierCustomerId).toBe(SUPPLIER);
  });
});

describe("undo of a deleted buying cost (C-6)", () => {
  it("brings the line back as it was: when it was received, its payment and who noted it, where it was", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    try {
      const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { invoiceNumber: "INV-1", received: true, realAmount: "10", sortOrder: 2 } as never);
      await invoicingService.updateBuyingCost(line.id, COMPANY, SHIP_A, { paidOn: "2026-10-01" }, "u1");
      vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
      await invoicingService.deleteBuyingCost(line.id, COMPANY, SHIP_A);
      const back = await invoicingService.restoreBuyingCost(line.id, COMPANY, SHIP_A, 1);
      expect(back).toMatchObject({ id: line.id, receivedAt: "2026-10-01T09:00:00.000Z", paidOn: "2026-10-01", paidBy: "jana@ourfuture.biz", sortOrder: 1 });
      expect(back.paidAt).toBe("2026-10-01T09:00:00.000Z");
      // Only a deleted line comes back, once.
      await expect(invoicingService.restoreBuyingCost(line.id, COMPANY, SHIP_A)).rejects.toMatchObject({ code: "not_found" });
      await expect(invoicingService.restoreBuyingCost(line.id, COMPANY, SHIP_B)).rejects.toMatchObject({ code: "not_found" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a line with an estimate of its own once the shipment's estimate is its quote's", async () => {
    const line = await invoicingService.addBuyingCost(SHIP_A, COMPANY, { estQty: "1", estAmount: "50" });
    await invoicingService.deleteBuyingCost(line.id, COMPANY, SHIP_A);
    await costRepo.invoiceCostRepository.createForCompany(COMPANY, { shipmentId: SHIP_A, category: "ocean_freight", estAmount: "150.00", sourceQuoteNumber: "QCZ20261022001" });
    await expect(invoicingService.restoreBuyingCost(line.id, COMPANY, SHIP_A)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});
