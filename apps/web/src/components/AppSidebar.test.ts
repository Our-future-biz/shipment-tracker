import { describe, expect, it } from "vitest";
import {
  flyoutAfterArrival,
  navActiveChild,
  navGroupHolding,
  navItemOwns,
  navItemVisible,
  navLabelOf,
  navLooks,
  navSection,
  nextNavGroups,
  sectionClickOpensPage,
  visibleNavItems,
  type NavGroupEvent,
  type NavGroups,
} from "./AppSidebar";

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

  it("puts In Warehouse, Stock and Out Warehouse under Warehouse, which opens its overview", () => {
    const warehouse = visibleNavItems({ role: "user" }).find((i) => i.label === "Warehouse");
    expect(warehouse?.path).toBe("/warehouse");
    expect(warehouse?.children?.map((c) => c.label)).toEqual(["In Warehouse", "Stock", "Out Warehouse"]);
    expect(navActiveChild(warehouse!.children!, "/warehouse/stock")?.label).toBe("Stock");
    expect(navActiveChild(warehouse!.children!, "/warehouse")).toBeUndefined();
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

  it("lights the submenu item of the page, the most specific when two hold it", () => {
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
    // One item's address under another's: the deeper one wins, in either order.
    const nested = [
      { label: "Outer", path: "/x" },
      { label: "Inner", path: "/x/y" },
    ];
    expect(navActiveChild(nested, "/x/y/z")?.label).toBe("Inner");
    expect(navActiveChild([...nested].reverse(), "/x/y/z")?.label).toBe("Inner");
    expect(navActiveChild(nested, "/x/other")?.label).toBe("Outer");
  });

  it("finds the section holding the page, and none on a page of no section", () => {
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

  it("unfolds one section at a time and marks the item you clicked until a page is reached", () => {
    const none = { open: null, selected: null };
    // A click on a section from outside: it unfolds, marked, its page on the way.
    expect(nextNavGroups(none, { type: "open", group: "/sales" })).toEqual({ open: "/sales", selected: "/sales" });
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "open", group: "/tariffs" })).toEqual({ open: "/tariffs", selected: "/tariffs" });
    // Inside it, a click folds it again or unfolds it, and it stays the one marked.
    expect(nextNavGroups({ open: "/sales", selected: null }, { type: "toggle", group: "/sales" })).toEqual({ open: null, selected: "/sales" });
    expect(nextNavGroups({ open: null, selected: "/sales" }, { type: "toggle", group: "/sales" })).toEqual({ open: "/sales", selected: "/sales" });
    // A click on any other item (Dashboard, the logo) folds it and marks that item at once.
    expect(nextNavGroups({ open: "/sales", selected: null }, { type: "leaf", path: "/dashboard" })).toEqual({ open: null, selected: "/dashboard" });
    // A page reached leaves unfolded the section holding it, or none, and the page marked.
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "arrive", holding: "/finance" })).toEqual({ open: "/finance", selected: null });
    expect(nextNavGroups({ open: "/sales", selected: "/sales" }, { type: "arrive", holding: null })).toEqual(none);
  });

  it("opens a section's page from outside it, or while another click's page is on its way", () => {
    const none = { open: null, selected: null };
    // From outside: its page.
    expect(sectionClickOpensPage(none, null, false)).toBe(true);
    // On its own page (the tiles), nothing on its way: only folds or unfolds.
    expect(sectionClickOpensPage({ open: "/sales", selected: null }, "/sales", true)).toBe(false);
    expect(sectionClickOpensPage({ open: null, selected: "/sales" }, "/sales", true)).toBe(false);
    // On one of its pages (Quotes): back to its tiles, folded or not.
    expect(sectionClickOpensPage({ open: "/sales", selected: null }, "/sales", false)).toBe(true);
    expect(sectionClickOpensPage({ open: null, selected: "/sales" }, "/sales", false)).toBe(true);
    // On a Sales page, Tariffs clicked and not here yet: a click on Sales is a new choice, its page.
    expect(sectionClickOpensPage({ open: "/tariffs", selected: "/tariffs" }, "/sales", true)).toBe(true);
    // The same after a click on Dashboard that hasn't arrived.
    expect(sectionClickOpensPage({ open: null, selected: "/dashboard" }, "/sales", true)).toBe(true);
  });

  it("keeps the folded menu's flyout open under the pointer when its section's page arrives", () => {
    expect(flyoutAfterArrival("/tariffs", "/tariffs")).toBe("/tariffs");
    expect(flyoutAfterArrival("/tariffs", "/sales")).toBeNull();
    expect(flyoutAfterArrival("/tariffs", null)).toBeNull();
    expect(flyoutAfterArrival(null, null)).toBeNull();
  });

  it("marks one place as where you are: the item you clicked, else the page", () => {
    // On Shipments, nothing clicked: the page is marked.
    const onPage = navLooks({ open: null, selected: null }, null);
    expect(onPage.leaf("/shipments", true)).toBe("active");
    expect(onPage.group("/sales", false)).toBe("idle");
    // Sales clicked: Sales is marked, the page you are still on is not.
    const picking = navLooks({ open: "/sales", selected: "/sales" }, null);
    expect(picking.group("/sales", false)).toBe("active");
    expect(picking.leaf("/shipments", true)).toBe("idle");
    expect(picking.group("/tariffs", false)).toBe("idle");
    // On a Sales page, Dashboard clicked: Dashboard is marked at once, Sales and its page are not.
    const leaving = navLooks(nextNavGroups({ open: "/sales", selected: null }, { type: "leaf", path: "/dashboard" }), "/sales");
    expect(leaving.leaf("/dashboard", false)).toBe("active");
    expect(leaving.group("/sales", true)).toBe("idle");
    expect(leaving.child(true)).toBe("idle");
    // On Invoicing, Sales clicked: only Sales is marked, Finance and Invoicing are not.
    const elsewhere = navLooks({ open: "/sales", selected: "/sales" }, "/finance");
    expect(elsewhere.group("/sales", false)).toBe("active");
    expect(elsewhere.group("/finance", true)).toBe("idle");
    expect(elsewhere.child(true)).toBe("idle");
    // On a Sales page with Sales open: the page is marked and Sales tinted over it.
    const inside = navLooks({ open: "/sales", selected: null }, "/sales");
    expect(inside.child(true)).toBe("active");
    expect(inside.group("/sales", true)).toBe("lit");
    // On Sales' own page (its overview), open or not: Sales itself is marked, no page under it.
    expect(navLooks({ open: "/sales", selected: null }, "/sales").group("/sales", true, true)).toBe("active");
    expect(navLooks({ open: null, selected: "/sales" }, "/sales").group("/sales", true, true)).toBe("active");
    // Sales folded over its page, by a click or not: Sales itself is marked, the page being hidden.
    expect(navLooks({ open: null, selected: null }, "/sales").group("/sales", true)).toBe("active");
    expect(navLooks({ open: null, selected: "/sales" }, "/sales").group("/sales", true)).toBe("active");
  });

  it("draws exactly one row as where you are, whatever was clicked, on every page the menu lists", () => {
    // The unfolded menu, row by row, as AppSidebar draws it: the labels of its solid rows.
    const solidRows = (role: string, pathname: string, groups: NavGroups, canManageSales: boolean) => {
      const items = visibleNavItems({ role });
      const holding = navGroupHolding(items, pathname);
      const looks = navLooks(groups, holding);
      const solid: string[] = [];
      for (const item of items) {
        if (!item.children) {
          const isPage = pathname === item.path || pathname.startsWith(`${item.path}/`);
          if (looks.leaf(item.path, isPage) === "active") solid.push(item.label);
          continue;
        }
        const children = item.children.filter((c) => !c.managersOnly || canManageSales);
        const holdsPage = navItemOwns(item, pathname);
        const current = navActiveChild(children, pathname);
        if (looks.group(item.path, holdsPage, holdsPage && !current) === "active") solid.push(item.label);
        if (groups.open === item.path) for (const c of children) if (looks.child(c === current) === "active") solid.push(c.label);
      }
      return solid;
    };
    const pages = ["/dashboard", "/customers", "/sales", "/sales/pipeline", "/sales/managers", "/sales/quote/Q-1", "/tariffs", "/invoicing", "/calendar", "/calendar/public-holidays", "/warehouse-concept/gate-log", "/warehouse-concept/managers"];
    const clicks: NavGroupEvent[] = [
      { type: "open", group: "/sales" },
      { type: "open", group: "/tariffs" },
      { type: "open", group: "/finance" },
      { type: "leaf", path: "/dashboard" },
      { type: "leaf", path: "/customs" },
    ];
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      for (const canManageSales of [false, true]) {
        for (const page of pages) {
          const holding = navGroupHolding(visibleNavItems({ role }), page);
          const arrived = nextNavGroups({ open: null, selected: null }, { type: "arrive", holding });
          // As the page arrives, after a click on its section (fold, unfold), and after any other click.
          const states = [arrived, nextNavGroups(arrived, { type: "toggle", group: holding ?? "/sales" })];
          states.push(nextNavGroups(states[1]!, { type: "toggle", group: holding ?? "/sales" }));
          for (const click of clicks) states.push(nextNavGroups(arrived, click));
          // A page the user's menu doesn't list (a user on the superadmins' concept) has no row to
          // mark until something is clicked.
          const listed = visibleNavItems({ role }).some((i) => navItemOwns(i, page));
          states.forEach((state, i) => {
            const expected = i === 0 && !listed ? 0 : 1;
            expect(solidRows(role, page, state, canManageSales), `${role} on ${page}, ${JSON.stringify(state)}`).toHaveLength(expected);
          });
        }
      }
    }
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
