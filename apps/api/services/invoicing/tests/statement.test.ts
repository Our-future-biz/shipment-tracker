import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { csvText, fileNamePart, languageOf, statementCsv, statementCurrencies, statementOf, type StatementRowInput } from "../lib/statement";
import { renderStatementPdf, type StatementForPdf } from "../lib/statementPdf";
import { loadPdfFonts } from "../lib/pdfFonts";

// A customer's statement (Accounts Receivable step 7): the invoices still owed in one currency, as at today, and its PDF.

const TODAY = "2026-11-18";
const CUSTOMER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";

const row = (over: Partial<StatementRowInput> = {}): StatementRowInput => ({
  id: "inv-1",
  number: "INV2026CZ00000028-001",
  jobNumber: "CZ00000028",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  currency: "EUR",
  gross: 1210,
  credited: 0,
  paid: 0,
  writtenOff: 0,
  bankCharges: 0,
  leftToPay: 1210,
  status: "unpaid",
  ...over,
});

const rows: StatementRowInput[] = [
  row(),
  // Part credited and part paid: 2420 − 420 − 1000 = 1000 left, not yet due.
  row({ id: "inv-2", number: "INV2026CZ00000031-001", jobNumber: "CZ00000031", issueDate: "2026-11-10", dueDate: "2026-12-10", gross: 2420, credited: 420, paid: 1000, leftToPay: 1000, status: "part_paid" }),
  // Another currency: a statement of its own.
  row({ id: "inv-3", number: "INV2026CZ00000040-001", jobNumber: "CZ00000040", currency: "CZK", gross: 12100, leftToPay: 12100 }),
  // Not owed: paid, credited, cancelled, to refund.
  row({ id: "inv-4", status: "paid", paid: 1210, leftToPay: 0 }),
  row({ id: "inv-5", status: "credited", credited: 1210, leftToPay: 0 }),
  row({ id: "inv-6", status: "cancelled", leftToPay: 0 }),
  row({ id: "inv-7", status: "paid", paid: 1300, leftToPay: -90 }),
];

describe("statementOf", () => {
  it("lists only the invoices still owed in the currency, with credited, paid and left to pay, and sums them", () => {
    const s = statementOf(rows, { customerId: CUSTOMER, customer: "Gama s.r.o.", currency: "EUR", today: TODAY });
    expect(s.lines.map((l) => l.invoiceId)).toEqual(["inv-1", "inv-2"]);
    expect(s.lines[1]).toMatchObject({ amount: 2420, credited: 420, paid: 1000, leftToPay: 1000, daysOverdue: 0, paymentReference: "00000031" });
    expect(s.totals).toEqual({ amount: 3630, credited: 420, paid: 1000, writtenOff: 0, leftToPay: 2210, overdue: 1210 });
    expect(s.asAt).toBe(TODAY);
    expect(s.currency).toBe("EUR");
  });

  it("keeps each currency apart: never one total across currencies", () => {
    const czk = statementOf(rows, { customerId: CUSTOMER, customer: "Gama", currency: "CZK", today: TODAY });
    expect(czk.lines.map((l) => l.invoiceId)).toEqual(["inv-3"]);
    expect(czk.totals.leftToPay).toBe(12100);
    expect(statementOf(rows, { customerId: CUSTOMER, customer: "Gama", currency: "USD", today: TODAY }).lines).toEqual([]);
  });

  it("counts the days overdue as at today, and none before or on the due day", () => {
    const s = statementOf([row({ dueDate: "2026-10-31" }), row({ id: "b", dueDate: TODAY }), row({ id: "c", dueDate: "2026-11-17" })], {
      customerId: CUSTOMER,
      customer: "Gama",
      currency: "EUR",
      today: TODAY,
    });
    expect(Object.fromEntries(s.lines.map((l) => [l.invoiceId, l.daysOverdue]))).toEqual({ "inv-1": 18, b: 0, c: 1 });
    // The longest overdue first.
    expect(s.lines.map((l) => l.invoiceId)).toEqual(["inv-1", "c", "b"]);
    expect(s.totals.overdue).toBe(2420);
  });

  it("shows confirmed write-offs and bank charges as Written off, so Amount − Credited − Paid − Written off = Left to pay", () => {
    const s = statementOf([row({ gross: 2420, credited: 420, paid: 1000, writtenOff: 300, bankCharges: 15.5, leftToPay: 684.5, status: "part_paid" })], {
      customerId: CUSTOMER,
      customer: "Gama",
      currency: "EUR",
      today: TODAY,
    });
    const [l] = s.lines;
    expect(l).toMatchObject({ amount: 2420, credited: 420, paid: 1000, writtenOff: 315.5, leftToPay: 684.5 });
    expect(Math.round((l!.amount - l!.credited - l!.paid - l!.writtenOff) * 100) / 100).toBe(l!.leftToPay);
    expect(s.totals.writtenOff).toBe(315.5);
    const csv = statementCsv(s, "cs");
    expect(csv[0]!.slice(-3)).toEqual(["Zaplaceno", "Odepsáno", "Zbývá uhradit"]);
    expect(statementCsv(s, "en")[0]!.slice(-3)).toEqual(["Paid", "Written off", "Left to pay"]);
    expect(csv[1]!.slice(-4)).toEqual(["420.00", "1000.00", "315.50", "684.50"]);
  });

  it("rounds sums to cents", () => {
    const s = statementOf([row({ leftToPay: 0.1, gross: 0.1 }), row({ id: "b", leftToPay: 0.2, gross: 0.2 })], { customerId: CUSTOMER, customer: "", currency: "EUR", today: TODAY });
    expect(s.totals.leftToPay).toBe(0.3);
  });
});

