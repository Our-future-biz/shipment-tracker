import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { monthBreakdown } from "./monthBreakdown";

const row = (over: Partial<interfaces.JobProfitRow>): interfaces.JobProfitRow => ({
  shipmentId: "s",
  jobNumber: "CZ1",
  customer: "ACME",
  freightMode: "Sea Freight",
  status: "",
  direction: "import",
  basis: "ata",
  date: "2026-10-10",
  month: "2026-10",
  provisional: false,
  revenueCzk: 0,
  costCzk: 0,
  profitCzk: 0,
  unconverted: [],
  ...over,
});

const rows = [
  row({ jobNumber: "CZ3", date: "2026-10-20", customer: "Beta", freightMode: "Road Freight", revenueCzk: 100.1, costCzk: 50, profitCzk: 50.1 }),
  row({ jobNumber: "CZ1", date: "2026-10-05", revenueCzk: 1000.2, costCzk: 400, profitCzk: 600.2 }),
  row({ jobNumber: "CZ2", date: "2026-10-05", customer: "", revenueCzk: 200, costCzk: 300, profitCzk: -100 }),
  row({ jobNumber: "CZ9", month: "2026-09", date: "2026-09-01", revenueCzk: 9999, profitCzk: 9999 }),
];

describe("a month in full", () => {
  it("adds up only that month's jobs", () => {
    expect(monthBreakdown(rows, "2026-10").totals).toEqual({ jobs: 3, revenueCzk: 1300.3, costCzk: 750, profitCzk: 550.3, margin: 42 });
  });

  it("lists the jobs by the day they are dated, then by reference", () => {
    expect(monthBreakdown(rows, "2026-10").rows.map((r) => r.jobNumber)).toEqual(["CZ1", "CZ2", "CZ3"]);
  });

  it("groups by freight mode and customer, the highest revenue first, a job without one under a dash", () => {
    const { byFreightMode, byCustomer } = monthBreakdown(rows, "2026-10");
    expect(byFreightMode.map((g) => [g.label, g.jobs, g.profitCzk])).toEqual([["Sea Freight", 2, 500.2], ["Road Freight", 1, 50.1]]);
    expect(byCustomer.map((g) => g.label)).toEqual(["ACME", "—", "Beta"]);
  });

  it("is empty for a month without jobs, and has no margin without revenue", () => {
    expect(monthBreakdown(rows, "2026-01").totals).toEqual({ jobs: 0, revenueCzk: 0, costCzk: 0, profitCzk: 0, margin: 0 });
    expect(monthBreakdown([row({ costCzk: 10, profitCzk: -10 })], "2026-10").totals.margin).toBe(0);
  });
});
