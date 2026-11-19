import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// Accounts Receivable's repository against the invoicing database: the lazy rows, the figures summed in SQL (credit
// notes, live payments), the list's scope, the version check and its rollback, the idempotency key, the carry-over
// once, a take-back, the counts the customers service asks for, the bell's seen keys and failed hand-overs; step 7:
// write-offs and bank charges counted once confirmed, the waiting list, the batch's locks and savepoint, the month-end
// candidates and the reminder settings - the SQL the service tests stand in for. Each test works in a company of its own. Runs only under `encore test`
// (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { asAtOf } from "../../lib/receivables";
import { receivableRepository as repo, CARRIED_OVER_NOTE } from "../../repositories/receivable.repository";
import { invoiceTable as t, type InvoiceRecord } from "../../schemas/invoice.schema";
import { invoiceFollowupOutboxTable as o } from "../../schemas/invoiceFollowupOutbox.schema";
import { receivableEventTable as ev, receivablePaymentTable as p, receivableSettingsTable as settingsT, receivableTable as r } from "../../schemas/receivable.schema";

const issue = async (companyId: string, over: Partial<typeof t.$inferInsert> = {}): Promise<InvoiceRecord> => {
  const customerId = over.customerId ?? randomUUID();
  return (
    await db
      .insert(t)
      .values({
        companyId,
        shipmentId: randomUUID(),
        kind: "invoice",
        status: "issued",
        number: `INV-${randomUUID()}`,
        customerId,
        issueDate: "2026-11-02",
        duzp: "2026-11-01",
        dueDate: "2026-11-16",
        currency: "CZK",
        fxRate: "1.000000",
        net: "1000.00",
        vat: "210.00",
        gross: "1210.00",
        netCzk: "1000.00",
        vatCzk: "210.00",
        grossCzk: "1210.00",
        vatSummary: [],
        supplier: {} as never,
        customer: { customerId, companyName: "Gama Elektro a.s.", address: "", city: "", country: "CZ", ico: "", dic: "", paymentTerms: "14 days" },
        shipment: { jobNumber: "CZ00000031", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
        issuedBy: randomUUID(),
        ...over,
      })
      .returning()
  )[0]!;
};

/** A credit note of the invoice for `gross` (negative). */
const creditNote = (companyId: string, of: InvoiceRecord, gross: string) =>
  issue(companyId, { kind: "credit_note", correctsInvoiceId: of.id, shipmentId: of.shipmentId, customerId: of.customerId, net: gross, vat: "0.00", gross, netCzk: gross, vatCzk: "0.00", grossCzk: gross });

const pay = (companyId: string, invoiceId: string, amount: string, over: Partial<typeof p.$inferInsert> = {}) =>
  db.transaction((tx) => repo.insertPayment(tx, { companyId, invoiceId, kind: "payment", paidOn: "2026-11-14", amount, by: "boss@test.cz", ...over }));

const receivableOf = async (invoiceId: string) => (await db.select().from(r).where(eq(r.invoiceId, invoiceId)))[0];
const paymentsOf = (invoiceId: string) => db.select().from(p).where(eq(p.invoiceId, invoiceId));
const eventsOf = async (invoiceId: string) => (await db.select().from(ev).where(eq(ev.invoiceId, invoiceId))).map((e) => e.action);
const stateRows = (companyId: string) => (i: InvoiceRecord) => [
  { companyId, invoiceId: i.id, shipmentId: i.shipmentId, kind: "receivable_state" as const, payload: { invoiceId: i.id }, actingUserId: randomUUID(), actingRole: "manager" },
];
/** Rows this file writes are not for any other test's delivery run to send. */
const cancelOutbox = (invoiceIds: string[]) => db.update(o).set({ status: "cancelled" }).where(and(inArray(o.invoiceId, invoiceIds), eq(o.status, "pending")));

describe("the lazy rows (ensureRows)", () => {
  it("makes one receivable per invoice (not per credit note), once, and keeps another company apart", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const inv = await issue(a);
    await creditNote(a, inv, "-210.00");
    const theirs = await issue(b);

    await repo.ensureRows(a, { all: true });
    await repo.ensureRows(a, { invoiceIds: [inv.id] });

    const rows = await db.select().from(r).where(eq(r.companyId, a));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoiceId: inv.id, version: 1, carriedChecked: false, paidTotal: "0.00", disputed: false, reminderLevel: 0 });
    expect(await receivableOf(theirs.id)).toBeUndefined();
  });
});