describe("statementCurrencies", () => {
  it("names the currencies something is owed in, the most first", () => {
    expect(statementCurrencies(rows)).toEqual(["CZK", "EUR"]);
    expect(statementCurrencies([row({ status: "paid", leftToPay: 0 })])).toEqual([]);
  });
});

describe("statementCsv", () => {
  it("writes a line per invoice and the total, headings in the customer's language", () => {
    const s = statementOf(rows, { customerId: CUSTOMER, customer: "Gama", currency: "EUR", today: TODAY });
    const en = statementCsv(s, "en");
    expect(en[0]![0]).toBe("Invoice");
    expect(en).toHaveLength(4);
    expect(en[1]).toEqual(["INV2026CZ00000028-001", "CZ00000028", "00000028", "2026-10-01", "2026-10-31", "18", "EUR", "1210.00", "0.00", "0.00", "0.00", "1210.00"]);
    expect(en[3]).toEqual(["Total", "", "", "", "", "", "EUR", "3630.00", "420.00", "1000.00", "0.00", "2210.00"]);
    expect(statementCsv(s, "cs")[0]![0]).toBe("Faktura");
    expect(statementCsv(s, "cs")[3]![0]).toBe("Celkem");
  });

  it("quotes every cell and keeps a spreadsheet from running a formula", () => {
    const text = csvText([["=HYPERLINK(1)", "-5.00", 'a "b"']]);
    expect(text).toBe('﻿"\'=HYPERLINK(1)","-5.00","a ""b"""');
  });
});

describe("languageOf and fileNamePart", () => {
  it("reads cs as Czech and anything else as English", () => {
    expect(languageOf("cs")).toBe("cs");
    expect(languageOf("en")).toBe("en");
    expect(languageOf(undefined)).toBe("en");
    expect(languageOf("de")).toBe("en");
  });

  it("makes a plain file name of a customer's name", () => {
    expect(fileNamePart("Gama, s.r.o.")).toBe("Gama-s-r-o");
    expect(fileNamePart("Žluťoučký kůň a.s.")).toBe("Zlutoucky-kun-a-s");
    expect(fileNamePart("***")).toBe("customer");
  });
});

// ── The PDF ──

async function textOf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  await (parser as unknown as { load(): Promise<void> }).load();
  return (await parser.getText()).text;
}
const squash = (t: string) => t.replace(/\s+/g, "");

const pdfInput = (language: "cs" | "en", lines = rows): StatementForPdf => ({
  statement: statementOf(lines, { customerId: CUSTOMER, customer: "Gama s.r.o.", currency: "EUR", today: TODAY }),
  language,
  issuer: {
    companyName: "Příliš žluťoučký kůň s.r.o.",
    street: "Řeznická 12",
    city: "Praha 1",
    postalCode: "110 00",
    country: "CZ",
    ico: "27074358",
    dic: "CZ27074358",
    registerEntry: "C 12345 vedená u Městského soudu v Praze",
    email: "ucetni@kun.cz",
    phone: "+420 777 123 456",
    web: "",
    logoData: "",
    footerNote: "",
  },
  customer: { companyName: "Gama s.r.o.", lines: ["Na Příkopě 1", "110 00 Praha", "IČO: 12345678"] },
  bank: { bankName: "ČSOB", accountNumber: "19-2000145399/0800", iban: "CZ6508000000192000145399", swift: "CEKOCZPP" },
});

describe("renderStatementPdf", () => {
  it("draws the statement in English with the issuer's EUR account and the payment reference", async () => {
    const bytes = await renderStatementPdf(pdfInput("en"), await loadPdfFonts());
    // Counted first: the text reader takes the bytes over.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const text = squash(await textOf(bytes));
    expect(text).toContain(squash("STATEMENT OF ACCOUNT"));
    expect(text).toContain(squash("Příliš žluťoučký kůň s.r.o."));
    expect(text).toContain("INV2026CZ00000028-001");
    expect(text).toContain(squash("2 210.00 EUR"));
    expect(text).toContain(squash("Written off"));
    expect(text).toContain(squash("CZ65 0800 0000 1920 0014 5399"));
    expect(text).toContain(squash("Payment reference: the job number's digits as on each invoice."));
  });

  it("draws it in Czech", async () => {
    const text = squash(await textOf(await renderStatementPdf(pdfInput("cs"), await loadPdfFonts())));
    expect(text).toContain(squash("VÝPIS OTEVŘENÝCH POLOŽEK"));
    expect(text).toContain(squash("CELKEM K ÚHRADĚ"));
    expect(text).toContain(squash("Odepsáno"));
    expect(text).toContain(squash("Variabilní symbol: číslice čísla zakázky"));
  });

  it("goes on to more pages, each with its number, and says when nothing is owed", async () => {
    const many = Array.from({ length: 90 }, (_, i) => row({ id: `inv-${i}`, number: `INV2026CZ000001${String(i).padStart(2, "0")}-001` }));
    const bytes = await renderStatementPdf(pdfInput("en", many), await loadPdfFonts());
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(1);
    expect(squash(await textOf(bytes))).toContain(squash(`Page ${pages}/${pages}`));

    const none = squash(await textOf(await renderStatementPdf({ ...pdfInput("en", []), bank: null }, await loadPdfFonts())));
    expect(none).toContain(squash("No invoice in EUR is left to pay."));
    expect(none).toContain(squash("Please pay to the account stated on each invoice."));
  });
});
