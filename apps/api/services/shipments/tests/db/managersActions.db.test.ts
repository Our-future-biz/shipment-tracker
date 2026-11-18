import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

// Invoicing's word on whether the job is paid (its _internalReleaseCheck): each test of a release says it.
const releaseCheck = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({
  auth: { userLookup: async ({ ids }: { ids: string[] }) => ({ users: ids.map((id) => ({ id, email: "jan@firma.cz", name: "Jan Novák" })) }) },
  customers: {},
  invoicing: { openInvoiceCount: async () => ({ count: 0 }), _internalPaidSupplierInvoices: async () => ({ invoiceNumbers: [] }), _internalReleaseCheck: releaseCheck },
  quotes: {},
  warehouse: { _internalPickupPlates: async () => ({ plates: [] }) },
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { passDecidedSince } from "../../lib/releaseRequest";
import { shipmentCutoffDismissalRepository as dismissals } from "../../repositories/shipmentCutoffDismissal.repository";
import { shipmentNudgeRepository as nudges } from "../../repositories/shipmentNudge.repository";
import { shipmentReleaseRequestRepository as requests } from "../../repositories/shipmentReleaseRequest.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentCommentTable } from "../../schemas/shipmentComment.schema";
import { shipmentCutoffDismissalTable } from "../../schemas/shipmentCutoffDismissal.schema";
import { shipmentNoteTable } from "../../schemas/shipmentNote.schema";
import { shipmentReleaseOverrideTable } from "../../schemas/shipmentReleaseOverride.schema";
import { shipmentReleaseRequestTable } from "../../schemas/shipmentReleaseRequest.schema";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { cutoffDismissalsOf } from "../../services/cutoffDismissal.service";
import { shipmentService } from "../../services/shipment.service";

// The SQL Shipments → Managers' writes rely on (migration 0087), against the shipments database: one
// waiting release request per shipment and thing asked, an answer given once, an approved request used
// once (of two releases at one moment, by one) and only while it is good, a waiting one closed by a
// release made another way; a dismissal live once per cut-off and date; each with its line in the job's
// history in the same transaction; the nudge's three rows together; the count of a person's active jobs. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const MANAGER = randomUUID();
let jobs = 8700;

const newJob = async (companyId: string, over: Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Export", freightMode: "Sea Freight", ...over }).returning();
  return row!;
};
const historyOf = (shipmentId: string, field: string) =>
  db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, shipmentId), eq(shipmentAuditTable.field, field))).orderBy(asc(shipmentAuditTable.changedAt));
const asked = (userId: string, what: string) => ({ userId, field: "releaseRequest", oldValue: null, newValue: `${what} asked` });
const decision = (status: "approved" | "rejected", comment = "") => ({ status, decidedById: MANAGER, decidedByName: "Eva Malá", decidedAt: new Date(), comment });

