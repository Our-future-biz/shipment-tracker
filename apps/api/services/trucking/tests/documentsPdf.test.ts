import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { buildTransportOrderPdf } from "../lib/transportOrderPdf";
import { buildCmrPdf } from "../lib/cmrPdf";
import { sampleCmr, sampleTransportOrder } from "./fixtures/documentSamples";

async function textOf(bytes: Uint8Array): Promise<string> {
  // pdf-parse takes over the buffer it is given; pass a copy so the bytes stay usable
  const parser = new PDFParse({ data: bytes.slice() });
  await (parser as unknown as { load(): Promise<void> }).load();
  return (await parser.getText()).text;
}

/** Text extraction may split words across runs; compare without whitespace. */
const squash = (t: string) => t.replace(/\s+/g, "");

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
const header = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString("latin1");

describe("transport order PDF", () => {
  it("prints the order, both languages, Czech characters, ADR and the PIN", async () => {
    const bytes = await buildTransportOrderPdf(sampleTransportOrder);
    expect(header(bytes)).toBe("%PDF-");
    const raw = await textOf(bytes);
    // a bilingual order writes figures for both readers: thousands apart, a decimal point
    expect(raw).toMatch(/1[ \u00a0]250\.5 kg/);
    expect(raw).toMatch(/12[ \u00a0]500\.00 CZK/);
    const text = squash(raw);
    for (const v of [
      "LCZ2026000001",
      "TCZ2026000001",
      "CZ00000042",
      "PŘEPRAVNÍPŘÍKAZ",
      "Transportorder",
      "MÍSTONAKLÁDKY/LOADINGPLACE",
      "Šťastný Transport a.s.",
      "Žižkova845",
      "Avízonutné/Avizacerequired",
      "1 250.5 kg",
      "42.125 m³",
      "UN1263",
      "Obalováskupina/Packinggroup",
      "12 500.00 CZK",
      "482913",
      "1AB2345/2CD6789",
      "16.10.2026",
      "9.",
    ]) {
      expect(text).toContain(squash(v));
    }
    // the long notes and terms run onto a second page, numbered "1 / 2"
    const pages = await pageCount(bytes);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(4);
    expect(text).toContain(`1/${pages}`);
  });

  it("leaves out the PIN box and the price block when not set", async () => {
    const bytes = await buildTransportOrderPdf({ ...sampleTransportOrder, language: "en", pickupPin: null, agreedPrice: null, podLink: null });
    const text = squash(await textOf(bytes));
    expect(text).not.toContain("482913");
    expect(text).not.toContain("PICK-UPPIN");
    expect(text).not.toContain("12,500.00");
    expect(text).not.toContain("PRICEANDPAYMENT");
    expect(text).toContain("TRANSPORTORDER");
    expect(text).toContain("1,250.5kg");
    expect(text).toContain("16Oct2026");
    expect(text).not.toContain("Místonakládky");
  });

  it("prints Czech only labels for a Czech order", async () => {
    const raw = await textOf(await buildTransportOrderPdf({ ...sampleTransportOrder, language: "cs", terms: [] }));
    const text = squash(raw);
    expect(text).toContain("MÍSTONAKLÁDKY");
    expect(text).not.toContain("Loadingplace");
    // and Czech figures: thousands apart, a decimal comma
    expect(raw).toMatch(/1[ \u00a0]250,5 kg/);
    expect(raw).toMatch(/42,125 m³/);
    expect(raw).toMatch(/12[ \u00a0]500,00 CZK/);
  });

  it("prints a short order without ADR on fewer pages", async () => {
    const rich = await pageCount(await buildTransportOrderPdf(sampleTransportOrder));
    const bytes = await buildTransportOrderPdf({
      ...sampleTransportOrder,
      pickup: { ...sampleTransportOrder.pickup, notes: "" },
      load: { ...sampleTransportOrder.load, adr: null },
      terms: ["Dle VOP."],
    });
    const pages = await pageCount(bytes);
    expect(pages).toBeLessThan(rich);
    expect(pages).toBeLessThanOrEqual(2);
    const text = squash(await textOf(bytes));
    expect(text).not.toContain("UN1263");
    expect(text).not.toContain("ADR–");
  });
});

describe("transport order signatures", () => {
  /** Text of the last page (pdf-parse ends every page with "-- n of N --"). */
  const lastPage = (text: string) => text.split(/--\s*\d+\s+of\s+\d+\s*--/).filter((p) => p.trim()).at(-1) ?? "";

  it("never stand alone: the last terms move to the signatures' page under a continued title", async () => {
    const bytes = await buildTransportOrderPdf(sampleTransportOrder);
    const last = squash(lastPage(await textOf(bytes)));
    expect(last).toContain("PODMÍNKY/TERMSANDCONDITIONS(POKRAČOVÁNÍ/CONTINUED)");
    expect(last).toContain("Podmínka9:");
    expect(last).toContain("Podmínka8:");
    expect(last).toContain("ZAZASÍLATELE/FORTHEFORWARDER");
    expect(last).toContain("Podpisarazítko/Signatureandstamp");
  });

  it("keeps an order with two short terms on as few pages as before", async () => {
    const bytes = await buildTransportOrderPdf({ ...sampleTransportOrder, terms: ["Dle VOP.", "Platba do 30 dní."] });
    expect(await pageCount(bytes)).toBe(2);
    const last = squash(lastPage(await textOf(bytes)));
    expect(last).toContain("Platbado30dní.");
    expect(last).toContain("ZADOPRAVCE/FORTHEHAULIER");
  });
});

describe("consignment note PDF", () => {
  it("prints the numbered boxes with the consignment's data on one page", async () => {
    const bytes = await buildCmrPdf(sampleCmr);
    expect(header(bytes)).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(1);
    const text = squash(await textOf(bytes));
    for (const v of [
      "NÁKLADNÍLIST",
      "Consignmentnote",
      "TCZ2026000001",
      "Odesílatel(jméno,adresa)/Sender(name,address)",
      "Odesílatel Kladno, s.r.o.",
      "Odběratel Ostrava, s.r.o.",
      "Šťastný Transport a.s.",
      "1AB2345/2CD6789",
      "ADR:UN1263",
      "1 250.5",
      "Dodací list č. 2026/1187",
      "Zbožípřevzal",
    ]) {
      expect(text).toContain(squash(v));
    }
  });

  it("prints English labels and an empty carrier box when the haulier is not known", async () => {
    const raw = await textOf(await buildCmrPdf({ ...sampleCmr, language: "en", carrier: null, plates: "" }));
    const text = squash(raw);
    expect(text).toContain("CONSIGNMENTNOTE");
    expect(text).toContain("1,250.5");
    expect(text).toContain("Carrier(name,address,plates)");
    expect(text).not.toContain("ŠťastnýTransport");
    expect(text).not.toContain("Odesílatel(");
  });
});
