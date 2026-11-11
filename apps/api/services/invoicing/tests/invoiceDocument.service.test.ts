import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  issue: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  getByIdForCompany: vi.fn(),
  getLines: vi.fn(),
  listByShipment: vi.fn(),
  markCredited: vi.fn(),
  setPdfIfMissing: vi.fn(),
  countOpenInvoices: vi.fn(),
  listOpenInvoicesWithSources: vi.fn(),
  invoicedSellingRowIds: vi.fn(),
  shipmentIdsWithInvoices: vi.fn(),
  billedShipmentIds: vi.fn(),
}));
const generated = vi.hoisted(() => ({ shipmentIdsWithInvoices: vi.fn() }));
const trucking = vi.hoisted(() => ({
  lock: vi.fn(async () => undefined),
  liveSellingVersions: vi.fn(async (_tx: unknown, _c: string, _s: string, ids: string[]) => new Map(ids.map((id) => [id, new Date("2026-11-06T09:00:00Z").getTime()]))),
}));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
const pdf = vi.hoisted(() => ({ render: vi.fn() }));
const profiles = vi.hoisted(() => ({ getByCompany: vi.fn() }));
const selling = vi.hoisted(() => ({ listByShipmentId: vi.fn(), listLiveByShipments: vi.fn() }));
const settings = vi.hoisted(() => ({ getByShipmentId: vi.fn(), listByShipments: vi.fn(), createIfMissing: vi.fn() }));
const fxClient = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
// The follow-up outbox, in memory: rows written in the issue's transaction, claimed and settled.
const outbox = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = [];
  const settle = (status: string) => vi.fn(async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (row) row.status = status;
    return "pending";
  });
  return {
    rows,
    enqueue: vi.fn(async (_tx: unknown, add: Record<string, unknown>[]) => {
      for (const r of add) rows.push({ ...r, id: `o${rows.length + 1}`, attempts: 0, status: "pending" });
      return add;
    }),
    claimDue: vi.fn(async (_limit: number, invoiceId?: string) => {
      const due = rows.filter((r) => r.status === "pending" && (!invoiceId || r.invoiceId === invoiceId));
      for (const r of due) {
        r.attempts = (r.attempts as number) + 1;
        r.status = "claimed";
      }
      return due;
    }),
    markSent: settle("sent"),
    markRetry: settle("retry"),
    markFailed: settle("failed"),
  };
});
const clients = vi.hoisted(() => ({
  shipmentGet: vi.fn(), shipmentUpdate: vi.fn(), shipmentList: vi.fn(), customerGet: vi.fn(), invoiceCreate: vi.fn(),
  invoiceMarkCredited: vi.fn(), shipmentReferenceFinal: vi.fn(), addressList: vi.fn(),
}));

vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: "user" }) }));
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: repo }));
vi.mock("../repositories/invoiceFollowupOutbox.repository", () => ({ invoiceFollowupOutboxRepository: outbox }));
vi.mock("../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: generated }));
vi.mock("../repositories/truckingLines.repository", () => ({
  truckingLinesLock: trucking.lock,
  truckingLinesRepository: { liveSellingVersions: trucking.liveSellingVersions },
}));
vi.mock("../repositories/invoiceProfile.repository", () => ({ invoiceProfileRepository: profiles }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: settings }));
vi.mock("~encore/clients", () => ({
  shipments: {
    shipmentGet: clients.shipmentGet,
    shipmentUpdate: clients.shipmentUpdate,
    shipmentList: clients.shipmentList,
    _internalShipmentReferenceFinal: clients.shipmentReferenceFinal,
  },
  customers: {
    customerGet: clients.customerGet,
    addressList: clients.addressList,
    _internalCustomerInvoicePost: clients.invoiceCreate,
    invoiceMarkCredited: clients.invoiceMarkCredited,
  },
  fx: fxClient,
}));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../storage/invoiceBucket", () => ({ invoiceBucket: bucket }));
vi.mock("../lib/pdfFonts", () => ({ loadPdfFonts: async () => ({ regular: new Uint8Array(), bold: new Uint8Array() }) }));
vi.mock("../lib/invoicePdf", () => ({ renderInvoicePdf: pdf.render }));
// The Encore runtime isn't loaded under vitest; APIError carries its message and the code it answers with.
vi.mock("encore.dev/api", () => {
  class APIError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
    static notFound = (msg: string) => new APIError("not_found", msg);
    static invalidArgument = (msg: string) => new APIError("invalid_argument", msg);
    static failedPrecondition = (msg: string) => new APIError("failed_precondition", msg);
    static internal = (msg: string) => new APIError("internal", msg);
    static alreadyExists = (msg: string) => new APIError("already_exists", msg);
    static unavailable = (msg: string) => new APIError("unavailable", msg);
  }
  return { APIError, ErrCode: { NotFound: "not_found" } };
});

import { invoiceDocumentService, pragueToday } from "../services/invoiceDocument.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-0000000000u1";
const SHIPMENT = "00000000-0000-0000-0000-0000000000aa";
const CUSTOMER = "00000000-0000-0000-0000-0000000000cc";

