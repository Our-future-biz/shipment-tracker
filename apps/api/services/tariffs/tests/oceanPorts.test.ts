import { describe, expect, it } from "vitest";
import type { OceanPlace } from "../interfaces/interfaces";
import { countriesFor, nameVariants, placeFor, portCodeFor, splitPorts } from "../lib/oceanPorts";

const place = (code: string, name: string, countryCode = code.slice(0, 2)): OceanPlace => ({ code, name, countryCode, subdivisionName: null });

describe("splitPorts", () => {
  it.each([
    ["HAM / WVN / RTM / ANR / ZEE", ["HAM", "WVN", "RTM", "ANR", "ZEE"]],
    ["Koper; Trieste", ["Koper", "Trieste"]],
    ["Kobe / Nagoya /Tokyo / Yokohama / Osaka*", ["Kobe", "Nagoya", "Tokyo", "Yokohama", "Osaka"]],
    ["Nhava Sheva / Mundra (direct service)", ["Nhava Sheva", "Mundra"]],
  ])("splits %j into its ports", (cell, names) => {
    expect(splitPorts(cell).map((t) => t.name)).toEqual(names);
  });

  it("keeps the country after the last comma, and splits on ; only where commas are", () => {
    expect(splitPorts("Antwerpen, Antwerp, Vlaanderen, Belgium; Rotterdam, Zuid-Holland, Netherlands")).toEqual([
      { name: "Antwerpen", country: "BE", note: "" },
      { name: "Rotterdam", country: "NL", note: "" },
    ]);
    expect(splitPorts("Busan, South Korea")).toEqual([{ name: "Busan", country: "KR", note: "" }]);
  });

  it("takes remarks out of the name: brackets and in t/s via, with the slashes in them kept", () => {
    expect(splitPorts("Nansha  ( in t/s via PKG/SIN)")).toEqual([{ name: "Nansha", country: null, note: "in t/s via PKG/SIN" }]);
    expect(splitPorts("RTM in t/s via ANR")).toEqual([{ name: "RTM", country: null, note: "in t/s via ANR" }]);
    expect(splitPorts("Chattogram  (via Port Klang / Singapore / Colombo)")).toEqual([{ name: "Chattogram", country: null, note: "via Port Klang / Singapore / Colombo" }]);
  });

  it("finds the country in a remark", () => {
    expect(splitPorts("Apapa (Lagos - Nigeria)*")).toEqual([{ name: "Apapa", country: "NG", note: "Lagos - Nigeria" }]);
    expect(splitPorts("Abidjan (Ivory Coast)")[0]!.country).toBe("CI");
  });
});

describe("matching a name to a place", () => {
  it("takes the one place of exactly that name in the allowed countries", () => {
    expect(placeFor("Hamburg", ["DE"], [place("DEHAM", "Hamburg"), place("USHAM", "Hamburg"), place("USH9G", "Hamburg")])?.code).toBe("DEHAM");
    expect(placeFor("Hamburg", [], [place("DEHAM", "Hamburg"), place("USHAM", "Hamburg")])).toBeNull();
  });

  it("knows the place list's ways of writing: a comma part, City, -shi, one word", () => {
    expect(placeFor("Nagoya", ["JP"], [place("JPNGO", "Nagoya, Aichi")])?.code).toBe("JPNGO");
    expect(placeFor("Hai Phong", ["VN"], [place("VNHPH", "Haiphong")])?.code).toBe("VNHPH");
    expect(nameVariants("Cebu City")).toEqual(["Cebu City", "Cebu"]);
    expect(nameVariants("Hitachinaka-shi")).toContain("Hitachinaka");
  });

  it("prefers the exact name over one that only starts with it", () => {
    expect(placeFor("Kobe", ["JP"], [place("JPUKB", "Kobe"), place("JPXXX", "Kobe, Other")])?.code).toBe("JPUKB");
  });

  it("leaves it to a user when several places could be meant", () => {
    expect(placeFor("Fuzhou", ["CN"], [place("CNFOC", "Fuzhou"), place("CNFZH", "Fuzhou")])).toBeNull();
  });

  it("reads Hong Kong and Macao written as China", () => {
    expect(countriesFor(["CN"])).toEqual(["CN", "HK", "MO"]);
    expect(placeFor("Hong Kong", ["CN"], [place("HKHKG", "Hong Kong")])?.code).toBe("HKHKG");
  });

  it("finds a code the tariff gives, case and spacing aside", () => {
    const codes = { HAM: "DEHAM", Koper: "SIKOP" };
    expect([portCodeFor("ham", codes), portCodeFor(" Koper ", codes), portCodeFor("Trieste", codes)]).toEqual(["DEHAM", "SIKOP", null]);
  });
});
