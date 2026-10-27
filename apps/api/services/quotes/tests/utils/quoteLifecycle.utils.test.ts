import { describe, expect, it } from "vitest";
import { businessDay } from "../../../../lib/businessDate";
import {
  AWAITING,
  FOLLOW_UP_INTERVAL_DAYS,
  LifecycleError,
  NEXT,
  OPEN,
  PRICING_CLOSED,
  SENT_EVIDENCE,
  SHOWN_STATUSES,
  WIN_PROBABILITY,
  allowedTransitions,
  applyFollowUp,
  applyOwner,
  applyRevision,
  applyShipmentLinks,
  applyTransition,
  applyValidity,
  columnsOf,
  deletionEntry,
  effectiveStatus,
  expectStatus,
  followUpDueBefore,
  isFollowUpDue,
  lastContact,
  legacyUnreadable,
  mirrorOf,
  newQuote,
  ownerLabelOf,
  revisionOf,
  stateOf,
  wasEverSent,
  type LifecycleContext,
  type LifecycleState,
  type LinkedShipment,
  type StatusChange,
  type TimelineEntry,
} from "../../utils/quoteLifecycle.utils";

const TODAY = "2026-10-10";
const YESTERDAY = "2026-10-09";
const AT = new Date("2026-10-10T10:00:00.000Z");
const SENT = new Date("2026-10-01T08:00:00.000Z");
const FIRST_SENT = new Date("2026-09-20T08:00:00.000Z");

// Who acts is recorded by e-mail - in the history as on a quote they own.
const ctx: LifecycleContext = { at: AT, today: TODAY, userId: "user-1", userEmail: "martin@forwarder.cz" };

const state = (over: Partial<LifecycleState> = {}): LifecycleState => ({
  status: "draft",
  substatus: null,
  lostReason: null,
  lostComment: null,
  sentAt: null,
  firstSentAt: null,
  decidedAt: null,
  validUntil: null,
  lastContactAt: null,
  ownerUserId: null,
  ownerLabel: "",
  shipmentId: null,
  shipmentJobNumber: null,
  createdAt: new Date("2026-09-15T08:00:00.000Z"),
  ...over,
});

/** The change, or a failure of the test when the rules say "no change". */
function changed(from: LifecycleState, change: StatusChange, by: LifecycleContext = ctx) {
  const result = applyTransition(from, change, by);
  if (!result.changed) throw new Error(`expected ${from.status} -> ${change.to} to be a change`);
  return result;
}

/** The code the rules refuse a change with, or null when they accept it. */
function refusal(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof LifecycleError) return err.code;
    throw err;
  }
}

const TARGETS = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost"];

// The status table the owner approved, written out once more on purpose: the test must not
// read its expectations from the code it checks.
const ALLOWED: Record<string, string[]> = {
  draft: ["ready_to_send", "quoted", "lost"],
  ready_to_send: ["quoted", "draft", "lost"],
  quoted: ["feedback", "revised", "won", "lost"],
  feedback: ["revised", "won", "lost", "quoted"],
  revised: ["quoted", "won", "lost"],
  won: ["revised"],
  lost: ["draft"],
  // stored by the old bulk menu
  expired: ["draft", "revised"],
  replaced: [],
  // a status this code does not know
  on_hold: ["draft"],
};

describe("stateOf and columnsOf", () => {
  const quoted = state({
    status: "quoted",
    sentAt: SENT,
    firstSentAt: FIRST_SENT,
    lastContactAt: SENT,
    validUntil: "2026-10-25",
    ownerUserId: "user-1",
    ownerLabel: "Martin",
    shipmentId: "shipment-1",
    shipmentJobNumber: "CZ2610001",
  });

  it("reads the lifecycle facts off a row and nothing else", () => {
    const row = { ...quoted, id: "row-1", quoteNumber: "QCZ20261010001", data: { quoteStatus: "quoted" }, terms: "", dataVersion: 3 };
    expect(stateOf(row)).toEqual(quoted);
  });

  it("stores every fact but the creation date, which the row has by itself", () => {
    const columns: Partial<LifecycleState> = { ...quoted };
    delete columns.createdAt;
    expect(columnsOf(quoted)).toEqual(columns);
  });

  it("round-trips: the columns of a state read back as that state", () => {
    expect(stateOf({ ...columnsOf(quoted), createdAt: quoted.createdAt })).toEqual(quoted);
  });

  it("reads a text without the spaces it ends with", () => {
    const row = state({
      status: "on hold ",
      substatus: "Negotiation ",
      lostReason: "Other: see comment  ",
      lostComment: `${"x".repeat(3999)} `,
      ownerLabel: `${"a".repeat(199)} `,
    });
    expect(stateOf(row)).toEqual({
      ...row,
      status: "on hold",
      substatus: "Negotiation",
      lostReason: "Other: see comment",
      lostComment: "x".repeat(3999),
      ownerLabel: "a".repeat(199),
    });
  });

  it("takes spaces only and only from the end, as btrim would; no text stays no text", () => {
    const row = state({ status: "on  hold", substatus: null, lostReason: "ends in a tab\t", lostComment: "ends in a line break \n ", ownerLabel: "" });
    expect(stateOf(row)).toEqual({ ...row, lostComment: "ends in a line break \n" });
  });

  it("reads an adopted row as a state whose mirror the derivation reads back as the columns hold it", () => {
    // quote_lifecycle_of (migration 0004) for a text, written out here: left(btrim(text), N).
    const derived = (text: unknown, max: number) => Array.from(String(text).replace(/^ +| +$/g, "")).slice(0, max).join("");
    const legacy = { lostComment: `${"x".repeat(3999)} ${"y".repeat(50)}`, salesOwner: `${"a".repeat(199)} bbb` };
    const adopted = state({ status: "lost", lostComment: derived(legacy.lostComment, 4000), ownerLabel: derived(legacy.salesOwner, 200) });
    // The cut ends in a space: what the derivation would not read back.
    expect(adopted.lostComment).toBe(`${"x".repeat(3999)} `);
    expect(adopted.ownerLabel).toBe(`${"a".repeat(199)} `);

    const read = stateOf(adopted);
    const columns = columnsOf(read);
    const { set } = mirrorOf(read);
    expect(columns).toMatchObject({ lostComment: "x".repeat(3999), ownerLabel: "a".repeat(199) });
    expect(derived(set.lostComment, 4000)).toBe(columns.lostComment);
    expect(derived(set.salesOwner, 200)).toBe(columns.ownerLabel);
  });
});

describe("status sets", () => {
  it("names the open, awaiting and sent statuses", () => {
    expect(OPEN).toEqual(["draft", "ready_to_send", "quoted", "feedback", "revised"]);
    expect(AWAITING).toEqual(["quoted", "feedback"]);
    // Not Revised: since revisions are new quotes, that is what a quote starts as before it is sent.
    expect(SENT_EVIDENCE).toEqual(["quoted", "feedback", "won", "expired", "replaced"]);
    expect(PRICING_CLOSED).toEqual(["quoted", "feedback", "won", "lost", "expired", "replaced"]);
    expect(FOLLOW_UP_INTERVAL_DAYS).toBe(3);
  });

  it("gives every settable status its win probability", () => {
    expect(WIN_PROBABILITY).toEqual({ draft: 10, ready_to_send: 20, quoted: 30, feedback: 60, revised: 50, won: 100, lost: 0 });
    expect(Object.keys(WIN_PROBABILITY).sort()).toEqual([...TARGETS].sort());
  });

  it("only leads to statuses a quote can be set to", () => {
    for (const next of Object.values(NEXT)) {
      for (const status of next) expect(TARGETS).toContain(status);
    }
  });

  it("names every status a quote can show: the settable ones, Expired and Replaced", () => {
    expect(SHOWN_STATUSES).toEqual([...TARGETS, "expired", "replaced"]);
  });
});

describe("effectiveStatus", () => {
  it("shows a Quoted or Feedback quote as Expired once its validity date has passed", () => {
    expect(effectiveStatus("quoted", YESTERDAY, TODAY)).toBe("expired");
    expect(effectiveStatus("feedback", YESTERDAY, TODAY)).toBe("expired");
  });

  it("keeps a quote valid through the whole last day", () => {
    expect(effectiveStatus("quoted", TODAY, TODAY)).toBe("quoted");
    expect(effectiveStatus("feedback", "2026-10-11", TODAY)).toBe("feedback");
  });

  it("never expires a quote without a validity date", () => {
    expect(effectiveStatus("quoted", null, TODAY)).toBe("quoted");
    expect(effectiveStatus("feedback", null, TODAY)).toBe("feedback");
  });

  it("expires only quotes that are with the customer", () => {
    for (const status of ["draft", "ready_to_send", "revised", "won", "lost", "on_hold"]) {
      expect(effectiveStatus(status, YESTERDAY, TODAY)).toBe(status);
    }
  });

  it("leaves a stored Expired what it is", () => {
    expect(effectiveStatus("expired", null, TODAY)).toBe("expired");
    expect(effectiveStatus("expired", "2026-12-31", TODAY)).toBe("expired");
  });

  it("turns at midnight in Prague, not in UTC", () => {
    // Valid until 10 October: 23:59:59 in Prague (summer time, UTC+2) is still that day.
    expect(effectiveStatus("quoted", "2026-10-10", businessDay(new Date("2026-10-10T21:59:59Z")))).toBe("quoted");
    expect(effectiveStatus("quoted", "2026-10-10", businessDay(new Date("2026-10-10T22:00:00Z")))).toBe("expired");
    // Winter time, UTC+1.
    expect(effectiveStatus("quoted", "2026-01-15", businessDay(new Date("2026-01-15T22:59:59Z")))).toBe("quoted");
    expect(effectiveStatus("quoted", "2026-01-15", businessDay(new Date("2026-01-15T23:00:00Z")))).toBe("expired");
  });
});

