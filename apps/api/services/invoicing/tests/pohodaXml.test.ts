import { describe, expect, it } from "vitest";
import { creditTotals, summarise, type InvoiceLineCalc } from "../lib/invoiceCalc";
import {
  buildPohodaXml,
  cut,
  encodeWindows1250,
  escapeXml,
  pohodaClassification,
  pohodaFileName,
  pohodaMoney,
  pohodaNotes,
  pohodaProblem,
  pohodaRate,
  type PohodaDocument,
} from "../lib/pohodaXml";
import type { CustomerSnapshot, SupplierSnapshot } from "../schemas/invoice.schema";

// Documents shaped as the invoice schema stores them (numeric columns as strings, the VAT summary as issuing writes it
// with lib/invoiceCalc summarise / creditTotals), turned into a Pohoda dataPack.

const SUPPLIER: SupplierSnapshot = {
  companyName: "CTO Global Logistics s.r.o.",
  street: "Na Florenci 15",
  city: "Praha 1",
  postalCode: "110 00",
  country: "CZ",
  ico: "12345678",
  dic: "CZ12345678",
  vatPayer: true,
  registerEntry: "",
  email: "",
  phone: "",
  web: "",
  logoData: "",
  footerNote: "",
  bankAccount: null,
};
const CZ_CUSTOMER: CustomerSnapshot = {
  customerId: "c-cz",
  companyName: "Plzeňská strojírna a.s.",
  address: "Průmyslová 12, 301 00 Plzeň",
  city: "Plzeň",
  country: "CZ",
  ico: "87654321",
  dic: "CZ87654321",
  paymentTerms: "14 days",
};
const DE_CUSTOMER: CustomerSnapshot = {
  customerId: "c-de",
  companyName: "Müller Spedition GmbH",
  address: "Hafenstraße 3",
  city: "Hamburg",
  country: "DE",
  ico: "",
  dic: "DE123456789",
  paymentTerms: "30 days",
  billingAddress: { label: "Buchhaltung", street: "Postfach 1122", postalCode: "20095", city: "Hamburg", country: "DE" },
};
const SHIPMENT = { jobNumber: "CZ00000028", jobYear: 2026, tradeDirection: "Import", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "", routeFrom: "Hamburg", routeTo: "Praha" };

type Line = PohodaDocument["lines"][number];
const line = (seq: number, description: string, qty: number, unitPrice: number, unitCurrency: string, net: number, vatCode: Line["vatCode"]): Line => ({
  seq,
  description,
  qty: qty.toFixed(2),
  unitPrice: unitPrice.toFixed(2),
  unitCurrency,
  net: net.toFixed(2),
  vatCode,
  vatRate: vatCode === "S21" ? "21.00" : "0.00",
});
const calcOf = (lines: Line[]): InvoiceLineCalc[] =>
  lines.map((l) => ({ sourceSellingCostId: "", description: l.description, qty: Number(l.qty), unitPrice: Number(l.unitPrice), unitCurrency: l.unitCurrency, net: Number(l.net), vatCode: l.vatCode, vatRate: Number(l.vatRate), fxRate: 1 }));

const s = (v: number) => v.toFixed(2);
function document(over: { id: string; kind?: "invoice" | "credit_note"; number: string; issueDate: string; currency: string; fxRate: string; customer: CustomerSnapshot; lines: Line[]; correctsNumber?: string; creditReason?: string; note?: string; totals?: ReturnType<typeof creditTotals> }): PohodaDocument {
  const totals = over.totals ?? summarise(calcOf(over.lines), Number(over.fxRate));
  return {
    invoice: {
      id: over.id,
      kind: over.kind ?? "invoice",
      number: over.number,
      issueDate: over.issueDate,
      duzp: "2026-11-02",
      dueDate: "2026-11-16",
      currency: over.currency,
      fxRate: over.fxRate,
      net: s(totals.net),
      vat: s(totals.vat),
      gross: s(totals.gross),
      netCzk: s(totals.netCzk),
      vatCzk: s(totals.vatCzk),
      grossCzk: s(totals.grossCzk),
      vatSummary: totals.vatSummary,
      supplier: SUPPLIER,
      customer: over.customer,
      shipment: SHIPMENT,
      note: over.note ?? "",
      creditReason: over.creditReason ?? "",
    },
    lines: over.lines,
    correctsNumber: over.correctsNumber ?? null,
  };
}

