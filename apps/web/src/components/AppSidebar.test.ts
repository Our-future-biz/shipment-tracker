import { describe, expect, it } from "vitest";
import { navItemVisible } from "./AppSidebar";

describe("navItemVisible", () => {
  const user = { role: "user", hiddenModules: ["trucking_concept"] };

  it("hides the items of a hidden module, keeps the rest", () => {
    expect(navItemVisible({ module: "trucking_concept" }, user)).toBe(false);
    expect(navItemVisible({ module: "warehouse_concept" }, user)).toBe(true);
    expect(navItemVisible({}, user)).toBe(true);
  });

  it("keeps role rules and shows a superadmin every module", () => {
    expect(navItemVisible({ roles: ["admin"] }, user)).toBe(false);
    expect(navItemVisible({ module: "trucking_concept" }, { role: "superadmin", hiddenModules: ["trucking_concept"] })).toBe(true);
  });
});
