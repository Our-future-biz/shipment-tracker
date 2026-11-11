import { describe, expect, it } from "vitest";
import type { SalesManagersQuoteFact } from "../../../quotes/interfaces/interfaces";
import { buildSalesCockpit, inMode, lostCategoryOf, quoteSignals, taskSignals, teamLine, workingDaysSince, type CockpitTask } from "../../utils/managersCockpit.utils";

// Tuesday 3 Nov 2026, 10:00 in Prague.
const NOW = new Date("2026-11-03T09:00:00.000Z");
const TODAY = "2026-11-03";

const fact = (over: Partial<SalesManagersQuoteFact> = {}): SalesManagersQuoteFact => ({
  quoteNumber: "QCZ20261103001",
  status: "quoted",
  shownStatus: "quoted",
  serviceType: "Sea FCL",
  customer: "METRANS, a.s.",
  customerId: null,
  ownerUserId: "u1",
  ownerName: "jan@forwarder.cz",
  createdAt: "2026-11-02T08:00:00.000Z",
  firstSentAt: "2026-11-02T09:00:00.000Z",
  decidedAt: null,
  validUntil: "2026-11-20",
  lastContactAt: "2026-11-02T09:00:00.000Z",
  followUpDue: false,
  shipmentId: null,
  readyDate: null,
  sellingCzk: 100_000,
  marginCzk: 10_000,
  marginPercent: 10,
  marginProblem: null,
  belowFloor: false,
  wonRevision: false,
  warehouseInquiry: null,
  marginInquiry: null,
  statusSince: "2026-11-02T09:00:00.000Z",
  approvalAt: null,
  approvalLapsed: null,
  credit: null,
  ...over,
});
const texts = (q: SalesManagersQuoteFact) => quoteSignals(q, TODAY, NOW).map((s) => `${s.urgent ? "U" : "A"}: ${s.text}`);
const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: "t1",
  type: "Call",
  note: "ask about December volume",
  dueDate: "2026-10-30",
  assigneeUserId: "u1",
  assigneeName: "jan@forwarder.cz",
  customerLabel: "Lego Production s.r.o.",
  quoteNumber: null,
  ...over,
});

