import { describe, expect, it } from "vitest";
import { isChargeLine, offerTerminals, rankOffers, tariffRefVersionId, viaTerminals, withTariffLines } from "./tariffQuote";
import type { CostLine } from "./types";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Other", chargeCode: "other", description: "", currency: "EUR", amount: 0, ...over });

describe("terminals", () => {
  const offers = [
    { rateId: "a", via: "Cetr" },
    { rateId: "b", via: "Zlin" },
    { rateId: "c", via: "Praha" },
    { rateId: "d", via: "Cetr" },
  ];

  it("lists the terminals of the offers by name, with how many run via each", () => {
    expect(offerTerminals(offers)).toEqual([
      { via: "Cetr", count: 2 },
      { via: "Praha", count: 1 },
      { via: "Zlin", count: 1 },
    ]);
  });

  it("keeps the offers via the chosen terminals, in their order", () => {
    expect(viaTerminals(offers, ["Praha", "Cetr"]).map((o) => o.rateId)).toEqual(["a", "c", "d"]);
  });

  it("shows them all while none of the chosen terminals is among them", () => {
    expect(viaTerminals(offers, [])).toHaveLength(4);
    expect(viaTerminals(offers, ["Usti"])).toHaveLength(4);
  });
});

describe("rankOffers", () => {
  it("puts the cheapest in the quote's currency first and an offer without a rate last", () => {
    const offers = [{ id: "a", eur: 300 }, { id: "b", eur: null }, { id: "c", eur: 100 }];
    expect(rankOffers(offers, (o) => o.eur).map((o) => o.id)).toEqual(["c", "a", "b"]);
  });
});

describe("tariff lines", () => {
  it("knows a line by its charge code or the label of an older line, and the version it was priced from", () => {
    expect(isChargeLine(line({ chargeCode: "ocean_freight" }), "ocean_freight")).toBe(true);
    expect(isChargeLine({ type: "Inland container haulage" }, "inland_haulage")).toBe(true);
    expect(tariffRefVersionId(line({ tariffRef: "rail:v1:r1" }), "rail:")).toBe("v1");
    expect(tariffRefVersionId(line({ tariffRef: "ocean:v1:r1" }), "rail:")).toBeNull();
    expect(tariffRefVersionId(line(), "rail:")).toBeNull();
  });

  it("puts an offer's lines in the picked line's place and drops what an earlier pick on it made", () => {
    const earlier = line({ description: "old", tariffRef: "rail:v1:r1" });
    const lines = [earlier, line({ description: "keep" }), { ...earlier, description: "old too" }];
    const pick = withTariffLines(lines, 2, "rail:", (picked) => [{ ...picked, description: "new 1" }, { ...picked, description: "new 2" }]);
    expect(pick).toMatchObject({ removed: [0], at: 1, count: 2 });
    expect(pick.lines.map((l) => l.description)).toEqual(["keep", "new 1", "new 2"]);
  });
});
