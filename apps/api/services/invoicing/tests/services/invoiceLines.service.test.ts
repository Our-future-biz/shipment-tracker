import { beforeEach, describe, expect, it, vi } from "vitest";

// An invoice read line by line, posted for real - its checks, its rows and where they go - against an
// in-memory stand-in for the cost lines that writes as the repository does (lib/invoiceLines decides
// which estimate a row goes onto) and a stand-in for the master job's shipments.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const houses = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ shipments: { _internalMasterJobInvoiceHouses: houses }, quotes: { salesQuoteGet: vi.fn() }, customers: { customerGet: vi.fn() } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: {} }));
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
  const { invoiceNumberKey, ontoEstimates } = await import("../../lib/invoiceLines");
  interface Row {
    id: string;
    companyId: string;
    shipmentId: string;
    category: string;
    description: string;
    estAmount: string | null;
    realAmount: string | null;
    realCurrency: string;
    invoiceNumber: string;
    vendor: string;
    sourceQuoteNumber: string;
    sourceTruckingRef: string | null;
    sourceMasterJobRef: string | null;
    postedFromLines: boolean;
    deletedAt: Date | null;
    sortOrder: number;
  }
  const rows: Row[] = [];
  let next = 0;
  const live = (r: Row, companyId: string) => r.companyId === companyId && !r.deletedAt;
  const open = (r: Row) => !r.sourceTruckingRef && !r.sourceMasterJobRef && r.estAmount !== null && r.realAmount === null && r.invoiceNumber.trim() === "";
  const add = (values: Partial<Row>): Row => {
    next += 1;
    const row: Row = {
      id: `row-${next}`,
      companyId: "",
      shipmentId: "",
      category: "",
      description: "",
      estAmount: null,
      realAmount: null,
      realCurrency: "CZK",
      invoiceNumber: "",
      vendor: "",
      sourceQuoteNumber: "",
      sourceTruckingRef: null,
      sourceMasterJobRef: null,
      postedFromLines: false,
      deletedAt: null,
      sortOrder: next,
      ...values,
    };
    rows.push(row);
    return row;
  };
  const repo = {
    async createForCompany(companyId: string, values: Partial<Row>) {
      return add({ ...values, companyId });
    },
    async findByCategory(shipmentId: string, companyId: string, category: string) {
      return rows.find((r) => live(r, companyId) && r.shipmentId === shipmentId && r.category === category && !r.sourceTruckingRef && !r.sourceMasterJobRef && !r.postedFromLines) ?? null;
    },
    async hasQuoteRows(companyId: string, shipmentId: string) {
      return rows.some((r) => live(r, companyId) && r.shipmentId === shipmentId && r.sourceQuoteNumber !== "");
    },
    async updateLine(id: string, companyId: string, shipmentId: string, data: Partial<Row>) {
      const row = rows.find((r) => r.id === id && live(r, companyId) && r.shipmentId === shipmentId);
      if (row) Object.assign(row, data);
      return row ?? null;
    },
    async ofInvoiceNumber(companyId: string, shipmentIds: string[], invoiceNumber: string) {
      return rows.filter((r) => live(r, companyId) && shipmentIds.includes(r.shipmentId) && invoiceNumberKey(r.invoiceNumber) === invoiceNumberKey(invoiceNumber));
    },
    async openEstimateRows(companyId: string, shipmentIds: string[], categories: string[]) {
      return rows.filter((r) => live(r, companyId) && shipmentIds.includes(r.shipmentId) && categories.includes(r.category) && open(r)).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async addInvoiceRows(
      companyId: string,
      invoiceNumber: string,
      written: { shipmentId: string; category: string; description: string; realAmount: string; realCurrency: string }[],
      opts: { vendor: string; fillEstimates: boolean; allowRepeat: boolean; check: () => Promise<void> },
    ) {
      await opts.check();
      const ids = [...new Set(written.map((r) => r.shipmentId))];
      if (!opts.allowRepeat) {
        const earlier = new Set((await repo.ofInvoiceNumber(companyId, ids, invoiceNumber)).map((r) => `${r.shipmentId} ${r.category}`));
        if (written.some((r) => earlier.has(`${r.shipmentId} ${r.category}`))) return "repeated" as const;
      }
      const estimates = opts.fillEstimates ? await repo.openEstimateRows(companyId, ids, [...new Set(written.map((r) => r.category))]) : [];
      const targets = ontoEstimates(written, estimates);
      const ontoEstimate = written.map((r, i) => {
        const estimate = rows.find((row) => row.id === targets[i]);
        if (estimate) Object.assign(estimate, { realAmount: r.realAmount, realCurrency: r.realCurrency, invoiceNumber, postedFromLines: true, ...(opts.vendor ? { vendor: opts.vendor } : {}) });
        else add({ ...r, companyId, invoiceNumber, vendor: opts.vendor, postedFromLines: true });
        return !!estimate;
      });
      return { ontoEstimate };
    },
  };
  return { rows, add, invoiceCostRepository: repo };
});

