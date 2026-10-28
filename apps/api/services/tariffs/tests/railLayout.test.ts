import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { layoutProblem, parseRailLayout, tidyAiLayout } from "../lib/railLayout";

// A layout as the AI answers it: letters and codes in any case, padded text.
const AI_ANSWER = {
  sheet: "26Road",
  headerRow: 18,
  firstDataRow: 19,
  lastDataRow: null,
  columns: { country: "a", postcode: "B", place: "C", region: "O", via: "D", emptyDepot: "D", note: "L", validFrom: "M", validTo: "N" },
  bands: [
    { column: "e", label: " 20' 0<14 t ", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 14 },
    { column: "H", label: "21'-29' 0<32 t", minLengthFt: 21, maxLengthFt: 29, maxGrossTonnes: 32 },
  ],
  currency: "eur",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  defaultCountry: "cz",
  conditions: ["All-in rate including T1 / BHT / ZAP and road tolls"],
  links: [{ label: "Surcharges", url: "https://example.com/surcharges" }],
  name: "Hamburg – Czechia",
};

describe("parseRailLayout", () => {
  it("tidies an AI answer: upper-case letters and codes, trimmed text", () => {
    const layout = parseRailLayout(AI_ANSWER);
    expect(layout.columns.country).toBe("A");
    expect(layout.bands[0]).toEqual({ column: "E", label: "20' 0<14 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 14 });
    expect(layout.currency).toBe("EUR");
    expect(layout.defaultCountry).toBe("CZ");
  });

  it("drops ports and direction from a layout that still has them: the user ticks those on the tariff", () => {
    const layout = parseRailLayout({ ...AI_ANSWER, ports: [{ code: "DEHAM", name: "Hamburg" }], direction: "both" });
    expect(layout).not.toHaveProperty("ports");
    expect(layout).not.toHaveProperty("direction");
  });

  it.each([
    ["a price row above the headings", { firstDataRow: 10 }, "firstDataRow"],
    ["a validity that ends before it starts", { validTo: "2025-12-31" }, "validTo"],
    ["a date that does not exist", { validFrom: "2026-02-30" }, "validFrom"],
    ["a price column listed twice", { bands: [AI_ANSWER.bands[0], AI_ANSWER.bands[0]] }, "bands"],
    ["a band whose shortest length is longer than its longest", { bands: [{ ...AI_ANSWER.bands[0], minLengthFt: 40 }] }, "bands.0"],
    ["a link that is no web link", { links: [{ label: "x", url: "javascript:alert(1)" }] }, "links.0.url"],
    ["no place column", { columns: { ...AI_ANSWER.columns, place: null } }, "columns.place"],
    ["a last price row above the first", { lastDataRow: 12 }, "lastDataRow"],
  ])("refuses %s, naming where", (_, change, where) => {
    expect(() => parseRailLayout({ ...AI_ANSWER, ...change })).toThrow(expect.objectContaining({ code: "invalid_argument", message: expect.stringContaining(where) }));
  });
});

describe("tidyAiLayout", () => {
  it("lets small slips of the AI through instead of refusing the upload", () => {
    const layout = parseRailLayout(
      tidyAiLayout({
        ...AI_ANSWER,
        lastDataRow: undefined,
        links: [
          { label: "Mail", url: "mailto:sales@example.com" },
          { label: "Web", url: "www.example.com" },
        ],
        conditions: ["x".repeat(600), "", ...Array.from({ length: 40 }, (_, i) => `term ${i}`)],
        defaultCountry: "",
        name: " ",
      }),
    );
    expect(layout.lastDataRow).toBeNull();
    expect(layout.links).toEqual([{ label: "Web", url: "https://www.example.com" }]);
    expect(layout.conditions).toHaveLength(30);
    expect(layout.conditions[0]).toHaveLength(500);
    expect(layout.defaultCountry).toBe("CZ");
    expect(layout.name).toBe("Rail tariff");
  });

  it("leaves what it says about rows, columns and prices to the checks", () => {
    expect(() => parseRailLayout(tidyAiLayout({ ...AI_ANSWER, firstDataRow: 10 }))).toThrow(expect.objectContaining({ code: "invalid_argument" }));
  });
});

describe("layoutProblem", () => {
  const layout = parseRailLayout(AI_ANSWER);

  it("is null when the sheet is there and long enough", () => {
    expect(layoutProblem(layout, [{ name: "26Road", rowCount: 9071 }])).toBeNull();
  });

  it("names a missing sheet or one too short", () => {
    expect(layoutProblem(layout, [{ name: "Sheet1", rowCount: 9071 }])).toBe('The file has no sheet "26Road"');
    expect(layoutProblem(layout, [{ name: "26Road", rowCount: 12 }])).toBe('Sheet "26Road" has only 12 rows');
  });
});
