import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { parseAres, registerEntryFrom, type AresResponse } from "../services/ares.service";

// Trimmed from the real ARES record of Alza.cz a.s. (public registry data).
const alza: AresResponse = {
  ico: "27082440",
  dic: "CZ27082440",
  obchodniJmeno: "Alza.cz a.s.",
  pravniForma: "121",
  sidlo: {
    kodStatu: "CZ",
    nazevObce: "Praha",
    nazevMestskehoObvodu: "Praha 7",
    nazevUlice: "Jankovcova",
    cisloDomovni: 1522,
    cisloOrientacni: 53,
    nazevCastiObce: "Holešovice",
    psc: 17000,
  },
  seznamRegistraci: { stavZdrojeDph: "AKTIVNI" },
};

describe("parseAres", () => {
  it("splits the address for an invoice and reads the VAT registration", () => {
    expect(parseAres(alza, "27082440")).toMatchObject({
      ico: "27082440",
      dic: "CZ27082440",
      companyName: "Alza.cz a.s.",
      street: "Jankovcova 1522/53",
      postalCity: "Praha 7",
      postalCode: "170 00",
      country: "CZ",
      vatPayer: true,
      // unchanged fields the Customer Database relies on
      registeredAddress: "Jankovcova, 1522/53, Praha, 17000",
      city: "Praha",
    });
  });

  it("addresses a village without streets by its part and house number", () => {
    const r = parseAres(
      { obchodniJmeno: "Farma s.r.o.", sidlo: { nazevObce: "Lhota", nazevCastiObce: "Dolní Lhota", cisloDomovni: 12, psc: "39601" } },
      "12345679",
    );
    expect(r).toMatchObject({ street: "Dolní Lhota 12", postalCity: "Lhota", postalCode: "396 01", vatPayer: false });
  });

  it("collapses repeated spaces in the name", () => {
    expect(parseAres({ obchodniJmeno: "VIENNA INTERNATIONAL   a.s." }, "12345679").companyName).toBe("VIENNA INTERNATIONAL a.s.");
  });

  it("keeps a house number letter", () => {
    const r = parseAres({ sidlo: { nazevUlice: "Dlouhá", cisloDomovni: 5, cisloOrientacni: 7, cisloOrientacniPismeno: "a", nazevObce: "Brno" } }, "1");
    expect(r.street).toBe("Dlouhá 5/7a");
  });
});

describe("registerEntryFrom", () => {
  it("prints the current file number with its court", () => {
    expect(
      registerEntryFrom({
        zaznamy: [{ primarniZaznam: true, spisovaZnacka: [{ soud: "MSPH", oddil: "B", vlozka: 8573 }] }],
      }),
    ).toBe("B 8573 vedená u Městského soudu v Praze");
  });

  it("skips file numbers that were struck off", () => {
    expect(
      registerEntryFrom({
        zaznamy: [{ spisovaZnacka: [{ soud: "KSBR", oddil: "C", vlozka: 1, datumVymazu: "2020-01-01" }, { soud: "KSBR", oddil: "B", vlozka: 99 }] }],
      }),
    ).toBe("B 99 vedená u Krajského soudu v Brně");
  });

  it("is empty for companies outside the register (e.g. sole traders)", () => {
    expect(registerEntryFrom({})).toBe("");
    expect(registerEntryFrom({ zaznamy: [{ spisovaZnacka: [] }] })).toBe("");
  });
});
