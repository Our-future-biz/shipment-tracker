import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
import { assertBuyChangeAllowed, type BuyLockFacts } from "../lib/buyPriceLock";

const facts = (over: Partial<BuyLockFacts> = {}): BuyLockFacts => ({ what: "Trip LCZ2600000012", orderOut: false, invoiceNumber: null, manager: false, reason: "", ...over });

describe("assertBuyChangeAllowed", () => {
  it("lets anyone change the price before the order goes out", () => {
    expect(assertBuyChangeAllowed(facts())).toEqual({ afterOrder: false });
  });

  it("after the order: a manager only, with a reason, flagged as a reprice", () => {
    expect(() => assertBuyChangeAllowed(facts({ orderOut: true }))).toThrow(/only a manager can change its price/);
    expect(() => assertBuyChangeAllowed(facts({ orderOut: true, manager: true, reason: "  a " }))).toThrow(/Give the reason/);
    expect(assertBuyChangeAllowed(facts({ orderOut: true, manager: true, reason: "fuel surcharge" }))).toEqual({ afterOrder: true });
  });

  it("never once it is on a haulier invoice, not even for a manager", () => {
    expect(() => assertBuyChangeAllowed(facts({ invoiceNumber: "FV2026-118", orderOut: true, manager: true, reason: "agreed" }))).toThrow(
      "Trip LCZ2600000012 is on haulier invoice FV2026-118: its price can no longer change",
    );
  });
});