describe("the figures (figures, figuresOne)", () => {
  it("sums the credit notes and the live payments, and knows the last day paid", async () => {
    const a = randomUUID();
    const inv = await issue(a, { gross: "2380.00" });
    await creditNote(a, inv, "-476.00");
    await pay(a, inv.id, "400.00", { paidOn: "2026-11-10" });
    const later = await pay(a, inv.id, "100.00", { paidOn: "2026-11-15" });
    await db.transaction(async (tx) => {
      await repo.takeBack(tx, a, inv.id, later!.id, { userId: randomUUID(), email: "boss@test.cz", reason: "noted twice" });
      await repo.refreshPaid(tx, a, inv.id);
    });

    const f = await repo.figuresOne(a, inv.id);
    expect(f).toMatchObject({ credited: 476, paid: 400, lastPaidOn: "2026-11-10", receivable: null });
    // A credit note is not an invoice of its own here.
    expect(await repo.figures(a, { all: true }, 10)).toHaveLength(1);
    await repo.ensureRows(a, { all: true });
    expect(await receivableOf(inv.id)).toMatchObject({ paidTotal: "0.00" });
    await db.transaction((tx) => repo.refreshPaid(tx, a, inv.id));
    expect(await receivableOf(inv.id)).toMatchObject({ paidTotal: "400.00", lastPaidOn: "2026-11-10" });
  });

  it("lists every invoice owed or to refund whatever its age, and the others issued since the day, the owed first", async () => {
    const a = randomUUID();
    const oldOwed = await issue(a, { issueDate: "2025-01-10", duzp: "2025-01-10", dueDate: "2025-01-24" });
    const oldPaid = await issue(a, { issueDate: "2025-02-10", duzp: "2025-02-10", dueDate: "2025-02-24" });
    await pay(a, oldPaid.id, "1210.00", { paidOn: "2025-02-20" });
    const oldRefund = await issue(a, { issueDate: "2025-03-10", duzp: "2025-03-10", dueDate: "2025-03-24", gross: "1000.00" });
    await pay(a, oldRefund.id, "300.00", { paidOn: "2025-03-20" });
    await creditNote(a, oldRefund, "-1000.00");
    await db.update(t).set({ status: "credited" }).where(eq(t.id, oldRefund.id));
    const recentPaid = await issue(a, { issueDate: "2026-11-10", duzp: "2026-11-10", dueDate: "2026-11-24" });
    await pay(a, recentPaid.id, "1210.00", { paidOn: "2026-11-14" });
    const cancelled = await issue(a, { issueDate: "2025-04-10", duzp: "2025-04-10", dueDate: "2025-04-10" });
    await db.update(t).set({ status: "cancelled" }).where(eq(t.id, cancelled.id));

    const rows = await repo.figures(a, { openOrSince: "2026-08-20" }, 10);
    expect(rows.map((x) => x.invoice.id)).toEqual([oldRefund.id, oldOwed.id, recentPaid.id]);
    expect(rows[0]).toMatchObject({ credited: 1000, paid: 300 });
    expect(await repo.figures(a, { openOrSince: null }, 10)).toHaveLength(5);
    expect(await repo.figures(a, { openOrSince: "2026-08-20" }, 1)).toHaveLength(1);

    // Overdue on a day: owed and due before it (not the cancelled one, not the paid ones).
    expect((await repo.figures(a, { overdueOn: "2026-11-18" }, 10)).map((x) => x.invoice.id)).toEqual([oldOwed.id]);
    expect(await repo.overdueCountByCustomer(a, [oldOwed.customerId, recentPaid.customerId], "2026-11-18")).toEqual(new Map([[oldOwed.customerId, 1]]));
    expect(await repo.owedCountOfCustomer(a, oldOwed.customerId)).toBe(1);
    expect(await repo.owedCountOfCustomer(a, cancelled.customerId)).toBe(0);
  });

  it("reads a job's and a customer's invoices", async () => {
    const a = randomUUID();
    const customerId = randomUUID();
    const one = await issue(a, { customerId });
    const two = await issue(a, { customerId, shipmentId: one.shipmentId });
    await issue(a);
    expect((await repo.figures(a, { shipmentId: one.shipmentId }, 10)).map((x) => x.invoice.id).sort()).toEqual([one.id, two.id].sort());
    expect(await repo.figures(a, { customerId }, 10)).toHaveLength(2);
    expect(await repo.figures(a, { invoiceIds: [] }, 10)).toEqual([]);
  });
});

