import { describe, expect, it } from "vitest";
import {
  actionsFor,
  ALL_WAITS,
  base64Blob,
  batchCheck,
  batchCurrencyProblem,
  batchFailureText,
  batchIdempotencyKey,
  batchItems,
  blockedReasons,
  frozenBatchRows,
  isServerRefusal,
  mineWaitingText,
  paymentProblem,
  waitingSplit,
  batchSelectable,
  EMAIL_OFF_TEXT,
  eventDetail,
  eventLabel,
  leftToPaySum,
  lineState,
  mailLine,
  prunedSelection,
  receivablesCsv,
  statementSendAnswer,
  waitingText,
  waitingTotal,
  writeOffPrefill,
  writeOffProblem,
  writeOffRoom,
  type BatchLineInput,
  type ReceivableRow,
} from "./receivables";

// Step 7 of Accounts Receivable (18 Nov 2026): write-offs and bank charges (D13), one payment over several invoices,
// statements and the app's e-mails, and the Billing approvals count.

const row = (over: Partial<ReceivableRow> = {}): ReceivableRow => ({
  id: "inv-1",
  number: "INV2026CZLCL00000052-001",
  customerId: "c-beta",
  customer: "Beta Maschinenbau GmbH",
  shipmentId: "s-52",
  jobNumber: "CZLCL00000052",
  issueDate: "2026-11-10",
  duzp: "2026-11-09",
  dueDate: "2026-11-24",
  currency: "EUR",
  net: 2000,
  vat: 380,
  gross: 2380,
  grossCzk: 59500,
  credited: 0,
  paid: 0,
  writtenOff: 0,
  bankCharges: 0,
  leftToPay: 2380,
  status: "unpaid",
  marks: [],
  daysOverdue: 0,
  agingBucket: "current",
  paymentTerms: "14 days",
  promisedOn: null,
  disputed: false,
  reminderLevel: 0,
  lastRemindedOn: null,
  lastPaidOn: null,
  creditNoteNumbers: [],
  creditNotes: [],
  personInCharge: "",
  holidayCover: "",
  salesOwner: "",
  mine: false,
  myCustomer: false,
  issuedBy: "",
  version: 3,
  ...over,
});

const TODAY = "2026-11-18";

