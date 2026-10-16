import { describe, expect, it } from "vitest";
import { canSeeConcepts } from "./concepts";

describe("canSeeConcepts", () => {
  it("shows the concept modules to superadmins only", () => {
    expect(canSeeConcepts({ role: "superadmin" })).toBe(true);
    for (const role of ["admin", "manager", "user"]) expect(canSeeConcepts({ role })).toBe(false);
    expect(canSeeConcepts(null)).toBe(false);
  });
});
