import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Which user-facing endpoints a hidden module refuses (lib/modules requireModule), read from the
// controllers themselves so a new endpoint cannot be added without deciding.

const ROOT = path.resolve(__dirname, "../../services");

/** Every `expose: true, auth: true` endpoint of a service: its name and whether it calls requireModule(module). */
function endpoints(service: string, module: string) {
  const dir = path.join(ROOT, service, "controllers");
  const found: { name: string; guarded: boolean }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(path.join(dir, file), "utf8");
    const parts = src.split(/export const (\w+) = api\(/).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      const [name, body] = [parts[i]!, parts[i + 1]!];
      if (!/expose:\s*true/.test(body.slice(0, 400)) || !/auth:\s*true/.test(body.slice(0, 400))) continue;
      found.push({ name, guarded: body.includes(`requireModule("${module}")`) });
    }
  }
  return found;
}

// What the Shipments → Warehouse tab (and its warehouse/* parts) call: that tab stays for every
// company - read-only while the company has the Warehouse Concept, edited there when it does not.
const SHIPMENTS_WAREHOUSE_TAB = [
  "pickupPinGenerate",
  "warehouseList", // guarded only without shipmentId (the whole Positions list)
  "warehousePositionMarkSent",
  "warehousePositionSectionGet",
  "warehousePositionSectionPatch",
  "warehouseSectionGet",
  "warehouseSectionPatch",
  "warehouseSectionSummary",
  "warehouseSectionUpsert",
];

describe("module guards", () => {
  it("every Trucking endpoint a user reaches refuses a company that hides Trucking", () => {
    const list = endpoints("trucking", "trucking_concept");
    expect(list.length).toBeGreaterThan(80);
    expect(list.filter((e) => !e.guarded).map((e) => e.name)).toEqual([]);
  });

  it("every Warehouse Concept endpoint is guarded; what the Shipments Warehouse tab uses is not", () => {
    const list = endpoints("warehouse", "warehouse_concept");
    expect(list.length).toBeGreaterThan(90);
    expect(list.filter((e) => !e.guarded).map((e) => e.name).sort()).toEqual(SHIPMENTS_WAREHOUSE_TAB.filter((n) => n !== "warehouseList"));
    const listSrc = readFileSync(path.join(ROOT, "warehouse/controllers/warehouseList.controller.ts"), "utf8");
    expect(listSrc).toContain('if (!req.shipmentId) await requireModule("warehouse_concept");');
  });
});
