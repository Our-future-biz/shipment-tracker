import { afterEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; APIError carries the code the API answers with.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
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

describe("ARES name search guards", () => {
  it("tells 'too many companies' apart from other refusals", async () => {
    const { isTooManyAnswer } = await import("../services/ares.service");
    expect(isTooManyAnswer('{"kod":"CHYBA_VSTUPU","subKod":"VYSTUP_PRILIS_MNOHO_VYSLEDKU","popis":"Příliš mnoho výsledků"}')).toBe(true);
    expect(isTooManyAnswer('{"kod":"CHYBA_VSTUPU","popis":"Nepovolené znaky"}')).toBe(false);
    expect(isTooManyAnswer("")).toBe(false);
  });

  it("brakes runaway searching per company", async () => {
    const { searchAllowed, SEARCHES_PER_MINUTE } = await import("../services/ares.service");
    const t0 = 1_000_000;
    for (let i = 0; i < SEARCHES_PER_MINUTE; i++) expect(searchAllowed("company-a", t0 + i)).toBe(true);
    expect(searchAllowed("company-a", t0 + 100)).toBe(false);
    expect(searchAllowed("company-b", t0 + 100)).toBe(true);
    expect(searchAllowed("company-a", t0 + 61_000)).toBe(true);
  });
});

// A fetch whose answer has its headers at once and a body that comes only when `body` is called, or
// never: it fails as the real fetch does when the call's signal is aborted while the body is read.
function stalledFetch(ready: { body?: string }) {
  return vi.fn(async (_url: string, init: RequestInit) => ({
    status: 200,
    ok: true,
    text: () =>
      new Promise<string>((resolve, reject) => {
        if (ready.body !== undefined) resolve(ready.body);
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })));
      }),
  }));
}

describe("calls to ARES", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keep their deadline while the body is read: an answer that stalls after its headers fails in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch({}));
    const { fetchAres } = await import("../services/ares.service");
    const call = fetchAres("https://ares.example/x", 50);
    const failed = expect(call).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(50);
    await failed;
  });

  it("answer the status and the whole body when it comes in time", async () => {
    vi.stubGlobal("fetch", stalledFetch({ body: '{"ico":"27082440"}' }));
    const { fetchAres } = await import("../services/ares.service");
    await expect(fetchAres("https://ares.example/x", 50)).resolves.toEqual({ status: 200, ok: true, body: '{"ico":"27082440"}' });
  });

  it("a look-up whose record stalls after its headers says ARES is unavailable, not that it hangs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch({}));
    const { aresService } = await import("../services/ares.service");
    const lookup = aresService.lookup("27082440");
    const failed = expect(lookup).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(8000);
    await failed;
  });
});

describe("ARES look-ups by IČO", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are braked per company like the name search", async () => {
    const { aresLookupAllowed, LOOKUPS_PER_MINUTE } = await import("../services/ares.service");
    const t0 = 2_000_000;
    for (let i = 0; i < LOOKUPS_PER_MINUTE; i++) expect(aresLookupAllowed("company-a", t0 + i)).toBe(true);
    expect(aresLookupAllowed("company-a", t0 + 100)).toBe(false);
    expect(aresLookupAllowed("company-b", t0 + 100)).toBe(true);
    expect(aresLookupAllowed("company-a", t0 + 61_000)).toBe(true);
  });

  it("past the limit are refused before ARES is called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { aresService, LOOKUPS_PER_MINUTE } = await import("../services/ares.service");
    const json = (body: unknown) => ({ status: 200, ok: true, text: async () => JSON.stringify(body) });
    fetchMock.mockImplementation(async (url: string) => (url.includes("-vr/") ? json({ zaznamy: [] }) : json(alza)));
    for (let i = 0; i < LOOKUPS_PER_MINUTE; i++) await aresService.lookup("27082440", "company-limited");
    fetchMock.mockClear();
    await expect(aresService.lookup("27082440", "company-limited")).rejects.toMatchObject({ code: "resource_exhausted" });
    expect(fetchMock).not.toHaveBeenCalled();
    // Not counted without a bucket: a customer created from ARES.
    await expect(aresService.lookup("27082440")).resolves.toMatchObject({ companyName: "Alza.cz a.s." });
  });
});
