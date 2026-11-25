import { describe, expect, it } from "vitest";
import { loadListOf } from "./loadList";
import { buildLoadListPdf, cellLines, CUT_MARK } from "./loadListPdf";

// What the PDF draws, as its page content holds it before it is compressed: Helvetica text stands there as written.
const drawn = (doc: ReturnType<typeof buildLoadListPdf>) => (doc.internal as unknown as { pages: (string[] | undefined)[] }).pages.flatMap((p) => p ?? []).join("\n");

const sailing = { vessel: "WEEK 51", voyage: "", pol: "Shanghai", pod: "Hamburg", hub: "Praha", containerType: "40' HC", containerCount: 1, cutoffDate: null, departureDate: null };
const row = {
  shipmentId: "s1",
  jobNumber: "CZLCL00000001",
  customer: "",
  status: "",
  counted: true,
  colli: 3,
  weightKg: 500,
  volumeCbm: 2,
  freightTons: 2,
  weightMissing: false,
  volumeMissing: false,
  dangerous: false,
  adr: [],
  notStackable: false,
  outOfGauge: false,
  temperatureControlled: false,
} as never;

describe("the load list PDF (Council Outlay 14, A8)", () => {
  it("prints the whole of a long delivery address: the row grows, nothing is cut at six lines", () => {
    const address = "Logisticke centrum Praha-Jih, hala C, rampa 12, Prumyslova 1472/11, 102 00 Praha 10 - Hostivar, Ceska republika, kontakt p. Novak +420 777 123 456, prijem 7:00-14:00";
    const list = loadListOf(sailing, "Import", [{ id: "s1", jobNumber: "CZLCL00000001", deliveryAddress: address }], [row], "2026-11-25");
    const doc = buildLoadListPdf(list);
    // The address takes more than six lines of its column.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    expect((doc.splitTextToSize(address, 24 - 3) as string[]).length).toBeGreaterThan(6);
    expect(drawn(doc)).toContain("14:00");
    expect(drawn(doc)).not.toContain(CUT_MARK);
  });

  it("cuts only a cell longer than a page, and marks it", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`);
    const cut = cellLines(lines);
    expect(cut.length).toBeLessThan(80);
    expect(cut.at(-1)).toBe(CUT_MARK);
    expect(cut.at(-2)).toBe(`line ${cut.length - 1}`);
    expect(cellLines(lines.slice(0, 12))).toEqual(lines.slice(0, 12));
    expect(cellLines(lines.slice(0, 5), 4)).toEqual(["line 1", "line 2", "line 3", CUT_MARK]);
  });
});
