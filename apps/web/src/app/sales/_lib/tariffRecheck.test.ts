import { describe, expect, it } from "vitest";
import { cargoWeightKey, linesForOtherDirection, linesToRecheck, otherDirectionBlock, rechecked, stampDirection, stampPricedFor, withPricedForNow } from "./tariffRecheck";
import type { CostLine, SalesQuoteData } from "./types";

const rail: CostLine = { type: "Inland container haulage", chargeCode: "inland_haulage", description: "Rail Ostrava → Bremerhaven", currency: "EUR", amount: 1073, tariffRef: "rail:v1:r1", pairId: "r" };
const ocean: CostLine = { type: "Ocean freight", chargeCode: "ocean_freight", description: "Ocean freight", currency: "USD", amount: 900, tariffRef: "ocean:v1:o1", pairId: "o" };
const typed: CostLine = { type: "Other", description: "Typed", currency: "EUR", amount: 50 };

const fcl = (weight: number): SalesQuoteData => ({
  serviceType: "Sea FCL",
  containers: [
    { qty: 1, type: "40' HC", weight },
    { qty: 1, type: "20' DC", weight: 8000 },
  ],
});

describe("a rate to recheck", () => {
  it("is keyed by each container type's cargo weight on a full-container quote, by the gross weight otherwise", () => {
    expect(cargoWeightKey(fcl(20000))).toBe("20' DC 8000 kg, 40' HC 20000 kg");
    expect(cargoWeightKey({ serviceType: "Sea LCL", packages: [{ qty: 2, type: "Pallets", weight: 300 }] })).toBe("600 kg");
  });

  it("is a rail or collections line priced for another cargo weight than Cargo details has now", () => {
    const priced = stampPricedFor([rail, ocean, typed], [0, 1, 2], fcl(20000));
    // Only tariffs that price by weight remember it.
    expect(priced.map((l) => l.pricedFor)).toEqual(["20' DC 8000 kg, 40' HC 20000 kg", undefined, undefined]);
    expect(linesToRecheck({ ...fcl(20000), buyingLines: priced })).toEqual([]);
    expect(linesToRecheck({ ...fcl(24000), buyingLines: priced })).toEqual([0]);
  });

  it("is checked once its rate is changed by hand, not by another edit", () => {
    const priced = stampPricedFor([rail, typed], [0], fcl(20000));
    const now = fcl(24000);
    expect(rechecked(priced, priced.map((l, i) => (i === 1 ? { ...l, description: "x" } : l)), now)).toBeNull();
    const after = rechecked(priced, priced.map((l, i) => (i === 0 ? { ...l, amount: 1200 } : l)), now)!;
    expect(linesToRecheck({ ...now, buyingLines: after })).toEqual([]);
  });

  it("is never a line priced before the weight was remembered - until the quote is opened, which takes it as priced for today's weight", () => {
    expect(linesToRecheck({ ...fcl(24000), buyingLines: [rail] })).toEqual([]);
    const opened = withPricedForNow({ ...fcl(20000), buyingLines: [rail, ocean] }, {});
    expect(opened.buyingLines!.map((l) => l.pricedFor)).toEqual(["20' DC 8000 kg, 40' HC 20000 kg", undefined]);
    expect(linesToRecheck({ ...fcl(24000), buyingLines: opened.buyingLines })).toEqual([0]);
    expect(withPricedForNow({ ...fcl(20000), buyingLines: opened.buyingLines }, {})).toEqual({});
  });
});

describe("a rate priced in another Trade Direction", () => {
  const exportQuote: SalesQuoteData = { ...fcl(20000), direction: "Export" };
  it("is remembered for rail and ocean lines, in the quote's Trade Direction", () => {
    expect(stampDirection([rail, ocean, typed], [0, 1, 2], exportQuote).map((l) => l.pricedDirection)).toEqual(["export", "export", undefined]);
    // Without a Trade Direction nothing is priced from a tariff, so nothing is remembered.
    expect(stampDirection([rail], [0], fcl(20000))[0]?.pricedDirection).toBeUndefined();
  });

  it("is marked, and holds the quote, once the Trade Direction changes", () => {
    const buyingLines = stampDirection([rail, ocean, typed], [0, 1], exportQuote);
    expect(linesForOtherDirection({ ...exportQuote, buyingLines })).toEqual([]);
    expect(otherDirectionBlock({ ...exportQuote, buyingLines })).toBeNull();
    const nowImport = { ...exportQuote, direction: "Import", buyingLines };
    expect(linesForOtherDirection(nowImport)).toEqual([0, 1]);
    expect(otherDirectionBlock(nowImport)).toBe(
      "2 buying lines were priced from an export tariff, and the quote is now an import — pick the tariff again under Tariffs available, or remove the lines",
    );
    // A line priced before the direction was remembered is not known.
    expect(linesForOtherDirection({ ...nowImport, buyingLines: [rail] })).toEqual([]);
  });
});
