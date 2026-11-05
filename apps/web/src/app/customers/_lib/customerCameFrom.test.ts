import { describe, expect, it } from "vitest";
import { cameFromLabel, nextCameFrom } from "./customerCameFrom";

const ALZA = "/customers/alza-id/";
const noted = { customerId: "alza-id", href: "/shipments/ship-id/?tab=costs" };

describe("where a customer's page was opened from", () => {
  it("notes the page left, with its tab, when a customer's page opens", () => {
    expect(nextCameFrom(null, "/shipments/ship-id/?tab=costs", ALZA)).toEqual(noted);
  });

  it("replaces an earlier note when the customer is opened from somewhere else", () => {
    expect(nextCameFrom(noted, "/invoicing/", ALZA)).toEqual({ customerId: "alza-id", href: "/invoicing/" });
  });

  it("keeps the note while moving between the customer's own tabs", () => {
    expect(nextCameFrom(noted, ALZA, `${ALZA}?tab=contacts`)).toBe(noted);
  });

  it("keeps the note on a reload, when no earlier page is known", () => {
    expect(nextCameFrom(noted, null, ALZA)).toBe(noted);
  });

  it("has nothing to offer when opened from the Customer Database list or another customer", () => {
    expect(nextCameFrom(noted, "/customers/?q=alza", ALZA)).toBeNull();
    expect(nextCameFrom(noted, "/customers/other-id/", ALZA)).toBeNull();
  });

  it("leaves the note alone on pages that are not a customer's", () => {
    expect(nextCameFrom(noted, ALZA, "/shipments/")).toBe(noted);
    expect(nextCameFrom(noted, "/shipments/", "/customers/")).toBe(noted);
  });
});

describe("what the way back is called", () => {
  it("is the quote's number on a quote", () => {
    expect(cameFromLabel("/sales/quote/QCZ00000012/?from=followup")).toBe("QCZ00000012");
  });

  it("is the menu's name for the page anywhere else", () => {
    expect(cameFromLabel("/shipments/?status=open")).toBe("Shipments");
    expect(cameFromLabel("/sales/pipeline/")).toBe("Pipeline");
    expect(cameFromLabel("/trucking/hauliers/some-id/")).toBe("Trucking Concept");
    expect(cameFromLabel("/warehouse-concept/managers/")).toBe("Managers");
  });

  it("falls back to a plain name for a page outside the menu", () => {
    expect(cameFromLabel("/somewhere/else/")).toBe("Previous page");
  });
});
