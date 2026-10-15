import { describe, expect, it } from "vitest";
import {
  approvalOf,
  currenciesToResolve,
  formatCzk,
  formatMoney,
  marginGateMessage,
  roadMargin,
  roadMarginApplies,
  type MarginContext,
} from "../lib/roadMargin";

const ctx = (over: Partial<MarginContext> = {}): MarginContext => ({
  floor: { percent: 8, minAmountCzk: 300 },
  today: "2026-10-15",
  rates: {},
  ...over,
});

const line = (amount: number, currency = "CZK", over: Record<string, unknown> = {}) => ({ type: "Road freight", description: "", currency, amount, ...over });
const road = (selling: unknown[], buying: unknown[], over: Record<string, unknown> = {}) => ({ serviceType: "Road", sellingLines: selling, buyingLines: buying, ...over });

describe("roadMarginApplies", () => {
  it("applies to a Road quote and to any quote with a line priced from a trucking tariff", () => {
    expect(roadMarginApplies({ serviceType: "Road" })).toBe(true);
    expect(roadMarginApplies({ serviceType: "Air", buyingLines: [line(1, "CZK", { tariffRef: "trucking:v1:D1" })] })).toBe(true);
    expect(roadMarginApplies({ serviceType: "Air", sellingLines: [line(1, "CZK", { tariffRef: "other:1" })] })).toBe(false);
    expect(roadMarginApplies({ serviceType: "Sea FCL" })).toBe(false);
    expect(roadMarginApplies(null)).toBe(false);
    expect(roadMarginApplies([])).toBe(false);
  });
});

describe("roadMargin", () => {
  it("is null when the rule does not apply", () => {
    expect(roadMargin({ serviceType: "Air", sellingLines: [line(100)] }, ctx())).toBeNull();
  });

  it("works in CZK alone without any rate", () => {
    expect(roadMargin(road([line(5000)], [line(4000)]), ctx())).toEqual({
      sellingCzk: 5000,
      buyingCzk: 4000,
      marginCzk: 1000,
      marginPercent: 20,
      floorPercent: 8,
      floorMinCzk: 300,
      belowFloor: false,
      approval: null,
      approvalValid: false,
      needsApproval: false,
      problem: null,
    });
  });

  it("converts EUR with the rate the quote stored when it was sent, before today's", () => {
    const data = road([line(200, "EUR")], [line(4000)], { fx: { date: "2026-10-01", rates: { EUR: 25 }, roePct: 100 } });
    expect(currenciesToResolve(data)).toEqual([]);
    expect(roadMargin(data, ctx({ rates: { EUR: 30 } }))).toMatchObject({ sellingCzk: 5000, buyingCzk: 4000, marginCzk: 1000 });
  });

  it("converts EUR with today's rate when the quote stored none", () => {
    const data = road([line(200, "EUR")], [line(150, "EUR")]);
    expect(currenciesToResolve(data)).toEqual(["EUR"]);
    expect(roadMargin(data, ctx({ rates: { EUR: 25 } }))).toMatchObject({ sellingCzk: 5000, buyingCzk: 3750, marginCzk: 1250, marginPercent: 25 });
  });

  it("takes a line without a currency in the quote's currency, EUR when it names none", () => {
    const data = road([{ type: "x", description: "", amount: 100 }], []);
    expect(currenciesToResolve(data)).toEqual(["EUR"]);
    expect(currenciesToResolve({ ...data, currency: "CZK" })).toEqual([]);
  });

  it("says which rate is missing: the margin is unknown and counts as below the floor", () => {
    const margin = roadMargin(road([line(200, "EUR"), line(1000)], [line(500)]), ctx({ rates: { EUR: null } }));
    expect(margin).toMatchObject({
      sellingCzk: 1000,
      buyingCzk: 500,
      marginCzk: null,
      marginPercent: null,
      belowFloor: true,
      needsApproval: true,
      problem: "No ČNB rate for EUR on 2026-10-15",
    });
  });

  it("has no percent when nothing is sold, and buying without selling is below the floor", () => {
    expect(roadMargin(road([], [line(1000)]), ctx())).toMatchObject({ sellingCzk: 0, marginCzk: -1000, marginPercent: null, belowFloor: true });
    expect(roadMargin(road([], [line(1000)]), ctx({ floor: { percent: 8, minAmountCzk: 0 } }))).toMatchObject({ belowFloor: true });
  });

  it("takes qty × unit price when both are set, else the amount", () => {
    const selling = [line(999, "CZK", { qty: 3, unitPrice: 1000 }), line(500, "CZK", { qty: 2 }), line(250, "CZK", { unitPrice: 7 })];
    expect(roadMargin(road(selling, []), ctx())).toMatchObject({ sellingCzk: 3750 });
    // An amount the browser saved as text still counts.
    expect(roadMargin(road([line("120" as unknown as number)], []), ctx())).toMatchObject({ sellingCzk: 120 });
  });

  it("is below the floor by percent even when the amount clears the minimum", () => {
    // 700 CZK is more than 300 CZK, but 7 % is less than 8 %.
    expect(roadMargin(road([line(10000)], [line(9300)]), ctx())).toMatchObject({ marginCzk: 700, marginPercent: 7, belowFloor: true });
  });

  it("is below the floor by the minimum even when the percent clears it", () => {
    // 50 % but only 250 CZK.
    expect(roadMargin(road([line(500)], [line(250)]), ctx())).toMatchObject({ marginCzk: 250, marginPercent: 50, belowFloor: true });
    expect(roadMargin(road([line(1000)], [line(700)]), ctx())).toMatchObject({ marginCzk: 300, belowFloor: false });
  });

  it("holds an approval while the margin is the one approved or better, not when it gets worse", () => {
    const approval = { byUserId: "u", byName: "Marie", at: "2026-10-15T08:00:00.000Z", reason: "Key account", marginCzk: 400, marginPercent: 4 };
    const at = (buying: number) => roadMargin(road([line(10000)], [line(buying)], { marginApproval: approval }), ctx());
    expect(at(9600)).toMatchObject({ belowFloor: true, approval, approvalValid: true, needsApproval: false });
    expect(at(9500)).toMatchObject({ marginCzk: 500, approvalValid: true, needsApproval: false });
    expect(at(9601)).toMatchObject({ marginCzk: 399, approvalValid: false, needsApproval: true });
  });

  it("never holds an approval for a margin it cannot work out", () => {
    const approval = { byUserId: "u", byName: "Marie", at: "x", reason: "ok", marginCzk: -100000, marginPercent: null };
    const margin = roadMargin(road([line(1, "EUR")], [], { marginApproval: approval }), ctx({ rates: { EUR: null } }));
    expect(margin).toMatchObject({ approvalValid: false, needsApproval: true });
  });
});