// 1) A CZK invoice at 21 %: 1 000.00 + 2 × 250.50 = 1 501.00, VAT 315.21, total 1 816.21.
const CZK_INVOICE = document({
  id: "i-1",
  number: "INV2026CZ00000028",
  issueDate: "2026-11-03",
  currency: "CZK",
  fxRate: "1.000000",
  customer: CZ_CUSTOMER,
  lines: [line(1, "Silniční doprava Hamburg - Praha", 1, 1000, "CZK", 1000, "S21"), line(2, "Manipulace", 2, 250.5, "CZK", 501, "S21")],
});

// 2) An EUR invoice to a German VAT payer, reverse charge: 1 200.00 EUR + a USD line converted (250 USD → 230.15 EUR).
const EUR_INVOICE = document({
  id: "i-2",
  number: "INV2026CZ00000029",
  issueDate: "2026-11-04",
  currency: "EUR",
  fxRate: "24.335000",
  customer: DE_CUSTOMER,
  lines: [line(1, "Ocean freight Shanghai - Hamburg", 1, 1200, "EUR", 1200, "RC"), line(2, "Documentation", 1, 250, "USD", 230.15, "RC")],
});

// 3) A partial credit note of the CZK invoice: the handling line (−501.00, VAT −105.21).
const PARTIAL_CN = document({
  id: "cn-1",
  kind: "credit_note",
  number: "CN2026CZ00000028",
  issueDate: "2026-11-05",
  currency: "CZK",
  fxRate: "1.000000",
  customer: CZ_CUSTOMER,
  lines: [line(1, "Manipulace", -2, 250.5, "CZK", -501, "S21")],
  correctsNumber: "INV2026CZ00000028",
  creditReason: "Manipulace nebyla provedena",
});

// 4) A full credit note of the EUR invoice: the invoice's own stored totals with the sign flipped (creditTotals).
const FULL_CN = document({
  id: "cn-2",
  kind: "credit_note",
  number: "CN2026CZ00000029",
  issueDate: "2026-11-04",
  currency: "EUR",
  fxRate: "24.335000",
  customer: DE_CUSTOMER,
  lines: EUR_INVOICE.lines.map((l) => ({ ...l, qty: (-Number(l.qty)).toFixed(2), net: (-Number(l.net)).toFixed(2) })),
  correctsNumber: "INV2026CZ00000029",
  creditReason: "Wrong customer",
  totals: creditTotals({ ...EUR_INVOICE.invoice, vatSummary: EUR_INVOICE.invoice.vatSummary }),
});

const pack = (documents: PohodaDocument[]) => buildPohodaXml({ id: "ST-export-1", ico: "12345678", note: "Faktury 01.11.2026 – 30.11.2026", documents });

/** The text of the first element `tag` inside `xml` (no attributes on the opening tag), or null. */
const inner = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1]! : null;
};
/** The dataPackItem of a document, by its number. */
const item = (xml: string, number: string) => {
  const m = new RegExp(`<dat:dataPackItem id="${number}" version="2.0">[\\s\\S]*?</dat:dataPackItem>`).exec(xml);
  return m ? m[0] : "";
};

