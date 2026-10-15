import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import {
  TARIFF_FILE_MAX_BYTES,
  defaultActivationDate,
  diffChangeText,
  diffStructureLines,
  diffTiles,
  diffTone,
  fileDataUrl,
  findingSheet,
  groupFindings,
  isSameAsAgainst,
  tariffFileProblem,
} from "./tariffUpload";

describe("tariff file check", () => {
  it("takes an .xlsx up to 5 MB", () => {
    expect(tariffFileProblem({ name: "Standard 2027.xlsx", size: 120_000 })).toBeNull();
    expect(tariffFileProblem({ name: "SELL.XLSX", size: TARIFF_FILE_MAX_BYTES })).toBeNull();
  });

  it("refuses other files, empty ones and ones over 5 MB", () => {
    expect(tariffFileProblem({ name: "prices.xls", size: 1000 })).toMatch(/\.xlsx/);
    expect(tariffFileProblem({ name: "prices.csv", size: 1000 })).toMatch(/\.xlsx/);
    expect(tariffFileProblem({ name: "prices.xlsx", size: 0 })).toBe("The file is empty.");
    expect(tariffFileProblem({ name: "prices.xlsx", size: TARIFF_FILE_MAX_BYTES + 1 })).toBe("The file is 5.0 MB; the limit is 5 MB.");
  });
});

describe("downloaded files", () => {
  it("become a data URL with the server's type, or the Excel type when none is given", () => {
    expect(fileDataUrl({ fileBase64: "QUJD", contentType: "application/pdf" })).toBe("data:application/pdf;base64,QUJD");
    expect(fileDataUrl({ fileBase64: "QUJD", contentType: "" })).toBe("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,QUJD");
  });
});

const finding = (severity: "error" | "warning", where: string, message = "m"): interfaces.ValidationFinding => ({ severity, where, message });

describe("findings by sheet", () => {
  it("reads the sheet from where", () => {
    expect(findingSheet("Sheet D2, row 7, column F")).toBe("D2");
    expect(findingSheet("sheet Zones, row 3")).toBe("Zones");
    expect(findingSheet("Sheet EXP_1000")).toBe("EXP_1000");
    expect(findingSheet("zone 3, band 1 001–1 500 kg")).toBe("Whole version");
    expect(findingSheet("")).toBe("Whole version");
  });

  it("puts errors first, then warnings, grouped by sheet in the order they appear", () => {
    const sections = groupFindings([
      finding("warning", "Sheet D1, row 4", "w1"),
      finding("error", "Sheet Zones, row 5", "e1"),
      finding("error", "Sheet D2, row 7, column F", "e2"),
      finding("error", "Sheet Zones, row 9", "e3"),
      finding("warning", "Prices", "w2"),
    ]);
    expect(sections.map((s) => `${s.severity}:${s.count}`)).toEqual(["error:3", "warning:2"]);
    expect(sections[0]?.groups.map((g) => [g.sheet, g.findings.map((f) => f.message)])).toEqual([
      ["Zones", ["e1", "e3"]],
      ["D2", ["e2"]],
    ]);
    expect(sections[1]?.groups.map((g) => g.sheet)).toEqual(["D1", "Whole version"]);
  });

  it("has no sections without findings, and only warnings when there are no errors", () => {
    expect(groupFindings([])).toEqual([]);
    expect(groupFindings([finding("warning", "Sheet D1")]).map((s) => s.severity)).toEqual(["warning"]);
  });
});

const cell = (before: number | null, after: number | null, changePercent: number | null) => ({ before, after, changePercent });

describe("a cell's change", () => {
  it("has a direction", () => {
    expect(diffTone(cell(100, 110, 10))).toBe("up");
    expect(diffTone(cell(100, 90, -10))).toBe("down");
    expect(diffTone(cell(null, 90, null))).toBe("added");
    expect(diffTone(cell(100, null, null))).toBe("removed");
    expect(diffTone(cell(100, 100, 0))).toBe("same");
  });

  it("reads in words as well as colour", () => {
    expect(diffChangeText(cell(100, 112.5, 12.5))).toBe("▲ +12.5 %");
    expect(diffChangeText(cell(100, 97, -3))).toBe("▼ −3 %");
    expect(diffChangeText(cell(null, 90, null))).toBe("new");
    expect(diffChangeText(cell(100, null, null))).toBe("removed");
    expect(diffChangeText(cell(100, 100, 0))).toBe("no change");
  });
});

const diff = (over: Partial<interfaces.TariffVersionDiff> = {}): interfaces.TariffVersionDiff => ({
  against: null,
  changedCells: 0,
  addedCells: 0,
  removedCells: 0,
  unchangedCells: 40,
  averageChangePercent: null,
  maxIncreasePercent: null,
  maxDecreasePercent: null,
  zonesAdded: [],
  zonesRemoved: [],
  levelsAdded: [],
  levelsRemoved: [],
  surchargeChanges: [],
  cells: [],
  affectedOpenQuotes: null,
  affectedOpenConsignments: null,
  ...over,
});

describe("version comparison", () => {
  it("sums up in tiles", () => {
    const tiles = diffTiles(diff({ changedCells: 12, addedCells: 3, averageChangePercent: 4.04, maxIncreasePercent: 18, maxDecreasePercent: -2.5 }));
    expect(tiles.map((t) => `${t.label}=${t.value}:${t.tone}`)).toEqual([
      "Changed=12:up",
      "Added=3:added",
      "Removed=0:same",
      "Unchanged=40:same",
      "Average change=+4 %:up",
      "Biggest rise=+18 %:up",
      "Biggest fall=−2.5 %:down",
    ]);
    expect(diffTiles(diff()).find((t) => t.label === "Average change")?.value).toBe("—");
  });

  it("lists zone, level and surcharge changes in plain words", () => {
    const labels: Record<string, string> = { D1: "+1 day", EXP_1000: "Express by 10:00" };
    const lines = diffStructureLines(
      diff({ zonesAdded: ["Z7", "Z8"], zonesRemoved: ["Z1"], levelsAdded: ["EXP_1000"], levelsRemoved: ["D1"], surchargeChanges: ["Fuel: 12 % → index"] }),
      (c) => labels[c] ?? c,
    );
    expect(lines).toEqual([
      "Zones added: Z7, Z8",
      "Zones removed: Z1",
      "Service levels added: Express by 10:00",
      "Service levels removed: +1 day",
      "Surcharge: Fuel: 12 % → index",
    ]);
  });

  it("knows when nothing changed", () => {
    expect(isSameAsAgainst(diff())).toBe(true);
    expect(isSameAsAgainst(diff({ changedCells: 1 }))).toBe(false);
    expect(isSameAsAgainst(diff({ surchargeChanges: ["Toll: 50 CZK → 60 CZK"] }))).toBe(false);
  });
});

describe("activation date", () => {
  it("is today, or the draft's own later start", () => {
    expect(defaultActivationDate("2026-10-01", "2026-10-15")).toBe("2026-10-15");
    expect(defaultActivationDate("2027-01-01", "2026-10-15")).toBe("2027-01-01");
  });
});