describe("writing under the version (decide)", () => {
  it("writes from the version read only, with its event; a failed step rolls everything back", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await repo.ensureRows(a, { invoiceIds: [inv.id] });
    const rec = (await repo.byInvoice(a, inv.id))!;

    const row = await repo.decide(a, rec, { promisedOn: "2026-11-25" }, { action: "promised", by: "jana@test.cz" });
    expect(row).toMatchObject({ version: 2, promisedOn: "2026-11-25" });
    // A second write from the same read is refused.
    expect(await repo.decide(a, rec, { disputed: true }, { action: "disputed" })).toBeNull();

    await expect(
      repo.decide(a, row!, {}, { action: "payment_noted" }, async (tx) => {
        await repo.insertPayment(tx, { companyId: a, invoiceId: inv.id, kind: "payment", paidOn: "2026-11-14", amount: "100.00" });
        throw new Error("refused under the lock");
      }),
    ).rejects.toThrow("refused under the lock");
    expect(await receivableOf(inv.id)).toMatchObject({ version: 2, disputed: false });
    expect(await paymentsOf(inv.id)).toEqual([]);
    expect(await eventsOf(inv.id)).toEqual(["promised"]);
  });

  it("adds what the step returns to the event", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await repo.ensureRows(a, { invoiceIds: [inv.id] });
    const rec = (await repo.byInvoice(a, inv.id))!;
    await repo.decide(a, rec, {}, { action: "payment_noted", fromStatus: "unpaid", payload: { amount: 100 } }, async () => ({ toStatus: "part_paid", payload: { paymentId: "p-1" } }));
    const [event] = await db.select().from(ev).where(eq(ev.invoiceId, inv.id));
    expect(event).toMatchObject({ action: "payment_noted", fromStatus: "unpaid", toStatus: "part_paid", payload: { amount: 100, paymentId: "p-1" } });
  });
});

describe("payments", () => {
  it("notes one payment per idempotency key in a company, and lets another company use the same key", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const inv = await issue(a);
    const theirs = await issue(b);
    expect(await pay(a, inv.id, "100.00", { idempotencyKey: "k-1" })).not.toBeNull();
    expect(await pay(a, inv.id, "100.00", { idempotencyKey: "k-1" })).toBeNull();
    expect(await pay(b, theirs.id, "100.00", { idempotencyKey: "k-1" })).not.toBeNull();
    expect(await repo.paymentByKey(a, "k-1")).toMatchObject({ invoiceId: inv.id, amount: "100.00" });
    expect(await paymentsOf(inv.id)).toHaveLength(1);
  });

  it("refuses an amount of 0 and a payment with no day (only one carried over has none)", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await expect(pay(a, inv.id, "0.00")).rejects.toThrow();
    await expect(pay(a, inv.id, "10.00", { paidOn: null })).rejects.toThrow();
  });

  it("takes a payment back once", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    const made = (await pay(a, inv.id, "100.00"))!;
    const by = { userId: randomUUID(), email: "boss@test.cz", reason: "noted twice" };
    expect(await db.transaction((tx) => repo.takeBack(tx, a, inv.id, made.id, by))).toMatchObject({ takenBackBy: "boss@test.cz", takenBackReason: "noted twice" });
    expect(await db.transaction((tx) => repo.takeBack(tx, a, inv.id, made.id, by))).toBeNull();
    // Another company can't take it back.
    expect(await db.transaction((tx) => repo.takeBack(tx, randomUUID(), inv.id, made.id, by))).toBeNull();
    expect((await repo.paymentById(a, inv.id, made.id))!.takenBackAt).not.toBeNull();
  });
});

describe("carrying the customer's list's Paid over (carryOver)", () => {
  it("carries what is owed after the credit notes over once, day not known, with its follow-up; an invoice not paid there is only checked", async () => {
    const a = randomUUID();
    const paidThere = await issue(a);
    await creditNote(a, paidThere, "-210.00");
    const openThere = await issue(a);
    await repo.ensureRows(a, { all: true });
    expect((await repo.notCarriedChecked(a, { all: true })).map((x) => x.invoiceId).sort()).toEqual([paidThere.id, openThere.id].sort());

    const items = [
      { invoiceId: paidThere.id, paid: true },
      { invoiceId: openThere.id, paid: false },
    ];
    expect(await repo.carryOver(a, items, stateRows(a))).toEqual([paidThere.id]);
    expect(await repo.carryOver(a, items, stateRows(a))).toEqual([]);

    const payments = await paymentsOf(paidThere.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ kind: "carried_over", paidOn: null, amount: "1000.00", note: CARRIED_OVER_NOTE, by: "" });
    expect(await receivableOf(paidThere.id)).toMatchObject({ carriedChecked: true, paidTotal: "1000.00", version: 2 });
    expect(await receivableOf(openThere.id)).toMatchObject({ carriedChecked: true, paidTotal: "0.00", version: 1 });
    expect(await paymentsOf(openThere.id)).toEqual([]);
    expect(await eventsOf(paidThere.id)).toEqual(["carried_over"]);
    expect(await repo.figuresOne(a, paidThere.id)).toMatchObject({ credited: 210, paid: 1000 });
    expect(await repo.notCarriedChecked(a, { all: true })).toEqual([]);

    // The follow-up was written with the new kind (the outbox's check takes it).
    const followups = await db.select().from(o).where(eq(o.invoiceId, paidThere.id));
    expect(followups).toEqual([expect.objectContaining({ kind: "receivable_state", payload: { invoiceId: paidThere.id }, status: "pending" })]);
    await cancelOutbox([paidThere.id]);
  });

  it("carries nothing over to an invoice with a live payment, or credited to nothing, and checks them", async () => {
    const a = randomUUID();
    const withPayment = await issue(a);
    await pay(a, withPayment.id, "10.00");
    const creditedAway = await issue(a);
    await creditNote(a, creditedAway, "-1210.00");
    await repo.ensureRows(a, { all: true });
    const items = [withPayment, creditedAway].map((i) => ({ invoiceId: i.id, paid: true }));
    expect(await repo.carryOver(a, items, stateRows(a))).toEqual([]);
    expect(await paymentsOf(creditedAway.id)).toEqual([]);
    expect(await receivableOf(withPayment.id)).toMatchObject({ carriedChecked: true });
    await repo.markCarriedChecked(a, [creditedAway.id]);
    expect(await repo.notCarriedChecked(a, { all: true })).toEqual([]);
  });
});

