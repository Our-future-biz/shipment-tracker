import { describe, expect, it } from "vitest";
import { isModuleEnabled, moduleOfPath, shipmentWarehouseReadOnly } from "./modules";

const austromarUser = { role: "user", hiddenModules: ["warehouse_concept", "trucking_concept"] };

describe("isModuleEnabled", () => {
  it("hides what the company has hidden", () => {
    expect(isModuleEnabled(austromarUser, "trucking_concept")).toBe(false);
    expect(isModuleEnabled(austromarUser, "warehouse_concept")).toBe(false);
    expect(isModuleEnabled({ role: "admin", hiddenModules: ["trucking_concept"] }, "warehouse_concept")).toBe(true);
  });

  it("shows everything to a superadmin and to a server that sends no list yet", () => {
    expect(isModuleEnabled({ role: "superadmin", hiddenModules: ["trucking_concept"] }, "trucking_concept")).toBe(true);
    expect(isModuleEnabled({ role: "user" }, "trucking_concept")).toBe(true);
    expect(isModuleEnabled(null, "trucking_concept")).toBe(true);
  });
});

describe("moduleOfPath", () => {
  it("finds the module of a page, with or without the trailing slash", () => {
    expect(moduleOfPath("/trucking/trips/1/")).toBe("trucking_concept");
    expect(moduleOfPath("/warehouse")).toBe("warehouse_concept");
    expect(moduleOfPath("/warehouses-elsewhere")).toBeNull();
    expect(moduleOfPath("/shipments/JCZ1")).toBeNull();
  });
});

describe("shipmentWarehouseReadOnly", () => {
  it("is view only while the Warehouse Concept keeps the warehouse part, editable without it", () => {
    expect(shipmentWarehouseReadOnly({ role: "user" })).toBe(true);
    expect(shipmentWarehouseReadOnly(austromarUser)).toBe(false);
    expect(shipmentWarehouseReadOnly({ role: "superadmin", hiddenModules: ["warehouse_concept"] })).toBe(true);
  });
});