describe("write-offs and bank charges", () => {
  const lines = [
    { amount: 12, waiting: true },
    { amount: 100, waiting: false },
    { amount: 3.5, waiting: true },
  ];

  it("counts only what waits for a second manager", () => {
    expect(waitingTotal(lines)).toBe(15.5);
    expect(waitingTotal([])).toBe(0);
  });

  it("starts the amount at what is left less what waits", () => {
    expect(writeOffRoom(40, 15.5)).toBe(24.5);
    expect(writeOffPrefill(40, 15.5)).toBe("24.50");
    expect(writeOffPrefill(40, 0)).toBe("40.00");
    // Nothing left once what waits is counted: nothing to start with, never a negative figure.
    expect(writeOffRoom(10, 12)).toBe(0);
    expect(writeOffPrefill(10, 10)).toBe("");
  });

  it("refuses what the server refuses, with its words", () => {
    const base = { kind: "write_off" as const, amountText: "24.50", reason: "Customer short-paid", leftToPay: 40, waiting: 15.5, currency: "EUR" };
    expect(writeOffProblem(base)).toBe("");
    expect(writeOffProblem({ ...base, amountText: "24.51" })).toBe("More than is left to pay once what waits for a second manager is counted (24.50 EUR)");
    expect(writeOffProblem({ ...base, waiting: 0, amountText: "40.01" })).toBe("More than is left to pay (40.00 EUR)");
    expect(writeOffProblem({ ...base, waiting: 40 })).toBe(ALL_WAITS);
    expect(writeOffProblem({ ...base, reason: "no" })).toBe("Say why the write-off closes what is left (at least 3 characters)");
    expect(writeOffProblem({ ...base, kind: "bank_charge", amountText: "" })).toBe("Give the amount of the bank charge");
    expect(writeOffProblem({ ...base, amountText: "0" })).toBe("The amount must be above 0");
    expect(writeOffProblem({ ...base, amountText: "1.234" })).toBe("The amount must be a number with at most 2 decimals");
  });

  it("offers them to managers on an invoice still owed, and says why not when all of it waits", () => {
    const owed = row({ leftToPay: 40, status: "part_paid", paid: 2340 });
    expect(actionsFor(owed, true, false, 0).writeOff).toEqual({ shown: true, blocked: "" });
    expect(actionsFor(owed, true, false, 0).bankCharge).toEqual({ shown: true, blocked: "" });
    expect(actionsFor(owed, true, false, 40).writeOff).toEqual({ shown: true, blocked: ALL_WAITS });
    expect(actionsFor(owed, false, false, 0).writeOff.shown).toBe(false);
    expect(actionsFor(row({ status: "paid", leftToPay: 0 }), true, false).writeOff.shown).toBe(false);
    expect(actionsFor(row({ status: "written_off", leftToPay: 0 }), true, false).bankCharge.shown).toBe(false);
  });

  it("says where a line stands: waiting, confirmed, self-confirmed", () => {
    const line = { kind: "write_off" as const, waiting: false, confirmed: null, takenBack: null };
    expect(lineState({ ...line, waiting: true })).toBe("Waiting for a second manager");
    expect(lineState({ ...line, confirmed: { by: "eva@example.com", at: "2026-11-18T10:00:00Z", self: false } })).toBe("Confirmed by eva@example.com");
    expect(lineState({ ...line, kind: "bank_charge", confirmed: { by: "eva@example.com", at: "2026-11-18T10:00:00Z", self: true } })).toBe(
      "Confirmed by eva@example.com (self-confirmed: no other manager)",
    );
    expect(lineState({ ...line, kind: "payment" })).toBe("");
    expect(lineState({ ...line, waiting: true, takenBack: { by: "a", at: "b", reason: "c" } })).toBe("");
  });

  it("shows confirmed write-offs and bank charges in how Left to pay comes about", () => {
    expect(leftToPaySum(row({ paid: 2300, writtenOff: 68, bankCharges: 12 }))).toBe("2,380.00 − 2,300.00 paid − 68.00 written off − 12.00 bank charges");
  });

  it("names their events, a bank charge as one", () => {
    expect(eventLabel({ action: "write_off_noted", payload: { kind: "write_off" } })).toBe("Write-off noted");
    expect(eventLabel({ action: "write_off_confirmed", payload: { kind: "bank_charge" } })).toBe("Bank charge confirmed");
    expect(eventLabel({ action: "reminded", payload: { automatic: true } })).toBe("Reminder e-mailed by the app");
    expect(eventDetail({ action: "write_off_confirmed", payload: { amount: 12, selfConfirmed: true } }, "EUR")).toBe("12.00 EUR · self-confirmed: no other manager");
    expect(eventDetail({ action: "payment_noted", payload: { amount: 100, paidOn: "2026-11-17", bankRef: "VS 2026052", invoices: 3 } }, "EUR")).toBe(
      "100.00 EUR · paid on 17.11.2026 · bank reference VS 2026052 · one payment over 3 invoices",
    );
  });

  it("exports what was written off and kept as bank charges", () => {
    const csv = receivablesCsv([row({ writtenOff: 68, bankCharges: 12 })]);
    const col = (name: string) => csv[0]!.indexOf(name);
    expect(csv[1]![col("Written off")]).toBe("68.00");
    expect(csv[1]![col("Bank charges")]).toBe("12.00");
    expect(csv.every((l) => l.length === csv[0]!.length)).toBe(true);
  });
});

