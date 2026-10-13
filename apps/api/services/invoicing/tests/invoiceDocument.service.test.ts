import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  issue: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  getById: vi.fn(),
  getLines: vi.fn(),
  listByShipment: vi.fn(),
  markCredited: vi.fn(),
  setPdfIfMissing: vi.fn(),
}));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
const pdf = vi.hoisted(() => ({ render: vi.fn() }));
const profiles = vi.hoisted(() => ({ getByCompany: vi.fn() }));
const selling = vi.hoisted(() => ({ listByShipmentId: vi.fn() }));
const settings = vi.hoisted(() => ({ getByShipmentId: vi.fn() }));
const rates = vi.hoisted(() => ({ listByCompany: vi.fn() }));
const clients = vi.hoisted(() => ({ shipmentGet: vi.fn(), customerGet: vi.fn(), invoiceCreate: vi.fn() }));

vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: repo }));
vi.mock("../repositories/invoiceProfile.repository", () => ({ invoiceProfileRepository: profiles }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: settings }));
vi.mock("../repositories/exchangeRate.repository", () => ({ exchangeRateRepository: rates }));
vi.mock("~encore/clients", () => ({
  shipments: { shipmentGet: clients.shipmentGet },
  customers: { customerGet: clients.customerGet, invoiceCreate: clients.invoiceCreate },
}));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn() } }));
vi.mock("../storage/invoiceBucket", () => ({ invoiceBucket: bucket }));
vi.mock("../lib/pdfFonts", () => ({ loadPdfFonts: async () => ({ regular: new Uint8Array(), bold: new Uint8Array() }) }));
vi.mock("../lib/invoicePdf", () => ({ renderInvoicePdf: pdf.render }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    failedPrecondition: (msg: string) => new Error(msg),
    internal: (msg: string) => new Error(msg),
  },
}));

import { invoiceDocumentService, pragueToday } from "../services/invoiceDocument.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-0000000000u1";
const SHIPMENT = "00000000-0000-0000-0000-0000000000aa";
const CUSTOMER = "00000000-0000-0000-0000-0000000000cc";

const shipment = {
  id: SHIPMENT, jobNumber: "CZ00000028", createdAt: "2026-04-02T09:00:00.000Z", tradeDirection: "Import",
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
const rateRow = { week: "2026-W42", validFrom: "2026-10-12", validTo: "2026-10-18", rateEur: "25.0000", rateUsd: "22.0000" };
const sellRow = (over: Record<string, unknown>) => ({
  id: "s1", category: "Ocean freight", qty: "1.00", amount: "1000.00", currency: "EUR", invoice: true, vatCode: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  clients.shipmentGet.mockResolvedValue({ shipment });
  clients.customerGet.mockResolvedValue({ customer });
  clients.invoiceCreate.mockResolvedValue({});
  profiles.getByCompany.mockResolvedValue(profile);
  selling.listByShipmentId.mockResolvedValue([sellRow({}), sellRow({ id: "s2", category: "THC Destination", amount: "4999.50", currency: "CZK" })]);
  settings.getByShipmentId.mockResolvedValue({ billingCurrency: "CZK" });
  rates.listByCompany.mockResolvedValue([rateRow]);
  repo.getByIdempotencyKey.mockResolvedValue(null);
  repo.setPdfIfMissing.mockResolvedValue(true);
  bucket.upload.mockResolvedValue(undefined);
  bucket.remove.mockResolvedValue(undefined);
  pdf.render.mockResolvedValue(new TextEncoder().encode("%PDF-test"));
  repo.issue.mockImplementation(async (prefix: string, header: Record<string, unknown>, lines: Record<string, unknown>[]) => ({
    invoice: { ...header, id: "inv1", number: `${prefix}001`, correctsInvoiceId: header.correctsInvoiceId ?? null, creditReason: header.creditReason ?? "", pdfKey: "", createdAt: new Date("2026-10-13T10:00:00Z") },
    lines: lines.map((l) => ({ ...l, sourceSellingCostId: l.sourceSellingCostId ?? null })),
  }));
});

describe("preview", () => {
  it("computes the invoice from stored data, with DUZP = ETA for an import", async () => {
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.problems).toEqual([]);
    expect(p).toMatchObject({ duzp: "2026-10-14", currency: "CZK", fxWeek: "2026-W42", gross: 29999.5, grossCzk: 29999.5, customerId: CUSTOMER });
    expect(p.lines.map((l) => [l.description, l.net, l.vatCode])).toEqual([
      ["Ocean freight", "25000.00", "Z69"],
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
      "No exchange rate for GBP — add it on the Exchange page",
      "Tick at least one selling row for Invoice",
    ]);
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
    expect(clients.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      customerId: CUSTOMER, invoiceNumber: "INV2026CZ00000028-001", amount: 29999.5, currency: "CZK", status: "Open",
    }));
  });

  it("refuses to issue while anything is missing", async () => {
    profiles.getByCompany.mockResolvedValue(null);
    await expect(invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {})).rejects.toThrow(/invoicing details/);
    expect(repo.issue).not.toHaveBeenCalled();
  });

  it("returns the invoice already issued for the same idempotency key", async () => {
    repo.getByIdempotencyKey.mockResolvedValue({
      id: "inv0", number: "INV2026CZ00000028-001", shipment: { jobNumber: "CZ00000028" }, supplier: profile, customer,
      createdAt: new Date(), pdfKey: "",
    });
    repo.getLines.mockResolvedValue([]);
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, { idempotencyKey: "k1" });
    expect(inv.number).toBe("INV2026CZ00000028-001");
    expect(repo.issue).not.toHaveBeenCalled();
    expect(clients.invoiceCreate).not.toHaveBeenCalled();
  });

  it("still issues when the PDF cannot be stored", async () => {
    bucket.upload.mockRejectedValue(new Error("storage down"));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
    expect(inv.hasPdf).toBe(false);
  });

  it("still issues when posting to the customer's list fails", async () => {
    clients.invoiceCreate.mockRejectedValue(new Error("customers down"));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
  });
});

