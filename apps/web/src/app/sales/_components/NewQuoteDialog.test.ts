import { describe, expect, it } from "vitest";
import { newQuoteData } from "./NewQuoteDialog";

// The Freight Mode is asked in "Create new quote" (User Council S17, owner's answer Q33): the server
// gives the reference its letters from the start (QCZFCL…), so it doesn't change while the quote is filled.
describe("newQuoteData", () => {
  it("creates the quote with the Freight Mode picked, over what it starts with", () => {
    expect(newQuoteData({}, "Sea FCL")).toEqual({ serviceType: "Sea FCL" });
    expect(newQuoteData({ customerName: "Alfa s.r.o.", customerId: "c1" }, "Air")).toEqual({ customerName: "Alfa s.r.o.", customerId: "c1", serviceType: "Air" });
  });

  it("takes the mode picked in the dialog, not one the start brings", () => {
    expect(newQuoteData({ serviceType: "Road" }, "Rail")).toEqual({ serviceType: "Rail" });
  });
});
