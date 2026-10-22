import { describe, expect, it } from "vitest";
import { notWonQuoteText } from "./shipmentLink";

describe("notWonQuoteText", () => {
  it("says nothing about a Won quote: a shipment may be made from it", () => {
    expect(notWonQuoteText("won")).toBeNull();
  });

  it("names any other status as the screens show it - the derived Expired included", () => {
    expect(notWonQuoteText("quoted")).toBe("This quote is Quoted - mark it Won before a shipment is made from it");
    expect(notWonQuoteText("ready_to_send")).toBe("This quote is Ready to Send - mark it Won before a shipment is made from it");
    expect(notWonQuoteText("expired")).toBe("This quote is Expired - mark it Won before a shipment is made from it");
  });

  it("shows a status it does not know as it is", () => {
    expect(notWonQuoteText("on_hold")).toBe("This quote is on_hold - mark it Won before a shipment is made from it");
  });
});
