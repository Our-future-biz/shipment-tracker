import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("~encore/clients", () => ({
  auth: {
    userLookup: async ({ ids }: { ids: string[] }) => ({ users: ids.map((id) => ({ id, email: "jan@firma.cz", name: "Jan Novák" })) }),
    usersList: async () => ({ users: [] }),
  },
}));

import { db } from "../../db/db";
import { passDecidedSince } from "../../lib/releaseRequest";
import { shipmentReleaseRequestRepository as requests } from "../../repositories/shipmentReleaseRequest.repository";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentReleaseOverrideTable } from "../../schemas/shipmentReleaseOverride.schema";
import { shipmentReleaseRequestTable } from "../../schemas/shipmentReleaseRequest.schema";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentTrackingEventTable } from "../../schemas/shipmentTrackingEvent.schema";
import { GATE_PREPAYMENT_UNCHECKED_LINE, gateReleaseService, uncheckedNoteId } from "../../services/gateRelease.service";

// The SQL of the Warehouse Concept gate's WH release on the shipments' side (services/gateRelease.service), and
// of the bell's word that an approval was withdrawn (repository answersFor / markSeen / withdraw), against the
// shipments database. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const MANAGER = randomUUID();
let jobs = 9100;

const newJob = async (companyId: string) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight" }).returning();
  return row!;
};
const line = (userId: string, newValue: string) => ({ userId, field: "releaseRequest", oldValue: null, newValue });
const ask = async (companyId: string, shipmentId: string, what: "house_bol" | "warehouse" = "warehouse", requestedById = USER) =>
  (await requests.create({ companyId, shipmentId, what, reason: "Customer pays on Friday", requestedById, requestedByName: "Jan Novák" }, line(requestedById, "asked")))!;
const approve = (id: string, companyId: string, decidedAt = new Date()) =>
  requests.answer(id, companyId, { status: "approved", decidedById: MANAGER, decidedByName: "Eva Malá", decidedAt, comment: "Agreed with the owner" }, line(MANAGER, "approved"));
const rowOf = async (id: string) => (await db.select().from(shipmentReleaseRequestTable).where(eq(shipmentReleaseRequestTable.id, id)))[0]!;
const WEEK = 7 * 86_400_000;

describe("the shipment's Warehouse Released as the gate reads it (Y6)", () => {
  it("is the day set, with who set it by its history line - nothing while it is empty, nor for another company", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id)).resolves.toBeNull();
    await db.update(shipmentTable).set({ warehouseReleasedDate: "2026-11-18" }).where(eq(shipmentTable.id, job.id));
    // No history line: the day, nobody named.
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id)).resolves.toEqual({ date: "2026-11-18", by: "" });
    await db.insert(shipmentAuditTable).values({ companyId, shipmentId: job.id, userId: MANAGER, field: "warehouseReleasedDate", oldValue: null, newValue: "2026-11-18" });
    // The stand-in for auth names every user jan@firma.cz.
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id)).resolves.toEqual({ date: "2026-11-18", by: "jan@firma.cz" });
    await expect(gateReleaseService.warehouseReleasedOf(randomUUID(), job.id)).resolves.toBeNull();
    await expect(gateReleaseService.warehouseReleasedOf(companyId, "not-a-uuid")).resolves.toBeNull();
  });

  it("is not a day the gate's own release wrote (a voided release leaves its day there)", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    await db.update(shipmentTable).set({ warehouseReleasedDate: "2026-11-18" }).where(eq(shipmentTable.id, job.id));
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id, ["2026-11-18"])).resolves.toBeNull();
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id, ["2026-11-17", "not a day"])).resolves.toMatchObject({ date: "2026-11-18" });
  });

  it("is not a day edited in Shipments from one the gate wrote: the gate's release edited, not one made there (review)", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const history = (oldValue: string | null, newValue: string | null, changedAt: Date) => ({ companyId, shipmentId: job.id, userId: USER, field: "warehouseReleasedDate", oldValue, newValue, changedAt });
    // The gate wrote 18.11. from empty; its release was voided (the day stays), and a user changed it to 20.11.
    await db.insert(shipmentAuditTable).values([history(null, "2026-11-18", new Date("2026-11-18T08:00:00Z")), history("2026-11-18", "2026-11-20", new Date("2026-11-19T08:00:00Z"))]);
    await db.update(shipmentTable).set({ warehouseReleasedDate: "2026-11-20" }).where(eq(shipmentTable.id, job.id));
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id, ["2026-11-18"])).resolves.toBeNull();
    // Cleared and set again from empty - a release the stop held in Shipments: answered.
    await db.insert(shipmentAuditTable).values([history("2026-11-20", null, new Date("2026-11-19T09:00:00Z")), history(null, "2026-11-21", new Date("2026-11-19T10:00:00Z"))]);
    await db.update(shipmentTable).set({ warehouseReleasedDate: "2026-11-21" }).where(eq(shipmentTable.id, job.id));
    await expect(gateReleaseService.warehouseReleasedOf(companyId, job.id, ["2026-11-18"])).resolves.toEqual({ date: "2026-11-21", by: "jan@firma.cz" });
  });
});

