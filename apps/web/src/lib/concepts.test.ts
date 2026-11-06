import { describe, expect, it } from "vitest";
import { canSeeConcepts, isWarehouseManagerOnly } from "./concepts";

describe("isWarehouseManagerOnly", () => {
  it("is an admin or a manager: a superadmin sees the whole module, a regular user none of it", () => {
    expect(isWarehouseManagerOnly({ role: "admin" })).toBe(true);
    expect(isWarehouseManagerOnly({ role: "manager" })).toBe(true);
    expect(isWarehouseManagerOnly({ role: "superadmin" })).toBe(false);
    expect(isWarehouseManagerOnly({ role: "user" })).toBe(false);
    expect(isWarehouseManagerOnly(null)).toBe(false);
  });
});

describe("canSeeConcepts", () => {
  it("shows the concept modules to superadmins only", () => {
    expect(canSeeConcepts({ role: "superadmin" })).toBe(true);
    for (const role of ["admin", "manager", "user"]) expect(canSeeConcepts({ role })).toBe(false);
    expect(canSeeConcepts(null)).toBe(false);
  });
});
