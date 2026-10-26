import { describe, expect, it } from "vitest";
import { searchAirports } from "../geo/airports";

describe("searchAirports", () => {
  it("puts the airport whose IATA code was typed first", () => {
    expect(searchAirports("pvg")[0]).toEqual({
      code: "PVG",
      name: "Shanghai Pudong International Airport",
      city: "Shanghai (Pudong)",
      countryCode: "CN",
    });
  });

  it("finds airports by city, bigger ones first", () => {
    const codes = searchAirports("shanghai").map((a) => a.code);
    expect(codes.slice(0, 2).sort()).toEqual(["PVG", "SHA"]);
  });

  it("ignores accents and matches word starts only", () => {
    expect(searchAirports("vaclav havel")[0]?.code).toBe("PRG");
    expect(searchAirports("amburg").some((a) => a.code === "HAM")).toBe(false);
  });

  it("asks for at least 2 letters", () => {
    expect(searchAirports("h")).toEqual([]);
  });
});
