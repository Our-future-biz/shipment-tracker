import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { historyEntries, receivableBarTools, showsPromise, writeOffStart } from "./receivables";

// The user council's Minors on Accounts Receivable (20 Nov 2026): the drawer's history in one time order and no
// promise on a paid invoice (A13), a bank charge that starts empty (A14), Month-end and Bank statements on the bar (A16).

const note = (id: string, issueDate: string) => ({ id, number: id, issueDate, gross: -10, reason: "", full: false, issuedBy: "", issuedByName: "" }) as interfaces.ReceivableCreditNoteItem;
const event = (id: string, at: string) => ({ id, action: "payment_noted", fromStatus: "", toStatus: "", by: "", at, reason: "", payload: {} }) as interfaces.ReceivableEventItem;

describe("historyEntries (A13)", () => {
  it("reads in one time order, the oldest first, whatever order the server lists the events in", () => {
    const events = [event("e3", "2026-11-19T10:00:00.000Z"), event("e2", "2026-11-14T09:00:00.000Z"), event("e1", "2026-11-12T08:00:00.000Z")];
    const order = historyEntries("2026-11-12", [note("cn1", "2026-11-14")], events).map((h) => (h.kind === "issued" ? "issued" : h.kind === "credit_note" ? h.note.id : h.event.id));
    // the issue and the credit note carry only a day: first on that day
    expect(order).toEqual(["issued", "e1", "cn1", "e2", "e3"]);
  });

  // Mock council S8-5: 00:30 Prague on the issue day is 23:30 UTC the day before; it still comes after "Issued".
  it("places an event by its Prague day, after that day's issue and credit note", () => {
    const events = [event("night", "2026-11-11T23:30:00.000Z"), event("before", "2026-11-11T21:00:00.000Z")];
    const order = historyEntries("2026-11-12", [note("cn1", "2026-11-12")], events).map((h) => (h.kind === "issued" ? "issued" : h.kind === "credit_note" ? h.note.id : h.event.id));
    expect(order).toEqual(["before", "issued", "cn1", "night"]);
  });

  it("keeps the given order for the same moment", () => {
    const order = historyEntries("2026-11-12", [], [event("a", "2026-11-13T08:00:00.000Z"), event("b", "2026-11-13T08:00:00.000Z")]).map((h) => (h.kind === "event" ? h.event.id : h.kind));
    expect(order).toEqual(["issued", "a", "b"]);
  });
});

describe("showsPromise (A13)", () => {
  it("shows the promise only while something is left to pay", () => {
    expect(showsPromise({ promisedOn: "2026-11-27", leftToPay: 100 })).toBe(true);
    expect(showsPromise({ promisedOn: "2026-11-27", leftToPay: 0 })).toBe(false);
    expect(showsPromise({ promisedOn: "2026-11-27", leftToPay: -5 })).toBe(false);
    expect(showsPromise({ promisedOn: null, leftToPay: 100 })).toBe(false);
  });
});

describe("writeOffStart (A14)", () => {
  it("starts a bank charge empty and a write-off at what may still be closed", () => {
    expect(writeOffStart("bank_charge", 500, 0)).toBe("");
    expect(writeOffStart("write_off", 500, 0)).toBe("500.00");
    expect(writeOffStart("write_off", 40, 15.5)).toBe("24.50");
  });
});

describe("receivableBarTools (A16)", () => {
  it("puts Bank statements (managers) and Month-end on the bar, the rest under Tools", () => {
    const manager = receivableBarTools(true);
    expect(manager.buttons.map((t) => t.label)).toEqual(["Bank statements", "Month-end"]);
    expect(manager.menu.map((t) => t.label)).toEqual(["Export to Pohoda", "Reminder settings"]);
    const user = receivableBarTools(false);
    expect(user.buttons.map((t) => t.label)).toEqual(["Month-end"]);
    expect(user.menu.map((t) => t.label)).toEqual(["Reminder settings"]);
  });
});
