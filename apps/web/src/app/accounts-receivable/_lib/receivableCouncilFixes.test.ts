import { describe, expect, it } from "vitest";
import { noRetryWhenForbidden } from "@/hooks/useReceivableTools";
import { ANSWER_LOST, exportChoices, exportFailureText, exportKeyFor, forgetExportKey, forgetExportKeysOf, INCLUDE_EXPORTED_WARNING, type KeyStore } from "../export/_lib/export";
import { switchOnText } from "../settings/_lib/settings";
import {
  bankStatementHref,
  isForbidden,
  passesCheck,
  promiseProblem,
  RECEIVABLE_CHECKS,
  receivableTools,
  reminderMail,
  reminderMailOf,
  type ReceivableRow,
} from "./receivables";

// The fixes of the mock test council (19 Nov 2026) on Accounts Receivable's pages: a broken promise to find (m6), the
// promise's 60 days for a user (K13), the reminder in the server's own words (m3), the bank statements and the export
// for managers only (X6), an export whose answer was lost (m1) and the day automatic reminders were switched on (L2).

const row = (over: Partial<ReceivableRow> = {}): ReceivableRow =>
  ({
    id: "inv-1",
    number: "INV2026CZ00000031-001",
    customerId: "c-1",
    customer: "Gama Elektro a.s.",
    jobNumber: "CZ00000031",
    issueDate: "2026-11-02",
    dueDate: "2026-11-10",
    currency: "CZK",
    leftToPay: 1210,
    status: "unpaid",
    marks: [],
    daysOverdue: 8,
    ...over,
  }) as ReceivableRow;

describe("Promise passed (m6)", () => {
  it("is a check of the Filter panel: still owed after the promised day", () => {
    expect(RECEIVABLE_CHECKS.map((c) => c.key)).toContain("promise_passed");
    expect(passesCheck(row({ marks: ["promise_broken"] }), "promise_passed", "2026-11-18")).toBe(true);
    expect(passesCheck(row({ marks: ["promised"] }), "promise_passed", "2026-11-18")).toBe(false);
    expect(passesCheck(row({ marks: ["promise_broken"], status: "paid", leftToPay: 0 }), "promise_passed", "2026-11-18")).toBe(false);
  });
});

describe("promiseProblem (K13)", () => {
  it("takes a day from today on; a user's at most 60 days ahead, a manager's later too", () => {
    expect(promiseProblem("", "2026-11-18", false)).toBe("Pick the day the customer promised to pay by");
    expect(promiseProblem("2026-11-17", "2026-11-18", true)).toBe("The promised day cannot be before today");
    expect(promiseProblem("2027-01-17", "2026-11-18", false)).toBe("");
    expect(promiseProblem("2027-01-18", "2026-11-18", false)).toBe("A promise is at most 60 days ahead: a manager notes a later one");
    expect(promiseProblem("2027-06-30", "2026-11-18", true)).toBe("");
  });
});

describe("reminderMailOf (m3)", () => {
  it("opens the server's text of the level, else the plain English one", () => {
    const drafts = [
      { level: 1 as const, language: "cs", subject: "Upomínka: faktura INV2026CZ00000031-001 (zakázka CZ00000031)", body: "Dobrý den, … s variabilním symbolem 00000031" },
      { level: 2 as const, language: "cs", subject: "Druhá upomínka", body: "…" },
    ];
    expect(reminderMailOf(drafts, row(), 1)).toEqual({ subject: drafts[0]!.subject, message: drafts[0]!.body });
    expect(reminderMailOf(drafts, row(), 3)).toEqual(reminderMail(row(), 3));
    expect(reminderMailOf(undefined, row(), 1)).toEqual(reminderMail(row(), 1));
  });
});

describe("bank statements and the export for managers only (X6)", () => {
  it("leaves them out of the Tools menu for a user", () => {
    expect(receivableTools(true).map((t) => t.label)).toEqual(["Bank statements", "Month-end", "Export to Pohoda", "Reminder settings"]);
    expect(receivableTools(false).map((t) => t.label)).toEqual(["Month-end", "Reminder settings"]);
  });

  it("tells a role's refusal apart, and never asks again after one", () => {
    expect(isForbidden({ code: "permission_denied", message: "Only a manager…" })).toBe(true);
    expect(isForbidden({ code: "unavailable" })).toBe(false);
    expect(isForbidden(new Error("offline"))).toBe(false);
    expect(noRetryWhenForbidden(0, { code: "permission_denied" })).toBe(false);
    expect(noRetryWhenForbidden(0, { code: "unavailable" })).toBe(true);
    expect(noRetryWhenForbidden(3, new Error("offline"))).toBe(false);
  });

  it("links a waiting payment to its statement", () => {
    expect(bankStatementHref("st 1")).toBe("/accounts-receivable/bank?statement=st%201");
  });
});

