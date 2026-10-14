import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  issue: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  getById: vi.fn(),
  getLines: vi.fn(),
  listByShipment: vi.fn(),
  markCredited: vi.fn(),
  setPdfIfMissing: vi.fn(),
  countOpenInvoices: vi.fn(),
  listOpenInvoicesWithSources: vi.fn(),
}));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
const pdf = vi.hoisted(() => ({ render: vi.fn() }));
const profiles = vi.hoisted(() => ({ getByCompany: vi.fn() }));
const selling = vi.hoisted(() => ({ listByShipmentId: vi.fn(), listTickedByCompany: vi.fn() }));
const settings = vi.hoisted(() => ({ getByShipmentId: vi.fn(), listByCompany: vi.fn() }));
const fxClient = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
const clients = vi.hoisted(() => ({
  shipmentGet: vi.fn(), shipmentUpdate: vi.fn(), shipmentList: vi.fn(), customerGet: vi.fn(), invoiceCreate: vi.fn(),
}));

vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: repo }));
vi.mock("../repositories/invoiceProfile.repository", () => ({ invoiceProfileRepository: profiles }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: settings }));
vi.mock("~encore/clients", () => ({
  shipments: { shipmentGet: clients.shipmentGet, shipmentUpdate: clients.shipmentUpdate, shipmentList: clients.shipmentList },
  customers: { customerGet: clients.customerGet, invoiceCreate: clients.invoiceCreate },
  fx: fxClient,
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
const cnb = { date: "2026-10-14", fixingDate: "2026-10-13", provisional: false, roePct: 100, rates: [{ currency: "EUR", rate: 25 }, { currency: "USD", rate: 22 }] };
const sellRow = (over: Record<string, unknown>) => ({
  id: "s1", category: "Ocean freight", qty: "1.00", amount: "1000.00", currency: "EUR", invoice: true, vatCode: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  clients.shipmentGet.mockResolvedValue({ shipment });
  clients.customerGet.mockResolvedValue({ customer });
  clients.invoiceCreate.mockResolvedValue({});
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
  repo.issue.mockImplementation(async (prefix: string, header: Record<string, unknown>, lines: Record<string, unknown>[]) => ({
    invoice: { ...header, id: "inv1", number: `${prefix}001`, correctsInvoiceId: header.correctsInvoiceId ?? null, creditReason: header.creditReason ?? "", pdfKey: "", createdAt: new Date("2026-10-13T10:00:00Z") },
    lines: lines.map((l) => ({ ...l, sourceSellingCostId: l.sourceSellingCostId ?? null })),
  }));
});

describe("preview", () => {
  it("computes the invoice from stored data, with DUZP = ETA for an import", async () => {
    const p = await invoiceDocumentService.preview(SHIPMENT, COMPANY, {});
    expect(p.problems).toEqual([]);
    expect(p).toMatchObject({ duzp: "2026-10-14", currency: "CZK", fxFixingDate: "2026-10-13", roePct: 100, gross: 29999.5, grossCzk: 29999.5, customerId: CUSTOMER });
    expect(fxClient.fxRatesOn).toHaveBeenCalledWith({ date: "2026-10-14" });
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
      "ČNB publishes no rate for GBP",
      "Tick at least one selling row for Invoice",
    ]);
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
    expect(clients.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: SHIPMENT, invoicingStatus: "Invoiced", status: "Billed [IMP]" });
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

  it("still issues when the shipment statuses cannot be updated", async () => {
    clients.shipmentUpdate.mockRejectedValue(new Error("shipments down"));
    const inv = await invoiceDocumentService.issue(SHIPMENT, COMPANY, USER, {});
    expect(inv.number).toBe("INV2026CZ00000028-001");
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
    clients.shipmentGet.mockResolvedValue({ shipment: { ...shipment, status: "Billed [IMP]", invoicingStatus: "Invoiced" } });
    repo.countOpenInvoices.mockResolvedValue(0);
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
    // no open invoice left: the job goes back to Billing / Not Invoiced
    expect(clients.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: SHIPMENT, invoicingStatus: "Not Invoiced", status: "Billing [IMP]" });
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

describe("queue", () => {
  const listed = (over: Record<string, unknown>) => ({
    id: SHIPMENT, jobNumber: "CZ00000028", customer: "Alza.cz a.s.", shipper: "S", consignee: "C", tradeDirection: "Export",
    estimatedDeparture: "04/07/26", estimatedArrival: null, status: "Billing [EXP]", invoicingStatus: "Not Invoiced", ...over,
  });

  it("lists the shipments of the view and adds the amount still to bill from the selling lines", async () => {
    clients.shipmentList.mockImplementation(async (req: { invoicing: string; limit: number }) => {
      if (req.limit === 1) return { pagination: { total: { billing: 2, "not-invoiced": 5, invoiced: 1 }[req.invoicing] }, data: [] };
      return { pagination: { total: 2 }, data: [listed({}), listed({ id: "s2", jobNumber: "CZ00000030" })] };
    });
    selling.listTickedByCompany.mockResolvedValue([{ id: "r1", shipmentId: SHIPMENT, qty: "1.00", amount: "1000.00", currency: "EUR" }]);
    repo.listOpenInvoicesWithSources.mockResolvedValue([]);
    settings.listByCompany.mockResolvedValue([{ shipmentId: SHIPMENT, billingCurrency: "CZK" }]);

    const r = await invoiceDocumentService.queue(COMPANY, "to_bill");
    expect(clients.shipmentList).toHaveBeenCalledWith(expect.objectContaining({ invoicing: "billing", limit: 200, offset: 0 }));
    expect(r.counts).toEqual({ toBill: 2, notInvoiced: 5, invoiced: 1 });
    expect(r.truncated).toBe(false);
    expect(r.queue.map((x) => [x.jobNumber, x.shipmentStatus, x.billingState, x.amountToBill])).toEqual([
      ["CZ00000028", "Billing [EXP]", "to_bill", 25000],
      // a Billing job without selling lines is still listed, flagged as having none
      ["CZ00000030", "Billing [EXP]", "none", 0],
    ]);
  });
});
