import { describe, expect, it } from "vitest";
import { customerContactHref } from "./EditableCell";

describe("customerContactHref", () => {
  it("picks the contact out by its id when the shipment keeps one", () => {
    expect(customerContactHref("k1", "Petr", "c1")).toBe("/customers/k1?tab=contacts&contactId=c1");
  });

  it("picks it out by name for a value stored without an id", () => {
    expect(customerContactHref("k1", " Petr Masák ", null)).toBe("/customers/k1?tab=contacts&contact=Petr%20Mas%C3%A1k");
    expect(customerContactHref("k1", "Petr")).toBe("/customers/k1?tab=contacts&contact=Petr");
  });
});
