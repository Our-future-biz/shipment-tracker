import { describe, expect, it } from "vitest";
import { createShipmentHint, shipmentFromQuoteBlockedText } from "./shipmentLink";

describe("shipmentFromQuoteBlockedText", () => {
  it("says nothing about an open, expired or Won quote: a shipment may be created from it", () => {
    for (const status of ["draft", "ready_to_send", "quoted", "feedback", "revised", "expired", "won"]) {
      expect(shipmentFromQuoteBlockedText(status)).toBeNull();
    }
  });

  it("names a Lost or Replaced quote as the screens show it", () => {
    expect(shipmentFromQuoteBlockedText("lost")).toBe("This quote is Lost - no shipment can be created from it");
    expect(shipmentFromQuoteBlockedText("replaced")).toBe("This quote is Replaced - no shipment can be created from it");
  });

  it("shows a status it does not know as it is", () => {
    expect(shipmentFromQuoteBlockedText("on_hold")).toBe("This quote is on_hold - no shipment can be created from it");
  });
});

describe("createShipmentHint", () => {
  it("says a quote not yet Won becomes Won", () => {
    expect(createShipmentHint("draft")).toBe("Create a shipment from this quote - the quote becomes Won");
    expect(createShipmentHint("won")).toBe("Create a shipment from this quote");
    expect(createShipmentHint("lost")).toBe("This quote is Lost - no shipment can be created from it");
  });
});
