import { beforeEach, describe, expect, it, vi } from "vitest";

// The Pohoda export run for real (period, what is left out, the record written with the file) against stand-ins for
// its repository and the users.
const repo = vi.hoisted(() => ({
  inExport: vi.fn(),
  issuedIn: vi.fn(),
  numbersOf: vi.fn(),
  linesOf: vi.fn(),
  exportedBefore: vi.fn(),
  record: vi.fn(),
  list: vi.fn(),
  exportById: vi.fn(),
  documentIdsOf: vi.fn(),
}));
vi.mock("../../repositories/accountingExport.repository", () => ({ accountingExportRepository: repo }));
const users = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => users);
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { accountingExportService as service } from "../../services/accountingExport.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const TX = { tx: true };
const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const clerk = { userID: "u-clerk", companyID: COMPANY, role: "user" };

const SUPPLIER = { companyName: "CTO s.r.o.", street: "", city: "", postalCode: "", country: "CZ", ico: "12345678", dic: "CZ12345678", vatPayer: true, registerEntry: "", email: "", phone: "", web: "", logoData: "", footerNote: "", bankAccount: null };
const CUSTOMER = { customerId: "c1", companyName: "Odběratel a.s.", address: "Ulice 1", city: "Brno", country: "CZ", ico: "1", dic: "CZ1", paymentTerms: "14 days" };

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  companyId: COMPANY,
  shipmentId: "s1",
  kind: "invoice",
  status: "issued",
  number: `INV-${id}`,
  correctsInvoiceId: null,
  creditReason: "",
  customerId: "c1",
  issueDate: "2026-11-03",
  duzp: "2026-11-03",
  dueDate: "2026-11-17",
  currency: "CZK",
  fxRate: "1.000000",
  net: "100.00",
  vat: "21.00",
  gross: "121.00",
  netCzk: "100.00",
  vatCzk: "21.00",
  grossCzk: "121.00",
  vatSummary: [{ vatCode: "S21", vatRate: 21, base: 100, vat: 21, baseCzk: 100, vatCzk: 21 }],
  supplier: SUPPLIER,
  customer: CUSTOMER,
  shipment: { jobNumber: "CZ00000007", jobYear: 2026, tradeDirection: "Export", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
  note: "",
  ...over,
});
const lineOf = (invoiceId: string, net = "100.00") => ({ invoiceId, seq: 1, description: "Freight", qty: "1.00", unitPrice: net, unitCurrency: "CZK", net, vatCode: "S21", vatRate: "21.00" });
const creditNote = (id: string, correcting: string) =>
  doc(id, {
    kind: "credit_note",
    number: `CN-${id}`,
    correctsInvoiceId: correcting,
    issueDate: "2026-11-05",
    net: "-100.00",
    vat: "-21.00",
    gross: "-121.00",
    netCzk: "-100.00",
    vatCzk: "-21.00",
    grossCzk: "-121.00",
    vatSummary: [{ vatCode: "S21", vatRate: 21, base: -100, vat: -21, baseCzk: -100, vatCzk: -21 }],
  });

function given(docs: ReturnType<typeof doc>[], exported: Record<string, { exportId: string; fileName: string; at: Date }> = {}, numbers: Record<string, string> = {}) {
  repo.issuedIn.mockResolvedValue(docs);
  repo.linesOf.mockResolvedValue(new Map(docs.map((d) => [d.id, [lineOf(d.id, d.net)]])));
  repo.exportedBefore.mockResolvedValue(new Map(Object.entries(exported)));
  repo.numbersOf.mockResolvedValue(new Map(Object.entries(numbers)));
}

const decoded = (base64: string) => new TextDecoder("windows-1250").decode(Buffer.from(base64, "base64"));

beforeEach(() => {
  vi.clearAllMocks();
  repo.inExport.mockImplementation((_company: string, _system: string, work: (tx: unknown) => Promise<unknown>) => work(TX));
  repo.record.mockImplementation(async (_tx: unknown, values: Record<string, unknown>) => values);
  repo.exportById.mockResolvedValue(null);
  users.userEmailOf.mockResolvedValue("boss@example.com");
});

