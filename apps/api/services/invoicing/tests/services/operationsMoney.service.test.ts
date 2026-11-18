import { beforeEach, describe, expect, it, vi } from "vitest";

// The Money tab's facts of many jobs (Council Outlay 11, step 4) run for real against stand-ins for the
// repositories and the other services: each family read once for all the jobs, a family that fails named and
// answered null or empty, the rates asked of fx's read that fixes nothing - and nothing written anywhere.
const selling = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
const costs = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: costs }));
const billing = vi.hoisted(() => ({ currenciesOf: vi.fn() }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: billing }));
const invoices = vi.hoisted(() => ({ listOpenInvoicesWithSources: vi.fn(), firstBilledOn: vi.fn() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: invoices }));
const supplier = vi.hoisted(() => ({
  listOfShipments: vi.fn(),
  expectedLinesOfShipments: vi.fn(),
  costLinesOf: vi.fn(),
  liveIds: vi.fn(),
  // What Accounts Payable's page runs and this read must not: gathering invoices from the lines.
  sync: vi.fn(),
  list: vi.fn(),
  expectedLines: vi.fn(),
}));
vi.mock("../../repositories/supplierInvoice.repository", () => ({ supplierInvoiceRepository: supplier }));
const clients = vi.hoisted(() => ({ jobRatesRead: vi.fn(), jobRatesBatch: vi.fn(), costClaims: vi.fn(), supplierFacts: vi.fn() }));
vi.mock("~encore/clients", () => ({
  fx: { _internalFxJobRatesRead: clients.jobRatesRead, _internalFxJobRatesBatch: clients.jobRatesBatch },
  shipments: { _internalCostClaims: clients.costClaims },
  customers: { _internalSupplierFacts: clients.supplierFacts },
}));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

import { MONEY_PARTS, operationsMoneyService as service } from "../../services/operationsMoney.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const C = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const SUPPLIER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";

const sell = (over: Record<string, unknown>) => ({ id: "s1", shipmentId: A, category: "ocean_freight", qty: null, amount: null, currency: "CZK", invoice: true, sourceBuyId: null, ...over });
const buy = (over: Record<string, unknown>) => ({
  id: "b1", shipmentId: A, category: "ocean_freight", estQty: null, estAmount: null, estCurrency: "CZK", realQty: null, realAmount: null, realCurrency: "CZK",
  supplierInvoiceId: null, createdAt: new Date("2026-10-14T09:00:00Z"), ...over,
});
const header = (over: Record<string, unknown> = {}) => ({
  id: INV, supplierCustomerId: SUPPLIER, haulierId: null, vendor: "MSC", invoiceNumber: "FV-1", numberKey: "FV-1", kind: "invoice", dueDate: null,
  receivedAt: new Date("2026-11-10T09:00:00Z"), createdAt: new Date("2026-11-10T09:00:00Z"), status: "booked", decidedAt: null, paidOn: null, refusedLines: [], ...over,
});
const dates = (shipmentId: string, over: Record<string, unknown> = {}) => ({
  shipmentId, tradeDirection: "Import", estimatedArrival: "2026-11-20", estimatedDeparture: "2026-10-30", actualArrival: null, actualDeparture: null, ...over,
});
const rates = (shipmentId: string) => ({ shipmentId, rates: [{ currency: "EUR", rate: 25, fixingDate: "2026-11-18" }] });

