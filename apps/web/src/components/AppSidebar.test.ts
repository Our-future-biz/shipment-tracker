import { describe, expect, it } from "vitest";
import { navItemVisible, visibleNavItems } from "./AppSidebar";

const labels = (role: string) => visibleNavItems({ role }).map((i) => i.label);

describe("the menu", () => {
  it("shows the normal Warehouse to everyone and the concepts to superadmins only", () => {
    for (const role of ["user", "manager", "admin"]) {
      expect(labels(role)).toContain("Warehouse");
      expect(labels(role)).not.toContain("Warehouse Concept");
      expect(labels(role)).not.toContain("Trucking Concept");
    }
    expect(labels("superadmin")).toEqual(expect.arrayContaining(["Warehouse", "Warehouse Concept", "Trucking Concept"]));
  });

  it("puts Managers under Warehouse Concept, which still opens its own page", () => {
    const concept = visibleNavItems({ role: "superadmin" }).find((i) => i.label === "Warehouse Concept");
    expect(concept?.path).toBe("/warehouse-concept");
    expect(concept?.children).toEqual([{ path: "/warehouse-concept/managers", label: "Managers" }]);
  });

  it("keeps role rules", () => {
    expect(navItemVisible({ roles: ["admin"] }, { role: "user" })).toBe(false);
    expect(navItemVisible({}, { role: "user" })).toBe(true);
    expect(navItemVisible({ roles: ["superadmin"] }, null)).toBe(false);
  });
});
