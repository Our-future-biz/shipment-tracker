import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUOTE_FIELDS } from "../lib/fields";
import { QUOTE_PROMPT } from "../lib/prompts";
import { QUOTE_CONTAINER_KINDS, QUOTE_DIRECTIONS, QUOTE_FREIGHT_MODES, QUOTE_INCOTERMS, QUOTE_PACKING_TYPES, containerType, normalizeQuoteFields, packageType } from "../lib/quoteFields";

const webFile = (path: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../web/src", path), "utf8");
const one = (label: string, value: string) => normalizeQuoteFields({ [label]: value })[label];

describe("normalizeQuoteFields", () => {
  it("keeps only the quote's labels, in their order, and leaves the record alone", () => {
    const raw = {
      "Selling price": "1200 EUR",
      "Volume (cbm)": "14.5",
      "Total Amount": "5000",
      Currency: "EUR",
      Rate: "25.3",
      Shipper: "X Ltd",
      "Personal Reference": "PO-1",
      __type__: "HBL",
      Customer: "ACME s.r.o.",
      Origin: "Hamburg, Germany",
    };
    const copy = { ...raw };
    const out = normalizeQuoteFields(raw);
    expect(Object.keys(out)).toEqual(["Customer", "Origin", "Volume (cbm)"]);
    expect(raw).toEqual(copy);
  });

  it.each(["Customer", "Contact person", "Pickup", "Delivery", "Cargo Description", "Origin", "Destination"])("reads %s as one line of text", (label) => {
    expect(one(label, "  Machine   parts  ")).toBe("Machine parts");
    expect(one(label, "Street 1\n110 00 Praha\r\nCZ")).toBe("Street 1, 110 00 Praha, CZ");
    expect(one(label, "x".repeat(400))).toHaveLength(300);
    expect(one(label, "   ")).toBeUndefined();
  });

  // What a reader writes into a field the document leaves open is no value.
  it.each(["Customer", "Contact person", "Pickup", "Delivery", "Cargo Description", "Origin", "Destination"])("drops a filler in %s", (label) => {
    for (const nothing of ["N/A", "n.a.", "-", "—", "null", "None", "not stated", "Not mentioned.", "(none)", "TBA"]) {
      expect(one(label, nothing), nothing).toBeUndefined();
    }
    for (const real of ["N.A. Trading Ltd", "None Ltd", "TBC Bank", "Namibia"]) expect(one(label, real), real).toBe(real);
  });

  it.each([
    ["Import", "Import"],
    ["IMPORT", "Import"],
    ["imp", "Import"],
    ["Export", "Export"],
    ["EXP", "Export"],
    ["transit", undefined],
    ["both", undefined],
    ["n/a", undefined],
  ])("Trade Direction %s -> %s", (read, stored) => {
    expect(one("Trade Direction", read)).toBe(stored);
  });

  it.each<[string, string | undefined]>([
    ...QUOTE_FREIGHT_MODES.flatMap((mode): [string, string][] => [
      [mode.toUpperCase(), mode],
      [mode.toLowerCase(), mode],
    ]),
    ["FCL", "Sea FCL"],
    ["lcl", "Sea LCL"],
    ["sea lcl", "Sea LCL"],
    ["Air freight", "Air"],
    ["airfreight", "Air"],
    ["by truck", "Road"],
    ["FTL", "Road"],
    ["break bulk", "Sea Break Bulk"],
    ["Breakbulk", "Sea Break Bulk"],
    ["railway", "Rail"],
    ["sea", undefined],
    ["ocean", undefined],
    ["courier", undefined],
    ["FCL/LCL", undefined],
    ["air or sea lcl", undefined],
    ["air or sea", undefined],
    ["Sea-Air", undefined],
    ["Seafreight or airfreight", undefined],
    ["rail or ocean", undefined],
    ["Sea freight LCL", "Sea LCL"],
    ["Ocean FCL", "Sea FCL"],
    ["Air to Seattle", "Air"],
  ])("Freight Mode %s -> %s", (read, stored) => {
    expect(one("Freight Mode", read)).toBe(stored);
  });

  it.each([
    ["fob", "FOB"],
    ["FOB Shanghai", "FOB"],
    ["Incoterms 2020: DAP", "DAP"],
    ["DAT", undefined],
    ["free on board", undefined],
    ["CIF or FOB", undefined],
    ["XYZ", undefined],
  ])("Incoterms %s -> %s", (read, stored) => {
    expect(one("Incoterms", read)).toBe(stored);
  });

  it.each([
    ["2026-03-15", "2026-03-15"],
    ["2026-03-15T00:00:00Z", "2026-03-15"],
    ["2026-02-31", undefined],
    ["15.03.2026", undefined],
    ["ASAP", undefined],
    ["next week", undefined],
    ["2026-03", undefined],
  ])("Cargo Readiness Date %s -> %s", (read, stored) => {
    expect(one("Cargo Readiness Date", read)).toBe(stored);
  });

  it.each([
    ["12500", "12500"],
    ["12500.50", "12500.5"],
    ["12 500", "12500"],
    ["12 500 kg", "12500"],
    ["2400 kgs", "2400"],
    ["0.0004", undefined],
    ["0", undefined],
    ["-5", undefined],
    ["12,500", undefined],
    ["1,250.5", undefined],
    ["2.5 t", undefined],
    ["1e3", undefined],
    ["12 5", undefined],
    ["heavy", undefined],
    // A dot in front of exactly three digits can group thousands; it is not guessed at.
    ["12.500 kg", undefined],
    ["12.500", undefined],
    ["1.250 kg", undefined],
    ["0.500 kg", "0.5"],
    ["2400.500", "2400.5"],
  ])("Gross weight (kg) %s -> %s", (read, stored) => {
    expect(one("Gross weight (kg)", read)).toBe(stored);
  });

  it.each([
    ["14.5", "14.5"],
    ["14.500 cbm", "14.5"],
    ["14.5 m3", "14.5"],
    ["14.5 m³", "14.5"],
    ["14,5", undefined],
    ["abc", undefined],
  ])("Volume (cbm) %s -> %s", (read, stored) => {
    expect(one("Volume (cbm)", read)).toBe(stored);
  });

  it("takes the address out of an e-mail value and drops a value without one", () => {
    expect(one("Email", "Jan Novak <jan@acme.cz>")).toBe("jan@acme.cz");
    expect(one("Email", "none")).toBeUndefined();
    expect(one("Email", "call me")).toBeUndefined();
    expect(one("Email", "'jan@acme.cz'")).toBe("jan@acme.cz");
    expect(one("Email", "Jan.Novak@ACME.cz.")).toBe("Jan.Novak@ACME.cz");
  });

  it("drops an e-mail address it could only read from the middle of a word", () => {
    expect(one("Email", "müller@firma.de")).toBeUndefined();
    expect(one("Email", "o'brien@acme.ie")).toBeUndefined();
    expect(one("Email", "müller@firma.de, jan@firma.de")).toBe("jan@firma.de");
  });

  it("keeps a phone with at least six digits, cut at 50 characters", () => {
    expect(one("Phone", "+420 123 456 789")).toBe("+420 123 456 789");
    expect(one("Phone", "x12")).toBeUndefined();
    expect(one("Phone", "1".repeat(60))).toHaveLength(50);
  });
});

describe("containers and packages", () => {
  it("names a container type the way the quote does, from the ways documents write it", () => {
    expect(containerType("40HC")).toBe("40' HC");
    expect(containerType("40' high cube")).toBe("40' HC");
    expect(containerType("40ft HQ")).toBe("40' HC");
    expect(containerType("20GP")).toBe("20' DC");
    expect(containerType("20' DV")).toBe("20' DC");
    expect(containerType("40 dry")).toBe("40' DC");
    expect(containerType("40' reefer")).toBe("40' HRF");
    expect(containerType("20RF")).toBe("20' RF");
    expect(containerType("45HC")).toBe("45' HQ");
    expect(containerType("40 open top")).toBe("40' OT");
    expect(containerType("20' FR")).toBe("20' FR");
    expect(containerType("40' HC container")).toBe("40' HC");
    expect(containerType("40ft container")).toBe("40' DC");
    expect(containerType("20' reefer cntr")).toBe("20' RF");
  });

  it("has no type for a size or kind the quote does not offer", () => {
    expect(containerType("20HC")).toBeUndefined();
    expect(containerType("53' HC")).toBeUndefined();
    expect(containerType("40 tank")).toBeUndefined();
    expect(containerType("container")).toBeUndefined();
  });

  it("reads the containers asked for, with the cargo weight in one when stated", () => {
    expect(one("Containers", "1 x 40' HC")).toBe("1 x 40' HC");
    expect(one("Containers", "2x20GP, 18 000 kg; 1 x 40HC")).toBe("2 x 20' DC, 18000 kg; 1 x 40' HC");
    expect(one("Containers", "1 x 40HC\n3 x 20' DC")).toBe("1 x 40' HC; 3 x 20' DC");
    expect(one("Containers", "2 x 40' HC containers")).toBe("2 x 40' HC");
  });

  it("leaves out the whole list when one entry cannot be read", () => {
    expect(one("Containers", "1 x 40' HC; 2 x 40 tank")).toBeUndefined();
    expect(one("Containers", "1 x 40' HC, 18 t")).toBeUndefined();
    expect(one("Containers", "some containers")).toBeUndefined();
  });

  it("reads the pieces with their package type, size and weight per piece", () => {
    expect(one("Packages", "4 x Pallets, 120 x 80 x 150 cm, 450 kg each")).toBe("4 x Pallets, 120 x 80 x 150 cm, 450 kg each");
    expect(one("Packages", "2 cartons, 60x40x40 cm; 3 pcs, 200 x 100 x 90 cm, 120 kg")).toBe("2 x Cartons, 60 x 40 x 40 cm; 3 pcs, 200 x 100 x 90 cm, 120 kg each");
    expect(one("Packages", "6 x euro pallets")).toBe("6 x Pallets");
    expect(one("Packages", "1 x Wooden box, 250 x 120 x 140 cm, 1 200 kg each")).toBe("1 x Wooden boxes, 250 x 120 x 140 cm, 1200 kg each");
  });

  it("leaves out the whole list when one entry cannot be read", () => {
    expect(one("Packages", "4 x Pallets; 2 x rolls")).toBeUndefined();
    expect(one("Packages", "4 x Pallets, 1.2 x 0.8 x 1.5 m")).toBeUndefined();
    expect(one("Packages", "pallets")).toBeUndefined();
    expect(packageType("rolls")).toBeUndefined();
    expect(packageType("pcs")).toBe("");
  });
});

describe("the quote's lists and the web's", () => {
  const list = (name: string) => {
    const found = webFile("app/sales/_lib/types.ts").match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
    expect(found, `${name} not found in types.ts`).not.toBeNull();
    return [...found![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };

  it("offer the same options as the Sales quote page", () => {
    expect(list("DIRECTIONS")).toEqual([...QUOTE_DIRECTIONS]);
    expect(list("SERVICE_TYPES")).toEqual([...QUOTE_FREIGHT_MODES]);
    // The web keeps the Incoterms in one list for every picker: the codes of INCOTERM_NAMES.
    const names = webFile("lib/incoterms.ts").match(/export const INCOTERM_NAMES[^{]*\{([^}]*)\}/);
    expect(names, "INCOTERM_NAMES not found in lib/incoterms.ts").not.toBeNull();
    expect([...names![1]!.matchAll(/^\s*([A-Z]{3}):/gm)].map((m) => m[1])).toEqual([...QUOTE_INCOTERMS]);
    expect(list("PACKING_TYPES")).toEqual([...QUOTE_PACKING_TYPES]);
    // The container types are CONTAINER_KINDS_BY_SIZE of lib/cargo.ts, a line per size.
    const kinds = webFile("lib/cargo.ts").match(/export const CONTAINER_KINDS_BY_SIZE[^{]*\{([^}]*)\}/);
    expect(kinds, "CONTAINER_KINDS_BY_SIZE not found in lib/cargo.ts").not.toBeNull();
    const bySize = Object.fromEntries([...kinds![1]!.matchAll(/"(\d+')": \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2]!.matchAll(/"([^"]+)"/g)].map((k) => k[1])]));
    expect(bySize).toEqual(QUOTE_CONTAINER_KINDS);
  });

  /**
   * The web maps each label to a key of the quote (quoteReading.ts). The two lists must name the
   * same labels, and no label may reach a key the reading must never write.
   */
  it("name the labels the web's table maps, and only keys a reading may write", () => {
    const rows = [...webFile("app/documents/_lib/quoteReading.ts").matchAll(/\{ label: "([^"]+)", key: "(\w+)", kind: "(\w+)"/g)].map((m) => ({
      label: m[1]!,
      key: m[2]!,
      kind: m[3]!,
    }));
    expect(rows.map((r) => r.label)).toEqual(QUOTE_FIELDS);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);

    const forbidden = [...list("PROTECTED_KEYS"), "customerId", "customerLabel", "buyingLines", "sellingLines", "currency", "rates"];
    expect(rows.filter((r) => forbidden.includes(r.key))).toEqual([]);

    const ofKind = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.label);
    expect(ofKind("number")).toEqual(["Gross weight (kg)", "Volume (cbm)"]);
    expect(ofKind("option")).toEqual(["Trade Direction", "Freight Mode", "Incoterms"]);
    expect(ofKind("date")).toEqual(["Cargo Readiness Date"]);
    expect(ofKind("containers")).toEqual(["Containers"]);
    expect(ofKind("packages")).toEqual(["Packages"]);
  });

  it("read the two places with the place picker", () => {
    const geo = webFile("lib/places.ts").match(/export const LABEL_GEO_FIELDS[^{]*\{([^}]*)\}/);
    expect(geo, "LABEL_GEO_FIELDS not found in places.ts").not.toBeNull();
    expect(geo![1]).toContain('Origin: "place"');
    expect(geo![1]).toContain('Destination: "place"');
  });
});

describe("QUOTE_FIELDS and QUOTE_PROMPT", () => {
  it("hold 17 labels and nothing about money", () => {
    expect(QUOTE_FIELDS).toHaveLength(17);
    expect(new Set(QUOTE_FIELDS).size).toBe(17);
    expect(QUOTE_FIELDS.filter((label) => /price|rate|amount|currency|cost|value/i.test(label))).toEqual([]);
  });

  it("tell the reader every label, every option and to leave prices out", () => {
    for (const label of QUOTE_FIELDS) expect(QUOTE_PROMPT).toContain(label);
    for (const option of [...QUOTE_DIRECTIONS, ...QUOTE_FREIGHT_MODES]) expect(QUOTE_PROMPT).toContain(`"${option}"`);
    expect(QUOTE_PROMPT).toContain("Never extract prices");
    expect(QUOTE_PROMPT).toContain("Every value is a JSON string");
  });
});