describe("pohodaProblem", () => {
  it("passes the four fixtures as issued", () => {
    for (const d of [CZK_INVOICE, EUR_INVOICE, PARTIAL_CN, FULL_CN]) expect(pohodaProblem(d)).toBeNull();
  });

  it("refuses a document whose VAT summary does not add up to its totals, never correcting it", () => {
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, vat: "315.22", gross: "1816.22" } })).toMatch(/VAT does not add up/);
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, gross: "1816.20" } })).toMatch(/do not add up to the total/);
  });

  it("refuses lines that do not add up to the summary per VAT code (Pohoda builds its summary from the items)", () => {
    expect(pohodaProblem({ ...CZK_INVOICE, lines: [CZK_INVOICE.lines[0]!] })).toMatch(/lines at 21 % do not add up/);
    expect(pohodaProblem({ ...CZK_INVOICE, lines: [] })).toMatch(/no lines/);
  });

  it("refuses a credit note without the number of its invoice, an unknown VAT code, a rate that does not fit the code", () => {
    expect(pohodaProblem({ ...PARTIAL_CN, correctsNumber: null })).toMatch(/could not be read/);
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, vatSummary: [{ ...CZK_INVOICE.invoice.vatSummary[0]!, vatCode: "X1" as never }] } })).toMatch(/Unknown VAT code/);
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, vatSummary: [{ ...CZK_INVOICE.invoice.vatSummary[0]!, vatRate: 15 }] } })).toMatch(/rate 15/);
  });

  it("refuses a CZK document with a rate other than 1, and a number longer than Pohoda takes", () => {
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, fxRate: "25.000000" } })).toMatch(/rate other than 1/);
    expect(pohodaProblem({ ...CZK_INVOICE, invoice: { ...CZK_INVOICE.invoice, number: "X".repeat(33) } })).toMatch(/longer than Pohoda takes/);
  });
});

describe("the CZK invoice at 21 %", () => {
  const xml = pack([CZK_INVOICE]);

  it("is the whole dataPack, exactly (the structure Stormware's schema and samples give)", () => {
    expect(xml).toBe(`<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack version="2.0" id="ST-export-1" ico="12345678" application="Shipment Tracker" note="Faktury 01.11.2026 – 30.11.2026" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem id="INV2026CZ00000028" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:number>
          <typ:numberRequested checkDuplicity="true">INV2026CZ00000028</typ:numberRequested>
        </inv:number>
        <inv:symVar>00000028</inv:symVar>
        <inv:date>2026-11-03</inv:date>
        <inv:dateTax>2026-11-02</inv:dateTax>
        <inv:dateAccounting>2026-11-03</inv:dateAccounting>
        <inv:dateDue>2026-11-16</inv:dateDue>
        <inv:classificationVAT>
          <typ:ids>UD</typ:ids>
        </inv:classificationVAT>
        <inv:text>Zakázka CZ00000028, Hamburg - Praha</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>Plzeňská strojírna a.s.</typ:company>
            <typ:city>Plzeň</typ:city>
            <typ:street>Průmyslová 12, 301 00 Plzeň</typ:street>
            <typ:ico>87654321</typ:ico>
            <typ:dic>CZ87654321</typ:dic>
            <typ:country>
              <typ:ids>CZ</typ:ids>
            </typ:country>
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType>
          <typ:paymentType>draft</typ:paymentType>
        </inv:paymentType>
        <inv:intNote>Faktura INV2026CZ00000028 ze Shipment Tracker, zakázka CZ00000028</inv:intNote>
      </inv:invoiceHeader>
      <inv:invoiceDetail>
        <inv:invoiceItem>
          <inv:text>Silniční doprava Hamburg - Praha</inv:text>
          <inv:quantity>1</inv:quantity>
          <inv:payVAT>false</inv:payVAT>
          <inv:rateVAT>high</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>1000.00</typ:unitPrice>
          </inv:homeCurrency>
          <inv:classificationVAT>
            <typ:ids>UD</typ:ids>
          </inv:classificationVAT>
        </inv:invoiceItem>
        <inv:invoiceItem>
          <inv:text>Manipulace</inv:text>
          <inv:quantity>1</inv:quantity>
          <inv:payVAT>false</inv:payVAT>
          <inv:rateVAT>high</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>501.00</typ:unitPrice>
          </inv:homeCurrency>
          <inv:note>2 x 250.50 CZK</inv:note>
          <inv:classificationVAT>
            <typ:ids>UD</typ:ids>
          </inv:classificationVAT>
        </inv:invoiceItem>
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:roundingDocument>none</inv:roundingDocument>
        <inv:roundingVAT>noneEveryRate</inv:roundingVAT>
        <inv:homeCurrency>
          <typ:priceHigh>1501.00</typ:priceHigh>
          <typ:priceHighVAT>315.21</typ:priceHighVAT>
          <typ:priceHighSum>1816.21</typ:priceHighSum>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>
`);
  });

  it("has nothing for the accountant to check", () => {
    expect(pohodaNotes(CZK_INVOICE)).toEqual([]);
  });
});

