import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUOTE_FIELDS } from "../lib/fields";
import { QUOTE_PROMPT } from "../lib/prompts";
import { QUOTE_DIRECTIONS, QUOTE_FREIGHT_MODES, QUOTE_INCOTERMS, normalizeQuoteFields } from "../lib/quoteFields";

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
  ])("Incoterm %s -> %s", (read, stored) => {
    expect(one("Incoterm", read)).toBe(stored);
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

describe("the quote's lists and the web's", () => {
  const list = (name: string) => {
    const found = webFile("app/sales/_lib/types.ts").match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
    expect(found, `${name} not found in types.ts`).not.toBeNull();
    return [...found![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };

  it("offer the same options as the Sales quote page", () => {
    expect(list("DIRECTIONS")).toEqual([...QUOTE_DIRECTIONS]);
    expect(list("SERVICE_TYPES")).toEqual([...QUOTE_FREIGHT_MODES]);
    expect(list("INCOTERMS")).toEqual([...QUOTE_INCOTERMS]);
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
    expect(ofKind("option")).toEqual(["Trade Direction", "Freight Mode", "Incoterm"]);
    expect(ofKind("date")).toEqual(["Cargo Readiness Date"]);
  });

  it("read the two places with the place picker", () => {
    const geo = webFile("lib/places.ts").match(/export const LABEL_GEO_FIELDS[^{]*\{([^}]*)\}/);
    expect(geo, "LABEL_GEO_FIELDS not found in places.ts").not.toBeNull();
    expect(geo![1]).toContain('Origin: "place"');
    expect(geo![1]).toContain('Destination: "place"');
  });
});

describe("QUOTE_FIELDS and QUOTE_PROMPT", () => {
  it("hold 15 labels and nothing about money", () => {
    expect(QUOTE_FIELDS).toHaveLength(15);
    expect(new Set(QUOTE_FIELDS).size).toBe(15);
    expect(QUOTE_FIELDS.filter((label) => /price|rate|amount|currency|cost|value/i.test(label))).toEqual([]);
  });

  it("tell the reader every label, every option and to leave prices out", () => {
    for (const label of QUOTE_FIELDS) expect(QUOTE_PROMPT).toContain(label);
    for (const option of [...QUOTE_DIRECTIONS, ...QUOTE_FREIGHT_MODES]) expect(QUOTE_PROMPT).toContain(`"${option}"`);
    expect(QUOTE_PROMPT).toContain("Never extract prices");
    expect(QUOTE_PROMPT).toContain("Every value is a JSON string");
  });
});