describe("an export whose answer was lost (m1)", () => {
  const memory = (): KeyStore & { items: Map<string, string> } => {
    const items = new Map<string, string>();
    return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  };

  it("keeps one key per choice until the export is answered, so Export again answers the same export", () => {
    const store = memory();
    let n = 0;
    const make = () => `pohoda:${++n}`;
    const nov = exportChoices("2026-11-01", "2026-11-30", false);
    expect(exportKeyFor(store, nov, make)).toBe("pohoda:1");
    expect(exportKeyFor(store, nov, make)).toBe("pohoda:1");
    // Another choice is another export.
    expect(exportKeyFor(store, exportChoices("2026-11-01", "2026-11-30", true), make)).toBe("pohoda:2");
    forgetExportKey(store, nov);
    expect(exportKeyFor(store, nov, make)).toBe("pohoda:3");
  });

  it("lets the period's keys go once its export is downloaded again, so a later Export is a new export, not the old one replayed", () => {
    const store = memory();
    let n = 0;
    const make = () => `pohoda:${++n}`;
    const nov = exportChoices("2026-11-01", "2026-11-30", false);
    const novAll = exportChoices("2026-11-01", "2026-11-30", true);
    const oct = exportChoices("2026-10-01", "2026-10-31", false);
    for (const c of [nov, novAll, oct]) exportKeyFor(store, c, make);
    // The list does not say which choice an export was made with: both of its period go.
    forgetExportKeysOf(store, { from: "2026-11-01", to: "2026-11-30" });
    expect(exportKeyFor(store, nov, make)).toBe("pohoda:4");
    expect(exportKeyFor(store, novAll, make)).toBe("pohoda:5");
    // Another period's export still answers its own.
    expect(exportKeyFor(store, oct, make)).toBe("pohoda:3");
  });

  it("works with no storage, or one that throws", () => {
    const broken: KeyStore = {
      getItem: () => {
        throw new Error("off");
      },
      setItem: () => {
        throw new Error("off");
      },
      removeItem: () => {
        throw new Error("off");
      },
    };
    expect(exportKeyFor(broken, "x", () => "k")).toBe("k");
    expect(exportKeyFor(null, "x", () => "k2")).toBe("k2");
    expect(() => forgetExportKey(broken, "x")).not.toThrow();
  });

  it("says a lost answer may already be recorded, and keeps its key; a refusal is 'Not exported' and lets the key go", () => {
    expect(exportFailureText(false, "the server could not be reached")).toEqual({ text: ANSWER_LOST, keepKey: true });
    expect(ANSWER_LOST).toBe("The answer was lost: the export may already be recorded. Click Export again, or download it from the list.");
    expect(exportFailureText(true, "No invoice or credit note was issued")).toEqual({ text: "Not exported: No invoice or credit note was issued", keepKey: false });
  });

  it("does not tell to delete documents in Pohoda when the earlier file never got there", () => {
    expect(INCLUDE_EXPORTED_WARNING).toContain("If the earlier file never reached Pohoda");
    expect(INCLUDE_EXPORTED_WARNING).toContain("there is nothing to remove");
  });
});

describe("the day automatic reminders were switched on (L2)", () => {
  it("says which overdue invoices they take", () => {
    expect(switchOnText(true, "2026-11-19")).toBe("On since 19.11.2026: only invoices due on or after that day are reminded; the older ones stay for a manager to chase by hand.");
    expect(switchOnText(false, null)).toMatch(/^Switched on, they remind only invoices due from the first day e-mail from the app can send/);
    // Mock test council P3: no day yet - it is the first day e-mail can really send, set by the daily run.
    expect(switchOnText(true, null, false)).toMatch(/^On, waiting for e-mail from the app: they start on the first day it can send/);
    expect(switchOnText(true, null, true)).toMatch(/^On: the next daily run sets the day they start and sends nothing that day/);
  });
});
