import { describe, expect, it } from "vitest";
import {
  answeredSince,
  combinedReleaseState,
  creditUnbilledLine,
  creditWarningLines,
  overrideReasonOk,
  RELEASE_ELSEWHERE,
  releasedEditStop,
  releaseElsewhereText,
  releaseStopLikely,
  releaseStopNote,
  releaseStopOf,
  unbilledLine,
  limitVerdict,
  prepaymentLine,
  releaseCheckState,
  releaseReason,
  unpaidInvoiceDetail,
  warnsOnGreen,
  askedBefore,
  canAskForRelease,
  isOwnReleaseRequest,
  isReleaseAnswer,
  passRereadAt,
  releaseAnsweredNote,
  releaseAnswersMark,
  releaseAnswerText,
  releaseAnswerTitle,
  releasedOnApproval,
  releasePassRead,
  releasePassUsable,
  releaseRequestHref,
  releaseRequestState,
  shortDate,
  shortDateTime,
  type CreditFacts,
  type ReleaseCheckFacts,
  type ReleaseRequestFacts,
} from "./paymentWarnings";

const check = (over: Partial<ReleaseCheckFacts> = {}): ReleaseCheckFacts => ({
  warn: true,
  customer: "Alfa Trading s.r.o.",
  prepayment: false,
  customerOverdueCount: 0,
  unpaid: [{ invoiceId: "i1", number: "INV2026CZFCL00000023-001", leftToPay: 1450, currency: "EUR", daysOverdue: 12 }],
  ...over,
});

const credit = (over: Partial<CreditFacts> = {}): CreditFacts => ({
  companyName: "Alfa Trading s.r.o.",
  creditLimit: 0,
  currency: "EUR",
  prepayment: false,
  unpaid: [],
  overdueCount: 0,
  oldestOverdueDue: null,
  ...over,
});

describe("the release warning's words (D20)", () => {
  it("says what one invoice still needs, with the days overdue only when there are any", () => {
    expect(unpaidInvoiceDetail({ leftToPay: 1450, currency: "EUR", daysOverdue: 12 })).toBe("1,450.00 EUR left to pay, 12 days overdue");
    expect(unpaidInvoiceDetail({ leftToPay: 23400, currency: "CZK", daysOverdue: 1 })).toBe("23,400.00 CZK left to pay, 1 day overdue");
    expect(unpaidInvoiceDetail({ leftToPay: 99.5, currency: "USD", daysOverdue: 0 })).toBe("99.50 USD left to pay");
  });

  it("says why in one sentence, naming the customer", () => {
    expect(releaseReason(check({ prepayment: true }))).toBe("Alfa Trading s.r.o. is on prepayment.");
    expect(releaseReason(check({ customerOverdueCount: 1 }))).toBe("Alfa Trading s.r.o. has 1 overdue invoice.");
    expect(releaseReason(check({ prepayment: true, customerOverdueCount: 3 }))).toBe("Alfa Trading s.r.o. is on prepayment and has 3 overdue invoices.");
    expect(releaseReason(check({ customer: "", customerOverdueCount: 2 }))).toBe("The customer has 2 overdue invoices.");
  });
});

