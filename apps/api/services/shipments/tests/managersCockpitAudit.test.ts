import { describe, expect, it } from "vitest";
import { APPROVAL_RATE_MIN_DECIDED, AUDIT_DAYS, AUDIT_LIST_LIMIT } from "../lib/cockpitThresholds";
import { CUTOFF_DISMISSED_FIELD, dismissedLine, takenBackLine } from "../lib/cutoffDismissals";
import { HAND_OVER_FIELD } from "../lib/handOver";
import {
  AUDIT_KEYS,
  HISTORY_KEYS,
  auditLine,
  auditList,
  decidedEntries,
  handledByAround,
  handledByAt,
  historyAsk,
  historyEntries,
  isAuditKey,
  isHistoryKey,
  overrideEntries,
  ownApprovalEntries,
  type AuditEntry,
  type AuditKey,
  type HistoryRow,
} from "../lib/managersCockpitAudit";

// A moment of a November day on Prague's clock (CET, an hour ahead of UTC).
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);
const USERS = new Map([
  ["u-jan", "jan@firma.cz"],
  ["u-eva", "eva@firma.cz"],
  ["u-boss", "boss@firma.cz"],
]);

const change = (field: string, oldValue: string | null, newValue: string | null, over: Partial<HistoryRow> = {}): HistoryRow => ({
  shipmentId: "id-1",
  jobNumber: "CZ00000001",
  personInCharge: "jan@firma.cz",
  userId: "u-boss",
  field,
  oldValue,
  newValue,
  changedAt: at("2026-11-16"),
  ...over,
});
/** What one change counts as, and its line. */
const read = (row: HistoryRow, users: ReadonlyMap<string, string> | null = USERS) => historyEntries([row], users).map((e) => [e.key, e.what]);

describe("the keys", () => {
  it("are the thirteen of the contract, each once, in the order the line shows them", () => {
    expect(AUDIT_KEYS).toEqual([
      "prepayment_release",
      "own_credit_check",
      "own_document_approval",
      "deleted",
      "cancelled",
      "tick_taken_back",
      "ata_atd_changed",
      "warehouse_received_moved",
      "handled_by_changed",
      "handed_over",
      "cutoff_dismissed",
      "requests_decided",
      "release_requests_decided",
    ]);
    expect(new Set(AUDIT_KEYS).size).toBe(AUDIT_KEYS.length);
    expect(isAuditKey("deleted")).toBe(true);
    expect(isAuditKey("everything")).toBe(false);
    expect(AUDIT_DAYS).toBe(7);
  });

  it("split into those read off the jobs' history and those of the tables beside it", () => {
    expect(AUDIT_KEYS.filter(isHistoryKey)).toEqual(["own_credit_check", "deleted", "cancelled", "tick_taken_back", "ata_atd_changed", "warehouse_received_moved", "handled_by_changed", "handed_over", "cutoff_dismissed"]);
    expect([...HISTORY_KEYS].sort()).toEqual(AUDIT_KEYS.filter(isHistoryKey).sort());
  });
});

describe("what the history is asked for", () => {
  it("is, for the whole line, each field once - and of the status only the change into Cancelled", () => {
    expect(historyAsk()).toEqual({
      fields: ["creditCheck", "personInCharge", "deletedAt", "actualArrival", "actualDeparture", "warehouseReceivedDate", "holidayCover", "handOver", "cutoffDismissed"],
      fieldPrefixes: ["task:"],
      turnedInto: [{ field: "status", value: "Cancelled Shipment" }],
    });
    // The two names builder M writes by.
    expect([HAND_OVER_FIELD, CUTOFF_DISMISSED_FIELD]).toEqual(["handOver", "cutoffDismissed"]);
  });

  it("is, for one figure's rows, only what that figure reads", () => {
    expect(historyAsk(["deleted"])).toEqual({ fields: ["deletedAt"], fieldPrefixes: [], turnedInto: [] });
    expect(historyAsk(["cancelled"])).toEqual({ fields: [], fieldPrefixes: [], turnedInto: [{ field: "status", value: "Cancelled Shipment" }] });
    expect(historyAsk(["tick_taken_back"])).toEqual({ fields: [], fieldPrefixes: ["task:"], turnedInto: [] });
    // Whether a credit check was the approver's own job hangs on who handled it then: the changes of Handled By come with it.
    expect(historyAsk(["own_credit_check"]).fields).toEqual(["creditCheck", "personInCharge"]);
    // A change made by a hand-over is the hand-over's to count: its lines come with the changes.
    expect(historyAsk(["handled_by_changed"]).fields).toEqual(["personInCharge", "holidayCover", "handOver"]);
  });
});

