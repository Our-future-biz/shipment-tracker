import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => ({ APIError: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { parseAres } from "../services/ares.service";
import { normalizeDomain } from "../services/logo.service";

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
          stavSubjektu: "AKTIVNI",
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
      companyStatus: "AKTIVNI",
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
      companyStatus: "Active",
      registrationDate: "",
      nace: "",
    });
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path and query", () => {
    expect(normalizeDomain(" https://www.Example.cz/contact?x=1 ")).toBe("example.cz");
    expect(normalizeDomain("example.com?ref=a")).toBe("example.com");
  });
});
