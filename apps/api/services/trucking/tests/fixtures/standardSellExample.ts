import type { PriceType, ServiceLevelCode, TariffBand, TariffRate, TariffVersionInput, TariffZone } from "../../interfaces/interfaces";
import type { WorkbookTariffInfo } from "../../lib/tariffWorkbook";

// An ILLUSTRATIVE Standard LTL sell tariff for the Czech Republic: the shape of a real one, made-up
// prices. standard-sell-example.xlsx next to this file is this input written by the template
// writer (tests/tariffWorkbook.test.ts rewrites it with WRITE_TRUCKING_FIXTURE=1).

export const EXAMPLE_TARIFF: WorkbookTariffInfo = {
  name: "Standard LTL (EXAMPLE, not real prices)",
  side: "SELL",
  scope: "LTL",
  ownerName: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
};

const ZONES: TariffZone[] = [
  { code: "PRG", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
  { code: "STC", label: "Střední Čechy", postcodeFrom: "20000", postcodeTo: "29999", remote: false },
  { code: "ZPC", label: "Západní Čechy", postcodeFrom: "30000", postcodeTo: "36999", remote: false },
  { code: "JHC", label: "Jižní Čechy", postcodeFrom: "37000", postcodeTo: "39999", remote: false },
  { code: "SVC", label: "Severní Čechy", postcodeFrom: "40000", postcodeTo: "49999", remote: false },
  { code: "VYC", label: "Východní Čechy a Vysočina", postcodeFrom: "50000", postcodeTo: "59999", remote: false },
  { code: "JHM", label: "Jižní Morava", postcodeFrom: "60000", postcodeTo: "69999", remote: false },
  { code: "SVM", label: "Severní Morava a Slezsko", postcodeFrom: "70000", postcodeTo: "79999", remote: false },
  { code: "JES", label: "Jesenicko (remote, inside SVM)", postcodeFrom: "79001", postcodeTo: "79099", remote: true },
];

const ZONE_FACTOR: Record<string, number> = { PRG: 0.9, STC: 1, ZPC: 1.1, JHC: 1.12, SVC: 1.08, VYC: 1.1, JHM: 1.18, SVM: 1.25, JES: 1.35 };

/** Band limits (kg), the D2 price in zone factor 1 and how it is charged. */
const BANDS: { from: number; to: number | null; base: number; priceType: PriceType }[] = [
  { from: 0, to: 50, base: 390, priceType: "FLAT" },
  { from: 50, to: 100, base: 490, priceType: "FLAT" },
  { from: 100, to: 200, base: 640, priceType: "FLAT" },
  { from: 200, to: 300, base: 790, priceType: "FLAT" },
  { from: 300, to: 500, base: 1050, priceType: "FLAT" },
  { from: 500, to: 750, base: 1390, priceType: "FLAT" },
  { from: 750, to: 1000, base: 1690, priceType: "FLAT" },
  { from: 1000, to: 1500, base: 165, priceType: "PER_100KG" },
  { from: 1500, to: 2000, base: 150, priceType: "PER_100KG" },
  { from: 2000, to: 2500, base: 140, priceType: "PER_100KG" },
  { from: 2500, to: null, base: 130, priceType: "PER_100KG" },
];

/** Level price factor against D2, and the heaviest band it is offered for (express only up to 1 000 kg). */
const LEVELS: { level: ServiceLevelCode; factor: number; upTo: number | null }[] = [
  { level: "D1", factor: 1.15, upTo: null },
  { level: "D2", factor: 1, upTo: null },
  { level: "D3", factor: 0.93, upTo: null },
  { level: "D4", factor: 0.88, upTo: null },
  { level: "EXP_1000", factor: 1.8, upTo: 1000 },
];

export function standardSellExample(): TariffVersionInput {
  const bands: TariffBand[] = [];
  const rates: TariffRate[] = [];
  const minCharges: TariffVersionInput["minCharges"] = [];
  for (const { level, factor, upTo } of LEVELS) {
    for (const b of BANDS) {
      if (upTo !== null && (b.to === null || b.to > upTo)) continue;
      let band = bands.find((x) => x.fromExcl === b.from && x.toIncl === b.to);
      if (!band) {
        band = { id: `b${bands.length + 1}`, basis: "KG", fromExcl: b.from, toIncl: b.to };
        bands.push(band);
      }
      for (const z of ZONES) {
        rates.push({ serviceLevel: level, zoneCode: z.code, bandId: band.id, amount: Math.round(b.base * factor * ZONE_FACTOR[z.code]), priceType: b.priceType });
      }
    }
    for (const z of ZONES) minCharges.push({ serviceLevel: level, zoneCode: z.code, amount: Math.round(350 * factor * ZONE_FACTOR[z.code]) });
  }
  return {
    validFrom: "2027-01-01",
    validTo: null,
    factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
    rounding: { weightStepKg: 1, moneyStep: 1 },
    zones: ZONES,
    bands,
    rates,
    minCharges,
    surcharges: [
      { code: "FUEL", calc: "FUEL_INDEX", value: 0, min: null, onBasePlusSurcharges: false },
      { code: "ADR", calc: "FLAT", value: 350, min: null, onBasePlusSurcharges: false },
      { code: "TAIL_LIFT", calc: "FLAT", value: 450, min: null, onBasePlusSurcharges: false },
      { code: "AVIZACE", calc: "FLAT", value: 90, min: null, onBasePlusSurcharges: false },
      { code: "B2C", calc: "FLAT", value: 150, min: null, onBasePlusSurcharges: false },
    ],
    notes: "EXAMPLE ONLY: illustrative prices to show how the template is filled in, not a real price list.",
  };
}
