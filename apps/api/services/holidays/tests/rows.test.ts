import { describe, expect, it } from "vitest";
import { cleanRow, isUsableRow, mapHeaders, normalizeDate, parseRowsJson, rowKey } from "../lib/rows";

describe("normalizeDate", () => {
  it("reads the date formats files bring", () => {
    expect(normalizeDate("2026-12-24")).toBe("2026-12-24");
    expect(normalizeDate("24.12.2026")).toBe("2026-12-24");
    expect(normalizeDate("24/12/2026")).toBe("2026-12-24");
    expect(normalizeDate(new Date(Date.UTC(2026, 11, 24)))).toBe("2026-12-24");
    expect(normalizeDate(46380)).toBe("2026-12-24"); // Excel serial
  });

  it("gives blank for anything that is not a date", () => {
    expect(normalizeDate("")).toBe("");
    expect(normalizeDate("31.02.2026")).toBe("");
    expect(normalizeDate("Christmas")).toBe("");
  });
});

describe("mapHeaders", () => {
  it("matches the World Holidays sheet headers, also when cut short", () => {
    const map = mapHeaders([
      "Country", "Country cod", "National holiday", "National start dat", "National end dat",
      "Regional holiday", "Regional start dat", "Regional end dat", "Region(s) / subdivision(s)",
    ]);
    expect(map && [...map.values()]).toEqual([
      "country", "countryCode", "nationalHoliday", "nationalStart", "nationalEnd",
      "regionalHoliday", "regionalStart", "regionalEnd", "regions",
    ]);
  });

  it("refuses a sheet that isn't a holiday list", () => {
    expect(mapHeaders(["Job", "Customer", "ETD"])).toBeNull();
  });
});

describe("cleanRow / isUsableRow / rowKey", () => {
  it("fills a one-day holiday's end date and upper-cases the code", () => {
    const row = cleanRow({ country: " Czech Republic ", countryCode: "cz", nationalHoliday: "Christmas Eve", nationalStart: "24.12.2026" });
    expect(row).toMatchObject({ country: "Czech Republic", countryCode: "CZ", nationalStart: "2026-12-24", nationalEnd: "2026-12-24" });
    expect(isUsableRow(row)).toBe(true);
  });

  it("needs a country and a dated holiday", () => {
    expect(isUsableRow(cleanRow({ nationalHoliday: "X", nationalStart: "2026-01-01" }))).toBe(false);
    expect(isUsableRow(cleanRow({ country: "Austria", nationalHoliday: "X" }))).toBe(false);
  });

  it("treats the same holiday written differently as one", () => {
    const a = cleanRow({ country: "Austria", nationalHoliday: "Epiphany", nationalStart: "06.01.2026" });
    const b = cleanRow({ country: "austria", nationalHoliday: "Epiphany", nationalStart: "2026-01-06", nationalEnd: "2026-01-06" });
    expect(rowKey(a)).toBe(rowKey(b));
  });
});

describe("parseRowsJson", () => {
  it("finds the array in the model's reply", () => {
    expect(parseRowsJson('```json\n[{"country":"Hungary"}]\n```')).toEqual([{ country: "Hungary" }]);
    expect(parseRowsJson("no data")).toEqual([]);
  });
});
