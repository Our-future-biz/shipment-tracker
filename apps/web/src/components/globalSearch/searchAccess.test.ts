import { describe, expect, it } from "vitest";
import { searchKindAllowed } from "./searchAccess";
import { SEARCH_KINDS } from "./searchTypes";

describe("which kinds the main search asks for", () => {
  it("asks for Warehouse Concept for a superadmin only", () => {
    expect(searchKindAllowed("warehouseConcept", "superadmin")).toBe(true);
    for (const role of ["admin", "manager", "user", undefined]) expect(searchKindAllowed("warehouseConcept", role)).toBe(false);
  });

  it("asks for every other kind for everyone - Co-Loading and loading plans among them", () => {
    for (const kind of SEARCH_KINDS.filter((k) => k !== "warehouseConcept")) {
      expect(searchKindAllowed(kind, "user"), kind).toBe(true);
      expect(searchKindAllowed(kind, "superadmin"), kind).toBe(true);
    }
  });
});