describe("allowedTransitions", () => {
  it("offers what the status table allows", () => {
    for (const [status, next] of Object.entries(ALLOWED)) {
      const offered = allowedTransitions(state({ status }), TODAY);
      expect(offered, status).toEqual(next);
    }
  });

  it("judges an expired quote as Expired", () => {
    expect(allowedTransitions(state({ status: "quoted", validUntil: YESTERDAY }), TODAY)).toEqual(["draft", "revised"]);
    expect(allowedTransitions(state({ status: "feedback", validUntil: YESTERDAY }), TODAY)).toEqual(["draft", "revised"]);
    expect(allowedTransitions(state({ status: "quoted", validUntil: TODAY }), TODAY)).toEqual(["feedback", "revised", "won", "lost"]);
  });

  it("also offers Won on an open or expired quote that has a shipment", () => {
    const linked = { shipmentId: "shipment-1", shipmentJobNumber: "CZ00000042" };
    expect(allowedTransitions(state({ status: "draft", ...linked }), TODAY)).toEqual(["ready_to_send", "quoted", "lost", "won"]);
    expect(allowedTransitions(state({ status: "ready_to_send", ...linked }), TODAY)).toEqual(["quoted", "draft", "lost", "won"]);
    expect(allowedTransitions(state({ status: "quoted", validUntil: YESTERDAY, ...linked }), TODAY)).toEqual(["draft", "revised", "won"]);
    expect(allowedTransitions(state({ status: "expired", ...linked }), TODAY)).toEqual(["draft", "revised", "won"]);
    // Already on offer: not listed twice.
    expect(allowedTransitions(state({ status: "quoted", ...linked }), TODAY)).toEqual(["feedback", "revised", "won", "lost"]);
  });

  it("does not offer Won on a closed quote because of a shipment", () => {
    const linked = { shipmentId: "shipment-1" };
    expect(allowedTransitions(state({ status: "lost", ...linked }), TODAY)).toEqual(["draft"]);
    expect(allowedTransitions(state({ status: "won", ...linked }), TODAY)).toEqual(["revised"]);
    expect(allowedTransitions(state({ status: "on_hold", ...linked }), TODAY)).toEqual(["draft"]);
  });

  it("is not fooled by a status named like an object member", () => {
    expect(allowedTransitions(state({ status: "constructor" }), TODAY)).toEqual(["draft"]);
    expect(allowedTransitions(state({ status: "__proto__" }), TODAY)).toEqual(["draft"]);
  });
});

