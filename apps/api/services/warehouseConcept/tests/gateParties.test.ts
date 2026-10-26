import { describe, expect, it } from "vitest";
import { partiesChange } from "../services/gateParties";

describe("a gate record follows its shipment's Customer and Customer's PIC", () => {
  it("changes only what differs, with an old → new line for the gate log", () => {
    expect(partiesChange({ customer: "RAVAK a.s.", customerContact: "Petr" }, { customer: "RAVAK a.s.", customerContact: "Petr Masák" })).toEqual({
      changes: { customerContact: "Petr Masák" },
      detail: 'Customer contact: "Petr" → "Petr Masák"',
    });
    expect(partiesChange({ customer: "Ravak", customerContact: "" }, { customer: "RAVAK a.s.", customerContact: "Jana" })).toEqual({
      changes: { customer: "RAVAK a.s.", customerContact: "Jana" },
      detail: 'Customer: "Ravak" → "RAVAK a.s."; Customer contact: — → "Jana"',
    });
  });

  it("does nothing when the record already shows them (a repeated event)", () => {
    expect(partiesChange({ customer: "RAVAK a.s.", customerContact: "Petr Masák" }, { customer: "RAVAK a.s.", customerContact: "Petr Masák" })).toBeNull();
  });

  it("clears a contact the shipment no longer has", () => {
    expect(partiesChange({ customer: "A", customerContact: "Petr" }, { customer: "A", customerContact: "" })?.changes).toEqual({ customerContact: "" });
  });
});