const shipment = {
  id: SHIPMENT, jobNumber: "CZ00000028", createdAt: "2026-04-02T09:00:00.000Z", tradeDirection: "Import",
  status: "Billing [IMP]", invoicingStatus: "Not Invoiced",
  estimatedArrival: "10/14/26", estimatedDeparture: "09/20/26", customerId: CUSTOMER,
  shipper: "Shipper Ltd", consignee: "Consignee s.r.o.", bookingNumber: "BK1", containerNumber: "MSCU1234567", personalReference: "PO-9",
};
const customer = {
  id: CUSTOMER, companyName: "Zákazník a.s.", registeredAddress: "Dlouhá 5", city: "Brno", country: "CZ",
  ico: "25596641", dic: "CZ25596641", paymentTerms: "30 days",
};
const profile = {
  companyName: "TEST Logistika s.r.o.", street: "Testovací 1", city: "Praha 5", postalCode: "150 00", country: "CZ",
  ico: "12345679", dic: "CZ12345679", vatPayer: true, registerEntry: "", email: "", phone: "", web: "", logoData: "",
  bankAccounts: [{ currency: "CZK", bankName: "B", accountNumber: "1/0800", iban: "", swift: "" }], defaultDueDays: 14, footerNote: "",
};
// ČNB rates valid on the DUZP, as the fx service returns them
const cnb = { date: "2026-10-14", fixingDate: "2026-10-13", provisional: false, missing: false, roePct: 100, rates: [{ currency: "EUR", rate: 25 }, { currency: "USD", rate: 22 }], retired: [] };
// Every row was last changed at SAVED, unless a test says otherwise.
const SAVED = new Date("2026-11-06T09:00:00Z");
const sellRow = (over: Record<string, unknown>) => ({
  id: "s1", category: "Ocean freight", qty: "1.00", amount: "1000.00", currency: "EUR", invoice: true, vatCode: null, updatedAt: SAVED, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  clients.shipmentGet.mockResolvedValue({ shipment });
  clients.shipmentReferenceFinal.mockResolvedValue({ jobNumber: shipment.jobNumber });
  clients.customerGet.mockResolvedValue({ customer });
  // The customer's addresses: only its seat, so the invoice is addressed there.
  clients.addressList.mockResolvedValue({ data: [{ id: "addr-seat", types: ["Registered"], label: "", street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00", country: "CZ" }] });
  clients.invoiceCreate.mockResolvedValue({});
  clients.invoiceMarkCredited.mockResolvedValue({ updated: 1 });
  repo.invoicedSellingRowIds.mockResolvedValue(new Set());
  clients.shipmentUpdate.mockResolvedValue({});
  profiles.getByCompany.mockResolvedValue(profile);
  selling.listByShipmentId.mockResolvedValue([sellRow({}), sellRow({ id: "s2", category: "THC Destination", amount: "4999.50", currency: "CZK" })]);
  settings.getByShipmentId.mockResolvedValue({ billingCurrency: "CZK" });
  fxClient.fxRatesOn.mockResolvedValue(cnb);
  repo.getByIdempotencyKey.mockResolvedValue(null);
  repo.setPdfIfMissing.mockResolvedValue(true);
  bucket.upload.mockResolvedValue(undefined);
  bucket.remove.mockResolvedValue(undefined);
  pdf.render.mockResolvedValue(new TextEncoder().encode("%PDF-test"));
  outbox.rows.length = 0;
  repo.issue.mockImplementation(async (prefix: string, header: Record<string, unknown>, lines: Record<string, unknown>[], hooks?: { afterInsert?: (tx: unknown, invoice: unknown) => Promise<void> }) => {
    const invoice = { ...header, id: "inv1", number: `${prefix}001`, correctsInvoiceId: header.correctsInvoiceId ?? null, creditReason: header.creditReason ?? "", pdfKey: "", createdAt: new Date("2026-10-13T10:00:00Z") };
    await hooks?.afterInsert?.({}, invoice);
    return { invoice, lines: lines.map((l) => ({ ...l, sourceSellingCostId: l.sourceSellingCostId ?? null })) };
  });
});

describe("preview", () => {
  it("computes the invoice from stored data, with DUZP = ETA for an import", async () => {
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.problems).toEqual([]);
    expect(p).toMatchObject({ duzp: "2026-10-14", currency: "CZK", fxFixingDate: "2026-10-13", roePct: 100, gross: 29999.5, grossCzk: 29999.5, customerId: CUSTOMER });
    expect(fxClient.fxRatesOn).toHaveBeenCalledWith({ date: "2026-10-14" });
    expect(p.lines.map((l) => [l.description, l.net, l.vatCode])).toEqual([
      ["Ocean freight (OF / BAS)", "25000.00", "Z69"],
      ["THC Destination", "4999.50", "Z69"],
    ]);
    // due date from the customer's "30 days"
    const today = pragueToday();
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    expect(p.dueDate).toBe(due.toISOString().slice(0, 10));
  });

  it("lists every problem that blocks issuing", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, customerId: null } });
    profiles.getByCompany.mockResolvedValue({ ...profile, ico: "", bankAccounts: [] });
    selling.listByShipmentId.mockResolvedValue([sellRow({ currency: "GBP" })]);
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2026-02-30" });
    expect(p.problems).toEqual([
      "DUZP is not a valid date",
      "Choose the customer to invoice",
      "Invoicing details are missing: IČO, bank account (Settings → Organization)",
      "ČNB publishes no rate for GBP",
      "Tick at least one selling row for Invoice",
    ]);
  });

  it("carries the currencies the customer is billed in, as the Customer Database has them", async () => {
    clients.customerGet.mockResolvedValue({ customer: { ...customer, currency: "EUR", secondaryCurrencies: ["CZK", "USD"] } });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.customerCurrencies).toEqual({ currency: "EUR", secondaryCurrencies: ["CZK", "USD"] });
    // No customer, or one that could not be read: none.
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, customerId: null } });
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, {})).customerCurrencies).toBeNull();
    clients.customerGet.mockRejectedValue(new Error("customers is down"));
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, { customerId: CUSTOMER })).customerCurrencies).toBeNull();
  });

  it("warns, without blocking, when there is no bank account in the billing currency", async () => {
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.warnings).toEqual([]);
    profiles.getByCompany.mockResolvedValue({ ...profile, bankAccounts: [{ ...profile.bankAccounts[0]!, currency: "EUR" }] });
    const noCzk = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(noCzk.warnings).toEqual(["No bank account in CZK (Settings → Organization): the invoice has no payment details or QR payment"]);
    expect(noCzk.problems).not.toContainEqual(expect.stringContaining("bank account"));
  });
});