describe("applyTransition", () => {
  it("allows exactly the pairs of the status table", () => {
    for (const [from, next] of Object.entries(ALLOWED)) {
      for (const to of TARGETS) {
        const run = () => applyTransition(state({ status: from }), { to }, ctx);
        if (to === from) {
          expect(run(), `${from} -> ${to}`).toEqual({ changed: false });
        } else if (next.includes(to) && to !== "revised") {
          const result = run();
          expect(result.changed, `${from} -> ${to}`).toBe(true);
          if (result.changed) expect(result.state.status).toBe(to);
        } else {
          expect(refusal(run), `${from} -> ${to}`).toBe("not_allowed");
        }
      }
    }
  });

  it("never makes a quote Revised itself: its revision is a new quote (applyRevision)", () => {
    for (const from of ["quoted", "feedback", "expired"]) {
      expect(() => applyTransition(state({ status: from }), { to: "revised" }, ctx)).toThrow("a quote that was sent is revised as a new quote");
    }
  });

  it("says in words why a move is refused", () => {
    expect(() => applyTransition(state({ status: "won" }), { to: "draft" }, ctx)).toThrow("a quote cannot go from Won to Draft");
    expect(() => applyTransition(state({ status: "draft" }), { to: "won" }, ctx)).toThrow("a quote cannot go from Draft to Won");
    expect(() => applyTransition(state({ status: "ready_to_send" }), { to: "feedback" }, ctx)).toThrow(
      "a quote cannot go from Ready to Send to Feedback",
    );
    expect(() => applyTransition(state({ status: "on_hold" }), { to: "quoted" }, ctx)).toThrow('a quote cannot go from "on_hold" to Quoted');
  });

  it("never accepts Expired, or a status that does not exist, as a target", () => {
    for (const from of Object.keys(ALLOWED)) {
      expect(refusal(() => applyTransition(state({ status: from }), { to: "expired" }, ctx)), from).toBe("invalid");
    }
    expect(refusal(() => applyTransition(state(), { to: "on_hold" }, ctx))).toBe("invalid");
    expect(refusal(() => applyTransition(state(), { to: "" }, ctx))).toBe("invalid");
    expect(refusal(() => applyTransition(state(), { to: "constructor" }, ctx))).toBe("invalid");
  });

  it("treats the status a quote already has as no change: nothing dated, no history line", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT, validUntil: "2026-10-20" });
    expect(applyTransition(quoted, { to: "quoted", validityDays: 30, comment: "again" }, ctx)).toEqual({ changed: false });
    expect(applyTransition(state({ status: "won", decidedAt: SENT }), { to: "won" }, ctx)).toEqual({ changed: false });
    expect(applyTransition(state({ status: "lost" }), { to: "lost", lostReason: "Pricing: Price too high" }, ctx)).toEqual({ changed: false });
  });

  it("does not touch the state it was given", () => {
    const before = state({ status: "draft" });
    const copy = structuredClone(before);
    changed(before, { to: "quoted", validityDays: 15 });
    expect(before).toEqual(copy);
  });

  describe("to Quoted", () => {
    it("stamps the sending and the first sending, and restarts the follow-up clock", () => {
      const { state: next } = changed(state({ status: "ready_to_send" }), { to: "quoted" });
      expect(next.status).toBe("quoted");
      expect(next.sentAt).toEqual(AT);
      expect(next.firstSentAt).toEqual(AT);
      expect(next.lastContactAt).toEqual(AT);
      expect(next.decidedAt).toBeNull();
    });

    it("can be reached straight from a Draft", () => {
      expect(changed(state({ status: "draft" }), { to: "quoted" }).state.sentAt).toEqual(AT);
    });

    it("keeps the first sent date on a re-send and moves the last one", () => {
      const revised = state({ status: "revised", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: SENT });
      const { state: next } = changed(revised, { to: "quoted" });
      expect(next.firstSentAt).toEqual(FIRST_SENT);
      expect(next.sentAt).toEqual(AT);
      expect(next.lastContactAt).toEqual(AT);
    });

    it("clears the sub-status when sent again after feedback", () => {
      const feedback = state({ status: "feedback", substatus: "Negotiation", sentAt: SENT, firstSentAt: SENT });
      expect(changed(feedback, { to: "quoted" }).state.substatus).toBeNull();
    });

    it("keeps a validity that still holds, days or not", () => {
      const draft = state({ status: "draft", validUntil: "2026-10-25" });
      expect(changed(draft, { to: "quoted" }).state.validUntil).toBe("2026-10-25");
      expect(changed(draft, { to: "quoted", validityDays: 30 }).state.validUntil).toBe("2026-10-25");
      // The last day itself still holds.
      expect(changed(state({ validUntil: TODAY }), { to: "quoted", validityDays: 30 }).state.validUntil).toBe(TODAY);
    });

    it("sets today + N days on a quote without a validity", () => {
      expect(changed(state(), { to: "quoted", validityDays: 15 }).state.validUntil).toBe("2026-10-25");
      expect(changed(state(), { to: "quoted", validityDays: 1 }).state.validUntil).toBe("2026-10-11");
      expect(changed(state(), { to: "quoted", validityDays: 365 }).state.validUntil).toBe("2027-10-10");
    });

    it("counts the days from the business day, not from the UTC date", () => {
      // 23:30 UTC on the 10th is already the 11th in Prague.
      const late: LifecycleContext = { ...ctx, at: new Date("2026-10-10T23:30:00.000Z"), today: "2026-10-11" };
      expect(changed(state(), { to: "quoted", validityDays: 15 }, late).state.validUntil).toBe("2026-10-26");
    });

    it("leaves a quote without a validity without one when no days are given", () => {
      expect(changed(state(), { to: "quoted" }).state.validUntil).toBeNull();
    });

    it("replaces a validity that has passed when days are given", () => {
      const revised = state({ status: "revised", validUntil: "2026-09-30", sentAt: SENT, firstSentAt: SENT });
      expect(changed(revised, { to: "quoted", validityDays: 15 }).state.validUntil).toBe("2026-10-25");
    });

    it("refuses to send a quote whose validity has passed when no days are given", () => {
      // Refused because of the state the quote is in: the same request is fine on another quote.
      const revised = state({ status: "revised", validUntil: YESTERDAY, sentAt: SENT, firstSentAt: SENT });
      expect(refusal(() => applyTransition(revised, { to: "quoted" }, ctx))).toBe("not_allowed");
      expect(() => applyTransition(revised, { to: "quoted" }, ctx)).toThrow("the validity date has passed - choose a new validity");
    });

    it("refuses days outside 1..365", () => {
      for (const validityDays of [0, -1, 366, 1.5, Number.NaN]) {
        expect(refusal(() => applyTransition(state(), { to: "quoted", validityDays }, ctx)), String(validityDays)).toBe("invalid");
      }
    });

    it("leaves the validity alone on every other change", () => {
      const quoted = state({ status: "quoted", validUntil: "2026-10-25", sentAt: SENT, firstSentAt: SENT });
      for (const to of ["feedback", "won", "lost"]) {
        expect(changed(quoted, { to, validityDays: 30 }).state.validUntil, to).toBe("2026-10-25");
      }
    });
  });

  describe("to Feedback", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: SENT });

    it("counts as a contact, without touching the sent dates, and keeps no sub-status", () => {
      const { state: next, entry } = changed(quoted, { to: "feedback" });
      expect(next.substatus).toBeNull();
      expect(next.lastContactAt).toEqual(AT);
      expect(next.sentAt).toEqual(SENT);
      expect(next.firstSentAt).toEqual(FIRST_SENT);
      expect(entry).not.toHaveProperty("substatus");
    });

    it("is no change when the quote is in Feedback already", () => {
      // What the bulk "Set status: Feedback" sends for a quote that already is in Feedback.
      const feedback = state({ status: "feedback", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT });
      expect(applyTransition(feedback, { to: "feedback" }, ctx)).toEqual({ changed: false });
    });

    it("clears a sub-status stored by older code as soon as the quote changes status", () => {
      const old = state({ status: "quoted", substatus: "Negotiation", sentAt: SENT, firstSentAt: SENT });
      expect(changed(old, { to: "feedback" }).state.substatus).toBeNull();
    });

    it("loses its sub-status when the quote moves on", () => {
      const feedback = state({ status: "feedback", substatus: "Negotiation", sentAt: SENT, firstSentAt: SENT });
      for (const to of ["won", "lost", "quoted"]) {
        expect(changed(feedback, { to }).state.substatus, to).toBeNull();
      }
    });
  });

  describe("to Won and Lost", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: SENT, validUntil: "2026-10-25" });

    it("stamps the decision date on Won", () => {
      const { state: next, entry } = changed(quoted, { to: "won", lostReason: "Pricing: Price too high", comment: "confirmed by phone" });
      expect(next.decidedAt).toEqual(AT);
      // A reason sent along by mistake is not kept on a Won quote, and its comment is a line of
      // the history, not a lost comment.
      expect(next.lostReason).toBeNull();
      expect(next.lostComment).toBeNull();
      expect(entry.comment).toBe("confirmed by phone");
      expect(entry).not.toHaveProperty("lostReason");
    });

    it("keeps a comment as the lost comment on no change but Lost", () => {
      for (const [from, next] of Object.entries(ALLOWED)) {
        for (const to of next.filter((status) => status !== "lost" && status !== "revised")) {
          const { state: after, entry } = changed(state({ status: from }), { to, comment: "checked with ops" });
          expect(after.lostComment, `${from} -> ${to}`).toBeNull();
          expect(entry.comment, `${from} -> ${to}`).toBe("checked with ops");
        }
      }
    });

    it("stores the reason and the comment on Lost", () => {
      const { state: next, entry } = changed(quoted, { to: "lost", lostReason: " Pricing: Price too high ", comment: " too dear " });
      expect(next.decidedAt).toEqual(AT);
      expect(next.lostReason).toBe("Pricing: Price too high");
      expect(next.lostComment).toBe("too dear");
      expect(entry).toMatchObject({ status: "lost", lostReason: "Pricing: Price too high", comment: "too dear" });
    });

    it("cuts the lost reason to 500 characters", () => {
      const { state: next, entry } = changed(quoted, { to: "lost", lostReason: "x".repeat(600) });
      expect(next.lostReason).toHaveLength(500);
      expect(entry.lostReason).toBe(next.lostReason);
    });

    it("accepts Lost without a reason", () => {
      const { state: next, entry } = changed(state({ status: "draft" }), { to: "lost" });
      expect(next.lostReason).toBeNull();
      expect(next.lostComment).toBeNull();
      expect(entry).not.toHaveProperty("lostReason");
    });

    it("keeps the sent dates and the last contact", () => {
      for (const to of ["won", "lost"]) {
        const { state: next } = changed(quoted, { to });
        expect(next.sentAt).toEqual(SENT);
        expect(next.firstSentAt).toEqual(FIRST_SENT);
        expect(next.lastContactAt).toEqual(SENT);
      }
    });
  });

  describe("back to Draft, Ready to Send or Revised", () => {
    it("clears what described the decision when a Lost quote is reopened", () => {
      const lost = state({
        status: "lost",
        lostReason: "Pricing: Price too high",
        lostComment: "too dear",
        decidedAt: SENT,
        sentAt: SENT,
        firstSentAt: FIRST_SENT,
        lastContactAt: SENT,
      });
      const { state: next } = changed(lost, { to: "draft" });
      expect(next.lostReason).toBeNull();
      expect(next.lostComment).toBeNull();
      expect(next.decidedAt).toBeNull();
      // It did go out once: that stays known.
      expect(next.sentAt).toEqual(SENT);
      expect(next.firstSentAt).toEqual(FIRST_SENT);
      expect(next.lastContactAt).toEqual(SENT);
    });


    it("dates nothing", () => {
      const { state: next } = changed(state({ status: "draft" }), { to: "ready_to_send" });
      expect(next).toEqual(state({ status: "ready_to_send" }));
    });
  });

  describe("an expired quote", () => {
    const expired = state({ status: "quoted", validUntil: YESTERDAY, sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT });

    it("is not Quoted for the rules: only Draft and Revised are open to it", () => {
      expect(refusal(() => applyTransition(expired, { to: "quoted", validityDays: 15 }, ctx))).toBe("not_allowed");
      expect(() => applyTransition(expired, { to: "won" }, ctx)).toThrow("a quote cannot go from Expired to Won");
      expect(refusal(() => applyTransition(expired, { to: "feedback" }, ctx))).toBe("not_allowed");
      expect(refusal(() => applyTransition(expired, { to: "lost" }, ctx))).toBe("not_allowed");
      expect(allowedTransitions(expired, TODAY)).toEqual(["draft", "revised"]);
      expect(changed(expired, { to: "draft" }).state.status).toBe("draft");
    });

    it("can be marked Won when a shipment exists", () => {
      const { state: next } = changed({ ...expired, shipmentId: "shipment-1" }, { to: "won" });
      expect(next.status).toBe("won");
      expect(next.decidedAt).toEqual(AT);
    });
  });

  it("can be marked Won straight from a Draft when a shipment exists, without an invented sent date", () => {
    const { state: next } = changed(state({ status: "draft", shipmentId: "shipment-1" }), { to: "won" });
    expect(next.status).toBe("won");
    expect(next.sentAt).toBeNull();
    expect(next.firstSentAt).toBeNull();
  });

  describe("the history line", () => {
    it("says what happened, when, and who did it", () => {
      const { entry } = changed(state(), { to: "ready_to_send" });
      expect(entry).toEqual({ kind: "status", status: "ready_to_send", at: "2026-10-10T10:00:00.000Z", user: "martin@forwarder.cz", userId: "user-1" });
    });

    it("still records the user id when the e-mail could not be resolved", () => {
      const { entry } = changed(state(), { to: "ready_to_send" }, { ...ctx, userEmail: "" });
      expect(entry).toEqual({ kind: "status", status: "ready_to_send", at: "2026-10-10T10:00:00.000Z", userId: "user-1" });
    });

    it("carries the comment, trimmed, and none when it is blank", () => {
      expect(changed(state(), { to: "ready_to_send", comment: "  checked with ops " }).entry.comment).toBe("checked with ops");
      expect(changed(state(), { to: "ready_to_send", comment: "   " }).entry).not.toHaveProperty("comment");
    });

    it("cuts a long comment without splitting a character", () => {
      const { entry, state: next } = changed(state(), { to: "lost", comment: `${"x".repeat(3999)}😀😀` });
      expect(Array.from(entry.comment ?? "")).toHaveLength(4000);
      expect(entry.comment?.endsWith("😀")).toBe(true);
      expect(next.lostComment).toBe(entry.comment);
    });

    it("names the status the quote leaves when that status is all that says the quote went out", () => {
      // Set to Quoted - or on from there - in bulk before sendings were dated: no sent date.
      for (const [from, to] of [
        ["quoted", "lost"],
        ["feedback", "lost"],
        ["quoted", "feedback"],
        ["expired", "draft"],
      ]) {
        expect(changed(state({ status: from }), { to }).entry, `${from} -> ${to}`).toEqual({
          kind: "status",
          status: to,
          from,
          at: "2026-10-10T10:00:00.000Z",
          user: "martin@forwarder.cz",
          userId: "user-1",
        });
      }
    });

    it("names it as stored: Quoted for a quote that only shows as Expired", () => {
      const expired = state({ status: "quoted", validUntil: YESTERDAY });
      expect(changed(expired, { to: "draft" }).entry).toMatchObject({ status: "draft", from: "quoted" });
    });

    it("does not name it when a sent date says the quote went out, or when the status says nothing of the kind", () => {
      const sent = state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT });
      expect(changed(sent, { to: "lost" }).entry).not.toHaveProperty("from");
      for (const [from, to] of [
        ["draft", "lost"],
        ["ready_to_send", "draft"],
        ["lost", "draft"],
        ["on_hold", "draft"],
      ]) {
        expect(changed(state({ status: from }), { to }).entry, `${from} -> ${to}`).not.toHaveProperty("from");
      }
    });
  });
});

describe("newQuote", () => {
  it("starts as a Draft owned by whoever created it, recorded by their e-mail", () => {
    expect(newQuote(ctx).state).toEqual(state({ status: "draft", ownerUserId: "user-1", ownerLabel: "martin@forwarder.cz", createdAt: AT }));
  });

  it("starts its history with 'Draft created' and the creator's e-mail", () => {
    expect(newQuote(ctx).entry).toEqual({ kind: "status", status: "draft", at: "2026-10-10T10:00:00.000Z", user: "martin@forwarder.cz", userId: "user-1" });
  });

  it("mirrors into the keys the document of a new quote always had", () => {
    expect(mirrorOf(newQuote(ctx).state).set).toEqual({ quoteStatus: "draft", winProbability: 10, salesOwner: "martin@forwarder.cz" });
  });

  it("has an owner user but no label when the e-mail could not be resolved", () => {
    const { state: created, entry } = newQuote({ ...ctx, userEmail: "" });
    expect(created.ownerUserId).toBe("user-1");
    expect(created.ownerLabel).toBe("");
    expect(mirrorOf(created).set).not.toHaveProperty("salesOwner");
    expect(entry).toEqual({ kind: "status", status: "draft", at: "2026-10-10T10:00:00.000Z", userId: "user-1" });
  });

  it("stores the label the way the database reads it back: trimmed, at most 200 characters", () => {
    expect(newQuote({ ...ctx, userEmail: "  martin@forwarder.cz " }).state.ownerLabel).toBe("martin@forwarder.cz");
    expect(newQuote({ ...ctx, userEmail: "x".repeat(300) }).state.ownerLabel).toHaveLength(200);
  });
});

describe("ownerLabelOf", () => {
  it("is the e-mail as the database reads it back from the document: trimmed, at most 200 characters", () => {
    expect(ownerLabelOf(" jana@forwarder.cz ")).toBe("jana@forwarder.cz");
    expect(ownerLabelOf("x".repeat(300))).toHaveLength(200);
    expect(ownerLabelOf("")).toBe("");
    expect(ownerLabelOf(undefined)).toBe("");
  });
});

