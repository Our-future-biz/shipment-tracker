import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { warehouseRefPrefix } from "../services/warehouse.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";

describe("warehouseRefPrefix", () => {
  it("uses the Prague calendar date", () => {
    expect(warehouseRefPrefix(new Date("2026-09-16T10:00:00Z"))).toBe("WCZ20260916");
    // 23:30 UTC on 31 Dec is already 1 Jan in Prague.
    expect(warehouseRefPrefix(new Date("2026-12-31T23:30:00Z"))).toBe("WCZ20270101");
  });
});

describe("createForShipment", () => {
  it("numbers each day's shipments 01, 02, … without reusing deleted references", async () => {
    const companyId = randomUUID();
    const prefix = "WCZ20260916";

    const a = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), prefix);
    const b = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), prefix);
    expect([a.task.taskId, b.task.taskId]).toEqual(["WCZ2026091601", "WCZ2026091602"]);

    await warehouseTaskRepository.softDelete(b.task.id, companyId);
    const c = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), prefix);
    expect(c.task.taskId).toBe("WCZ2026091603");

    const other = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), "WCZ20260917");
    expect(other.task.taskId).toBe("WCZ2026091701");
  });

  it("returns the existing task when the shipment is already in the warehouse", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const first = await warehouseTaskRepository.createForShipment(companyId, shipmentId, "WCZ20260916");
    const again = await warehouseTaskRepository.createForShipment(companyId, shipmentId, "WCZ20260916");
    expect(again).toMatchObject({ created: false, task: { id: first.task.id } });
  });

  it("hands out distinct references to concurrent adds", async () => {
    const companyId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => warehouseTaskRepository.createForShipment(companyId, randomUUID(), "WCZ20260916")),
    );
    expect(results.map((r) => r.task.taskId).sort()).toEqual(
      ["01", "02", "03", "04", "05"].map((n) => `WCZ20260916${n}`),
    );
  });
});