describe("a request to release a job the prepayment stop holds", () => {
  const ask = (companyId: string, shipmentId: string, what: "house_bol" | "warehouse" = "house_bol", userId = USER) =>
    requests.create({ companyId, shipmentId, what, reason: "Customer pays on Friday", requestedById: userId, requestedByName: "Jan Novák" }, asked(userId, what));
  const answered = (newValue: string) => ({ userId: MANAGER, field: "releaseRequest", oldValue: null, newValue });
  const approve = (id: string, companyId: string, decidedAt = new Date()) => requests.answer(id, companyId, { ...decision("approved", "Agreed with the owner"), decidedAt }, answered("approved"));
  const reject = (id: string, companyId: string, decidedAt = new Date()) => requests.answer(id, companyId, { ...decision("rejected", "Not before the payment"), decidedAt }, answered("rejected"));
  /** The oldest decision a pass may have now and still be good (lib/releaseRequest passDecidedSince). */
  const good = () => passDecidedSince(new Date());
  const usedBy = () => ({ usedAt: new Date(), usedById: USER, usedByName: "jan@firma.cz" });
  const use = (id: string, companyId: string) => db.transaction((tx) => requests.use(tx, id, companyId, usedBy(), good()));

  it("waits once per shipment and thing asked, with one line in the job's history; the other thing is asked on its own", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = await ask(companyId, job.id);
    expect(first).toMatchObject({ status: "pending", what: "house_bol", answerSeenAt: null, decidedAt: null, usedAt: null, usedById: null, usedByName: "" });
    await expect(ask(companyId, job.id)).resolves.toBeNull();
    await expect(ask(companyId, job.id, "warehouse")).resolves.toMatchObject({ what: "warehouse" });
    // The refused second request left no line.
    expect((await historyOf(job.id, "releaseRequest")).map((h) => h.newValue)).toEqual(["house_bol asked", "warehouse asked"]);
  });

  it("is answered once, the answer's history line with it; a new request may then wait", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    await expect(reject(first.id, companyId)).resolves.toMatchObject({ status: "rejected", decidedByName: "Eva Malá", comment: "Not before the payment" });
    await expect(approve(first.id, companyId)).resolves.toBeNull();
    expect((await historyOf(job.id, "releaseRequest")).map((h) => h.newValue)).toEqual(["house_bol asked", "rejected"]);
    await expect(ask(companyId, job.id)).resolves.toMatchObject({ status: "pending" });
  });

  it("is never another company's to read, answer or use", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    const other = randomUUID();
    await expect(requests.get(first.id, other)).resolves.toBeNull();
    await expect(approve(first.id, other)).resolves.toBeNull();
    await expect(requests.get(first.id, companyId)).resolves.toMatchObject({ status: "pending", jobNumber: job.jobNumber });
    await approve(first.id, companyId);
    await expect(requests.usablePass(other, job.id, "house_bol", good())).resolves.toBeNull();
    await expect(use(first.id, other)).resolves.toBe(false);
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toMatchObject({ id: first.id });
  });

  it("approved, is a pass for that job and that release, used once", async () => {
    const companyId = randomUUID();
    const [job, other] = [await newJob(companyId), await newJob(companyId)];
    const first = (await ask(companyId, job.id))!;
    // Waiting, it lets nothing through.
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toBeNull();
    await expect(use(first.id, companyId)).resolves.toBe(false);
    await approve(first.id, companyId);
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toMatchObject({ id: first.id, comment: "Agreed with the owner", decidedByName: "Eva Malá", requestedByName: "Jan Novák" });
    // Not the other release of the job, not another job.
    await expect(requests.usablePass(companyId, job.id, "warehouse", good())).resolves.toBeNull();
    await expect(requests.usablePass(companyId, other.id, "house_bol", good())).resolves.toBeNull();

    await expect(use(first.id, companyId)).resolves.toBe(true);
    await expect(use(first.id, companyId)).resolves.toBe(false);
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toBeNull();
    const row = (await requests.get(first.id, companyId))!;
    expect(row).toMatchObject({ status: "approved", usedById: USER, usedByName: "jan@firma.cz" });
    expect(row.usedAt).toBeInstanceOf(Date);
    // Used up, a new request may be asked.
    await expect(ask(companyId, job.id)).resolves.toMatchObject({ status: "pending" });
  });

  it("is used by one of two releases at the same moment", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    await approve(first.id, companyId);
    const outcomes = await Promise.all([use(first.id, companyId), use(first.id, companyId), use(first.id, companyId)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("is not used when the release's turn fails: the pass is there for the next try", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    await approve(first.id, companyId);
    await expect(
      db.transaction(async (tx) => {
        expect(await requests.use(tx, first.id, companyId, usedBy(), good())).toBe(true);
        throw new Error("the release could not be written");
      }),
    ).rejects.toThrow("the release could not be written");
    await expect(requests.get(first.id, companyId)).resolves.toMatchObject({ usedAt: null, usedById: null });
    await expect(use(first.id, companyId)).resolves.toBe(true);
  });

  it("runs out 7 days after the decision: neither found nor usable any more", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    await approve(first.id, companyId, new Date(Date.now() - 7 * 86_400_000 - 60_000));
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toBeNull();
    await expect(use(first.id, companyId)).resolves.toBe(false);
    // One approved 6 days ago is still good; of two, the newest is the pass.
    const second = (await ask(companyId, job.id))!;
    await approve(second.id, companyId, new Date(Date.now() - 6 * 86_400_000));
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toMatchObject({ id: second.id });
    await expect(use(second.id, companyId)).resolves.toBe(true);
  });

  it("a rejected request lets nothing through", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    await reject(first.id, companyId);
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toBeNull();
    await expect(use(first.id, companyId)).resolves.toBe(false);
  });

  it("still waiting when the job is released another way, is closed: nobody decided it, it is no answer, and it can't be answered or used", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const bol = (await ask(companyId, job.id))!;
    const warehouse = (await ask(companyId, job.id, "warehouse"))!;
    const close = (what: "house_bol" | "warehouse") => db.transaction((tx) => requests.closeUnused(tx, companyId, job.id, what, new Date()));
    await expect(close("house_bol")).resolves.toEqual({ waiting: 1, approved: 0 });
    // Once: nothing waits any more. And only the release that was made: the warehouse's request waits on.
    await expect(close("house_bol")).resolves.toEqual({ waiting: 0, approved: 0 });
    await expect(requests.get(bol.id, companyId)).resolves.toMatchObject({ status: "closed", comment: "Released without it", decidedById: null, decidedByName: "", decidedAt: null });
    await expect(requests.get(warehouse.id, companyId)).resolves.toMatchObject({ status: "pending" });
    expect((await requests.waitingByShipmentIds([job.id], companyId)).map((r) => r.what)).toEqual(["warehouse"]);

    await expect(approve(bol.id, companyId)).resolves.toBeNull();
    await expect(use(bol.id, companyId)).resolves.toBe(false);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const seenSince = new Date(Date.now() - 7 * 86_400_000);
    // Not under the asker's bell, not for the audit line; in the lists as closed.
    expect(await requests.answersFor(companyId, USER, seenSince, 200)).toEqual([]);
    await requests.markSeen(bol.id, companyId, USER, new Date());
    await expect(requests.get(bol.id, companyId)).resolves.toMatchObject({ answerSeenAt: null });
    expect(await requests.decidedSince(companyId, since)).toEqual([]);
    expect((await requests.listForManagers(companyId, since, 200)).map((r) => `${r.what} ${r.status}`).sort()).toEqual(["house_bol closed", "warehouse pending"]);
    expect((await requests.listForUser(companyId, USER, since, 200)).map((r) => r.status).sort()).toEqual(["closed", "pending"]);
    // One closed long ago is off the lists.
    expect((await requests.listForManagers(companyId, new Date(Date.now() + 60_000), 200)).map((r) => r.status)).toEqual(["pending"]);
    // Another company's release closes nothing here.
    await expect(db.transaction((tx) => requests.closeUnused(tx, randomUUID(), job.id, "warehouse", new Date()))).resolves.toEqual({ waiting: 0, approved: 0 });
  });

  it("approved and not used when the job is released another way, is closed too: it lets no later release through, and keeps who approved it", async () => {
    const companyId = randomUUID();
    const [job, usedJob] = [await newJob(companyId), await newJob(companyId)];
    const unused = (await ask(companyId, job.id, "warehouse"))!;
    await approve(unused.id, companyId);
    const bol = (await ask(companyId, job.id))!;
    await approve(bol.id, companyId);
    const close = (shipmentId: string, what: "house_bol" | "warehouse") => db.transaction((tx) => requests.closeUnused(tx, companyId, shipmentId, what, new Date()));

    await expect(close(job.id, "warehouse")).resolves.toEqual({ waiting: 0, approved: 1 });
    const row = (await requests.get(unused.id, companyId))!;
    expect(row).toMatchObject({ status: "closed", comment: "Released without it", decidedById: MANAGER, decidedByName: "Eva Malá", usedAt: null });
    expect(row.decidedAt).toBeInstanceOf(Date);
    // Warehouse Released cleared and set again: the old approval is no pass any more.
    await expect(requests.usablePass(companyId, job.id, "warehouse", good())).resolves.toBeNull();
    await expect(use(unused.id, companyId)).resolves.toBe(false);
    await expect(close(job.id, "warehouse")).resolves.toEqual({ waiting: 0, approved: 0 });
    // Only that release's: the House BoL's approval of the same job is still good.
    await expect(requests.usablePass(companyId, job.id, "house_bol", good())).resolves.toMatchObject({ id: bol.id });
    // No answer under the asker's bell any more; for the audit line it stays the manager's approval it was.
    const seenSince = new Date(Date.now() - 7 * 86_400_000);
    expect((await requests.answersFor(companyId, USER, seenSince, 200)).map((r) => r.id)).toEqual([bol.id]);
    const decided = await requests.decidedSince(companyId, new Date(Date.now() - 86_400_000));
    expect(decided.map((r) => [r.id, r.status]).sort()).toEqual([[bol.id, "approved"], [unused.id, "approved"]].sort());
    // A new request may be asked for it.
    await expect(ask(companyId, job.id, "warehouse")).resolves.toMatchObject({ status: "pending" });

    // An approval the release itself used is used, not closed.
    const used = (await ask(companyId, usedJob.id))!;
    await approve(used.id, companyId);
    await expect(
      db.transaction(async (tx) => {
        expect(await requests.use(tx, used.id, companyId, usedBy(), good())).toBe(true);
        return requests.closeUnused(tx, companyId, usedJob.id, "house_bol", new Date());
      }),
    ).resolves.toEqual({ waiting: 0, approved: 0 });
    await expect(requests.get(used.id, companyId)).resolves.toMatchObject({ status: "approved", usedById: USER });
  });

  it("lists for a manager what waits and what was answered lately, for a user their own, and the newest of each thing for a shipment", async () => {
    const companyId = randomUUID();
    const other = randomUUID();
    const [a, b, c] = [await newJob(companyId), await newJob(companyId), await newJob(companyId)];
    const mine = (await ask(companyId, a.id))!;
    const theirs = (await ask(companyId, b.id, "warehouse", other))!;
    const old = (await ask(companyId, c.id))!;
    await approve(old.id, companyId, new Date(Date.now() - 40 * 86_400_000));
    const since = new Date(Date.now() - 30 * 86_400_000);
    expect((await requests.listForManagers(companyId, since, 200)).map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect((await requests.listForUser(companyId, USER, since, 200)).map((r) => r.id)).toEqual([mine.id]);
    expect((await requests.waitingByShipmentIds([a.id, b.id, c.id], companyId)).map((r) => `${r.shipmentId} ${r.what}`).sort()).toEqual([`${a.id} house_bol`, `${b.id} warehouse`].sort());

    await reject(mine.id, companyId);
    const again = (await ask(companyId, a.id))!;
    await ask(companyId, a.id, "warehouse");
    const latest = await requests.latestForShipment(a.id, companyId);
    expect(latest.map((r) => r.what).sort()).toEqual(["house_bol", "warehouse"]);
    expect(latest.find((r) => r.what === "house_bol")!.id).toBe(again.id);
    // A deleted job's requests are not listed.
    await db.update(shipmentTable).set({ deletedAt: new Date() }).where(eq(shipmentTable.id, b.id));
    expect((await requests.listForManagers(companyId, since, 200)).map((r) => r.shipmentId)).not.toContain(b.id);
  });

  it("shows the answer to the one who asked until they opened it, and for a while after; only they mark it seen, once", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await ask(companyId, job.id))!;
    const seenSince = new Date(Date.now() - 7 * 86_400_000);
    expect(await requests.answersFor(companyId, USER, seenSince, 200)).toEqual([]);
    await approve(first.id, companyId);
    expect((await requests.answersFor(companyId, USER, seenSince, 200)).map((r) => r.id)).toEqual([first.id]);
    expect(await requests.answersFor(companyId, MANAGER, seenSince, 200)).toEqual([]);
    await requests.markSeen(first.id, companyId, MANAGER, new Date());
    await expect(requests.get(first.id, companyId)).resolves.toMatchObject({ answerSeenAt: null });
    const at = new Date(Date.now() - 86_400_000);
    await requests.markSeen(first.id, companyId, USER, at);
    await requests.markSeen(first.id, companyId, USER, new Date());
    expect((await requests.get(first.id, companyId))!.answerSeenAt!.getTime()).toBe(at.getTime());
    expect((await requests.answersFor(companyId, USER, seenSince, 200)).map((r) => r.id)).toEqual([first.id]);
    expect(await requests.answersFor(companyId, USER, new Date(), 200)).toEqual([]);
  });

  it("gives the audit line the requests a manager answered since a day, the newest first, with the manager's reason, at most as many as asked", async () => {
    const companyId = randomUUID();
    const [a, b, c] = [await newJob(companyId), await newJob(companyId), await newJob(companyId)];
    const [ra, rb] = [(await ask(companyId, a.id))!, (await ask(companyId, b.id, "warehouse"))!];
    await ask(companyId, c.id);
    await approve(ra.id, companyId, new Date(Date.now() - 2 * 86_400_000));
    await reject(rb.id, companyId, new Date(Date.now() - 86_400_000));
    const decided = await requests.decidedSince(companyId, new Date(Date.now() - 7 * 86_400_000));
    expect(decided.map((r) => [r.id, r.shipmentId, r.status, r.what, r.decidedByName, r.comment])).toEqual([
      [rb.id, b.id, "rejected", "warehouse", "Eva Malá", "Not before the payment"],
      [ra.id, a.id, "approved", "house_bol", "Eva Malá", "Agreed with the owner"],
    ]);
    expect(decided[0]!.decidedAt).toBeInstanceOf(Date);
    expect(await requests.decidedSince(companyId, new Date(Date.now() - 36 * 3_600_000))).toHaveLength(1);
    expect((await requests.decidedSince(companyId, new Date(0), 1)).map((r) => r.id)).toEqual([rb.id]);
    expect(await requests.decidedSince(randomUUID(), new Date(0))).toEqual([]);
  });

  it("takes the four statuses and the two things and no other, and no request of no shipment", async () => {
    const companyId = randomUUID();
    const row = { companyId, reason: "x", requestedById: USER };
    for (const status of ["pending", "approved", "rejected", "closed"] as const) {
      const job = await newJob(companyId);
      await expect(db.insert(shipmentReleaseRequestTable).values({ ...row, shipmentId: job.id, what: "house_bol", status })).resolves.toBeDefined();
    }
    const job = await newJob(companyId);
    await expect(db.insert(shipmentReleaseRequestTable).values({ ...row, shipmentId: job.id, what: "mbl" as "house_bol" })).rejects.toThrow();
    await expect(db.insert(shipmentReleaseRequestTable).values({ ...row, shipmentId: job.id, what: "house_bol", status: "maybe" as "pending" })).rejects.toThrow();
    await expect(db.insert(shipmentReleaseRequestTable).values({ ...row, what: "house_bol", shipmentId: randomUUID() })).rejects.toThrow();
  });
});