describe("one payment over several invoices", () => {
  const a = row({ id: "a", number: "INV-A", leftToPay: 1000, currency: "EUR" });
  const b = row({ id: "b", number: "INV-B", leftToPay: 250.5, currency: "EUR", status: "part_paid", paid: 50 });
  const line = (r: ReceivableRow, amountText: string): BatchLineInput => ({ row: r, amountText });

  it("ticks only invoices still owed", () => {
    expect(batchSelectable(a)).toBe(true);
    expect(batchSelectable(row({ status: "paid", leftToPay: 0 }))).toBe(false);
    expect(batchSelectable(row({ status: "paid", leftToPay: -20, marks: ["to_refund"] }))).toBe(false);
    expect(prunedSelection(["a", "gone", "p"], [a, row({ id: "p", status: "paid", leftToPay: 0 })])).toEqual(["a"]);
  });

  it("adds the amounts up in the one currency", () => {
    const c = batchCheck({ day: TODAY, today: TODAY, lines: [line(a, "1000"), line(b, "250.50")] });
    expect(c).toEqual({ problem: "", lines: { a: "", b: "" }, sum: 1250.5, currency: "EUR" });
  });

  it("refuses invoices in more than one currency", () => {
    expect(batchCurrencyProblem(["EUR", "CZK", "EUR"])).toBe("One payment is in one currency: these invoices are in CZK and EUR. Tick invoices of one currency.");
    expect(batchCurrencyProblem(["EUR", "EUR"])).toBe("");
    const c = batchCheck({ day: TODAY, today: TODAY, lines: [line(a, "1000"), line(row({ id: "c", currency: "CZK" }), "10")] });
    expect(c.problem).toMatch(/^One payment is in one currency/);
    // No sum is named across currencies.
    expect(c.currency).toBe("");
  });

  it("holds each amount to what is left to pay on its invoice", () => {
    const c = batchCheck({ day: TODAY, today: TODAY, lines: [line(a, "1000"), line(b, "250.51")] });
    expect(c.lines.b).toBe("More than is left to pay (250.50 EUR)");
    expect(c.problem).toBe("Invoice INV-B: More than is left to pay (250.50 EUR)");
    expect(batchCheck({ day: TODAY, today: TODAY, lines: [line(a, "")] }).lines.a).toBe("Give the amount");
    expect(batchCheck({ day: TODAY, today: TODAY, lines: [line(a, "0")] }).lines.a).toBe("Above 0");
  });

  it("checks the day as the server does, a prepayment invoice paid before it was issued too", () => {
    expect(batchCheck({ day: "2026-11-19", today: TODAY, lines: [line(a, "1")] }).problem).toBe("The day it was paid cannot be after today");
    expect(batchCheck({ day: "", today: TODAY, lines: [line(a, "1")] }).problem).toBe("Pick the day it was paid");
    expect(batchCheck({ day: "2026-11-09", today: TODAY, lines: [line(a, "1")] }).problem).toBe("The day it was paid cannot be before invoice INV-A was issued (10.11.2026)");
    expect(batchCheck({ day: "2026-11-09", today: TODAY, lines: [line(row({ id: "p", marks: ["prepayment"] }), "1")] }).problem).toBe("");
    expect(batchCheck({ day: TODAY, today: TODAY, lines: [] }).problem).toBe("Tick at least one invoice the payment pays");
  });

  it("sends one key per day and set of amounts, whatever the order", () => {
    const keys = new Map<string, string>();
    let n = 0;
    const make = () => `k${++n}`;
    const first = batchIdempotencyKey(keys, TODAY, [{ invoiceId: "a", amount: 1000 }, { invoiceId: "b", amount: 250.5 }], make);
    expect(batchIdempotencyKey(keys, TODAY, [{ invoiceId: "b", amount: 250.5 }, { invoiceId: "a", amount: 1000 }], make)).toBe(first);
    expect(batchIdempotencyKey(keys, TODAY, [{ invoiceId: "a", amount: 1000 }, { invoiceId: "b", amount: 250 }], make)).not.toBe(first);
    expect(batchIdempotencyKey(keys, "2026-11-17", [{ invoiceId: "a", amount: 1000 }, { invoiceId: "b", amount: 250.5 }], make)).not.toBe(first);
  });
});