describe("the EUR invoice with reverse charge", () => {
  const xml = item(pack([EUR_INVOICE]), "INV2026CZ00000029");

  it("goes in the foreign currency at the invoice's own ČNB rate, its items in EUR", () => {
    expect(inner(xml, "inv:foreignCurrency")).toBeTruthy();
    const summary = inner(xml, "inv:invoiceSummary")!;
    expect(summary).toContain("<typ:currency>\n            <typ:ids>EUR</typ:ids>");
    expect(inner(summary, "typ:rate")).toBe("24.335");
    expect(inner(summary, "typ:amount")).toBe("1");
    expect(inner(summary, "typ:priceSum")).toBe("1430.15");
    const items = inner(xml, "inv:invoiceDetail")!;
    expect(items).toContain("<inv:foreignCurrency>\n            <typ:unitPrice>1200.00</typ:unitPrice>");
    expect(items).toContain("<inv:foreignCurrency>\n            <typ:unitPrice>230.15</typ:unitPrice>");
    expect(items).toContain("<inv:note>1 x 250.00 USD</inv:note>");
    expect(items).not.toContain("inv:homeCurrency");
  });

  it("states the CZK base from the invoice's own VAT summary, never recomputed", () => {
    const home = inner(inner(xml, "inv:invoiceSummary")!, "inv:homeCurrency")!;
    // 1 430.15 EUR × 24.335 = 34 802.70 CZK, as issuing stored it
    expect(EUR_INVOICE.invoice.vatSummary[0]!.baseCzk).toBe(34802.7);
    expect(inner(home, "typ:priceNone")).toBe("34802.70");
    expect(home).not.toContain("priceHigh");
  });

  it("is a service to an EU VAT payer (USregEU), at 0 %, to its billing address", () => {
    expect(xml).toContain("<inv:classificationVAT>\n          <typ:ids>USregEU</typ:ids>");
    expect(xml.match(/<inv:rateVAT>none<\/inv:rateVAT>/g)).toHaveLength(2);
    const address = inner(xml, "typ:address")!;
    expect(inner(address, "typ:company")).toBe("Müller Spedition GmbH");
    expect(inner(address, "typ:street")).toBe("Postfach 1122");
    expect(inner(address, "typ:zip")).toBe("20095");
    expect(inner(address, "typ:dic")).toBe("DE123456789");
    expect(address).not.toContain("typ:ico");
    expect(inner(xml, "inv:intNote")).toContain("kurz ČNB k DUZP 1 EUR = 24.335 CZK");
  });
});