import * as costRepo from "../../repositories/invoiceCost.repository";
import { invoicingService } from "../../services/invoicing.service";

type StoredRow = { shipmentId: string; category: string; estAmount: string | null; realAmount: string | null; invoiceNumber: string; description: string; postedFromLines: boolean };
const store = costRepo as unknown as { rows: StoredRow[]; add: (values: Record<string, unknown>) => StoredRow };
const rows = store.rows;

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const MASTER = "5d1c2b8e-1111-4c3a-9d1e-00000000000a";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const C = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const OUTSIDE = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c09";
const HOUSES = [
  { shipmentId: A, jobNumber: "CZ00000001", houseBolNumber: "GLSL26060771", cancelled: false, freightTon: 3 },
  { shipmentId: B, jobNumber: "CZ00000002", houseBolNumber: "GLSL26060963", cancelled: false, freightTon: 1 },
  { shipmentId: C, jobNumber: "CZ00000003", houseBolNumber: "GLSL26069999", cancelled: true, freightTon: 2 },
];

// What Costs Breakdown counts for a row: the real cost once there is one, else the estimate.
const counted = (shipmentId: string) => rows.filter((r) => r.shipmentId === shipmentId).reduce((a, r) => a + Number(r.realAmount ?? r.estAmount ?? 0), 0);
const quoteEstimate = (shipmentId: string, estAmount = "2000.00", category = "ocean_freight") =>
  store.add({ companyId: COMPANY, shipmentId, category, description: "Ocean freight", estAmount, sourceQuoteNumber: "QCZ20261010001" });
const post = (over: Partial<Parameters<typeof invoicingService.postInvoiceLines>[1]> = {}) =>
  invoicingService.postInvoiceLines(COMPANY, {
    invoiceNumber: "AS260707595",
    vendor: "GLOBELINK",
    masterJobId: MASTER,
    lines: [{ category: "ocean_freight", amount: "2100.00", currency: "USD", item: "OCEAN FREIGHT(D)", bl: "GLSL26060771", shipmentId: A }],
    ...over,
  });

beforeEach(() => {
  rows.length = 0;
  trucking.kept.clear();
  houses.mockReset();
  houses.mockResolvedValue({ houses: HOUSES });
});

