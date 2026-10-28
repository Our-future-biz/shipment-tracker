import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import type { OceanLayout, OceanSurcharge } from "../interfaces/interfaces";
import { convertOcean } from "../lib/oceanConvert";
import { parseOceanLayout, tidyOceanLayout } from "../lib/oceanLayout";
import { oceanEquipmentOf, rateOffer, surchargeApplies, surchargeUnits, type OceanContainer } from "../lib/oceanPricing";
import type { CellValue, Sheet } from "../lib/sheet";

const sheet = (name: string, rows: Record<number, Record<string, CellValue>>, currencies: Record<number, Record<string, string>> = {}): Sheet => {
  const map = new Map(Object.entries(rows).map(([r, cells]) => [Number(r), cells]));
  return { name, rowCount: Math.max(...map.keys()), rows: map, links: [], currencies: new Map(Object.entries(currencies).map(([r, c]) => [Number(r), c])) };
};

const DRY = [
  { column: "D", equipment: "20DC" as const, label: "20' Box" },
  { column: "E", equipment: "40DC" as const, label: "40' Box" },
  { column: "F", equipment: "40HC" as const, label: "40' HQ" },
];

// An OOCL-like file: direct calls with POL groups, wing ports via hubs with a fixed POL group, and
// an Intra Europe block whose currency is only in the cells' format.
const FAR_EAST = sheet("Far East", {
  10: { B: "POL", C: "POD", D: "20' Box", E: "40' Box", F: "40' HQ" },
  11: { B: "HAM / RTM", C: "Shanghai", D: 25, E: 25, F: 25 },
  12: { B: "HAM / RTM", C: "Nansha  ( in t/s via PKG/SIN)", D: 25, E: 25 },
  13: {},
  14: { B: "EBS Emergency Bunker Surcharge", C: "USD 70/TEU" },
  47: { B: "POD", C: "transshipment via", D: "20' Box", E: "40' Box" },
  48: { B: "Fuqing, Fuzhou, Fujian, China", C: "Kaohsiung", D: 150, E: 275 },
  49: { B: "Fuqing, Fuzhou, Fujian, China", C: "Ningbo", D: 250, E: 425, F: "TBA" },
  50: { B: "Busan, South Korea", C: "Ningbo", D: 0, E: 90 },
});
const EUROPE = sheet(
  "Intra Europe",
  {
    10: { B: "POL", C: "POD", D: "20' Box", E: "40' Box", F: "40' HQ" },
    11: { B: "HAM", C: "Piraeus", D: 535, E: 570, F: 570 },
    12: { B: "HAM / RTM / ANR", C: "Ashdod (via Piraeus)", D: 1125, E: 1325, F: 1325, H: "no DG cargo" },
  },
  { 11: { D: "EUR", E: "EUR", F: "EUR" }, 12: { D: "USD", E: "USD", F: "USD" } },
);

const LAYOUT: OceanLayout = parseOceanLayout({
  name: "OOCL Export FAK",
  validFrom: "2026-05-01",
  validTo: "2026-05-31",
  tables: [
    { label: "Far East direct calls", sheet: "Far East", headerRow: 10, firstDataRow: 11, lastDataRow: null, pol: "B", polFixed: null, pod: "C", via: null, currency: null, currencyFixed: "USD", prices: DRY, note: null, podCountries: ["CN", "KR"] },
    { label: "Far East wing ports", sheet: "Far East", headerRow: 47, firstDataRow: 48, lastDataRow: null, pol: null, polFixed: "HAM / RTM", pod: "B", via: "C", currency: null, currencyFixed: "USD", prices: DRY, note: null, podCountries: ["CN", "KR"] },
    { label: "Intra Europe", sheet: "Intra Europe", headerRow: 10, firstDataRow: 11, lastDataRow: null, pol: "B", polFixed: null, pod: "C", via: null, currency: null, currencyFixed: "EUR", prices: DRY, note: "H", podCountries: ["GR", "IL"] },
  ],
  portCodes: { HAM: "DEHAM", RTM: "NLRTM", ANR: "BEANR" },
  surcharges: [],
  conditions: [],
  links: [],
});

