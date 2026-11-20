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
    expect(creditNoteEffect({ invoiceGross: 1000, creditNoteGross: [-800], thisGross: -800, lines, at })).toEqual({ reducedTo: 200, refund: 120 });
  });
});
