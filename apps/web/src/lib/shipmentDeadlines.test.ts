import { describe, expect, it } from "vitest";
import { deadlineColor, deadlineDayLabel, deadlineLabel, deadlineText, type Deadline } from "./shipmentDeadlines";

const deadline = (over: Partial<Deadline>): Deadline => ({ field: "estimatedDeparture", date: "2026-11-19", daysLeft: 1, missed: false, time: "", ...over });

describe("how a Needs Attention deadline is worded", () => {
  it("names the date by its grid column - the pick-up date too - and an unknown field by itself", () => {
    expect(deadlineLabel("closingDate")).toBe("Closing Date");
    expect(deadlineLabel("pickupDate")).toBe("Pick-Up Date");
    expect(deadlineLabel("somethingNew")).toBe("somethingNew");
  });

  it("says how far a date is in calendar days", () => {
    expect(deadlineDayLabel(0)).toBe("today");
    expect(deadlineDayLabel(1)).toBe("tomorrow");
    // The next working day after a Friday.
    expect(deadlineDayLabel(3)).toBe("in 3 days");
    expect(deadlineDayLabel(-1)).toBe("overdue 1 day");
    expect(deadlineDayLabel(-4)).toBe("overdue 4 days");
  });

  it("words a date ahead with its day and date, and a Closing with its time", () => {
    expect(deadlineText(deadline({}))).toBe("ETD Estimated: tomorrow (19.11.2026)");
    expect(deadlineText(deadline({ field: "pickupDate", date: "2026-11-23", daysLeft: 3 }))).toBe("Pick-Up Date: in 3 days (23.11.2026)");
    expect(deadlineText(deadline({ field: "closingDate", date: "2026-11-18", daysLeft: 0, time: "14:00" }))).toBe("Closing Date: today 14:00 (18.11.2026)");
  });

  it("words a missed Closing as Shipments → Managers does, with its day and time", () => {
    expect(deadlineText(deadline({ field: "closingDate", date: "2026-11-17", daysLeft: -1, missed: true, time: "14:00" }))).toBe("Closing missed · 17.11. 14:00");
    expect(deadlineText(deadline({ field: "closingDate", date: "2026-11-18", daysLeft: 0, missed: true, time: "09:30" }))).toBe("Closing missed · today 09:30");
    expect(deadlineText(deadline({ field: "closingDate", date: "2026-11-02", daysLeft: -16, missed: true }))).toBe("Closing missed · 02.11.");
  });

  it("words an overdue filing by how long it is overdue", () => {
    expect(deadlineText(deadline({ field: "vgmClosing", date: "2026-11-16", daysLeft: -2, missed: true }))).toBe("VGM Closing: overdue 2 days (16.11.2026)");
    expect(deadlineText(deadline({ field: "siClosing", date: "2026-11-17", daysLeft: -1, missed: true, time: "16:00" }))).toBe("SI Closing: overdue 1 day (17.11.2026 16:00)");
  });

  it("shows a filing's time as it shows the Closing's, and says overdue once that time has passed today", () => {
    expect(deadlineText(deadline({ field: "vgmClosing", date: "2026-11-18", daysLeft: 0, time: "10:00" }))).toBe("VGM Closing: today 10:00 (18.11.2026)");
    expect(deadlineText(deadline({ field: "vgmClosing", date: "2026-11-18", daysLeft: 0, missed: true, time: "10:00" }))).toBe("VGM Closing: overdue · today 10:00 (18.11.2026)");
  });

  it("colours a date by the list it is on: URGENT red, the two working days after orange", () => {
    expect(deadlineColor("within24h")).toBe("red");
    expect(deadlineColor("within48h")).toBe("orange");
  });
});
