import { describe, expect, it } from "vitest";
import {
  actionsFor,
  amountText,
  customerMatches,
  customerOptions,
  customersCsv,
  emptyText,
  eventDetail,
  fullAmountText,
  inTab,
  isDueThisWeek,
  isOverLimit,
  isOver60,
  issuerName,
  leftToPaySum,
  limitStates,
  matchesFilters,
  myCustomerIdsOf,
  newIdempotencyKey,
  nextReminderLevel,
  NO_FILTERS,
  NO_REMINDER_CONTACT,
  LIST_CELL_CLASS,
  LIST_CELL_PADDING,
  LIST_EXPAND_WIDTH,
  LIST_ROOM,
  LIST_TICK_WIDTH,
  LIST_WIDTHS,
  listAmountText,
  JOB_SHOWN,
  NUMBER_SHOWN,
  paidText,
  passesCheck,
  paymentIdempotencyKey,
  paymentProblem,
  receivablesCsv,
  reminderLevels,
  reminderMail,
  REMINDERS_CANNOT_GO_OUT,
  remindersBlocked,
  shortInvoiceNumber,
  shortJobNumber,
  tabCount,
  tileCheckToggles,
  visibleTabs,
  type ReceivableCheck,
  type ReceivableCounts,
  type ReceivableCustomer,
  type ReceivableRow,
  type ReceivableTab,
} from "./receivables";
import { RECEIVABLE_DEFAULT_COLUMNS } from "./receivableColumns";

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
  personInCharge: "jana@example.com",
  holidayCover: "",
  salesOwner: "petr@example.com",
  mine: false,
  myCustomer: false,
  issuedBy: "libor@example.com",
  version: 1,
  ...over,
});

const customer = (over: Partial<ReceivableCustomer> = {}): ReceivableCustomer => ({
  customerId: "c-zeta",
  customer: "Zeta Logistik s.r.o.",
  salesOwner: "eva@example.com",
  currency: "CZK",
  unpaid: 184200,
  current: 0,
  d1to30: 60500,
  d31to60: 91200,
  d61to90: 32500,
  d90plus: 0,
  oldestDue: "2026-09-08",
  invoices: 4,
  creditLimit: 0,
  creditCurrency: "",
  ...over,
});

const TODAY = "2026-11-18";

