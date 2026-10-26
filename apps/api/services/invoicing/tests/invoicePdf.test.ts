import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { czDate, czIbanFromAccount, czMoney, czRate, renderInvoicePdf, spdPayment, variableSymbol, type InvoiceForPdf } from "../lib/invoicePdf";
import { loadPdfFonts } from "../lib/pdfFonts";

async function textOf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  await (parser as unknown as { load(): Promise<void> }).load();
  return (await parser.getText()).text;
}

/** Text extraction may split words across runs; compare without whitespace. */
const squash = (t: string) => t.replace(/\s+/g, "");

const base: InvoiceForPdf = {
  kind: "invoice",
  number: "INV2026CZ00000028-001",
  issueDate: "2026-10-13",
  duzp: "2026-10-14",
  dueDate: "2026-11-12",
  currency: "EUR",
  fxRate: "25.123400",
  fxWeek: "2026-W42",
  fxFixingDate: null,
  roePct: null,
  net: "1100.00",
  vat: "21.00",
  gross: "1121.00",
  netCzk: "27635.74",
  vatCzk: "527.59",
  grossCzk: "28163.33",
  vatSummary: [
    { vatCode: "S21", vatRate: 21, base: 100, vat: 21, baseCzk: 2512.34, vatCzk: 527.59 },
    { vatCode: "Z69", vatRate: 0, base: 1000, vat: 0, baseCzk: 25123.4, vatCzk: 0 },
  ],
  supplier: {
    companyName: "Příliš žluťoučký kůň s.r.o.",
    street: "Řeznická 12",
    city: "Praha 1",
    postalCode: "110 00",
    country: "CZ",
    ico: "12345679",
    dic: "CZ12345679",
    vatPayer: true,
    registerEntry: "C 12345 vedená u Městského soudu v Praze",
    email: "fakturace@example.cz",
    phone: "+420 123 456 789",
    web: "",
    logoData: "",
    footerNote: "Děkujeme za spolupráci.",
    bankAccount: { currency: "EUR", bankName: "Česká spořitelna", accountNumber: "", iban: "CZ6508000000192000145399", swift: "GIBACZPX" },
  },
  customer: {
    customerId: "c1",
    companyName: "Zákazník a.s.",
    address: "Jankovcova 1522/53, Praha, 17000",
    city: "Praha",
    country: "CZ",
    ico: "27082440",
    dic: "CZ27082440",
    paymentTerms: "30 days",
  },
  shipment: {
    jobNumber: "CZ00000028",
    jobYear: 2026,
    tradeDirection: "Import",
    shipper: "",
    consignee: "",
    bookingNumber: "BK123",
    containerNumber: "MSCU1234567",
    personalReference: "PO-9",
  },
  note: "",
  creditReason: "",
  correctsNumber: "",
  lines: [
    { description: "Ocean freight", qty: "1.00", unitPrice: "1000.00", unitCurrency: "EUR", net: "1000.00", vatCode: "Z69", vatRate: "0.00" },
    { description: "Customs clearance", qty: "1.00", unitPrice: "2512.34", unitCurrency: "CZK", net: "100.00", vatCode: "S21", vatRate: "21.00" },
  ],
};

describe("formatting", () => {
  it("formats money, rates and dates the Czech way", () => {
    expect(czMoney("29999.5")).toBe("29 999,50");
    expect(czMoney(-1234567.891)).toBe("-1 234 567,89");
    expect(czMoney("0")).toBe("0,00");
    expect(czMoney("-0.001")).toBe("0,00");
    expect(czRate("25.123400")).toBe("25,123");
    expect(czDate("2026-10-03")).toBe("03.10.2026");
  });

  it("builds the variable symbol from the job number", () => {
    // the job number's digits: every invoice and credit note of a job shares the symbol
    expect(variableSymbol("CZ00000028")).toBe("00000028");
    expect(variableSymbol("CZ00123456")).toBe("00123456");
    expect(variableSymbol("RD-2026-0042")).toBe("20260042");
  });
});

