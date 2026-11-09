import { describe, expect, it } from "vitest";
import { withFclPricing } from "./fclPricing";
import { isOceanFreightLine, withOceanOffer, type OceanOffer } from "./oceanQuote";
import {
  approvalLineOf,
  isOfferOfUpdate,
  keepChargeSettings,
  linesWaitingForRate,
  roadForToday,
  tariffUpdateBlock,
  tariffUpdateChange,
  tariffUpdateSelling,
  waitingTariffUpdates,
  withApprovedRate,
  withoutTariffUpdate,
} from "./tariffUpdates";
import type { CostLine, SalesQuoteData, TariffUpdate } from "./types";

const update: TariffUpdate = { oldRef: "ocean:v1:r1", kind: "ocean", newVersionId: "v2", newRateId: "r9", supplierName: "OOCL", was: [{ currency: "USD", amount: 1200 }], now: [{ currency: "USD", amount: 1350 }] };
const line = (tariffRef?: string): CostLine => ({ type: "Ocean freight", description: "", currency: "USD", amount: 1200, tariffRef });

describe("a new tariff rate", () => {
  it("waits while its lines are on the quote, and marks them", () => {
    const data = { tariffUpdates: [update], buyingLines: [line(), line("ocean:v1:r1"), line("ocean:v1:r1")] };
    expect(waitingTariffUpdates(data)).toEqual([update]);
    expect(linesWaitingForRate(data)).toEqual([1, 2]);
  });

  it("no longer waits once its lines have gone or been priced again", () => {
    const data = { tariffUpdates: [update], buyingLines: [line("ocean:v2:r9")] };
    expect(waitingTariffUpdates(data)).toEqual([]);
    expect(linesWaitingForRate(data)).toEqual([]);
    expect(waitingTariffUpdates({})).toEqual([]);
  });

  it("is found among the offers by its version and rate; a collection by its version", () => {
    expect(isOfferOfUpdate({ versionId: "v2", rateId: "r9" }, update)).toBe(true);
    expect(isOfferOfUpdate({ versionId: "v2", rateId: "r8" }, update)).toBe(false);
    expect(isOfferOfUpdate({ versionId: "v2" }, { ...update, newRateId: null })).toBe(true);
  });

  it("says what changed", () => {
    expect(tariffUpdateChange(update)).toMatch(/^Was .*1.*200.*, now .*1.*350/);
  });

  it("no longer waits once its buying lines are priced again, whatever a selling line copied from them is tagged", () => {
    const data = { tariffUpdates: [update], buyingLines: [line("ocean:v2:r9")], sellingLines: [line("ocean:v1:r1")] };
    expect(waitingTariffUpdates(data)).toEqual([]);
    expect(tariffUpdateBlock(data)).toBeNull();
  });

  it("holds the quote in the server's words while it waits", () => {
    const data = { tariffUpdates: [update, { ...update, oldRef: "rail:v1:r1" }], buyingLines: [line("ocean:v1:r1"), line("rail:v1:r1")] };
    expect(tariffUpdateBlock(data)).toBe("2 tariffs have a new rate — approve it in Pricing, or pick another tariff, before the quote goes out");
    expect(tariffUpdateBlock({ ...data, tariffUpdates: [update] })).toBe("A tariff has a new rate — approve it in Pricing, or pick another tariff, before the quote goes out");
  });

  it("leaves the quote's waiting rates once approved", () => {
    const rail = { ...update, oldRef: "rail:v1:r1" };
    expect(withoutTariffUpdate({ tariffUpdates: [update, rail] }, update)).toEqual([rail]);
    expect(withoutTariffUpdate({ tariffUpdates: [update] }, update)).toBeUndefined();
  });

  it("says that a quote in the FCL layout moves its selling with the new buying", () => {
    expect(tariffUpdateSelling(update, true)).toMatch(/approving moves it with the new buying, each charge keeping its profit/);
    expect(tariffUpdateSelling(update, false)).toBe("The selling price has not changed.");
  });
});

