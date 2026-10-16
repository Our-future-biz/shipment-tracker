import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Trucking shows every stored time on the company's clock (Prague), as the portal, the avizace
// and the server do: never the browser's local time (formatDateTime of lib/date).
const ROOTS = [join(__dirname, ".."), join(__dirname, "../../shipments/[jobNumber]/tabs/TruckingTab.tsx")];

const filesOf = (path: string): string[] =>
  statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => filesOf(join(path, name))) : /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path) ? [path] : [];

describe("Trucking times", () => {
  it("are shown in Prague time everywhere", () => {
    const local = ROOTS.flatMap(filesOf).filter((f) => /\bformatDateTime\b/.test(readFileSync(f, "utf8")));
    expect(local).toEqual([]);
  });
});

describe("the job's Trucking tab in Shipments", () => {
  const tab = readFileSync(join(__dirname, "../../shipments/[jobNumber]/tabs/TruckingTab.tsx"), "utf8");

  it("reads its cards from the one consignment list, not one consignment and trip call per card", () => {
    expect(tab).not.toMatch(/\buseConsignment\(|\buseTrip\(/);
    expect(tab.match(/\buseConsignments\(/g)).toHaveLength(1);
  });

  it("opens Trucking on the job's consignments and says the consignments are view-only here", () => {
    expect(tab).toMatch(/jobConsignmentsHref\(shipment\.id\)/);
    expect(tab).not.toMatch(/href="\/trucking"/);
    expect(tab).toMatch(/Consignments are view-only here/);
  });
});
