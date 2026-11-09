import { describe, expect, it } from "vitest";
import { navActiveChild, navGroupHolding, navItemOwns, navItemVisible, navLabelOf, navLooks, navSection, nextNavGroups, visibleNavItems } from "./AppSidebar";

const labels = (role: string) => visibleNavItems({ role }).map((i) => i.label);

describe("the menu", () => {
  it("lists Master Jobs right under Shipments", () => {
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      expect(labels(role).slice(0, 3)).toEqual(["Dashboard", "Shipments", "Master Jobs"]);
    }
  });

  it("shows the normal Warehouse to everyone and the concepts to superadmins only", () => {
    for (const role of ["user", "manager", "admin"]) {
      expect(labels(role)).toContain("Warehouse");
      expect(labels(role)).not.toContain("Warehouse Concept");
      expect(labels(role)).not.toContain("Trucking Concept");
    }
    expect(labels("superadmin")).toEqual(expect.arrayContaining(["Warehouse", "Warehouse Concept", "Trucking Concept"]));
  });

  it("puts Managers under Warehouse Concept, which opens its own page", () => {
    const concept = visibleNavItems({ role: "superadmin" }).find((i) => i.label === "Warehouse Concept");
    expect(concept?.path).toBe("/warehouse-concept");
    expect(concept?.children).toEqual([{ path: "/warehouse-concept/managers", label: "Managers" }]);
  });

  it("gives every section a page of its own: Sales, Tariffs and Finance list their pages there", () => {
    for (const path of ["/sales", "/tariffs", "/finance"]) {
      const section = navSection(path)!;
      expect(section.description).toBeTruthy();
      // Each page says on the overview what it is for.
      for (const page of section.children!) expect(page.description).toBeTruthy();
      expect(navLabelOf(`${path}/`, { role: "user" })).toBe(section.label);
    }
    expect(navSection("/finance")?.children?.map((c) => c.label)).toEqual(["Invoicing", "Exchange"]);
    // A leaf is no section.
    expect(navSection("/dashboard")).toBeUndefined();
    // Calendar's own page is Calendar itself; its one page under it keeps its name.
    expect(navSection("/calendar")?.children?.map((c) => c.label)).toEqual(["Public Holidays"]);
    expect(navLabelOf("/calendar/", { role: "user" })).toBe("Calendar");
    expect(navLabelOf("/calendar/public-holidays/", { role: "user" })).toBe("Public Holidays");
  });

  it("lights the most specific submenu item of the page", () => {
    const concept = visibleNavItems({ role: "superadmin" }).find((i) => i.label === "Warehouse Concept")!;
    expect(navActiveChild(concept.children!, "/warehouse-concept/managers")?.label).toBe("Managers");
    // A page of the concept its menu doesn't list lights no item: the concept itself is marked.
    expect(navActiveChild(concept.children!, "/warehouse-concept/containers")).toBeUndefined();
    const sales = visibleNavItems({ role: "user" }).find((i) => i.label === "Sales")!;
    // An open quote keeps the Quotes list lit.
    expect(navActiveChild(sales.children!, "/sales/quote/Q-0001")?.label).toBe("Quotes");
    expect(navActiveChild(sales.children!, "/dashboard")).toBeUndefined();
    // A user who may not manage Sales does not see its managers' pages, so none of theirs is lit there.
    const forUser = sales.children!.filter((c) => !c.managersOnly);
    expect(navActiveChild(forUser, "/sales/managers")).toBeUndefined();
  });

  it("finds the group holding the page, and none on a page of no group", () => {
    const items = visibleNavItems({ role: "user" });
    expect(navGroupHolding(items, "/dashboard")).toBeNull();
    expect(navGroupHolding(items, "/shipments/CZFCL00000025")).toBeNull();
    expect(navGroupHolding(items, "/sales/pipeline")).toBe("/sales");
    expect(navGroupHolding(items, "/tariffs/shipping-lines")).toBe("/tariffs");
    expect(navGroupHolding(items, "/invoicing")).toBe("/finance");
    expect(navGroupHolding(items, "/calendar")).toBe("/calendar");
    // An admin's Warehouse Managers is a page of its own; a superadmin finds it under Warehouse Concept.
    expect(navGroupHolding(visibleNavItems({ role: "admin" }), "/warehouse-concept/managers")).toBeNull();
    expect(navGroupHolding(visibleNavItems({ role: "superadmin" }), "/warehouse-concept/managers")).toBe("/warehouse-concept");
    expect(navLabelOf("/warehouse-concept/gate-log/", { role: "superadmin" })).toBe("Warehouse Concept");
  });

  it("unfolds one group at a time and keeps the one you clicked marked, folded or not", () => {
    const none = { open: null, selected: null };
    // A click on a group unfolds it, without going anywhere; another group's click swaps them.
    expect(nextNavGroups(none, { type: "toggle", group: "/sales" })).toEqual({ open: "/sales", selected: "/sales" });
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "toggle", group: "/tariffs" })).toEqual({ open: "/tariffs", selected: "/tariffs" });
    // A second click folds it again and it stays the one you are on.
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "toggle", group: "/sales" })).toEqual({ open: null, selected: "/sales" });
    // A click on any other item (Dashboard, the logo) folds it and lets the mark go, even on the page you are on.
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "leaf" })).toEqual(none);
    // A page reached leaves unfolded the group holding it, or none, and nothing picked.
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "arrive", holding: "/finance" })).toEqual({ open: "/finance", selected: null });
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "arrive", holding: null })).toEqual(none);
  });

  it("marks one place as where you are: the group you clicked, else the page", () => {
    // On Shipments, nothing clicked: the page is marked.
    const onPage = navLooks({ open: null, selected: null }, null);
    expect(onPage.item(true)).toBe("active");
    expect(onPage.group("/sales", false)).toBe("idle");
    // Sales unfolded: Sales is marked, the page you are still on is not.
    const picking = navLooks({ open: "/sales", selected: "/sales" }, null);
    expect(picking.group("/sales", false)).toBe("active");
    expect(picking.item(true)).toBe("idle");
    expect(picking.group("/tariffs", false)).toBe("idle");
    // Sales folded again with a second click: still Sales, not back to Shipments.
    const foldedAgain = navLooks(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "toggle", group: "/sales" }), null);
    expect(foldedAgain.group("/sales", false)).toBe("active");
    expect(foldedAgain.item(true)).toBe("idle");
    // On Invoicing, unfolding Sales: only Sales is marked, Finance and Invoicing are not.
    const elsewhere = navLooks({ open: "/sales", selected: "/sales" }, "/finance");
    expect(elsewhere.group("/sales", false)).toBe("active");
    expect(elsewhere.group("/finance", true)).toBe("idle");
    expect(elsewhere.item(true)).toBe("idle");
    // On a Sales page with Sales open: the page is marked and Sales tinted over it.
    const inside = navLooks({ open: "/sales", selected: null }, "/sales");
    expect(inside.item(true)).toBe("active");
    expect(inside.group("/sales", true)).toBe("lit");
    // On Sales' own page (its overview), open or not: Sales itself is marked, no page under it.
    expect(navLooks({ open: "/sales", selected: null }, "/sales").group("/sales", true, true)).toBe("active");
    expect(navLooks({ open: null, selected: "/sales" }, "/sales").group("/sales", true, true)).toBe("active");
    // Sales folded over its page, by a click or not: Sales itself is marked, the page being hidden.
    expect(navLooks({ open: null, selected: null }, "/sales").group("/sales", true)).toBe("active");
    expect(navLooks({ open: null, selected: "/sales" }, "/sales").group("/sales", true)).toBe("active");
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

  it("shows Tariffs to everyone with its three sections", () => {
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      const tariffs = visibleNavItems({ role }).find((i) => i.label === "Tariffs");
      expect(tariffs?.children?.map((c) => c.label)).toEqual(["Rail Operators", "Last / First Mile Collections", "Shipping Lines"]);
    }
  });

  it("groups Invoicing and Exchange under Finance", () => {
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      const finance = visibleNavItems({ role }).find((i) => i.label === "Finance");
      expect(finance?.children?.map((c) => c.label)).toEqual(["Invoicing", "Exchange"]);
      expect(labels(role)).not.toContain("Invoicing");
      expect(labels(role)).not.toContain("Exchange");
    }
  });

  it("lights and opens Finance on its pages, which keep their own addresses", () => {
    const finance = visibleNavItems({ role: "user" }).find((i) => i.label === "Finance")!;
    expect(navItemOwns(finance, "/invoicing")).toBe(true);
    expect(navItemOwns(finance, "/exchange/rates")).toBe(true);
    expect(navItemOwns(finance, "/shipments")).toBe(false);
    expect(navLabelOf("/invoicing/", { role: "user" })).toBe("Invoicing");
    expect(navLabelOf("/exchange/", { role: "user" })).toBe("Exchange");
  });

  it("keeps role rules", () => {
    expect(navItemVisible({ roles: ["admin"] }, { role: "user" })).toBe(false);
    expect(navItemVisible({}, { role: "user" })).toBe(true);
    expect(navItemVisible({ roles: ["superadmin"] }, null)).toBe(false);
  });
});
