import { describe, expect, it } from "vitest";
import { PackageIcon } from "@phosphor-icons/react";
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