describe("ČNB rates", () => {
  it("takes DUZP from ATA once known, and applies the ROE % to foreign lines", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, actualArrival: "2026-10-12" } });
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, date: "2026-10-12", fixingDate: "2026-10-12", roePct: 102 });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.duzp).toBe("2026-10-12");
    expect(p.lines.map((l) => l.net)).toEqual(["25500.00", "4999.50"]);
  });

  it("blocks issuing while the DUZP's ČNB rate is not published", async () => {
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, provisional: true });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2020-01-02" });
    expect(p.problems).toContain("Today's ČNB rate is imported at 15:00 (ČNB publishes about 14:30) — issue the invoice after that");
    const future = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2999-01-01" });
    expect(future.problems).toContain("DUZP is in the future — the ČNB rate for it is not known yet");
  });

  it("starts a job's billing that never started (its customer was unreadable then) before the invoice, in the customer's currency", async () => {
    repo.listByShipment.mockResolvedValue([]);
    clients.customerGet.mockResolvedValue({ customer: { ...customer, currency: "EUR" } });
    settings.getByShipmentId.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ billingCurrency: "EUR" });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(settings.createIfMissing).toHaveBeenCalledWith(SHIPMENT, COMPANY, { billingCurrency: "EUR" });
    expect(p.currency).toBe("EUR");
  });

  it("holds the invoice while the customer's default currency can't be read, rather than draw it up in CZK", async () => {
    repo.listByShipment.mockResolvedValue([]);
    settings.getByShipmentId.mockResolvedValue(null);
    clients.customerGet.mockRejectedValue(new Error("customers is down"));
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.problems).toContain("The customer's default currency could not be read — try again in a moment");
    expect(settings.createIfMissing).not.toHaveBeenCalled();
  });

  it("says the chosen customer was not found only when Customers says so; Customers down is to try again", async () => {
    const { APIError } = await import("encore.dev/api");
    clients.customerGet.mockRejectedValueOnce(APIError.notFound("customer not found"));
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, {})).problems).toContain("The chosen customer was not found");
    clients.customerGet.mockRejectedValueOnce(APIError.unavailable("customers is down"));
    const down = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(down.problems).toContain("The customer could not be read — try again");
    expect(down.problems).not.toContain("The chosen customer was not found");
  });

  it("does not hold a CZK invoice of CZK rows for the ČNB rate: nothing is converted", async () => {
    selling.listByShipmentId.mockResolvedValue([sellRow({ currency: "CZK", amount: "12000.00" })]);
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, provisional: true });
    const today = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2020-01-02" });
    expect(today.problems).toEqual([]);
    expect(today.grossCzk).toBe(12000);
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, missing: true });
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2020-01-02" })).problems).toEqual([]);
    // One EUR row is converted: held as before.
    selling.listByShipmentId.mockResolvedValue([sellRow({ currency: "CZK" }), sellRow({ id: "s2", currency: "EUR" })]);
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, provisional: true });
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2020-01-02" })).problems).toContain("Today's ČNB rate is imported at 15:00 (ČNB publishes about 14:30) — issue the invoice after that");
  });

  // Bulgaria adopted the euro: ČNB's last BGN fixing is 2025-12-31, fxRatesOn lists it as retired.
  const withBgnRetired = { ...cnb, retired: [{ currency: "BGN", lastFixingDate: "2025-12-31" }] };

  it("issues an EUR / CZK invoice while a currency ČNB no longer publishes is retired", async () => {
    fxClient.fxRatesOn.mockResolvedValue(withBgnRetired);
    settings.getByShipmentId.mockResolvedValue({ billingCurrency: "EUR" });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2026-10-13" });
    expect(p.problems).toEqual([]);
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { duzp: "2026-10-13" });
    expect(repo.issue).toHaveBeenCalledTimes(1);
  });

  it("refuses a line in a currency ČNB no longer publishes, saying so", async () => {
    fxClient.fxRatesOn.mockResolvedValue(withBgnRetired);
    selling.listByShipmentId.mockResolvedValue([sellRow({}), sellRow({ id: "s2", amount: "500.00", currency: "BGN" })]);
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2026-10-13" });
    expect(p.problems).toEqual(["ČNB no longer publishes BGN (last fixing 2025-12-31) — change the currency of the BGN selling rows"]);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { duzp: "2026-10-13" })).rejects.toThrow(/no longer publishes BGN/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("still refuses when a published currency's fixing was not imported, BGN retired or not", async () => {
    fxClient.fxRatesOn.mockResolvedValue({ ...withBgnRetired, missing: true });
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, { duzp: "2026-10-13" });
    expect(p.problems).toContainEqual(expect.stringMatching(/have not been imported yet/));
  });

  it("stores the ČNB fixing, source and ROE % on the issued invoice", async () => {
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { duzp: "2026-10-13" });
    const [, header, lines] = repo.issue.mock.calls[0]!;
    expect(header).toMatchObject({ fxSource: "CNB", fxFixingDate: "2026-10-13", roePct: "100", fxWeek: "" });
    expect(lines.map((l: { fxRate: string }) => l.fxRate)).toEqual(["25", "1"]);
  });
});