describe("a release let through by an approved request (the shipment service's own release paths)", () => {
  const UNPAID = { warn: true, customer: "Firma s.r.o.", prepayment: true, customerOverdueCount: 0, unpaid: [{ invoiceId: "inv-1", number: "FV2026-0012", leftToPay: 1200, currency: "EUR", daysOverdue: 0 }], prepaymentUnpaid: true };
  const REASON = "Asked by Jan Novák: Customer pays on Friday — approved by Eva Malá: Agreed with the owner";
  const approvedFor = async (companyId: string, shipmentId: string, what: "house_bol" | "warehouse" = "house_bol") => {
    const request = (await requests.create({ companyId, shipmentId, what, reason: "Customer pays on Friday", requestedById: USER, requestedByName: "Jan Novák" }, asked(USER, what)))!;
    await requests.answer(request.id, companyId, decision("approved", "Agreed with the owner"), { userId: MANAGER, field: "releaseRequest", oldValue: null, newValue: "approved" });
    return request.id;
  };
  const overridesOf = (shipmentId: string) => db.select().from(shipmentReleaseOverrideTable).where(eq(shipmentReleaseOverrideTable.shipmentId, shipmentId));
  const jobNow = async (id: string) => (await db.select().from(shipmentTable).where(eq(shipmentTable.id, id)))[0]!;
  const requestNow = async (id: string) => (await db.select().from(shipmentReleaseRequestTable).where(eq(shipmentReleaseRequestTable.id, id)))[0]!;
  const releaseBol = (companyId: string, shipmentId: string, role = "user", paymentOverrideReason?: string) => shipmentService.releaseHouseBol(shipmentId, companyId, USER, { role, paymentOverrideReason });

  it("stamps the House BoL, records the override with who asked and who approved, and marks the request used - together; without one the user is refused and nothing is written", async () => {
    releaseCheck.mockResolvedValue(UNPAID);
    const companyId = randomUUID();
    const [held, withPass] = [await newJob(companyId), await newJob(companyId)];
    await expect(releaseBol(companyId, held.id)).rejects.toThrow("A manager can release it with a reason");
    expect((await jobNow(held.id)).houseBolRelease).toBe("");
    expect(await overridesOf(held.id)).toEqual([]);

    const requestId = await approvedFor(companyId, withPass.id);
    await expect(releaseBol(companyId, withPass.id)).resolves.toBeTruthy();
    expect((await jobNow(withPass.id)).houseBolRelease).toMatch(/^jan@firma\.cz — /);
    expect(await overridesOf(withPass.id)).toMatchObject([{ kind: "house_bol", reason: REASON, checked: true, byUserId: USER, by: "jan@firma.cz", invoices: [{ number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }] }]);
    expect(await requestNow(requestId)).toMatchObject({ status: "approved", usedById: USER, usedByName: "jan@firma.cz" });
    expect((await requestNow(requestId)).usedAt).toBeInstanceOf(Date);
    expect((await historyOf(withPass.id, "paymentOverride")).map((h) => h.newValue)).toEqual([expect.stringContaining(`reason: ${REASON}`)]);
  });

  it("lets one release through: of two at the same moment the second finds the House BoL released, and the pass is used once", async () => {
    releaseCheck.mockResolvedValue(UNPAID);
    const companyId = randomUUID();
    const job = await newJob(companyId);
    await approvedFor(companyId, job.id);
    const outcomes = await Promise.allSettled([releaseBol(companyId, job.id), releaseBol(companyId, job.id)]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await overridesOf(job.id)).toHaveLength(1);
  });

  it("is good for the release it was asked for only: the warehouse's pass does not release the House BoL", async () => {
    releaseCheck.mockResolvedValue(UNPAID);
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const requestId = await approvedFor(companyId, job.id, "warehouse");
    await expect(releaseBol(companyId, job.id)).rejects.toThrow("A manager can release it with a reason");
    expect((await requestNow(requestId)).usedAt).toBeNull();
  });

  it("is left alone by a manager's own override, and by a job that is paid: neither uses it", async () => {
    const companyId = randomUUID();
    const [overridden, paid] = [await newJob(companyId), await newJob(companyId)];
    const [first, second] = [await approvedFor(companyId, overridden.id), await approvedFor(companyId, paid.id)];
    releaseCheck.mockResolvedValue(UNPAID);
    await expect(releaseBol(companyId, overridden.id, "manager", "Original B/L held by the bank")).resolves.toBeTruthy();
    expect(await overridesOf(overridden.id)).toMatchObject([{ reason: "Original B/L held by the bank" }]);
    releaseCheck.mockResolvedValue({ ...UNPAID, prepaymentUnpaid: false, unpaid: [] });
    await expect(releaseBol(companyId, paid.id)).resolves.toBeTruthy();
    expect(await overridesOf(paid.id)).toEqual([]);
    for (const id of [first, second]) expect((await requestNow(id)).usedAt).toBeNull();
  });

  it("an approval nobody used is closed by the release made without it: clearing Warehouse Released and setting it again does not ride on it", async () => {
    releaseCheck.mockResolvedValue(UNPAID);
    const companyId = randomUUID();
    const job = await newJob(companyId, { warehouseReceivedDate: "2026-11-10" });
    const requestId = await approvedFor(companyId, job.id, "warehouse");
    const setReleased = (role: string, day: string, paymentOverrideReason?: string) =>
      shipmentService.update(job.id, companyId, { warehouseReleasedDate: day }, USER, role, undefined, undefined, { paymentOverrideReason });
    // A manager releases it with a reason of their own: the approval is not used - and is closed.
    await expect(setReleased("manager", "2026-11-17", "Customer sent the payment proof")).resolves.toBeTruthy();
    expect(await requestNow(requestId)).toMatchObject({ status: "closed", comment: "Released without it", usedAt: null, decidedById: MANAGER, decidedByName: "Eva Malá" });
    expect((await historyOf(job.id, "releaseRequest")).map((h) => h.newValue)).toContain("Warehouse Released approval closed unused: released without it");
    // Cleared, and set again by a user: the stop holds, the old approval lets nothing through.
    await expect(setReleased("manager", "")).resolves.toBeTruthy();
    await expect(setReleased("user", "2026-11-18")).rejects.toThrow("A manager can release it with a reason");
    expect((await jobNow(job.id)).warehouseReleasedDate).toBeNull();
    expect(await overridesOf(job.id)).toHaveLength(1);
  });

  it("a request still waiting is closed by the release made without it, in the same turn, with a line in the job's history", async () => {
    releaseCheck.mockResolvedValue(UNPAID);
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const waiting = (await requests.create({ companyId, shipmentId: job.id, what: "house_bol", reason: "Customer pays on Friday", requestedById: USER, requestedByName: "Jan Novák" }, asked(USER, "house_bol")))!;
    await expect(releaseBol(companyId, job.id, "manager", "Original B/L held by the bank")).resolves.toBeTruthy();
    expect(await requestNow(waiting.id)).toMatchObject({ status: "closed", comment: "Released without it", decidedById: null, decidedAt: null });
    expect((await historyOf(job.id, "releaseRequest")).map((h) => h.newValue)).toEqual(["house_bol asked", "House BoL release request closed: released without it"]);
  });
});

