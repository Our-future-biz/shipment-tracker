import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { formatWarehouseRef, warehouseRefYear } from "../services/warehouse.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import { warehouseRefCounterTable } from "../schemas/warehouseRefCounter.schema";

const in2026 = new Date("2026-09-16T10:00:00Z");

describe("warehouse reference format", () => {
  it("uses the Prague calendar year and six digits", () => {
    expect(warehouseRefYear(in2026)).toBe(2026);
    // 23:30 UTC on 31 Dec is already 1 Jan in Prague.
    expect(warehouseRefYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(warehouseRefYear(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
    expect(formatWarehouseRef(2026, 1)).toBe("WCZ2026000001");
    expect(formatWarehouseRef(2026, 123456)).toBe("WCZ2026123456");
    // Same length as the old day-based references (WCZ + YYYYMMDD + 2 digits).
    expect(formatWarehouseRef(2026, 1)).toHaveLength("WCZ2026101410".length);
  });
});

describe("createForShipment", () => {
  it("numbers positions 000001, 000002 … per company and year, never reusing a deleted reference", async () => {
    const companyId = randomUUID();
    const a = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026);
    const b = await warehouseTaskRepository.createForShipment(companyId, null, in2026);
    expect([a.task.taskId, b.task.taskId]).toEqual(["WCZ2026000001", "WCZ2026000002"]);

    await warehouseTaskRepository.softDelete(b.task.id, companyId);
    const c = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026);
    expect(c.task.taskId).toBe("WCZ2026000003");

    // A new year starts again; another company has its own numbers.
    const nextYear = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), new Date("2026-12-31T23:30:00Z"));
    expect(nextYear.task.taskId).toBe("WCZ2027000001");
    const other = await warehouseTaskRepository.createForShipment(randomUUID(), randomUUID(), in2026);
    expect(other.task.taskId).toBe("WCZ2026000001");
  });

  it("returns the existing task when the shipment is already in the warehouse, using no number", async () => {
    const companyId = randomUUID();
    const shipmentId = randomUUID();
    const first = await warehouseTaskRepository.createForShipment(companyId, shipmentId, in2026);
    const again = await warehouseTaskRepository.createForShipment(companyId, shipmentId, in2026);
    expect(again).toMatchObject({ created: false, task: { id: first.task.id } });
    expect((await warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026)).task.taskId).toBe("WCZ2026000002");
  });

  it("hands out distinct consecutive references to concurrent adds", async () => {
    const companyId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026)),
    );
    expect(results.map((r) => r.task.taskId).sort()).toEqual([1, 2, 3, 4, 5].map((n) => formatWarehouseRef(2026, n)));
  });

  it("skips a number that spells an old day-based reference, live or deleted", async () => {
    const companyId = randomUUID();
    // Old references WCZ + 20260101 + 01 / 02 look like numbers 010101 and 010102 of 2026.
    await db.insert(warehouseTaskTable).values([
      { companyId, taskId: "WCZ2026010101" },
      { companyId, taskId: "WCZ2026010102", deletedAt: new Date() },
    ]);
    await db.insert(warehouseRefCounterTable).values({ companyId, year: 2026, last: 10100 });
    const next = await warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026);
    expect(next.task.taskId).toBe("WCZ2026010103");
    expect((await warehouseTaskRepository.createForShipment(companyId, null, in2026)).task.taskId).toBe("WCZ2026010104");
  });

  it("gives the number back when the transaction rolls back", async () => {
    const companyId = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await warehouseTaskRepository.createInTx(tx, companyId, randomUUID(), in2026);
        throw new Error("gate record failed");
      }),
    ).rejects.toThrow(/gate record failed/);
    expect((await warehouseTaskRepository.createForShipment(companyId, randomUUID(), in2026)).task.taskId).toBe("WCZ2026000001");
    const [counter] = await db.execute<{ last: number }>(sql`SELECT last FROM warehouse_ref_counter WHERE company_id = ${companyId} AND year = 2026`).then((r) => r.rows);
    expect(Number(counter!.last)).toBe(1);
  });
});