describe("a change in a job's history", () => {
  it("is a deletion", () => {
    expect(read(change("deletedAt", null, "2026-11-16T10:00:00.000Z"))).toEqual([["deleted", "Job deleted"]]);
  });

  it("is a cancellation when the status turned into Cancelled Shipment", () => {
    expect(read(change("status", "Booked [EXP]", "Cancelled Shipment"))).toEqual([["cancelled", "Status Booked [EXP] → Cancelled Shipment"]]);
    expect(read(change("status", "Booked [EXP]", "Departed [EXP]"))).toEqual([]);
    expect(read(change("status", "Cancelled Shipment", "Cancelled Shipment"))).toEqual([]);
  });

  it("is a tick taken back, with the task and the manager's reason", () => {
    expect(read(change("task:customs_cleared", "ticked", "taken back: ticked on the wrong job"))).toEqual([["tick_taken_back", 'Tick "customs_cleared" taken back: ticked on the wrong job']]);
  });

  it("is an ATA or ATD changed only when there was one before: typed for the first time it is no news", () => {
    expect(read(change("actualArrival", "2026-11-10", "2026-11-12"))).toEqual([["ata_atd_changed", "ATA 10.11.2026 → 12.11.2026"]]);
    expect(read(change("actualDeparture", "2026-11-10", null))).toEqual([["ata_atd_changed", "ATD 10.11.2026 → cleared"]]);
    expect(read(change("actualArrival", null, "2026-11-12"))).toEqual([]);
    expect(read(change("actualDeparture", "", "2026-11-12"))).toEqual([]);
  });

  it("is a Warehouse Received moved when it went later or was cleared - earlier is a correction", () => {
    expect(read(change("warehouseReceivedDate", "2026-11-10", "2026-11-14"))).toEqual([["warehouse_received_moved", "Warehouse Received 10.11.2026 → 14.11.2026"]]);
    expect(read(change("warehouseReceivedDate", "2026-11-10", ""))).toEqual([["warehouse_received_moved", "Warehouse Received 10.11.2026 → cleared"]]);
    expect(read(change("warehouseReceivedDate", "2026-11-10", "2026-11-09"))).toEqual([]);
    expect(read(change("warehouseReceivedDate", null, "2026-11-10"))).toEqual([]);
  });

  it("is a change of Handled By or Holiday Cover when the person changed - not when only the writing did", () => {
    expect(read(change("personInCharge", "jan@firma.cz", "eva@firma.cz"))).toEqual([["handled_by_changed", "Handled By jan@firma.cz → eva@firma.cz"]]);
    expect(read(change("holidayCover", "eva@firma.cz", "petr@firma.cz"))).toEqual([["handled_by_changed", "Holiday Cover eva@firma.cz → petr@firma.cz"]]);
    expect(read(change("holidayCover", "eva@firma.cz", null))).toEqual([["handled_by_changed", "Holiday Cover eva@firma.cz → nobody"]]);
    expect(read(change("personInCharge", "Jan@firma.cz — Jan Novák", "jan@firma.cz"))).toEqual([]);
  });

  it("is no change of hands when somebody is named where nobody was", () => {
    expect(read(change("personInCharge", "", "eva@firma.cz"))).toEqual([]);
    expect(read(change("personInCharge", null, "eva@firma.cz"))).toEqual([]);
    expect(read(change("holidayCover", "  ", "eva@firma.cz"))).toEqual([]);
  });

  it("leaves a change made by a manager's hand-over to the hand-over: counted once, as \"handed over\"", () => {
    const turn = at("2026-11-16", "09:30");
    const rows = [
      change("personInCharge", "jan@firma.cz", "eva@firma.cz", { changedAt: turn }),
      change("holidayCover", "eva@firma.cz", "petr@firma.cz", { changedAt: turn }),
      change(HAND_OVER_FIELD, null, "jan@firma.cz → eva@firma.cz; Holiday Cover eva@firma.cz → petr@firma.cz: on holiday", { changedAt: turn }),
      // The same job, changed by hand an hour later: that one is a change of its own.
      change("personInCharge", "eva@firma.cz", "jan@firma.cz", { changedAt: at("2026-11-16", "10:30") }),
      // Another job changed at the very moment of the hand-over, but not by it.
      change("personInCharge", "jan@firma.cz", "petr@firma.cz", { shipmentId: "id-2", jobNumber: "CZ00000002", changedAt: turn }),
    ];
    expect(historyEntries(rows, USERS).map((e) => [e.key, e.shipmentId, e.what])).toEqual([
      ["handed_over", "id-1", "Handed over · jan@firma.cz → eva@firma.cz; Holiday Cover eva@firma.cz → petr@firma.cz: on holiday"],
      ["handled_by_changed", "id-1", "Handled By eva@firma.cz → jan@firma.cz"],
      ["handled_by_changed", "id-2", "Handled By jan@firma.cz → petr@firma.cz"],
    ]);
  });

  it("is a hand-over, by builder M's line", () => {
    expect(read(change(HAND_OVER_FIELD, null, "jan@firma.cz → eva@firma.cz: on holiday until 30.11."))).toEqual([["handed_over", "Handed over · jan@firma.cz → eva@firma.cz: on holiday until 30.11."]]);
  });

  it("is a missed cut-off dismissed - taking the dismissal back is not one", () => {
    const line = dismissedLine("closingDate", "2026-11-16", "went on the next vessel");
    expect(read(change(CUTOFF_DISMISSED_FIELD, null, line))).toEqual([["cutoff_dismissed", "Missed cut-off dismissed · Closing 16.11.2026: went on the next vessel"]]);
    expect(read(change(CUTOFF_DISMISSED_FIELD, line, takenBackLine("closingDate", "2026-11-16")))).toEqual([]);
  });

  it("is nothing for a field the line does not count", () => {
    expect(read(change("estimatedArrival", "2026-11-10", "2026-11-12"))).toEqual([]);
    expect(read(change("nudge", null, "To-do for jan@firma.cz: call — due 20.11.2026"))).toEqual([]);
  });

  it("names who did it by e-mail - \"\" for a user who is gone, and for everyone when the users could not be read", () => {
    const row = change("deletedAt", null, "2026-11-16T10:00:00.000Z");
    expect(historyEntries([row], USERS)).toEqual([{ key: "deleted", what: "Job deleted", shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: at("2026-11-16") }]);
    expect(historyEntries([{ ...row, userId: "u-gone" }], USERS)[0]!.who).toBe("");
    expect(historyEntries([row], null)[0]!.who).toBe("");
  });
});

