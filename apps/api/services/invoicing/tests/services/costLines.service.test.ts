import { beforeEach, describe, expect, it, vi } from "vitest";

// Buying costs posted by charge code (master jobs, document reading) and the split of one
// invoice over shipments, run for real against an in-memory stand-in for the cost lines.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ quotes: { salesQuoteGet: vi.fn() } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
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
    sortOrder: 0,
    sourceQuoteNumber: "",
    sourceTruckingRef: null,
  });
  return {
    rows,
    invoiceCostRepository: {
      async createForCompany(companyId: string, values: Partial<Row>) {
        next += 1;
        const row = { ...blank(), id: `row-${next}`, companyId, shipmentId: "", ...values } as Row;
        rows.push(row);
        return row;
      },
      async findByCategory(shipmentId: string, companyId: string, category: string) {
        return rows.find((r) => r.shipmentId === shipmentId && r.companyId === companyId && r.category === category) ?? null;
      },
      async hasQuoteRows(companyId: string, shipmentId: string) {
        return rows.some((r) => r.shipmentId === shipmentId && r.companyId === companyId && r.sourceQuoteNumber !== "");
      },
      async findLine(id: string, companyId: string, shipmentId: string) {
        return rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt) ?? null;
      },
      async softDeleteLine(id: string, companyId: string, shipmentId: string) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId && !r.deletedAt);
        if (row) row.deletedAt = new Date();
        return !!row;
      },
      async updateLine(id: string, companyId: string, shipmentId: string, data: Partial<Row>) {
        const row = rows.find((r) => r.id === id && r.companyId === companyId && r.shipmentId === shipmentId);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
  };
});

import * as costRepo from "../../repositories/invoiceCost.repository";
import { invoicingService } from "../../services/invoicing.service";

const rows = (costRepo as unknown as { rows: { shipmentId: string; category: string; estAmount: string | null; realAmount: string | null }[] }).rows;

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
