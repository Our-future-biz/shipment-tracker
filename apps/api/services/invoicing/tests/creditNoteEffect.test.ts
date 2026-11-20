import { describe, expect, it } from "vitest";
import { creditNoteEffect } from "../lib/receivables";

// What a credit note did to the invoice it corrects, for its PDF (user council B15): "To be refunded" only for what was
// paid beyond the invoice's new total; of an invoice not paid that far it lowers what is due.

const at = new Date("2026-11-20T10:00:00Z");
const before = new Date("2026-11-18T10:00:00Z");
const after = new Date("2026-11-21T10:00:00Z");
const pay = (amount: number, over: Record<string, unknown> = {}) => ({ kind: "payment", amount: amount.toFixed(2), createdAt: before, takenBackAt: null, confirmedAt: before, ...over });

describe("creditNoteEffect", () => {
  it("lowers what is due on an unpaid invoice: nothing to refund", () => {
    expect(creditNoteEffect({ invoiceGross: "3589.66", creditNoteGross: ["-100.00"], thisGross: "-100.00", lines: [], at })).toEqual({ reducedTo: 3489.66, refund: 0 });
  });

  it("refunds the credit of an invoice paid in full", () => {
    expect(creditNoteEffect({ invoiceGross: "3589.66", creditNoteGross: ["-100.00"], thisGross: "-100.00", lines: [pay(3589.66)], at })).toEqual({ reducedTo: 3489.66, refund: 100 });
  });

  it("refunds only what was paid beyond the new total of a part-paid invoice", () => {
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-300], thisGross: -300, lines: [pay(800)], at })).toEqual({ reducedTo: 700, refund: 100 });
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-300], thisGross: -300, lines: [pay(500)], at })).toEqual({ reducedTo: 700, refund: 0 });
  });

  it("counts the earlier credit notes, and never refunds more than this one", () => {
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-200, -100], thisGross: -100, lines: [pay(1000)], at })).toEqual({ reducedTo: 700, refund: 100 });
  });

  it("reads the payments as they stood when the credit note was issued", () => {
    const lines = [
      pay(1000, { createdAt: after }), // noted later: not counted
      pay(400, { takenBackAt: new Date("2026-11-19T10:00:00Z") }), // taken back before: not counted
      pay(300, { takenBackAt: after }), // taken back later: counted then
      { kind: "bank_charge", amount: "50.00", createdAt: before, takenBackAt: null, confirmedAt: after }, // confirmed later: not counted
      { kind: "write_off", amount: "20.00", createdAt: before, takenBackAt: null, confirmedAt: before },
    ];
    // Paid 300 as it stood, new total 200: 100 back. The write-off of 20 is not money paid (mock council M3).
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-800], thisGross: -800, lines, at })).toEqual({ reducedTo: 200, refund: 100 });
  });

  // Mock test council M3: a confirmed write-off is not money the customer paid, so it never becomes a refund.
  // refund = min(credit, max(0, paid + bank charges − new total)).
  const writeOff = (amount: number) => ({ kind: "write_off", amount: amount.toFixed(2), createdAt: before, takenBackAt: null, confirmedAt: before });
  const bankCharge = (amount: number) => ({ kind: "bank_charge", amount: amount.toFixed(2), createdAt: before, takenBackAt: null, confirmedAt: before });

  it("does not refund a write-off: 100 paid 80, 20 written off, credited in full gives back 80", () => {
    expect(creditNoteEffect({ invoiceGross: 100, creditNoteGross: [-100], thisGross: -100, lines: [pay(80), writeOff(20)], at })).toEqual({ reducedTo: 0, refund: 80 });
  });

  it("promises nothing back on an invoice written off in full and then credited in full", () => {
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-1000], thisGross: -1000, lines: [writeOff(1000)], at })).toEqual({ reducedTo: 0, refund: 0 });
  });

  it("only lowers what is due when a partial credit comes after a write-off", () => {
    expect(creditNoteEffect({ invoiceGross: 100, creditNoteGross: [-10], thisGross: -10, lines: [pay(80), writeOff(20)], at })).toEqual({ reducedTo: 90, refund: 0 });
  });

  it("counts a bank charge as paid: the customer did send that money", () => {
    expect(creditNoteEffect({ invoiceGross: 100, creditNoteGross: [-100], thisGross: -100, lines: [pay(90), bankCharge(10)], at })).toEqual({ reducedTo: 0, refund: 100 });
  });
});
