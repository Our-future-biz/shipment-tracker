import { describe, expect, it } from "vitest";
import { PackageIcon } from "@phosphor-icons/react";
import { visibleNavItems } from "@/components/AppSidebar";
import { matchPages, menuPages } from "./searchPages";

const items = [
  { path: "/shipments", label: "Shipments", icon: PackageIcon },
  {
    path: "/finance",
    label: "Finance",
    icon: PackageIcon,
    description: "Invoicing of the jobs, and the exchange rates.",
    children: [
      { path: "/invoicing", label: "Invoicing", description: "Invoices to customers for the jobs." },
      { path: "/exchange", label: "Exchange", description: "The exchange rates." },
    ],
  },
  {
    path: "/sales",
    label: "Sales",
    icon: PackageIcon,
    children: [
      { path: "/sales/quotes", label: "Quotes" },
      { path: "/sales/managers", label: "Managers", managersOnly: true },
    ],
  },
];

describe("menuPages", () => {
  it("lists sections and their pages, the managers' pages only for managers", () => {
    expect(menuPages(items, false).map((p) => p.label)).toEqual([
      "Shipments",
      "Finance",
      "Finance › Invoicing",
      "Finance › Exchange",
      "Sales",
      "Sales › Quotes",
    ]);
    expect(menuPages(items, true).map((p) => p.label)).toContain("Sales › Managers");
  });
});

describe("matchPages", () => {
  const pages = menuPages(items, true);

  it("finds a page by its name, without regard to case or accents, its own name first", () => {
    expect(matchPages(pages, "EXCHANGE", 5).map((p) => p.path)).toEqual(["/exchange", "/finance"]);
    expect(matchPages(pages, "quótes", 5).map((p) => p.path)).toEqual(["/sales/quotes"]);
  });

  it("needs every word and stops at the limit", () => {
    expect(matchPages(pages, "finance invoic", 5).map((p) => p.path)).toEqual(["/finance", "/invoicing"]);
    expect(matchPages(pages, "a", 2)).toHaveLength(2);
    expect(matchPages(pages, "   ", 5)).toEqual([]);
  });
});

describe("the managers' pages in the app's own menu", () => {
  const pagesOf = (role: string, canManageSales: boolean) => menuPages(visibleNavItems({ role }), canManageSales);

  it("lists Shipments › Managers for managers and admins only, whatever they may do in Sales", () => {
    for (const canManageSales of [false, true]) {
      for (const role of ["manager", "admin", "superadmin"]) {
        const page = pagesOf(role, canManageSales).find((p) => p.path === "/shipments/managers");
        expect(page?.label, role).toBe("Shipments › Managers");
        expect(page?.description).toBe("What the operations team needs from a manager today.");
      }
      const forUser = pagesOf("user", canManageSales);
      expect(forUser.map((p) => p.path)).not.toContain("/shipments/managers");
      // Shipments itself is still there, once.
      expect(forUser.filter((p) => p.path === "/shipments").map((p) => p.label)).toEqual(["Shipments"]);
    }
  });

  it("tells the three managers' pages apart by their section", () => {
    const found = (role: string) => matchPages(pagesOf(role, true), "managers", 10).map((p) => p.label);
    expect(found("manager")).toEqual(["Shipments › Managers", "Sales › Managers", "Warehouse Managers"]);
    expect(found("superadmin")).toEqual(["Shipments › Managers", "Sales › Managers", "Warehouse Concept › Managers"]);
    // Sales' own gate is untouched: its managers' page follows the server's answer, not the role.
    expect(matchPages(pagesOf("manager", false), "managers", 10).map((p) => p.label)).toEqual(["Shipments › Managers", "Warehouse Managers"]);
    expect(matchPages(pagesOf("user", true), "managers", 10).map((p) => p.label)).toEqual(["Sales › Managers"]);
    // Typed with its section, only the one meant.
    expect(matchPages(pagesOf("admin", true), "shipments managers", 10).map((p) => p.path)).toEqual(["/shipments/managers"]);
  });
});
