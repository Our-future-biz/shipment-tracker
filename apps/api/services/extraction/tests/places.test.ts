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
    expect(splitPlace("Chicago, IL, United States")).toEqual({ name: "Chicago", countryCode: "US", weakCountry: false });
  });

  it("takes a bare two-letter last part only as a hint", () => {
    expect(splitPlace("Chicago, IL")).toMatchObject({ name: "Chicago", countryCode: "IL", weakCountry: true });
    expect(splitPlace("Hamburg, DE")).toMatchObject({ name: "Hamburg", countryCode: "DE", weakCountry: true });
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
  it("does not read a US state as a country", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("USCHI", "Chicago")]] });
    const [value] = await resolveGeo([{ text: "Chicago, IL", kind: "place" }]);
    // Searched worldwide, not in Israel.
    expect(placeLookup.mock.calls[0]![0].names).toEqual([{ name: "Chicago", countryCode: undefined }]);
    // With the hint dropped it isn't a sure match, so it's left for the AI (absent here).
    expect(value).toBeNull();
  });

  it("keeps a two-letter country hint the place exists in", async () => {
    placeLookup.mockResolvedValueOnce({ byCode: [], candidates: [[place("DEHAM", "Hamburg"), place("USHMB", "Hamburg")]] });
    expect(await resolveGeo([{ text: "Hamburg, DE", kind: "place" }])).toEqual(["Hamburg (DEHAM)"]);
  });

  it("keeps the values as read when the lookup fails", async () => {
    lookup.fails = true;
    expect(await resolveGeo([{ text: "Hamburg, Germany", kind: "place" }, { text: "Germany", kind: "countryCode" }])).toEqual([null, "DE"]);
  });
});