describe("where a release check stands", () => {
  it("is checking only during the first try, never past a failure or the time allowed", () => {
    expect(releaseCheckState({ data: undefined, fresh: false, isError: false, failureCount: 0, timedOut: false })).toBe("checking");
    expect(releaseCheckState({ data: undefined, fresh: false, isError: false, failureCount: 1, timedOut: false })).toBe("unknown");
    expect(releaseCheckState({ data: undefined, fresh: false, isError: true, failureCount: 2, timedOut: false })).toBe("unknown");
    expect(releaseCheckState({ data: undefined, fresh: false, isError: false, failureCount: 0, timedOut: true })).toBe("unknown");
  });

  it("follows the answer once there is one", () => {
    expect(releaseCheckState({ data: check(), fresh: true, isError: false, failureCount: 0, timedOut: false })).toBe("warn");
    expect(releaseCheckState({ data: check({ warn: false }), fresh: true, isError: false, failureCount: 0, timedOut: true })).toBe("clear");
    // An answer of this opening is still shown while a later read fails.
    expect(releaseCheckState({ data: check(), fresh: true, isError: true, failureCount: 1, timedOut: false })).toBe("warn");
  });

  it("does not take an answer kept from an earlier opening: still checking, then not checked", () => {
    // A "clear" read the last time the dialog was open does not let the release go before today's answer.
    expect(releaseCheckState({ data: check({ warn: false }), fresh: false, isError: false, failureCount: 0, timedOut: false })).toBe("checking");
    expect(releaseCheckState({ data: check(), fresh: false, isError: false, failureCount: 0, timedOut: false })).toBe("checking");
    // The time allowed is over, or the fresh read failed: released with the "could not be checked" note.
    expect(releaseCheckState({ data: check({ warn: false }), fresh: false, isError: false, failureCount: 0, timedOut: true })).toBe("unknown");
    expect(releaseCheckState({ data: check({ warn: false }), fresh: false, isError: true, failureCount: 1, timedOut: false })).toBe("unknown");
  });

  it("counts an answer as fresh only when it was read since the check became active", () => {
    expect(answeredSince(1_000, 1_000)).toBe(true);
    expect(answeredSince(1_500, 1_000)).toBe(true);
    expect(answeredSince(900, 1_000)).toBe(false);
    // No answer yet, or not active.
    expect(answeredSince(0, 1_000)).toBe(false);
    expect(answeredSince(1_500, null)).toBe(false);
  });

  it("puts several jobs together: checking, then warn, then unknown, then clear", () => {
    expect(combinedReleaseState(["clear", "warn", "checking"])).toBe("checking");
    expect(combinedReleaseState(["clear", "unknown", "warn"])).toBe("warn");
    expect(combinedReleaseState(["clear", "unknown"])).toBe("unknown");
    expect(combinedReleaseState(["clear", "clear"])).toBe("clear");
    expect(combinedReleaseState([])).toBe("clear");
  });
});

describe("the credit limit (D21), converted as the customer's Finance tab converts", () => {
  const rates = { CZK: 1, EUR: 25, USD: 20 };

  it("has nothing to compare with a limit of 0", () => {
    expect(limitVerdict(credit({ unpaid: [{ currency: "EUR", amount: 1e6 }] }), rates)).toEqual({ kind: "none" });
  });

  it("compares in the limit's currency, over only when above it", () => {
    expect(limitVerdict(credit({ creditLimit: 1000, unpaid: [{ currency: "EUR", amount: 1000 }] }), rates)).toEqual({ kind: "within" });
    expect(limitVerdict(credit({ creditLimit: 1000, unpaid: [{ currency: "EUR", amount: 1000.01 }] }), rates)).toEqual({ kind: "over", owed: 1000.01, converted: false });
  });

  it("converts other currencies through CZK at today's rates", () => {
    // 25,000 CZK = 1,000 EUR; 100 USD = 2,000 CZK = 80 EUR.
    const v = limitVerdict(credit({ creditLimit: 1050, unpaid: [{ currency: "CZK", amount: 25000 }, { currency: "USD", amount: 100 }] }), rates);
    expect(v).toEqual({ kind: "over", owed: 1080, converted: true });
  });

  it("never guesses a currency without a rate, and waits for rates that are not in yet", () => {
    expect(limitVerdict(credit({ creditLimit: 1000, unpaid: [{ currency: "GBP", amount: 5 }] }), rates)).toEqual({ kind: "unknown", currencies: ["GBP"] });
    expect(limitVerdict(credit({ creditLimit: 1000, unpaid: [{ currency: "USD", amount: 5 }] }), null)).toEqual({ kind: "pending" });
    // Only the limit's own currency owed: no rate needed.
    expect(limitVerdict(credit({ creditLimit: 1000, unpaid: [{ currency: "EUR", amount: 5 }] }), null)).toEqual({ kind: "within" });
  });
});