describe("QR Platba", () => {
  it("turns a Czech account number into its IBAN", () => {
    expect(czIbanFromAccount("19-2000145399/0800")).toBe("CZ6508000000192000145399");
    expect(czIbanFromAccount("2000145399/0800")).toBe("CZ7908000000002000145399");
    expect(czIbanFromAccount("not an account")).toBeNull();
  });

  it("builds the payment string banking apps read", () => {
    expect(spdPayment({ iban: "CZ65 0800 0000 1920 0014 5399", swift: "GIBACZPX", amount: 2200, currency: "CZK", vs: "00000009", message: "INV2026CZ00000009-001" })).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399+GIBACZPX*AM:2200.00*CC:CZK*X-VS:00000009*MSG:INV2026CZ00000009-001",
    );
    // no IBAN or nothing to pay: no QR
    expect(spdPayment({ iban: "", amount: 100, currency: "CZK", vs: "1", message: "x" })).toBeNull();
    expect(spdPayment({ iban: "CZ6508000000192000145399", amount: 0, currency: "CZK", vs: "1", message: "x" })).toBeNull();
    // "*" separates fields and accents are dropped from the message
    expect(spdPayment({ iban: "CZ6508000000192000145399", amount: 1, currency: "eur", vs: "", message: "Faktura *č.* 1" })).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:EUR*MSG:Faktura c. 1",
    );
  });
});

describe("renderInvoicePdf", () => {
  it("prints every required field, Czech characters included", async () => {
    const bytes = await renderInvoicePdf(base, await loadPdfFonts());
    const text = squash(await textOf(bytes));
    for (const expected of [
      "FAKTURA–DAŇOVÝDOKLAD",
      "INV2026CZ00000028-001",
      "Příliš žluťoučký kůň s.r.o.",
      "Řeznická12",
      "IČO:12345679",
      "DIČ:CZ12345679",
      "Zákazníka.s.",
      "DIČ:CZ27082440",
      "13.10.2026", // issue date
      "14.10.2026", // DUZP
      "12.11.2026", // due date
      "00000028", // variable symbol = the job number's digits
      "CZ65 0800 0000 1920 0014 5399",
      "GIBACZPX",
      "MSCU1234567",
      "1121,00EUR", // total due
      "CelkemCZK/TotalCZK28163,33CZK", // total in CZK
      "1EUR=25,123CZK",
      "Osvobozeno od daně dle §69 ZDPH",
      "Děkujemezaspolupráci.",
      "Strana/Page1/1",
    ]) {
      expect(text).toContain(squash(expected));
    }
  });

  it("prints the ČNB rate at DUZP with its fixing date, and the ROE note for converted lines", async () => {
    const cnbRated: InvoiceForPdf = {
      ...base,
      fxWeek: "",
      fxFixingDate: "2026-10-13",
      roePct: "102.000",
      lines: [{ ...base.lines[0]!, unitCurrency: "USD" }, ...base.lines.slice(1)],
    };
    const text = squash(await textOf(await renderInvoicePdf(cnbRated, await loadPdfFonts())));
    expect(text).toContain(squash("Kurz ČNB k DUZP / CNB rate at tax date: 1 EUR = 25,123 CZK (fixing 13.10.2026)"));
    expect(text).toContain(squash("Položky v jiné měně přepočteny kurzem ČNB k DUZP + 2 %"));
    expect(text).not.toContain("2026-W42");
  });

  it("titles a credit note, refers to the invoice and shows the refund", async () => {
    const bytes = await renderInvoicePdf(
      {
        ...base,
        kind: "credit_note",
        number: "CN2026CZ00000028-001",
        correctsNumber: "INV2026CZ00000028-001",
        creditReason: "Špatná sazba",
        net: "-1100.00",
        vat: "-21.00",
        gross: "-1121.00",
        lines: base.lines.map((l) => ({ ...l, qty: `-${l.qty}`, net: `-${l.net}` })),
      },
      await loadPdfFonts(),
    );
    const text = squash(await textOf(bytes));
    expect(text).toContain("OPRAVNÝDAŇOVÝDOKLAD");
    expect(text).toContain("INV2026CZ00000028-001");
    expect(text).toContain("Špatnásazba");
    expect(text).toContain("KVRÁCENÍ");
    expect(text).toContain("1121,00EUR");
  });

  it("continues long invoices on further pages and keeps the same output", async () => {
    const many = { ...base, lines: Array.from({ length: 70 }, (_, i) => ({ ...base.lines[0]!, description: `Line ${i + 1} with a rather long description that has to wrap onto a second row` })) };
    const fonts = await loadPdfFonts();
    const a = await renderInvoicePdf(many, fonts);
    const doc = await PDFDocument.load(a);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const text = squash(await textOf(a));
    expect(text).toContain("Line70");
    expect(text).toContain(`Strana/Page${doc.getPageCount()}/${doc.getPageCount()}`);
    // same snapshot -> same content (bytes differ only in the random font-subset tag)
    const b = await renderInvoicePdf(many, fonts);
    expect(squash(await textOf(b))).toBe(text);
  });

  it("survives a broken logo", async () => {
    const bytes = await renderInvoicePdf({ ...base, supplier: { ...base.supplier, logoData: "data:image/png;base64,AAAA" } }, await loadPdfFonts());
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
