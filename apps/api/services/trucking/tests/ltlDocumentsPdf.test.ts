import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { buildManifestPdf } from "../lib/manifestPdf";
import { buildLabelsPdf } from "../lib/labelsPdf";
import { buildLtlTransportOrderPdf } from "../lib/ltlTransportOrderPdf";
import { sampleLabels, sampleLtlTransportOrder, sampleManifest } from "./fixtures/ltlDocumentSamples";

/** Text of every page; pdf-parse takes over the buffer it is given, so it gets a copy. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const parser = new PDFParse({ data: bytes.slice() });
  await (parser as unknown as { load(): Promise<void> }).load();
  return (await parser.getText()).pages.map((p) => squash(p.text));
}

/** Text extraction may split words across runs; compare without whitespace. */
const squash = (t: string) => t.replace(/\s+/g, "");
const header = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString("latin1");
const pageSizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getSize());

describe("manifest PDF", () => {
  it("prints the trip, every row, totals, capacity and signatures on landscape pages", async () => {
    const bytes = await buildManifestPdf(sampleManifest);
    expect(header(bytes)).toBe("%PDF-");
    const pages = await pageTexts(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.length).toBeLessThanOrEqual(4);
    const text = pages.join("");
    for (const v of [
      "NAKLÁDACÍ LIST",
      "Loading manifest",
      "LCZ2026000007",
      "Linehaul / Line haul",
      "16. 10. 2026",
      "Šťastný Transport a.s.",
      "1AB2345 / 2CD6789",
      "Depo Praha – Zličín",
      "TCZ2026001000",
      "TCZ2026001039",
      "602 00 Brno",
      "České Budějovice",
      "UN 1263, 3, II",
      "18 450", // total kg
      "Celkem / Total",
      "13,6 LDM / 24 000 kg — 82 % LDM, 41 % kg",
      "NALOŽIL / LOADED BY",
      "PŘEVZAL (MÍSTO URČENÍ) / RECEIVED AT",
    ]) {
      expect(text).toContain(squash(v));
    }
    expect(pages[0]).toContain(`1/${pages.length}`);
    for (const size of await pageSizes(bytes)) expect(size.width).toBeGreaterThan(size.height);
  });

  it("repeats the table header on the next page", async () => {
    const pages = await pageTexts(await buildManifestPdf(sampleManifest));
    expect(pages[1]).toContain(squash("(POKRAČOVÁNÍ / CONTINUED)"));
    expect(pages[1]).toContain(squash("Zásilka / Consignment"));
    expect(pages[1]).toContain(squash("Poznámky / Notes"));
  });

  it("prints English only, and a run with many delivery stops", async () => {
    const text = (await pageTexts(await buildManifestPdf({ ...sampleManifest, language: "en", to: null }))).join("");
    expect(text).toContain("LOADINGMANIFEST");
    expect(text).toContain("Severaldeliverystops");
    expect(text).toContain("18,450");
    expect(text).not.toContain("Zásilka");
  });
});

describe("labels PDF", () => {
  it("prints one 100 × 150 mm page per label", async () => {
    const bytes = await buildLabelsPdf(sampleLabels);
    expect(header(bytes)).toBe("%PDF-");
    const sizes = await pageSizes(bytes);
    expect(sizes).toHaveLength(3);
    for (const s of sizes) {
      expect(s.width).toBeCloseTo(283.46, 1);
      expect(s.height).toBeCloseTo(425.2, 1);
    }
  });

  it("prints destination, consignee, ref, piece number, zone, service and the marks when set", async () => {
    const [first, adr, whole] = await pageTexts(await buildLabelsPdf(sampleLabels));
    for (const v of ["702 00", "Ostrava", "Odběratel Ostrava, s.r.o.", "Mostní 1", "TCZ2026001234", "1 / 3", "MS-2", "+1 den", "Barvy Šťastný s.r.o., Kladno", "CZ00000142", "412,5 kg"]) {
      expect(first).toContain(squash(v));
    }
    expect(first).not.toContain("TAILLIFT");
    expect(first).not.toContain("ADR");
    expect(adr).toContain("2/3");
    expect(adr).toContain("TAILLIFT");
    expect(adr).toContain("ADR");
    expect(whole).toContain("37001");
    expect(whole).toContain("ČeskéBudějovice");
    expect(whole).toContain("TCZ2026001240");
    expect(whole).toContain("12");
    expect(whole).not.toContain("/3");
  });

  it("refuses an empty list", async () => {
    await expect(buildLabelsPdf([])).rejects.toThrow();
  });
});

describe("LTL transport order PDF", () => {
  it("prints the stops table with totals, the PIN, the POD link and the signatures", async () => {
    const bytes = await buildLtlTransportOrderPdf(sampleLtlTransportOrder);
    expect(header(bytes)).toBe("%PDF-");
    const pages = await pageTexts(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.length).toBeLessThanOrEqual(4);
    const text = pages.join("");
    for (const v of [
      "PŘEPRAVNÍ PŘÍKAZ",
      "LCZ2026000009",
      "ZASTÁVKY / STOPS",
      "Nakládka / Pick-up",
      "Vykládka / Delivery",
      "Železářství Kutná Hora",
      "16. 10. 2026, 07:00–09:00",
      "Avízo nutné / Avizace required",
      "ADR UN 1263, 3",
      "Celkem / Total",
      "1 320 kg",
      "2,4 LDM",
      "482913",
      "tracker.example.cz/trucking/pod",
      "1AB2345 / 2CD6789",
      "12 500,00 CZK",
      "ZA ZASÍLATELE / FOR THE FORWARDER",
      "Počet zastávek / Number of stops",
    ]) {
      expect(text).toContain(squash(v));
    }
    for (const s of sampleLtlTransportOrder.stops) expect(text).toContain(s.consignmentRef);
    expect(pages[0]).toContain(`1/${pages.length}`);
  });

  it("prints English only and leaves out the PIN when not set", async () => {
    const text = (await pageTexts(await buildLtlTransportOrderPdf({ ...sampleLtlTransportOrder, language: "en", pickupPin: null }))).join("");
    expect(text).toContain("TRANSPORTORDER");
    expect(text).toContain("1,320kg");
    expect(text).not.toContain("482913");
    expect(text).not.toContain("Zastávky");
  });
});