describe("exportPohoda", () => {
  it("is for managers only, and nothing is read or written for anyone else", async () => {
    await expect(service.exportPohoda(clerk, { from: "2026-11-01", to: "2026-11-30" })).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.inExport).not.toHaveBeenCalled();
    expect(repo.record).not.toHaveBeenCalled();
  });

  it("refuses a period that is not one: missing or impossible days, the first after the last, more than a year, not begun", async () => {
    for (const input of [
      { from: "", to: "2026-11-30" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-11-30", to: "2026-11-01" },
      { from: "2025-01-01", to: "2026-01-02" },
      { from: "2999-01-01", to: "2999-01-31" },
    ]) {
      await expect(service.exportPohoda(manager, input)).rejects.toMatchObject({ code: "invalid_argument" });
    }
    expect(repo.inExport).not.toHaveBeenCalled();
  });

  it("exports the period's documents by issue day, and records the export and each document in the same transaction", async () => {
    given([doc("a"), doc("b", { issueDate: "2026-11-02" })]);
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });

    expect(repo.issuedIn).toHaveBeenCalledWith(TX, COMPANY, "2026-11-01", "2026-11-30", 5001);
    expect(out).toMatchObject({ documents: 2, invoices: 2, creditNotes: 0, numbers: ["INV-b", "INV-a"], skipped: [], fileName: "pohoda-invoices-2026-11-01-2026-11-30.xml", encoding: "windows-1250" });
    expect(repo.record).toHaveBeenCalledTimes(1);
    const [tx, values, ids] = repo.record.mock.calls[0]!;
    expect(tx).toBe(TX);
    expect(values).toMatchObject({ id: out.exportId, companyId: COMPANY, system: "pohoda", fromDate: "2026-11-01", toDate: "2026-11-30", fileName: out.fileName, fileSha256: out.fileSha256, createdByUserId: "u-boss", createdBy: "boss@example.com" });
    expect(ids).toEqual(["b", "a"]);

    const xml = decoded(out.contentBase64);
    expect(xml.startsWith('<?xml version="1.0" encoding="Windows-1250"?>')).toBe(true);
    expect(xml).toContain(`id="ST-${out.exportId}" ico="12345678"`);
    expect(xml).toContain("<typ:company>Odběratel a.s.</typ:company>");
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(Buffer.from(out.contentBase64, "base64")).digest("hex")).toBe(out.fileSha256);
  });

  it("the same idempotency key again answers the same export - the same file and documents - and records nothing more", async () => {
    given([doc("a"), doc("b", { issueDate: "2026-11-02" })]);
    const first = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30", idempotencyKey: "k-1" });
    expect(repo.record).toHaveBeenCalledTimes(1);
    const [, values, ids] = repo.record.mock.calls[0]!;
    const createdAt = new Date("2026-11-18T09:00:00Z");
    // Recorded: the export and its documents. Since then the documents count as exported (by this very export).
    repo.exportById.mockResolvedValue({ ...values, createdAt, deletedAt: null });
    repo.documentIdsOf.mockResolvedValue(new Set(ids));
    repo.exportedBefore.mockImplementation(async (_tx: unknown, _c: string, _s: string, _ids: string[], madeBefore?: Date) =>
      madeBefore && madeBefore <= createdAt ? new Map() : new Map([["a", { exportId: first.exportId, fileName: first.fileName, at: createdAt }], ["b", { exportId: first.exportId, fileName: first.fileName, at: createdAt }]]),
    );
    const again = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30", idempotencyKey: "k-1" });
    expect(repo.record).toHaveBeenCalledTimes(1);
    expect(repo.exportById).toHaveBeenLastCalledWith(TX, COMPANY, first.exportId);
    expect(again).toEqual(first);
    // Another period under the same key is refused, never a second export under it.
    await expect(service.exportPohoda(manager, { from: "2026-11-02", to: "2026-11-30", idempotencyKey: "k-1" })).rejects.toMatchObject({ code: "failed_precondition" });
    // Without a key (or with another) it is a new export.
    repo.exportById.mockResolvedValue(null);
    await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30", idempotencyKey: "k-2", includeExported: true });
    expect(repo.record).toHaveBeenCalledTimes(2);
    expect(repo.record.mock.calls[1]![1].id).not.toBe(first.exportId);
  });

  it("leaves out documents exported before and names them; includeExported puts them in again with a warning", async () => {
    const before = { a: { exportId: "e0", fileName: "pohoda-invoices-2026-10-01-2026-10-31.xml", at: new Date("2026-11-04T10:00:00Z") } };
    given([doc("a"), doc("b")], before);
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.numbers).toEqual(["INV-b"]);
    expect(out.skipped).toEqual([{ number: "INV-a", kind: "invoice", issueDate: "2026-11-03", reason: "Exported to Pohoda on 04.11.2026 (pohoda-invoices-2026-10-01-2026-10-31.xml)" }]);
    expect(repo.record.mock.calls[0]![2]).toEqual(["b"]);

    given([doc("a"), doc("b")], before);
    const again = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30", includeExported: true });
    expect(again.numbers).toEqual(["INV-a", "INV-b"]);
    expect(again.skipped).toEqual([]);
    expect(again.warnings).toEqual(["Exported before and in this file again: INV-a. Pohoda refuses a number it already has, so remove them there first"]);
    expect(repo.record.mock.calls[1]![2]).toEqual(["a", "b"]);
  });

  it("leaves out a cancelled invoice and says why (withdrawn the same day, issued again under a new number)", async () => {
    given([doc("a", { status: "cancelled" }), doc("b")]);
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.numbers).toEqual(["INV-b"]);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]!.reason).toMatch(/^Cancelled: withdrawn on the day it was issued and issued again under a new number/);
    expect(decoded(out.contentBase64)).not.toContain("INV-a");
  });

  it("a cancelled invoice that went to Pohoda before is named to be removed there", async () => {
    given([doc("a", { status: "cancelled" }), doc("b")], { a: { exportId: "e0", fileName: "f.xml", at: new Date("2026-11-03T08:00:00Z") } });
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.skipped[0]!.reason).toMatch(/exported to Pohoda on 03\.11\.2026 \(f\.xml\): remove it there$/);
  });

  it("a credited invoice and its credit note both go, the credit note linked to the invoice's number", async () => {
    given([doc("a", { status: "credited" }), creditNote("c", "a")], {}, { a: "INV-a" });
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out).toMatchObject({ documents: 2, invoices: 1, creditNotes: 1, numbers: ["INV-a", "CN-c"], warnings: [] });
    const xml = decoded(out.contentBase64);
    expect(xml).toContain("<inv:invoiceType>issuedCorrectiveTax</inv:invoiceType>");
    expect(xml).toContain("<typ:number>INV-a</typ:number>");
  });

  it("warns when a credit note's invoice is neither in the file nor exported before", async () => {
    given([creditNote("c", "old")], {}, { old: "INV-old" });
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.warnings).toEqual(["Credit note CN-c corrects invoice INV-old, which this app has not exported to Pohoda: Pohoda needs that invoice first, or refuses the credit note"]);

    given([creditNote("c", "old")], { old: { exportId: "e0", fileName: "f.xml", at: new Date() } }, { old: "INV-old" });
    expect((await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" })).warnings).toEqual([]);
  });

  it("leaves out a document whose own figures do not add up, never correcting it", async () => {
    given([doc("a", { gross: "121.01" }), doc("b")]);
    const out = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.numbers).toEqual(["INV-b"]);
    expect(out.skipped[0]).toMatchObject({ number: "INV-a", reason: "Not in the file: Net and VAT do not add up to the total. Enter it in Pohoda by hand" });
  });

  it("refuses an empty period clearly, and writes no record", async () => {
    given([]);
    await expect(service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "No invoice or credit note was issued from 01.11.2026 – 30.11.2026: there is nothing to export",
    });
    expect(repo.record).not.toHaveBeenCalled();
  });

  it("refuses when everything of the period is left out, naming why, and writes no record", async () => {
    given([doc("a", { status: "cancelled" }), doc("b")], { b: { exportId: "e0", fileName: "f.xml", at: new Date() } });
    const err = await service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" }).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "failed_precondition",
      message: "Nothing to export from 01.11.2026 – 30.11.2026: of 2 documents, 1 exported before (include them again to export them once more), 1 cancelled",
    });
    expect((err as { details: { skipped: unknown[] } }).details.skipped).toHaveLength(2);
    expect(repo.record).not.toHaveBeenCalled();
  });

  it("refuses more documents than one file takes, and documents of two issuers", async () => {
    repo.issuedIn.mockResolvedValue(Array.from({ length: 5001 }, (_, i) => doc(`d${i}`)));
    await expect(service.exportPohoda(manager, { from: "2026-01-01", to: "2026-11-30" })).rejects.toMatchObject({ code: "invalid_argument" });

    given([doc("a"), doc("b", { supplier: { ...SUPPLIER, ico: "99999999" } })]);
    await expect(service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.record).not.toHaveBeenCalled();
  });

  it("is refused when who exports cannot be read (it is recorded with the file)", async () => {
    users.userEmailOf.mockRejectedValue(Object.assign(new Error("Who you are could not be read just now"), { code: "unavailable" }));
    await expect(service.exportPohoda(manager, { from: "2026-11-01", to: "2026-11-30" })).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.inExport).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("shows everyone the exports, and says who may export", async () => {
    repo.list.mockResolvedValue([
      { id: "e1", system: "pohoda", fromDate: "2026-11-01", toDate: "2026-11-30", documents: 4, fileName: "f.xml", fileSha256: "abc", createdBy: "boss@example.com", createdAt: new Date("2026-12-01T08:00:00Z") },
    ]);
    const out = await service.list(clerk);
    expect(repo.list).toHaveBeenCalledWith(COMPANY, 200);
    expect(out).toEqual({
      exports: [{ id: "e1", system: "pohoda", from: "2026-11-01", to: "2026-11-30", documents: 4, fileName: "f.xml", fileSha256: "abc", createdBy: "boss@example.com", createdAt: "2026-12-01T08:00:00.000Z" }],
      canExport: false,
    });
    expect((await service.list(manager)).canExport).toBe(true);
  });
});