describe("the indexes migration 0087 adds for the reads Shipments → Managers polls", () => {
  it("are there: the company's history by day, and the documents approved for customs", async () => {
    const { rows } = await db.execute(sql`SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN ('shipment_audit_company_changed_at_idx', 'shipment_attachment_approved_reviewed_idx') ORDER BY indexname`);
    expect(rows.map((r) => r.indexname)).toEqual(["shipment_attachment_approved_reviewed_idx", "shipment_audit_company_changed_at_idx"]);
    expect(String(rows[0]!.indexdef)).toMatch(/\(company_id, customs_reviewed_at\) WHERE \(customs_status = 'approved'/);
    expect(String(rows[1]!.indexdef)).toMatch(/\(company_id, changed_at\)/);
  });
});

describe("a dismissed cut-off", () => {
  const line = (newValue: string) => ({ userId: MANAGER, field: "cutoffDismissed", oldValue: null, newValue });
  const dismiss = (companyId: string, shipmentId: string, cutoff: "closingDate" | "siClosing" = "siClosing", cutoffDate = "2026-11-17") =>
    dismissals.createWithHistory({ companyId, shipmentId, cutoff, cutoffDate, reason: "Carrier took it late", dismissedById: MANAGER, dismissedByName: "Eva Malá" }, line(`${cutoff} ${cutoffDate}`));

  it("is live once per shipment, cut-off and date, with one line in the job's history", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = await dismiss(companyId, job.id);
    expect(first).toMatchObject({ cutoff: "siClosing", cutoffDate: "2026-11-17", deletedAt: null });
    await expect(dismiss(companyId, job.id)).resolves.toBeNull();
    // Another date, another cut-off: each is its own.
    await expect(dismiss(companyId, job.id, "siClosing", "2026-11-18")).resolves.not.toBeNull();
    await expect(dismiss(companyId, job.id, "closingDate", "2026-11-17")).resolves.not.toBeNull();
    expect((await historyOf(job.id, "cutoffDismissed")).map((h) => h.newValue)).toEqual(["siClosing 2026-11-17", "siClosing 2026-11-18", "closingDate 2026-11-17"]);
    await expect(dismissals.findLive(companyId, job.id, "siClosing", "2026-11-17")).resolves.toMatchObject({ id: first!.id });
  });

  it("is read for the pages by shipment, the company's own and live ones only", async () => {
    const companyId = randomUUID();
    const [a, b] = [await newJob(companyId), await newJob(companyId)];
    await dismiss(companyId, a.id);
    await dismiss(companyId, a.id, "closingDate", "2026-11-16");
    const byJob = await cutoffDismissalsOf(companyId, [a.id, b.id]);
    expect(byJob.get(a.id)!.map((d) => `${d.cutoff} ${d.date}`).sort()).toEqual(["closingDate 2026-11-16", "siClosing 2026-11-17"]);
    expect(byJob.has(b.id)).toBe(false);
    expect((await cutoffDismissalsOf(randomUUID(), [a.id])).size).toBe(0);
    expect((await cutoffDismissalsOf(companyId, [])).size).toBe(0);
  });

  it("taken back, counts no more, keeps its row and leaves a line; it can then be dismissed again", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await dismiss(companyId, job.id))!;
    const back = (row: { cutoff: string; cutoffDate: string }) => ({ userId: MANAGER, field: "cutoffDismissed", oldValue: "was", newValue: `taken back: ${row.cutoff} ${row.cutoffDate}` });
    // Not another company's, nor another shipment's.
    await expect(dismissals.takeBack(first.id, job.id, randomUUID(), back)).resolves.toBeNull();
    await expect(dismissals.takeBack(first.id, randomUUID(), companyId, back)).resolves.toBeNull();
    await expect(dismissals.takeBack(first.id, job.id, companyId, back)).resolves.toMatchObject({ id: first.id });
    await expect(dismissals.takeBack(first.id, job.id, companyId, back)).resolves.toBeNull();
    expect((await cutoffDismissalsOf(companyId, [job.id])).size).toBe(0);
    expect(await dismissals.listForShipment(job.id, companyId)).toEqual([]);
    const [kept] = await db.select().from(shipmentCutoffDismissalTable).where(eq(shipmentCutoffDismissalTable.id, first.id));
    expect(kept!.deletedAt).toBeInstanceOf(Date);
    expect((await historyOf(job.id, "cutoffDismissed")).map((h) => h.newValue)).toEqual(["siClosing 2026-11-17", "taken back: siClosing 2026-11-17"]);
    await expect(dismiss(companyId, job.id)).resolves.not.toBeNull();
    expect(await dismissals.listForShipment(job.id, companyId)).toHaveLength(1);
  });

  it("refuses a cut-off outside the five, and one of no shipment", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const row = { companyId, cutoffDate: "2026-11-17", reason: "x", dismissedById: MANAGER };
    await expect(db.insert(shipmentCutoffDismissalTable).values({ ...row, shipmentId: job.id, cutoff: "estimatedDeparture" as "closingDate" })).rejects.toThrow();
    await expect(db.insert(shipmentCutoffDismissalTable).values({ ...row, shipmentId: randomUUID(), cutoff: "closingDate" })).rejects.toThrow();
  });
});