describe("the tabs", () => {
  const unpaid = row();
  const partPaid = row({ status: "part_paid", paid: 20000, leftToPay: 16300 });
  const overdue = row({ marks: ["overdue"], daysOverdue: 15, dueDate: "2026-11-03" });
  const paid = row({ status: "paid", paid: 2380, leftToPay: 0, agingBucket: null });
  const refund = row({ status: "paid", paid: 2380, credited: 476, leftToPay: -476, marks: ["to_refund"], agingBucket: null });
  const credited = row({ status: "credited", credited: 2380, leftToPay: 0, agingBucket: null });
  const cancelled = row({ status: "cancelled", leftToPay: 0, agingBucket: null });
  const promised = row({ marks: ["promised"], promisedOn: "2026-11-25" });
  const disputed = row({ marks: ["disputed"], disputed: true });

  it("lists in Unpaid every invoice still owed, part paid ones too, and not one to refund", () => {
    expect([unpaid, partPaid, overdue, promised, disputed].every((r) => inTab(r, "unpaid"))).toBe(true);
    expect([paid, refund, credited, cancelled].some((r) => inTab(r, "unpaid"))).toBe(false);
  });

  it("puts each invoice in the tabs the server counts it in", () => {
    expect(inTab(overdue, "overdue")).toBe(true);
    expect(inTab(unpaid, "overdue")).toBe(false);
    expect(inTab(paid, "paid")).toBe(true);
    expect(inTab(refund, "paid")).toBe(true);
    expect(inTab(credited, "credited")).toBe(true);
    expect(inTab(cancelled, "credited")).toBe(true);
    expect(inTab(paid, "credited")).toBe(false);
    expect(inTab(promised, "promised")).toBe(true);
    expect(inTab(disputed, "disputed")).toBe(true);
    expect(inTab(cancelled, "all")).toBe(true);
    // By customer lists customers, not invoices.
    expect(inTab(unpaid, "customers")).toBe(false);
  });

  it("takes each tab's count from the server", () => {
    const counts: ReceivableCounts = { unpaid: 31, overdue: 5, paid: 170, writtenOff: 2, creditedCancelled: 13, all: 214, promised: 2, disputed: 1, byCustomer: 12 };
    expect(tabCount("unpaid", counts)).toBe(31);
    expect(tabCount("credited", counts)).toBe(13);
    expect(tabCount("written_off", counts)).toBe(2);
    expect(tabCount("customers", counts)).toBe(12);
  });

  it("keeps a written-off invoice in its own tab, never in Paid nor in Credited & cancelled", () => {
    const writtenOff = row({ status: "written_off", writtenOff: 2380, leftToPay: 0, agingBucket: null });
    expect(inTab(writtenOff, "written_off")).toBe(true);
    expect(inTab(writtenOff, "all")).toBe(true);
    expect(["unpaid", "overdue", "paid", "credited", "customers"].some((t) => inTab(writtenOff, t as ReceivableTab))).toBe(false);
    expect(inTab(paid, "written_off")).toBe(false);
    expect(inTab(credited, "written_off")).toBe(false);
    expect(emptyText({ tab: "written_off", period: "90d", filtered: false, loading: false, failed: false })).toBe("No written-off invoice issued in the last 90 days.");
  });

  it("shows the Written off tab only when an invoice is written off, or while it is open", () => {
    const base: ReceivableCounts = { unpaid: 1, overdue: 0, paid: 0, writtenOff: 0, creditedCancelled: 0, all: 1, promised: 0, disputed: 0, byCustomer: 1 };
    const keys = (counts: ReceivableCounts | undefined, active: ReceivableTab) => visibleTabs(counts, active).map((t) => t.key);
    expect(keys(base, "unpaid")).not.toContain("written_off");
    expect(keys(undefined, "unpaid")).not.toContain("written_off");
    expect(keys(base, "written_off")).toContain("written_off");
    const shown = keys({ ...base, writtenOff: 1 }, "unpaid");
    // After Credited & cancelled, before All.
    expect(shown.indexOf("written_off")).toBe(shown.indexOf("credited") + 1);
    expect(shown.indexOf("all")).toBe(shown.indexOf("written_off") + 1);
  });

  it("says why the table is empty, the failure first", () => {
    expect(emptyText({ tab: "unpaid", period: "90d", filtered: true, loading: true, failed: true })).toBe("Could not load the customer invoices.");
    expect(emptyText({ tab: "unpaid", period: "90d", filtered: true, loading: true, failed: false })).toBe("Loading the invoices…");
    expect(emptyText({ tab: "unpaid", period: "90d", filtered: true, loading: false, failed: false })).toBe("Nothing matches these filters.");
    expect(emptyText({ tab: "paid", period: "12m", filtered: false, loading: false, failed: false })).toBe("No paid invoice issued in the last 12 months.");
  });
});