describe("quoteSignals", () => {
  it("is quiet for a quote that is on its way", () => {
    expect(texts(fact())).toEqual([]);
  });

  it("flags the last day of validity as urgent, with the last contact", () => {
    expect(texts(fact({ validUntil: TODAY, lastContactAt: "2026-10-30T09:00:00.000Z" }))).toEqual(["U: Expires today · last contact 4 days ago"]);
    expect(texts(fact({ status: "draft", shownStatus: "draft", validUntil: TODAY }))).toEqual([]);
  });

  it("flags cargo ready today or tomorrow with no quotation out, or Won with no shipment", () => {
    expect(texts(fact({ status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z", readyDate: "2026-11-04" }))).toEqual([
      "U: Cargo ready 04.11., no quotation out",
    ]);
    expect(texts(fact({ readyDate: "2026-11-05", status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z" }))).toEqual([]);
    expect(texts(fact({ readyDate: "2026-10-30", status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z" }))).toEqual([
      "U: Cargo ready since 30.10., no quotation out",
    ]);
    expect(texts(fact({ status: "won", shownStatus: "won", decidedAt: "2026-11-02T10:00:00.000Z", readyDate: TODAY }))).toEqual([
      "U: Won, cargo ready 03.11., no shipment",
    ]);
  });

  it("flags a big deal in Feedback whose follow-up is due, by selling or by profit", () => {
    const big = fact({ status: "feedback", shownStatus: "feedback", followUpDue: true, sellingCzk: 250_000, marginCzk: 5_000 });
    expect(texts(big)).toEqual(["U: Big deal · Feedback · follow-up due"]);
    expect(texts({ ...big, sellingCzk: 90_000, marginCzk: 40_000 })).toEqual(["U: Big deal · Feedback · follow-up due"]);
    expect(texts({ ...big, sellingCzk: 90_000 })).toEqual([]);
  });

  it("flags a Won quote at a loss for 30 days", () => {
    const loss = fact({ status: "won", shownStatus: "won", shipmentId: "s1", decidedAt: "2026-10-10T10:00:00.000Z", marginCzk: -800 });
    expect(texts(loss)).toEqual(["U: Won at a loss"]);
    expect(texts({ ...loss, decidedAt: "2026-09-20T10:00:00.000Z" })).toEqual([]);
  });

  it("puts a road quote below the floor, validity ending soon, a slow warehouse and no owner in Attention", () => {
    expect(texts(fact({ status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z", serviceType: "Road", belowFloor: true }))).toEqual([
      "A: Below margin floor, not approved",
    ]);
    expect(texts(fact({ validUntil: "2026-11-05" }))).toEqual(["A: Valid until in 2 days"]);
    expect(texts(fact({ warehouseInquiry: { status: "pending", requestedAt: "2026-11-02T08:00:00.000Z" } }))).toEqual(["A: Warehouse asked 25 h ago"]);
    expect(texts(fact({ warehouseInquiry: { status: "pending", requestedAt: "2026-11-02T12:00:00.000Z" } }))).toEqual([]);
    expect(texts(fact({ ownerUserId: null, ownerName: "" }))).toEqual(["A: Quoted by nobody"]);
  });

  it("counts working days for Won with no shipment and for drafts, one day for Air", () => {
    // Won on Friday 30 Oct: Monday and Tuesday have passed.
    expect(texts(fact({ status: "won", shownStatus: "won", decidedAt: "2026-10-30T10:00:00.000Z" }))).toEqual(["A: Won 2 working days ago, no shipment"]);
    expect(texts(fact({ status: "won", shownStatus: "won", decidedAt: "2026-11-02T10:00:00.000Z" }))).toEqual([]);
    const draft = fact({ status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-02T08:00:00.000Z" });
    expect(texts(draft)).toEqual([]);
    expect(texts({ ...draft, serviceType: "Air" })).toEqual(["A: Draft 1 working day, never sent"]);
  });

  it("flags no contact for a week, and an Expired quote for 7 days", () => {
    expect(texts(fact({ lastContactAt: "2026-10-27T09:00:00.000Z" }))).toEqual(["A: No contact 7 days"]);
    expect(texts(fact({ shownStatus: "expired", validUntil: "2026-10-30" }))).toEqual(["A: Expired 4 days ago, no answer recorded"]);
    expect(texts(fact({ shownStatus: "expired", validUntil: "2026-10-26" }))).toEqual([]);
  });
});

describe("margin questions", () => {
  const asked = (over: Partial<NonNullable<SalesManagersQuoteFact["marginInquiry"]>> = {}) => ({
    requestedAt: "2026-11-03T07:30:00.000Z",
    needsBy: null,
    escalated: false,
    waitedOfficeMinutes: 90,
    askedMarginCzk: 1000,
    ...over,
  });
  const road = (over: Partial<SalesManagersQuoteFact> = {}) =>
    fact({ status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z", serviceType: "Road", belowFloor: true, marginCzk: 1000, ...over });

  it("waits in Attention, and is urgent once the admins are told", () => {
    expect(texts(road({ marginInquiry: asked() }))).toEqual(["A: Discount waiting 1 h"]);
    expect(texts(road({ marginInquiry: asked({ escalated: true, waitedOfficeMinutes: 260, needsBy: "2026-11-03T13:00:00.000Z" }) }))).toEqual([
      "U: Discount waiting 4 h · needs it by 03.11. 14:00",
    ]);
  });

  it("flags a quote that got worse than the margin asked about", () => {
    expect(texts(road({ marginCzk: 600, marginInquiry: asked() }))).toEqual(["A: Discount waiting 1 h", "U: Changed since asked · margin now 600 CZK"]);
  });

  it("counts the questions waiting in the Awaiting approval tile", () => {
    const cockpit = buildSalesCockpit({ quotes: [road({ marginInquiry: asked() }), road({ quoteNumber: "QCZ2" })], tasks: [], capped: false, mode: "all", now: NOW });
    expect(cockpit.tiles.awaitingApproval).toBe(1);
  });
});

describe("taskSignals", () => {
  it("flags a task two days late, and one assigned to nobody", () => {
    expect(taskSignals(task(), TODAY).map((s) => s.text)).toEqual(["Call overdue 4 days"]);
    expect(taskSignals(task({ dueDate: "2026-11-02" }), TODAY)).toEqual([]);
    expect(taskSignals(task({ dueDate: null, assigneeUserId: null }), TODAY).map((s) => s.text)).toEqual(["Call task unassigned"]);
  });
});

describe("workingDaysSince", () => {
  it("skips weekends and Czech holidays", () => {
    expect(workingDaysSince("2026-10-30", "2026-11-03")).toBe(2);
    // 28 Oct is a holiday.
    expect(workingDaysSince("2026-10-27", "2026-10-29")).toBe(1);
    expect(workingDaysSince(TODAY, TODAY)).toBe(0);
  });
});

describe("buildSalesCockpit", () => {
  const quotes = [
    fact({ quoteNumber: "QCZ1", validUntil: TODAY }),
    fact({ quoteNumber: "QCZ2", validUntil: "2026-11-05", serviceType: "Air", sellingCzk: 20_000 }),
    fact({ quoteNumber: "QCZ3", status: "draft", shownStatus: "draft", firstSentAt: null, ownerUserId: null, ownerName: "", marginProblem: "No ČNB rate for CNY on 2026-11-03" }),
    fact({ quoteNumber: "QCZ4", status: "won", shownStatus: "won", shipmentId: "s1", decidedAt: "2026-11-02T10:00:00.000Z" }),
    fact({ quoteNumber: "QCZ5", status: "lost", shownStatus: "lost", decidedAt: "2026-10-30T10:00:00.000Z" }),
  ];

  it("counts the tiles over the open quotes and the month's decisions", () => {
    const cockpit = buildSalesCockpit({ quotes, tasks: [], capped: false, mode: "all", now: NOW });
    expect(cockpit.tiles).toEqual({
      openQuotes: 3,
      openSellingCzk: 220_000,
      followUpDue: 0,
      draftsToFinish: 1,
      validSoon: 2,
      noOwner: 1,
      awaitingApproval: 0,
      wonThisMonth: 1,
      lostThisMonth: 0,
    });
    expect(cockpit.health).toEqual({ marginUnknown: 1, sentNoCustomer: 2, capped: false });
    expect(cockpit.audit).toBeNull();
    expect(cockpit.today).toBe(TODAY);
  });

  it("lists a quote once, in the card of its worst signal, with all its tags", () => {
    const both = fact({ quoteNumber: "QCZ9", validUntil: TODAY, ownerUserId: null, ownerName: "" });
    const cockpit = buildSalesCockpit({ quotes: [both], tasks: [], capped: false, mode: "all", now: NOW });
    expect(cockpit.urgent.total).toBe(1);
    expect(cockpit.attention.total).toBe(0);
    expect(cockpit.urgent.rows[0]!.tags).toEqual([
      { text: "Expires today · last contact 1 day ago", urgent: true },
      { text: "Quoted by nobody", urgent: false },
    ]);
  });

  it("adds a task to its quote also when the task names it as it read before its letters changed", () => {
    const lettered = [fact({ quoteNumber: "QCZAIR20261103002", validUntil: "2026-11-05", serviceType: "Air" })];
    const cockpit = buildSalesCockpit({ quotes: lettered, tasks: [task({ id: "a", quoteNumber: "QCZ20261103002" })], capped: false, mode: "air", now: NOW });
    expect(cockpit.attention.rows.find((r) => r.id === "QCZAIR20261103002")!.tags.map((t) => t.text)).toContain("Call overdue 4 days");
    expect(cockpit.attention.rows.some((r) => r.kind === "task")).toBe(false);
  });

  it("adds a task to the quote it names, lists other tasks in All only, and filters by freight mode", () => {
    const tasks = [task({ id: "a", quoteNumber: "QCZ2" }), task({ id: "b" })];
    const all = buildSalesCockpit({ quotes, tasks, capped: false, mode: "all", now: NOW });
    expect(all.attention.rows.find((r) => r.id === "QCZ2")!.tags.map((t) => t.text)).toEqual(["Valid until in 2 days", "Call overdue 4 days"]);
    expect(all.attention.rows.some((r) => r.kind === "task" && r.id === "b")).toBe(true);

    const air = buildSalesCockpit({ quotes, tasks, capped: false, mode: "air", now: NOW });
    expect(air.tiles.openQuotes).toBe(1);
    expect(air.urgent.total + air.attention.total).toBe(1);
    expect(air.attention.rows[0]!.id).toBe("QCZ2");
  });

  it("groups Sea FCL, LCL and Break Bulk as Sea", () => {
    expect(["Sea FCL", "Sea LCL", "Sea Break Bulk"].every((s) => inMode(s, "sea"))).toBe(true);
    expect(inMode("Air", "sea")).toBe(false);
    expect(inMode("", "all")).toBe(true);
    expect(inMode("", "road")).toBe(false);
  });
});

describe("step 6 signals", () => {
  it("flags Ready to Send for a working day or more (A5)", () => {
    const ready = { status: "ready_to_send", shownStatus: "ready_to_send", firstSentAt: null } as const;
    expect(texts(fact({ ...ready, statusSince: "2026-11-02T09:00:00.000Z" }))).toEqual(["A: Ready to Send since 02.11."]);
    expect(texts(fact({ ...ready, statusSince: "2026-11-03T07:00:00.000Z" }))).toEqual([]);
  });

  it("flags an approval nobody sent after 24 h, and one that no longer covers the quote (A7, A8)", () => {
    const draft = { status: "draft", shownStatus: "draft", firstSentAt: null, createdAt: "2026-11-03T08:00:00.000Z" } as const;
    expect(texts(fact({ ...draft, approvalAt: "2026-11-02T08:00:00.000Z" }))).toEqual(["A: Approved, not sent 25 h"]);
    expect(texts(fact({ ...draft, approvalAt: "2026-11-02T10:00:00.000Z" }))).toEqual([]);
    expect(texts(fact({ approvalLapsed: "the validity changed" }))).toEqual(["A: Approval no longer covers it: the validity changed"]);
    expect(texts(fact({ status: "lost", shownStatus: "lost", approvalLapsed: "the validity changed" }))).toEqual([]);
  });

  it("flags a customer over its limit or with overdue invoices when the quote goes out or is Won with no shipment (U8)", () => {
    const credit = { overdueCount: 2, oldestOverdueDue: "2026-10-01", overLimitCzk: 5_000 };
    const ready = { status: "ready_to_send", shownStatus: "ready_to_send", statusSince: "2026-11-03T08:00:00.000Z" } as const;
    expect(texts(fact({ ...ready, credit }))).toEqual(["U: Credit limit exceeded · 2 invoices overdue"]);
    expect(texts(fact({ ...ready, credit: { ...credit, overLimitCzk: null, overdueCount: 1 } }))).toEqual(["U: 1 invoice overdue"]);
    expect(texts(fact({ ...ready, credit: { ...credit, overLimitCzk: null, overdueCount: 0 } }))).toEqual([]);
    expect(texts(fact({ status: "won", shownStatus: "won", decidedAt: "2026-11-03T08:00:00.000Z", credit }))).toEqual(["U: Credit limit exceeded · 2 invoices overdue"]);
    expect(texts(fact({ credit }))).toEqual([]);
  });

  it("puts a question on a closed quote and an answer nobody got on the quote, or a row of its own in All (A14, A15)", () => {
    const lines = {
      audit: { days: 7, asked: 0, approved: 0, counter: 0, rejected: 0, withdrawn: 0, selfApprovals: 0, escalated: 0, medianOfficeMinutesToDecide: null },
      team: { days: 30, won: 0, lost: 0, sent: 0, medianHoursToFirstSent: null, lostReasons: [], asked: 0, approved: 0, rejected: 0 },
      inquiriesOnClosedQuotes: ["QCZ1", "QCZ8"],
      answersNobodyReceived: ["QCZ8"],
    };
    const all = buildSalesCockpit({ quotes: [fact({ quoteNumber: "QCZ1" })], tasks: [], capped: false, mode: "all", now: NOW, lines });
    expect(all.attention.rows.find((r) => r.id === "QCZ1")!.tags.map((t) => t.text)).toEqual(["Inquiry on a closed quote · decide or close it"]);
    expect(all.attention.rows.find((r) => r.id === "QCZ8")!.tags.map((t) => t.text)).toEqual(["Inquiry on a closed quote · decide or close it", "Answer nobody received · tell the new owner"]);
    const air = buildSalesCockpit({ quotes: [fact({ quoteNumber: "QCZ1" })], tasks: [], capped: false, mode: "air", now: NOW, lines });
    expect(air.attention.total).toBe(0);
    expect(all.audit).toEqual({ ...lines.audit, approvalsLapsed: 0 });
  });
});

describe("teamLine", () => {
  const base = { days: 30, won: 3, lost: 1, sent: 10, medianHoursToFirstSent: 5.5, lostReasons: [], asked: 2, approved: 1, rejected: 1 };

  it("works out the hit rate, the share that needed approval and the lost categories", () => {
    const t = teamLine({ ...base, lostReasons: [{ reason: "Pricing: Price too high", count: 2 }, { reason: "Competitor cheaper", count: 1 }, { reason: "Customer: No response", count: 2 }, { reason: "", count: 1 }, { reason: "Weather", count: 1 }] });
    expect(t.hitRatePercent).toBe(75);
    expect(t.neededApprovalPercent).toBe(20);
    expect(t.approvalRatePercent).toBe(50);
    expect(t.approvalWarning).toBeNull();
    expect(t.lostByCategory).toEqual([
      { category: "Pricing", count: 3 },
      { category: "Customer", count: 2 },
      { category: "Not given", count: 1 },
      { category: "Other", count: 1 },
    ]);
    expect(lostCategoryOf("Lost tender")).toBe("Commercial");
    expect(lostCategoryOf("Internal: Missing follow-up")).toBe("Internal");
    expect(lostCategoryOf("Somebody: else")).toBe("Other");
  });

  it("warns of a rubber stamp or a guardrail set wrong only with enough answers", () => {
    expect(teamLine({ ...base, approved: 20, rejected: 0 }).approvalWarning).toBe("rubber_stamp");
    expect(teamLine({ ...base, approved: 1, rejected: 9 }).approvalWarning).toBe("too_strict");
    expect(teamLine({ ...base, approved: 4, rejected: 0 }).approvalWarning).toBeNull();
    expect(teamLine({ ...base, won: 0, lost: 0, sent: 0 })).toMatchObject({ hitRatePercent: null, neededApprovalPercent: null });
  });
});
