import { describe, expect, it } from "vitest";
import { changesTaxDate, taxDateOf } from "../lib/taxDate";

const imp = { tradeDirection: "Import", actualArrival: "2026-10-01", actualDeparture: "2026-09-20" };

describe("taxDateOf", () => {
  it("is ATA for an import (and a blank direction), ATD for an export", () => {
    expect(taxDateOf(imp)).toBe("2026-10-01");
    expect(taxDateOf({ ...imp, tradeDirection: "" })).toBe("2026-10-01");
    expect(taxDateOf({ ...imp, tradeDirection: "Export" })).toBe("2026-09-20");
  });
});

describe("changesTaxDate", () => {
  it("is set off by a changed ATA or ATD", () => {
    expect(changesTaxDate(imp, { actualArrival: "2026-10-02" })).toBe(true);
    expect(changesTaxDate(imp, { actualDeparture: null })).toBe(true);
  });

  it("is set off by a direction switch that changes which date is the tax date", () => {
    expect(changesTaxDate(imp, { tradeDirection: "Export" })).toBe(true);
    // both dates blank: switching moves nothing
    expect(changesTaxDate({ tradeDirection: "Import" }, { tradeDirection: "Export" })).toBe(false);
  });

  it("ignores writes that leave the dates as they are", () => {
    expect(changesTaxDate(imp, { actualArrival: "2026-10-01" })).toBe(false);
    expect(changesTaxDate(imp, { tradeDirection: "import" })).toBe(false);
    expect(changesTaxDate(imp, {})).toBe(false);
  });
});
