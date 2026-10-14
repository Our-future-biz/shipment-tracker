import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => ({ APIError: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { parseAres, parseAresSearch } from "../services/ares.service";

describe("parseAres", () => {
  it("builds the registry fields from an ARES record", () => {
    expect(
      parseAres(
        {
          ico: "27074358",
          dic: "CZ27074358",
          obchodniJmeno: "Example s.r.o.",
          pravniForma: "112",
          sidlo: { nazevUlice: "Na Příkopě", cisloDomovni: 390, cisloOrientacni: 3, nazevObce: "Praha", psc: 11000 },
          datumVzniku: "2003-05-12T00:00:00",
          czNace: ["49410", "52290"],
        },
        "27074358",
      ),
    ).toEqual({
      ico: "27074358",
      dic: "CZ27074358",
      companyName: "Example s.r.o.",
      legalForm: "112",
      registeredAddress: "Na Příkopě, 390/3, Praha, 11000",
      city: "Praha",
      country: "CZ",
      registrationDate: "2003-05-12",
      nace: "49410, 52290",
      street: "Na Příkopě 390/3",
      postalCity: "Praha",
      postalCode: "110 00",
      vatPayer: false,
      registerEntry: "",
    });
  });

  it("falls back for a sparse record", () => {
    expect(parseAres({ nazev: "Fallback a.s." }, "12345678")).toMatchObject({
      ico: "12345678",
      companyName: "Fallback a.s.",
      registeredAddress: "",
      registrationDate: "",
      nace: "",
    });
  });
});

describe("parseAresSearch", () => {
  it("lists the companies that still exist, with their address in one line", () => {
    expect(
      parseAresSearch({
        ekonomickeSubjekty: [
          { ico: "27082440", obchodniJmeno: "Alza.cz  a.s.", sidlo: { textovaAdresa: "Jankovcova 1522/53, Holešovice, 17000 Praha 7" } },
          { ico: "12345678", obchodniJmeno: "Zaniklá s.r.o.", datumZaniku: "2020-01-01" },
          { obchodniJmeno: "Bez IČO" },
        ],
      }),
    ).toEqual([{ ico: "27082440", companyName: "Alza.cz a.s.", address: "Jankovcova 1522/53, Holešovice, 17000 Praha 7" }]);
    expect(parseAresSearch({})).toEqual([]);
  });
});