describe("a credit check approved by the job's own Handled By", () => {
  const approved = (over: Partial<HistoryRow> = {}) => change("creditCheck", "Red", "Green", { userId: "u-jan", ...over });

  it("is one when who turned it Green handles the job", () => {
    expect(read(approved())).toEqual([["own_credit_check", "Credit Check Red → Green, by the job's own Handled By"]]);
    expect(read(approved({ oldValue: null }))).toEqual([["own_credit_check", "Credit Check not set → Green, by the job's own Handled By"]]);
    expect(read(approved({ personInCharge: " JAN@firma.cz — Jan Novák" }))).toHaveLength(1);
  });

  it("is none when somebody else approved it, when it was not an approval, or when nobody handles the job", () => {
    expect(read(approved({ userId: "u-boss" }))).toEqual([]);
    expect(read(approved({ userId: "u-eva" }))).toEqual([]);
    expect(read(change("creditCheck", "Green", "Red", { userId: "u-jan" }))).toEqual([]);
    expect(read(change("creditCheck", "Green", "green", { userId: "u-jan" }))).toEqual([]);
    expect(read(approved({ personInCharge: "" }))).toEqual([]);
    expect(read(approved({ userId: "u-gone" }))).toEqual([]);
  });

  it("goes by who handled the job THEN: a later change of Handled By is undone, one saved in the same turn is in force", () => {
    // Jan approved on the 12th; the job went to Eva on the 14th and to Petr on the 16th: it reads Petr now.
    const credit = approved({ personInCharge: "petr@firma.cz", changedAt: at("2026-11-12") });
    const toEva = change("personInCharge", "jan@firma.cz", "eva@firma.cz", { changedAt: at("2026-11-14") });
    const toPetr = change("personInCharge", "eva@firma.cz", "petr@firma.cz", { changedAt: at("2026-11-16") });
    expect(handledByAt(credit, [toPetr, toEva, credit])).toBe("jan@firma.cz");
    expect(historyEntries([toPetr, toEva, credit], USERS).map((e) => e.key)).toEqual(["handled_by_changed", "handled_by_changed", "own_credit_check"]);
    // The other way round: Eva handled it when Jan approved; that it is Jan's now does not make it his own then.
    const later = change("personInCharge", "eva@firma.cz", "jan@firma.cz", { changedAt: at("2026-11-14") });
    expect(historyEntries([later, approved({ changedAt: at("2026-11-12") })], USERS).map((e) => e.key)).toEqual(["handled_by_changed"]);
    // Took the job and approved its credit in one save: it was theirs at that moment.
    const sameTurn = change("personInCharge", "eva@firma.cz", "jan@firma.cz", { changedAt: at("2026-11-12") });
    expect(historyEntries([sameTurn, approved({ changedAt: at("2026-11-12") })], USERS).map((e) => e.key)).toEqual(["handled_by_changed", "own_credit_check"]);
    // Approved its credit and handed the job on in one save: it was theirs until that moment - their own all the same.
    const handedOn = change("personInCharge", "jan@firma.cz", "eva@firma.cz", { changedAt: at("2026-11-12") });
    const approvedThen = approved({ personInCharge: "eva@firma.cz", changedAt: at("2026-11-12") });
    expect(handledByAround(approvedThen, [handedOn, approvedThen])).toEqual(["eva@firma.cz", "jan@firma.cz"]);
    expect(historyEntries([handedOn, approvedThen], USERS).map((e) => e.key)).toEqual(["handled_by_changed", "own_credit_check"]);
    // Somebody else's approval in such a save is nobody's own: the boss is neither who had the job nor who got it.
    expect(historyEntries([handedOn, { ...approvedThen, userId: "u-boss" }], USERS).map((e) => e.key)).toEqual(["handled_by_changed"]);
    // A change of Handled By a day earlier is no part of this save.
    expect(handledByAround(approvedThen, [{ ...handedOn, changedAt: at("2026-11-11") }, approvedThen])).toEqual(["eva@firma.cz"]);
    // Another job's changes say nothing of this one.
    expect(handledByAt(credit, [{ ...toEva, shipmentId: "id-2" }])).toBe("petr@firma.cz");
  });

  it("is not said of anybody when the users could not be read", () => {
    expect(read(approved(), null)).toEqual([]);
  });
});