describe("the credit warning's lines", () => {
  it("says nothing when the customer is within its limit and nothing is overdue", () => {
    expect(creditWarningLines(credit({ creditLimit: 1000, unpaid: [{ currency: "EUR", amount: 10 }] }), {})).toEqual([]);
    expect(creditWarningLines(credit(), {})).toEqual([]);
  });

  it("says over the limit and the overdue invoices, the oldest due day with it", () => {
    const lines = creditWarningLines(
      credit({ creditLimit: 1000, unpaid: [{ currency: "EUR", amount: 1200 }], overdueCount: 2, oldestOverdueDue: "2026-11-03" }),
      {},
    );
    expect(lines).toEqual([
      "Alfa Trading s.r.o. is over its credit limit (owes 1,200.00 EUR, limit 1,000.00 EUR).",
      "Alfa Trading s.r.o. has 2 overdue invoices, the oldest due 03.11.2026.",
    ]);
    expect(creditWarningLines(credit({ overdueCount: 1, oldestOverdueDue: "2026-11-17" }), {})).toEqual(["Alfa Trading s.r.o. has 1 overdue invoice, due 17.11.2026."]);
  });

  it("says it could not compare with the limit rather than guess", () => {
    expect(creditWarningLines(credit({ creditLimit: 1000, unpaid: [{ currency: "GBP", amount: 5 }] }), { CZK: 1 })).toEqual([
      "Alfa Trading s.r.o. owes in GBP, which has no exchange rate today: could not compare with the limit.",
    ]);
  });

  it("names the prepayment fact (D22) in one short line", () => {
    expect(prepaymentLine(credit({ prepayment: true }))).toBe("Alfa Trading s.r.o. is on prepayment: its invoices are due the day they are issued.");
    expect(prepaymentLine(credit())).toBeNull();
  });

  it("warns on Green only when there is something to warn about", () => {
    expect(warnsOnGreen("Green", ["x"])).toBe(true);
    expect(warnsOnGreen("Yellow", ["x"])).toBe(false);
    expect(warnsOnGreen("Green", [])).toBe(false);
  });
});

describe("work not yet invoiced (step 7): its own line, never added to what is owed", () => {
  it("names each currency on its own, with the number of jobs", () => {
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: 1200 }, { currency: "CZK", amount: 300.5 }], jobs: 3 })).toBe(
      "Not yet invoiced: 1,200.00 EUR, 300.50 CZK (3 jobs)",
    );
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: 10 }], jobs: 1 })).toBe("Not yet invoiced: 10.00 EUR (1 job)");
  });

  it("says 'at least' when the server stopped counting at its limit of jobs", () => {
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: 10 }], jobs: 5000, capped: true })).toBe("Not yet invoiced: at least 10.00 EUR (5000 jobs)");
  });

  it("says nothing when nothing above 0 waits, and leaves out a currency that nets to 0", () => {
    expect(unbilledLine({ amounts: [], jobs: 0 })).toBeNull();
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: 0.001 }], jobs: 1 })).toBeNull();
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: -5 }], jobs: 1 })).toBeNull();
    expect(unbilledLine({ amounts: [{ currency: "EUR", amount: 0 }, { currency: "USD", amount: 7 }], jobs: 2 })).toBe("Not yet invoiced: 7.00 USD (2 jobs)");
  });

  it("is shown on the credit warning only when it could be read", () => {
    const facts = { unbilled: [{ currency: "EUR", amount: 50 }], unbilledJobs: 1 };
    expect(creditUnbilledLine({ ...facts, unbilledKnown: true })).toBe("Not yet invoiced: 50.00 EUR (1 job)");
    expect(creditUnbilledLine({ ...facts, unbilledKnown: false })).toBeNull();
    expect(creditUnbilledLine({})).toBeNull();
  });
});

