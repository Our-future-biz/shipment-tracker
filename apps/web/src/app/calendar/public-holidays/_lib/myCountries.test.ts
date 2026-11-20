import { describe, expect, it } from "vitest";
import { listedCountries, ofMyCountries, rowCountry, type HolidayItem } from "./holidays";

const row = (country: string, countryCode: string): HolidayItem => ({
  id: `${country}-${countryCode}`,
  source: "test",
  createdAt: "2026-01-01T00:00:00Z",
  country,
  countryCode,
  nationalHoliday: "Holiday",
  nationalStart: "2026-11-17",
  nationalEnd: "",
  regionalHoliday: "",
  regionalStart: "",
  regionalEnd: "",
  regions: "",
});

const ITEMS = [row("Germany", "DE"), row("Austria", "AT"), row("", "SK"), row("Germany", "DE")];

describe("my countries on the holiday list", () => {
  it("names a row by its country, else its code", () => {
    expect(rowCountry(row("", "SK"))).toBe("SK");
    expect(rowCountry(row("Germany", "DE"))).toBe("Germany");
    expect(rowCountry(row(" ", " sk "))).toBe("SK");
  });

  it("offers each country once, in order", () => {
    expect(listedCountries(ITEMS)).toEqual(["Austria", "Germany", "SK"]);
  });

  it("keeps only the user's countries, every row for every country, the Czech rows for no other country", () => {
    expect(ofMyCountries(ITEMS, ["Germany", "SK"]).map(rowCountry)).toEqual(["Germany", "SK", "Germany"]);
    expect(ofMyCountries(ITEMS, null)).toHaveLength(4);
    expect(ofMyCountries(ITEMS, ["France"])).toEqual([]);
    // Mock council R21: "no other country" is the Czech holidays, as the year calendar shows them.
    expect(ofMyCountries([...ITEMS, row("Czech Republic", " cz")], []).map(rowCountry)).toEqual(["Czech Republic"]);
  });
});
