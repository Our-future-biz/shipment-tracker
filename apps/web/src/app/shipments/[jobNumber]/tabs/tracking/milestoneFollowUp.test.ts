import { describe, expect, it } from "vitest";
import { CANCELLED_STATUS } from "@/lib/enums";
import { ATD_DAYS_BEFORE_ETD, atdEditWarning, atdWarning, billingHintAfter, offerableStatuses, sentOnlyHint, statusOfferAfter } from "./milestoneFollowUp";

const exportJob = (status: string) => ({ tradeDirection: "Export", status });
const importJob = (status: string) => ({ tradeDirection: "Import", status });

describe("the status offered after a milestone (O3, Q4 (a))", () => {
  it("suggests the status that usually follows an export's pick-up and departure", () => {
    // Loaded at the shipper, then in clearance: after the pick-up, not after loading on board (mock council R14).
    expect(statusOfferAfter("picked_up", exportJob("All Done - Waiting To Be Shipped [EXP]"))?.suggested).toBe("Loaded - Customs Clearance In Progress [EXP]");
    expect(statusOfferAfter("loaded", exportJob("All Done - Waiting To Be Shipped [EXP]"))).toBeNull();
    expect(statusOfferAfter("departed", exportJob("Booking Confirmation Pending [EXP]"))?.suggested).toBe("Pre-Alert Sent [EXP]");
  });

  it("suggests an import's status after departure and arrival, by how far a job goes - not the dropdown's order", () => {
    expect(statusOfferAfter("departed", importJob("All Done - Waiting To Be Shipped [IMP]"))?.suggested).toBe("Pre-Alert Received - Further Transport To Be Booked [IMP]");
    // Arrival Notice Sent is listed before Pre-Alert Received, yet comes after it.
    expect(statusOfferAfter("arrived", importJob("Pre-Alert Received - Further Transport To Be Booked [IMP]"))?.suggested).toBe("Arrival Notice Sent - Waiting For Instructions [IMP]");
  });

  it("never suggests a step back, but still lets a status be picked", () => {
    const offer = statusOfferAfter("arrived", importJob("Customs Clearance Pending [IMP]"));
    expect(offer?.suggested).toBe("");
    expect(offer?.options).toContain("Booked For Further Transport [IMP]");
    expect(statusOfferAfter("departed", exportJob("Pre-Alert Sent [EXP]"))?.suggested).toBe("");
  });

  it("offers the direction's statuses but the one the job reads, never Billing, Billed or Cancelled", () => {
    const options = offerableStatuses("Export", "All Done - Waiting To Be Shipped [EXP]");
    expect(options).not.toContain("All Done - Waiting To Be Shipped [EXP]");
    expect(options).toContain("Pre-Alert Sent [EXP]");
    for (const s of ["Billing [EXP]", "Billed [EXP]", CANCELLED_STATUS, "---"]) expect(options).not.toContain(s);
    expect(options.every((s) => s.endsWith("[EXP]"))).toBe(true);
  });

  it("offers nothing for a kind with no usual next status, nor on a job in billing or cancelled", () => {
    expect(statusOfferAfter("cargo_ready", exportJob("Booking Confirmation Pending [EXP]"))).toBeNull();
    expect(statusOfferAfter("arrived", exportJob("Booking Confirmation Pending [EXP]"))).toBeNull();
    expect(statusOfferAfter("departed", exportJob("Billing [EXP]"))).toBeNull();
    expect(statusOfferAfter("departed", importJob("Billed [IMP]"))).toBeNull();
    expect(statusOfferAfter("departed", importJob(CANCELLED_STATUS))).toBeNull();
  });

  it("points to billing after a delivery, unless the job is in billing already", () => {
    expect(billingHintAfter("delivered", "Customs Clearance Pending [IMP]")).toMatch(/Shipment Status → Billing/);
    expect(billingHintAfter("delivered", "Billing [IMP]")).toBe("");
    expect(billingHintAfter("delivered", "Billed [EXP]")).toBe("");
    expect(billingHintAfter("arrived", "Customs Clearance Pending [IMP]")).toBe("");
  });
});

describe("the ATD warning (O3)", () => {
  const job = { closingDate: "2026-11-20", estimatedDeparture: "2026-11-24" };

  it("warns of an ATD before the cargo's Closing", () => {
    expect(atdWarning("2026-11-19", job)).toMatch(/before the cargo's Closing \(20\.11\.2026\)/);
  });

  it(`warns of an ATD more than ${ATD_DAYS_BEFORE_ETD} days before the ETD`, () => {
    expect(atdWarning("2026-11-20", { estimatedDeparture: "2026-11-24" })).toMatch(/more than 3 days before the ETD \(24\.11\.2026\)/);
    expect(atdWarning("2026-11-21", { estimatedDeparture: "2026-11-24" })).toBe("");
  });

  it("says nothing of an ATD on or after the Closing and near the ETD, or with no dates to compare", () => {
    expect(atdWarning("2026-11-21", job)).toBe("");
    expect(atdWarning("2026-11-28", job)).toBe("");
    expect(atdWarning("2026-11-01", {})).toBe("");
    expect(atdWarning("2026-11-01", { closingDate: null, estimatedDeparture: null })).toBe("");
  });
});

// Mock council R15 (S7-Q3): recording the event sends no notice, so the offer says so.
describe("sentOnlyHint", () => {
  it("says a pre-alert or arrival notice status is set only if it was sent", () => {
    expect(sentOnlyHint("Pre-Alert Sent [EXP]")).toBe("Only if the pre-alert was sent: recording the event sends none.");
    expect(sentOnlyHint("Arrival Notice Sent - Waiting For Instructions [IMP]")).toBe("Only if the arrival notice was sent: recording the event sends none.");
  });

  it("says nothing for any other status", () => {
    expect(sentOnlyHint("Pre-Alert Received - Further Transport To Be Booked [IMP]")).toBe("");
    expect(sentOnlyHint("")).toBe("");
    expect(sentOnlyHint(undefined)).toBe("");
  });
});

// Mock council S7-4: an ATD typed in its column is checked too.
describe("atdEditWarning", () => {
  const job = { closingDate: "2026-11-18", estimatedDeparture: "2026-11-26" };
  it("warns of an ATD typed in the column as Record an event does", () => {
    expect(atdEditWarning("actualDeparture", "2026-11-20", job)).toBe(atdWarning("2026-11-20", job));
    expect(atdEditWarning("actualDeparture", "2026-11-20", job)).not.toBe("");
    expect(atdEditWarning("actualDeparture", "2026-11-17 10:00", job)).toMatch(/before the cargo's Closing/);
  });

  it("says nothing for a day that looks right, a cleared ATD, another field or no shipment", () => {
    expect(atdEditWarning("actualDeparture", "2026-11-25", job)).toBe("");
    expect(atdEditWarning("actualDeparture", "", job)).toBe("");
    expect(atdEditWarning("actualArrival", "2026-11-17", job)).toBe("");
    expect(atdEditWarning("actualDeparture", "2026-11-17", undefined)).toBe("");
  });
});