describe("issue", () => {
  it("issues INV + job year + job number, snapshots the parties and posts to the customer", async () => {
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    const [prefix, header, lines] = repo.issue.mock.calls[0]!;
    expect(prefix).toBe("INV2026CZ00000028-");
    expect(header).toMatchObject({
      kind: "invoice", customerId: CUSTOMER, currency: "CZK", gross: "29999.50", grossCzk: "29999.50", issuedBy: USER, idempotencyKey: "k1",
      customer: { companyName: "Zákazník a.s.", dic: "CZ25596641" },
      supplier: { companyName: "TEST Logistika s.r.o.", bankAccount: { currency: "CZK" } },
      shipment: { jobNumber: "CZ00000028", jobYear: 2026, containerNumber: "MSCU1234567" },
    });
    expect(lines).toHaveLength(2);
    expect(inv.number).toBe("INV2026CZ00000028-001");
    // the PDF is rendered from the stored snapshot and kept as the official copy
    expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^00000000-0000-0000-0000-000000000001\/INV2026CZ00000028-001-.+\.pdf$/), expect.any(Buffer), { contentType: "application/pdf" });
    expect(repo.setPdfIfMissing).toHaveBeenCalledWith("inv1", COMPANY, expect.any(String), expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(inv.hasPdf).toBe(true);
    // Billing -> Billed and Invoiced, through the shipments service (audited there)
    expect(clients.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: SHIPMENT, invoicingStatus: "Invoiced", status: "Billed [IMP]"  }, { authData: expect.objectContaining({ appWrite: true }) });
    expect(clients.invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: CUSTOMER, invoiceNumber: "INV2026CZ00000028-001", amount: 29999.5, currency: "CZK", status: "Open" }),
      { authData: { userID: USER, companyID: COMPANY, role: "user" } },
    );
    // Both follow-ups were written with the invoice (its transaction) and are sent.
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.rows.map((r) => [r.kind, r.status])).toEqual([["customer_invoice", "sent"], ["status_after_issue", "sent"]]);
  });

  it("addresses the invoice to the customer's billing address instead of its seat, and keeps the seat's country for VAT", async () => {
    clients.customerGet.mockResolvedValue({ customer: { ...customer, country: "JP", dic: "", registeredAddress: "Studio Ghibli, 184-0002 Tokyo", city: "Tokyo" } });
    clients.addressList.mockResolvedValue({
      data: [
        { id: "addr-seat", types: ["Registered"], label: "", street: "Studio Ghibli", city: "Tokyo", postalCode: "184-0002", country: "JP" },
        { id: "addr-bill", types: ["Billing", "Paperwork"], label: "Accounts payable", street: "Shinjuku 3-1", city: "Tokyo", postalCode: "160-0022", country: "JP" },
      ],
    });
    const preview = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(preview.billingAddress).toBe(true);
    expect(preview.customer).toMatchObject({ address: "Shinjuku 3-1", postalCode: "160-0022", city: "Tokyo", country: "JP" });
    // A Japanese customer: outside the scope of Czech VAT, whatever the job's direction.
    expect(preview.lines.map((l) => l.vatCode)).toEqual(["OUT", "OUT"]);
    expect(preview.vat).toBe(0);
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    const [, header] = repo.issue.mock.calls[0]!;
    expect(header).toMatchObject({
      customer: { address: "Studio Ghibli, 184-0002 Tokyo", country: "JP", billingAddress: { label: "Accounts payable", street: "Shinjuku 3-1", postalCode: "160-0022" } },
    });
  });

  it("takes the VAT default from the seat's country, not the billing address's", async () => {
    // A Japanese company billed through a Czech office: still outside the scope of Czech VAT.
    clients.customerGet.mockResolvedValue({ customer: { ...customer, country: "JP", dic: "" } });
    clients.addressList.mockResolvedValue({ data: [{ id: "addr-bill", types: ["Billing"], label: "", street: "Václavské nám. 1", city: "Praha", postalCode: "110 00", country: "CZ" }] });
    const preview = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(preview.customer).toMatchObject({ country: "CZ" });
    expect(preview.lines.map((l) => l.vatCode)).toEqual(["OUT", "OUT"]);
  });

  it("names the quote the billed rows were copied from, ahead of the one copied last", async () => {
    selling.listByShipmentId.mockResolvedValue([
      sellRow({ sourceQuoteNumber: "QCZ20261011004-2" }),
      sellRow({ id: "s2", category: "THC Destination", amount: "4999.50", currency: "CZK", sourceQuoteNumber: "" }),
    ]);
    settings.getByShipmentId.mockResolvedValue({ billingCurrency: "CZK", quoteRef: "QCZ20261110003" });
    expect((await invoiceDocumentService.preview(SHIPMENT, COMPANY, {})).quoteNumber).toBe("QCZ20261011004-2");
  });

  it("refuses to issue when the customer's addresses cannot be read, rather than send the invoice to the seat", async () => {
    clients.addressList.mockRejectedValue(new Error("customers is down"));
    const preview = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(preview.problems).toContain("The customer's billing address could not be read — try again");
  });

  it("names the quote the prices come from and the route on the issued invoice, and shows the issuer before issuing", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, pol: "Shanghai (CNSHA)", pod: "", destination: "Praha", salesNumber: "QCZ20261011004" } });
    settings.getByShipmentId.mockResolvedValue({ billingCurrency: "CZK", quoteRef: "QCZ20261011004-2" });
    const preview = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(preview).toMatchObject({
      quoteNumber: "QCZ20261011004-2", routeFrom: "Shanghai (CNSHA)", routeTo: "Praha",
      issuer: { companyName: "TEST Logistika s.r.o.", ico: "12345679" }, bankAccount: { currency: "CZK", accountNumber: "1/0800" },
    });
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    const [, header] = repo.issue.mock.calls[0]!;
    expect(header).toMatchObject({ shipment: { quoteNumber: "QCZ20261011004-2", routeFrom: "Shanghai (CNSHA)", routeTo: "Praha" } });
  });

  it("numbers the invoice by the reference Shipments marks final under the shipment's write turn - with the letters an edit gave it meanwhile", async () => {
    // Read as CZ00000028 when the invoice was prepared; a Load Type edit made it CZFCL… since.
    clients.shipmentReferenceFinal.mockResolvedValue({ jobNumber: "CZFCL00000028" });
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(clients.shipmentReferenceFinal).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
    const [prefix, header] = repo.issue.mock.calls[0]!;
    expect(prefix).toBe("INV2026CZFCL00000028-");
    expect(header).toMatchObject({ shipment: { jobNumber: "CZFCL00000028" } });
    expect(inv.number).toBe("INV2026CZFCL00000028-001");
    // Marked final before the number is taken.
    expect(clients.shipmentReferenceFinal.mock.invocationCallOrder[0]).toBeLessThan(repo.issue.mock.invocationCallOrder[0]!);
  });

  it("leaves the reference as it is when the invoice is refused before it is numbered", async () => {
    profiles.getByCompany.mockResolvedValue(null);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoicing details/);
    expect(clients.shipmentReferenceFinal).not.toHaveBeenCalled();
  });

  it("refuses to issue on a stale rate when the ČNB fixing of the tax date was not imported", async () => {
    fxClient.fxRatesOn.mockResolvedValue({ ...cnb, missing: true });
    const preview = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(preview.problems).toContainEqual(expect.stringMatching(/have not been imported yet/));
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/have not been imported yet/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("refuses to issue an invoice for a deleted shipment, before anything is numbered", async () => {
    const { APIError } = await import("encore.dev/api");
    clients.shipmentGet.mockRejectedValue(APIError.notFound("Shipment not found"));
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" })).rejects.toMatchObject({ code: "not_found" });
    expect(clients.shipmentReferenceFinal).not.toHaveBeenCalled();
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("refuses to issue while anything is missing", async () => {
    profiles.getByCompany.mockResolvedValue(null);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoicing details/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("refuses to issue another total than the one the user confirmed, and issues the one confirmed", async () => {
    // The preview said 29 999,50 CZK; a line ticked since makes it 4 999,50.
    selling.listByShipmentId.mockResolvedValue([sellRow({ invoice: false }), sellRow({ id: "s2", category: "THC Destination", amount: "4999.50", currency: "CZK" })]);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { expectedGross: 29999.5 })).rejects.toThrow(/changed since you checked it/);
    expect(clients.shipmentReferenceFinal).not.toHaveBeenCalled();
    expect(repo.issue).not.toHaveBeenCalled();
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { expectedGross: 4999.5 });
    expect(repo.issue).toHaveBeenCalledTimes(1);
  });

  const issuedEarlier = {
    id: "inv0", kind: "invoice", shipmentId: SHIPMENT, number: "INV2026CZ00000028-001", shipment: { jobNumber: "CZ00000028" },
    supplier: profile, customer, createdAt: new Date(), pdfKey: "",
  };

  it("returns the invoice already issued for the same idempotency key", async () => {
    repo.getByIdempotencyKey.mockResolvedValue(issuedEarlier);
    repo.getLines.mockResolvedValue([]);
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    expect(inv.number).toBe("INV2026CZ00000028-001");
    expect(repo.issue).not.toHaveBeenCalled();
    expect(clients.invoiceCreate).not.toHaveBeenCalled();
  });

  it("refuses a key that was used for another shipment's invoice or for a credit note", async () => {
    repo.getByIdempotencyKey.mockResolvedValue({ ...issuedEarlier, shipmentId: "other" });
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" })).rejects.toThrow(/another document/);
    repo.getByIdempotencyKey.mockResolvedValue({ ...issuedEarlier, kind: "credit_note" });
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" })).rejects.toThrow(/another document/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("returns the winner when a retry with the same key raced this one", async () => {
    repo.getByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(issuedEarlier);
    repo.getLines.mockResolvedValue([]);
    // what drizzle throws for the unique key on (company, idempotency_key)
    repo.issue.mockRejectedValue(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    expect(inv.id).toBe("inv0");
  });

  it("answers the invoice of a double click's first request, found under the series lock, instead of refusing its rows", async () => {
    repo.getLines.mockResolvedValue([]);
    // Both clicks found no document for the key; the second waited for the lock while the first issued.
    repo.issue.mockImplementation(async () => ({ invoice: issuedEarlier, lines: [], replayed: true }));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    expect(inv.id).toBe("inv0");
    expect(repo.issue.mock.calls[0]![1]).toMatchObject({ idempotencyKey: "k1" });
    // Nothing is owed or stored twice for it.
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("refuses a key found under the lock on another shipment's invoice", async () => {
    repo.issue.mockImplementation(async () => ({ invoice: { ...issuedEarlier, shipmentId: "other" }, lines: [], replayed: true }));
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" })).rejects.toThrow(/another document/);
  });

  it("answers the first request's invoice when the repeat was refused because that request billed the rows", async () => {
    // Issued while the repeat was being prepared: its rows are invoiced by the time the repeat checks them.
    repo.getByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(issuedEarlier);
    repo.getLines.mockResolvedValue([]);
    repo.issue.mockRejectedValue(new Error("Some of these selling rows were invoiced a moment ago — reload and check the invoice"));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    expect(inv.id).toBe("inv0");
  });

  it("still refuses rows invoiced a moment ago by another request, without a key or with a key nobody used", async () => {
    repo.issue.mockRejectedValue(new Error("Some of these selling rows were invoiced a moment ago — reload and check the invoice"));
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoiced a moment ago/);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k-new" })).rejects.toThrow(/invoiced a moment ago/);
  });

  it("does not bill a selling row that is on an open invoice already", async () => {
    repo.invoicedSellingRowIds.mockResolvedValue(new Set(["s1"]));
    await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    const [, header, lines] = repo.issue.mock.calls[0]!;
    expect(lines.map((l: { sourceSellingCostId: string }) => l.sourceSellingCostId)).toEqual(["s2"]);
    expect(header).toMatchObject({ gross: "4999.50" });
  });

  it("says so when every ticked row is invoiced already", async () => {
    repo.invoicedSellingRowIds.mockResolvedValue(new Set(["s1", "s2"]));
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoiced already/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("re-checks under the series lock and refuses rows another invoice took a moment ago", async () => {
    // free when the invoice was prepared, taken by the time the lock is held
    repo.invoicedSellingRowIds.mockResolvedValueOnce(new Set()).mockResolvedValueOnce(new Set(["s2"]));
    repo.issue.mockImplementation(async (_p: string, _h: unknown, _l: unknown, hooks?: { beforeInsert?: (tx: unknown) => Promise<void> }) => {
      await hooks?.beforeInsert?.({ tx: true });
      return { invoice: {}, lines: [] };
    });
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoiced a moment ago/);
    expect(repo.invoicedSellingRowIds).toHaveBeenLastCalledWith(SHIPMENT, COMPANY, { tx: true });
    expect(clients.invoiceCreate).not.toHaveBeenCalled();
  });

  it("refuses a row saved while the invoice was being prepared, so it isn't billed with its old values", async () => {
    repo.invoicedSellingRowIds.mockResolvedValue(new Set());
    // s1 was saved after the invoice read it: under the lock it is newer than what the lines were built from.
    trucking.liveSellingVersions.mockImplementationOnce(async (_tx, _c, _s, ids: string[]) => new Map(ids.map((id) => [id, id === "s1" ? SAVED.getTime() + 1000 : SAVED.getTime()])));
    repo.issue.mockImplementation(async (_p: string, _h: unknown, _l: unknown, hooks?: { beforeInsert?: (tx: unknown) => Promise<void> }) => {
      await hooks?.beforeInsert?.({ tx: true });
      return { invoice: {}, lines: [] };
    });
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/changed a moment ago/);
    expect(clients.invoiceCreate).not.toHaveBeenCalled();
  });

  it("waits for a running Trucking push and refuses rows the push replaced meanwhile", async () => {
    repo.invoicedSellingRowIds.mockResolvedValue(new Set());
    // the push soft-deleted s2 and wrote a new row while this invoice was being prepared
    trucking.liveSellingVersions.mockImplementationOnce(async (_tx, _c, _s, ids: string[]) => new Map(ids.filter((id) => id !== "s2").map((id) => [id, SAVED.getTime()])));
    repo.issue.mockImplementation(async (_p: string, _h: unknown, _l: unknown, hooks?: { beforeInsert?: (tx: unknown) => Promise<void> }) => {
      await hooks?.beforeInsert?.({ tx: true });
      return { invoice: {}, lines: [] };
    });
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/changed a moment ago/);
    expect(trucking.lock).toHaveBeenCalledWith({ tx: true }, SHIPMENT);
    expect(clients.invoiceCreate).not.toHaveBeenCalled();
  });

  it("still issues when the PDF cannot be stored", async () => {
    bucket.upload.mockRejectedValue(new Error("storage down"));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
    expect(inv.hasPdf).toBe(false);
  });

  it("still issues when the shipment statuses cannot be updated, and keeps them owed", async () => {
    clients.shipmentUpdate.mockRejectedValue(Object.assign(new Error("shipments down"), { code: "unavailable" }));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
    // Sent again by the followups cron, not lost.
    expect(outbox.rows.map((r) => [r.kind, r.status])).toEqual([["customer_invoice", "sent"], ["status_after_issue", "retry"]]);
  });

  it("still issues when posting to the customer's list fails, and keeps it owed", async () => {
    clients.invoiceCreate.mockRejectedValue(Object.assign(new Error("customers down"), { code: "unavailable" }));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
    expect(outbox.rows.map((r) => [r.kind, r.status])).toEqual([["customer_invoice", "retry"], ["status_after_issue", "sent"]]);
  });
});

describe("shipmentsEverInvoiced", () => {
  const A = "00000000-0000-0000-0000-0000000000a1";
  const B = "00000000-0000-0000-0000-0000000000b1";
  const C = "00000000-0000-0000-0000-0000000000c1";

  it("counts the invoices issued here and the old generator's, each shipment once, in the caller's company", async () => {
    repo.shipmentIdsWithInvoices.mockResolvedValue([A, B]);
    generated.shipmentIdsWithInvoices.mockResolvedValue([B, C]);
    await expect(invoiceDocumentService.shipmentsEverInvoiced([A, B, C, "not-an-id"], COMPANY)).resolves.toEqual([A, B, C]);
    // What is no id is never asked about.
    expect(repo.shipmentIdsWithInvoices).toHaveBeenCalledWith([A, B, C], COMPANY);
    expect(generated.shipmentIdsWithInvoices).toHaveBeenCalledWith([A, B, C], COMPANY);
  });
});

describe("shipmentsWithOpenInvoices", () => {
  const A = "00000000-0000-0000-0000-0000000000a1";
  const B = "00000000-0000-0000-0000-0000000000b1";

  it("answers, for several jobs at once, those with an issued, not credited invoice in the caller's company", async () => {
    repo.billedShipmentIds.mockResolvedValue(new Set([B]));
    await expect(invoiceDocumentService.shipmentsWithOpenInvoices([A, B, "not-an-id"], COMPANY)).resolves.toEqual([B]);
    expect(repo.billedShipmentIds).toHaveBeenCalledWith([A, B], COMPANY);
  });
});

describe("credit", () => {
  const original = {
    id: "inv1", kind: "invoice", status: "issued", number: "INV2026CZ00000028-001", shipmentId: SHIPMENT, customerId: CUSTOMER,
    currency: "EUR", fxRate: "25.000000", fxWeek: "2026-W42", supplier: { ...profile, bankAccount: null }, customer,
    shipment: { jobNumber: "CZ00000028", jobYear: 2026 },
    net: "100.00", vat: "21.00", gross: "121.00", netCzk: "2500.00", vatCzk: "525.00", grossCzk: "3025.00",
    vatSummary: [{ vatCode: "S21", vatRate: 21, base: 100, vat: 21, baseCzk: 2500, vatCzk: 525 }],
  };
  const line = { description: "Customs clearance", qty: "1.00", unitPrice: "100.00", unitCurrency: "EUR", net: "100.00", vatCode: "S21", vatRate: "21.00", sourceSellingCostId: "s1" };

  it("reverses the whole invoice as CN + job year + job number and marks the original credited", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, status: "Billed [IMP]", invoicingStatus: "Invoiced" } });
    repo.countOpenInvoices.mockResolvedValue(0);
    repo.getByIdForCompany.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    repo.markCredited.mockResolvedValue(true);
    repo.issue.mockImplementation(async (prefix: string, header: Record<string, unknown>, lines: Record<string, unknown>[], hooks?: { afterInsert?: (tx: unknown, invoice: unknown) => Promise<void> }) => {
      const invoice = { ...header, id: "cn1", number: `${prefix}001`, pdfKey: "", createdAt: new Date() };
      await hooks?.afterInsert?.({}, invoice);
      return { invoice, lines };
    });

    const cn = await invoiceDocumentService.credit("inv1", COMPANY, USER, "Wrong customer");
    const [prefix, header, lines] = repo.issue.mock.calls[0]!;
    expect(prefix).toBe("CN2026CZ00000028-");
    expect(header).toMatchObject({
      kind: "credit_note", correctsInvoiceId: "inv1", creditReason: "Wrong customer", currency: "EUR",
      net: "-100.00", vat: "-21.00", gross: "-121.00", netCzk: "-2500.00", vatCzk: "-525.00", grossCzk: "-3025.00",
    });
    expect(lines[0]).toMatchObject({ qty: "-1.00", net: "-100.00", vatCode: "S21" });
    expect(header).toMatchObject({ vatSummary: [{ vatCode: "S21", base: -100, vat: -21, baseCzk: -2500, vatCzk: -525 }] });
    expect(repo.markCredited).toHaveBeenCalledWith({}, "inv1", COMPANY);
    expect(cn.number).toBe("CN2026CZ00000028-001");
    // the credit note and the invoice it reverses stop counting as owed
    expect(clients.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: "CN2026CZ00000028-001", status: "Credited" }), expect.anything());
    expect(clients.invoiceMarkCredited).toHaveBeenCalledWith({ invoiceNumbers: ["INV2026CZ00000028-001"] }, expect.anything());
    // Each follow-up is a row of its own: the Credited mark is sent even when the list entry is not.
    expect(outbox.rows.map((r) => r.kind)).toEqual(["customer_invoice", "mark_credited", "status_after_credit"]);
    // no open invoice left: the job goes back to Billing / Not Invoiced
    expect(clients.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: SHIPMENT, invoicingStatus: "Not Invoiced", status: "Billing [IMP]"  }, { authData: expect.objectContaining({ appWrite: true }) });
  });

  it("marks the original Credited even when the credit note can't go into the customer's list", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, status: "Billed [IMP]", invoicingStatus: "Invoiced" } });
    repo.countOpenInvoices.mockResolvedValue(0);
    repo.getByIdForCompany.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    repo.markCredited.mockResolvedValue(true);
    // The customer was deleted meanwhile: its list refuses the credit note for good.
    clients.invoiceCreate.mockRejectedValue(Object.assign(new Error("customer gone"), { code: "failed_precondition" }));
    await invoiceDocumentService.credit("inv1", COMPANY, USER, "Wrong customer");
    expect(clients.invoiceMarkCredited).toHaveBeenCalledWith({ invoiceNumbers: ["INV2026CZ00000028-001"] }, expect.anything());
    expect(outbox.rows.map((r) => [r.kind, r.status])).toEqual([["customer_invoice", "failed"], ["mark_credited", "sent"], ["status_after_credit", "sent"]]);
  });

  it("answers the credit note of a double click's first request, found under the series lock", async () => {
    repo.getByIdForCompany.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    const earlierCn = { ...original, id: "cn0", kind: "credit_note", number: "CN2026CZ00000028-001", correctsInvoiceId: "inv1", creditReason: "x", createdAt: new Date(), pdfKey: "" };
    repo.issue.mockImplementation(async () => ({ invoice: earlierCn, lines: [], replayed: true }));
    const cn = await invoiceDocumentService.credit("inv1", COMPANY, USER, "x", "k1");
    expect(cn.id).toBe("cn0");
    expect(repo.markCredited).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("refuses a key that was used for issuing an invoice", async () => {
    repo.getByIdempotencyKey.mockResolvedValue({ ...original, kind: "invoice" });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x", "k1")).rejects.toThrow(/another document/);
  });

  it("needs a reason and an invoice that is not credited yet", async () => {
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "  ")).rejects.toThrow(/reason/);
    repo.getByIdForCompany.mockResolvedValue({ ...original, status: "credited" });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/already been credited/);
    repo.getByIdForCompany.mockResolvedValue({ ...original, kind: "credit_note" });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/cannot be credited/);
  });

  it("rolls back when another credit note got there first", async () => {
    repo.getByIdForCompany.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    repo.markCredited.mockResolvedValue(false);
    repo.issue.mockImplementation(async (_p: string, _h: unknown, _l: unknown, hooks?: { afterInsert?: (tx: unknown, invoice: unknown) => Promise<void> }) => {
      await hooks?.afterInsert?.({}, { id: "cn1" });
      return { invoice: {}, lines: [] };
    });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/already been credited/);
  });
});

