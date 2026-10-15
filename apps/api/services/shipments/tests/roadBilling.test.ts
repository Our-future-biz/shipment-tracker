import { describe, expect, it } from "vitest";
import { billingStatusFor } from "../lib/roadBilling";

describe("the Billing step of a road job", () => {
  it("keeps the status's own direction, else the trade direction, else EXP (domestic)", () => {
    expect(billingStatusFor("All Done - Waiting To Be Shipped [IMP]", "")).toBe("Billing [IMP]");
    expect(billingStatusFor("active", "Import")).toBe("Billing [IMP]");
    expect(billingStatusFor("active", "export")).toBe("Billing [EXP]");
    expect(billingStatusFor("active", "")).toBe("Billing [EXP]");
  });

  it("leaves a job already Billing or Billed, and a cancelled one", () => {
    expect(billingStatusFor("Billing [EXP]", "Export")).toBeNull();
    expect(billingStatusFor("Billed [IMP]", "Import")).toBeNull();
    expect(billingStatusFor("Cancelled Shipment", "Import")).toBeNull();
  });
});