describe("credit", () => {
  const original = {
    id: "inv1", kind: "invoice", status: "issued", number: "INV2026CZ00000028-001", shipmentId: SHIPMENT, customerId: CUSTOMER,
    currency: "EUR", fxRate: "25.000000", fxWeek: "2026-W42", supplier: { ...profile, bankAccount: null }, customer,
    shipment: { jobNumber: "CZ00000028", jobYear: 2026 },
  };
  const line = { description: "Customs clearance", qty: "1.00", unitPrice: "100.00", unitCurrency: "EUR", net: "100.00", vatCode: "S21", vatRate: "21.00", sourceSellingCostId: "s1" };

  it("reverses the whole invoice as CN + job year + job number and marks the original credited", async () => {
    repo.getById.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    repo.markCredited.mockResolvedValue(true);
    repo.issue.mockImplementation(async (prefix: string, header: Record<string, unknown>, lines: Record<string, unknown>[], after?: (tx: unknown, id: string) => Promise<void>) => {
      await after?.({}, "cn1");
      return { invoice: { ...header, id: "cn1", number: `${prefix}001`, pdfKey: "", createdAt: new Date() }, lines };
    });

    const cn = await invoiceDocumentService.credit("inv1", COMPANY, USER, "Wrong customer");
    const [prefix, header, lines] = repo.issue.mock.calls[0]!;
    expect(prefix).toBe("CN2026CZ00000028-");
    expect(header).toMatchObject({
      kind: "credit_note", correctsInvoiceId: "inv1", creditReason: "Wrong customer", currency: "EUR",
      net: "-100.00", vat: "-21.00", gross: "-121.00", netCzk: "-2500.00", vatCzk: "-525.00", grossCzk: "-3025.00",
    });
    expect(lines[0]).toMatchObject({ qty: "-1.00", net: "-100.00", vatCode: "S21" });
    expect(repo.markCredited).toHaveBeenCalledWith({}, "inv1", COMPANY);
    expect(cn.number).toBe("CN2026CZ00000028-001");
  });

  it("needs a reason and an invoice that is not credited yet", async () => {
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "  ")).rejects.toThrow(/reason/);
    repo.getById.mockResolvedValue({ ...original, status: "credited" });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/already been credited/);
    repo.getById.mockResolvedValue({ ...original, kind: "credit_note" });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/cannot be credited/);
  });

  it("rolls back when another credit note got there first", async () => {
    repo.getById.mockResolvedValue(original);
    repo.getLines.mockResolvedValue([line]);
    repo.markCredited.mockResolvedValue(false);
    repo.issue.mockImplementation(async (_p: string, _h: unknown, _l: unknown, after?: (tx: unknown, id: string) => Promise<void>) => {
      await after?.({}, "cn1");
      return { invoice: {}, lines: [] };
    });
    await expect(invoiceDocumentService.credit("inv1", COMPANY, USER, "x")).rejects.toThrow(/already been credited/);
  });
});

describe("pdf", () => {
  const stored = { id: "inv1", number: "INV2026CZ00000028-001", pdfKey: "c/INV2026CZ00000028-001-x.pdf", correctsInvoiceId: null };

  it("returns the stored copy", async () => {
    repo.getById.mockResolvedValue(stored);
    bucket.download.mockResolvedValue(Buffer.from("%PDF-stored"));
    const f = await invoiceDocumentService.pdf("inv1", COMPANY);
    expect(f.fileName).toBe("INV2026CZ00000028-001.pdf");
    expect(Buffer.from(f.contentBase64, "base64").toString()).toBe("%PDF-stored");
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it("makes and stores the PDF when issuing could not", async () => {
    repo.getById.mockResolvedValue({ ...stored, pdfKey: "", supplier: profile, customer, shipment: {} });
    repo.getLines.mockResolvedValue([]);
    const f = await invoiceDocumentService.pdf("inv1", COMPANY);
    expect(Buffer.from(f.contentBase64, "base64").toString()).toBe("%PDF-test");
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(repo.setPdfIfMissing).toHaveBeenCalledTimes(1);
  });

  it("keeps the first stored file when two requests race", async () => {
    repo.getById
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
    repo.getById.mockResolvedValue(null);
    await expect(invoiceDocumentService.pdf("inv1", COMPANY)).rejects.toThrow(/not found/);
  });
});
