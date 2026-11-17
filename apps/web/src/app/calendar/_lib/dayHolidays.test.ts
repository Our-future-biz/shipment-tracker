import { describe, expect, it, vi } from "vitest";
import { flagOf, isCzechHoliday, listCountries, shownHolidays, withUnofferedPicks, yearHolidays } from "./dayHolidays";
import { holidayKey } from "./calendar";
import type { HolidayItem } from "../public-holidays/_lib/holidays";

const row = (over: Partial<HolidayItem>): HolidayItem => ({
  id: Math.random().toString(36).slice(2),
  source: "test",
  createdAt: "2026-01-01T00:00:00Z",
  country: "",
  countryCode: "",
  nationalHoliday: "",
  nationalStart: "",
  nationalEnd: "",
  regionalHoliday: "",
  regionalStart: "",
  regionalEnd: "",
  regions: "",
  ...over,
});

const NOV_17 = holidayKey(2026, 10, 17);

describe("yearHolidays", () => {
  it("names the Czech Republic for the Czech public holidays", () => {
    expect(yearHolidays(2026, []).get(NOV_17)).toEqual([
      { countryCode: "CZ", country: "Czech Republic", name: "Struggle for Freedom and Democracy Day", kind: "National", regions: "" },
    ]);
  });

  it("adds the other countries' holidays, the Czech one first, then by country", () => {
    const items = [
      row({ country: "Slovakia", countryCode: "sk", nationalHoliday: "Struggle for Freedom and Democracy Day", nationalStart: "2026-11-17" }),
      row({ country: "Germany", countryCode: "DE", regionalHoliday: "Buß- und Bettag", regionalStart: "2026-11-17", regions: "Saxony" }),
    ];
    const day = yearHolidays(2026, items).get(NOV_17)!;
    expect(day.map((h) => [h.countryCode, h.kind, h.regions])).toEqual([
      ["CZ", "National", ""],
      ["DE", "Regional", "Saxony"],
      ["SK", "National", ""],
    ]);
  });

  it("puts a holiday of several days on each of them, only within the year", () => {
    const items = [row({ country: "China", countryCode: "CN", nationalHoliday: "Spring Festival", nationalStart: "2026-12-30", nationalEnd: "2027-01-02" })];
    const days = yearHolidays(2026, items);
    expect(days.get(holidayKey(2026, 11, 30))?.[0]?.name).toBe("Spring Festival");
    expect(days.get(holidayKey(2026, 11, 31))?.[0]?.name).toBe("Spring Festival");
    expect(yearHolidays(2027, items).get(holidayKey(2027, 0, 2))?.map((h) => h.countryCode)).toEqual(["CN"]);
  });

  it("does not show a Czech national holiday from the list twice", () => {
    const items = [row({ country: "Czechia", countryCode: "CZ", nationalHoliday: "Den boje za svobodu", nationalStart: "2026-11-17" })];
    expect(yearHolidays(2026, items).get(NOV_17)).toHaveLength(1);
  });

  it("walks only the days of the year, even for an end date years away", () => {
    const items = [row({ country: "Japan", countryCode: "JP", nationalHoliday: "Typo", nationalStart: "2026-12-31", nationalEnd: "9026-01-01" })];
    // Each day walked is a step of the date: a year's worth at most, not the 2.5 million days to 9026.
    const steps = vi.spyOn(Date.prototype, "setDate");
    const days = yearHolidays(2026, items);
    expect(steps.mock.calls.length).toBeLessThan(400);
    steps.mockRestore();
    expect(days.get(holidayKey(2026, 11, 31))?.map((h) => h.countryCode)).toEqual(["JP"]);
    expect([...days.values()].flat().filter((h) => h.countryCode === "JP")).toHaveLength(1);
  });

  it("leaves out rows without a usable date", () => {
    const items = [row({ country: "Poland", countryCode: "PL", nationalHoliday: "Broken", nationalStart: "17.11.2026" })];
    expect(yearHolidays(2026, items).get(NOV_17)).toHaveLength(1);
  });
});

describe("filtering and colour", () => {
  const day = yearHolidays(2026, [
    row({ country: "Slovakia", countryCode: "SK", nationalHoliday: "Struggle Day", nationalStart: "2026-11-17" }),
    row({ country: "Germany", countryCode: "DE", nationalHoliday: "Something", nationalStart: "2026-11-17" }),
  ]).get(NOV_17)!;

  it("keeps the Czech holidays whatever countries are picked", () => {
    expect(shownHolidays(day, ["Germany"]).map((h) => h.countryCode)).toEqual(["CZ", "DE"]);
    expect(shownHolidays(day, []).map((h) => h.countryCode)).toEqual(["CZ", "DE", "SK"]);
  });

  it("is red only for a Czech national holiday", () => {
    expect(isCzechHoliday(day)).toBe(true);
    expect(isCzechHoliday(day.filter((h) => h.countryCode !== "CZ"))).toBe(false);
  });

  it("offers the list's countries, not the Czech Republic", () => {
    expect(listCountries([row({ country: "Germany", countryCode: "DE" }), row({ country: "Czechia", countryCode: "CZ" }), row({ countryCode: "AT" })])).toEqual(["AT", "Germany"]);
  });

  it("shows a country listed only by a lower-case code once it is picked", () => {
    const items = [row({ countryCode: " sk", nationalHoliday: "Struggle Day", nationalStart: "2026-11-17" })];
    const offered = listCountries(items)[0]!;
    expect(offered).toBe("SK");
    expect(shownHolidays(yearHolidays(2026, items).get(NOV_17), [offered]).map((h) => h.countryCode)).toEqual(["CZ", "SK"]);
  });

  it("keeps the saved picks the calendar does not offer when the user changes the picker", () => {
    expect(withUnofferedPicks(["Czechia", "Germany", "Gone"], ["Austria", "Germany"], ["Austria"])).toEqual(["Czechia", "Gone", "Austria"]);
    expect(withUnofferedPicks(["Germany"], ["Austria", "Germany"], [])).toEqual([]);
  });
});

describe("flagOf", () => {
  it("makes a flag from a two-letter code, and nothing from anything else", () => {
    expect(flagOf("cz")).toBe("🇨🇿");
    expect(flagOf("DEU")).toBe("");
  });
});