describe("approvalOf", () => {
  it("reads an approval and ignores what is none", () => {
    expect(approvalOf({ marginApproval: { byUserId: "u", byName: "M", at: "t", reason: "r", marginCzk: 1, marginPercent: null } })).toEqual({
      byUserId: "u",
      byName: "M",
      at: "t",
      reason: "r",
      marginCzk: 1,
      marginPercent: null,
    });
    expect(approvalOf({ marginApproval: { byUserId: "u", at: "t", marginCzk: "1" } })).toBeNull();
    expect(approvalOf({ marginApproval: null })).toBeNull();
    expect(approvalOf({})).toBeNull();
  });
});

describe("formatting", () => {
  it("writes amounts with thousands apart", () => {
    expect(formatCzk(4250)).toBe("4 250 CZK");
    expect(formatCzk(380.4)).toBe("380 CZK");
    expect(formatCzk(-1234567)).toBe("-1 234 567 CZK");
    expect(formatMoney(95.5, "EUR")).toBe("95.50 EUR");
  });
});

describe("marginGateMessage", () => {
  const margin = roadMargin(road([line(9047.62)], [line(8667.62)]), ctx())!;

  it("names the margin and the floor", () => {
    expect(marginGateMessage(margin)).toBe(
      "The margin of 380 CZK (4.2 %) is below the floor of 8 % / 300 CZK. A manager must approve it before the quote is sent.",
    );
  });

  it("says why the margin cannot be worked out and what lets the quote go, without asking for an approval", () => {
    const unknown = roadMargin(road([line(1, "EUR")], []), ctx({ rates: {} }))!;
    expect(unknown.needsApproval).toBe(true);
    expect(marginGateMessage(unknown)).toBe(
      "The margin cannot be worked out: No ČNB rate for EUR on 2026-10-15. The quote can be sent once the rate is available or its lines are in CZK.",
    );
  });
});