describe("convertOcean", () => {
  // The first table runs on into the wing ports: lastDataRow null, so it stops on its own at rows it cannot read.
  const layout = { ...LAYOUT, tables: [{ ...LAYOUT.tables[0]!, lastDataRow: 12 }, ...LAYOUT.tables.slice(1)] };
  const { rates, ports, findings } = convertOcean([FAR_EAST, EUROPE], layout);

  it("gives a rate per port of loading × port of discharge, with remarks in the note", () => {
    expect(rates.filter((r) => r.table === 0).map((r) => [r.polName, r.podName, r.prices, r.note])).toEqual([
      ["HAM", "Shanghai", { "20DC": 25, "40DC": 25, "40HC": 25 }, ""],
      ["RTM", "Shanghai", { "20DC": 25, "40DC": 25, "40HC": 25 }, ""],
      ["HAM", "Nansha", { "20DC": 25, "40DC": 25 }, "in t/s via PKG/SIN"],
      ["RTM", "Nansha", { "20DC": 25, "40DC": 25 }, "in t/s via PKG/SIN"],
    ]);
  });

  it("reads each transshipment option of a port, a fixed port of loading, and no price for text", () => {
    expect(rates.filter((r) => r.table === 1 && r.polName === "HAM").map((r) => [r.podName, r.via, r.prices])).toEqual([
      ["Fuqing", "Kaohsiung", { "20DC": 150, "40DC": 275 }],
      ["Fuqing", "Ningbo", { "20DC": 250, "40DC": 425 }],
      ["Busan", "Ningbo", { "40DC": 90 }],
    ]);
  });

  it("takes a row's currency from its cells' format before the table's", () => {
    expect(rates.filter((r) => r.table === 2).map((r) => [r.polName, r.podName, r.currency, r.note])).toEqual([
      ["HAM", "Piraeus", "EUR", ""],
      ["HAM", "Ashdod", "USD", "via Piraeus; no DG cargo"],
      ["RTM", "Ashdod", "USD", "via Piraeus; no DG cargo"],
      ["ANR", "Ashdod", "USD", "via Piraeus; no DG cargo"],
    ]);
  });

  it("lists each port name once with the country the file names and its table's countries", () => {
    expect(ports.find((p) => p.side === "pod" && p.name === "Fuqing")).toEqual({ side: "pod", name: "Fuqing", countryHint: "CN", countries: ["CN", "KR"] });
    expect(ports.filter((p) => p.side === "pol").map((p) => p.name)).toEqual(["HAM", "RTM", "ANR"]);
  });

  it("stops approval for a price of 0 and warns of text where a price belongs", () => {
    expect(findings.map((f) => [f.level, f.code, f.rows])).toEqual([
      ["error", "price_not_positive", [50]],
      ["warning", "price_text", [49]],
    ]);
  });

  it("refuses a row naming more port pairs than any tariff does, instead of multiplying them out", () => {
    const many = Array.from({ length: 11 }, (_, i) => `Port ${i}`).join(" / ");
    const wide = sheet("Far East", { 10: { B: "POL", C: "POD", D: "20' Box" }, 11: { B: many, C: many, D: 25 }, 12: { B: "HAM", C: "Shanghai", D: 30 } });
    const read = convertOcean([wide], { ...LAYOUT, tables: [LAYOUT.tables[0]!] });
    expect(read.rates.map((r) => r.rowNo)).toEqual([12]);
    expect(read.findings).toEqual([expect.objectContaining({ level: "error", code: "too_many_ports", rows: [11] })]);
  });
});

describe("tidyOceanLayout", () => {
  it("fills what the AI left out and drops codes that are no UN/LOCODE", () => {
    const layout = parseOceanLayout(
      tidyOceanLayout({
        ...LAYOUT,
        name: "",
        portCodes: { HAM: "deham", XXX: "Hamburg" },
        tables: [{ ...LAYOUT.tables[0], note: undefined, podCountries: undefined, via: undefined }],
        surcharges: [{ name: "EBS", code: "EBS", amount: 70, currency: "usd", basis: "teu", ports: ["NGAPP", "Lagos"] }],
      }),
    );
    expect(layout.name).toBe("Ocean tariff");
    expect(layout.portCodes).toEqual({ HAM: "DEHAM" });
    expect(layout.tables[0]).toMatchObject({ note: null, via: null, podCountries: [] });
    expect(layout.surcharges[0]).toMatchObject({ currency: "USD", equipment: [], tables: [], condition: "always", charge: "other", ports: ["NGAPP"] });
  });

  it("refuses a table without ports of loading or currency, and a surcharge for a table that is not there", () => {
    const bad = (change: object) => () => parseOceanLayout({ ...LAYOUT, ...change });
    expect(bad({ tables: [{ ...LAYOUT.tables[0], pol: null, polFixed: null }] })).toThrow(expect.objectContaining({ message: expect.stringContaining("tables.0.pol") }));
    expect(bad({ tables: [{ ...LAYOUT.tables[0], currencyFixed: null }] })).toThrow(expect.objectContaining({ message: expect.stringContaining("tables.0.currency") }));
    const ebs = { name: "EBS", code: "EBS", amount: 70, currency: "USD", basis: "teu", equipment: [], tables: [9], countries: [], exceptCountries: [], ports: [], exceptPorts: [], condition: "always", charge: "fcl_baf" };
    expect(bad({ surcharges: [ebs] })).toThrow(expect.objectContaining({ message: expect.stringContaining("surcharges") }));
  });

  it("refuses rows past the end of any sheet and a port key longer than any tariff's", () => {
    const bad = (change: object) => () => parseOceanLayout({ ...LAYOUT, ...change });
    expect(bad({ tables: [{ ...LAYOUT.tables[0], lastDataRow: 2_000_000 }] })).toThrow(expect.objectContaining({ message: expect.stringContaining("tables.0.lastDataRow") }));
    const portCodes = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`P${i}`, "DEHAM"]));
    expect(bad({ portCodes })).toThrow(expect.objectContaining({ message: expect.stringContaining("portCodes") }));
    expect(Object.keys(parseOceanLayout(tidyOceanLayout({ ...LAYOUT, portCodes })).portCodes)).toHaveLength(300);
  });
});