describe("the tables beside the history", () => {
  it("words a release of an unpaid prepayment job, and says when the payment could not be checked", () => {
    const row = { shipmentId: "id-1", jobNumber: "CZ00000001", kind: "house_bol", reason: " The customer pays on Friday ", checked: true, by: "boss@firma.cz", createdAt: at("2026-11-16") };
    expect(overrideEntries([row, { ...row, kind: "warehouse_released", checked: false }])).toEqual([
      { key: "prepayment_release", shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: at("2026-11-16"), what: "House BoL released on prepayment · The customer pays on Friday" },
      { key: "prepayment_release", shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: at("2026-11-16"), what: "Warehouse Released set on prepayment, payment not checked · The customer pays on Friday" },
    ]);
  });

  it("words a document approved for customs by who uploaded it", () => {
    const row = { shipmentId: "id-1", jobNumber: "CZ00000001", fileName: "invoice-77.pdf", documentType: "Invoice", reviewedById: "u-boss", reviewedAt: at("2026-11-16") };
    expect(ownApprovalEntries([row], USERS)).toEqual([{ key: "own_document_approval", shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: at("2026-11-16"), what: "Approved for customs their own upload · Invoice · invoice-77.pdf" }]);
    expect(ownApprovalEntries([{ ...row, documentType: "" }], null)[0]).toMatchObject({ who: "", what: "Approved for customs their own upload · invoice-77.pdf" });
  });

  it("words a request a manager answered, with the answer and its reason", () => {
    const row = { shipmentId: "id-1", jobNumber: "CZ00000001", status: "approved", decidedByName: "Boss", decidedAt: at("2026-11-16"), asked: "Customs Office CZ510201 → CZ510202", comment: "" };
    expect(decidedEntries("requests_decided", [row, { ...row, status: "rejected", comment: " Not on this job " }])).toEqual([
      { key: "requests_decided", shipmentId: "id-1", jobNumber: "CZ00000001", who: "Boss", at: at("2026-11-16"), what: "Customs Office CZ510201 → CZ510202 · approved", approved: true },
      { key: "requests_decided", shipmentId: "id-1", jobNumber: "CZ00000001", who: "Boss", at: at("2026-11-16"), what: "Customs Office CZ510201 → CZ510202 · rejected: Not on this job", approved: false },
    ]);
    expect(decidedEntries("release_requests_decided", [row])[0]!.key).toBe("release_requests_decided");
  });
});