describe("credit notes", () => {
  const xml = pack([PARTIAL_CN, CZK_INVOICE, FULL_CN, EUR_INVOICE]);

  it("come after the invoices of the same day, in issue order", () => {
    const ids = [...xml.matchAll(/<dat:dataPackItem id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["INV2026CZ00000028", "INV2026CZ00000029", "CN2026CZ00000029", "CN2026CZ00000028"]);
  });

  it("a partial one is a corrective tax document of its invoice by number, with its own items and negative amounts", () => {
    const cn = item(xml, "CN2026CZ00000028");
    expect(cn).toContain(`<inv:correctiveDocument itemTransfer="false">
        <typ:sourceDocument>
          <typ:number>INV2026CZ00000028</typ:number>
        </typ:sourceDocument>
      </inv:correctiveDocument>
      <inv:invoiceHeader>`);
    expect(inner(cn, "inv:invoiceType")).toBe("issuedCorrectiveTax");
    expect(inner(cn, "typ:numberRequested")).toBe("CN2026CZ00000028");
    expect(inner(cn, "inv:symVar")).toBe("00000028");
    expect(inner(cn, "inv:text")).toBe("Oprava faktury INV2026CZ00000028: Manipulace nebyla provedena (zakázka CZ00000028)");
    expect(inner(inner(cn, "inv:invoiceDetail")!, "typ:unitPrice")).toBe("-501.00");
    const home = inner(inner(cn, "inv:invoiceSummary")!, "inv:homeCurrency")!;
    expect(inner(home, "typ:priceHigh")).toBe("-501.00");
    expect(inner(home, "typ:priceHighVAT")).toBe("-105.21");
    expect(inner(home, "typ:priceHighSum")).toBe("-606.21");
  });

  it("a full one carries the invoice's own totals with the sign flipped", () => {
    const cn = item(xml, "CN2026CZ00000029");
    expect(inner(cn, "typ:number")).toBe("INV2026CZ00000029");
    const summary = inner(cn, "inv:invoiceSummary")!;
    expect(inner(inner(summary, "inv:homeCurrency")!, "typ:priceNone")).toBe("-34802.70");
    expect(inner(inner(summary, "inv:foreignCurrency")!, "typ:priceSum")).toBe("-1430.15");
    expect(inner(summary, "typ:rate")).toBe("24.335");
  });
});

describe("escaping", () => {
  const nasty = document({
    id: "i-9",
    number: "INV2026CZ00000030",
    issueDate: "2026-11-06",
    currency: "CZK",
    fxRate: "1.000000",
    customer: { ...CZ_CUSTOMER, companyName: `Smith & Sons <"Best"> s.r.o.`, address: "O'Brien St 5 & 7" },
    lines: [line(1, `Storage > 30 days & "special" <handling>`, 1, 100, "CZK", 100, "S21")],
    note: "Pay < 14 days & quote \"ref\"\u0007",
  });
  const xml = pack([nasty]);

  it("escapes & < > \" ' in names, texts and notes, and drops characters XML may not hold", () => {
    expect(inner(xml, "typ:company")).toBe("Smith &amp; Sons &lt;&quot;Best&quot;&gt; s.r.o.");
    expect(inner(xml, "typ:street")).toBe("O&apos;Brien St 5 &amp; 7");
    expect(inner(inner(xml, "inv:invoiceDetail")!, "inv:text")).toBe("Storage &gt; 30 days &amp; &quot;special&quot; &lt;handling&gt;");
    expect(inner(xml, "inv:note")).toBe("Pay &lt; 14 days &amp; quote &quot;ref&quot;");
    expect(escapeXml("a\u0000b\tc")).toBe("ab\tc");
  });

  it("escapes attribute values too", () => {
    const x = buildPohodaXml({ id: `a"b<c`, ico: "1", note: `x & "y"`, documents: [] });
    expect(x).toContain(`id="a&quot;b&lt;c"`);
    expect(x).toContain(`note="x &amp; &quot;y&quot;"`);
  });
});

describe("Windows-1250", () => {
  it("writes Czech letters as their Windows-1250 bytes and keeps ASCII", () => {
    const bytes = encodeWindows1250("Plzeň ěščřžýáíé ŮÚ – €");
    expect(Buffer.from("Plze").equals(bytes.subarray(0, 4))).toBe(true);
    expect(bytes[4]).toBe(0xf2); // ň
    expect([...bytes.subarray(6, 15)]).toEqual([0xec, 0x9a, 0xe8, 0xf8, 0x9e, 0xfd, 0xe1, 0xed, 0xe9]);
    expect(bytes[bytes.length - 1]).toBe(0x80); // €
    expect(new TextDecoder("windows-1250").decode(bytes)).toBe("Plzeň ěščřžýáíé ŮÚ – €");
  });

  it("writes a character Windows-1250 does not have as a character reference, so nothing turns into ?", () => {
    const bytes = encodeWindows1250("<a>中😀</a>");
    expect(bytes.toString("latin1")).toBe("<a>&#20013;&#128512;</a>");
  });

  it("the whole file decodes back to the same text", () => {
    const xml = pack([CZK_INVOICE, EUR_INVOICE, PARTIAL_CN, FULL_CN]);
    expect(new TextDecoder("windows-1250").decode(encodeWindows1250(xml))).toBe(xml);
  });
});

describe("helpers", () => {
  it("money has 2 decimals, a point and never -0.00; the rate is the stored one without trailing zeros", () => {
    expect(pohodaMoney("1234.5")).toBe("1234.50");
    expect(pohodaMoney(-0.001)).toBe("0.00");
    expect(pohodaMoney("-501")).toBe("-501.00");
    expect(pohodaRate("24.335000")).toBe("24.335");
    expect(pohodaRate("25.000000")).toBe("25");
    expect(pohodaRate("1.000000")).toBe("1");
  });

  it("cuts to Pohoda's length on whole characters", () => {
    expect(cut("  a  b ", 10)).toBe("a b");
    expect([...cut("😀".repeat(100), 90)]).toHaveLength(90);
  });

  it("maps the app's VAT codes to Pohoda's Členění DPH by the customer's seat", () => {
    expect(pohodaClassification("S21", "CZ")).toBe("UD");
    expect(pohodaClassification("RC", "DE")).toBe("USregEU");
    expect(pohodaClassification("RC", "CZ")).toBe("UDpdp");
    expect(pohodaClassification("OUT", "CN")).toBe("UDzahr");
    expect(pohodaClassification("OUT", "CZ")).toBe("UN");
    expect(pohodaClassification("Z69", "CZ")).toBeNull();
    expect(pohodaClassification("NP", "CZ")).toBeNull();
  });

  it("names what the accountant checks: no Členění DPH for §69, a 21 % VAT in EUR, an address cut", () => {
    const z69 = document({ id: "i-z", number: "INV-Z", issueDate: "2026-11-03", currency: "CZK", fxRate: "1", customer: CZ_CUSTOMER, lines: [line(1, "Import transport", 1, 900, "CZK", 900, "Z69")] });
    expect(pohodaNotes(z69)).toEqual(["no Členění DPH set for 0 % §69: pick it in Pohoda"]);
    const eur21 = document({ id: "i-e", number: "INV-E", issueDate: "2026-11-03", currency: "EUR", fxRate: "24.335", customer: CZ_CUSTOMER, lines: [line(1, "Storage", 1, 100, "EUR", 100, "S21")] });
    expect(pohodaNotes(eur21)).toEqual(["21 % VAT in EUR: compare Pohoda's CZK VAT with 511.04 CZK"]);
    const long = document({ id: "i-l", number: "INV-L", issueDate: "2026-11-03", currency: "CZK", fxRate: "1", customer: { ...CZ_CUSTOMER, address: "x".repeat(80) }, lines: CZK_INVOICE.lines });
    expect(pohodaNotes(long)).toEqual(["the customer's street cut to Pohoda's length"]);
  });

  it("a document with two VAT codes of different Členění has it on each item, not on the header", () => {
    const mixed = document({ id: "i-m", number: "INV-M", issueDate: "2026-11-03", currency: "CZK", fxRate: "1", customer: CZ_CUSTOMER, lines: [line(1, "Storage", 1, 100, "CZK", 100, "S21"), line(2, "Customs duty", 1, 2500, "CZK", 2500, "OUT")] });
    expect(pohodaProblem(mixed)).toBeNull();
    const xml = pack([mixed]);
    expect(inner(xml, "inv:invoiceHeader")).not.toContain("classificationVAT");
    expect(xml.match(/<typ:ids>(UD|UN)<\/typ:ids>/g)).toEqual(["<typ:ids>UD</typ:ids>", "<typ:ids>UN</typ:ids>"]);
    const home = inner(inner(xml, "inv:invoiceSummary")!, "inv:homeCurrency")!;
    expect(inner(home, "typ:priceNone")).toBe("2500.00");
    expect(inner(home, "typ:priceHigh")).toBe("100.00");
    expect(inner(home, "typ:priceHighVAT")).toBe("21.00");
  });

  it("names the file by its period", () => {
    expect(pohodaFileName("2026-11-01", "2026-11-30")).toBe("pohoda-invoices-2026-11-01-2026-11-30.xml");
  });
});