describe("for the customers service and the bell", () => {
  it("answers which numbers are the company's issued documents", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    const cn = await creditNote(a, inv, "-10.00");
    const theirs = await issue(randomUUID());
    expect((await repo.issuedNumbers(a, [inv.number, ` ${cn.number} `, theirs.number, "typed-1"])).sort()).toEqual([inv.number, cn.number].sort());
    expect(await repo.issuedNumbers(a, [])).toEqual([]);
  });

  it("keeps seen keys per user, invoice and milestone, only for the company's invoices", async () => {
    const a = randomUUID();
    const user = randomUUID();
    const inv = await issue(a);
    const theirs = await issue(randomUUID());
    const items = [
      { invoiceId: inv.id, milestone: "overdue_1" },
      { invoiceId: theirs.id, milestone: "overdue_1" },
    ];
    await repo.markSeen(a, user, items);
    await repo.markSeen(a, user, items);
    expect(await repo.seenKeys(a, user, [inv.id, theirs.id])).toEqual(new Set([`${inv.id}:overdue_1`]));
    expect(await repo.seenKeys(a, randomUUID(), [inv.id])).toEqual(new Set());
  });

  it("finds the invoices a payment was noted on lately, not carried-over or taken-back ones", async () => {
    const a = randomUUID();
    const paid = await issue(a);
    const carried = await issue(a);
    await pay(a, paid.id, "1210.00");
    await pay(a, carried.id, "1210.00", { kind: "carried_over", paidOn: null });
    expect(await repo.paidSince(a, new Date(Date.now() - 60_000))).toEqual([paid.id]);
    expect(await repo.paidSince(a, new Date(Date.now() + 60_000))).toEqual([]);
  });

  it("finds a document's failed hand-overs by kind", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await db.insert(o).values({
      companyId: a,
      invoiceId: inv.id,
      shipmentId: inv.shipmentId,
      kind: "customer_invoice",
      payload: { invoiceId: inv.id },
      actingUserId: "",
      actingRole: "user",
      status: "failed",
      lastError: "The document could not be added to the customer's invoice list",
    });
    expect(await repo.failedFollowups(a, [inv.id], ["customer_invoice", "receivable_state"])).toEqual([expect.objectContaining({ invoiceId: inv.id, kind: "customer_invoice" })]);
    expect(await repo.failedFollowups(a, [inv.id], ["mark_credited"])).toEqual([]);
    expect(await repo.failedFollowups(randomUUID(), [inv.id], ["customer_invoice"])).toEqual([]);
  });
});

// ── Step 7 (18 Nov 2026) ──

/** A write-off or bank charge as a manager writes it: waiting for a second manager. */
const writeOff = (companyId: string, invoiceId: string, amount: string, over: Partial<typeof p.$inferInsert> = {}) =>
  db.transaction((tx) => repo.insertPayment(tx, { companyId, invoiceId, kind: "write_off", paidOn: "2026-11-18", amount, reason: "short paid", by: "eva@test.cz", byUserId: randomUUID(), ...over }));
const confirm = (companyId: string, invoiceId: string, lineId: string) =>
  db.transaction((tx) => repo.confirmLine(tx, companyId, invoiceId, lineId, { userId: randomUUID(), email: "boss@test.cz", selfConfirmed: false }));