describe("applyValidity", () => {
  it("sets the date on a quote that was never sent, without a history line", () => {
    for (const status of ["draft", "ready_to_send"]) {
      const result = applyValidity(state({ status }), "2026-11-01", ctx);
      expect(result).toEqual({ changed: true, state: state({ status, validUntil: "2026-11-01" }), entry: null });
    }
  });

  it("writes a history line once the customer has the quote", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: "2026-10-25" });
    const result = applyValidity(quoted, "2026-11-01", ctx);
    expect(result).toEqual({
      changed: true,
      state: { ...quoted, validUntil: "2026-11-01" },
      entry: { kind: "validity", at: "2026-10-10T10:00:00.000Z", user: "martin@forwarder.cz", userId: "user-1", comment: "Valid until 2026-11-01 (was 2026-10-25)" },
    });
  });

  it("writes one for a reopened Draft too: it was sent before", () => {
    const reopened = state({ status: "draft", sentAt: SENT, firstSentAt: SENT });
    const result = applyValidity(reopened, "2026-11-01", ctx);
    expect(result.changed && result.entry?.comment).toBe("Valid until 2026-11-01");
  });

  it("goes by the first sending alone", () => {
    // An adopted quote can know its first sending from the history without a last sent date.
    const sentOnce = applyValidity(state({ status: "revised", firstSentAt: FIRST_SENT }), "2026-11-01", ctx);
    expect(sentOnce.changed && sentOnce.entry?.comment).toBe("Valid until 2026-11-01");
    const neverSent = applyValidity(state({ status: "draft", sentAt: SENT }), "2026-11-01", ctx);
    expect(neverSent.changed && neverSent.entry).toBeNull();
  });

  it("can take the date away", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: "2026-10-25" });
    const result = applyValidity(quoted, null, ctx);
    expect(result.changed && result.state.validUntil).toBeNull();
    expect(result.changed && result.entry?.comment).toBe("No validity date (was 2026-10-25)");
  });

  it("is no change when the date is the one the quote has", () => {
    expect(applyValidity(state({ status: "quoted", firstSentAt: SENT, validUntil: "2026-10-25" }), "2026-10-25", ctx)).toEqual({ changed: false });
    expect(applyValidity(state(), null, ctx)).toEqual({ changed: false });
  });

  it("brings an expired quote back by extending it", () => {
    const expired = state({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: YESTERDAY });
    const result = applyValidity(expired, "2026-11-10", ctx);
    expect(result.changed && effectiveStatus(result.state.status, result.state.validUntil, TODAY)).toBe("quoted");
  });

  it("is refused on a decided quote", () => {
    expect(() => applyValidity(state({ status: "won" }), "2026-11-01", ctx)).toThrow("the validity of a Won quote cannot be changed");
    expect(refusal(() => applyValidity(state({ status: "lost" }), null, ctx))).toBe("not_allowed");
  });

  it("accepts the first and the last day the database reads back", () => {
    for (const date of ["2000-01-01", "2099-12-31"]) {
      const result = applyValidity(state(), date, ctx);
      expect(result.changed && result.state.validUntil, date).toBe(date);
    }
  });

  it("refuses what is not a real date", () => {
    for (const date of ["2026-02-31", "01.11.2026", "2026-11-01T00:00:00Z", "", "1999-12-31", "2100-01-01"]) {
      expect(refusal(() => applyValidity(state(), date, ctx)), date).toBe("invalid");
    }
  });
});

describe("applyOwner", () => {
  const jana = { userId: "user-2", email: "jana@forwarder.cz" };
  const martins = state({ status: "quoted", sentAt: SENT, firstSentAt: SENT, ownerUserId: "user-1", ownerLabel: "martin@forwarder.cz" });

  it("hands the quote to a user under that user's e-mail, with a history line", () => {
    expect(applyOwner(martins, jana, ctx)).toEqual({
      changed: true,
      state: { ...martins, ownerUserId: "user-2", ownerLabel: "jana@forwarder.cz" },
      entry: { kind: "owner", at: "2026-10-10T10:00:00.000Z", user: "martin@forwarder.cz", userId: "user-1", comment: "Owner: jana@forwarder.cz (was martin@forwarder.cz)" },
    });
  });

  it("touches nothing but the owner", () => {
    const result = applyOwner(martins, jana, ctx);
    expect(result.changed && { ...result.state, ownerUserId: martins.ownerUserId, ownerLabel: martins.ownerLabel }).toEqual(martins);
  });

  it("can leave the quote with nobody", () => {
    const result = applyOwner(martins, null, ctx);
    expect(result.changed && result.state).toMatchObject({ ownerUserId: null, ownerLabel: "" });
    expect(result.changed && result.entry.comment).toBe("No owner (was martin@forwarder.cz)");
  });

  it("is no change when the quote already has that owner under that e-mail", () => {
    expect(applyOwner(martins, { userId: "user-1", email: "martin@forwarder.cz" }, ctx)).toEqual({ changed: false });
    expect(applyOwner(state(), null, ctx)).toEqual({ changed: false });
  });

  it("links a quote that only had a typed name to the user, and records the user's e-mail", () => {
    const typed = state({ ownerLabel: "martin k." });
    const result = applyOwner(typed, { userId: "user-1", email: "martin@forwarder.cz" }, ctx);
    expect(result.changed && result.state).toMatchObject({ ownerUserId: "user-1", ownerLabel: "martin@forwarder.cz" });
    expect(result.changed && result.entry.comment).toBe("Owner: martin@forwarder.cz (was martin k.)");
  });

  it("turns the owner's display name of an older quote into their e-mail", () => {
    const named = state({ ownerUserId: "user-1", ownerLabel: "Martin Koubek" });
    const result = applyOwner(named, { userId: "user-1", email: "martin@forwarder.cz" }, ctx);
    expect(result.changed && result.state.ownerLabel).toBe("martin@forwarder.cz");
  });

  it("clears a typed name nobody is linked to", () => {
    const result = applyOwner(state({ ownerLabel: "Petr" }), null, ctx);
    expect(result.changed && result.state.ownerLabel).toBe("");
    expect(result.changed && result.entry.comment).toBe("No owner (was Petr)");
  });

  it("stores the label the way the database reads it back: trimmed, at most 200 characters", () => {
    const padded = applyOwner(state(), { userId: "user-2", email: "  jana@forwarder.cz  " }, ctx);
    expect(padded.changed && padded.state.ownerLabel).toBe("jana@forwarder.cz");
    const long = applyOwner(state(), { userId: "user-2", email: "x".repeat(300) }, ctx);
    expect(long.changed && long.state.ownerLabel).toHaveLength(200);
  });

  it("works on a decided quote too, and mirrors into the key old readers know", () => {
    const lost = state({ status: "lost", lostReason: "Pricing: Price too high", lostComment: "too late", decidedAt: SENT, ownerUserId: "user-1", ownerLabel: "martin@forwarder.cz" });
    const result = applyOwner(lost, jana, ctx);
    expect(result.changed && mirrorOf(result.state).set).toMatchObject({ salesOwner: "jana@forwarder.cz", lostComment: "too late", lostReason: "Pricing: Price too high" });
  });
});

describe("expectStatus", () => {
  it("accepts the status the quote shows", () => {
    expect(() => expectStatus(state({ status: "draft" }), "draft", TODAY)).not.toThrow();
    expect(() => expectStatus(state({ status: "quoted", validUntil: TODAY }), "quoted", TODAY)).not.toThrow();
  });

  it("refuses with the status the quote has by now", () => {
    expect(() => expectStatus(state({ status: "feedback" }), "quoted", TODAY)).toThrow("the quote is now Feedback");
    expect(refusal(() => expectStatus(state({ status: "won" }), "quoted", TODAY))).toBe("not_allowed");
  });

  it("goes by the status shown: an expired quote is Expired, not Quoted", () => {
    const expired = state({ status: "quoted", validUntil: YESTERDAY });
    expect(() => expectStatus(expired, "expired", TODAY)).not.toThrow();
    expect(() => expectStatus(expired, "quoted", TODAY)).toThrow("the quote is now Expired");
  });
});

describe("applyFollowUp", () => {
  it("restarts the clock on a Quoted or Feedback quote and writes a history line", () => {
    for (const status of ["quoted", "feedback"]) {
      const before = state({ status, sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT });
      const { state: next, entry } = applyFollowUp(before, " called, decision next week ", ctx);
      expect(next).toEqual({ ...before, lastContactAt: AT });
      expect(entry).toEqual({ kind: "follow_up", at: "2026-10-10T10:00:00.000Z", user: "martin@forwarder.cz", userId: "user-1", comment: "called, decision next week" });
    }
  });

  it("needs no note", () => {
    expect(applyFollowUp(state({ status: "quoted" }), undefined, ctx).entry).not.toHaveProperty("comment");
  });

  it("is refused on a quote that is not with the customer", () => {
    for (const status of ["draft", "ready_to_send", "revised", "won", "lost", "expired", "on_hold"]) {
      expect(refusal(() => applyFollowUp(state({ status }), "note", ctx)), status).toBe("not_allowed");
    }
  });

  it("is refused on an expired quote", () => {
    const expired = state({ status: "quoted", validUntil: YESTERDAY });
    expect(() => applyFollowUp(expired, "note", ctx)).toThrow("this one is Expired");
  });

  it("takes a note of 2000 characters and refuses a longer one instead of cutting it", () => {
    const quoted = state({ status: "quoted" });
    // Counted by character, after the spaces around it are gone.
    const longest = "😀".repeat(2000);
    expect(applyFollowUp(quoted, ` ${longest} `, ctx).entry.comment).toBe(longest);
    expect(refusal(() => applyFollowUp(quoted, `${longest}!`, ctx))).toBe("invalid");
    expect(() => applyFollowUp(quoted, "x".repeat(2001), ctx)).toThrow("a follow-up note can have at most 2000 characters");
  });
});

