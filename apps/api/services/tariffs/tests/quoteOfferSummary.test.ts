import { describe, expect, it } from "vitest";
import type { CollectionOffer, OceanOffer, RailOffer } from "../interfaces/interfaces";
import { collectionOfferSummary, oceanOfferSummary, railOfferSummary } from "../lib/quoteOfferSummary";

// The lines an offer makes on a quote, as the web writes them when it is picked.
describe("an offer in short, for the overnight check of quotes", () => {
  it("gives an ocean offer's rate per container of each type, then its surcharges, in order", () => {
    const offer = {
      versionId: "v2",
      rateId: "r2",
      tariffId: "t1",
      supplierName: "OOCL",
      via: "",
      currency: "USD",
      lines: [
        { type: "20' DC", qty: 2, price: 1000.335, amount: 2000.67 },
        { type: "40' HC", qty: 1, price: 1800, amount: 1800 },
      ],
      surcharges: [{ name: "Bunker", code: "BAF", charge: "fcl_baf", basis: "container", units: 3, rate: 50, total: 150, currency: "EUR" }],
      totals: [{ currency: "USD", amount: 3800.67 }, { currency: "EUR", amount: 150 }],
    } as unknown as OceanOffer;
    expect(oceanOfferSummary(offer)).toMatchObject({
      versionId: "v2",
      rateId: "r2",
      tariffId: "t1",
      lines: [
        { containerType: "20' DC", currency: "USD", amount: 2000.67 },
        { containerType: "40' HC", currency: "USD", amount: 1800 },
        { containerType: null, currency: "EUR", amount: 150 },
      ],
    });
  });

  it("gives a rail offer's rate per container of each type, and a collection its one lump sum", () => {
    const rail = { versionId: "v", rateId: "r", tariffId: "t", supplierName: "Metrans", via: "Praha", currency: "EUR", total: 900, lines: [{ type: "40' HC", qty: 2, price: 450, amount: 900, bandCode: "B", bandLabel: "40'" }] } as unknown as RailOffer;
    expect(railOfferSummary(rail)).toMatchObject({ totals: [{ currency: "EUR", amount: 900 }], lines: [{ containerType: "40' HC", currency: "EUR", amount: 900 }] });
    const collection = { versionId: "v", tariffId: "t", supplierName: "Haulier", currency: "CZK", total: 4200 } as unknown as CollectionOffer;
    expect(collectionOfferSummary(collection)).toMatchObject({ rateId: null, via: "", lines: [{ containerType: null, currency: "CZK", amount: 4200 }] });
  });
});
