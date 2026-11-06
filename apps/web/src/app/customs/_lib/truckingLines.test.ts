import { describe, expect, it } from "vitest";
import { truckingLines } from "./truckingLines";

const OFFICE = "CZ100000 Celní úřad v Brně, Brno";
const section = (...rows: Record<string, string>[]) => ({ pin: "1234", rows: JSON.stringify(rows) });

describe("truckingLines", () => {
  it("gives each truck of the Pick-up tab its line, with the shipment's office", () => {
    const stored = section(
      { haulier: " Rapid ", licensePlate: " 1AB 2345 ", driver: "Jan Novák" },
      { haulier: "", licensePlate: "3CD 4567", driver: "Eva" },
    );
    expect(truckingLines(stored, OFFICE)).toEqual([
      ["1AB 2345", "Rapid", OFFICE],
      ["3CD 4567", "", OFFICE],
    ]);
  });

  it("leaves out a row with neither a plate nor a haulier, whoever drives", () => {
    expect(truckingLines(section({ haulier: " ", licensePlate: "", driver: "Jan Novák" }), "")).toEqual([]);
  });

  it("shows an office that has no truck yet", () => {
    expect(truckingLines(null, OFFICE)).toEqual([["", "", OFFICE]]);
  });

  it("has no lines without a truck and an office, or with rows that cannot be read", () => {
    for (const stored of [null, undefined, "x", {}, { rows: "" }, { rows: "not json" }, { rows: "{}" }, { rows: "[null, 5]" }]) {
      expect(truckingLines(stored, "")).toEqual([]);
    }
  });
});