describe("an approved request used for the gate's WH release", () => {
  it("is the job's Warehouse Released pass, used once, by the stamping person", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const bol = await ask(companyId, job.id, "house_bol");
    await approve(bol.id, companyId);
    // Only the House BoL's approval: nothing for the gate.
    await expect(gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released")).resolves.toBeNull();
    const warehouse = await ask(companyId, job.id);
    await approve(warehouse.id, companyId);
    // Not another company's.
    await expect(gateReleaseService.usePass(randomUUID(), USER, job.id, "warehouse_released")).resolves.toBeNull();

    const used = await gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released");
    expect(used).toMatchObject({ requestId: warehouse.id, reason: "Asked by Jan Novák: Customer pays on Friday — approved by Eva Malá: Agreed with the owner" });
    expect(await rowOf(warehouse.id)).toMatchObject({ status: "approved", usedById: USER, usedByName: "jan@firma.cz" });
    expect((await rowOf(warehouse.id)).usedAt!.getTime()).toBe(used!.usedAt.getTime());
    // Once.
    await expect(gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released")).resolves.toBeNull();
    // The House BoL's approval is untouched.
    expect((await rowOf(bol.id)).usedAt).toBeNull();
  });

  it("is used by one of two gate releases at the same moment", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    const both = await Promise.all([gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released"), gateReleaseService.usePass(companyId, MANAGER, job.id, "warehouse_released")]);
    expect(both.filter(Boolean)).toHaveLength(1);
  });

  it("is not used once it ran out, nor once withdrawn", async () => {
    const companyId = randomUUID();
    const [old, gone] = [await newJob(companyId), await newJob(companyId)];
    const stale = await ask(companyId, old.id);
    await approve(stale.id, companyId, new Date(Date.now() - WEEK - 60_000));
    await expect(gateReleaseService.usePass(companyId, USER, old.id, "warehouse_released")).resolves.toBeNull();
    const withdrawn = await ask(companyId, gone.id);
    await approve(withdrawn.id, companyId);
    await requests.withdraw(withdrawn.id, companyId, "approval", { id: MANAGER, name: "Eva Malá", reason: "Customer cancelled", at: new Date() }, line(MANAGER, "withdrawn"));
    await expect(gateReleaseService.usePass(companyId, USER, gone.id, "warehouse_released")).resolves.toBeNull();
  });

  it("is given back by that very use only - not by another person, not for another moment - and is a pass again", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    const used = (await gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released"))!;
    // Not given back, and the approval still carries the use: a failure to show.
    await expect(gateReleaseService.giveBack(companyId, MANAGER, request.id, used.usedAt)).resolves.toEqual({ givenBack: false, stillUsed: true });
    await expect(gateReleaseService.giveBack(companyId, USER, request.id, new Date(used.usedAt.getTime() + 1))).resolves.toEqual({ givenBack: false, stillUsed: false });
    await expect(gateReleaseService.giveBack(randomUUID(), USER, request.id, used.usedAt)).resolves.toEqual({ givenBack: false, stillUsed: false });
    await expect(gateReleaseService.giveBack(companyId, USER, request.id, used.usedAt)).resolves.toEqual({ givenBack: true, stillUsed: false });
    expect(await rowOf(request.id)).toMatchObject({ status: "approved", usedAt: null, usedById: null, usedByName: "" });
    await expect(requests.usablePass(companyId, job.id, "warehouse", passDecidedSince(new Date()))).resolves.toMatchObject({ id: request.id });
    // Once: nothing is left to give back - and nothing of that use is left either (a delivery sent twice).
    await expect(gateReleaseService.giveBack(companyId, USER, request.id, used.usedAt)).resolves.toEqual({ givenBack: false, stillUsed: false });
  });

  it("is given back by the gate's outbox by the moment alone: sent as the service identity once the user who stamped has left", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    const used = (await gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released"))!;
    const SERVICE = randomUUID();
    // Another moment is not this use, by anyone.
    await expect(gateReleaseService.giveBack(companyId, SERVICE, request.id, new Date(used.usedAt.getTime() + 1), true)).resolves.toEqual({ givenBack: false, stillUsed: false });
    await expect(gateReleaseService.giveBack(companyId, SERVICE, request.id, used.usedAt, true)).resolves.toEqual({ givenBack: true, stillUsed: false });
    expect(await rowOf(request.id)).toMatchObject({ status: "approved", usedAt: null, usedById: null });
  });

  it("is closed, not given back, when somebody else's WH release of the record was first: no longer usable, with its line in the history (review)", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    const used = (await gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released"))!;
    // The other release is written to the shipment first: it leaves the approval in use as it is.
    await db.transaction((tx) => requests.closeUnused(tx, companyId, job.id, "warehouse", new Date()));
    await expect(gateReleaseService.giveBack(companyId, USER, request.id, used.usedAt, true, true)).resolves.toEqual({ givenBack: false, stillUsed: false, closed: true });
    expect(await rowOf(request.id)).toMatchObject({ status: "closed", closedWhy: "released", usedAt: null, usedById: null });
    await expect(requests.usablePass(companyId, job.id, "warehouse", passDecidedSince(new Date()))).resolves.toBeNull();
    const lines = await db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, job.id), eq(shipmentAuditTable.field, "releaseRequest")));
    expect(lines.map((l) => l.newValue)).toContain("Warehouse Released approval closed unused: released without it");
    // Delivered again: nothing of that use is left.
    await expect(gateReleaseService.giveBack(companyId, USER, request.id, used.usedAt, true, true)).resolves.toEqual({ givenBack: false, stillUsed: false });
  });

  it("the release it let through closes nothing it used: Warehouse Released set by the app afterwards leaves the used approval as it is", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    await gateReleaseService.usePass(companyId, USER, job.id, "warehouse_released");
    await db.transaction((tx) => requests.closeUnused(tx, companyId, job.id, "warehouse", new Date()));
    expect(await rowOf(request.id)).toMatchObject({ status: "approved", usedById: USER, closedWhy: null });
  });
});