describe("statements and the app's e-mails", () => {
  it("never says a statement was sent unless the server says so", () => {
    expect(statementSendAnswer({ status: "sent", message: "The statement was e-mailed to ap@beta.de" })).toEqual({ tone: "success", text: "The statement was e-mailed to ap@beta.de" });
    const off = statementSendAnswer({ status: "off", message: "whatever" });
    expect(off.tone).toBe("warning");
    expect(off.text.startsWith(EMAIL_OFF_TEXT)).toBe(true);
    expect(off.text).toContain("not sent");
    expect(statementSendAnswer({ status: "failed", message: "No contact with an e-mail" })).toEqual({ tone: "error", text: "The statement was not sent: No contact with an e-mail" });
  });

  it("turns the server's base64 into the file's bytes", async () => {
    const blob = base64Blob(btoa("a;b\n1;2"), "text/csv; charset=utf-8");
    expect(blob.type).toBe("text/csv; charset=utf-8");
    expect(await blob.text()).toBe("a;b\n1;2");
  });

  it("says of each e-mail what it was, whether it went, to whom and by whom", () => {
    const base = { kind: "reminder" as const, reminderLevel: 1, status: "sent" as const, recipient: "ap@beta.de", automatic: true, by: "Accounts Receivable (automatic)", currency: "EUR", error: "" };
    expect(mailLine(base)).toEqual({ title: "Reminder 1 e-mailed", detail: "to ap@beta.de · automatic", failed: false });
    expect(mailLine({ ...base, reminderLevel: 3, automatic: false, by: "eva@example.com", status: "failed", error: "Mailbox full" })).toEqual({
      title: "Final notice not sent",
      detail: "to ap@beta.de · by eva@example.com · why: Mailbox full",
      failed: true,
    });
    expect(mailLine({ ...base, kind: "statement", reminderLevel: null }).title).toBe("Statement (EUR) e-mailed");
  });
});

describe("Billing approvals", () => {
  it("counts what waits for a second manager, in words", () => {
    expect(waitingText([{ kind: "write_off" }])).toBe("1 write-off waits for a second manager");
    expect(waitingText([{ kind: "write_off" }, { kind: "write_off" }])).toBe("2 write-offs wait for a second manager");
    expect(waitingText([{ kind: "bank_charge" }])).toBe("1 bank charge waits for a second manager");
    expect(waitingText([{ kind: "bank_charge" }, { kind: "write_off" }])).toBe("2 write-offs and bank charges wait for a second manager");
  });
});

