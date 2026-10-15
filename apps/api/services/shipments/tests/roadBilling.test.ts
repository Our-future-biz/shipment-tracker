import { describe, expect, it } from "vitest";
import { billingStatusFor } from "../lib/roadBilling";
import { statusForDirection } from "../lib/fieldDefaults";

describe("the Billing step of a road job", () => {
  it("keeps the status's own direction, else the trade direction, else DOM (domestic)", () => {
    expect(billingStatusFor("All Done - Waiting To Be Shipped [IMP]", "")).toBe("Billing [IMP]");
    expect(billingStatusFor("Booking Confirmation Pending [DOM]", "Domestic")).toBe("Billing [DOM]");
    expect(billingStatusFor("active", "Import")).toBe("Billing [IMP]");
    expect(billingStatusFor("active", "export")).toBe("Billing [EXP]");
    expect(billingStatusFor("active", "Domestic")).toBe("Billing [DOM]");
    expect(billingStatusFor("active", "")).toBe("Billing [DOM]");
  });

  it("leaves a job already Billing or Billed, and a cancelled one", () => {
    expect(billingStatusFor("Billing [EXP]", "Export")).toBeNull();
    expect(billingStatusFor("Billed [IMP]", "Import")).toBeNull();
    expect(billingStatusFor("Billing [DOM]", "Domestic")).toBeNull();
    expect(billingStatusFor("Billed [DOM]", "Domestic")).toBeNull();
    expect(billingStatusFor("Cancelled Shipment", "Import")).toBeNull();
  });
});

describe("a domestic job's status when the Trade Direction changes", () => {
  it("moves a shared step to the new direction and anything else back to the start", () => {
    expect(statusForDirection("Billing [EXP]", "Domestic")).toBe("Billing [DOM]");
    expect(statusForDirection("Billed [DOM]", "Import")).toBe("Billed [IMP]");
    expect(statusForDirection("Pre-Alert Sent [EXP]", "Domestic")).toBe("Booking Confirmation Pending [DOM]");
    expect(statusForDirection("Billing [DOM]", "Domestic")).toBeUndefined();
  });
});
