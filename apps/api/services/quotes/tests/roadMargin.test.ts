import { describe, expect, it } from "vitest";
import {
  approvalOf,
  freightModeGateMessage,
  formatCzk,
  formatMoney,
  marginGateMessage,
  roadMargin,
  roadMarginApplies,
  type MarginContext,
} from "../lib/roadMargin";
import { guardrailSettings } from "../lib/guardrails";

// The council's floors, and Trucking's 8 % / 300 CZK for Road.
const floors = (percent = 8, minAmountCzk = 300) => guardrailSettings([], { percent, minAmountCzk });
const ctx = (over: Partial<MarginContext> = {}): MarginContext => ({
  settings: floors(),
  today: "2026-10-15",
  rates: {},
  roePct: 100,
  ...over,
});

const line = (amount: number, currency = "CZK", over: Record<string, unknown> = {}) => ({ type: "Road freight", description: "", currency, amount, ...over });
// A road quote priced in CZK, as road quotes are unless their currency is changed.
const road = (selling: unknown[], buying: unknown[], over: Record<string, unknown> = {}) => ({ serviceType: "Road", currency: "CZK", sellingLines: selling, buyingLines: buying, ...over });

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
  it("is null for a quote no guardrail applies to, and judges every other freight mode against its own floor", () => {
    expect(roadMargin({ serviceType: "Courier", sellingLines: [line(100)] }, ctx())).toBeNull();
    expect(roadMargin({ sellingLines: [line(100)] }, ctx())).toBeNull();
    // Air: 10 % / 1 000 CZK.
    expect(roadMargin({ serviceType: "Air", currency: "CZK", sellingLines: [line(20000)], buyingLines: [line(18500)] }, ctx())).toMatchObject({ mode: "Air", marginCzk: 1500, marginPercent: 7.5, floorPercent: 10, floorMinCzk: 1000, belowFloor: true });
    // Sea FCL: 7 % and 1 500 CZK per container - four boxes need 6 000 CZK.
    const fcl = { serviceType: "Sea FCL", currency: "CZK", containers: [{ qty: 3, type: "40' HC" }, { qty: 1, type: "20' DV" }], sellingLines: [line(100000)], buyingLines: [line(95000)] };
    expect(roadMargin(fcl, ctx())).toMatchObject({ mode: "Sea FCL", floorPercent: 7, floorMinCzk: 6000, marginCzk: 5000, belowFloor: true });
    // A Sea quote with a trucking line is judged as the Sea quote it is.
    expect(roadMargin({ ...fcl, buyingLines: [line(95000, "CZK", { tariffRef: "trucking:v1:D1" })] }, ctx())).toMatchObject({ mode: "Sea FCL" });
  });

  it("takes the floors a manager set over the defaults", () => {
    const settings = guardrailSettings([{ serviceType: "Air", percent: 5, minAmountCzk: 500 }], { percent: 8, minAmountCzk: 300 });
    expect(roadMargin({ serviceType: "Air", currency: "CZK", sellingLines: [line(20000)], buyingLines: [line(18500)] }, ctx({ settings }))).toMatchObject({ floorPercent: 5, belowFloor: false });
  });

  it("holds selling with no buying for approval: its margin can't be judged (D5)", () => {
    const margin = roadMargin(road([line(5000)], []), ctx())!;
    expect(margin).toMatchObject({ noBuying: true, marginCzk: 5000, belowFloor: true, needsApproval: true });
    expect(marginGateMessage(margin)).toBe("The quote sells with no buying lines, so its margin cannot be judged. Enter the buying, or a manager must approve it before the quote is sent.");
  });

  it("works in CZK alone without any rate", () => {
    expect(roadMargin(road([line(5000)], [line(4000)]), ctx())).toEqual({
      mode: "Road",
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
      noBuying: false,
      approvalEnded: null,
    });
  });

  it("converts EUR with the rate the quote stored when it was sent, before today's", () => {
    const data = road([line(200, "EUR")], [line(4000)], { fx: { date: "2026-10-01", rates: { EUR: 25 }, roePct: 100 } });
    expect(roadMargin(data, ctx({ rates: { EUR: 30 } }))).toMatchObject({ sellingCzk: 5000, buyingCzk: 4000, marginCzk: 1000 });
  });

  it("converts EUR with today's rate when the quote stored none", () => {
    const data = road([line(200, "EUR")], [line(150, "EUR")]);
    expect(roadMargin(data, ctx({ rates: { EUR: 25 } }))).toMatchObject({ sellingCzk: 5000, buyingCzk: 3750, marginCzk: 1250, marginPercent: 25 });
  });

  it("takes a line without a currency in the quote's currency, EUR when it names none", () => {
    const data = { serviceType: "Road", sellingLines: [{ type: "x", description: "", amount: 100 }], buyingLines: [] };
    expect(roadMargin(data, ctx({ rates: { EUR: 25 } }))).toMatchObject({ sellingCzk: 2500 });
    expect(roadMargin({ ...data, currency: "CZK" }, ctx())).toMatchObject({ sellingCzk: 100 });
  });

  it("counts the ROE % on a selling line in another currency than the quote's, never on buying (D4)", () => {
    const data = road([line(200, "EUR")], [line(200, "EUR")]);
    // 200 EUR × 25 × 102 % sold, 200 EUR × 25 bought: the 2 % is margin, as the editor shows it.
    expect(roadMargin(data, ctx({ rates: { EUR: 25 }, roePct: 102 }))).toMatchObject({ sellingCzk: 5100, buyingCzk: 5000, marginCzk: 100, marginPercent: 2 });
    // A sent quote keeps the ROE % it stored.
    const sent = { ...data, quoteStatus: "quoted", fx: { date: "2026-10-01", rates: { EUR: 25 }, roePct: 100 } };
    expect(roadMargin(sent, ctx({ rates: { EUR: 25 }, roePct: 102 }))).toMatchObject({ marginCzk: 0 });
  });

  it("works an EUR quote out in EUR first, then in CZK", () => {
    const data = road([line(400, "EUR")], [line(9000, "CZK")], { currency: "EUR" });
    // 9 000 CZK is 360 EUR at 25: 40 EUR profit, 1 000 CZK; a CZK buying line gets no ROE.
    expect(roadMargin(data, ctx({ rates: { EUR: 25 }, roePct: 105 }))).toMatchObject({ sellingCzk: 10000, buyingCzk: 9000, marginCzk: 1000, marginPercent: 10 });
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
    expect(roadMargin(road([], [line(1000)]), ctx({ settings: floors(8, 0) }))).toMatchObject({ belowFloor: true });
  });

  it("does not block a quote with no lines yet: no margin, nothing to approve", () => {
    expect(roadMargin(road([], []), ctx())).toMatchObject({ sellingCzk: 0, buyingCzk: 0, marginCzk: null, marginPercent: null, belowFloor: false, needsApproval: false, problem: null });
    expect(roadMargin({ serviceType: "Road" }, ctx())).toMatchObject({ marginCzk: null, needsApproval: false });
  });

  it("takes the amount, also when it was edited by hand; qty × unit price only without an amount (C4)", () => {
    const selling = [line(999, "CZK", { qty: 3, unitPrice: 1000 }), line(500, "CZK", { qty: 2 }), line(250, "CZK", { unitPrice: 7 })];
    expect(roadMargin(road(selling, []), ctx())).toMatchObject({ sellingCzk: 1749 });
    expect(roadMargin(road([{ currency: "CZK", qty: 3, unitPrice: 1000 }], []), ctx())).toMatchObject({ sellingCzk: 3000 });
    expect(roadMargin(road([{ currency: "CZK", qty: 3, unitPrice: 1000, amount: "" }], []), ctx())).toMatchObject({ sellingCzk: 3000 });
    // A rep cuts the tariff's 10 000 to 6 000 by hand: the gate judges the 6 000.
    const cut = road([line(6000, "CZK", { qty: 1, unitPrice: 10000, tariffRef: "trucking:v1:D1" })], [line(5800)]);
    expect(roadMargin(cut, ctx())).toMatchObject({ sellingCzk: 6000, marginCzk: 200, belowFloor: true, needsApproval: true });
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

  it("holds an approval while the margin is the one approved or better - within 100 CZK or 0.5 % of selling, and half a point (D10)", () => {
    const approval = { byUserId: "u", byName: "Marie", at: "2026-10-15T08:00:00.000Z", reason: "Key account", marginCzk: 400, marginPercent: 4 };
    const at = (buying: number) => roadMargin(road([line(10000)], [line(buying)], { marginApproval: approval }), ctx());
    expect(at(9600)).toMatchObject({ belowFloor: true, approval, approvalValid: true, needsApproval: false });
    expect(at(9500)).toMatchObject({ marginCzk: 500, approvalValid: true, needsApproval: false });
    // A small ČNB move: 50 CZK worse, 3.5 % - still covered.
    expect(at(9650)).toMatchObject({ marginCzk: 350, approvalValid: true });
    expect(at(9701)).toMatchObject({ marginCzk: 299, approvalValid: false, needsApproval: true });
  });

  it("ends an approval when the customer, mode, containers, owner or a longer validity make it another quote (D10)", () => {
    const basis = { customerId: "c1", serviceType: "Road", containers: 0, salesOwner: "jan@forwarder.cz", validUntil: "2026-11-20" };
    const approval = { byUserId: "u", byName: "Marie", at: "2026-10-15T08:00:00.000Z", reason: "Key account", marginCzk: 400, marginPercent: 4, basis };
    const quote = (over: Record<string, unknown>) => roadMargin(road([line(10000)], [line(9600)], { customerId: "c1", salesOwner: "jan@forwarder.cz", validUntil: "2026-11-20", marginApproval: approval, ...over }), ctx())!;
    expect(quote({})).toMatchObject({ approvalValid: true, approvalEnded: null });
    expect(quote({ customerId: "c2" })).toMatchObject({ approvalValid: false, approvalEnded: "the customer changed" });
    expect(quote({ salesOwner: "eva@forwarder.cz" })).toMatchObject({ approvalEnded: "the Sales Owner changed" });
    expect(quote({ validUntil: "2026-11-25" })).toMatchObject({ approvalEnded: "the validity was extended past 2026-11-20" });
    expect(quote({ validUntil: "2026-11-18" })).toMatchObject({ approvalValid: true });
    // No validity at all is no end to it: as much a longer validity as a later date.
    expect(quote({ validUntil: undefined })).toMatchObject({ approvalValid: false, approvalEnded: "the validity was extended past 2026-11-20" });
    expect(marginGateMessage(quote({ customerId: "c2" }))).toContain("The approval no longer covers it: the customer changed.");
  });

  it("counts an empty or zero buying line as no buying (D5)", () => {
    expect(roadMargin(road([line(20000)], [line(0)]), ctx())).toMatchObject({ noBuying: true, belowFloor: true, needsApproval: true });
    expect(roadMargin(road([line(20000)], [{ type: "Road freight", description: "" }]), ctx())).toMatchObject({ noBuying: true, needsApproval: true });
    expect(roadMargin(road([line(20000)], [line(0), line(15000)]), ctx())).toMatchObject({ noBuying: false, belowFloor: false });
  });

  it("covers with an approval given when nothing was sold only a quote that still sells nothing", () => {
    const approval = { byUserId: "u", byName: "Marie", at: "2026-10-15T08:00:00.000Z", reason: "Sample", marginCzk: -1000, marginPercent: null };
    expect(roadMargin(road([], [line(1000)], { marginApproval: approval }), ctx())).toMatchObject({ approvalValid: true });
    expect(roadMargin(road([line(1000)], [line(2050)], { marginApproval: approval }), ctx())).toMatchObject({ marginCzk: -1050, approvalValid: false, needsApproval: true });
  });

  it("holds a Road quote while Trucking's floor could not be read, unless an approval covers its margin", () => {
    const unread = ctx({ roadFloorUnavailable: true });
    const margin = roadMargin(road([line(20000)], [line(10000)]), unread)!;
    expect(margin).toMatchObject({ belowFloor: true, needsApproval: true, problem: "Trucking's margin floor could not be read" });
    expect(marginGateMessage(margin)).toBe("The margin cannot be judged: Trucking's margin floor could not be read. Try again in a moment.");
    // Other modes never wait for Trucking.
    expect(roadMargin({ serviceType: "Air", currency: "CZK", sellingLines: [line(20000)], buyingLines: [line(10000)] }, unread)).toMatchObject({ belowFloor: false, problem: null });
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
      "The margin of 380 CZK (4.2 %) is below the Road floor of 8 % / 300 CZK. A manager must approve it before the quote is sent.",
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

describe("freightModeGateMessage", () => {
  it("holds a quote with prices and no freight mode a guardrail knows; one without lines may go", () => {
    expect(freightModeGateMessage({ sellingLines: [line(100)] })).toMatch(/^Choose the Freight Mode first/);
    expect(freightModeGateMessage({ serviceType: "Courier", buyingLines: [line(100)] })).toMatch(/^Choose the Freight Mode first/);
    expect(freightModeGateMessage({ serviceType: "Air", sellingLines: [line(100)] })).toBeNull();
    // A trucking tariff line makes it a Road quote.
    expect(freightModeGateMessage({ sellingLines: [line(100, "CZK", { tariffRef: "trucking:v1:D1" })] })).toBeNull();
    expect(freightModeGateMessage({})).toBeNull();
  });
});
