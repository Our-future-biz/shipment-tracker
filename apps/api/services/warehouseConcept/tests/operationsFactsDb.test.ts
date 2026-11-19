import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { managersCockpitService } from "../services/managersCockpit.service";
import { operationsFactsService } from "../services/operationsFacts.service";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";

// The operations facts Shipments → Managers asks for (database): a shipment's records read the
// same as on Warehouse → Managers, for the company only, and its updates waiting or failed.

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment), _internalFreeTimeByContainer: vi.fn(async () => ({ items: [] })) },
    invoicing: (await import("./shipmentFakes")).invoicingFake,
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();

async function linked(c: string) {
  const shipmentId = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  return { shipmentId, movementId: r!.movementId!, ref: r!.ref };
}

const outboxRow = (c: string, movementId: string, shipmentId: string, over: Partial<typeof shipmentOutboxTable.$inferInsert>) => ({
  companyId: c,
  movementId,
  shipmentId,
  kind: "plate" as const,
  stamp: "",
  payload: { plate: "1AB 2345" },
  actingUserId: user,
  actingRole: "user",
  nextAttemptAt: new Date(Date.now() + 3_600_000),
  ...over,
});

describe("Operations facts (database)", () => {
  it("gives a shipment's record with the Warehouse cockpit's own tags, its updates waiting and failed — for the company only", async () => {
    const c = randomUUID();
    const refused = await linked(c);
    await gateMovementService.refuse(refused.movementId, c, user, "no delivery order");
    const quiet = await linked(c);

    await db.insert(shipmentOutboxTable).values([
      outboxRow(c, refused.movementId, refused.shipmentId, { createdAt: new Date(Date.now() - 45 * 60_000) }),
      outboxRow(c, refused.movementId, refused.shipmentId, { createdAt: new Date(Date.now() - 5 * 60_000) }),
      outboxRow(c, refused.movementId, refused.shipmentId, { status: "failed" }),
    ]);

    const now = new Date();
    const facts = await operationsFactsService.forShipments(c, [refused.shipmentId, quiet.shipmentId, randomUUID()], now);
    expect(facts.notKnown).toEqual([]);
    expect(facts.shipments).toHaveLength(3);

    const cockpit = await managersCockpitService.cockpit(c, now);
    const row = cockpit.urgent.rows.find((r) => r.id === refused.movementId)!;
    expect(facts.shipments[0]).toEqual({
      shipmentId: refused.shipmentId,
      records: [{ id: refused.movementId, ref: refused.ref, lifecycle: row.lifecycle, signals: row.tags }],
      // Only the one pending for more than 30 minutes waits too long.
      updatesWaiting: 1,
      updatesFailed: 1,
    });
    expect(facts.shipments[0]!.records[0]!.signals[0]!.text).toMatch(/^Refused \d{2}\.\d{2}\. \d{2}:\d{2}: no delivery order$/);
    expect(facts.shipments[1]).toMatchObject({ shipmentId: quiet.shipmentId, records: [{ id: quiet.movementId }], updatesWaiting: 0, updatesFailed: 0 });
    expect(facts.shipments[2]).toMatchObject({ records: [], updatesWaiting: 0, updatesFailed: 0 });

    // Another company asking for the same shipments sees none of it.
    const other = await operationsFactsService.forShipments(randomUUID(), [refused.shipmentId], now);
    expect(other.shipments).toEqual([{ shipmentId: refused.shipmentId, records: [], updatesWaiting: 0, updatesFailed: 0 }]);
  });

  it("each record reads the same as its row on Warehouse → Managers: ref, lifecycle and tags", async () => {
    const c = randomUUID();
    const refused = await linked(c);
    await gateMovementService.refuse(refused.movementId, c, user, "damaged");
    const quiet = await linked(c);
    const asked = [refused, quiet];
    const now = new Date();

    const facts = await operationsFactsService.forShipments(c, asked.map((s) => s.shipmentId), now);
    const cockpit = await managersCockpitService.cockpit(c, now);
    const rows = new Map([...cockpit.urgent.rows, ...cockpit.attention.rows].map((r) => [r.id, r]));
    const records = facts.shipments.flatMap((s) => s.records);
    expect(records.map((r) => r.id).sort()).toEqual(asked.map((s) => s.movementId).sort());
    for (const r of records) {
      const row = rows.get(r.id);
      // A record in play with no signal has no row on the cockpit, and no tags here.
      if (!row) {
        expect(r.signals).toEqual([]);
        continue;
      }
      expect(r).toEqual({ id: row.id, ref: row.ref, lifecycle: row.lifecycle, signals: row.tags });
    }
    expect(rows.has(refused.movementId)).toBe(true);
  });
});
