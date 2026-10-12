import { describe, expect, it } from "vitest";
import { groupHblPages, normalizeHblRef } from "../lib/hblGroups";

const page = (pageNum: number, type: string, ref = "", fileName = "hbl.pdf") => ({ pageNum, fileName, type, ref });
const nums = (groups: { pageNum: number }[][]) => groups.map((g) => g.map((p) => p.pageNum));

describe("normalizeHblRef", () => {
  it("ignores slashes, spaces and case", () => {
    expect(normalizeHblRef("CHI/BRV/V01035")).toBe("CHIBRVV01035");
    expect(normalizeHblRef(" chi brv v01035 ")).toBe("CHIBRVV01035");
    expect(normalizeHblRef(undefined)).toBe("");
  });
});

describe("groupHblPages", () => {
  it("keeps a House B/L that runs over two pages as one shipment", () => {
    // The CHV229738 pre-alert: cover page, then 10 HBLs on 12 pages.
    const pages = [
      page(1, "SKIP"),
      page(2, "HBL", "ATL/BRV/V00109"),
      page(3, "HBL", "CHI/BRV/V01035"),
      page(4, "HBL", "CHI/BRV/V01035"),
      page(5, "HBL", "CHI/VNA/V06587"),
      page(6, "HBL", "CHI/VNA/V06587"),
    ];
    expect(nums(groupHblPages(pages))).toEqual([[2], [3, 4], [5, 6]]);
  });

  it("merges copies of the same HBL from different files", () => {
    const pages = [
      page(1, "HBL", "CHI/BRV/V01035", "unrated.pdf"),
      page(2, "HBL", "CHIBRVV01035", "rated.pdf"),
    ];
    expect(nums(groupHblPages(pages))).toEqual([[1, 2]]);
  });

  it("attaches a page without a number to the HBL right before it in the same file", () => {
    const pages = [page(1, "HBL", "A1"), page(2, "HBL", ""), page(3, "HBL", "", "other.pdf")];
    expect(nums(groupHblPages(pages))).toEqual([[1, 2], [3]]);
  });

  it("never counts invoices, packing lists or skipped pages", () => {
    const pages = [page(1, "INVOICE", "A1"), page(2, "PACKING_LIST", "A1"), page(3, "HBL", "A1"), page(4, "SKIP")];
    expect(nums(groupHblPages(pages))).toEqual([[3]]);
  });
});