describe("pdf", () => {
  const stored = { id: "inv1", number: "INV2026CZ00000028-001", pdfKey: "c/INV2026CZ00000028-001-x.pdf", correctsInvoiceId: null };

  it("returns the stored copy", async () => {
    repo.getByIdForCompany.mockResolvedValue(stored);
    bucket.download.mockResolvedValue(Buffer.from("%PDF-stored"));
    const f = await invoiceDocumentService.pdf("inv1", COMPANY);
    expect(f.fileName).toBe("INV2026CZ00000028-001.pdf");
    expect(Buffer.from(f.contentBase64, "base64").toString()).toBe("%PDF-stored");
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it("makes and stores the PDF when issuing could not", async () => {
    repo.getByIdForCompany.mockResolvedValue({ ...stored, pdfKey: "", supplier: profile, customer, shipment: {} });
    repo.getLines.mockResolvedValue([]);
    const f = await invoiceDocumentService.pdf("inv1", COMPANY);
    expect(Buffer.from(f.contentBase64, "base64").toString()).toBe("%PDF-test");
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(repo.setPdfIfMissing).toHaveBeenCalledTimes(1);
  });

  it("keeps the first stored file when two requests race", async () => {
    repo.getByIdForCompany
      .mockResolvedValueOnce({ ...stored, pdfKey: "", supplier: profile, customer, shipment: {} })
      .mockResolvedValueOnce({ ...stored, pdfKey: "c/first.pdf" });
    repo.getLines.mockResolvedValue([]);
    repo.setPdfIfMissing.mockResolvedValue(false);
    bucket.download.mockResolvedValue(Buffer.from("%PDF-first"));
    const f = await invoiceDocumentService.pdf("inv1", COMPANY);
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.download).toHaveBeenCalledWith("c/first.pdf");
    expect(Buffer.from(f.contentBase64, "base64").toString()).toBe("%PDF-first");
  });

  it("is scoped to the company", async () => {
    repo.getByIdForCompany.mockResolvedValue(null);
    await expect(invoiceDocumentService.pdf("inv1", COMPANY)).rejects.toThrow(/not found/);
  });
});

describe("queue", () => {
  const listed = (over: Record<string, unknown>) => ({
    id: SHIPMENT, jobNumber: "CZ00000028", customer: "Alza.cz a.s.", shipper: "S", consignee: "C", tradeDirection: "Export",
    estimatedDeparture: "04/07/26", estimatedArrival: null, status: "Billing [EXP]", invoicingStatus: "Not Invoiced",
    customerId: "cust1", department: "Operation Department", houseBolType: "", masterBolType: "OBL", ...over,
  });

  // Counts per list filter, and two shipments for any listing.
  const mockQueue = () => {
    clients.shipmentList.mockImplementation(async (req: { invoicing: string; limit: number; sortDirection?: string }) => {
      if (req.limit === 1) return { pagination: { total: { all: 6, billing: 2, "not-invoiced": 5, invoiced: 1 }[req.invoicing] }, data: [] };
      const oldestFirst = [listed({}), listed({ id: "s2", jobNumber: "CZ00000030" })];
      return { pagination: { total: 2 }, data: req.sortDirection === "desc" ? oldestFirst.reverse() : oldestFirst };
    });
    selling.listLiveByShipments.mockResolvedValue([{ id: "r1", shipmentId: SHIPMENT, qty: "1.00", amount: "1000.00", currency: "EUR", invoice: true }]);
    repo.listOpenInvoicesWithSources.mockResolvedValue([]);
    settings.listByShipments.mockResolvedValue([{ shipmentId: SHIPMENT, billingCurrency: "CZK" }]);
  };

  it("lists the shipments of the view and adds the amount still to bill from the selling lines", async () => {
    mockQueue();

    const r = await invoiceDocumentService.queue(COMPANY, "to_bill");
    expect(clients.shipmentList).toHaveBeenCalledWith(expect.objectContaining({ invoicing: "billing", limit: 200, offset: 0, sortDirection: "desc" }));
    expect(r.counts).toEqual({ all: 6, toBill: 2, notInvoiced: 5, invoiced: 1 });
    expect(r.truncated).toBe(false);
    expect(r.queue.map((x) => [x.jobNumber, x.shipmentStatus, x.billingState, x.amountToBill])).toEqual([
      ["CZ00000028", "Billing [EXP]", "to_bill", 25000],
      // a Billing job without selling lines is still listed, flagged as having none
      ["CZ00000030", "Billing [EXP]", "none", 0],
    ]);
    expect(r.queue[0]).toMatchObject({ customerId: "cust1", department: "Operation Department", houseBolType: "", masterBolType: "OBL" });
    // Only the listed shipments' selling rows, open invoices and settings are read, not the company's every one.
    for (const read of [selling.listLiveByShipments, repo.listOpenInvoicesWithSources, settings.listByShipments]) {
      expect(read).toHaveBeenCalledWith([SHIPMENT, "s2"], COMPANY);
    }
  });

  it("the All shipments view lists every shipment but cancelled ones through the list filter 'all'", async () => {
    mockQueue();

    const r = await invoiceDocumentService.queue(COMPANY, "all");
    expect(clients.shipmentList).toHaveBeenCalledWith(expect.objectContaining({ invoicing: "all", limit: 200, offset: 0, sortDirection: "desc" }));
    expect(r.counts.all).toBe(6);
  });

  it("a shipment without department / BoL types / customer record maps to empty values", async () => {
    mockQueue();
    clients.shipmentList.mockImplementation(async (req: { limit: number }) =>
      req.limit === 1
        ? { pagination: { total: 1 }, data: [] }
        : { pagination: { total: 1 }, data: [listed({ customerId: undefined, department: undefined, houseBolType: undefined, masterBolType: undefined })] },
    );

    const r = await invoiceDocumentService.queue(COMPANY, "all");
    expect(r.queue[0]).toMatchObject({ customerId: null, department: "", houseBolType: "", masterBolType: "" });
  });

  it("past its limit leaves out the oldest jobs, never the newest, and says so", async () => {
    // 1,200 jobs; the list endpoint pages them 200 at a time, newest (highest number) first.
    const all = Array.from({ length: 1200 }, (_, n) => listed({ id: `s${n}`, jobNumber: `CZ${String(n).padStart(8, "0")}` }));
    clients.shipmentList.mockImplementation(async (req: { limit: number; offset?: number; sortDirection?: string }) => {
      if (req.limit === 1) return { pagination: { total: 1200 }, data: [] };
      const ordered = req.sortDirection === "desc" ? [...all].reverse() : all;
      return { pagination: { total: 1200 }, data: ordered.slice(req.offset ?? 0, (req.offset ?? 0) + req.limit) };
    });
    selling.listLiveByShipments.mockResolvedValue([]);
    repo.listOpenInvoicesWithSources.mockResolvedValue([]);
    settings.listByShipments.mockResolvedValue([]);

    const r = await invoiceDocumentService.queue(COMPANY, "not_invoiced");
    expect(r.truncated).toBe(true);
    expect(r.queue).toHaveLength(1000);
    expect(r.queue.map((x) => x.jobNumber)).toContain("CZ00001199");
    expect(r.queue.map((x) => x.jobNumber)).not.toContain("CZ00000000");
    // still shown oldest first
    expect(r.queue[0]!.jobNumber).toBe("CZ00000200");
  });
});
