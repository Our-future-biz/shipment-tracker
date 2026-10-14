import { describe, expect, it } from "vitest";
import { publicFields } from "../lib/rows";

describe("publicFields", () => {
  it("drops the tenant and soft-delete columns and keeps the rest", () => {
    const row = { id: "1", companyId: "c", deletedAt: null, name: "x" };
    expect(publicFields(row)).toEqual({ id: "1", name: "x" });
    expect(row.companyId).toBe("c");
  });
});