describe("a release the gate let through, recorded on the shipment", () => {
  it("is the override row, the history line and the Tracking note", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const invoices = [{ number: "Not invoiced yet", leftToPay: 800, currency: "EUR" }];
    await gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", { reason: "Paid in cash", invoices, checked: true });
    const lineText = "Warehouse Released set on prepayment (not invoiced: 800.00 EUR not invoiced yet) - reason: Paid in cash";
    expect(await db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, job.id))).toEqual([
      expect.objectContaining({ companyId, kind: "warehouse_released", reason: "Paid in cash", invoices, checked: true, byUserId: USER, by: "jan@firma.cz" }),
    ]);
    expect(
      (await db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, job.id), eq(shipmentAuditTable.field, "paymentOverride")))).map((h) => [h.userId, h.newValue]),
    ).toEqual([[USER, lineText]]);
    expect((await db.select().from(shipmentTrackingEventTable).where(eq(shipmentTrackingEventTable.shipmentId, job.id))).map((e) => [e.kind, e.source, e.note])).toEqual([
      ["note", "warehouse", lineText],
    ]);
  });

  it("is recorded once per idempotency key - the outbox delivers at least once - while a person's releases (no key) never clash", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const override = { reason: "Paid in cash", invoices: [], checked: true };
    const key = randomUUID();
    await gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override, key);
    await gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override, key);
    // Both at once, as two deliveries of one row may come.
    const other = randomUUID();
    await Promise.all([
      gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override, other),
      gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override, other),
    ]);
    await gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override);
    await gateReleaseService.recordOverride(companyId, USER, job.id, "warehouse_released", override);
    const rows = await db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, job.id));
    expect(rows.map((r) => r.idempotencyKey).sort()).toEqual([key, other, null, null].sort());
    expect(await db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, job.id), eq(shipmentAuditTable.field, "paymentOverride")))).toHaveLength(4);
    expect(await db.select().from(shipmentTrackingEventTable).where(eq(shipmentTrackingEventTable.shipmentId, job.id))).toHaveLength(4);
    // Another company may carry the same key (keys are unique per company).
    const elsewhere = randomUUID();
    const theirs = await newJob(elsewhere);
    await gateReleaseService.recordOverride(elsewhere, USER, theirs.id, "warehouse_released", override, key);
    expect(await db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, theirs.id))).toHaveLength(1);
  });

  it("says \"Prepayment not checked\" once per outbox row, in the history and on the Tracking tab (P17)", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const key = randomUUID();
    await gateReleaseService.recordUnchecked(companyId, USER, job.id, key);
    await gateReleaseService.recordUnchecked(companyId, USER, job.id, key);
    expect(
      (await db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, job.id), eq(shipmentAuditTable.field, "prepaymentUnchecked")))).map((h) => [h.userId, h.newValue]),
    ).toEqual([[USER, GATE_PREPAYMENT_UNCHECKED_LINE]]);
    expect((await db.select().from(shipmentTrackingEventTable).where(eq(shipmentTrackingEventTable.shipmentId, job.id))).map((e) => [e.kind, e.source, e.externalId, e.note])).toEqual([
      ["note", "warehouse", uncheckedNoteId(key), GATE_PREPAYMENT_UNCHECKED_LINE],
    ]);
    // No override row: the job was not on prepayment.
    expect(await db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, job.id))).toEqual([]);
    await expect(gateReleaseService.recordUnchecked(randomUUID(), USER, job.id, randomUUID())).rejects.toThrow("Shipment not found");
  });

  it("is refused for another company's shipment, and nothing is written", async () => {
    const job = await newJob(randomUUID());
    await expect(gateReleaseService.recordOverride(randomUUID(), USER, job.id, "warehouse_released", { reason: "x y z", invoices: [], checked: true })).rejects.toThrow("Shipment not found");
    expect(await db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, job.id))).toEqual([]);
  });
});