describe("an invoice's real cost on a shipment priced from its quote", () => {
  it("goes onto the estimate it belongs to, so buying is counted once", async () => {
    quoteEstimate(A);
    await expect(post()).resolves.toEqual([{ shipmentId: A, category: "ocean_freight", amount: "2100.00", currency: "USD", repeated: false, ontoEstimate: true }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ estAmount: "2000.00", realAmount: "2100.00", invoiceNumber: "AS260707595", description: "Ocean freight", postedFromLines: true });
    expect(counted(A)).toBe(2100);
  });

  it("leaves the first invoice where it is: a second one of the charge is a row of its own", async () => {
    quoteEstimate(A);
    await post();
    await expect(post({ invoiceNumber: "AS260707600", lines: [{ category: "ocean_freight", amount: "50.00", currency: "USD", bl: "GLSL26060771", shipmentId: A }] })).resolves.toEqual([
      expect.objectContaining({ ontoEstimate: false }),
    ]);
    expect(rows.map((r) => [r.estAmount, r.realAmount, r.invoiceNumber])).toEqual([
      ["2000.00", "2100.00", "AS260707595"],
      [null, "50.00", "AS260707600"],
    ]);
    expect(counted(A)).toBe(2150);
  });

  it("is a new row where the shipment has no open estimate of the charge", async () => {
    quoteEstimate(A, "300.00", "cfs_destination");
    await post();
    expect(rows.map((r) => [r.category, r.estAmount, r.realAmount])).toEqual([
      ["cfs_destination", "300.00", null],
      ["ocean_freight", null, "2100.00"],
    ]);
  });

  it("says in a dry run that it goes onto the estimate, writing nothing", async () => {
    quoteEstimate(A);
    await expect(post({ dryRun: true })).resolves.toEqual([expect.objectContaining({ ontoEstimate: true })]);
    expect(rows[0]).toMatchObject({ realAmount: null, invoiceNumber: "" });
  });
});

describe("a credit note", () => {
  it("never fills an estimate: it is a new minus row, and the estimate stays", async () => {
    quoteEstimate(A);
    await expect(post({ creditNote: true, invoiceNumber: "CN-77", lines: [{ category: "ocean_freight", amount: "-100.00", currency: "USD", bl: "GLSL26060771", shipmentId: A }] })).resolves.toEqual([
      expect.objectContaining({ amount: "-100.00", ontoEstimate: false }),
    ]);
    expect(rows.map((r) => [r.estAmount, r.realAmount, r.description])).toEqual([
      ["2000.00", null, "Ocean freight"],
      [null, "-100.00", "Credit note"],
    ]);
  });

  it("refuses a row that would add buying, also when the credit note comes to a deduction in all", async () => {
    const lines = [
      { category: "ocean_freight", amount: "-100.00", currency: "USD", bl: "GLSL26060771", shipmentId: A },
      { category: "ocean_freight", amount: "10.00", currency: "USD", bl: "GLSL26060963", shipmentId: B },
    ];
    await expect(post({ creditNote: true, invoiceNumber: "CN-1", lines })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("deducts") });
    await expect(post({ creditNote: true, invoiceNumber: "CN-1", lines, dryRun: true })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(rows).toEqual([]);
  });

  it("is not taken for the real cost a shipment has, nor overwritten by a later invoice of the charge", async () => {
    await post({ creditNote: true, invoiceNumber: "CN-1", lines: [{ category: "ocean_freight", amount: "-100.00", currency: "USD", bl: "GLSL26060771", shipmentId: A }] });
    const split = await invoicingService.splitCost(COMPANY, { category: "ocean_freight", total: "300.00", currency: "USD", invoiceNumber: "INV-2", lines: [{ shipmentId: A, weight: 1 }], dryRun: true });
    expect(split[0]!.existing).toBeNull();
    await invoicingService.upsertCost(A, COMPANY, "ocean_freight", { realAmount: "300.00", realCurrency: "USD", invoiceNumber: "INV-2" });
    expect(rows.map((r) => [r.realAmount, r.invoiceNumber])).toEqual([
      ["-100.00", "CN-1"],
      ["300.00", "INV-2"],
    ]);
  });
});

describe("a row posted by B/L", () => {
  it("is not overwritten by one shipment's invoice of the same charge posted later", async () => {
    quoteEstimate(A);
    await post();
    await invoicingService.upsertCost(A, COMPANY, "ocean_freight", { realAmount: "80.00", realCurrency: "USD", invoiceNumber: "LATER-1" });
    expect(rows.map((r) => [r.realAmount, r.invoiceNumber])).toEqual([
      ["2100.00", "AS260707595"],
      ["80.00", "LATER-1"],
    ]);
  });
});

