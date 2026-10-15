import { describe, expect, it } from "vitest";
import type { TermsConditionRecord } from "../../schemas/termsCondition.schema";
import { toTermsItem } from "../../utils/termsItem.utils";

const row = (over: Partial<TermsConditionRecord> = {}): TermsConditionRecord => ({
  id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
  companyId: "86f202b1-7449-441b-9c5b-5bf4d89f8d88",
  createdAt: new Date("2026-10-01T08:00:00.123Z"),
  updatedAt: new Date("2026-10-02T09:30:00.456Z"),
  deletedAt: null,
  name: "AIR IMPORT",
  includes: "Air freight\nHandling",
  excludes: "Duties and taxes",
  ...over,
});

describe("toTermsItem", () => {
  it("hands out the fields the screens use, times as ISO strings in milliseconds", () => {
    expect(toTermsItem(row())).toEqual({
      id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
      name: "AIR IMPORT",
      includes: "Air freight\nHandling",
      excludes: "Duties and taxes",
      createdAt: "2026-10-01T08:00:00.123Z",
      updatedAt: "2026-10-02T09:30:00.456Z",
    });
  });

  it("hands out nothing else of the row: not the company, not whether it is deleted", () => {
    const item = toTermsItem(row({ deletedAt: new Date("2026-10-03T10:00:00.000Z") }));
    expect(Object.keys(item).sort()).toEqual(["createdAt", "excludes", "id", "includes", "name", "updatedAt"]);
  });
});