describe("the bell's word that an approval was withdrawn", () => {
  const withdraw = (id: string, companyId: string, byId = MANAGER) =>
    requests.withdraw(id, companyId, "approval", { id: byId, name: "Eva Malá", reason: "Customer cancelled", at: new Date() }, line(byId, "withdrawn"));
  const weekAgo = () => new Date(Date.now() - WEEK);

  it("reaches whoever asked, unread again though the approval was opened, and is marked seen once opened", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const request = await ask(companyId, job.id);
    await approve(request.id, companyId);
    await requests.markSeen(request.id, companyId, USER, new Date());
    expect((await rowOf(request.id)).answerSeenAt).not.toBeNull();
    await withdraw(request.id, companyId);
    expect((await rowOf(request.id)).answerSeenAt).toBeNull();
    expect((await requests.answersFor(companyId, USER, weekAgo(), 200)).map((r) => [r.id, r.status, r.closedWhy])).toEqual([[request.id, "closed", "withdrawn"]]);
    await requests.markSeen(request.id, companyId, USER, new Date());
    expect((await rowOf(request.id)).answerSeenAt).not.toBeNull();
    // Opened, it stays listed as read for the days the bell keeps what was read.
    expect(await requests.answersFor(companyId, USER, weekAgo(), 200)).toHaveLength(1);
  });

  it("is not a request the asker withdrew while it waited, nor one a release closed, nor an approval the asker withdrew themselves", async () => {
    const companyId = randomUUID();
    const [waiting, released, own] = [await newJob(companyId), await newJob(companyId), await newJob(companyId)];
    const w = await ask(companyId, waiting.id);
    await requests.withdraw(w.id, companyId, "request", { id: USER, name: "Jan Novák", reason: "Paid meanwhile", at: new Date() }, line(USER, "withdrawn"));
    const r = await ask(companyId, released.id);
    await approve(r.id, companyId);
    await db.transaction((tx) => requests.closeUnused(tx, companyId, released.id, "warehouse", new Date()));
    // A manager who asked for their own job, approved by another manager, and withdrawn by themselves.
    const o = await ask(companyId, own.id, "warehouse", MANAGER);
    await requests.answer(o.id, companyId, { status: "approved", decidedById: USER, decidedByName: "Jan Novák", decidedAt: new Date(), comment: "ok then" }, line(USER, "approved"));
    await withdraw(o.id, companyId, MANAGER);
    expect(await requests.answersFor(companyId, USER, weekAgo(), 200)).toEqual([]);
    expect(await requests.answersFor(companyId, MANAGER, weekAgo(), 200)).toEqual([]);
    // Nor marked seen: it is not one of the bell's.
    await requests.markSeen(w.id, companyId, USER, new Date());
    expect((await rowOf(w.id)).answerSeenAt).toBeNull();
  });

  it("lists the newest word first: a withdrawal by when it was withdrawn", async () => {
    const companyId = randomUUID();
    const [a, b] = [await newJob(companyId), await newJob(companyId)];
    const first = await ask(companyId, a.id);
    await approve(first.id, companyId, new Date(Date.now() - 3_600_000));
    const second = await ask(companyId, b.id);
    await approve(second.id, companyId, new Date(Date.now() - 60_000));
    await withdraw(first.id, companyId);
    expect((await requests.answersFor(companyId, USER, weekAgo(), 200)).map((r) => r.id)).toEqual([first.id, second.id]);
  });
});