describe("a manager's nudge", () => {
  const nudge = (companyId: string, shipmentId: string, over = {}) =>
    nudges.create({
      companyId,
      shipmentId,
      authorId: MANAGER,
      text: "Send the SI today",
      dueDate: "2026-11-19",
      message: "To-do from Eva Malá: Send the SI today — due 19.11.2026\n@Jan Novák",
      mentionedUserIds: [USER],
      history: { field: "nudge", newValue: "To-do for jan@firma.cz: Send the SI today — due 19.11.2026" },
      ...over,
    });

  it("writes the to-do, the chat line that tags the job's people and the history line together", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const note = await nudge(companyId, job.id);
    expect(note).toMatchObject({ shipmentId: job.id, text: "Send the SI today", dueDate: "2026-11-19", authorId: MANAGER, doneAt: null });
    const comments = await db.select().from(shipmentCommentTable).where(eq(shipmentCommentTable.shipmentId, job.id));
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ authorId: MANAGER, mentionedUserIds: [USER], message: expect.stringContaining("To-do from Eva Malá") });
    expect((await historyOf(job.id, "nudge")).map((h) => [h.userId, h.newValue])).toEqual([[MANAGER, "To-do for jan@firma.cz: Send the SI today — due 19.11.2026"]]);
  });

  it("writes nothing a second time while the same to-do is open; once it is done, or for another day, it is a new one", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const first = (await nudge(companyId, job.id))!;
    await expect(nudge(companyId, job.id)).resolves.toBeNull();
    const openNotes = () => db.select().from(shipmentNoteTable).where(and(eq(shipmentNoteTable.shipmentId, job.id), isNull(shipmentNoteTable.deletedAt)));
    expect(await openNotes()).toHaveLength(1);
    expect(await db.select().from(shipmentCommentTable).where(eq(shipmentCommentTable.shipmentId, job.id))).toHaveLength(1);
    expect(await historyOf(job.id, "nudge")).toHaveLength(1);
    await expect(nudge(companyId, job.id, { dueDate: "2026-11-20" })).resolves.not.toBeNull();
    await db.update(shipmentNoteTable).set({ doneAt: new Date() }).where(eq(shipmentNoteTable.id, first.id));
    await expect(nudge(companyId, job.id)).resolves.not.toBeNull();
    expect(await openNotes()).toHaveLength(3);
  });
});