describe("write-offs and bank charges (step 7)", () => {
  it("writes money confirmed at once, a write-off waiting (whatever it was given), and refuses one with no reason", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    const money = (await pay(a, inv.id, "100.00"))!;
    expect(money.confirmedAt).not.toBeNull();
    const waiting = (await writeOff(a, inv.id, "10.00", { confirmedAt: new Date() }))!;
    expect(waiting.confirmedAt).toBeNull();
    await expect(writeOff(a, inv.id, "10.00", { reason: "" })).rejects.toThrow();
  });

  it("counts a write-off or bank charge only once confirmed and live; what waits is summed apart", async () => {
    const a = randomUUID();
    const customerId = randomUUID();
    const inv = await issue(a, { customerId });
    await pay(a, inv.id, "1000.00");
    const wo = (await writeOff(a, inv.id, "200.00"))!;
    const bc = (await writeOff(a, inv.id, "10.00", { kind: "bank_charge" }))!;
    expect(await repo.figuresOne(a, inv.id)).toMatchObject({ paid: 1000, writtenOff: 0, bankCharges: 0, waiting: 210 });
    expect(await repo.owedCountOfCustomer(a, customerId)).toBe(1);

    expect(await confirm(a, inv.id, wo.id)).toMatchObject({ confirmedBy: "boss@test.cz" });
    // Once only; never by another company.
    expect(await confirm(a, inv.id, wo.id)).toBeNull();
    expect(await confirm(randomUUID(), inv.id, bc.id)).toBeNull();
    expect(await confirm(a, inv.id, bc.id)).not.toBeNull();
    expect(await repo.figuresOne(a, inv.id)).toMatchObject({ paid: 1000, writtenOff: 200, bankCharges: 10, waiting: 0, lastPaidOn: "2026-11-14" });
    // Settled: no longer owed, nor overdue, nor listed as open.
    expect(await repo.owedCountOfCustomer(a, customerId)).toBe(0);
    expect(await repo.figures(a, { overdueOn: "2026-12-31" }, 10)).toEqual([]);
    // The money paid so far stays money only.
    await repo.ensureRows(a, { invoiceIds: [inv.id] });
    await db.transaction((tx) => repo.refreshPaid(tx, a, inv.id));
    expect(await receivableOf(inv.id)).toMatchObject({ paidTotal: "1000.00", lastPaidOn: "2026-11-14" });

    // Taken back: it counts no more, and a taken-back waiting line can't be confirmed.
    await db.transaction((tx) => repo.takeBack(tx, a, inv.id, wo.id, { userId: randomUUID(), email: "boss@test.cz", reason: "agreed otherwise" }));
    expect(await repo.figuresOne(a, inv.id)).toMatchObject({ writtenOff: 0, bankCharges: 10 });
    const later = (await writeOff(a, inv.id, "5.00"))!;
    await db.transaction((tx) => repo.takeBack(tx, a, inv.id, later.id, { userId: randomUUID(), email: "boss@test.cz", reason: "wrong one" }));
    expect(await confirm(a, inv.id, later.id)).toBeNull();
  });

  it("lists what waits for a second manager with its invoice and version, the oldest first, only the company's", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await repo.ensureRows(a, { invoiceIds: [inv.id] });
    const first = (await writeOff(a, inv.id, "1.00"))!;
    const second = (await writeOff(a, inv.id, "2.00", { kind: "bank_charge" }))!;
    const confirmed = (await writeOff(a, inv.id, "3.00"))!;
    await confirm(a, inv.id, confirmed.id);
    await pay(a, inv.id, "4.00");
    const theirs = await issue(randomUUID());
    await writeOff(theirs.companyId, theirs.id, "9.00");
    const lines = await repo.waitingLines(a);
    expect(lines.map((x) => x.line.id)).toEqual([first.id, second.id]);
    expect(lines[0]).toMatchObject({ invoice: { id: inv.id, number: inv.number, currency: "CZK" }, version: 1 });
  });
});