const surcharge = (over: Partial<OceanSurcharge>): OceanSurcharge => ({
  name: "EBS Emergency Bunker Surcharge",
  code: "EBS",
  amount: 70,
  currency: "USD",
  basis: "teu",
  equipment: ["dry"],
  tables: [0, 1],
  countries: [],
  exceptCountries: ["TW"],
  ports: [],
  exceptPorts: [],
  condition: "always",
  charge: "fcl_baf",
  ...over,
});

describe("pricing a rate", () => {
  const containers: OceanContainer[] = [
    { type: "20' DC", qty: 1, equipment: "20DC" },
    { type: "40' HC", qty: 2, equipment: "40HC" },
  ];
  const ctx = { table: 0, podCode: "CNSHA", dangerous: false };

  it("knows the quote's container types", () => {
    expect(["20' DC", "40' GP", "40' HC", "20' RF", "40' HRF", "40' OT", "45' HQ"].map(oceanEquipmentOf)).toEqual(["20DC", "40DC", "40HC", "20RF", "40RF", null, null]);
  });

  it("counts a surcharge's units: TEU (a 40' is 2), containers, or 1 per B/L; only of its equipment", () => {
    expect(surchargeUnits(surcharge({}), containers)).toBe(5);
    expect(surchargeUnits(surcharge({ basis: "container" }), containers)).toBe(3);
    expect(surchargeUnits(surcharge({ basis: "bl" }), containers)).toBe(1);
    expect(surchargeUnits(surcharge({ equipment: ["reefer"] }), containers)).toBe(0);
  });

  it("adds a surcharge only to its tables, countries and ports, and only when its condition holds", () => {
    expect(surchargeApplies(surcharge({}), ctx)).toBe("yes");
    expect(surchargeApplies(surcharge({}), { ...ctx, table: 2 })).toBe("no");
    expect(surchargeApplies(surcharge({}), { ...ctx, podCode: "TWKHH" })).toBe("no");
    expect(surchargeApplies(surcharge({ ports: ["NGAPP"] }), ctx)).toBe("no");
    expect(surchargeApplies(surcharge({ condition: "dangerous" }), ctx)).toBe("no");
    expect(surchargeApplies(surcharge({ condition: "dangerous" }), { ...ctx, dangerous: true })).toBe("yes");
    expect(surchargeApplies(surcharge({ condition: "manual_booking" }), ctx)).toBe("manual");
  });

  it("prices every container, adds the surcharges and totals each currency", () => {
    const offer = rateOffer({ prices: { "20DC": 25, "40HC": 30 }, currency: "USD" }, containers, [surcharge({}), surcharge({ name: "AMS", code: "AMS", amount: 25, currency: "EUR", basis: "bl", equipment: [], charge: "ams_ens" }), surcharge({ name: "DOC", code: "DOC", amount: 75, currency: "EUR", basis: "bl", equipment: [], condition: "manual_booking" })], ctx);
    expect(offer).toEqual({
      ok: true,
      lines: [
        { type: "20' DC", qty: 1, equipment: "20DC", price: 25, amount: 25 },
        { type: "40' HC", qty: 2, equipment: "40HC", price: 30, amount: 60 },
      ],
      freight: 85,
      surcharges: [
        { name: "EBS Emergency Bunker Surcharge", code: "EBS", charge: "fcl_baf", basis: "teu", units: 5, rate: 70, total: 350, currency: "USD" },
        { name: "AMS", code: "AMS", charge: "ams_ens", basis: "bl", units: 1, rate: 25, total: 25, currency: "EUR" },
      ],
      manual: ["DOC"],
      totals: [
        { currency: "USD", amount: 435 },
        { currency: "EUR", amount: 25 },
      ],
    });
  });

  it("names the first container a rate has no price for", () => {
    expect(rateOffer({ prices: { "20DC": 25 }, currency: "USD" }, containers, [], ctx)).toEqual({ ok: false, missing: "40' HC" });
  });
});
