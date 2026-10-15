import { describe, expect, it } from "vitest";
import type { TariffListItem } from "@/hooks/useTrucking";
import { haulierBuyTariffs, priceListsUsed } from "./customerTrucking";

const tariff = (patch: Partial<TariffListItem>): TariffListItem => ({
  id: "t",
  side: "SELL",
  scope: "LTL",
  mode: "MATRIX",
  name: "Standard — LTL sell",
  ownerCustomerId: null,
  ownerName: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
  discountPercent: null,
  activeVersion: null,
  nextVersion: null,
  draftCount: 0,
  ...patch,
});

describe("customer price lists", () => {
  const standardLtl = tariff({ id: "std-ltl" });
  const standardFtl = tariff({ id: "std-ftl", scope: "FTL" });
  const ownLtl = tariff({ id: "own-ltl", ownerCustomerId: "c1", mode: "DISCOUNT", discountPercent: 5 });
  const otherCustomer = tariff({ id: "other", ownerCustomerId: "c2", scope: "FTL" });

  it("uses the customer's own list per scope, else the Standard list", () => {
    const used = priceListsUsed([standardLtl, standardFtl, ownLtl, otherCustomer], "c1");
    expect(used.map((u) => [u.scope, u.tariff.id, u.own, u.standard?.id])).toEqual([
      ["LTL", "own-ltl", true, "std-ltl"],
      ["FTL", "std-ftl", false, "std-ftl"],
    ]);
  });

  it("names nothing for a scope without any sell list", () => {
    expect(priceListsUsed([tariff({ side: "BUY", ownerCustomerId: "c1" })], "c1")).toEqual([]);
    expect(priceListsUsed([ownLtl], "c1")).toEqual([{ scope: "LTL", tariff: ownLtl, own: true, standard: null }]);
  });

  it("lists a haulier's buy tariffs by scope", () => {
    const buyFtl = tariff({ id: "b-ftl", side: "BUY", scope: "FTL", ownerCustomerId: "h1" });
    const buyLtl = tariff({ id: "b-ltl", side: "BUY", scope: "LTL", ownerCustomerId: "h1" });
    const someoneElse = tariff({ id: "b-x", side: "BUY", ownerCustomerId: "h2" });
    expect(haulierBuyTariffs([buyFtl, someoneElse, buyLtl, standardLtl], "h1").map((t) => t.id)).toEqual(["b-ltl", "b-ftl"]);
  });
});