describe("the bar's filters", () => {
  it("finds an invoice by its customer, number, job and the numbers of its credit notes", () => {
    const r = row({ creditNoteNumbers: ["CN2026CZLCL00000052-001"] });
    for (const search of ["beta", "INV2026CZLCL00000052", "czlcl00000052", "CN2026CZLCL00000052-001", "beta 052-001"]) {
      expect(matchesFilters(r, { ...NO_FILTERS, search })).toBe(true);
    }
    expect(matchesFilters(r, { ...NO_FILTERS, search: "CN2026CZFCL" })).toBe(false);
    expect(matchesFilters(row(), { ...NO_FILTERS, search: "CN2026" })).toBe(false);
  });

  it("keeps My jobs, My customers and the customer", () => {
    expect(matchesFilters(row({ mine: true }), { ...NO_FILTERS, mine: true })).toBe(true);
    expect(matchesFilters(row(), { ...NO_FILTERS, mine: true })).toBe(false);
    expect(matchesFilters(row({ myCustomer: true }), { ...NO_FILTERS, myCustomers: true })).toBe(true);
    expect(matchesFilters(row({ mine: true }), { ...NO_FILTERS, myCustomers: true })).toBe(false);
    expect(matchesFilters(row(), { ...NO_FILTERS, customerId: "c-beta" })).toBe(true);
    expect(matchesFilters(row(), { ...NO_FILTERS, customerId: "c-alfa" })).toBe(false);
  });

  it("narrows By customer by the customer, its name or Sales Owner, and My customers - not by My jobs", () => {
    const mine = myCustomerIdsOf([row({ customerId: "c-zeta", myCustomer: true }), row()]);
    expect([...mine]).toEqual(["c-zeta"]);
    const zeta = customer();
    expect(customerMatches(zeta, { ...NO_FILTERS, myCustomers: true }, mine)).toBe(true);
    expect(customerMatches(customer({ customerId: "c-beta" }), { ...NO_FILTERS, myCustomers: true }, mine)).toBe(false);
    expect(customerMatches(zeta, { ...NO_FILTERS, search: "eva" }, mine)).toBe(true);
    expect(customerMatches(zeta, { ...NO_FILTERS, mine: true }, new Set())).toBe(true);
    expect(customerMatches(zeta, { ...NO_FILTERS, customerId: "c-beta" }, mine)).toBe(false);
  });

  it("offers each customer once, by name", () => {
    expect(customerOptions([row(), row({ id: "inv-2" }), row({ customerId: "c-alfa", customer: "Alfa Trading s.r.o." })], [customer()])).toEqual([
      { value: "c-alfa", label: "Alfa Trading s.r.o." },
      { value: "c-beta", label: "Beta Maschinenbau GmbH" },
      { value: "c-zeta", label: "Zeta Logistik s.r.o." },
    ]);
  });

  it("checks due this week and over 60 days as the tiles count them", () => {
    expect(isDueThisWeek(row({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDueThisWeek(row({ dueDate: "2026-11-25" }), TODAY)).toBe(true);
    expect(isDueThisWeek(row({ dueDate: "2026-11-26" }), TODAY)).toBe(false);
    expect(isDueThisWeek(row({ dueDate: "2026-11-17" }), TODAY)).toBe(false);
    expect(isDueThisWeek(row({ dueDate: TODAY, status: "paid", leftToPay: 0 }), TODAY)).toBe(false);
    expect(isOver60(row({ daysOverdue: 61 }))).toBe(true);
    expect(isOver60(row({ daysOverdue: 60 }))).toBe(false);
    expect(passesCheck(row({ marks: ["prepayment"] }), "prepayment", TODAY)).toBe(true);
    expect(passesCheck(row({ marks: ["to_refund"] }), "to_refund", TODAY)).toBe(true);
    expect(passesCheck(row(), "to_refund", TODAY)).toBe(false);
  });

  it("lets a tile take off another tile's check, so Over 60 days then Due this week lists what Due this week counts", () => {
    const on = (...checks: ReceivableCheck[]) => (c: ReceivableCheck) => checks.includes(c);
    // Over 60 days is on from its tile: Due this week takes it off and puts its own on.
    expect(tileCheckToggles(on("over_60"), "due_week").sort()).toEqual(["due_week", "over_60"]);
    // Its own check on already: nothing to switch, never taken off by a second click.
    expect(tileCheckToggles(on("due_week"), "due_week")).toEqual([]);
    // A tile with no check of its own (To collect, Overdue) takes the tiles' checks off.
    expect(tileCheckToggles(on("due_week", "over_60"), null).sort()).toEqual(["due_week", "over_60"]);
    // Checks no tile puts on stay as the user set them.
    expect(tileCheckToggles(on("prepayment", "to_refund"), "over_60")).toEqual(["over_60"]);
  });
});

describe("Over limit", () => {
  const rates = { CZK: 1, EUR: 25 };

  it("compares what the customer owes in all its currencies, converted, with its limit", () => {
    const rows = [
      customer({ customerId: "c-1", currency: "CZK", unpaid: 150000, creditLimit: 200000, creditCurrency: "CZK" }),
      customer({ customerId: "c-1", currency: "EUR", unpaid: 3000, creditLimit: 200000, creditCurrency: "CZK" }),
    ];
    const s = limitStates(rows, rates).get("c-1")!;
    expect(s.owed).toBe(225000);
    expect(isOverLimit(s)).toBe(true);
    expect(isOverLimit(limitStates([rows[0]!], rates).get("c-1"))).toBe(false);
  });

  it("needs no rate for the limit's own currency, and none for a customer without a limit", () => {
    const eur = limitStates([customer({ currency: "EUR", unpaid: 12000, creditLimit: 10000, creditCurrency: "EUR" })], { CZK: 1 });
    expect(isOverLimit(eur.get("c-zeta"))).toBe(true);
    expect(limitStates([customer({ creditLimit: 0, creditCurrency: "CZK" })], rates).size).toBe(0);
    expect(limitStates([customer({ creditLimit: 1000, creditCurrency: "" })], rates).size).toBe(0);
  });

  it("shows no mark when what could not be converted might decide it", () => {
    const rows = [
      customer({ customerId: "c-2", currency: "CZK", unpaid: 150000, creditLimit: 200000, creditCurrency: "CZK" }),
      customer({ customerId: "c-2", currency: "USD", unpaid: 5000, creditLimit: 200000, creditCurrency: "CZK" }),
    ];
    const s = limitStates(rows, rates).get("c-2")!;
    expect(s.unconverted).toEqual([{ currency: "USD", amount: 5000 }]);
    expect(isOverLimit(s)).toBe(false);
    // Above the limit already without it: over, whatever the rest is.
    const over = limitStates([{ ...rows[0]!, unpaid: 250000 }, rows[1]!], rates).get("c-2")!;
    expect(isOverLimit(over)).toBe(true);
  });

  it("is not over at exactly the limit", () => {
    expect(isOverLimit(limitStates([customer({ unpaid: 200000, creditLimit: 200000, creditCurrency: "CZK" })], rates).get("c-zeta"))).toBe(false);
  });
});

describe("the CSV", () => {
  it("writes one line per document: the invoice, then each of its credit notes", () => {
    const r = row({
      credited: 476,
      leftToPay: 1904,
      marks: ["part_credited"],
      creditNoteNumbers: ["CN2026CZLCL00000052-001", "CN2026CZLCL00000052-002"],
      creditNotes: [
        { number: "CN2026CZLCL00000052-001", issueDate: "2026-11-14", gross: -276, issuedBy: "eva@example.com", issuedByName: "Eva Nová" },
        { number: "CN2026CZLCL00000052-002", issueDate: "2026-11-16", gross: -200, issuedBy: "", issuedByName: "" },
      ],
    });
    const csv = receivablesCsv([r, row({ id: "inv-2", number: "INV2026CZFCL00000014-001" })]);
    const head = csv[0]!;
    const col = (name: string) => head.indexOf(name);
    expect(csv).toHaveLength(5);
    expect(csv.map((l) => l[col("Document")])).toEqual(["Document", "Invoice", "Credit note", "Credit note", "Invoice"]);
    const invoice = csv[1]!;
    expect(invoice[col("Amount with VAT")]).toBe("2380.00");
    expect(invoice[col("Credited")]).toBe("476.00");
    expect(invoice[col("Left to pay")]).toBe("1904.00");
    expect(invoice[col("Status")]).toBe("Unpaid");
    expect(invoice[col("Marks")]).toBe("Part credited");
    const note = csv[2]!;
    expect(note[col("Number")]).toBe("CN2026CZLCL00000052-001");
    expect(note[col("Corrects invoice")]).toBe(r.number);
    expect(note[col("Currency")]).toBe("EUR");
    // The credit note's own day and amount (negative, with VAT); the invoice's Credited holds them all.
    expect(note[col("Issued")]).toBe("2026-11-14");
    expect(note[col("Amount with VAT")]).toBe("-276.00");
    expect(note[col("Credited")]).toBe("");
    // Who issued each document (the e-mail, as the invoice's line has it; blank when not known).
    expect(invoice[col("Issued by")]).toBe("libor@example.com");
    expect(note[col("Issued by")]).toBe("eva@example.com");
    expect(csv[3]![col("Issued by")]).toBe("");
    expect(csv.every((l) => l.length === head.length)).toBe(true);
  });

  it("says a carried-over payment's day is not known", () => {
    const csv = receivablesCsv([row({ status: "paid", paid: 2380, leftToPay: 0, lastPaidOn: null })]);
    expect(csv[1]![csv[0]!.indexOf("Last paid on")]).toBe("day not known");
  });

  it("writes By customer with its aging and the Over limit mark", () => {
    const c = customer({ creditLimit: 150000, creditCurrency: "CZK" });
    const csv = customersCsv([c], limitStates([c], { CZK: 1 }));
    expect(csv[1]).toEqual(["Zeta Logistik s.r.o.", "eva@example.com", "CZK", "184200.00", "0.00", "60500.00", "91200.00", "32500.00", "0.00", "2026-09-08", "4", "150000.00 CZK", "Over limit"]);
  });
});

describe("the drawer", () => {
  it("names who issued a credit note: the name, else the e-mail, else nothing (D25)", () => {
    expect(issuerName({ issuedBy: "eva@example.com", issuedByName: "Eva Nová" })).toBe("Eva Nová");
    expect(issuerName({ issuedBy: "eva@example.com", issuedByName: "" })).toBe("eva@example.com");
    expect(issuerName({ issuedBy: "", issuedByName: "" })).toBe("");
  });

  it("offers a payment to managers only, on an invoice still owed", () => {
    expect(actionsFor(row(), true, false).notePayment).toEqual({ shown: true, blocked: "" });
    expect(actionsFor(row(), false, false).notePayment.shown).toBe(false);
    expect(actionsFor(row({ status: "paid", leftToPay: 0 }), true, false).notePayment.shown).toBe(false);
    expect(actionsFor(row({ status: "credited", leftToPay: 0 }), true, false).notePayment.shown).toBe(false);
  });

  it("keeps reminders off a disputed invoice, and dispute and its end apart", () => {
    const disputed = actionsFor(row({ disputed: true }), false, false);
    expect(disputed.reminder.blocked).toContain("close the dispute");
    expect(disputed.dispute.shown).toBe(false);
    expect(disputed.closeDispute.shown).toBe(true);
    const plain = actionsFor(row(), false, false);
    expect(plain.reminder).toEqual({ shown: true, blocked: "" });
    expect(plain.closeDispute.shown).toBe(false);
    expect(actionsFor(row({ status: "paid", leftToPay: 0 }), false, false).promise.shown).toBe(false);
  });

  it("offers Send again to managers when a hand-over failed", () => {
    expect(actionsFor(row(), true, true).sendAgain.shown).toBe(true);
    expect(actionsFor(row(), false, true).sendAgain.shown).toBe(false);
    expect(actionsFor(row(), true, false).sendAgain.shown).toBe(false);
  });

  it("leaves the final notice to managers", () => {
    expect(reminderLevels(false)).toEqual([1, 2]);
    expect(reminderLevels(true)).toEqual([1, 2, 3]);
    expect(nextReminderLevel(0, false)).toBe(1);
    expect(nextReminderLevel(1, false)).toBe(2);
    expect(nextReminderLevel(2, false)).toBe(2);
    expect(nextReminderLevel(2, true)).toBe(3);
    expect(nextReminderLevel(3, true)).toBe(3);
  });

  it("checks the payment as the server does: the day, then the amount", () => {
    const base = { day: TODAY, amountText: "2380.00", today: TODAY, issueDate: "2026-11-10", leftToPay: 2380, currency: "EUR" };
    expect(paymentProblem(base)).toBe("");
    expect(paymentProblem({ ...base, amountText: "1 000,50" })).toBe("");
    expect(paymentProblem({ ...base, day: "" })).toBe("Pick the day it was paid");
    expect(paymentProblem({ ...base, day: "2026-11-19" })).toBe("The day it was paid cannot be after today");
    expect(paymentProblem({ ...base, day: "2026-11-09" })).toContain("before the invoice was issued");
    expect(paymentProblem({ ...base, amountText: "" })).toBe("Give the amount paid");
    expect(paymentProblem({ ...base, amountText: "12,345.678" })).toContain("at most 2 decimals");
    expect(paymentProblem({ ...base, amountText: "0" })).toBe("The amount must be above 0");
    expect(paymentProblem({ ...base, amountText: "2380.01" })).toBe("More than is left to pay (2380.00 EUR)");
    expect(fullAmountText(16300)).toBe("16300.00");
    expect(fullAmountText(-476)).toBe("");
  });

  it("makes a new key each time", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^ar-payment:/);
    expect(newIdempotencyKey()).not.toBe(a);
  });

  it("sends the same key only for the same day and amount, so a changed payment is never taken for the first", () => {
    let n = 0;
    const make = () => `k${++n}`;
    const keys = new Map<string, string>();
    const first = paymentIdempotencyKey(keys, "2026-11-18", 1450, make);
    // A retry after a lost answer, or a double click: the same payment.
    expect(paymentIdempotencyKey(keys, "2026-11-18", 1450, make)).toBe(first);
    expect(paymentIdempotencyKey(keys, "2026-11-18", 1450.0, make)).toBe(first);
    // Another amount or another day: another payment.
    const otherAmount = paymentIdempotencyKey(keys, "2026-11-18", 1000, make);
    const otherDay = paymentIdempotencyKey(keys, "2026-11-17", 1450, make);
    expect(new Set([first, otherAmount, otherDay]).size).toBe(3);
    // Back to the first values: the first payment's key again, so it is not noted twice.
    expect(paymentIdempotencyKey(keys, "2026-11-18", 1450, make)).toBe(first);
    // A form opened again starts with no keys.
    expect(paymentIdempotencyKey(new Map(), "2026-11-18", 1450, make)).not.toBe(first);
  });

  it("fills the reminder's subject and text, and names the final notice", () => {
    const r = row({ daysOverdue: 15, dueDate: "2026-11-03", leftToPay: 48400, currency: "CZK" });
    expect(reminderMail(r, 1).subject).toBe("Payment reminder: invoice INV2026CZLCL00000052-001 (CZLCL00000052)");
    expect(reminderMail(r, 3).subject).toMatch(/^Final notice: /);
    expect(reminderMail(r, 1).message).toContain("was due on 03.11.2026, 15 days ago. 48,400.00 CZK is still left to pay.");
  });

  it("writes Left to pay as its sum, and the Paid column with its day", () => {
    expect(leftToPaySum(row({ gross: 36300, paid: 20000 }))).toBe("36,300.00 − 20,000.00 paid");
    expect(leftToPaySum(row({ credited: 476 }))).toBe("2,380.00 − 476.00 credited");
    expect(paidText(row({ paid: 20000, lastPaidOn: "2026-11-14" }))).toBe("20,000.00 EUR · 14.11.2026");
    expect(paidText(row({ paid: 2380, lastPaidOn: null }))).toBe("2,380.00 EUR · day not known");
    expect(paidText(row())).toBe("");
    expect(amountText(-476, "EUR")).toBe("−476.00 EUR");
  });

  it("says what a history event changed", () => {
    expect(eventDetail({ action: "payment_noted", payload: { paidOn: "2026-11-14", amount: 20000 } }, "CZK")).toBe("20,000.00 CZK · paid on 14.11.2026");
    expect(eventDetail({ action: "reminded", payload: { level: 3, recipient: "ucetni@gama.cz" } }, "CZK")).toBe("Final notice to ucetni@gama.cz");
    expect(eventDetail({ action: "promised", payload: { promisedOn: "2026-11-25" } }, "CZK")).toBe("to pay by 25.11.2026");
    expect(eventDetail({ action: "note_added", payload: {} }, "CZK")).toBe("");
  });
});

describe("the list's invoice number (A5)", () => {
  it("shortens a long number in its middle, keeping its document, year and sequence", () => {
    expect(shortInvoiceNumber("INV2026CZFCL00000062-001")).toBe("INV2026…0062-001");
    expect(shortInvoiceNumber("INV2026CZ00000053-002")).toBe("INV2026…0053-002");
    expect(shortInvoiceNumber("INV2026CZ00000053-002")).toHaveLength(NUMBER_SHOWN);
    // A short one (the old format) is shown whole.
    expect(shortInvoiceNumber("CZ00000028-001")).toBe("CZ00000028-001");
    expect(shortInvoiceNumber("")).toBe("");
  });

  it("fits all ten first columns in a 1440 px screen with the menu, the tick box and the expand arrow, Issued too (mock test S21-079)", () => {
    // All the columns shown at first, not only those up to Currency: Paid and Issued fell off the screen.
    expect(Object.keys(LIST_WIDTHS)).toEqual(RECEIVABLE_DEFAULT_COLUMNS);
    const used = Object.values(LIST_WIDTHS).reduce((sum, w) => sum + w, 0) + LIST_TICK_WIDTH + LIST_EXPAND_WIDTH;
    expect(used).toBe(1104);
    expect(LIST_ROOM).toBe(1440 - 260 - 2 * 32 - 2);
    // A little room left over, so a pixel more somewhere does not scroll the list.
    expect(LIST_ROOM - used).toBeGreaterThanOrEqual(8);
    // The cells' padding (6 px a side) is the class the list carries.
    expect(LIST_CELL_PADDING).toBe(12);
    expect(LIST_CELL_CLASS).toBe("[&_.ant-table-cell]:!px-1.5");
  });

  it("gives each column room for what it holds, as the app measured it at 1440 px (mock test S21-079)", () => {
    const room = (key: keyof typeof LIST_WIDTHS) => LIST_WIDTHS[key] - LIST_CELL_PADDING;
    // The shortened number "INV2026…0125-003" (bold) is 142 px, the shortened job "CZROAD…0094" 102 px.
    expect(room("number")).toBeGreaterThanOrEqual(142);
    expect(room("job")).toBeGreaterThanOrEqual(102);
    // A day "28.12.2026" 75 px; under Due "12 days overdue" 86 px (a longer one wraps).
    for (const key of ["due", "issued", "paid"] as const) expect(room(key)).toBeGreaterThanOrEqual(75);
    expect(room("due")).toBeGreaterThanOrEqual(86);
    // "1,234,567.89" whole, bold in Left to pay: 87 px.
    for (const key of ["gross", "left", "paid"] as const) expect(room(key)).toBeGreaterThanOrEqual(87);
    // The widest single mark, "Part credited" (88 px), on one line; longer ones wrap.
    expect(room("status")).toBeGreaterThanOrEqual(88);
    // The title CURRENCY (no sorter arrows) 66 px; "EUR" and "CZK" under it.
    expect(room("currency")).toBeGreaterThanOrEqual(66);
    // The customer is cut, whole on hover, but keeps some words.
    expect(room("customer")).toBeGreaterThanOrEqual(88);
  });

  it("shortens a long job number to its letters and the last four digits, a short one whole (mock test S21-079)", () => {
    expect(shortJobNumber("CZROAD00000094")).toBe("CZROAD…0094");
    expect(shortJobNumber("CZFCL00000062")).toBe("CZFCL…0062");
    // At most 6 letters, so it is not cut again at its end in the 104 px cell (review of the S21-079 fix).
    expect(shortJobNumber("CZPROJECT00000023")).toBe("CZPROJ…0023");
    expect(shortJobNumber("CZ00000053")).toBe("CZ00000053");
    expect(shortJobNumber("CZ00000053")).toHaveLength(JOB_SHOWN);
    expect(shortJobNumber("")).toBe("");
    // Another text is cut in its middle, its end kept.
    expect(shortJobNumber("SOMETHING-ELSE-42")).toBe("SOMET…E-42");
  });

  it("shows an amount without its currency while the Currency column does, with it otherwise (mock test S21-079)", () => {
    expect(listAmountText(1234567.89, "CZK", true)).toBe("1,234,567.89");
    expect(listAmountText(20692.66, "EUR", true)).toBe("20,692.66");
    expect(listAmountText(-30, "EUR", true)).toBe("−30.00");
    expect(listAmountText(20692.66, "EUR", false)).toBe("20,692.66 EUR");
    expect(listAmountText(null, "EUR", true)).toBe("—");
  });
});

describe("whom the reminders go to (A7)", () => {
  const owed = { status: "unpaid" as const, leftToPay: 100 };
  const contact = { name: "Eva", email: "eva@alza.cz", role: "Accounts payable" };

  it("names the rule, not 'no contact with an e-mail', and where a contact is added", () => {
    expect(NO_REMINDER_CONTACT).toBe("No accounts, finance or main contact with an e-mail (Customer Database → Contacts)");
    expect(REMINDERS_CANNOT_GO_OUT).toBe("Reminders can't go out: no accounts, finance or main contact with an e-mail");
  });

  it("warns that the automatic reminders skip the invoice only while they are on, it is owed and the customer has nobody to send to", () => {
    expect(remindersBlocked(owed, null, "2026-11-01")).toBe(true);
    // Off (or e-mail off): a reminder is sent by hand, where the address is typed.
    expect(remindersBlocked(owed, null, null)).toBe(false);
    expect(remindersBlocked(owed, contact, "2026-11-01")).toBe(false);
    expect(remindersBlocked({ status: "paid", leftToPay: 0 }, null, "2026-11-01")).toBe(false);
    expect(remindersBlocked({ status: "part_paid", leftToPay: 40 }, undefined, "2026-11-01")).toBe(true);
  });
});
