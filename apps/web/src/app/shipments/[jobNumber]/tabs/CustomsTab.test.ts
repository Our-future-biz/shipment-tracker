import { describe, expect, it } from "vitest";
import { customsRightColumn } from "./CustomsTab";
import { fieldsForMode } from "../freightModeFields";

// Step 3 review, minor 1: the Customs section draws the container number in a row of its own, so an
// air job's filter looks at the value that row shows.
describe("the Customs card's right column", () => {
  const keysOn = (canReview: boolean, freightMode: string, values: Record<string, string>) =>
    fieldsForMode(customsRightColumn(canReview, false), freightMode, (k) => values[k] ?? "").map((f) => f.key);

  it("keeps the container number on an air job in the Customs section while it has one, though the container type is empty", () => {
    const keys = keysOn(true, "Air Freight", { containerNumber: "MSKU1234565" });
    expect(keys).toContain("containerNumber");
    expect(keys).not.toContain("containerTypeSummary");
  });

  it("leaves both out on an air job with neither, and shows both on a sea job", () => {
    expect(keysOn(true, "Air Freight", {})).not.toContain("containerNumber");
    expect(keysOn(true, "Sea Freight", {})).toEqual(expect.arrayContaining(["containerNumber", "containerTypeSummary"]));
  });

  it("leaves the seal out in the Customs section only, and the status always", () => {
    expect(customsRightColumn(true, false).map((f) => f.key)).not.toContain("sealNumber");
    expect(customsRightColumn(false, false).map((f) => f.key)).toContain("sealNumber");
    expect(customsRightColumn(false, true).map((f) => f.key)).not.toContain("commercialInvoiceValue");
    expect(customsRightColumn(true, false).map((f) => f.key)).not.toContain("customsStatus");
  });
});