describe("review fixes (step 7)", () => {
  it("freezes the batch's invoices when the dialog opens: a list read again changes nothing it sends", () => {
    const listed = [row({ id: "a", version: 3, leftToPay: 1000 }), row({ id: "b", version: 7, leftToPay: 250.5 })];
    const frozen = frozenBatchRows(listed);
    // The list read again meanwhile: a new version, less left, an invoice gone.
    listed[0]!.version = 4;
    listed[0]!.leftToPay = 10;
    listed.pop();
    expect(frozen.map((r) => [r.id, r.version, r.leftToPay])).toEqual([
      ["a", 3, 1000],
      ["b", 7, 250.5],
    ]);
    expect(batchItems(frozen, { a: "1000", b: "250.50" })).toEqual([
      { invoiceId: "a", version: 3, amount: 1000 },
      { invoiceId: "b", version: 7, amount: 250.5 },
    ]);
  });

  it("replays one key for an opening, re-keyed only by another day or amount", () => {
    const keys = new Map<string, string>();
    let n = 0;
    const make = () => `k${++n}`;
    const items = batchItems(frozenBatchRows([row({ id: "a", version: 3 }), row({ id: "b", version: 7 })]), { a: "100", b: "20" });
    const first = batchIdempotencyKey(keys, TODAY, items, make);
    // A retry after a lost answer: the same frozen items, the same key.
    expect(batchIdempotencyKey(keys, TODAY, items, make)).toBe(first);
    // An amount edited, then put back: a new key, then the first again (as the single payment form does).
    const edited = batchIdempotencyKey(keys, TODAY, [items[0]!, { ...items[1]!, amount: 21 }], make);
    expect(edited).not.toBe(first);
    expect(batchIdempotencyKey(keys, TODAY, items, make)).toBe(first);
    // A version the manager did not see is never sent under the same key.
    expect(batchIdempotencyKey(keys, TODAY, [{ ...items[0]!, version: 4 }, items[1]!], make)).not.toBe(first);
  });

  it("says nothing was noted only when the server refused, else that it may have been noted", () => {
    const refusal = Object.assign(new Error("Invoice INV-A changed meanwhile: open it again"), { code: "failed_precondition" });
    expect(isServerRefusal(refusal)).toBe(true);
    expect(batchFailureText(refusal)).toEqual({ refused: true, text: "Nothing was noted: Invoice INV-A changed meanwhile: open it again" });
    const lost = "The payment may have been noted: check the invoices before trying again";
    expect(batchFailureText(new TypeError("Failed to fetch"))).toEqual({ refused: false, text: lost });
    expect(batchFailureText(Object.assign(new Error("request failed: status 502"), { code: "unknown" })).text).toBe(lost);
    expect(batchFailureText(Object.assign(new Error("internal error"), { code: "internal" })).text).toBe(lost);
    expect(batchFailureText(Object.assign(new Error("deadline"), { code: "deadline_exceeded" })).text).toBe(lost);
    expect(batchFailureText(undefined).text).toBe(lost);
  });

  it("lets the drawer note a prepayment invoice paid before it was issued, never after today", () => {
    const base = { day: "2026-11-05", amountText: "100", today: TODAY, issueDate: "2026-11-10", leftToPay: 2380, currency: "EUR" };
    expect(paymentProblem(base)).toBe("The day it was paid cannot be before the invoice was issued (10.11.2026)");
    expect(paymentProblem({ ...base, prepayment: true })).toBe("");
    expect(paymentProblem({ ...base, prepayment: true, day: "2026-11-19" })).toBe("The day it was paid cannot be after today");
  });

  it("writes out each disabled action's reason once, with the buttons it holds back", () => {
    const can = actionsFor(row({ leftToPay: 40, status: "part_paid", paid: 2340, disputed: true }), true, false, 40);
    expect(
      blockedReasons([
        { state: can.notePayment, label: "Note a payment…" },
        { state: can.writeOff, label: "Write off…" },
        { state: can.bankCharge, label: "Bank charge…" },
        { state: can.reminder, label: "Send a reminder…" },
      ]),
    ).toEqual([
      { text: ALL_WAITS, labels: ["Write off…", "Bank charge…"] },
      { text: "The customer disputes it: close the dispute before sending a reminder (D16)", labels: ["Send a reminder…"] },
    ]);
  });

  it("counts only the write-offs the manager can confirm, and theirs apart", () => {
    const lines = [
      { canConfirm: true, by: "petr@example.com" },
      { canConfirm: false, by: "Eva@Example.com" },
      { canConfirm: true, by: "jana@example.com" },
      { canConfirm: false, by: "someone@example.com" },
    ];
    const split = waitingSplit(lines, "eva@example.com");
    expect(split.confirmable).toHaveLength(2);
    expect(split.mine).toEqual([{ canConfirm: false, by: "Eva@Example.com" }]);
    expect(waitingSplit(lines, null).mine).toHaveLength(2);
    expect(mineWaitingText(1)).toBe("1 of yours waits for another manager");
    expect(mineWaitingText(3)).toBe("3 of yours wait for another manager");
  });
});
