import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentTaskTable } from "../../schemas/shipmentTask.schema";
import { shipmentTrackingEventTable } from "../../schemas/shipmentTrackingEvent.schema";
import { shipmentTrackingEventRepository } from "../../repositories/shipmentTrackingEvent.repository";
import { shipmentService } from "../../services/shipment.service";

// The event table against the shipments database, migration 0065 included. Runs only under
// `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();

const newShipment = async () => {
  const companyId = randomUUID();
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: "CZ00000001", tradeDirection: "Import" }).returning();
  return { id: row!.id, companyId };
};
const eventsOf = (shipmentId: string) => db.select().from(shipmentTrackingEventTable).where(eq(shipmentTrackingEventTable.shipmentId, shipmentId));

describe("tracking events", () => {
  it("a change of the shipment stores its fact and its tick in the write turn", async () => {
    const s = await newShipment();
    await shipmentService.update(s.id, s.companyId, { actualDeliveryDate: "2026-11-05" } as never, USER);
    expect(await eventsOf(s.id)).toMatchObject([{ kind: "delivered", occurredOn: "2026-11-05", source: "trucking", effect: "applied", effectValue: "2026-11-05", recordedById: USER }]);
    const ticks = await db.select().from(shipmentTaskTable).where(eq(shipmentTaskTable.shipmentId, s.id));
    expect(ticks).toMatchObject([{ taskKey: "imp_delivered", completed: true }]);
  });

  it("the same fact isn't stored twice: cleared and set again, the one set aside stands again", async () => {
    const s = await newShipment();
    await shipmentService.update(s.id, s.companyId, { actualArrival: "2026-11-05" } as never, USER);
    await shipmentService.update(s.id, s.companyId, { actualArrival: "" } as never, USER);
    expect(await eventsOf(s.id)).toMatchObject([{ effect: "dismissed" }]);
    await shipmentService.update(s.id, s.companyId, { actualArrival: "2026-11-05" } as never, USER);
    expect(await eventsOf(s.id)).toMatchObject([{ effect: "applied", effectValue: "2026-11-05" }]);
  });

  it("a date set for the day a source proposed confirms the proposal, closes the exceptions it ends and adds no fact", async () => {
    const s = await newShipment();
    const base = { companyId: s.companyId, shipmentId: s.id };
    await shipmentTrackingEventRepository.add({ ...base, kind: "delayed", occurredOn: "2026-11-03", note: "Storm" });
    await shipmentTrackingEventRepository.add({ ...base, kind: "arrived", occurredOn: "2026-11-05", source: "document", externalId: "document:arrived:2026-11-05:", effect: "proposed", effectField: "actualArrival", effectValue: "2026-11-05" });
    await shipmentTrackingEventRepository.add({ ...base, kind: "arrived", occurredOn: "2026-11-04", source: "carrier", externalId: "c1", effect: "proposed", effectField: "actualArrival", effectValue: "2026-11-04" });
    await shipmentService.update(s.id, s.companyId, { actualArrival: "2026-11-05" } as never, USER);
    const rows = await eventsOf(s.id);
    expect(rows.filter((e) => e.kind === "arrived" && e.effect === "applied")).toMatchObject([{ source: "document", occurredOn: "2026-11-05", decidedById: USER }]);
    expect(rows.find((e) => e.kind === "delayed")?.resolvedAt).not.toBeNull();
    // A source that says another day still waits for somebody.
    expect(await shipmentTrackingEventRepository.proposedOn([s.id], s.companyId)).toMatchObject([{ source: "carrier", effectValue: "2026-11-04" }]);
    expect(await shipmentTrackingEventRepository.findSameDay(s.id, s.companyId, "arrived", "2026-11-04")).toBeNull();
  });

  it("a corrected or cleared date leaves its old fact off the Last event", async () => {
    const s = await newShipment();
    const latest = async () => (await shipmentTrackingEventRepository.latestPerShipment([s.id], s.companyId)).get(s.id);
    await shipmentService.update(s.id, s.companyId, { actualDeparture: "2026-10-01" } as never, USER);
    await shipmentService.update(s.id, s.companyId, { actualArrival: "2026-11-07" } as never, USER);
    await shipmentService.update(s.id, s.companyId, { actualArrival: "2026-11-05" } as never, USER);
    expect(await latest()).toMatchObject({ kind: "arrived", occurredOn: "2026-11-05" });
    expect((await eventsOf(s.id)).find((e) => e.occurredOn === "2026-11-07")).toMatchObject({ effect: "dismissed", decidedById: USER });
    await shipmentService.update(s.id, s.companyId, { actualArrival: "" } as never, USER);
    expect(await latest()).toMatchObject({ kind: "departed", occurredOn: "2026-10-01" });
    expect((await shipmentService.get(s.id, s.companyId)).lastEvent).toBe("Departed 01.10.2026");
  });

  it("the Last event reads past a fact the shipment no longer holds, however it was left standing", async () => {
    const s = await newShipment();
    await shipmentService.update(s.id, s.companyId, { actualDeparture: "2026-10-01" } as never, USER);
    await shipmentTrackingEventRepository.add({ companyId: s.companyId, shipmentId: s.id, kind: "delivered", occurredOn: "2026-11-09", effect: "applied", effectField: "actualDeliveryDate", effectValue: "2026-11-09" });
    await shipmentTrackingEventRepository.add({ companyId: s.companyId, shipmentId: s.id, kind: "discharged", occurredOn: "2026-11-08" });
    expect((await shipmentTrackingEventRepository.latestPerShipment([s.id], s.companyId)).get(s.id)).toMatchObject({ kind: "discharged" });
  });

  it("a replayed event from a source inserts nothing, until it is struck", async () => {
    const s = await newShipment();
    const row = { companyId: s.companyId, shipmentId: s.id, kind: "arrived", occurredOn: "2026-11-05", source: "carrier", externalId: "x1" };
    const first = await shipmentTrackingEventRepository.add(row);
    await expect(shipmentTrackingEventRepository.add(row)).rejects.toThrow();
    await shipmentTrackingEventRepository.softDeleteForCompany(first.id, s.companyId);
    await expect(shipmentTrackingEventRepository.add(row)).resolves.toBeDefined();
  });

  it("the database refuses an unknown source or effect", async () => {
    const s = await newShipment();
    const base = { companyId: s.companyId, shipmentId: s.id, kind: "note", occurredOn: "2026-11-05" };
    await expect(shipmentTrackingEventRepository.add({ ...base, source: "pigeon" })).rejects.toThrow();
    await expect(shipmentTrackingEventRepository.add({ ...base, effect: "maybe" })).rejects.toThrow();
  });

  it("closing exceptions closes only the kinds asked for", async () => {
    const s = await newShipment();
    const base = { companyId: s.companyId, shipmentId: s.id, occurredOn: "2026-11-05", note: "why" };
    await shipmentTrackingEventRepository.add({ ...base, kind: "rolled" });
    await shipmentTrackingEventRepository.add({ ...base, kind: "hold" });
    await shipmentTrackingEventRepository.resolveOpen(s.id, s.companyId, ["rolled"], USER);
    const rows = await eventsOf(s.id);
    expect(rows.find((e) => e.kind === "rolled")?.resolvedAt).not.toBeNull();
    expect(rows.find((e) => e.kind === "hold")?.resolvedAt).toBeNull();
  });

  it("goes with its shipment", async () => {
    const s = await newShipment();
    await shipmentTrackingEventRepository.add({ companyId: s.companyId, shipmentId: s.id, kind: "note", occurredOn: "2026-11-05", note: "x" });
    await db.delete(shipmentTable).where(eq(shipmentTable.id, s.id));
    expect(await eventsOf(s.id)).toEqual([]);
  });
});