describe("the prepayment stop (step 7): told apart from other refusals", () => {
  // The server's sentences, as api shipments/lib/prepaymentStop.ts writes them.
  const unpaidUser =
    "The House BoL can't be released: the job is on prepayment and not paid - INV-1 (1,450.00 EUR left to pay). A manager can release it with a reason";
  const unpaidManager =
    "Warehouse Released can't be set: the job is on prepayment and not paid - an invoice is left to pay. As a manager you can release it all the same: give a reason (at least 3 characters)";
  const unchecked = "Whether the job is paid could not be checked: try again in a moment. A manager can release it with a reason";
  const err = (code: string, message: string) => Object.assign(new Error(message), { code });

  it("reads the stop from a failed precondition with the stop's sentence", () => {
    expect(releaseStopOf(err("failed_precondition", unpaidUser))).toEqual({ kind: "unpaid", message: unpaidUser });
    expect(releaseStopOf(err("failed_precondition", unpaidManager))).toEqual({ kind: "unpaid", message: unpaidManager });
    expect(releaseStopOf(err("failed_precondition", unchecked))).toEqual({ kind: "unchecked", message: unchecked });
  });

  it("is not the stop for any other refusal or failure", () => {
    // Another rule of the same code.
    expect(releaseStopOf(err("failed_precondition", "This shipment's Warehouse Released was changed meanwhile: open it again and retry"))).toBeNull();
    // The stop's words under another code are not the stop.
    expect(releaseStopOf(err("permission_denied", unpaidUser))).toBeNull();
    expect(releaseStopOf(err("unknown", "request failed: status 502"))).toBeNull();
    expect(releaseStopOf(new Error(unpaidUser))).toBeNull();
    expect(releaseStopOf(null)).toBeNull();
    expect(releaseStopOf("failed_precondition")).toBeNull();
  });

  it("asks a manager's reason of at least 3 characters, spaces not counted", () => {
    expect(overrideReasonOk("ok!")).toBe(true);
    expect(overrideReasonOk("  ok  ")).toBe(false);
    expect(overrideReasonOk("")).toBe(false);
  });

  it("words the dialog up front only when the check says prepayment and an invoice left to pay", () => {
    expect(releaseStopLikely(check({ prepayment: true }))).toBe(true);
    expect(releaseStopLikely(check({ prepayment: false, customerOverdueCount: 2 }))).toBe(false);
    expect(releaseStopLikely(check({ prepayment: true, unpaid: [] }))).toBe(false);
    expect(releaseStopLikely(undefined)).toBe(false);
    expect(releaseStopNote(false)).toBe("This release is stopped for prepayment customers: a manager can release with a reason.");
    expect(releaseStopNote(true)).toContain("as a manager you can release with a reason");
  });
});

describe("Warehouse Released set by hand (step 7): the same stop on the field's edit", () => {
  const unpaid =
    "Warehouse Released can't be set: the job is on prepayment and not paid - an invoice is left to pay. As a manager you can release it all the same: give a reason (at least 3 characters)";
  const err = (code: string, message: string) => Object.assign(new Error(message), { code });

  it("is the stop only for Warehouse Released and only for the stop's refusal", () => {
    expect(releasedEditStop("warehouseReleasedDate", err("failed_precondition", unpaid))).toEqual({ kind: "unpaid", message: unpaid });
    expect(releasedEditStop("warehouseReceivedDate", err("failed_precondition", unpaid))).toBeNull();
    expect(releasedEditStop("warehouseReleasedDate", err("failed_precondition", "changed meanwhile"))).toBeNull();
    expect(releasedEditStop("warehouseReleasedDate", new TypeError("Failed to fetch"))).toBeNull();
  });

  it("tells the grid where a manager can give the reason, after the server's sentence", () => {
    const text = releaseElsewhereText({ kind: "unpaid", message: unpaid });
    expect(text.startsWith(unpaid)).toBe(true);
    expect(text.endsWith(RELEASE_ELSEWHERE)).toBe(true);
    expect(RELEASE_ELSEWHERE).toBe("Release it from Stock → release to truck or the shipment's detail: there a manager gives a reason, and anyone else asks a manager to release it.");
  });
});

