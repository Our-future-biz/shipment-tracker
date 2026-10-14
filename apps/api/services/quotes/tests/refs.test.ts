import { describe, expect, it } from "vitest";
import { baseRef, nextDuplicateRef, nextSalesRef, salesRefPrefix, subLineRef } from "../lib/refs";

describe("quote references", () => {
  it("prefixes the day", () => {
    expect(salesRefPrefix(new Date(2026, 9, 4))).toBe("QCZ20261004");
  });

  it("numbers base references past the highest used, ignoring duplicates", () => {
    const prefix = "QCZ20261004";
    expect(nextSalesRef(prefix, [])).toBe("QCZ20261004001");
    expect(nextSalesRef(prefix, ["QCZ20261004001", "QCZ20261004007", "QCZ20261004002-3"])).toBe("QCZ20261004008");
  });

  it("duplicates off the base reference, -2 first", () => {
    expect(baseRef("QCZ20261004001-3")).toBe("QCZ20261004001");
    expect(nextDuplicateRef("QCZ20261004001", [])).toBe("QCZ20261004001-2");
    expect(nextDuplicateRef("QCZ20261004001", ["QCZ20261004001-2", "QCZ20261004001-5"])).toBe("QCZ20261004001-6");
  });

  it("pads sub-line numbers", () => {
    expect(subLineRef("Q-1", 7)).toBe("Q-1-007");
  });
});
