import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import {
  cleanOceanLayout,
  codesText,
  newPriceColumn,
  newSurcharge,
  newTable,
  oceanLayoutProblems,
  parseCountries,
  parsePortCodes,
  parsePorts,
  portCodesText,
  withoutTable,
} from "./oceanLayoutForm";
import { equipmentOf, placeCodeOf, portsOf, surchargeScopeText } from "./oceanTariffs";

const TABLE: interfaces.OceanTable = {
  label: "Far East direct calls",
  sheet: "Far East+Japan",
  headerRow: 10,
  firstDataRow: 11,
  lastDataRow: 24,
  pol: "B",
  polFixed: null,
  pod: "C",
  via: null,
  currency: null,
  currencyFixed: "USD",
  prices: [
    { column: "D", equipment: "20DC", label: "20' Box" },
    { column: "E", equipment: "40DC", label: "40' Box" },
    { column: "F", equipment: "40HC", label: "40' HQ" },
  ],
  note: null,
  podCountries: ["CN", "HK"],
};

const LAYOUT: interfaces.OceanLayout = {
  name: "OOCL Export FAK",
  validFrom: "2026-05-01",
  validTo: "2026-05-31",
  tables: [TABLE],
  portCodes: { HAM: "DEHAM", RTM: "NLRTM" },
  surcharges: [{ ...newSurcharge(), name: "EBS Emergency Bunker Surcharge", code: "EBS", amount: 70, tables: [0] }],
  conditions: ["Freight prepaid only"],
  links: [],
};

describe("typed lists", () => {
  it("reads countries and ports, each once, leaving out what they are not", () => {
    expect(parseCountries("cn, hk; tw cn Japan")).toEqual(["CN", "HK", "TW"]);
    expect(parsePorts("ngapp nglos, 123 NGAPP x")).toEqual(["NGAPP", "NGLOS"]);
    expect(codesText(["CN", "HK"])).toBe("CN, HK");
  });

  it("reads port codes as name = UN/LOCODE lines, and writes them back the same way", () => {
    const text = "HAM = deham\nKoper=SIKOP\nbroken line\nRTM = 123";
    expect(parsePortCodes(text)).toEqual({ HAM: "DEHAM", Koper: "SIKOP" });
    expect(portCodesText({ HAM: "DEHAM", Koper: "SIKOP" })).toBe("HAM = DEHAM\nKoper = SIKOP");
  });
});

describe("new parts", () => {
  it("adds a table below the last one and a price column for a container not yet priced", () => {
    const table = newTable(LAYOUT, "Sheet1");
    expect(table).toMatchObject({ sheet: "Far East+Japan", headerRow: 26, firstDataRow: 27, pol: "B", currencyFixed: "USD", prices: [] });
    expect(newPriceColumn(TABLE).equipment).toBe("20RF");
  });

  it("removes a table, keeps each surcharge on the same tables and drops one only for that table", () => {
    const surcharge = LAYOUT.surcharges[0]!;
    const layout = {
      ...LAYOUT,
      tables: [TABLE, { ...TABLE, label: "Wing ports" }, { ...TABLE, label: "Reefer" }],
      surcharges: [{ ...surcharge, tables: [0, 2] }, { ...surcharge, code: "WAR", tables: [1] }, { ...surcharge, code: "ISPS", tables: [] }],
    };
    const left = withoutTable(layout, 1);
    expect(left.tables.map((t) => t.label)).toEqual(["Far East direct calls", "Reefer"]);
    expect(left.surcharges.map((s) => [s.code, s.tables])).toEqual([
      ["EBS", [0, 1]],
      ["ISPS", []],
    ]);
  });
});

describe("cleanOceanLayout", () => {
  it("keeps the ports of loading as a column or as text, upper-cases letters and codes, drops tables a surcharge cannot name", () => {
    const clean = cleanOceanLayout({
      ...LAYOUT,
      tables: [{ ...TABLE, pol: "b", polFixed: "HAM / RTM", pod: " c", currency: null, currencyFixed: "usd", podCountries: ["cn", "x"] }],
      surcharges: [{ ...LAYOUT.surcharges[0]!, code: " ebs ", currency: "usd", tables: [0, 3] }],
      conditions: ["Freight prepaid only ", " "],
    });
    expect(clean.tables[0]).toMatchObject({ pol: "B", polFixed: null, pod: "C", currencyFixed: "USD", podCountries: ["CN"] });
    expect(clean.surcharges[0]).toMatchObject({ code: "EBS", currency: "USD", tables: [0] });
    expect(clean.conditions).toEqual(["Freight prepaid only"]);
  });

  it("keeps a currency column over a typed currency", () => {
    expect(cleanOceanLayout({ ...LAYOUT, tables: [{ ...TABLE, currency: "d", currencyFixed: "USD" }] }).tables[0]).toMatchObject({ currency: "D", currencyFixed: null });
  });
});

describe("oceanLayoutProblems", () => {
  it("is empty for a layout that can be sent", () => {
    expect(oceanLayoutProblems(LAYOUT)).toEqual([]);
  });

  it("names what is missing", () => {
    const problems = oceanLayoutProblems({
      ...LAYOUT,
      tables: [{ ...TABLE, pol: null, polFixed: "", currencyFixed: null, prices: [{ ...TABLE.prices[0]!, column: "" }, TABLE.prices[0]!] }],
      surcharges: [{ ...newSurcharge(), currency: "US" }],
    });
    expect(problems).toEqual([
      "Far East direct calls: choose the column of the ports of loading, or type them",
      "Far East direct calls: choose the currency column, or type the currency (e.g. USD)",
      "Far East direct calls: every price column needs its column",
      "Far East direct calls: two price columns are for the same container",
      "Every surcharge needs a name and a code",
      "A surcharge: the currency is a 3-letter code, e.g. USD",
    ]);
  });
});

describe("ports and places", () => {
  it("reads the code of a picked place", () => {
    expect(placeCodeOf("Hamburg (DEHAM)")).toBe("DEHAM");
    expect(placeCodeOf("Hamburg")).toBeNull();
  });

  it("lists the containers a version prices, in display order", () => {
    expect(equipmentOf([{ prices: [{ column: "E", equipment: "40RF", label: "" }] }, TABLE])).toEqual(["20DC", "40DC", "40HC", "40RF"]);
  });

  it("filters port names by status", () => {
    const ports = [{ status: "pending" as const }, { status: "matched" as const }, { status: "pending" as const }];
    expect(portsOf(ports, "pending")).toHaveLength(2);
    expect(portsOf(ports, "all")).toHaveLength(3);
  });

  it("says which rates a surcharge is added to", () => {
    const tables = [TABLE, { label: "Reefer" }];
    expect(surchargeScopeText(newSurcharge(), tables)).toBe("Every table");
    expect(surchargeScopeText({ ...newSurcharge(), tables: [1], equipment: ["reefer"], countries: ["CN"], exceptPorts: ["CNSHA"] }, tables)).toBe(
      "Reefer · reefer only · ports of discharge in CN · not to CNSHA",
    );
  });
});
