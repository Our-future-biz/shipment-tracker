import { describe, expect, it } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingMilestone, TrackingTaxDate } from "@/hooks/useShipmentTracking";
import { clockStatus, freeTimeWords, movedDaysLabel, readFactWords, taxDateParts, trackingStatusLine } from "./trackingText";

const shipment = (over: Partial<ShipmentItem> = {}) =>
  ({
    jobNumber: "CZ42",
    customerReference: "4711",
    freightMode: "Sea Freight",
    tradeDirection: "Import",
    pol: "Bremerhaven",
    pod: "Charleston",
    containers: [{ containerNumber: "MSDU2778315" }],
    ...over,
  }) as ShipmentItem;

const row = (over: Partial<TrackingMilestone>) => ({ key: "x", label: "X", planned: null, wasPlanned: null, actual: null, ...over }) as TrackingMilestone;

describe("the status line", () => {
  it("reads job, mode, containers, route and the planned dates", () => {
    const milestones = [
      row({ key: "departed", label: "Departed", planned: "2026-09-19" }),
      row({ key: "arrived", label: "Arrived", planned: "2026-10-09" }),
    ];
    expect(trackingStatusLine(shipment(), milestones)).toBe(
      "CZ42 // 4711 · Sea Freight Import · MSDU2778315 · Bremerhaven → Charleston · ETD 19.09.2026 · ETA 09.10.2026",
    );
  });

  it("prefers the actual date, says what a moved date was and names the last step", () => {
    const milestones = [
      row({ key: "departed", label: "Departed", planned: "2026-09-19", actual: "2026-09-20" }),
      row({ key: "arrived", label: "Arrived", planned: "2026-10-16", wasPlanned: "2026-10-09" }),
    ];
    expect(trackingStatusLine(shipment(), milestones)).toContain("ATD 20.09.2026 · ETA 16.10.2026 (was 09.10.2026) · last: Departed 20.09.2026");
  });

  it("names three containers and counts the rest", () => {
    const containers = ["A", "B", "C", "D", "E"].map((containerNumber) => ({ containerNumber }));
    expect(trackingStatusLine(shipment({ containers } as Partial<ShipmentItem>), [])).toContain("A, B, C +2");
  });

  it("leaves out what the job doesn't have", () => {
    expect(trackingStatusLine(shipment({ customerReference: "", pol: "", pod: "", freightMode: "", tradeDirection: "", containers: null }), [])).toBe("CZ42");
  });
});

describe("a moved date's mark", () => {
  it("is signed", () => {
    expect(movedDaysLabel(7)).toBe("+7 d");
    expect(movedDaysLabel(-2)).toBe("−2 d");
  });
});

describe("the tax-date line", () => {
  const tax = (over: Partial<TrackingTaxDate>) => ({ basis: "ata", date: "2026-10-09", actual: true, recorded: null, invoiced: false, ...over }) as TrackingTaxDate;
  const rates = { status: "locked" as const, ratesMissing: false, rateDate: "2026-10-09", previousRateDate: null };

  it("states a firm date and its lock", () => {
    expect(taxDateParts(tax({}), rates)).toEqual(["Tax date (DUZP) = ATA 09.10.2026", "ČNB rates locked for 09.10.2026"]);
  });

  it("says when the lock moved", () => {
    expect(taxDateParts(tax({}), { ...rates, previousRateDate: "2026-10-05" })[1]).toBe("ČNB rates locked for 09.10.2026 (re-locked from 05.10.2026)");
  });

  it("calls an estimated date provisional and says what fixes it", () => {
    expect(taxDateParts(tax({ basis: "eta", actual: false }), { ...rates, status: "provisional" })).toEqual([
      "Tax date (DUZP): provisional by ETA 09.10.2026, the ATA fixes it",
      "ČNB rates provisional, 09.10.2026",
    ]);
  });

  it("says an invoiced date is final", () => {
    expect(taxDateParts(tax({ invoiced: true }), undefined)).toEqual(["Tax date (DUZP) = ATA 09.10.2026", "Invoiced: final, credit the invoice first to change it"]);
  });

  it("doesn't call an estimate fixable or final once invoiced: the invoice holds its own date", () => {
    expect(taxDateParts(tax({ basis: "eta", actual: false, invoiced: true }), undefined)).toEqual([
      "Invoiced with no ATA recorded: the invoice holds its own tax date (DUZP)",
      "Credit the invoice first to set it",
    ]);
  });

  it("calls a job's delivery date final once invoiced, like an ATA", () => {
    expect(taxDateParts(tax({ basis: "delivery", invoiced: true }), undefined)).toEqual(["Tax date (DUZP) = delivery 09.10.2026", "Invoiced: final, credit the invoice first to change it"]);
  });

  it("says nothing about an invoice when Invoicing couldn't be asked", () => {
    expect(taxDateParts(tax({ invoiced: null }), undefined)).toEqual(["Tax date (DUZP) = ATA 09.10.2026"]);
  });

  it("says when no date gives one, and a missing rate", () => {
    expect(taxDateParts(tax({ basis: "none", date: null, actual: false }), { ...rates, ratesMissing: true })).toEqual([
      "No tax date (DUZP) yet: no date on this job says it",
      "ČNB rate missing for this date",
    ]);
  });
});

describe("readFactWords", () => {
  const fact = { effect: "none", sets: "", alreadyKept: false, refusal: "" };
  it("says what keeping a fact does", () => {
    expect(readFactWords({ ...fact, effect: "apply", sets: "ETA" })).toBe("Sets the ETA");
    expect(readFactWords({ ...fact, effect: "propose", sets: "ATA" })).toBe("Proposes the ATA: someone confirms it under Events");
    expect(readFactWords(fact)).toBe("Recorded, no date changes");
  });
  it("puts a refusal first, then what is on record", () => {
    expect(readFactWords({ ...fact, alreadyKept: true })).toBe("Already on record");
    expect(readFactWords({ ...fact, alreadyKept: true, refusal: "Can't be in the future" })).toBe("Can't be in the future");
  });
});

describe("free time in words", () => {
  const clock = { state: "running", freeTimeDays: 14, freeTimeFrom: "discharge", lastFreeDayStated: null, daysLeft: 5, chargeableDays: 0, stopDay: null };
  it("says what the box was given", () => {
    expect(freeTimeWords(clock)).toBe("14 d from discharge");
    expect(freeTimeWords({ ...clock, freeTimeFrom: "gate_out", lastFreeDayStated: "2026-11-12" })).toBe("14 d from leaving the terminal · carrier's date");
    expect(freeTimeWords({ ...clock, freeTimeDays: null })).toBe("");
  });
  it("says where the clock stands", () => {
    expect(clockStatus(clock)).toEqual({ text: "5 days left", tone: "green" });
    expect(clockStatus({ ...clock, state: "ending", daysLeft: 1 })).toEqual({ text: "Ends in 1 day", tone: "amber" });
    expect(clockStatus({ ...clock, state: "ending", daysLeft: 0 }).text).toBe("Ends today");
    expect(clockStatus({ ...clock, state: "chargeable", chargeableDays: 3 })).toEqual({ text: "3 days over", tone: "red" });
    expect(clockStatus({ ...clock, state: "returned", chargeableDays: 0 })).toEqual({ text: "Returned in time", tone: "slate" });
    expect(clockStatus({ ...clock, state: "returned", chargeableDays: 2 })).toEqual({ text: "Returned 2 days over", tone: "red" });
    expect(clockStatus({ ...clock, state: "unknown" })).toEqual({ text: "Not set", tone: null });
  });
});