describe("how many active jobs name a person (the Users page's warning)", () => {
  it("counts Handled By as the list's filter matches it, Holiday Cover the same way, over active jobs of the company only", async () => {
    const companyId = randomUUID();
    await newJob(companyId, { personInCharge: "jan@firma.cz" });
    await newJob(companyId, { personInCharge: " Jan@Firma.cz — Jan Novák", holidayCover: "eva@firma.cz" });
    await newJob(companyId, { personInCharge: "eva@firma.cz", holidayCover: "JAN@firma.cz" });
    // Not active: invoiced, cancelled, deleted.
    await newJob(companyId, { personInCharge: "jan@firma.cz", invoicingStatus: "Invoiced" });
    await newJob(companyId, { personInCharge: "jan@firma.cz", holidayCover: "jan@firma.cz", status: CANCELLED_STATUS });
    await newJob(companyId, { personInCharge: "jan@firma.cz", deletedAt: new Date() });
    // Another company's.
    await newJob(randomUUID(), { personInCharge: "jan@firma.cz", holidayCover: "jan@firma.cz" });

    expect(await shipmentRepository.handledByCounts(companyId, "jan@firma.cz")).toEqual({ handledBy: 2, covers: 1 });
    expect(await shipmentRepository.handledByCounts(companyId, "eva@firma.cz")).toEqual({ handledBy: 1, covers: 1 });
    expect(await shipmentRepository.handledByCounts(companyId, "nikdo@firma.cz")).toEqual({ handledBy: 0, covers: 0 });
    // The same jobs the list's Handled By filter finds among the active ones.
    const { total } = await shipmentRepository.listFiltered(companyId, { tile: "active", handledBy: "jan@firma.cz", limit: 50, offset: 0, sortDirection: "asc" });
    expect(total).toBe(2);
  });
});
