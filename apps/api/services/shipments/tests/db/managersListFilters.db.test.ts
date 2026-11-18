import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: {}, quotes: {}, warehouse: {}, warehouseConcept: {}, trucking: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["u1", "jan@firma.cz"]]) }));

import { addDays, businessDay, businessTime } from "../../../../lib/businessDate";
import { db } from "../../db/db";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { COCKPIT_JOB_LIMIT } from "../../lib/cockpitThresholds";
import { freightKindOf } from "../../lib/trackingEvents";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { managersCockpitService } from "../../services/managersCockpit.service";

// What Shipments → Managers' tiles open the Shipments list with, against the shipments database:
// each list filter finds the rows the cockpit counted in TypeScript (lib/managersCockpit), so a
// tile's number is the number of rows it opens. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

let jobs = 500;
const TODAY = businessDay(new Date());
const day = (offset: number) => addDays(TODAY, offset);

type JobData = Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">>;
const newJob = async (companyId: string, over: JobData = {}) => {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", personInCharge: "jan@firma.cz", bookingConfirmation: "Received", ...over })
    .returning();
  return row!;
};
const listed = async (companyId: string, filters: { tile?: string; handledBy?: string; mode?: string; customs?: string; invoicing?: string }) => {
  const { data, total } = await shipmentRepository.listFiltered(companyId, { ...filters, limit: 200, offset: 0, sortDirection: "asc" });
  expect(total).toBe(data.length);
  return data.map((s) => s.id).sort();
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
const cockpit = (companyId: string) => managersCockpitService.cockpit(companyId, { mode: "all", direction: "all", handledBy: null, reports: "all", userId: randomUUID() });

describe("the list's mode filter", () => {
  it("finds the jobs freightKindOf reads as that mode, each job in exactly one", async () => {
    const companyId = randomUUID();
    const rows = await Promise.all(
      [
        { freightMode: "Sea Freight" },
        { freightMode: "" },
        { freightMode: "Project Cargo" },
        { freightMode: "Air Freight" },
        { freightMode: "  air" },
        { freightMode: "AIR FREIGHT" },
        { freightMode: "Rail Freight" },
        { freightMode: " rail" },
        { freightMode: "Road Freight" },
        { freightMode: "Air / Road" },
        { freightMode: "Sea Freight", tradeDirection: "Domestic" },
        { freightMode: "Sea Freight", tradeDirection: " DOMESTIC " },
        { freightMode: "Air Freight", department: "Road Department" },
        { freightMode: "Rail Freight", department: " road department " },
        { freightMode: "Sea Freight", department: "Road Department Export" },
      ].map((over) => newJob(companyId, over)),
    );
    const modes = ["sea", "air", "rail", "road"] as const;
    for (const mode of modes) expect(await listed(companyId, { mode })).toEqual(ids(rows.filter((s) => freightKindOf(s) === mode)));
    expect((await Promise.all(modes.map((mode) => listed(companyId, { mode })))).flat()).toHaveLength(rows.length);
    expect(await listed(companyId, { mode: "all" })).toEqual(ids(rows));
  });
});

describe("the list's Handled By filter", () => {
  it("finds a person's jobs by e-mail in any case, and with \"nobody\" the jobs nobody handles", async () => {
    const companyId = randomUUID();
    const jan = await newJob(companyId, { personInCharge: "jan@firma.cz" });
    const janOld = await newJob(companyId, { personInCharge: " Jan@Firma.cz — Jan Novák" });
    const eva = await newJob(companyId, { personInCharge: "eva@firma.cz", holidayCover: "jan@firma.cz" });
    const nobody = await newJob(companyId, { personInCharge: "" });
    const blank = await newJob(companyId, { personInCharge: "  " });
    // Whitespace typed or pasted with a legacy value: trimmed as the cockpit's personEmail trims it.
    const tab = await newJob(companyId, { personInCharge: "\t" });
    const janPasted = await newJob(companyId, { personInCharge: "\u00a0jan@firma.cz\r\n" });
    expect(await listed(companyId, { handledBy: "JAN@firma.cz" })).toEqual(ids([jan, janOld, janPasted]));
    expect(await listed(companyId, { handledBy: "eva@firma.cz" })).toEqual(ids([eva]));
    expect(await listed(companyId, { handledBy: "nobody" })).toEqual(ids([nobody, blank, tab]));
    expect(await listed(companyId, {})).toHaveLength(7);

    const c = await cockpit(companyId);
    expect(c.tiles.noHandledBy).toBe(3);
    expect(c.people.map((p) => [p.handledBy, p.active])).toEqual([["jan@firma.cz", 3], ["", 3], ["eva@firma.cz", 1]]);
    // Each person's count is the number of rows their filter opens.
    for (const p of c.people) expect(await listed(companyId, { tile: "active", handledBy: p.handledBy || "nobody" })).toHaveLength(p.active);
    // The filter and the tile go together with the mode.
    expect(await listed(companyId, { handledBy: "nobody", mode: "air" })).toEqual([]);
  });
});

describe("the tiles the cockpit opens the list with", () => {
  it("claims: the active jobs the cockpit counts as an open claim, and no other", async () => {
    const companyId = randomUUID();
    const claim = await newJob(companyId, { claim: "Yes" });
    const claimToo = await newJob(companyId, { claim: "Yes", bookingConfirmation: "Pending", closingDate: day(0) });
    await newJob(companyId, { claim: "No" });
    await newJob(companyId, {});
    // Not active: an open claim on an invoiced, a cancelled or a deleted job is counted nowhere.
    await newJob(companyId, { claim: "Yes", invoicingStatus: "Invoiced" });
    await newJob(companyId, { claim: "Yes", status: CANCELLED_STATUS });
    await newJob(companyId, { claim: "Yes", deletedAt: new Date() });
    expect(await listed(companyId, { tile: "claims" })).toEqual(ids([claim, claimToo]));
    const c = await cockpit(companyId);
    expect(c.tiles).toMatchObject({ active: 4, openClaims: 2 });
    // With the mode and the person beside it, as the tile's link sends them.
    expect(await listed(companyId, { tile: "claims", mode: "sea", handledBy: "jan@firma.cz" })).toEqual(ids([claim, claimToo]));
    expect(await listed(companyId, { tile: "claims", mode: "air" })).toEqual([]);
  });

  it("has no list filter for cut-offs or a pending booking: the cockpit judges those by its own rules and narrows its cards", async () => {
    // The cut-off tile counts working days, missed Closings and the filings' times; the booking
    // tile only a booking at risk (cargo ready or the ETD close). No statement repeats either,
    // so the old tile=cutoffs and tile=booking-pending are no filter - like any word that is no tile.
    const companyId = randomUUID();
    const rows = await Promise.all([{ closingDate: day(0) }, { bookingConfirmation: "Pending" }, {}].map((over) => newJob(companyId, over)));
    for (const tile of ["cutoffs", "booking-pending", "no-such-tile"]) expect(await listed(companyId, { tile })).toEqual(ids(rows));
  });

  it("customs urgent: with the active tile, the jobs the cockpit counts", async () => {
    const companyId = randomUUID();
    const now = new Date();
    const wall = (hoursAhead: number) => {
      const at = new Date(now.getTime() + hoursAhead * 3_600_000);
      return `${businessDay(at)} ${businessTime(at)}`;
    };
    const soon = await newJob(companyId, { customsPriority: "Urgent", customsDeadline: wall(20) });
    const passed = await newJob(companyId, { customsPriority: "Urgent", customsDeadline: wall(-30), customsStatus: "Documents Pending" });
    await newJob(companyId, { customsPriority: "Urgent", customsDeadline: wall(30) });
    await newJob(companyId, { customsPriority: "Urgent", customsDeadline: wall(-30), customsStatus: "Customs Cleared/Released" });
    await newJob(companyId, { customsPriority: "Urgent", customsDeadline: "soon" });
    await newJob(companyId, { customsPriority: "Standard", customsDeadline: wall(1) });
    // The Customs page keeps an invoiced job on its urgent list; the cockpit reads active jobs only.
    const invoiced = await newJob(companyId, { customsPriority: "Urgent", customsDeadline: wall(1), invoicingStatus: "Invoiced" });
    expect(await listed(companyId, { customs: "urgent" })).toEqual(ids([soon, passed, invoiced]));
    expect(await listed(companyId, { customs: "urgent", tile: "active" })).toEqual(ids([soon, passed]));
    expect((await cockpit(companyId)).tiles.customsUrgent).toBe(2);
  });

  it("not released: with the active tile, the Invoicing page's unbilled arrivals are the jobs the cockpit counts", async () => {
    const companyId = randomUUID();
    const counted = await Promise.all(
      [
        // From the ATA on - before Needs Attention's "Not released for billing" names it.
        { actualArrival: day(0) },
        { actualArrival: day(-20), status: "Arrived [IMP]" },
        { tradeDirection: "Export", actualDeparture: day(-1) },
        { tradeDirection: "EXPORT", actualDeparture: day(-1), actualArrival: day(0) },
        // Dated by its delivery: a Domestic job, one of the Road Department.
        { tradeDirection: "Domestic", freightMode: "Road Freight", actualDeliveryDate: day(-1) },
        { department: "Road Department", actualDeliveryDate: day(-1) },
        { actualArrival: day(-1), actualDeliveryDate: day(0), status: "Not billed yet" },
      ].map((over) => newJob(companyId, over)),
    );
    await Promise.all(
      [
        {},
        // Delivered with no ATA: the card says "Delivered, not billed", the list and the tile do not take it.
        { actualDeliveryDate: day(-1) },
        { tradeDirection: "Export", actualArrival: day(-1) },
        { tradeDirection: "Domestic", actualArrival: day(-1), actualDeparture: day(-2) },
        { department: "Road Department", tradeDirection: "Export", actualDeparture: day(-1) },
        // Released.
        { actualArrival: day(-1), status: "Billing [IMP]" },
        { actualArrival: day(-1), status: "billed" },
        // Not active.
        { actualArrival: day(-1), invoicingStatus: "Invoiced" },
        { actualArrival: day(-1), status: CANCELLED_STATUS },
        { actualArrival: day(-1), deletedAt: new Date() },
      ].map((over) => newJob(companyId, over)),
    );
    expect(await listed(companyId, { invoicing: "unbilled-arrivals" })).toEqual(ids(counted));
    expect(await listed(companyId, { tile: "active", invoicing: "unbilled-arrivals" })).toEqual(ids(counted));
    expect((await cockpit(companyId)).tiles.notReleased).toBe(counted.length);
  });

  it("etamoved: the jobs whose ETD or ETA moved lately, as the cockpit's read finds them", async () => {
    const companyId = randomUUID();
    const moved = await newJob(companyId);
    const set = await newJob(companyId);
    const longAgo = await newJob(companyId);
    const other = await newJob(companyId);
    const change = (shipmentId: string, field: string, oldValue: string, newValue: string, changedAt = new Date()) =>
      db.insert(shipmentAuditTable).values({ companyId, shipmentId, userId: randomUUID(), field, oldValue, newValue, changedAt });
    await change(moved.id, "estimatedArrival", day(3), day(6));
    // A date set for the first time has not moved.
    await change(set.id, "estimatedDeparture", "", day(6));
    await change(longAgo.id, "estimatedArrival", day(-40), day(-30), new Date(Date.now() - 30 * 86_400_000));
    await change(other.id, "closingDate", day(1), day(2));
    expect(await shipmentRepository.dateMovedLately(companyId, [moved.id, set.id, longAgo.id, other.id])).toEqual([moved.id]);
    // Only among the shipments asked about, and only the company's own.
    expect(await shipmentRepository.dateMovedLately(companyId, [set.id])).toEqual([]);
    expect(await shipmentRepository.dateMovedLately(randomUUID(), [moved.id])).toEqual([]);
    expect(await listed(companyId, { tile: "etamoved" })).toEqual([moved.id]);
    expect((await cockpit(companyId)).tiles.etdEtaMoved).toBe(1);
  });
});

describe("the cockpit's read of the jobs", () => {
  it("is every active job of the company, the newest first, and no more than asked for", async () => {
    const companyId = randomUUID();
    const first = await newJob(companyId, { createdAt: new Date("2026-11-01T08:00:00Z") });
    const second = await newJob(companyId, { createdAt: new Date("2026-11-02T08:00:00Z"), status: "Billing [IMP]" });
    const third = await newJob(companyId, { createdAt: new Date("2026-11-03T08:00:00Z"), invoicingStatus: "Not Invoiced" });
    await newJob(companyId, { invoicingStatus: "Invoiced" });
    await newJob(companyId, { status: CANCELLED_STATUS });
    await newJob(companyId, { deletedAt: new Date() });
    await newJob(randomUUID());
    expect((await shipmentRepository.managersCockpitRows(companyId, COCKPIT_JOB_LIMIT + 1)).map((r) => r.id)).toEqual([third.id, second.id, first.id]);
    expect((await shipmentRepository.managersCockpitRows(companyId, 2)).map((r) => r.id)).toEqual([third.id, second.id]);
    expect(await listed(companyId, { tile: "active" })).toEqual(ids([first, second, third]));
  });
});