describe("approving a new rate", () => {
  const REF = "ocean:v1:r1";
  const freight = { chargeCode: "ocean_freight", type: "Ocean freight", basis: "container" as const, currency: "EUR", tariffRef: REF, supplier: "X" };
  const quote: SalesQuoteData = {
    serviceType: "Sea FCL",
    currency: "EUR",
    allIn: true,
    containers: [
      { type: "20' DC", qty: 1 },
      { type: "40' HC", qty: 1 },
    ],
    fclPricing: { blocks: {}, byCharge: true, roundUp: true },
    buyingLines: [
      { ...freight, description: "Ocean freight A → B (X) - 1 × 20' DC", containerType: "20' DC", qty: 1, unitPrice: 1000, amount: 1000, pairId: "p1", chargeProfit: { mode: "sum", value: 100 } },
      { ...freight, description: "Ocean freight A → B (X) - 1 × 40' HC", containerType: "40' HC", qty: 1, unitPrice: 1800, amount: 1800, pairId: "p2", chargeProfit: { mode: "sum", value: 200 } },
      { type: "BAF", chargeCode: "fcl_baf", description: "BAF – BAF", basis: "lumpsum", currency: "EUR", amount: 300, qty: 2, unitPrice: 150, tariffRef: REF, pairId: "p3", chargeProfit: { mode: "sum", value: 50 }, inAllIn: false },
    ],
    sellingLines: [],
  } as SalesQuoteData;
  const offer = {
    versionId: "v2",
    rateId: "r2",
    supplierName: "X",
    supplierCustomerId: "c",
    currency: "EUR",
    via: "",
    polName: "A",
    polCode: "",
    podName: "B",
    podCode: "",
    lines: [
      { type: "20' DC", qty: 1, price: 1000 },
      { type: "40' HC", qty: 1, price: 1800 },
    ],
    surcharges: [{ charge: "fcl_baf", code: "BAF", name: "BAF", currency: "EUR", total: 300, units: 2, rate: 150, basis: "container" }],
  } as unknown as OceanOffer;
  const sheet = { EUR: 25 };
  const live = { roePct: 100, fixingDate: "2026-11-09" };
  const selling = (data: SalesQuoteData) => (withFclPricing(data, sheet, live, { roundUp: true, open: true })!.sellingLines ?? []).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  it("is put on the first freight line of the old rate", () => {
    const lines = [quote.buyingLines![2]!, ...quote.buyingLines!.slice(0, 2)];
    expect(approvalLineOf(lines, { ...update, oldRef: REF }, isOceanFreightLine)).toBe(1);
    expect(approvalLineOf([quote.buyingLines![2]!], { ...update, oldRef: REF }, isOceanFreightLine)).toBe(0);
    expect(approvalLineOf([line()], { ...update, oldRef: REF }, isOceanFreightLine)).toBe(-1);
  });

  it("keeps each charge's profit, All in tick and pairing, so the same rates sell for the same", () => {
    const old = quote.buyingLines!;
    const pick = withApprovedRate(withOceanOffer(old, 0, offer, { pol: "A", pod: "B" }, quote), old);
    expect(pick.lines.map((l) => [l.containerType ?? null, l.chargeProfit?.value ?? null, l.pairId ?? null, l.inAllIn ?? null])).toEqual([
      ["20' DC", 100, "p1", null],
      ["40' HC", 200, "p2", null],
      [null, 50, "p3", false],
    ]);
    expect(pick.lines.every((l) => l.tariffRef === "ocean:v2:r2")).toBe(true);
    expect(selling({ ...quote, buyingLines: pick.lines })).toBe(selling(quote));
  });

  it("starts a charge the old rate did not have without a profit, giving up a pairing another line kept", () => {
    const [first] = quote.buyingLines!;
    const lines = keepChargeSettings([first!], [{ ...first!, pairId: "p1" }, { ...first!, containerType: "45' HC", pairId: "p1" }]);
    expect(lines[0]).toMatchObject({ pairId: "p1", chargeProfit: { value: 100 } });
    expect(lines[1]).not.toHaveProperty("chargeProfit");
    expect(lines[1]).not.toHaveProperty("pairId");
  });
});

describe("a new road rate", () => {
  const road: TariffUpdate = { ...update, oldRef: "trucking:sv1:EXPRESS", kind: "road", newRateId: null, was: [{ currency: "CZK", amount: 4250 }], now: [{ currency: "CZK", amount: 4500 }], buyWas: [{ currency: "CZK", amount: 3000 }], buyNow: [{ currency: "CZK", amount: 3100 }] };
  const roadLine = line("trucking:bv1:EXPRESS");

  it("waits while the quote has road lines, and marks the buying ones", () => {
    const data = { tariffUpdates: [road], buyingLines: [line(), roadLine] };
    expect(waitingTariffUpdates(data)).toEqual([road]);
    expect(linesWaitingForRate(data)).toEqual([1]);
    expect(waitingTariffUpdates({ tariffUpdates: [road], buyingLines: [line()] })).toEqual([]);
  });

  it("says what moves on both sides", () => {
    expect(tariffUpdateChange(road)).toMatch(/^Selling was .*now .*Buying was .*now /);
    expect(tariffUpdateSelling(road, true)).toMatch(/changes the selling price/);
    expect(tariffUpdateSelling(update, false)).toMatch(/has not changed/);
  });

  it("is priced for today once the pickup date has passed", () => {
    expect(roadForToday({ pickupDate: "2026-11-01" }, "2026-11-09")).toEqual({ pickupDate: null });
    expect(roadForToday({ pickupDate: "2026-11-20" }, "2026-11-09")).toEqual({ pickupDate: "2026-11-20" });
  });
});