describe("Ask a manager to release (Council Outlay 11, D16): the request's state on the job", () => {
  const request = (over: Partial<ReleaseRequestFacts> = {}): ReleaseRequestFacts => ({
    what: "house_bol",
    status: "pending",
    requestedById: "u1",
    requestedByName: "Jan Novák",
    // 14:02 in Prague (winter time).
    requestedAt: "2026-11-18T13:02:00.000Z",
    decidedByName: "",
    decidedAt: null,
    comment: "",
    usedAt: null,
    usedByName: "",
    validUntil: null,
    usable: false,
    ...over,
  });
  const decided = { decidedByName: "Eva Malá", decidedAt: "2026-11-18T14:10:00.000Z" };
  // Approved 18.11. 15:10, good for 7 days: until 25.11. 15:10.
  const pass = { status: "approved" as const, ...decided, comment: "agreed with the owner", validUntil: "2026-11-25T14:10:00.000Z", usable: true };
  const used = { ...pass, usable: false, usedAt: "2026-11-19T08:30:00.000Z", usedByName: "jan@firma.cz" };
  const ranOut = { ...pass, usable: false };
  const rejected = { status: "rejected" as const, ...decided, comment: "not before the payment" };
  const closed = { status: "closed" as const, comment: "Released without it" };
  const until = Date.parse(pass.validUntil);

  it("writes a moment on the company's clock without the year", () => {
    expect(shortDateTime("2026-11-18T13:02:00.000Z")).toBe("18.11. 14:02");
    expect(shortDateTime(null)).toBe("");
    expect(shortDate("2026-11-25T14:10:00.000Z")).toBe("25.11.");
    // Just before midnight in UTC is the next day in Prague.
    expect(shortDate("2026-11-25T23:30:00.000Z")).toBe("26.11.");
    expect(shortDate(null)).toBe("");
  });

  it("takes the server's word on whether an approval can be used - never this browser's clock", () => {
    expect(releasePassUsable(request(pass))).toBe(true);
    expect(releasePassUsable(request(used))).toBe(false);
    expect(releasePassUsable(request(ranOut))).toBe(false);
    expect(releasePassUsable(request())).toBe(false);
    expect(releasePassUsable(request(rejected))).toBe(false);
    expect(releasePassUsable(request({ ...closed, usable: true }))).toBe(false);
    expect(releasePassUsable(null)).toBe(false);
  });

  it("reads the job's requests again a minute after an approval's time is over here - once", () => {
    const readBefore = Date.parse("2026-11-20T10:00:00.000Z");
    expect(passRereadAt([request(pass)], readBefore)).toBe(until + 60_000);
    // Read within the minute after: still to be asked once the minute is over.
    expect(passRereadAt([request(pass)], until + 30_000)).toBe(until + 60_000);
    // Read after it and the server still says usable: its clock decides, it is not asked again.
    expect(passRereadAt([request(pass)], until + 60_001)).toBeNull();
    // Nothing to wait for: no approval that can be used, or none with an end.
    expect(passRereadAt([request(), request(used), request(ranOut), request(rejected)], readBefore)).toBeNull();
    expect(passRereadAt([request({ ...pass, validUntil: null })], readBefore)).toBeNull();
    expect(passRereadAt([], readBefore)).toBeNull();
    // Two approvals (the House BoL's and the warehouse's): the one that ends first.
    expect(passRereadAt([request(pass), request({ ...pass, what: "warehouse", validUntil: "2026-11-23T09:00:00.000Z" })], readBefore)).toBe(
      Date.parse("2026-11-23T09:00:00.000Z") + 60_000,
    );
  });

  it("holds what it says of an approval until the requests were read since the dialog opened", () => {
    const q = { asked: true, since: 1000, hasData: false, dataUpdatedAt: 0, isError: false, errorUpdatedAt: 0, timedOut: false };
    expect(releasePassRead(q)).toBe("checking");
    // An answer kept from before the dialog opened says nothing about now.
    expect(releasePassRead({ ...q, hasData: true, dataUpdatedAt: 900 })).toBe("checking");
    expect(releasePassRead({ ...q, hasData: true, dataUpdatedAt: 1200 })).toBe("read");
    // The render in which the dialog opens has no "since" yet.
    expect(releasePassRead({ ...q, since: null, hasData: true, dataUpdatedAt: 1200 })).toBe("checking");
    // Failed, or slow: said so, the release is not held up for it.
    expect(releasePassRead({ ...q, isError: true, errorUpdatedAt: 1300 })).toBe("failed");
    expect(releasePassRead({ ...q, isError: true, errorUpdatedAt: 800 })).toBe("checking");
    expect(releasePassRead({ ...q, timedOut: true })).toBe("failed");
    // A poll that fails after a good read keeps that read.
    expect(releasePassRead({ ...q, hasData: true, dataUpdatedAt: 1200, isError: true, errorUpdatedAt: 1500 })).toBe("read");
    // Nothing is being released: nothing to wait for.
    expect(releasePassRead({ ...q, asked: false })).toBe("read");
  });

  it("says a waiting request waits for a manager - and who asked, to anyone else", () => {
    expect(releaseRequestState(request(), { viewerId: "u1" })).toEqual({ tone: "amber", text: "Asked 18.11. 14:02 — waiting for a manager" });
    expect(releaseRequestState(request(), { viewerId: "u2" })?.text).toBe("Asked by Jan Novák 18.11. 14:02 — waiting for a manager");
    expect(releaseRequestState(request({ requestedByName: " " }))?.text).toBe("Asked 18.11. 14:02 — waiting for a manager");
  });

  it("tells whoever releases to release now while the approval can be used, until which day and time", () => {
    expect(releaseRequestState(request(pass))).toEqual({
      tone: "green",
      text: "Approved by Eva Malá 18.11. 15:10: agreed with the owner — release it now (valid until 25.11. 15:10)",
    });
    expect(releaseRequestState(request({ ...pass, comment: "", validUntil: null }))?.text).toBe("Approved by Eva Malá 18.11. 15:10 — release it now");
  });

  it("says who released on whose approval - only while the job is released", () => {
    expect(releaseRequestState(request(used), { released: true })).toEqual({ tone: "green", text: "Released on Eva Malá's approval, by jan@firma.cz 19.11. 09:30" });
    expect(releaseRequestState(request({ ...used, decidedByName: "", usedByName: "" }), { released: true })?.text).toBe("Released on a manager's approval 19.11. 09:30");
    // The release was undone (Warehouse Released cleared): the spent approval says nothing, and can be asked for anew.
    expect(releaseRequestState(request(used))).toBeNull();
    expect(releaseRequestState(request(used), { released: false })).toBeNull();
    expect(canAskForRelease(request(used))).toBe(true);
  });

  it("says an approval nobody used ran out", () => {
    expect(releaseRequestState(request(ranOut))).toEqual({ tone: "slate", text: "The approval of 18.11. ran out unused" });
  });

  it("says who rejected it, with their words", () => {
    expect(releaseRequestState(request(rejected))).toEqual({ tone: "red", text: "Rejected by Eva Malá 18.11. 15:10: not before the payment" });
    expect(releaseRequestState(request({ status: "rejected", decidedByName: "", decidedAt: null, comment: "no" }))?.text).toBe("Rejected by a manager: no");
  });

  it("says nothing without a request, of a closed one, and of a released job anything but the approval it was released on", () => {
    expect(releaseRequestState(null)).toBeNull();
    expect(releaseRequestState(request(closed))).toBeNull();
    expect(releaseRequestState(request({ ...closed, ...decided }), { released: true })).toBeNull();
    expect(releaseRequestState(request(), { released: true })).toBeNull();
    expect(releaseRequestState(request(rejected), { released: true })).toBeNull();
    expect(releaseRequestState(request(pass), { released: true })).toBeNull();
    expect(releaseRequestState(request(ranOut), { released: true })).toBeNull();
  });

  it("lets a release be asked for unless a request waits or an approval can still be used", () => {
    expect(canAskForRelease(null)).toBe(true);
    expect(canAskForRelease(request(rejected))).toBe(true);
    expect(canAskForRelease(request(closed))).toBe(true);
    expect(canAskForRelease(request(ranOut))).toBe(true);
    expect(canAskForRelease(request())).toBe(false);
    expect(canAskForRelease(request(pass))).toBe(false);
  });

  it("knows a request that was answered and did not lead to the release: the button then says \"again\"", () => {
    expect(askedBefore(request(rejected))).toBe(true);
    expect(askedBefore(request(ranOut))).toBe(true);
    expect(askedBefore(request(used))).toBe(false);
    expect(askedBefore(request(closed))).toBe(false);
    expect(askedBefore(null)).toBe(false);
  });

  it("knows a release that went through on an approval, from the request read after it", () => {
    expect(releasedOnApproval(request(used))).toBe(true);
    expect(releasedOnApproval(request(pass))).toBe(false);
    expect(releasedOnApproval(request(closed))).toBe(false);
    expect(releasedOnApproval(null)).toBe(false);
  });

  it("words the answer under the bell: a usable approval says to release now, the others are plain", () => {
    const a = (over: Partial<ReleaseRequestFacts>) => ({ ...request(over), jobNumber: "CZ00000053" });
    expect(releaseAnswerTitle(a(pass))).toBe("Release approved · CZ00000053 — release it now (valid until 25.11. 15:10)");
    expect(releaseAnswerText(a(pass))).toBe("House BoL release — agreed with the owner");
    expect(releaseAnswerTitle(a(used))).toBe("Release approved · CZ00000053");
    expect(releaseAnswerText(a(used))).toBe("House BoL release — released 19.11. 09:30 by jan@firma.cz");
    expect(releaseAnswerTitle(a(ranOut))).toBe("Release approved · CZ00000053");
    expect(releaseAnswerText(a(ranOut))).toBe("House BoL release — ran out unused");
    expect(releaseAnswerTitle({ ...a(rejected), jobNumber: "" })).toBe("Release rejected · a job");
    expect(releaseAnswerText(a({ ...rejected, what: "warehouse" }))).toBe("Warehouse Released — not before the payment");
    expect(releaseAnswerText(a({ ...rejected, what: "warehouse", comment: "" }))).toBe("Warehouse Released");
  });

  it("lists only a manager's answers under the bell", () => {
    expect(isReleaseAnswer({ status: "approved" })).toBe(true);
    expect(isReleaseAnswer({ status: "rejected" })).toBe(true);
    expect(isReleaseAnswer({ status: "closed" })).toBe(false);
    expect(isReleaseAnswer({ status: "pending" })).toBe(false);
  });

  it("marks the answers so that a new answer or a used approval is told from the same list read again", () => {
    const a = { id: "r1", ...request(pass) };
    expect(releaseAnswersMark([a])).toBe(releaseAnswersMark([{ ...a }]));
    expect(releaseAnswersMark([a])).not.toBe(releaseAnswersMark([{ id: "r1", ...request(used) }]));
    expect(releaseAnswersMark([a])).not.toBe(releaseAnswersMark([a, { id: "r2", ...request(rejected) }]));
    expect(releaseAnswersMark([])).toBe("");
  });

  it("says in the Answered list what became of an approval, and that the app closed a request", () => {
    expect(releaseAnsweredNote(request(used))).toBe("used 19.11. 09:30 by jan@firma.cz");
    expect(releaseAnsweredNote(request(pass))).toBe("not used yet, valid until 25.11. 15:10");
    expect(releaseAnsweredNote(request(ranOut))).toBe("ran out unused");
    expect(releaseAnsweredNote(request(closed))).toBe("Closed: released without it");
    expect(releaseAnsweredNote(request(rejected))).toBeNull();
  });

  it("knows a manager's own request: another manager decides it", () => {
    expect(isOwnReleaseRequest(request(), "u1")).toBe(true);
    expect(isOwnReleaseRequest(request(), "u2")).toBe(false);
    expect(isOwnReleaseRequest(request(), null)).toBe(false);
  });

  it("leads to the job's Details, where both releases' requests are shown - not to its Warehouse tab", () => {
    expect(releaseRequestHref({ shipmentId: "s1" })).toBe("/shipments/s1");
    expect(releaseRequestHref({ shipmentId: "s1", what: "warehouse" } as { shipmentId: string })).toBe("/shipments/s1");
  });
});