describe("applyShipmentLinks", () => {
  const FIRST: LinkedShipment = { id: "shipment-1", jobNumber: "CZ00000101" };
  const SECOND: LinkedShipment = { id: "shipment-2", jobNumber: "CZ00000102" };
  const LATER = new Date("2026-10-12T09:00:00.000Z");
  const later: LifecycleContext = { at: LATER, today: "2026-10-12", userId: "user-2", userEmail: "jana@forwarder.cz" };

  /** A quote as stored: its facts and its history. */
  interface Stored {
    state: LifecycleState;
    timeline: TimelineEntry[];
  }
  const stored = (over: Partial<LifecycleState> = {}, timeline: TimelineEntry[] = []): Stored => ({ state: state(over), timeline });
  const quoted = (over: Partial<LifecycleState> = {}) =>
    stored({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: SENT, validUntil: "2026-10-25", ...over }, [
      { kind: "status", status: "quoted", at: SENT.toISOString(), userId: "user-1" },
    ]);

  /** One sync, and the quote as the service stores it afterwards: the new facts, the lines appended. */
  const sync = (quote: Stored, live: LinkedShipment[], opts: Parameters<typeof applyShipmentLinks>[3] = {}, by: LifecycleContext = ctx) => {
    const change = applyShipmentLinks(quote.state, quote.timeline, live, opts, by);
    return { change, quote: { state: change.state, timeline: [...quote.timeline, ...change.entries] } };
  };
  const shipmentLines = (quote: Stored) => quote.timeline.filter((entry) => entry.kind === "shipment");

  it("links the first shipment that names the quote and says so in the history, without touching the status", () => {
    const before = quoted();
    const { change } = sync(before, [FIRST]);
    expect(change).toEqual({
      changed: true,
      state: { ...before.state, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" },
      entries: [
        {
          kind: "shipment",
          action: "linked",
          shipmentId: "shipment-1",
          jobNumber: "CZ00000101",
          comment: "Shipment CZ00000101 linked",
          at: "2026-10-10T10:00:00.000Z",
          user: "martin@forwarder.cz",
          userId: "user-1",
        },
      ],
      becameWon: false,
      revertedTo: null,
      note: null,
    });
  });

  it("keeps the first shipment as the link when a second one names the quote, and lists the second in the history", () => {
    const linked = sync(quoted(), [FIRST]).quote;
    const { change } = sync(linked, [FIRST, SECOND], {}, later);
    expect(change.changed).toBe(true);
    expect(change.state).toEqual(linked.state);
    expect(change.entries).toEqual([
      {
        kind: "shipment",
        action: "linked",
        shipmentId: "shipment-2",
        jobNumber: "CZ00000102",
        comment: "Shipment CZ00000102 linked",
        at: LATER.toISOString(),
        user: "jana@forwarder.cz",
        userId: "user-2",
      },
    ]);
  });

  it("changes nothing when told the same shipments again: one line per shipment, however often it is said", () => {
    let quote = quoted();
    const changes = [1, 2, 3].map(() => {
      const result = sync(quote, [FIRST, SECOND]);
      quote = result.quote;
      return result.change;
    });
    expect(changes.map((change) => change.changed)).toEqual([true, false, false]);
    expect(changes[2]).toEqual({ changed: false, state: quote.state, entries: [], becameWon: false, revertedTo: null, note: null });
    expect(shipmentLines(quote).map((entry) => [entry.action, entry.shipmentId])).toEqual([
      ["linked", "shipment-1"],
      ["linked", "shipment-2"],
    ]);
  });

  it("moves the link to the next shipment when the first of two is gone", () => {
    const linked = sync(quoted(), [FIRST, SECOND]).quote;
    const { change } = sync(linked, [SECOND], {}, later);
    expect(change.state).toEqual({ ...linked.state, shipmentId: "shipment-2", shipmentJobNumber: "CZ00000102" });
    expect(change.entries).toEqual([
      {
        kind: "shipment",
        action: "removed",
        shipmentId: "shipment-1",
        jobNumber: "CZ00000101",
        comment: "Shipment CZ00000101 removed",
        at: LATER.toISOString(),
        user: "jana@forwarder.cz",
        userId: "user-2",
      },
    ]);
  });

  it("takes the link away with the last shipment and leaves a status nobody's shipment made alone", () => {
    const linked = sync(quoted(), [FIRST]).quote;
    const { change } = sync(linked, []);
    expect(change.state).toEqual(quoted().state);
    expect(change.entries.map((entry) => entry.comment)).toEqual(["Shipment CZ00000101 removed"]);
    expect(change.revertedTo).toBeNull();
  });

  it("knows a shipment again that was removed and comes back: its last line decides", () => {
    let quote = sync(quoted(), [FIRST]).quote;
    quote = sync(quote, []).quote;
    const back = sync(quote, [FIRST]);
    expect(back.change.entries.map((entry) => entry.action)).toEqual(["linked"]);
    expect(sync(back.quote, [FIRST]).change.changed).toBe(false);
    expect(shipmentLines(back.quote).map((entry) => entry.action)).toEqual(["linked", "removed", "linked"]);
  });

  it("is no change for a quote that no shipment names and none ever did", () => {
    const before = quoted();
    expect(sync(before, []).change).toEqual({ changed: false, state: before.state, entries: [], becameWon: false, revertedTo: null, note: null });
  });

  it("does not touch the state or the history it was given", () => {
    const before = quoted();
    const copy = structuredClone(before);
    sync(before, [FIRST], { wonByShipmentId: "shipment-1" });
    expect(before).toEqual(copy);
  });

  describe("a shipment created from the quote", () => {
    it("makes an open quote Won - decided now, the status before kept on the line - together with the link", () => {
      const before = quoted({ status: "feedback", substatus: "Negotiation" });
      const { change } = sync(before, [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.becameWon).toBe(true);
      expect(change.note).toBeNull();
      expect(change.state).toEqual({
        ...before.state,
        status: "won",
        substatus: null,
        decidedAt: AT,
        shipmentId: "shipment-1",
        shipmentJobNumber: "CZ00000101",
      });
      expect(change.entries).toEqual([
        expect.objectContaining({ kind: "shipment", action: "linked", shipmentId: "shipment-1" }),
        {
          kind: "status",
          status: "won",
          from: "feedback",
          shipmentId: "shipment-1",
          jobNumber: "CZ00000101",
          comment: "Shipment CZ00000101 was created from this quote",
          at: "2026-10-10T10:00:00.000Z",
          user: "martin@forwarder.cz",
          userId: "user-1",
        },
      ]);
    });

    it("makes every open status Won", () => {
      for (const status of OPEN) {
        expect(sync(stored({ status }), [FIRST], { wonByShipmentId: "shipment-1" }).change.state.status, status).toBe("won");
      }
    });

    it("makes a never-sent Draft Won without inventing a sent date", () => {
      const { change } = sync(stored(), [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.state).toEqual({ ...state(), status: "won", decidedAt: AT, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" });
      expect(change.entries[1]).toMatchObject({ status: "won", from: "draft" });
    });

    it("makes a quote shown as Expired Won, and remembers the status it is stored with", () => {
      const { change } = sync(quoted({ validUntil: YESTERDAY }), [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.becameWon).toBe(true);
      expect(change.state.status).toBe("won");
      expect(change.state.validUntil).toBe(YESTERDAY);
      expect(change.entries[1]).toMatchObject({ status: "won", from: "quoted" });
    });

    it("makes a quote stored as Expired by the old bulk menu Won too", () => {
      const { change } = sync(stored({ status: "expired" }), [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.state.status).toBe("won");
      expect(change.entries[1]).toMatchObject({ status: "won", from: "expired" });
    });

    it("links a Lost quote and leaves it Lost, and says so", () => {
      const before = stored({ status: "lost", lostReason: "Pricing: Price too high", lostComment: "too late", decidedAt: SENT });
      const { change } = sync(before, [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.state).toEqual({ ...before.state, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" });
      expect(change.entries.map((entry) => entry.kind)).toEqual(["shipment"]);
      expect(change.becameWon).toBe(false);
      expect(change.note).toBe("the quote is Lost and stays Lost");
    });

    it("leaves a status it does not know alone, and says so", () => {
      const { change } = sync(stored({ status: "on_hold" }), [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.state.status).toBe("on_hold");
      expect(change.note).toBe('the quote is "on_hold" and stays "on_hold"');
    });

    it("leaves a quote that is Won already as it is: no second decision date, no line but the link", () => {
      const before = stored({ status: "won", decidedAt: SENT }, [{ kind: "status", status: "won", at: SENT.toISOString(), userId: "user-1" }]);
      const { change } = sync(before, [FIRST], { wonByShipmentId: "shipment-1" });
      expect(change.state).toEqual({ ...before.state, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" });
      expect(change.entries.map((entry) => entry.kind)).toEqual(["shipment"]);
      expect(change.becameWon).toBe(false);
      expect(change.note).toBeNull();
    });

    it("makes the quote Won on a retry as well: the shipment is linked already, the status is not Won yet", () => {
      const linked = sync(quoted(), [FIRST]).quote;
      const { change } = sync(linked, [FIRST], { wonByShipmentId: "shipment-1" }, later);
      expect(change.becameWon).toBe(true);
      expect(change.entries).toEqual([expect.objectContaining({ kind: "status", status: "won", from: "quoted", shipmentId: "shipment-1", at: LATER.toISOString() })]);
    });

    it("marks Won for the second shipment while the first stays the link", () => {
      const linked = sync(quoted(), [FIRST]).quote;
      const { change } = sync(linked, [FIRST, SECOND], { wonByShipmentId: "shipment-2" });
      expect(change.state).toMatchObject({ status: "won", shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" });
      expect(change.entries[1]).toMatchObject({ status: "won", shipmentId: "shipment-2", jobNumber: "CZ00000102" });
    });

    it("marks nothing Won for a shipment that is not among the live ones", () => {
      const { change } = sync(quoted(), [FIRST], { wonByShipmentId: "shipment-9" });
      expect(change.state.status).toBe("quoted");
      expect(change.becameWon).toBe(false);
      expect(change.note).toBeNull();
    });
  });

  describe("the way back", () => {
    const wonByShipment = (from: Stored = quoted()) => sync(from, [FIRST], { wonByShipmentId: "shipment-1" }).quote;

    it("returns a quote a shipment made Won to the status it had once no shipment names it any more", () => {
      const won = wonByShipment();
      const { change } = sync(won, [], {}, later);
      expect(change.revertedTo).toBe("quoted");
      expect(change.state).toEqual(quoted().state);
      expect(change.entries).toEqual([
        expect.objectContaining({ kind: "shipment", action: "removed", shipmentId: "shipment-1" }),
        {
          kind: "status",
          status: "quoted",
          shipmentId: "shipment-1",
          jobNumber: "CZ00000101",
          comment: "Shipment CZ00000101 removed - status back to Quoted",
          at: LATER.toISOString(),
          user: "jana@forwarder.cz",
          userId: "user-2",
        },
      ]);
    });

    it("brings a Feedback quote back to Feedback without a sub-status, whatever its Won line kept", () => {
      const feedback = quoted({ status: "feedback", substatus: "Negotiation" });
      const won = wonByShipment(feedback);
      expect(won.state.substatus).toBeNull();
      const { change, quote } = sync(won, [], {}, later);
      expect(change.revertedTo).toBe("feedback");
      expect(change.state).toEqual({ ...feedback.state, substatus: null });
      expect(mirrorOf(quote.state).remove).toContain("substatus");
      expect(change.entries[1]).toEqual({
        kind: "status",
        status: "feedback",
        shipmentId: "shipment-1",
        jobNumber: "CZ00000101",
        comment: "Shipment CZ00000101 removed - status back to Feedback",
        at: LATER.toISOString(),
        user: "jana@forwarder.cz",
        userId: "user-2",
      });
      // A Won line written while the sub-status before was still kept on it brings none back.
      const kept: Stored = {
        state: won.state,
        timeline: won.timeline.map((entry) => (entry.status === "won" ? ({ ...entry, fromSubstatus: "Negotiation" } as TimelineEntry) : entry)),
      };
      expect(sync(kept, []).change.state).toMatchObject({ status: "feedback", substatus: null });

      // Old data: a Quoted quote that stores a sub-status goes back to Quoted without it.
      expect(sync(wonByShipment(quoted({ substatus: "Negotiation" })), []).change.state).toMatchObject({ status: "quoted", substatus: null });
    });

    it("keeps it Won while another shipment still names the quote, and goes back when that one is gone too", () => {
      let quote = sync(wonByShipment(), [FIRST, SECOND]).quote;
      const oneLeft = sync(quote, [SECOND]);
      expect(oneLeft.change.revertedTo).toBeNull();
      expect(oneLeft.change.state).toMatchObject({ status: "won", shipmentId: "shipment-2" });
      quote = oneLeft.quote;
      const noneLeft = sync(quote, []);
      expect(noneLeft.change.revertedTo).toBe("quoted");
      expect(noneLeft.change.state).toMatchObject({ status: "quoted", decidedAt: null, shipmentId: null, shipmentJobNumber: null });
      expect(noneLeft.change.entries[1]?.comment).toBe("Shipment CZ00000102 removed - status back to Quoted");
    });

    it("returns to Draft when the status before was not an open one", () => {
      const won = wonByShipment(stored({ status: "expired" }));
      const { change } = sync(won, []);
      expect(change.revertedTo).toBe("draft");
      expect(change.state.status).toBe("draft");
      expect(change.entries[1]?.comment).toBe("Shipment CZ00000101 removed - status back to Draft");
    });

    it("shows a quote Expired again when its validity had passed before the shipment", () => {
      const won = wonByShipment(quoted({ validUntil: YESTERDAY }));
      const { change } = sync(won, []);
      expect(change.state.status).toBe("quoted");
      expect(effectiveStatus(change.state.status, change.state.validUntil, TODAY)).toBe("expired");
    });

    it("never touches a Won set by hand, before or after the shipment", () => {
      const byHand = changed({ ...quoted().state }, { to: "won" });
      const before: Stored = { state: byHand.state, timeline: [...quoted().timeline, byHand.entry] };
      const linked = sync(before, [FIRST], { wonByShipmentId: "shipment-1" }).quote;
      const { change } = sync(linked, [], {}, later);
      expect(change.revertedTo).toBeNull();
      expect(change.state).toEqual(before.state);
      expect(change.entries.map((entry) => entry.kind)).toEqual(["shipment"]);

      // Typed into a shipment, marked Won by hand afterwards: the last status line is the user's.
      const typed = sync(quoted(), [FIRST]).quote;
      const marked = changed(typed.state, { to: "won" });
      const { change: after } = sync({ state: marked.state, timeline: [...typed.timeline, marked.entry] }, []);
      expect(after.revertedTo).toBeNull();
      expect(after.state.status).toBe("won");
    });

    it("can be made Won by a shipment again after it went back, and goes back again", () => {
      let quote = sync(wonByShipment(), []).quote;
      quote = sync(quote, [SECOND], { wonByShipmentId: "shipment-2" }, later).quote;
      expect(quote.state).toMatchObject({ status: "won", decidedAt: LATER, shipmentId: "shipment-2" });
      expect(sync(quote, []).change.revertedTo).toBe("quoted");
    });

    it("goes back once: told again that no shipment names the quote, nothing changes", () => {
      const back = sync(wonByShipment(), []).quote;
      expect(sync(back, []).change.changed).toBe(false);
    });
  });

  describe("what the quote knows", () => {
    it("counts the shipment it is linked to as known, also when its history has no line for it", () => {
      const before = quoted({ shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" });
      expect(sync(before, [FIRST]).change.changed).toBe(false);
      expect(sync(before, []).change.entries.map((entry) => entry.comment)).toEqual(["Shipment CZ00000101 removed"]);
    });

    it("restores a link the columns lost although the history knows the shipment - without a second line", () => {
      const linked = sync(quoted(), [FIRST]).quote;
      const { change } = sync({ state: { ...linked.state, shipmentId: null, shipmentJobNumber: null }, timeline: linked.timeline }, [FIRST]);
      expect(change).toMatchObject({ changed: true, entries: [], state: { shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" } });
    });

    it("lists a shipment once when it is named twice in one call", () => {
      expect(sync(quoted(), [FIRST, FIRST]).change.entries).toHaveLength(1);
    });

    it("reads a history that is no list, or holds anything but lines, as empty of shipments", () => {
      const before = quoted();
      for (const timeline of [undefined, null, "abc", { kind: "shipment" }, [1, null, "x", ["shipment"], { kind: "shipment" }, { kind: "shipment", action: "linked", shipmentId: 7 }]]) {
        const change = applyShipmentLinks(before.state, timeline, [FIRST], {}, ctx);
        expect(change.entries.map((entry) => entry.action)).toEqual(["linked"]);
        expect(applyShipmentLinks(before.state, timeline, [], {}, ctx).changed).toBe(false);
      }
    });

    it("takes a status line from before kinds existed for what it is: a Won set by hand", () => {
      const before: Stored = {
        state: state({ status: "won", decidedAt: SENT, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000101" }),
        timeline: [{ status: "won", at: SENT.toISOString(), user: "You" }],
      };
      expect(sync(before, []).change).toMatchObject({ revertedTo: null, state: { status: "won", shipmentId: null } });
    });
  });

  describe("a repair nobody asked for", () => {
    it("says System on its lines and names no user", () => {
      const { change } = sync(quoted(), [FIRST], { automatic: true });
      expect(change.entries).toEqual([
        {
          kind: "shipment",
          action: "linked",
          shipmentId: "shipment-1",
          jobNumber: "CZ00000101",
          comment: "Shipment CZ00000101 linked",
          at: "2026-10-10T10:00:00.000Z",
          user: "System",
          auto: true,
        },
      ]);
    });

    it("marks the way back the same way", () => {
      const won = sync(quoted(), [FIRST], { wonByShipmentId: "shipment-1" }).quote;
      const { change } = sync(won, [], { automatic: true });
      expect(change.revertedTo).toBe("quoted");
      for (const entry of change.entries) {
        expect(entry).toMatchObject({ user: "System", auto: true });
        expect(entry).not.toHaveProperty("userId");
      }
    });

    it("never marks a quote Won by itself", () => {
      expect(sync(quoted(), [FIRST], { automatic: true }).change.state.status).toBe("quoted");
    });
  });

  it("writes what the columns and their mirror can hold: a Won that mirrors as decided, a way back that mirrors as open", () => {
    const won = sync(quoted(), [FIRST], { wonByShipmentId: "shipment-1" }).quote;
    expect(mirrorOf(won.state).set).toMatchObject({ quoteStatus: "won", winProbability: 100, decidedAt: AT.toISOString() });
    const back = sync(won, []).quote;
    expect(mirrorOf(back.state).set).toMatchObject({ quoteStatus: "quoted", winProbability: 30 });
    expect(mirrorOf(back.state).remove).toContain("decidedAt");
    expect(allowedTransitions(sync(quoted(), [FIRST]).quote.state, TODAY)).toContain("won");
  });
});

describe("deletionEntry", () => {
  it("is the line of who deleted the quote and when - of its own kind", () => {
    expect(deletionEntry(ctx)).toEqual({ kind: "deleted", at: AT.toISOString(), userId: "user-1", user: "martin@forwarder.cz" });
  });

  it("records the user id alone when the e-mail cannot be resolved", () => {
    expect(deletionEntry({ ...ctx, userEmail: "" })).toEqual({ kind: "deleted", at: AT.toISOString(), userId: "user-1" });
  });

  it("carries no status: a history read again (quote_lifecycle_of) must not take it for a sending, a contact or a decision", () => {
    expect(deletionEntry(ctx)).not.toHaveProperty("status");
  });
});

describe("isFollowUpDue", () => {
  const now = new Date("2026-10-10T10:00:00.000Z");
  const threeDaysAgo = new Date("2026-10-07T10:00:00.000Z");
  const justUnder = new Date("2026-10-07T10:00:00.001Z");

  it("is due up to the moment three days back - the moment the list query is given", () => {
    expect(followUpDueBefore(now)).toEqual(threeDaysAgo);
    expect(now.getTime() - followUpDueBefore(now).getTime()).toBe(FOLLOW_UP_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("is due once the last contact is 72 hours old", () => {
    expect(isFollowUpDue(state({ status: "quoted", sentAt: SENT, lastContactAt: threeDaysAgo }), now, TODAY)).toBe(true);
    expect(isFollowUpDue(state({ status: "quoted", sentAt: SENT, lastContactAt: justUnder }), now, TODAY)).toBe(false);
    expect(isFollowUpDue(state({ status: "feedback", sentAt: SENT, lastContactAt: threeDaysAgo }), now, TODAY)).toBe(true);
  });

  it("counts from the last contact, not from the sending", () => {
    // Sent long ago, followed up yesterday.
    const followedUp = state({ status: "quoted", sentAt: SENT, lastContactAt: new Date("2026-10-09T10:00:00.000Z") });
    expect(isFollowUpDue(followedUp, now, TODAY)).toBe(false);
  });

  it("counts from the sending when no contact was recorded", () => {
    expect(isFollowUpDue(state({ status: "quoted", sentAt: threeDaysAgo }), now, TODAY)).toBe(true);
    expect(isFollowUpDue(state({ status: "quoted", sentAt: justUnder }), now, TODAY)).toBe(false);
  });

  it("counts from the creation for a Quoted quote that never got a sent date", () => {
    // Set in bulk before sent dates were recorded.
    expect(isFollowUpDue(state({ status: "quoted", createdAt: threeDaysAgo }), now, TODAY)).toBe(true);
    expect(isFollowUpDue(state({ status: "quoted", createdAt: justUnder }), now, TODAY)).toBe(false);
  });

  it("is due on a quote without a validity date", () => {
    expect(isFollowUpDue(state({ status: "quoted", sentAt: SENT, validUntil: null }), now, TODAY)).toBe(true);
  });

  it("is due on a quote that is valid through today", () => {
    expect(isFollowUpDue(state({ status: "quoted", sentAt: SENT, validUntil: TODAY }), now, TODAY)).toBe(true);
  });

  it("is not flagged on an expired quote: that one shows Expired", () => {
    expect(isFollowUpDue(state({ status: "quoted", sentAt: SENT, validUntil: YESTERDAY }), now, TODAY)).toBe(false);
    expect(isFollowUpDue(state({ status: "expired", sentAt: SENT }), now, TODAY)).toBe(false);
  });

  it("is never due on a quote that is not with the customer", () => {
    for (const status of ["draft", "ready_to_send", "revised", "won", "lost", "on_hold"]) {
      expect(isFollowUpDue(state({ status, sentAt: SENT, lastContactAt: SENT }), now, TODAY), status).toBe(false);
    }
  });
});

describe("lastContact", () => {
  it("is the recorded contact, else the sending, else unknown", () => {
    expect(lastContact(state({ sentAt: SENT, lastContactAt: AT }))).toEqual(AT);
    expect(lastContact(state({ sentAt: SENT }))).toEqual(SENT);
    expect(lastContact(state())).toBeNull();
  });
});

describe("wasEverSent", () => {
  const FIRST: LinkedShipment = { id: "shipment-1", jobNumber: "CZ00000101" };
  const line = (over: Partial<TimelineEntry>): TimelineEntry => ({ kind: "status", at: SENT.toISOString(), userId: "user-1", ...over });

  /** A quote as stored - its facts and its history - after the status changes `path` names, in turn. */
  const moved = (from: LifecycleState, path: string[]) => {
    let quote = { state: from, timeline: [] as TimelineEntry[] };
    for (const to of path) {
      const change = changed(quote.state, { to });
      quote = { state: change.state, timeline: [...quote.timeline, change.entry] };
    }
    return quote;
  };

  /** The same after the shipments that name the quote became `live`. */
  const synced = (quote: { state: LifecycleState; timeline: TimelineEntry[] }, live: LinkedShipment[]) => {
    const change = applyShipmentLinks(quote.state, quote.timeline, live, { wonByShipmentId: FIRST.id }, ctx);
    return { state: change.state, timeline: [...quote.timeline, ...change.entries] };
  };

  it("does not count a revision that was never sent: Revised is what a new quote starts as", () => {
    const { state: revision, entry } = revisionOf(state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT }), "QCZ20261010001", ctx);
    expect(wasEverSent(revision, [entry])).toBe(false);
    // Once sent, the sent date tells - and the history, for a quote stored without one.
    const sent = moved(revision, ["quoted", "feedback"]);
    expect(wasEverSent(sent.state, sent.timeline)).toBe(true);
    expect(wasEverSent({ ...sent.state, firstSentAt: null, status: "revised" }, sent.timeline)).toBe(true);
  });

  it("is told by the first sent date, whatever the status and the history", () => {
    expect(wasEverSent(state({ status: "draft", firstSentAt: FIRST_SENT }), [])).toBe(true);
    expect(wasEverSent(state({ status: "lost", firstSentAt: FIRST_SENT }), undefined)).toBe(true);
  });

  it("is told by a stored status that proves the quote went out, also when no sent date was recorded", () => {
    for (const status of ["quoted", "feedback", "won", "expired", "replaced"]) {
      expect(wasEverSent(state({ status }), []), status).toBe(true);
    }
    for (const status of ["draft", "ready_to_send", "revised", "lost", "on_hold"]) {
      expect(wasEverSent(state({ status }), []), status).toBe(false);
    }
  });

  it("is told by a history line that set such a status, or that names it as the status the quote left", () => {
    for (const status of ["quoted", "feedback", "won", "expired", "replaced"]) {
      expect(wasEverSent(state(), [line({ status: "draft" }), line({ status })]), `set ${status}`).toBe(true);
      expect(wasEverSent(state(), [line({ status: "lost", from: status }), line({ status: "draft" })]), `left ${status}`).toBe(true);
    }
    // A line from before kinds existed is a status line as well.
    expect(wasEverSent(state(), [{ status: "quoted", at: SENT.toISOString() }])).toBe(true);
  });

  it("is not told by a history of statuses that prove nothing", () => {
    const history = [line({ status: "draft" }), line({ status: "ready_to_send" }), line({ status: "lost" }), line({ status: "draft", from: "lost" })];
    expect(wasEverSent(state(), history)).toBe(false);
    expect(wasEverSent(state(), [])).toBe(false);
  });

  it("still knows a quote that was Quoted without a sent date after it was reopened through Lost", () => {
    // Not Revised: a revision starts as that before it is sent, so the status alone proves nothing.
    for (const status of ["quoted", "feedback"]) {
      const reopened = moved(state({ status }), ["lost", "draft"]);
      // Nothing in the facts says it went out any more - the line to Lost does.
      expect(reopened.state, status).toMatchObject({ status: "draft", firstSentAt: null, sentAt: null });
      expect(wasEverSent(reopened.state, reopened.timeline), status).toBe(true);
    }
  });

  it("still knows a quote the old bulk menu stored as Expired, or one that only shows as Expired, after it was made a Draft again", () => {
    const stored = moved(state({ status: "expired" }), ["draft"]);
    expect(stored.state).toMatchObject({ status: "draft", firstSentAt: null });
    expect(wasEverSent(stored.state, stored.timeline)).toBe(true);
    const shown = moved(state({ status: "quoted", validUntil: YESTERDAY }), ["draft"]);
    expect(wasEverSent(shown.state, shown.timeline)).toBe(true);
  });

  it("takes a never-sent Draft that a shipment made Won and that went back for what it is: never sent", () => {
    const won = synced({ state: state(), timeline: [line({ status: "draft" })] }, [FIRST]);
    expect(won.state.status).toBe("won");
    const back = synced(won, []);
    expect(back.state).toMatchObject({ status: "draft", firstSentAt: null });
    expect(back.timeline.some((entry) => entry.status === "won" && entry.shipmentId === FIRST.id)).toBe(true);
    expect(wasEverSent(back.state, back.timeline)).toBe(false);
  });

  it("still knows a quote that a shipment made Won from a status that proves it went out, once it is a Draft again", () => {
    // A stored Expired does not come back as Expired: its Won line is what says where it was.
    const back = synced(synced({ state: state({ status: "expired" }), timeline: [] }, [FIRST]), []);
    expect(back.state).toMatchObject({ status: "draft", firstSentAt: null });
    expect(wasEverSent(back.state, back.timeline)).toBe(true);
  });

  it("takes a Won line for a sending only when no shipment made it", () => {
    expect(wasEverSent(state(), [line({ status: "won" })])).toBe(true);
    expect(wasEverSent(state(), [line({ status: "won", shipmentId: FIRST.id })])).toBe(false);
  });

  it("cannot tell a quote that left its Quoted status before lines named the status they left", () => {
    // Set to Quoted in bulk - no date, no line - and lost before this was written: nothing is left to go by.
    const lost = [line({ status: "lost" })];
    expect(wasEverSent(state({ status: "lost" }), lost)).toBe(false);
    const reopened = moved(state({ status: "lost" }), ["draft"]);
    expect(wasEverSent(reopened.state, [...lost, ...reopened.timeline])).toBe(false);
  });

  it("reads a history that is no list, or holds anything but lines, as empty", () => {
    for (const timeline of [undefined, null, "quoted", { status: "quoted" }, [null, "quoted", 7, ["quoted"]]]) {
      expect(wasEverSent(state(), timeline), JSON.stringify(timeline)).toBe(false);
    }
    expect(wasEverSent(state(), [{ status: 7, from: { status: "quoted" } }, { status: "Quoted" }])).toBe(false);
  });
});

describe("mirrorOf", () => {
  it("restates a Quoted state in the keys old readers know", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: AT, validUntil: "2026-10-25", ownerLabel: "Martin" });
    const { set, remove } = mirrorOf(quoted);
    expect(set).toEqual({
      quoteStatus: "quoted",
      sentAt: "2026-10-01T08:00:00.000Z",
      validUntil: "2026-10-25",
      winProbability: 30,
      salesOwner: "Martin",
    });
    expect([...remove].sort()).toEqual(["decidedAt", "lostComment", "lostReason", "substatus", "validityDays"]);
  });

  it("keeps the lost comment of a Lost quote", () => {
    const lost = state({ status: "lost", lostReason: "Pricing: Price too high", lostComment: "too dear", decidedAt: AT, sentAt: SENT, ownerLabel: "Martin" });
    const { set, remove } = mirrorOf(lost);
    expect(set).toMatchObject({
      quoteStatus: "lost",
      lostReason: "Pricing: Price too high",
      lostComment: "too dear",
      decidedAt: "2026-10-10T10:00:00.000Z",
      winProbability: 0,
    });
    expect(remove).not.toContain("lostComment");
    expect(remove).not.toContain("lostReason");
  });

  it("keeps the sent date of a quote that is a Draft again", () => {
    // Old readers take "it went out once" from the document.
    const { set, remove } = mirrorOf(state({ status: "draft", sentAt: SENT, firstSentAt: FIRST_SENT }));
    expect(set.sentAt).toBe("2026-10-01T08:00:00.000Z");
    expect(remove).not.toContain("sentAt");
  });

  it("always removes validityDays and every key without a value", () => {
    const { set, remove } = mirrorOf(state({ status: "draft" }));
    expect(set).toEqual({ quoteStatus: "draft", winProbability: 10 });
    expect([...remove].sort()).toEqual(["decidedAt", "lostComment", "lostReason", "salesOwner", "sentAt", "substatus", "validUntil", "validityDays"]);
  });

  it("gives every settable status its win probability", () => {
    for (const [status, probability] of Object.entries(WIN_PROBABILITY)) {
      expect(mirrorOf(state({ status })).set.winProbability, status).toBe(probability);
    }
  });

  it("leaves the win probability of a status it does not know as stored", () => {
    for (const status of ["expired", "on_hold", "constructor"]) {
      const { set, remove } = mirrorOf(state({ status }));
      expect(set, status).not.toHaveProperty("winProbability");
      expect(remove, status).not.toContain("winProbability");
      expect(set.quoteStatus).toBe(status);
    }
  });

  it("never mirrors the facts that exist only in columns", () => {
    const { set, remove } = mirrorOf(state({ status: "quoted", firstSentAt: FIRST_SENT, lastContactAt: AT, ownerUserId: "user-1", shipmentId: "s-1", shipmentJobNumber: "CZ1" }));
    for (const key of ["firstSentAt", "lastContactAt", "ownerUserId", "shipmentId", "shipmentJobNumber", "createdAt"]) {
      expect(set).not.toHaveProperty(key);
      expect(remove).not.toContain(key);
    }
  });

  it("never sets and removes the same key", () => {
    const { set, remove } = mirrorOf(state({ status: "feedback", substatus: "Negotiation", sentAt: SENT, ownerLabel: "Martin" }));
    expect(remove.filter((key) => key in set)).toEqual([]);
  });
});

describe("legacyUnreadable", () => {
  it("keeps nothing when the columns hold what the document says", () => {
    const quoted = state({ status: "quoted", sentAt: SENT, validUntil: "2026-10-25" });
    const data = { quoteStatus: "quoted", sentAt: "2026-10-01T08:00:00.000Z", validUntil: "2026-10-25", validityDays: 15, timeline: [] };
    expect(legacyUnreadable(quoted, data)).toEqual({});
    expect(legacyUnreadable(state(), { quoteStatus: "draft" })).toEqual({});
  });

  it("keeps a date the adoption could not read", () => {
    const data = { quoteStatus: "draft", sentAt: "yesterday", decidedAt: "last week", validUntil: "2026-02-31" };
    expect(legacyUnreadable(state(), data)).toEqual({
      lifecycleUnreadable: { sentAt: "yesterday", decidedAt: "last week", validUntil: "2026-02-31" },
    });
  });

  it("keeps validityDays only when no date could be worked out from it", () => {
    // Sent date unreadable, so "valid 15 days" never became a date.
    expect(legacyUnreadable(state({ status: "quoted" }), { sentAt: "yesterday", validityDays: 15 })).toEqual({
      lifecycleUnreadable: { sentAt: "yesterday", validityDays: 15 },
    });
    expect(legacyUnreadable(state({ status: "quoted", sentAt: SENT, validUntil: "2026-10-16" }), { validityDays: 15 })).toEqual({});
    // Sent date read, but the days were not a number of days: still no date came of them.
    expect(legacyUnreadable(state({ status: "quoted", sentAt: SENT }), { validityDays: 99999 })).toEqual({
      lifecycleUnreadable: { validityDays: 99999 },
    });
    // The date itself was stored, so the days have nothing left to say - sent date or not.
    expect(legacyUnreadable(state({ status: "draft", validUntil: "2026-10-16" }), { validityDays: 15 })).toEqual({});
  });

  it("does not keep empty values", () => {
    expect(legacyUnreadable(state(), { sentAt: "", decidedAt: null, validUntil: "   " })).toEqual({});
  });

  it("keeps a value once: what is kept is never replaced", () => {
    const data = { sentAt: "tomorrow", validUntil: "soon", lifecycleUnreadable: { sentAt: "yesterday" } };
    expect(legacyUnreadable(state(), data)).toEqual({
      lifecycleUnreadable: { sentAt: "yesterday", validUntil: "soon" },
    });
    // Nothing new to keep: the stored object is left alone.
    expect(legacyUnreadable(state(), { sentAt: "tomorrow", lifecycleUnreadable: { sentAt: "yesterday" } })).toEqual({});
  });

  it("starts afresh when what was kept is not an object", () => {
    expect(legacyUnreadable(state(), { sentAt: "yesterday", lifecycleUnreadable: "broken" })).toEqual({
      lifecycleUnreadable: { sentAt: "yesterday" },
    });
  });

  it("keeps a history that is not a list", () => {
    expect(legacyUnreadable(state(), { timeline: "abc" })).toEqual({ timelineUnreadable: "abc" });
    expect(legacyUnreadable(state(), { timeline: { status: "draft" } })).toEqual({ timelineUnreadable: { status: "draft" } });
    expect(legacyUnreadable(state(), { timeline: [1, null] })).toEqual({});
    expect(legacyUnreadable(state(), { timeline: null })).toEqual({});
    expect(legacyUnreadable(state(), {})).toEqual({});
  });

  it("keeps the first unreadable history only", () => {
    expect(legacyUnreadable(state(), { timeline: "second", timelineUnreadable: "first" })).toEqual({});
  });
});

describe("applyRevision", () => {
  const sent = state({
    status: "feedback",
    substatus: "Negotiation",
    sentAt: SENT,
    firstSentAt: FIRST_SENT,
    lastContactAt: SENT,
    validUntil: "2026-10-25",
    ownerUserId: "user-2",
    ownerLabel: "Jana",
  });

  it("replaces a sent quote, keeping what it was sent with, and names its revision", () => {
    const { state: next, entry } = applyRevision(sent, "QCZ20261010001-R1", ctx);
    expect(next).toEqual({ ...sent, status: "replaced", substatus: null });
    expect(entry).toEqual({ kind: "status", at: AT.toISOString(), userId: "user-1", user: "martin@forwarder.cz", status: "replaced", comment: "Replaced by QCZ20261010001-R1" });
  });

  it("revises Quoted, Feedback, Expired and Won quotes only", () => {
    expect(applyRevision(state({ status: "quoted", sentAt: SENT }), "R", ctx).state.status).toBe("replaced");
    expect(applyRevision(state({ status: "quoted", validUntil: YESTERDAY }), "R", ctx).state.status).toBe("replaced");
    expect(applyRevision(state({ status: "won", sentAt: SENT, decidedAt: SENT }), "R", ctx).state).toMatchObject({ status: "replaced", decidedAt: null });
    for (const status of ["draft", "ready_to_send", "revised", "lost", "replaced", "on_hold"]) {
      expect(refusal(() => applyRevision(state({ status }), "R", ctx)), status).toBe("not_allowed");
    }
  });

  it("decides nothing: a decision date is only Won's and Lost's", () => {
    expect(applyRevision(sent, "R", ctx).state.decidedAt).toBeNull();
  });

  it("leaves a Replaced quote nowhere to go and out of the open quotes", () => {
    const replaced = applyRevision(sent, "R", ctx).state;
    expect(allowedTransitions(replaced, TODAY)).toEqual([]);
    expect(OPEN).not.toContain("replaced");
    expect(effectiveStatus("replaced", YESTERDAY, TODAY)).toBe("replaced");
    expect(wasEverSent(replaced, [])).toBe(true);
  });
});

describe("revisionOf", () => {
  it("starts the revision Revised, with the owner and validity of the quote it revises and nothing sent", () => {
    const source = state({ status: "quoted", sentAt: SENT, firstSentAt: FIRST_SENT, lastContactAt: SENT, validUntil: "2026-10-25", ownerUserId: "user-2", ownerLabel: "Jana", shipmentId: "s-1", shipmentJobNumber: "CZ1" });
    const { state: next, entry } = revisionOf(source, "QCZ20261010001", ctx);
    expect(next).toEqual(state({ status: "revised", validUntil: "2026-10-25", ownerUserId: "user-2", ownerLabel: "Jana", createdAt: AT }));
    expect(entry).toEqual({ kind: "status", at: AT.toISOString(), userId: "user-1", user: "martin@forwarder.cz", status: "revised", comment: "Revision of QCZ20261010001" });
  });

  it("can be priced: Revised is not among the closed statuses", () => {
    expect(PRICING_CLOSED).not.toContain("revised");
  });
});

describe("the revision of a Won quote", () => {
  const won = state({ status: "won", sentAt: SENT, firstSentAt: SENT, decidedAt: SENT, validUntil: YESTERDAY, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000042" });

  it("stays Won, with the quote's sending, decision, validity and shipment", () => {
    const { state: fresh, entry } = revisionOf(won, "QCZ1", ctx);
    expect(fresh).toMatchObject({ status: "won", sentAt: SENT, firstSentAt: SENT, decidedAt: SENT, validUntil: YESTERDAY, shipmentId: "shipment-1", shipmentJobNumber: "CZ00000042" });
    expect(entry).toMatchObject({ kind: "status", status: "won", comment: "Revision of QCZ1 - stays Won" });
  });

  it("may get a new validity; another Won quote may not", () => {
    expect(applyValidity(won, "2026-12-31", ctx, { wonRevision: true })).toMatchObject({ changed: true, state: { validUntil: "2026-12-31" } });
    expect(refusal(() => applyValidity(won, "2026-12-31", ctx))).toBe("not_allowed");
  });
});
