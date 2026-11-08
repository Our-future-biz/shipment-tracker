import { describe, expect, it } from "vitest";
import { isOfferOfUpdate, linesWaitingForRate, roadForToday, tariffUpdateChange, tariffUpdateSelling, waitingTariffUpdates } from "./tariffUpdates";
import type { CostLine, TariffUpdate } from "./types";

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
    expect(tariffUpdateSelling(road)).toMatch(/changes the selling price/);
    expect(tariffUpdateSelling(update)).toMatch(/has not changed/);
  });

  it("is priced for today once the pickup date has passed", () => {
    expect(roadForToday({ pickupDate: "2026-11-01" }, "2026-11-09")).toEqual({ pickupDate: null });
    expect(roadForToday({ pickupDate: "2026-11-20" }, "2026-11-09")).toEqual({ pickupDate: "2026-11-20" });
  });
});
