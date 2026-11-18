import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

vi.mock("~encore/clients", () => ({
  auth: {},
  customers: {},
  invoicing: {},
  quotes: {},
  warehouse: { _internalPickupPlates: async () => ({ plates: [] }) },
  holidays: { _internalHolidaysCzNational: async () => ({ dates: [] }) },
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { addDays } from "../../../../lib/businessDate";
import { db } from "../../db/db";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { COCKPIT_EVENT_KINDS, opsDay, timelineFactsOf } from "../../lib/managersCockpit";
import { candidateRange, needsAttentionOf, urgentIds } from "../../lib/needsAttention";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentTrackingEventRepository } from "../../repositories/shipmentTrackingEvent.repository";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentTrackingEventTable } from "../../schemas/shipmentTrackingEvent.schema";
import { needsAttentionService } from "../../services/needsAttention.service";
import { shipmentService } from "../../services/shipment.service";

// The Shipments list's Needs Attention against the shipments database: the narrow read finds every
// job the rules name (judged here a second time over ALL of the company's rows), and the two
// cards, the Overview tile's count and the list the tile opens name the same jobs. Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
//
// Everything is judged on the one instant NOW, handed to every call: the three places are asked
// one after another, and a run across midnight - or across a cut-off's minute - must not move a
// window or a "missed" between them.

let jobs = 700;
const NOW = new Date();
const DAY = opsDay(NOW);
const day = (offset: number) => addDays(DAY.today, offset);

type JobData = Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">>;
const newJob = async (companyId: string, over: JobData = {}) => {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZN${jobs++}`, tradeDirection: "Export", freightMode: "Sea Freight", ...over })
    .returning();
  return row!;
};
const fact = (companyId: string, shipmentId: string, kind: string) => db.insert(shipmentTrackingEventTable).values({ companyId, shipmentId, kind, occurredOn: day(-1) });
const sorted = (ids: string[]) => [...ids].sort();

/** Every date column a rule reads, at every distance that matters, with and without an ATD and an old ETD. */
const grid = (): JobData[] => {
  const offsets = [-20, -8, -7, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 30];
  const dated = offsets.flatMap((n): JobData[] => [
    { cargoReadinessDate: day(n) },
    { pickupDate: day(n), tradeDirection: "Domestic", freightMode: "Road Freight" },
    { estimatedDeparture: day(n) },
    { estimatedArrival: day(n), tradeDirection: "Import" },
    { etaWarehouse: day(n), tradeDirection: "Import" },
    { plannedDeliveryDate: day(n), tradeDirection: "Import" },
    { closingDate: day(n), closingTime: "00:01" },
    { closingDate: day(n), closingTime: "23:59", estimatedDeparture: day(n + 3) },
    { closingDate: day(n), actualDeparture: day(-1) },
    // Left without an ATD typed: an ATA or an actual delivery ends the cut-offs too - the narrow read must hand both over.
    { closingDate: day(n), vgmClosing: day(n), vgm: "Pending (Red)", actualArrival: day(-1), tradeDirection: "Import" },
    { siClosing: day(n), shippingInstructions: "", actualDeliveryDate: day(-1) },
    { closingDate: day(n), warehouseReceivedDate: day(-1) },
    { vgmClosing: day(n), vgm: "Pending (Red)" },
    { vgmClosing: day(n), vgm: "Confirmed (Green)" },
    { vgmClosing: day(n), vgm: "", estimatedDeparture: day(-8) },
    // A passed cut-off stays while the ETD is today or later - and is history the day after.
    { vgmClosing: day(n), vgm: "Pending", estimatedDeparture: day(0) },
    { siClosing: day(n), shippingInstructions: "", estimatedDeparture: day(-1) },
    // The filings' own times: due today, past its time is overdue.
    { vgmClosing: day(n), vgmClosingTime: "00:01", vgm: "Pending" },
    { siClosing: day(n), siClosingTime: "23:59", shippingInstructions: "", estimatedDeparture: day(n + 2) },
    { ams: "Pending", amsDeadline: day(n), amsDeadlineTime: "00:01", estimatedDeparture: day(n + 5) },
    { isf: "Pending", isfDeadline: day(n), isfDeadlineTime: "23:59" },
    { siClosing: day(n), shippingInstructions: "" },
    { siClosing: day(n), shippingInstructions: "Confirmed" },
    { ams: "Pending", amsDeadline: day(n) },
    { ams: "Pending", estimatedDeparture: day(n) },
    { isf: "pending", isfDeadline: day(n), estimatedDeparture: day(n - 9) },
    { isf: "Pending (Red)", estimatedDeparture: day(n), actualDeparture: day(n) },
  ]);
  return [
    ...dated,
    {},
    // Not active: never listed, whatever is due.
    { estimatedDeparture: day(0), invoicingStatus: "Invoiced" },
    { closingDate: day(-1), status: CANCELLED_STATUS },
    { pickupDate: day(0), deletedAt: new Date() },
  ];
};

describe("Needs Attention against the database", () => {
  it("the narrow read finds every job the rules name: judged over all of the company's rows, the lists are the same", async () => {
    const companyId = randomUUID();
    const rows = await Promise.all(grid().map((over) => newJob(companyId, over)));
    // The cargo of every fifth job with a Closing made it.
    const made = rows.filter((r, i) => r.closingDate && i % 5 === 0);
    await Promise.all(made.map((r) => fact(companyId, r.id, "gate_in")));

    // The rules over every active row, read without the read's own conditions.
    const all = (await db.select().from(shipmentTable).where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))).filter(
      (r) => r.invoicingStatus !== "Invoiced" && r.status !== CANCELLED_STATUS,
    );
    const events = await shipmentTrackingEventRepository.ofKinds(all.map((r) => r.id), companyId, COCKPIT_EVENT_KINDS);
    const timeline = new Map(made.map((r) => [r.id, timelineFactsOf(events.filter((e) => e.shipmentId === r.id))]));
    const whole = needsAttentionOf(all, timeline, DAY);

    const lists = await needsAttentionService.lists(companyId, NOW);
    expect(lists).toMatchObject({ capped: false, holidaysKnown: true, notKnown: [] });
    expect(lists.within24h.map((i) => [i.id, i.deadlines])).toEqual(whole.within24h.map((i) => [i.id, i.deadlines]));
    expect(lists.within48h.map((i) => [i.id, i.deadlines])).toEqual(whole.within48h.map((i) => [i.id, i.deadlines]));
    // The grid is no empty test: both lists hold jobs, and the read left many rows out.
    expect(lists.within24h.length).toBeGreaterThan(20);
    expect(lists.within48h.length).toBeGreaterThan(5);
    const read = await shipmentRepository.needsAttentionCandidates(companyId, candidateRange(DAY), 5000);
    expect(read.length).toBeLessThan(all.length);
  });

  it("the URGENT card, the Overview tile's count and the list the tile opens name the same jobs", async () => {
    const companyId = randomUUID();
    await Promise.all(grid().map((over) => newJob(companyId, over)));
    const cards = await shipmentService.needsAttention(companyId, NOW);
    const urgent = urgentIds(cards);
    expect(urgent.length).toBeGreaterThan(20);

    expect((await shipmentService.tileCounts(companyId, NOW)).attention).toBe(urgent.length);

    const listed: string[] = [];
    for (let offset = 0; ; offset += 50) {
      const page = await shipmentService.list(companyId, { tile: "attention", limit: 50, offset, sortDirection: "asc" }, NOW);
      expect(page.pagination.total).toBe(urgent.length);
      listed.push(...page.data.map((s) => s.id));
      if (page.data.length < 50) break;
    }
    expect(sorted(listed)).toEqual(sorted(urgent));
    // With another filter beside it, the tile still opens only its jobs.
    const road = await shipmentService.list(companyId, { tile: "attention", mode: "road", limit: 200, offset: 0, sortDirection: "asc" }, NOW);
    expect(road.data.every((s) => urgent.includes(s.id))).toBe(true);
  });

  it("asked at once, as a page load asks, the three share one answer", async () => {
    // No instant of their own here (the controllers hand none): the three calls are pending
    // together, so they are one computation, on one clock reading - whenever this runs.
    const companyId = randomUUID();
    await Promise.all(grid().map((over) => newJob(companyId, over)));
    const [cards, counts, page] = await Promise.all([
      shipmentService.needsAttention(companyId),
      shipmentService.tileCounts(companyId),
      shipmentService.list(companyId, { tile: "attention", limit: 200, offset: 0, sortDirection: "asc" }),
    ]);
    const urgent = urgentIds(cards);
    expect(counts.attention).toBe(urgent.length);
    expect(page.pagination.total).toBe(urgent.length);
    expect(sorted(page.data.map((s) => s.id))).toEqual(sorted(urgent));
  });

  it("the read leaves out what the rules can no longer list", async () => {
    const companyId = randomUUID();
    const kept = await Promise.all(
      [
        { vgmClosing: day(-20), vgm: "Pending", estimatedDeparture: day(0) },
        { vgmClosing: day(-20), vgm: "Pending", estimatedDeparture: day(40) },
        { closingDate: day(-7) },
        { ams: "Pending", estimatedDeparture: day(2) },
        // A plain date ahead is read whatever else is true of the job.
        { vgmClosing: day(-3), actualDeparture: day(-2), estimatedArrival: day(1) },
      ].map((over) => newJob(companyId, over)),
    );
    await Promise.all(
      [
        // No ETD and a cut-off older than the week it is kept for.
        { closingDate: day(-8) },
        { vgmClosing: day(-200), vgm: "Pending" },
        // The ETD has passed.
        { vgmClosing: day(-3), vgm: "Pending", estimatedDeparture: day(-1) },
        { ams: "Pending", estimatedDeparture: day(-1) },
        // Left: an ATD, an ATA or an actual delivery.
        { vgmClosing: day(-3), vgm: "Pending", estimatedDeparture: day(40), actualDeparture: day(-1) },
        { closingDate: day(1), actualArrival: day(-1) },
        { siClosing: day(0), actualDeliveryDate: day(-1) },
        // Nothing around today.
        { estimatedDeparture: day(40), estimatedArrival: day(70) },
      ].map((over) => newJob(companyId, over)),
    );
    const read = await shipmentRepository.needsAttentionCandidates(companyId, candidateRange(DAY), 5000);
    expect(sorted(read.map((r) => r.id))).toEqual(sorted(kept.map((r) => r.id)));
  });

  it("the tile opens nothing when nothing is due, and the read keeps to the company", async () => {
    const companyId = randomUUID();
    await newJob(companyId, { estimatedDeparture: day(30) });
    await newJob(randomUUID(), { estimatedDeparture: day(0) });
    expect(await needsAttentionService.urgentIds(companyId, NOW)).toEqual([]);
    expect((await shipmentService.tileCounts(companyId, NOW)).attention).toBe(0);
    expect((await shipmentService.list(companyId, { tile: "attention", limit: 50, offset: 0, sortDirection: "asc" }, NOW)).pagination.total).toBe(0);
    // Asked without ids, the list filter finds nothing - never everything.
    expect((await shipmentRepository.listFiltered(companyId, { tile: "attention", limit: 50, offset: 0, sortDirection: "asc" })).total).toBe(0);
  });

  it("cuts the read at its limit, the newest first", async () => {
    const companyId = randomUUID();
    const rows = [];
    for (let i = 0; i < 4; i++) rows.push(await newJob(companyId, { estimatedDeparture: day(0) }));
    const read = await shipmentRepository.needsAttentionCandidates(companyId, candidateRange(DAY), 3);
    expect(read).toHaveLength(3);
    expect(read.map((r) => r.id)).not.toContain(rows[0]!.id);
  });
});