describe("the same invoice twice", () => {
  it("is said in a dry run and refused on posting, the number compared without spaces or case", async () => {
    await post();
    await expect(post({ invoiceNumber: "as 2607 07595", dryRun: true })).resolves.toEqual([expect.objectContaining({ repeated: true })]);
    await expect(post({ invoiceNumber: "as 2607 07595" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(rows).toHaveLength(1);
  });

  it("is posted again when allowed", async () => {
    await post();
    await expect(post({ allowRepeat: true })).resolves.toEqual([expect.objectContaining({ repeated: true })]);
    expect(rows).toHaveLength(2);
  });
});

describe("what a post and its dry run refuse alike", () => {
  it("lines that come to nothing: there is no row to write", async () => {
    const lines = [
      { category: "ocean_freight", amount: "100.00", currency: "USD", bl: "GLSL26060771", shipmentId: A },
      { category: "ocean_freight", amount: "-100.00", currency: "USD", bl: "GLSL26060771", shipmentId: A },
    ];
    await expect(post({ lines })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("nothing") });
    await expect(post({ lines, dryRun: true })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("a cost Trucking keeps", async () => {
    trucking.kept.add(`${A}|road_freight`);
    const lines = [{ category: "road_freight", amount: "100.00", currency: "EUR", bl: "GLSL26060771", shipmentId: A }];
    await expect(post({ lines, dryRun: true })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("Trucking") });
  });

  it.each(["0x1F", "1e3", "1.005", "12,50", "1234567890123"])("an amount that isn't a plain decimal: %s", async (amount) => {
    await expect(post({ lines: [{ category: "ocean_freight", amount, currency: "USD", bl: "GLSL26060771", shipmentId: A }], dryRun: true })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("a shipment that is not on the master job, also chosen by hand", async () => {
    await expect(post({ lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", shipmentId: OUTSIDE, chosen: true }], dryRun: true })).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("not on this master job"),
    });
    expect(houses).toHaveBeenCalledWith({ masterJobId: MASTER });
  });

  it("a line placed by a B/L that is not its shipment's House B/L", async () => {
    await expect(post({ lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", bl: "GLSL26060963", shipmentId: A }], dryRun: true })).rejects.toMatchObject({
      message: expect.stringContaining("not the House B/L of CZ00000001"),
    });
    // Sent there by a person, it goes.
    await expect(post({ lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", bl: "GLSL26060963", shipmentId: A, chosen: true }], dryRun: true })).resolves.toHaveLength(1);
  });

  it("a cancelled shipment, by its B/L or in a split", async () => {
    await expect(post({ lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", bl: "GLSL26069999", shipmentId: C }] })).rejects.toMatchObject({ message: expect.stringContaining("cancelled") });
    await expect(
      post({ splitMethod: "shipment", lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", split: [{ shipmentId: A, weight: 1 }, { shipmentId: C, weight: 1 }] }] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("cancelled") });
    expect(rows).toEqual([]);
  });

  it("a shared line without a master job to share it over", async () => {
    await expect(
      post({ masterJobId: undefined, splitMethod: "wm", lines: [{ category: "ocean_freight", amount: "10.00", currency: "USD", split: [{ shipmentId: A, weight: 1 }] }], dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("master job") });
  });
});

describe("a master job's shared line", () => {
  it("is split by the master job's W/M, whatever weights the browser sent", async () => {
    const out = await post({ splitMethod: "wm", lines: [{ category: "ocean_freight", amount: "100.00", currency: "USD", split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 1 }] }] });
    expect(out.map((r) => [r.shipmentId, r.amount])).toEqual([
      [A, "75.00"],
      [B, "25.00"],
    ]);
  });
});

describe("one shipment's credit note", () => {
  it("is posted to its shipment as before, without a master job", async () => {
    await expect(
      invoicingService.postInvoiceLines(COMPANY, { invoiceNumber: "CN-5", creditNote: true, lines: [{ category: "customs", amount: "-45.00", currency: "CZK", shipmentId: A }] }),
    ).resolves.toEqual([{ shipmentId: A, category: "customs", amount: "-45.00", currency: "CZK", repeated: false, ontoEstimate: false }]);
    expect(houses).not.toHaveBeenCalled();
  });
});
