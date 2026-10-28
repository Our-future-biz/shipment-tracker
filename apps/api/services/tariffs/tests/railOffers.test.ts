import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import type { RailBand } from "../interfaces/interfaces";
import { bandFor, placeQuery, pricedContainers, rowOffer } from "../lib/railOffers";

// The bands of the METRANS 2026 Hamburg tariff and the prices of its Brno row via Ceska Trebova.
const band = (label: string, minLengthFt: number, maxLengthFt: number, maxGrossTonnes: number | null): RailBand => ({ column: "E", label, minLengthFt, maxLengthFt, maxGrossTonnes });
const BANDS = [
  band("20' 0<14 t", 20, 20, 14),
  band("20'<25 t", 20, 20, 25),
  band("20'<32 t", 20, 20, 32),
  band("21'-29' 0<32 t", 21, 29, 32),
  band("30' 0<34 t", 30, 30, 34),
  band("40' 0<27 t", 40, 40, 27),
  band("40'<34 t", 40, 40, 34),
];
const BRNO = { "20ft-14t": 781, "20ft-25t": 905, "20ft-32t": 980, "21-29ft-32t": 1112, "30ft-34t": 1160, "40ft-27t": 1133, "40ft-34t": 1257 };

const one = (type: string, cargoKg: number | null, qty = 1) => pricedContainers([{ type, qty, cargoKg }])[0]!;

describe("pricedContainers", () => {
  it("adds the tare to the cargo and prices a 45' as a 40'", () => {
    expect(one("20' DC", 12_000)).toMatchObject({ tareKg: 2300, grossKg: 14_300, lengthFt: 20 });
    expect(one("45' HQ", 20_000)).toMatchObject({ tareKg: 4400, grossKg: 24_400, lengthFt: 40 });
  });

  it("leaves the gross weight unknown without a cargo weight or a known tare", () => {
    expect(one("40' HC", null).grossKg).toBeNull();
    expect(one("53' DC", 10_000)).toMatchObject({ tareKg: null, grossKg: null, lengthFt: 53 });
  });
});

describe("bandFor", () => {
  it("takes the lightest band of the length the gross weight fits", () => {
    expect(bandFor(BANDS, BRNO, one("20' DC", 11_000))).toMatchObject({ ok: true, code: "20ft-14t", price: 781 }); // 13.3 t
    expect(bandFor(BANDS, BRNO, one("20' DC", 12_000))).toMatchObject({ ok: true, code: "20ft-25t", price: 905 }); // 14.3 t
    expect(bandFor(BANDS, BRNO, one("40' HC", 24_000))).toMatchObject({ ok: true, code: "40ft-34t", price: 1257 }); // 28 t
  });

  it("counts a weight right at a band's limit as within it", () => {
    expect(bandFor(BANDS, BRNO, one("20' DC", 11_700))).toMatchObject({ code: "20ft-14t" }); // 14.0 t
  });

  it("passes over a band the row has no price for", () => {
    const { ["20ft-14t"]: _, ...without } = BRNO;
    expect(bandFor(BANDS, without, one("20' DC", 5_000))).toMatchObject({ ok: true, code: "20ft-25t" });
  });

  it("takes the lightest band of the length when the weight is unknown", () => {
    expect(bandFor(BANDS, BRNO, one("40' DC", null))).toMatchObject({ ok: true, code: "40ft-27t" });
  });

  it("refuses a container heavier than every band, and a length the row has no price for", () => {
    expect(bandFor(BANDS, BRNO, one("40' HC", 31_000))).toEqual({ ok: false, reason: "heavy" }); // 35 t
    expect(bandFor(BANDS, { "20ft-14t": 781 }, one("40' DC", 10_000))).toEqual({ ok: false, reason: "length" });
  });
});

describe("rowOffer", () => {
  it("prices every container line and adds them up", () => {
    const offer = rowOffer(BANDS, BRNO, pricedContainers([
      { type: "20' DC", qty: 2, cargoKg: 12_000 },
      { type: "40' HC", qty: 1, cargoKg: 20_000 },
    ]));
    expect(offer).toEqual({
      ok: true,
      lines: [
        { type: "20' DC", qty: 2, bandCode: "20ft-25t", bandLabel: "20'<25 t", price: 905, amount: 1810 },
        { type: "40' HC", qty: 1, bandCode: "40ft-27t", bandLabel: "40' 0<27 t", price: 1133, amount: 1133 },
      ],
      total: 2943,
    });
  });

  it("names the first container line it cannot price", () => {
    const offer = rowOffer(BANDS, BRNO, pricedContainers([
      { type: "20' DC", qty: 1, cargoKg: 1_000 },
      { type: "40' DC", qty: 1, cargoKg: 32_000 },
    ]));
    expect(offer).toEqual({ ok: false, container: 1, reason: "heavy" });
  });
});

describe("placeQuery", () => {
  it.each([
    ["602 00", { postcode: "60200" }],
    ["60200", { postcode: "60200" }],
    ["Průmyslová 1, 252 61 Jeneč", { postcode: "25261" }],
    ["Brno 60200", { postcode: "60200" }],
    ["Ústí nad Labem", { name: "Ústí nad Labem" }],
    ["Hall 1234/56", { name: "Hall 1234/56" }],
    ["  ", null],
  ])("reads %j", (text, query) => {
    expect(placeQuery(text)).toEqual(query);
  });
});