describe("the line", () => {
  const entry = (key: AuditKey, over: Partial<AuditEntry> = {}): AuditEntry => ({ key, shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: at("2026-11-16"), what: "…", ...over });
  const decided = (key: "requests_decided" | "release_requests_decided", approved: number, rejected: number) => [
    ...Array.from({ length: approved }, () => entry(key, { approved: true })),
    ...Array.from({ length: rejected }, () => entry(key, { approved: false })),
  ];

  it("counts each kind that was read, 0 for none, in the keys' order, over seven days", () => {
    const line = auditLine([entry("deleted"), entry("cancelled"), entry("deleted")], ["cancelled", "deleted", "prepayment_release"]);
    expect(line).toEqual({ days: 7, items: [{ key: "prepayment_release", count: 0 }, { key: "deleted", count: 2 }, { key: "cancelled", count: 1 }] });
  });

  it("has no item for a kind that could not be read - not even when rows of it are there: not known is not zero", () => {
    expect(auditLine([entry("deleted")], ["cancelled"]).items).toEqual([{ key: "cancelled", count: 0 }]);
    expect(auditLine([], []).items).toEqual([]);
  });

  it("gives the decided requests their approval rate from ten decisions on - of a handful it says nothing", () => {
    expect(APPROVAL_RATE_MIN_DECIDED).toBe(10);
    expect(auditLine(decided("requests_decided", 9, 0), ["requests_decided"]).items).toEqual([{ key: "requests_decided", count: 9 }]);
    expect(auditLine(decided("requests_decided", 10, 0), ["requests_decided"]).items).toEqual([{ key: "requests_decided", count: 10, approvalRate: 1 }]);
    expect(auditLine(decided("requests_decided", 19, 1), ["requests_decided"]).items).toEqual([{ key: "requests_decided", count: 20, approvalRate: 0.95 }]);
    expect(auditLine(decided("release_requests_decided", 6, 6), ["release_requests_decided"]).items).toEqual([{ key: "release_requests_decided", count: 12, approvalRate: 0.5 }]);
    // No other kind has one, however many there are.
    expect(auditLine(Array.from({ length: 12 }, () => entry("deleted")), ["deleted"]).items).toEqual([{ key: "deleted", count: 12 }]);
  });
});

describe("the rows behind a count", () => {
  const entry = (n: number, key: AuditKey = "deleted"): AuditEntry => ({ key, shipmentId: `id-${n}`, jobNumber: `CZ${String(n).padStart(8, "0")}`, who: "boss@firma.cz", at: new Date(Date.UTC(2026, 10, 16, 10, 0, n)), what: `what ${n}` });

  it("are that kind's, the newest first, as the page shows them", () => {
    const list = auditList([entry(1), entry(3), entry(2, "cancelled"), entry(2)], "deleted");
    expect(list).toEqual({
      rows: [
        { shipmentId: "id-3", jobNumber: "CZ00000003", who: "boss@firma.cz", at: "2026-11-16T10:00:03.000Z", what: "what 3" },
        { shipmentId: "id-2", jobNumber: "CZ00000002", who: "boss@firma.cz", at: "2026-11-16T10:00:02.000Z", what: "what 2" },
        { shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: "2026-11-16T10:00:01.000Z", what: "what 1" },
      ],
      capped: false,
    });
    expect(auditList([entry(1)], "cancelled")).toEqual({ rows: [], capped: false });
  });

  it("are cut at 200, and say so - also when the read itself did not reach everything", () => {
    const many = Array.from({ length: AUDIT_LIST_LIMIT + 1 }, (_, i) => entry(i));
    const list = auditList(many, "deleted");
    expect(list.rows).toHaveLength(200);
    expect(list.rows[0]!.shipmentId).toBe("id-200");
    expect(list.capped).toBe(true);
    expect(auditList(many.slice(0, AUDIT_LIST_LIMIT), "deleted").capped).toBe(false);
    expect(auditList([entry(1)], "deleted", true).capped).toBe(true);
  });
});