beforeEach(() => {
  vi.clearAllMocks();
  // A: sold in EUR, a cost in CZK, an invoice of a supplier. B: CZK only. C: nothing at all.
  selling.listByShipmentIds.mockResolvedValue([sell({ id: "s1", amount: "100", currency: "EUR" }), sell({ id: "s2", shipmentId: B, amount: "900" })]);
  costs.listByShipmentIds.mockResolvedValue([buy({ id: "b1", realAmount: "1500", supplierInvoiceId: INV }), buy({ id: "b2", shipmentId: B, estAmount: "600" })]);
  billing.currenciesOf.mockResolvedValue([{ shipmentId: A, billingCurrency: "EUR" }]);
  invoices.listOpenInvoicesWithSources.mockResolvedValue([{ id: "i1", shipmentId: A, sourceSellingCostIds: ["s1"] }]);
  invoices.firstBilledOn.mockResolvedValue(new Map([[A, "2026-11-05"]]));
  supplier.listOfShipments.mockResolvedValue([header()]);
  supplier.costLinesOf.mockResolvedValue([buy({ id: "b1", realAmount: "1500", supplierInvoiceId: INV })]);
  supplier.expectedLinesOfShipments.mockResolvedValue([buy({ id: "b2", shipmentId: B, estAmount: "600" })]);
  supplier.liveIds.mockImplementation(async (_c: string, ids: string[]) => new Set(ids));
  clients.jobRatesRead.mockResolvedValue({ jobs: [rates(A)], notFixed: [], unreadable: [] });
  clients.costClaims.mockResolvedValue({ claims: [] });
  clients.supplierFacts.mockResolvedValue({ suppliers: [{ id: SUPPLIER, companyName: "MSC Czech", paymentDays: 30 }] });
});

