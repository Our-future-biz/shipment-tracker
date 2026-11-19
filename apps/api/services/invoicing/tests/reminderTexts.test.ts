import { describe, expect, it } from "vitest";
import { bankText, daysText, reminderText, statementMailText, type ReminderFacts, type ReminderLevel } from "../lib/reminderTexts";
import { addDays } from "../../../lib/businessDate";
import { isReminderDay, reminderDue, reminderDueDay, reminderKey, reminderOverdueDays, type ReminderCandidate } from "../lib/reminderRules";

// The reminder e-mails and the rules of the automatic run (Accounts Receivable step 7).

const facts: ReminderFacts = {
  invoiceNumber: "INV2026CZ00000028-001",
  jobNumber: "CZ00000028",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  daysOverdue: 18,
  leftToPay: 1250.5,
  currency: "EUR",
  paymentReference: "00000028",
  issuer: "Příliš žluťoučký kůň s.r.o.",
  bank: { bankName: "ČSOB", accountNumber: "19-2000145399/0800", iban: "CZ6508000000192000145399", swift: "CEKOCZPP" },
  invoiceAttached: true,
};

const LEVELS: ReminderLevel[] = [1, 2, 3];

describe("reminderText", () => {
  for (const language of ["en", "cs"] as const) {
    for (const level of LEVELS) {
      it(`renders reminder ${level} in ${language} with the invoice's facts`, () => {
        const t = reminderText(level, language, facts);
        const all = `${t.subject}\n${t.body}`;
        expect(all).not.toMatch(/undefined|null|NaN|\[object/);
        expect(t.subject).toContain("INV2026CZ00000028-001");
        expect(t.subject).toContain("CZ00000028");
        expect(t.body).toContain("INV2026CZ00000028-001");
        expect(t.body).toContain("31.10.2026");
        expect(t.body).toContain("1 250.50 EUR");
        expect(t.body).toContain("00000028");
        expect(t.body).toContain("CZ65 0800 0000 1920 0014 5399");
        expect(t.body).toContain("Příliš žluťoučký kůň s.r.o.");
        expect(t.body).toContain(language === "cs" ? "18 dní" : "18 days");
      });
    }
  }

  it("names each level plainly: interest from reminder 2, the hand-over only in the final notice", () => {
    expect(reminderText(1, "en", facts).subject).toMatch(/^Payment reminder:/);
    expect(reminderText(2, "en", facts).subject).toMatch(/^Second payment reminder:/);
    expect(reminderText(3, "en", facts).subject).toMatch(/^Final notice:/);
    expect(reminderText(1, "cs", facts).subject).toMatch(/^Upomínka:/);
    expect(reminderText(2, "cs", facts).subject).toMatch(/^Druhá upomínka:/);
    expect(reminderText(3, "cs", facts).subject).toMatch(/^Poslední výzva k úhradě:/);

    expect(reminderText(1, "en", facts).body).not.toMatch(/interest/);
    expect(reminderText(2, "en", facts).body).toMatch(/late-payment interest may be charged/);
    expect(reminderText(2, "cs", facts).body).toMatch(/úrok z prodlení/);
    expect(reminderText(2, "en", facts).body).not.toMatch(/handed over/);
    expect(reminderText(3, "en", facts).body).toMatch(/may be handed over for collection/);
    expect(reminderText(3, "cs", facts).body).toMatch(/předána k vymáhání/);
  });

  it("says the invoice is attached only when it is, and falls back to the account on the invoice", () => {
    const bare = { ...facts, invoiceAttached: false, bank: null };
    expect(reminderText(1, "en", facts).body).toContain("The invoice is attached.");
    expect(reminderText(1, "en", bare).body).not.toContain("attached");
    expect(reminderText(1, "cs", bare).body).not.toContain("přikládáme");
    expect(reminderText(1, "en", bare).body).toContain("the account stated on the invoice");
    expect(reminderText(1, "cs", bare).body).toContain("účet uvedený na faktuře");
  });
});

describe("daysText and bankText", () => {
  it("says the days in each language", () => {
    expect(daysText(1, "en")).toBe("1 day");
    expect(daysText(7, "en")).toBe("7 days");
    expect(daysText(1, "cs")).toBe("1 den");
    expect(daysText(3, "cs")).toBe("3 dny");
    expect(daysText(5, "cs")).toBe("5 dní");
  });

  it("names the account by its number, else its IBAN", () => {
    expect(bankText(facts.bank, "en")).toBe("account 19-2000145399/0800 (ČSOB), IBAN CZ65 0800 0000 1920 0014 5399, SWIFT/BIC CEKOCZPP");
    expect(bankText({ bankName: "", accountNumber: "", iban: "DE89370400440532013000", swift: "" }, "cs")).toBe("účet IBAN DE89 3704 0044 0532 0130 00");
  });
});

describe("statementMailText", () => {
  it("renders in both languages with the totals", () => {
    for (const language of ["en", "cs"] as const) {
      const t = statementMailText(language, { currency: "EUR", asAt: "2026-11-18", invoices: 2, leftToPay: 2210, overdue: 1210, issuer: "Kůň s.r.o.", bank: facts.bank });
      expect(`${t.subject}${t.body}`).not.toMatch(/undefined|null|NaN/);
      expect(t.subject).toContain("18.11.2026");
      expect(t.body).toContain("2 210.00 EUR");
      expect(t.body).toContain("1 210.00 EUR");
    }
  });
});

// ── Which reminder is due ──

const SETTINGS = { reminder1Days: 7, reminder2Days: 21, autoRemindersSince: "2026-01-01" };
const TODAY = "2026-11-18"; // a Wednesday, the day after the 17 November holiday
/** A candidate `daysOverdue` days past its due day (each chosen on a working day, so the count is the plain one). */
const cand = ({ daysOverdue = 7, ...over }: Partial<ReminderCandidate> & { daysOverdue?: number } = {}): ReminderCandidate => ({
  status: "unpaid",
  leftToPay: 100,
  dueDate: addDays(TODAY, -daysOverdue),
  currency: "EUR",
  disputed: false,
  promisedOn: null,
  reminderLevel: 0,
  lastRemindedOn: null,
  ...over,
});

describe("reminderDue", () => {
  it("sends reminder 1 from reminder1Days overdue, not before", () => {
    expect(reminderDue(cand({ daysOverdue: 6 }), SETTINGS, TODAY)).toEqual({ level: null, why: "not_due" });
    expect(reminderDue(cand(), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ status: "part_paid" }), SETTINGS, TODAY)).toEqual({ level: 1 });
  });

  it("sends reminder 2 from reminder2Days overdue once reminder 1 is recorded", () => {
    expect(reminderDue(cand({ daysOverdue: 20, reminderLevel: 1, lastRemindedOn: "2026-11-01" }), SETTINGS, TODAY)).toEqual({ level: null, why: "not_due" });
    expect(reminderDue(cand({ daysOverdue: 22, reminderLevel: 1, lastRemindedOn: "2026-11-04" }), SETTINGS, TODAY)).toEqual({ level: 2 });
    // Long overdue with no reminder yet: reminder 1 first, then reminder 2 not a day later but the settings' gap later.
    expect(reminderDue(cand({ daysOverdue: 40 }), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ daysOverdue: 41, reminderLevel: 1, lastRemindedOn: "2026-11-17" }), SETTINGS, TODAY)).toEqual({ level: null, why: "too_soon" });
  });

  it("sends none while what waits for a second manager covers what is left", () => {
    expect(reminderDue(cand({ leftToPay: 210, waiting: 210 }), SETTINGS, TODAY)).toEqual({ level: null, why: "waiting" });
    expect(reminderDue(cand({ leftToPay: 210, waiting: 300 }), SETTINGS, TODAY)).toEqual({ level: null, why: "waiting" });
    expect(reminderDue(cand({ leftToPay: 210, waiting: 209.99 }), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ leftToPay: 210, waiting: 0 }), SETTINGS, TODAY)).toEqual({ level: 1 });
  });

  it("never sends the final notice, nor anything after reminder 2", () => {
    expect(reminderDue(cand({ daysOverdue: 90, reminderLevel: 2, lastRemindedOn: "2026-09-01" }), SETTINGS, TODAY)).toEqual({ level: null, why: "done" });
    expect(reminderDue(cand({ daysOverdue: 90, reminderLevel: 3 }), SETTINGS, TODAY)).toEqual({ level: null, why: "done" });
  });

  it("leaves out an invoice disputed, promised, not owed or to refund", () => {
    expect(reminderDue(cand({ disputed: true }), SETTINGS, TODAY)).toEqual({ level: null, why: "disputed" });
    expect(reminderDue(cand({ promisedOn: TODAY }), SETTINGS, TODAY)).toEqual({ level: null, why: "promised" });
    // A promise that passed no longer holds the reminder.
    expect(reminderDue(cand({ promisedOn: "2026-11-17" }), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ status: "paid", leftToPay: 0 }), SETTINGS, TODAY).level).toBeNull();
    expect(reminderDue(cand({ status: "paid", leftToPay: -5 }), SETTINGS, TODAY).level).toBeNull();
    expect(reminderDue(cand({ status: "credited", leftToPay: 0 }), SETTINGS, TODAY).level).toBeNull();
  });

  it("leaves out an invoice a bank entry not yet confirmed may pay (X5)", () => {
    expect(reminderDue(cand({ paymentWaiting: true }), SETTINGS, TODAY)).toEqual({ level: null, why: "payment_waiting" });
    expect(reminderDue(cand({ paymentWaiting: false }), SETTINGS, TODAY)).toEqual({ level: 1 });
  });

  it("reminds of nothing under 100 CZK or 5 EUR; another currency weighed in CZK at the invoice's rate (K13)", () => {
    expect(reminderDue(cand({ currency: "EUR", leftToPay: 4.99 }), SETTINGS, TODAY)).toEqual({ level: null, why: "small" });
    expect(reminderDue(cand({ currency: "EUR", leftToPay: 5 }), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ currency: "CZK", leftToPay: 99.99 }), SETTINGS, TODAY)).toEqual({ level: null, why: "small" });
    expect(reminderDue(cand({ currency: "CZK", leftToPay: 100 }), SETTINGS, TODAY)).toEqual({ level: 1 });
    // 4 USD at 23.10 CZK = 92.40 CZK: under; 5 USD = 115.50 CZK: reminded. No rate known: no floor.
    expect(reminderDue(cand({ currency: "USD", leftToPay: 4, fxRate: 23.1 }), SETTINGS, TODAY)).toEqual({ level: null, why: "small" });
    expect(reminderDue(cand({ currency: "USD", leftToPay: 5, fxRate: 23.1 }), SETTINGS, TODAY)).toEqual({ level: 1 });
    expect(reminderDue(cand({ currency: "USD", leftToPay: 1 }), SETTINGS, TODAY)).toEqual({ level: 1 });
  });

  it("counts a due day on a weekend or a holiday as due on the next working day (K13)", () => {
    // Due Saturday 7 Nov: due Monday 9 Nov for the reminders, so 9 days overdue on the 18th, not 11.
    expect(reminderOverdueDays("2026-11-07", TODAY)).toBe(9);
    expect(reminderDueDay("2026-11-07")).toBe("2026-11-09");
    // Due on the 17 November holiday: due Wednesday the 18th, so not overdue yet today.
    expect(reminderOverdueDays("2026-11-17", TODAY)).toBe(0);
    // Due Wednesday 28 October (a holiday): counted from Thursday the 29th, 20 days: reminder 2 not yet.
    expect(reminderDue(cand({ dueDate: "2026-10-28", reminderLevel: 1, lastRemindedOn: "2026-11-04" }), SETTINGS, TODAY)).toEqual({ level: null, why: "not_due" });
    // Due Friday 13 Nov, the company's own extra holiday: due Monday the 16th, 2 days overdue.
    expect(reminderOverdueDays("2026-11-13", TODAY, ["2026-11-13"])).toBe(2);
  });

  it("reminds only invoices that became overdue after automatic reminders were switched on (L2)", () => {
    const since = { ...SETTINGS, autoRemindersSince: "2026-11-11" };
    // Due on the switch-on day: overdue only after it.
    expect(reminderDue(cand({ dueDate: "2026-11-11" }), since, TODAY)).toEqual({ level: 1 });
    // Due the day before: overdue already when they were switched on - a manager chases it by hand.
    expect(reminderDue(cand({ dueDate: "2026-11-10" }), since, TODAY)).toEqual({ level: null, why: "before_switch_on" });
    // The day not known: none.
    expect(reminderDue(cand(), { ...SETTINGS, autoRemindersSince: null }, TODAY)).toEqual({ level: null, why: "before_switch_on" });
  });

  it("goes only on a Czech working day (K8)", () => {
    expect(isReminderDay(TODAY)).toBe(true);
    expect(isReminderDay("2026-11-17")).toBe(false); // a holiday
    expect(isReminderDay("2026-11-21")).toBe(false); // a Saturday
    expect(isReminderDay("2026-11-19", ["2026-11-19"])).toBe(false); // the company's own holiday
  });

  it("keys one mail per invoice and level", () => {
    expect(reminderKey("inv", 2)).toBe("reminder:inv:2");
  });
});
