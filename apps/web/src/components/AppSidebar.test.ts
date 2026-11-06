import { describe, expect, it } from "vitest";
import { navItemVisible, navLabelOf, visibleNavItems } from "./AppSidebar";

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

  it("gives admins and managers the warehouse managers' page, and nobody else a second link to it", () => {
    for (const role of ["admin", "manager"]) {
      expect(visibleNavItems({ role }).find((i) => i.label === "Warehouse Managers")?.path).toBe("/warehouse-concept/managers");
    }
    for (const role of ["user", "superadmin"]) {
      expect(visibleNavItems({ role }).map((i) => i.label)).not.toContain("Warehouse Managers");
    }
  });

  it("names a page as the user's own menu does", () => {
    for (const role of ["admin", "manager"]) expect(navLabelOf("/warehouse-concept/managers/", { role })).toBe("Warehouse Managers");
    expect(navLabelOf("/warehouse-concept/managers/", { role: "superadmin" })).toBe("Managers");
    expect(navLabelOf("/warehouse-concept/", { role: "superadmin" })).toBe("Warehouse Concept");
    expect(navLabelOf("/shipments/", { role: "user" })).toBe("Shipments");
    // A page the user's menu does not list still has its name.
    expect(navLabelOf("/trucking/", { role: "user" })).toBe("Trucking Concept");
    expect(navLabelOf("/nowhere/", null)).toBeNull();
  });

  it("shows Tariffs to everyone with its three sections, opening the first", () => {
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      const tariffs = visibleNavItems({ role }).find((i) => i.label === "Tariffs");
      expect(tariffs?.home).toBe("/tariffs/rail-operators");
      expect(tariffs?.children?.map((c) => c.label)).toEqual(["Rail Operators", "Last / First Mile Collections", "Shipping Lines"]);
    }
  });

  it("keeps role rules", () => {
    expect(navItemVisible({ roles: ["admin"] }, { role: "user" })).toBe(false);
    expect(navItemVisible({}, { role: "user" })).toBe(true);
    expect(navItemVisible({ roles: ["superadmin"] }, null)).toBe(false);
  });
});