describe("the Money tab's facts of many jobs", () => {
  it("reads each family once for all the jobs and answers every job asked", async () => {
    const out = await service.forJobs(COMPANY, [A, B, C, A.toUpperCase()], [dates(A), dates(B), dates(C)]);

    expect(out.notKnown).toEqual([]);
    expect(out.unreadable).toEqual([]);
    // The customer invoices were read: "no invoice day" and "nothing left to invoice" mean none.
    expect(out.invoicesRead).toBe(true);
    expect(out.jobs.map((j) => j.shipmentId)).toEqual([A, B, C]);
    for (const read of [selling.listByShipmentIds, costs.listByShipmentIds, billing.currenciesOf, invoices.firstBilledOn, supplier.listOfShipments, supplier.expectedLinesOfShipments]) {
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(COMPANY, [A, B, C]);
    }
    expect(invoices.listOpenInvoicesWithSources).toHaveBeenCalledTimes(1);
    expect(invoices.listOpenInvoicesWithSources).toHaveBeenCalledWith([A, B, C], COMPANY);
    expect(supplier.costLinesOf).toHaveBeenCalledTimes(1);
    expect(supplier.costLinesOf).toHaveBeenCalledWith(COMPANY, [INV]);

    const [a, b, c] = out.jobs;
    expect(a).toMatchObject({
      notYetInvoiced: [],
      sellingLines: 1,
      costLines: 1,
      invoicedOn: "2026-11-05",
      totals: { sellingCzk: 2500, realCzk: 1500, costCzk: 1500, profitCzk: 1000, marginPct: 40, missingCurrencies: [] },
      // Booked on 10 Nov, the job invoiced on 5 Nov: a supplier invoice after billing, named as the Customer Database names the supplier.
      supplierInvoices: { toApprove: 1, refused: 0, claimed: 0, approvedOverdue: 0, oldestWaitingSince: "2026-11-10", afterBilling: [{ id: INV, number: "FV-1", supplier: "MSC Czech", bookedOn: "2026-11-10", currency: "CZK", amount: 1500, aboveEstimate: false }] },
      estimatesOpen: { lines: 0 },
    });
    expect(b).toMatchObject({
      notYetInvoiced: [{ currency: "CZK", amount: 900 }],
      invoicedOn: null,
      totals: { sellingCzk: 900, estimateCzk: 600, costCzk: 600, profitCzk: 300 },
      supplierInvoices: { toApprove: 0, afterBilling: [] },
      estimatesOpen: { lines: 1, oldestSince: "2026-10-14", amounts: [{ currency: "CZK", amount: 600 }] },
    });
    expect(c).toMatchObject({ sellingLines: 0, costLines: 0, totals: { profitCzk: 0, marginPct: null } });
  });

  it("only reads: it gathers no supplier invoice and asks fx's read that fixes no rate", async () => {
    await service.forJobs(COMPANY, [A, B], [dates(A)]);
    expect(supplier.sync).not.toHaveBeenCalled();
    expect(supplier.list).not.toHaveBeenCalled();
    expect(supplier.expectedLines).not.toHaveBeenCalled();
    expect(clients.jobRatesBatch).not.toHaveBeenCalled();
    expect(clients.jobRatesRead).toHaveBeenCalledTimes(1);
  });

  it("asks the rates of the jobs with an amount in another currency only, with their dates, whether they are invoiced, and the currencies in use", async () => {
    await service.forJobs(COMPANY, [A, B, C], [dates(A, { actualArrival: "2026-11-12" }), dates(B)]);
    expect(clients.jobRatesRead).toHaveBeenCalledWith({
      jobs: [{ shipmentId: A, dates: { tradeDirection: "Import", estimatedArrival: "2026-11-20", estimatedDeparture: "2026-10-30", actualArrival: "2026-11-12", actualDeparture: null }, invoiced: true }],
      currencies: ["EUR"],
    });
  });

  it("asks no rates when every amount is in CZK", async () => {
    const out = await service.forJobs(COMPANY, [B], []);
    expect(clients.jobRatesRead).not.toHaveBeenCalled();
    expect(out.jobs[0]!.totals.profitCzk).toBe(300);
    expect(out.notKnown).toEqual([]);
  });

  it("without a job's dates hands fx none: a job with no rates fixed then has no totals, and its currency is named", async () => {
    clients.jobRatesRead.mockResolvedValue({ jobs: [], notFixed: [A], unreadable: [] });
    const out = await service.forJobs(COMPANY, [A]);
    expect(clients.jobRatesRead).toHaveBeenCalledWith({ jobs: [{ shipmentId: A, dates: null, invoiced: true }], currencies: ["EUR"] });
    expect(out.jobs[0]!.totals).toEqual({
      sellingCzk: null, estimateCzk: 0, realCzk: 1500, estimateOfRealCzk: 0, realOfEstimatedCzk: 0, costCzk: null, profitCzk: null, marginPct: null,
      missingCurrencies: ["EUR"], ratesNote: "not_fixed",
    });
    // Not a failed read: nothing is named as not known.
    expect(out.notKnown).toEqual([]);
  });

  it("hands through why fx gave a job no rate: not readable, or its rates have no such currency", async () => {
    clients.jobRatesRead.mockResolvedValue({ jobs: [], notFixed: [], unreadable: [A] });
    const unreadable = await service.forJobs(COMPANY, [A, B], [dates(A)]);
    expect(unreadable.jobs[0]!.totals).toMatchObject({ profitCzk: null, missingCurrencies: ["EUR"], ratesNote: "unreadable" });
    // fx answered: the family was read, nothing is named as not known.
    expect(unreadable.notKnown).toEqual([]);

    clients.jobRatesRead.mockResolvedValue({ jobs: [{ shipmentId: A, rates: [] }], notFixed: [], unreadable: [] });
    const missing = await service.forJobs(COMPANY, [A, B], [dates(A)]);
    expect(missing.jobs[0]!.totals).toMatchObject({ profitCzk: null, missingCurrencies: ["EUR"], ratesNote: "missing" });
    expect(missing.jobs[1]!.totals).toMatchObject({ profitCzk: 300, ratesNote: "" });

    clients.jobRatesRead.mockResolvedValue({ jobs: [rates(A)], notFixed: [], unreadable: [] });
    const valued = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(valued.jobs[0]!.totals).toMatchObject({ profitCzk: 1000, missingCurrencies: [], ratesNote: "" });
  });

  it("names the rates when fx does not answer: only the jobs all in CZK are totalled", async () => {
    clients.jobRatesRead.mockRejectedValue(new Error("fx is down"));
    const out = await service.forJobs(COMPANY, [A, B], [dates(A), dates(B)]);
    expect(out.notKnown).toEqual([MONEY_PARTS.rates]);
    expect(out.jobs[0]!.totals).toMatchObject({ profitCzk: null, marginPct: null, missingCurrencies: ["EUR"], ratesNote: "unreadable" });
    expect(out.jobs[1]!.totals).toMatchObject({ profitCzk: 300, missingCurrencies: [], ratesNote: "" });
    // The rest is not touched by it.
    expect(out.jobs[0]!.supplierInvoices).toMatchObject({ toApprove: 1 });
  });

  it("names a family that failed and answers null or nothing for it, while the others still answer", async () => {
    supplier.expectedLinesOfShipments.mockRejectedValue(new Error("statement timeout"));
    const out = await service.forJobs(COMPANY, [A, B], [dates(A)]);
    expect(out.notKnown).toEqual([MONEY_PARTS.estimates]);
    expect(out.invoicesRead).toBe(true);
    expect(out.jobs.map((j) => j.estimatesOpen)).toEqual([null, null]);
    expect(out.jobs[1]).toMatchObject({ notYetInvoiced: [{ currency: "CZK", amount: 900 }], totals: { profitCzk: 300 }, supplierInvoices: { toApprove: 0 } });
  });

  it("without the customer invoices says nothing of work not yet invoiced, and tells fx it does not know which jobs are invoiced", async () => {
    invoices.firstBilledOn.mockRejectedValue(new Error("gone"));
    const out = await service.forJobs(COMPANY, [A, B], [dates(A)]);
    expect(out.notKnown).toEqual([MONEY_PARTS.invoices]);
    expect(out.invoicesRead).toBe(false);
    expect(out.jobs.map((j) => [j.notYetInvoiced, j.untickedSelling, j.invoicedOn])).toEqual([[[], [], null], [[], [], null]]);
    expect(out.jobs[0]!.supplierInvoices).toMatchObject({ toApprove: 1, afterBilling: [] });
    expect(clients.jobRatesRead.mock.calls[0]![0].jobs[0]).toMatchObject({ shipmentId: A, invoiced: null });
  });

  it("without the lines asks no rates and gives no totals", async () => {
    costs.listByShipmentIds.mockRejectedValue(new Error("gone"));
    const out = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(out.notKnown).toEqual([MONEY_PARTS.lines]);
    expect(clients.jobRatesRead).not.toHaveBeenCalled();
    expect(out.jobs[0]).toMatchObject({ sellingLines: null, costLines: null, totals: { profitCzk: null, missingCurrencies: [] }, invoicedOn: "2026-11-05", supplierInvoices: { toApprove: 1 } });
  });

  it("names the supplier invoices when they, or their lines, could not be read", async () => {
    supplier.costLinesOf.mockRejectedValue(new Error("gone"));
    const lines = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(lines.notKnown).toEqual([MONEY_PARTS.supplierInvoices]);
    expect(lines.jobs[0]!.supplierInvoices).toBeNull();
    supplier.listOfShipments.mockRejectedValue(new Error("gone"));
    const headers = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(headers.notKnown).toEqual([MONEY_PARTS.supplierInvoices]);
    expect(headers.jobs[0]!.supplierInvoices).toBeNull();
    expect(headers.jobs[0]!.totals.profitCzk).toBe(1000);
  });

  it("counts an invoice an open cost claim holds, and says not known when the claims could not be read", async () => {
    clients.costClaims.mockResolvedValue({ claims: [{ id: "c1", shipmentId: A, supplierInvoiceId: INV, invoiceNumber: "", status: "open" }] });
    const held = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(clients.costClaims).toHaveBeenCalledWith({ shipmentIds: [A] });
    expect(clients.costClaims).toHaveBeenCalledWith({ supplierInvoiceIds: [INV] });
    expect(held.jobs[0]!.supplierInvoices!.claimed).toBe(1);

    clients.costClaims.mockRejectedValue(new Error("shipments is down"));
    const unread = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(unread.notKnown).toEqual([MONEY_PARTS.claims]);
    expect(unread.jobs[0]!.supplierInvoices).toMatchObject({ toApprove: 1, claimed: null });
  });

  it("takes a claim tied to an invoice record that is gone as one that names the invoice by its number", async () => {
    const GONE = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6f";
    clients.costClaims.mockResolvedValue({ claims: [{ id: "c1", shipmentId: A, supplierInvoiceId: GONE, invoiceNumber: "fv-1", status: "open" }] });
    supplier.liveIds.mockResolvedValue(new Set());
    const out = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(supplier.liveIds).toHaveBeenCalledWith(COMPANY, [GONE]);
    expect(out.jobs[0]!.supplierInvoices!.claimed).toBe(1);
  });

  it("says not known for an approved invoice's overdue when the suppliers' payment days could not be read", async () => {
    supplier.listOfShipments.mockResolvedValue([header({ status: "approved", receivedAt: new Date("2026-09-01T09:00:00Z") })]);
    const known = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(clients.supplierFacts).toHaveBeenCalledWith({ ids: [SUPPLIER] });
    expect(known.jobs[0]!.supplierInvoices!.approvedOverdue).toBe(1);

    clients.supplierFacts.mockRejectedValue(new Error("customers is down"));
    const unread = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(unread.notKnown).toEqual([MONEY_PARTS.terms]);
    expect(unread.jobs[0]!.supplierInvoices).toMatchObject({ approvedOverdue: null, toApprove: 0 });
    // The supplier's name falls back to the one written on the lines.
    supplier.listOfShipments.mockResolvedValue([header()]);
    const named = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(named.jobs[0]!.supplierInvoices!.afterBilling[0]).toMatchObject({ supplier: "MSC" });
  });

  it("leaves a paid invoice out of those that came after billing, and says the day of a refusal", async () => {
    supplier.listOfShipments.mockResolvedValue([
      header({ status: "approved", decidedAt: new Date("2026-11-11T10:00:00Z"), paidOn: "2026-11-14", dueDate: "2026-11-30" }),
      header({ id: "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6c", status: "refused", decidedAt: new Date("2026-11-12T10:00:00Z"), refusedLines: [{ table: "invoice_cost", ownerId: A }] }),
    ]);
    const out = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(out.jobs[0]!.supplierInvoices).toMatchObject({ toApprove: 0, refused: 1, lastRefusedOn: "2026-11-12", approvedOverdue: 0, afterBilling: [] });
  });

  it("asks the other services nothing when the jobs have no supplier invoice", async () => {
    supplier.listOfShipments.mockResolvedValue([]);
    const out = await service.forJobs(COMPANY, [A], [dates(A)]);
    expect(supplier.costLinesOf).not.toHaveBeenCalled();
    expect(clients.costClaims).not.toHaveBeenCalled();
    expect(clients.supplierFacts).not.toHaveBeenCalled();
    expect(out.jobs[0]!.supplierInvoices).toEqual({ toApprove: 0, refused: 0, lastRefusedOn: null, claimed: 0, approvedOverdue: 0, oldestWaitingSince: null, afterBilling: [] });
  });

  it("names what is no id of a job as unreadable, and reads nothing when no id is left", async () => {
    const mixed = await service.forJobs(COMPANY, ["not-an-id", A], [dates(A)]);
    expect(mixed.unreadable).toEqual(["not-an-id"]);
    expect(mixed.jobs.map((j) => j.shipmentId)).toEqual([A]);
    vi.clearAllMocks();
    await expect(service.forJobs(COMPANY, ["x"])).resolves.toEqual({ jobs: [], invoicesRead: true, unreadable: ["x"], notKnown: [] });
    expect(selling.listByShipmentIds).not.toHaveBeenCalled();
  });
});
