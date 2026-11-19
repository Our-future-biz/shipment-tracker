import { describe, expect, it } from "vitest";
import { customerContactHref, dayBlocked } from "./EditableCell";

describe("customerContactHref", () => {
  it("picks the contact out by its id when the shipment keeps one", () => {
    expect(customerContactHref("k1", "Petr", "c1")).toBe("/customers/k1?tab=contacts&contactId=c1");
  });

  it("picks it out by name for a value stored without an id", () => {
    expect(customerContactHref("k1", " Petr Masák ", null)).toBe("/customers/k1?tab=contacts&contact=Petr%20Mas%C3%A1k");
    expect(customerContactHref("k1", "Petr")).toBe("/customers/k1?tab=contacts&contact=Petr");
  });
});

// Mock test council n34: the screens offer no day the server refuses.
describe("dayBlocked", () => {
  it("blocks a day after today in the B/L dates that say when something happened, and nothing elsewhere", () => {
    for (const field of ["originalsReceivedDate", "telexReleaseReceivedDate", "deliveryOrderDate"]) {
      expect(dayBlocked(field, "2026-11-20", "2026-11-19")).toBe(true);
      expect(dayBlocked(field, "2026-11-19", "2026-11-19")).toBe(false);
      expect(dayBlocked(field, "2026-11-01", "2026-11-19")).toBe(false);
    }
    expect(dayBlocked("estimatedArrival", "2026-12-24", "2026-11-19")).toBe(false);
  });
});
