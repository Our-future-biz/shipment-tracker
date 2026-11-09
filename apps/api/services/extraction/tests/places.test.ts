import { beforeEach, describe, expect, it, vi } from "vitest";

const placeLookup = vi.hoisted(() => vi.fn());
// A failing lookup is a plain function: vitest reports an error thrown by a vi.fn even when
// the code under test catches it.
const lookup = vi.hoisted(() => ({ fails: false }));
vi.mock("~encore/clients", () => ({
  auth: {
    placeLookup: async (req: unknown) => {
      if (lookup.fails) throw new Error("auth down");
      return placeLookup(req);
    },
  },
}));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn() } }));
// No AI in tests: anything the database pass leaves open stays unresolved.
vi.mock("../lib/anthropic", () => ({
  MODEL: "test",
  replyText: () => "{}",
  getClient: () => ({ messages: { create: vi.fn().mockRejectedValue(new Error("no AI in tests")) } }),
}));

import { resolveGeo, sameName, splitPlace } from "../services/places.service";

const place = (code: string, name: string) => ({ code, countryCode: code.slice(0, 2), name, subdivisionName: null });

beforeEach(() => {
  placeLookup.mockReset();
  lookup.fails = false;
});

describe("splitPlace", () => {
  it("takes a written-out country as certain", () => {
    expect(splitPlace("Chicago, IL, United States")).toEqual({ name: "Chicago", countryCode: "US", weakCountry: false, state: { countryCode: "US", name: "Illinois" } });
  });

  it("takes a bare two-letter last part only as a hint", () => {
    expect(splitPlace("Chicago, IL")).toMatchObject({ name: "Chicago", countryCode: "IL", weakCountry: true });
    expect(splitPlace("Hamburg, DE")).toMatchObject({ name: "Hamburg", countryCode: "DE", weakCountry: true });
  });

  it("reads a state or province however it is written", () => {
    const illinois = { countryCode: "US", name: "Illinois" };
    for (const text of ["Aurora, IL", "Aurora, il", "Aurora, il, us", "Aurora, IL, USA", "Aurora, Illinois", "Aurora, Illinois, United States"]) {
      expect(splitPlace(text)).toMatchObject({ name: "Aurora", state: illinois });
    }
    expect(splitPlace("Halifax, NS")).toMatchObject({ state: { countryCode: "CA", name: "Nova Scotia" } });
    expect(splitPlace("Montreal, Quebec, Canada")).toMatchObject({ countryCode: "CA", state: { countryCode: "CA", name: "Quebec" } });
  });

  it("finds no state where there is none", () => {
    expect(splitPlace("Hamburg")).toMatchObject({ state: null });
    expect(splitPlace("Hamburg, Germany")).toMatchObject({ state: null });
    expect(splitPlace("Lyon, Rhone, France")).toMatchObject({ state: null });
  });

  it("drops port wording", () => {
    expect(splitPlace("PORT OF HAMBURG")).toMatchObject({ name: "HAMBURG", countryCode: null });
    expect(splitPlace("Gdansk Seaport")).toMatchObject({ name: "Gdansk" });
  });
});

describe("sameName", () => {
  it("matches either name of a bracketed pair, ignoring case and accents", () => {
    expect(sameName("Ostend (Oostende)", "ostend")).toBe(true);
    expect(sameName("Ostend (Oostende)", "Oostende")).toBe(true);
    expect(sameName("Göteborg", "GOTEBORG")).toBe(true);
    expect(sameName("Antwerp Churchill Terminal", "Antwerp")).toBe(false);
  });
});

describe("resolveGeo", () => {
  it("does not read a US state as a country: Aurora, IL is the one in Illinois", async () => {
    // In Israel: nothing; worldwide: some of them; in Illinois: the one.
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[], [place("USAUC", "Aurora"), place("USAUZ", "Aurora")], [place("USAUZ", "Aurora")]] });
    expect(await resolveGeo([{ text: "Aurora, IL", kind: "place" }])).toEqual(["Aurora (USAUZ)"]);
    expect(placeLookup.mock.calls[0]![0].names).toEqual([{ name: "Aurora", countryCode: "IL" }, { name: "Aurora" }, { name: "Aurora", countryCode: "US", subdivision: "Illinois" }]);
  });

  it("takes the state when the country is written too", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("USAUC", "Aurora"), place("USAUZ", "Aurora")], [place("USAUZ", "Aurora")]] });
    expect(await resolveGeo([{ text: "Aurora, il, us", kind: "place" }])).toEqual(["Aurora (USAUZ)"]);
  });

  it("keeps a place that exists in the country its two letters also name", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("DEHAM", "Hamburg")], [place("DEHAM", "Hamburg")], []] });
    expect(await resolveGeo([{ text: "Hamburg, DE", kind: "place" }])).toEqual(["Hamburg (DEHAM)"]);
  });

  it("reads a state named like a country as the state when the country has no such place", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[], [place("USQTM", "Quitman")]] });
    expect(await resolveGeo([{ text: "Quitman, Georgia", kind: "place" }])).toEqual(["Quitman (USQTM)"]);
  });

  it("keeps the country when the country has the place and the state does not", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("GETBS", "Tbilisi")], []] });
    expect(await resolveGeo([{ text: "Tbilisi, Georgia", kind: "place" }])).toEqual(["Tbilisi (GETBS)"]);
  });

  it("takes neither as sure when both the country and the state have the place", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("CAGFL", "Greenfield")], [], [place("USGFC", "Greenfield")]] });
    expect(await resolveGeo([{ text: "Greenfield, CA", kind: "place" }])).toEqual([null]);
  });

  it("leaves it open when the state has no such place, as before", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[], [place("USCHI", "Chicago")], []] });
    expect(await resolveGeo([{ text: "Chicago, IL", kind: "place" }])).toEqual([null]);
  });

  it("keeps a two-letter country hint the place exists in, whatever the worldwide list holds", async () => {
    // The capped worldwide list need not contain the German one at all.
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("DEHAM", "Hamburg")], [place("USHMB", "Hamburg")]] });
    expect(await resolveGeo([{ text: "Hamburg, DE", kind: "place" }])).toEqual(["Hamburg (DEHAM)"]);
  });

  it("keeps the values as read when the lookup fails", async () => {
    lookup.fails = true;
    expect(await resolveGeo([{ text: "Hamburg, Germany", kind: "place" }, { text: "Germany", kind: "countryCode" }])).toEqual([null, "DE"]);
  });
});