describe("the batch's locks and versions (step 7)", () => {
  it("moves a receivable on from its version once, and finds lines by their keys", async () => {
    const a = randomUUID();
    const inv = await issue(a);
    await repo.ensureRows(a, { invoiceIds: [inv.id] });
    expect(await db.transaction((tx) => repo.bumpVersion(tx, a, inv.id, 1))).toBe(true);
    expect(await db.transaction((tx) => repo.bumpVersion(tx, a, inv.id, 1))).toBe(false);
    expect(await db.transaction((tx) => repo.bumpVersion(tx, randomUUID(), inv.id, 2))).toBe(false);
    await pay(a, inv.id, "10.00", { idempotencyKey: `bank:e1:${inv.id}` });
    expect((await repo.paymentsByKeys(a, [`bank:e1:${inv.id}`, "bank:e1:other"])).map((x) => x.invoiceId)).toEqual([inv.id]);
    expect(await repo.paymentsByKeys(randomUUID(), [`bank:e1:${inv.id}`])).toEqual([]);
  });

  it("rolls back everything when a step fails, in its own transaction or in a savepoint of the caller's", async () => {
    const a = randomUUID();
    const one = await issue(a);
    const two = await issue(a, { shipment: { jobNumber: "CZ00000032", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" } });
    await repo.ensureRows(a, { all: true });
    await expect(
      repo.underWriteLocks(a, [one, two], async (tx) => {
        await repo.insertPayment(tx, { companyId: a, invoiceId: one.id, kind: "payment", paidOn: "2026-11-14", amount: "10.00" });
        throw new Error("the second invoice refused it");
      }),
    ).rejects.toThrow("the second invoice refused it");
    expect(await paymentsOf(one.id)).toEqual([]);

    // In the caller's transaction: the savepoint is rolled back, the caller's own write still commits.
    await db.transaction(async (outer) => {
      await outer.update(r).set({ promisedOn: "2026-11-30" }).where(eq(r.invoiceId, two.id));
      await expect(
        repo.underWriteLocks(
          a,
          [two, one],
          async (tx) => {
            await repo.insertPayment(tx, { companyId: a, invoiceId: two.id, kind: "payment", paidOn: "2026-11-14", amount: "10.00" });
            throw new Error("refused");
          },
          outer,
        ),
      ).rejects.toThrow("refused");
    });
    expect(await paymentsOf(two.id)).toEqual([]);
    expect(await receivableOf(two.id)).toMatchObject({ promisedOn: "2026-11-30" });

    // And it writes when nothing fails.
    await repo.underWriteLocks(a, [one, two], (tx) => repo.insertPayment(tx, { companyId: a, invoiceId: one.id, kind: "payment", paidOn: "2026-11-14", amount: "10.00" }));
    expect(await paymentsOf(one.id)).toHaveLength(1);
  });
});

describe("month-end candidates (asAtCandidates)", () => {
  it("reads every invoice that may be owed at the end of the day, and none that can't", async () => {
    const a = randomUUID();
    const day = "2026-10-31";
    const at = (over: Partial<typeof t.$inferInsert> = {}) => issue(a, { issueDate: "2026-10-10", duzp: "2026-10-10", dueDate: "2026-10-24", ...over });
    const owedNow = await at();
    const paidAfter = await at();
    await pay(a, paidAfter.id, "1210.00", { paidOn: "2026-11-03" });
    const paidBefore = await at();
    await pay(a, paidBefore.id, "1210.00", { paidOn: "2026-10-20" });
    const creditedAfter = await at();
    // Credited in full after the day (an issued document is never changed: the credit note is issued on that day).
    await issue(a, {
      kind: "credit_note",
      correctsInvoiceId: creditedAfter.id,
      shipmentId: creditedAfter.shipmentId,
      customerId: creditedAfter.customerId,
      issueDate: "2026-11-05",
      duzp: "2026-11-05",
      dueDate: "2026-11-05",
      net: "-1210.00",
      vat: "0.00",
      gross: "-1210.00",
      netCzk: "-1210.00",
      vatCzk: "0.00",
      grossCzk: "-1210.00",
    });
    const writtenOffAfter = await at();
    const wo = (await writeOff(a, writtenOffAfter.id, "1210.00"))!;
    await confirm(a, writtenOffAfter.id, wo.id);
    await db.update(p).set({ confirmedAt: new Date("2026-11-02T10:00:00Z") }).where(eq(p.id, wo.id));
    const writtenOffBefore = await at();
    const wo2 = (await writeOff(a, writtenOffBefore.id, "1210.00"))!;
    await confirm(a, writtenOffBefore.id, wo2.id);
    await db.update(p).set({ confirmedAt: new Date("2026-10-30T10:00:00Z") }).where(eq(p.id, wo2.id));
    const issuedAfter = await issue(a, { issueDate: "2026-11-02", duzp: "2026-11-02", dueDate: "2026-11-16" });
    const cancelled = await at();
    await db.update(t).set({ status: "cancelled" }).where(eq(t.id, cancelled.id));

    const found = await repo.asAtCandidates(a, day, 100);
    expect(found.map((x) => x.id).sort()).toEqual([owedNow.id, paidAfter.id, creditedAfter.id, writtenOffAfter.id].sort());
    expect(found.find((x) => x.id === owedNow.id)).toMatchObject({ number: owedNow.number, customer: "Gama Elektro a.s.", jobNumber: "CZ00000031", gross: 1210, fxRate: 1, status: "issued" });
    expect(found.map((x) => x.id)).not.toContain(issuedAfter.id);
    expect(await repo.asAtCandidates(a, day, 1)).toHaveLength(1);
  });

  it("a payment moved to another invoice counts once at month-end: never on the invoice it was taken back from (N2, L1)", async () => {
    const a = randomUUID();
    const day = "2026-10-31";
    const at = () => issue(a, { issueDate: "2026-10-10", duzp: "2026-10-10", dueDate: "2026-10-24" });
    const wrong = await at();
    const right = await at();
    // Paid on 20.10. and noted on the wrong invoice; taken back after the month-end day and noted on the right one with
    // the bank's day 20.10.
    const noted = (await pay(a, wrong.id, "1210.00", { paidOn: "2026-10-20" }))!;
    await db.transaction((tx) => repo.takeBack(tx, a, wrong.id, noted.id, { userId: randomUUID(), email: "boss@test.cz", reason: "noted on the wrong invoice" }));
    await db.update(p).set({ takenBackAt: new Date("2026-11-04T09:00:00Z") }).where(eq(p.id, noted.id));
    await pay(a, right.id, "1210.00", { paidOn: "2026-10-20" });

    const found = await repo.asAtCandidates(a, day, 100);
    // The wrong one is owed now, so it is a candidate; the right one is settled by a payment that counted on the day.
    expect(found.map((x) => x.id)).toEqual([wrong.id]);
    const [wrongLines, rightLines] = await Promise.all([repo.paymentsOf(a, [wrong.id]), repo.paymentsOf(a, [right.id])]);
    const asAt = (inv: InvoiceRecord, lines: typeof wrongLines) =>
      asAtOf({ invoiceStatus: inv.status, issueDate: inv.issueDate, dueDate: inv.dueDate, gross: Number(inv.gross), fxRate: 1, creditNotes: [], lines }, day);
    // Listed as owed in full on the day; the right one not listed: the receivables are 1,210.00, not 0.
    expect(asAt(wrong, wrongLines)).toMatchObject({ listed: true, paid: 0, leftToPay: 1210, daysOverdue: 7 });
    expect(asAt(right, rightLines)).toMatchObject({ listed: false, paid: 1210, leftToPay: 0 });
  });
});

describe("disputes that close by themselves (closeSettledDisputes, n4)", () => {
  const dispute = (companyId: string, invoiceId: string) =>
    db.update(r).set({ disputed: true, disputedReason: "the customer disputes the rate" }).where(and(eq(r.companyId, companyId), eq(r.invoiceId, invoiceId)));
  const reason = ({ status }: { invoiceStatus: string; status: string }) => `closed: ${status}`;

  it("closes a dispute once nothing is owed - paid, credited in full - with a note and a history line, and leaves one still owed", async () => {
    const a = randomUUID();
    const paid = await issue(a);
    const credited = await issue(a);
    const owed = await issue(a);
    const partPaid = await issue(a);
    await repo.ensureRows(a, { all: true });
    for (const inv of [paid, credited, owed, partPaid]) await dispute(a, inv.id);
    await pay(a, paid.id, "1210.00");
    await creditNote(a, credited, "-1210.00");
    await pay(a, partPaid.id, "200.00");

    const closed = await repo.closeSettledDisputes(a, { all: true }, "Accounts Receivable (automatic)", reason);
    expect(closed.sort()).toEqual([paid.id, credited.id].sort());
    expect(await receivableOf(paid.id)).toMatchObject({ disputed: false, disputedReason: "" });
    expect(await receivableOf(credited.id)).toMatchObject({ disputed: false });
    expect(await receivableOf(owed.id)).toMatchObject({ disputed: true });
    expect(await receivableOf(partPaid.id)).toMatchObject({ disputed: true });
    expect(await eventsOf(paid.id)).toContain("dispute_closed");
    const [event] = await db.select().from(ev).where(and(eq(ev.invoiceId, paid.id), eq(ev.action, "dispute_closed")));
    expect(event).toMatchObject({ by: "Accounts Receivable (automatic)", reason: "closed: paid", byUserId: null });
    const notes = await repo.notes(a, paid.id);
    expect(notes).toEqual([expect.objectContaining({ kind: "dispute_closed", text: "closed: paid", by: "Accounts Receivable (automatic)" })]);

    // Once: a second read closes nothing more, and another company's are never touched.
    expect(await repo.closeSettledDisputes(a, { all: true }, "x", reason)).toEqual([]);
    expect(await repo.closeSettledDisputes(randomUUID(), { all: true }, "x", reason)).toEqual([]);
    // The scope holds: one invoice's read closes only that one.
    const later = await issue(a);
    await repo.ensureRows(a, { invoiceIds: [later.id] });
    await dispute(a, later.id);
    await pay(a, later.id, "1210.00");
    expect(await repo.closeSettledDisputes(a, { invoiceIds: [owed.id] }, "x", reason)).toEqual([]);
    expect(await repo.closeSettledDisputes(a, { invoiceIds: [later.id] }, "x", reason)).toEqual([later.id]);
  });

  it("opens one that closed by itself again once what settled it is taken back, with its own reason and a history line - never one a person closed", async () => {
    const a = randomUUID();
    const byItself = await issue(a);
    const byPerson = await issue(a);
    await repo.ensureRows(a, { all: true });
    for (const inv of [byItself, byPerson]) {
      await dispute(a, inv.id);
      await repo.addEvent(db, a, inv.id, { action: "disputed", by: "eva@test.cz", reason: "the customer disputes the rate" });
      await pay(a, inv.id, "1210.00");
    }
    await repo.closeSettledDisputes(a, { invoiceIds: [byItself.id] }, "Accounts Receivable (automatic)", reason);
    // A person closes the other one (no "automatic" on the event).
    await db.update(r).set({ disputed: false, disputedReason: "" }).where(eq(r.invoiceId, byPerson.id));
    await repo.addEvent(db, a, byPerson.id, { action: "dispute_closed", by: "eva@test.cz", reason: "agreed by phone" });

    // Still paid: nothing opens again.
    expect(await repo.reopenAutoClosedDisputes(a, { all: true }, "Accounts Receivable (automatic)", "opened again")).toEqual([]);

    for (const inv of [byItself, byPerson]) {
      const [payment] = await paymentsOf(inv.id);
      await db.transaction((tx) => repo.takeBack(tx, a, inv.id, payment!.id, { userId: randomUUID(), email: "boss@test.cz", reason: "noted by mistake" }));
    }
    expect(await repo.reopenAutoClosedDisputes(a, { all: true }, "Accounts Receivable (automatic)", "opened again")).toEqual([byItself.id]);
    expect(await receivableOf(byItself.id)).toMatchObject({ disputed: true, disputedReason: "the customer disputes the rate" });
    expect(await receivableOf(byPerson.id)).toMatchObject({ disputed: false });
    const [reopened] = await db.select().from(ev).where(and(eq(ev.invoiceId, byItself.id), eq(ev.action, "disputed"), eq(ev.by, "Accounts Receivable (automatic)")));
    expect(reopened).toMatchObject({ reason: "opened again", byUserId: null, payload: expect.objectContaining({ automatic: true, reopened: true }) });
    expect((await repo.notes(a, byItself.id)).map((x) => [x.kind, x.text])).toContainEqual(["dispute", "opened again (the customer disputes the rate)"]);

    // Once: open again, it is not opened twice; another company's are never touched.
    expect(await repo.reopenAutoClosedDisputes(a, { all: true }, "x", "opened again")).toEqual([]);
    expect(await repo.reopenAutoClosedDisputes(randomUUID(), { all: true }, "x", "opened again")).toEqual([]);
    // Paid again, it closes by itself again - and a later take-back opens it again with the person's reason, not the reopening's.
    await pay(a, byItself.id, "1210.00", { idempotencyKey: randomUUID() });
    expect(await repo.closeSettledDisputes(a, { invoiceIds: [byItself.id] }, "Accounts Receivable (automatic)", reason)).toEqual([byItself.id]);
    const live = (await paymentsOf(byItself.id)).find((x) => !x.takenBackAt)!;
    await db.transaction((tx) => repo.takeBack(tx, a, byItself.id, live.id, { userId: randomUUID(), email: "boss@test.cz", reason: "bounced" }));
    expect(await repo.reopenAutoClosedDisputes(a, { invoiceIds: [byItself.id] }, "x", "opened again")).toEqual([byItself.id]);
    expect(await receivableOf(byItself.id)).toMatchObject({ disputedReason: "the customer disputes the rate" });
  });
});

describe("reminder settings (step 7)", () => {
  it("reads the defaults until saved, then the saved ones; one row per company; the days checked", async () => {
    const a = randomUUID();
    expect(await repo.settingsOf(a)).toEqual({ autoReminders: false, reminder1Days: 7, reminder2Days: 21, replyTo: "", autoRemindersSince: null, updatedBy: "", updatedAt: null });
    const by = { updatedByUserId: randomUUID(), updatedBy: "boss@test.cz" };
    await repo.saveSettings(a, { autoReminders: true, reminder1Days: 5, reminder2Days: 15, replyTo: "ucetni@cto.cz", autoRemindersSince: "2026-11-19", ...by });
    expect(await repo.settingsOf(a)).toMatchObject({ autoReminders: true, autoRemindersSince: "2026-11-19" });
    await repo.saveSettings(a, { autoReminders: false, reminder1Days: 10, reminder2Days: 30, replyTo: "", autoRemindersSince: null, ...by });
    expect(await repo.settingsOf(a)).toMatchObject({ autoReminders: false, reminder1Days: 10, reminder2Days: 30, replyTo: "", autoRemindersSince: null, updatedBy: "boss@test.cz" });
    expect(await db.select().from(settingsT).where(eq(settingsT.companyId, a))).toHaveLength(1);
    await expect(repo.saveSettings(a, { autoReminders: false, reminder1Days: 10, reminder2Days: 10, replyTo: "", autoRemindersSince: null, ...by })).rejects.toThrow();
  });
});

describe("the reminder run's read (overdueOn with dueFrom, L2)", () => {
  it("reads only the owed invoices due on or after the day, before the day they are overdue on, the oldest due first", async () => {
    const a = randomUUID();
    const old = await issue(a, { dueDate: "2026-09-01" });
    const fromDay = await issue(a, { dueDate: "2026-10-19" });
    const later = await issue(a, { dueDate: "2026-11-10" });
    const notYet = await issue(a, { dueDate: "2026-11-30" });
    await repo.ensureRows(a, { all: true });
    const ids = (await repo.figures(a, { overdueOn: "2026-11-19", dueFrom: "2026-10-19" }, 10)).map((f) => f.invoice.id);
    expect(ids).toEqual([fromDay.id, later.id]);
    expect(ids).not.toContain(notYet.id);
    // Without the day: every overdue one, as the bell reads them.
    expect((await repo.figures(a, { overdueOn: "2026-11-19" }, 10)).map((f) => f.invoice.id)).toEqual([old.id, fromDay.id, later.id]);
  });
});
