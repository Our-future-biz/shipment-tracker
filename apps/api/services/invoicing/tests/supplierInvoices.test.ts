import { describe, expect, it } from "vitest";
import {
  approvalProblem,
  claimsOf,
  daysOverdue,
  dueDayOf,
  hasNoAmount,
  holdsPayment,
  invoiceKeyOf,
  invoiceNumberKey,
  isCzechVatPayer,
  lineAmount,
  linkedMasterSiblings,
  masterSiblingKey,
  marksOf,
  paymentProblem,
  sumByCurrency,
  supplierKeyOf,
  type SupplierFactsLike,
} from "../lib/supplierInvoices";

// Accounts Payable's pure rules (Council Outlay 9, D1–D20): how lines are matched to an invoice, its due day,
// its marks, who may approve it and when it may be marked paid.

const SUPPLIER = "3F2B8C1A-0D4E-4C55-9A7B-1E2D3C4B5A69";
const HAULIER = "9B1C2D3E-4F50-4A61-8B72-C3D4E5F60718";

const facts = (over: Partial<SupplierFactsLike> = {}): SupplierFactsLike => ({
  dic: "CZ12345678",
  country: "CZ",
  paymentDays: 14,
  vatUnreliable: false,
  bankAccountPublished: true,
  vatCheckedAt: "2026-11-10T08:00:00Z",
  bankAccountsChangedAt: null,
  approvalStatus: "approved",
  rating: null,
  ...over,
});

describe("supplierKeyOf / invoiceKeyOf", () => {
  it("keys by the Customer Database supplier first, in lower case", () => {
    expect(supplierKeyOf({ supplierCustomerId: SUPPLIER, haulierId: HAULIER, vendor: "MSC" })).toBe(`c:${SUPPLIER.toLowerCase()}`);
  });

  it("falls back to the haulier, then to the typed name as companies are matched", () => {
    expect(supplierKeyOf({ supplierCustomerId: null, haulierId: HAULIER, vendor: "MSC" })).toBe(`h:${HAULIER.toLowerCase()}`);
    // No case, accents, punctuation or legal form: the same supplier typed twice is one key.
    expect(supplierKeyOf({ supplierCustomerId: null, haulierId: null, vendor: "Celní služby Praha s.r.o." })).toBe(
      supplierKeyOf({ supplierCustomerId: null, haulierId: null, vendor: "CELNI SLUZBY PRAHA" }),
    );
    expect(supplierKeyOf({ supplierCustomerId: null, haulierId: null, vendor: "" })).toBe("n:");
  });

  it("joins the supplier and the number without spaces, upper case; no number is no invoice", () => {
    expect(invoiceKeyOf({ invoiceNumber: " fv 2026-0417 ", supplierCustomerId: SUPPLIER, haulierId: null, vendor: "" })).toBe(`c:${SUPPLIER.toLowerCase()}|FV2026-0417`);
    expect(invoiceKeyOf({ invoiceNumber: "   ", supplierCustomerId: SUPPLIER, haulierId: null, vendor: "" })).toBeNull();
    expect(invoiceKeyOf({ invoiceNumber: "", supplierCustomerId: null, haulierId: null, vendor: "MSC" })).toBeNull();
    expect(invoiceNumberKey("ab 12\t3")).toBe("AB123");
  });
});

describe("lineAmount / sumByCurrency", () => {
  it("bills unit amount × quantity, none being 1, rounded to the cent", () => {
    expect(lineAmount("100.00", null)).toBe(100);
    expect(lineAmount("100.00", "")).toBe(100);
    expect(lineAmount("33.33", "3")).toBe(99.99);
    expect(lineAmount("0.105", 1)).toBe(0.11);
    expect(lineAmount(null, "2")).toBe(0);
    expect(lineAmount("-50", null)).toBe(-50);
  });

  it("sums per currency, never converted, largest first, CZK for a blank currency", () => {
    expect(
      sumByCurrency([
        { amount: 10.1, currency: "EUR" },
        { amount: 0.2, currency: "EUR" },
        { amount: 500, currency: "USD" },
        { amount: 3, currency: "" },
      ]),
    ).toEqual([
      { currency: "USD", amount: 500 },
      { currency: "EUR", amount: 10.3 },
      { currency: "CZK", amount: 3 },
    ]);
  });

  it("orders by size whatever the sign, then by currency", () => {
    expect(sumByCurrency([{ amount: -900, currency: "EUR" }, { amount: 100, currency: "USD" }, { amount: 100, currency: "CZK" }]).map((s) => s.currency)).toEqual(["EUR", "CZK", "USD"]);
    expect(sumByCurrency([])).toEqual([]);
  });
});

describe("dueDayOf", () => {
  it("never makes a credit note due, whatever it says", () => {
    expect(dueDayOf({ kind: "credit_note", dueDate: "2026-11-20", receivedAt: new Date("2026-11-01T10:00:00Z") }, 14)).toEqual({ due: null, source: "none" });
  });

  it("takes the due day on the invoice over the supplier's terms", () => {
    expect(dueDayOf({ kind: "invoice", dueDate: "2026-11-20", receivedAt: new Date("2026-11-01T10:00:00Z") }, 60)).toEqual({ due: "2026-11-20", source: "invoice" });
  });

  it("else counts the supplier's payment days from the Prague day it was booked", () => {
    expect(dueDayOf({ kind: "invoice", dueDate: null, receivedAt: new Date("2026-11-03T10:00:00Z") }, 14)).toEqual({ due: "2026-11-17", source: "terms" });
    // 23:30 UTC on 2 Nov is 3 Nov in Prague.
    expect(dueDayOf({ kind: "invoice", dueDate: null, receivedAt: "2026-11-02T23:30:00Z" }, 14)).toEqual({ due: "2026-11-17", source: "terms" });
    // Zero days is due the day it came.
    expect(dueDayOf({ kind: "invoice", dueDate: null, receivedAt: new Date("2026-11-03T10:00:00Z") }, 0)).toEqual({ due: "2026-11-03", source: "terms" });
  });

  it("is not known without a due day and either the terms or the booked day", () => {
    expect(dueDayOf({ kind: "invoice", dueDate: null, receivedAt: new Date() }, null)).toEqual({ due: null, source: "none" });
    expect(dueDayOf({ kind: "invoice", dueDate: null, receivedAt: null }, 14)).toEqual({ due: null, source: "none" });
  });
});

describe("daysOverdue", () => {
  it("counts the days past the due day", () => {
    expect(daysOverdue("2026-11-10", "2026-11-17")).toBe(7);
    // Over the change of clocks (25 Oct): calendar days, not hours.
    expect(daysOverdue("2026-10-20", "2026-10-30")).toBe(10);
    expect(daysOverdue("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("is 0 on and before the due day, and when it is not known", () => {
    expect(daysOverdue("2026-11-17", "2026-11-17")).toBe(0);
    expect(daysOverdue("2026-11-30", "2026-11-17")).toBe(0);
    expect(daysOverdue(null, "2026-11-17")).toBe(0);
  });
});

describe("isCzechVatPayer", () => {
  it("is a DIČ starting CZ, any case, spaces around", () => {
    expect(isCzechVatPayer({ dic: "CZ12345678" })).toBe(true);
    expect(isCzechVatPayer({ dic: "  cz12345678 " })).toBe(true);
    expect(isCzechVatPayer({ dic: "SK2020123456" })).toBe(false);
    expect(isCzechVatPayer({ dic: "DE123456789" })).toBe(false);
    expect(isCzechVatPayer({ dic: "" })).toBe(false);
  });
});

describe("marksOf", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const linked = { supplierCustomerId: SUPPLIER, haulierId: null, dueDate: null, kind: "invoice" };

  it("marks nothing for a linked, checked supplier with terms", () => {
    expect(marksOf(linked, facts(), false, now)).toEqual([]);
  });

  it("marks an invoice with no supplier linked, and with no terms when nothing else gives its due day", () => {
    expect(marksOf({ ...linked, supplierCustomerId: null }, null, false, now)).toEqual(["not_linked", "no_terms"]);
    // A haulier is a link too.
    expect(marksOf({ ...linked, supplierCustomerId: null, haulierId: HAULIER }, facts(), false, now)).toEqual([]);
    // A due day on the invoice needs no terms; a credit note is never due.
    expect(marksOf({ ...linked, supplierCustomerId: null, dueDate: "2026-12-01" }, null, false, now)).toEqual(["not_linked"]);
    expect(marksOf({ ...linked, supplierCustomerId: null, kind: "credit_note" }, null, false, now)).toEqual(["not_linked"]);
  });

  it("marks the VAT register checks, the account check only for a Czech VAT payer", () => {
    expect(marksOf(linked, facts({ vatUnreliable: true }), false, now)).toEqual(["vat_unreliable"]);
    expect(marksOf(linked, facts({ bankAccountPublished: false }), false, now)).toEqual(["account_not_published"]);
    expect(marksOf(linked, facts({ dic: "DE123456789", bankAccountPublished: false }), false, now)).toEqual([]);
    // Never asked: "not published" is only the default, not the register's answer (D14).
    expect(marksOf(linked, facts({ bankAccountPublished: false, vatCheckedAt: null }), false, now)).toEqual([]);
  });

  it("marks a bank account changed in the last 30 days, not one changed longer ago", () => {
    expect(marksOf(linked, facts({ bankAccountsChangedAt: "2026-11-10T08:00:00Z" }), false, now)).toEqual(["bank_changed"]);
    expect(marksOf(linked, facts({ bankAccountsChangedAt: "2026-10-01T08:00:00Z" }), false, now)).toEqual([]);
    expect(marksOf(linked, facts({ bankAccountsChangedAt: "2026-10-18T12:00:01Z" }), false, now)).toEqual(["bank_changed"]);
    expect(marksOf(linked, facts({ bankAccountsChangedAt: "2026-10-18T12:00:00Z" }), false, now)).toEqual([]);
  });

  it("marks a supplier waiting for or refused by a manager, and a rating of 2 stars or less", () => {
    expect(marksOf(linked, facts({ approvalStatus: "pending" }), false, now)).toEqual(["supplier_pending"]);
    expect(marksOf(linked, facts({ approvalStatus: "declined" }), false, now)).toEqual(["supplier_declined"]);
    expect(marksOf(linked, facts({ rating: 2 }), false, now)).toEqual(["low_rating"]);
    expect(marksOf(linked, facts({ rating: 0 }), false, now)).toEqual(["low_rating"]);
    expect(marksOf(linked, facts({ rating: 3 }), false, now)).toEqual([]);
  });

  it("marks no terms only when the invoice gives no due day and is not a credit note", () => {
    expect(marksOf(linked, facts({ paymentDays: null }), false, now)).toEqual(["no_terms"]);
    expect(marksOf({ ...linked, dueDate: "2026-12-01" }, facts({ paymentDays: null }), false, now)).toEqual([]);
    expect(marksOf({ ...linked, kind: "credit_note" }, facts({ paymentDays: null }), false, now)).toEqual([]);
  });

  it("marks the same number from another supplier, and every mark at once in a stable order", () => {
    expect(marksOf(linked, facts(), true, now)).toEqual(["same_number_other_supplier"]);
    expect(
      marksOf(
        linked,
        facts({ vatUnreliable: true, bankAccountPublished: false, bankAccountsChangedAt: "2026-11-16T00:00:00Z", approvalStatus: "pending", rating: 1, paymentDays: null }),
        true,
        now,
      ),
    ).toEqual(["vat_unreliable", "account_not_published", "bank_changed", "supplier_pending", "low_rating", "no_terms", "same_number_other_supplier"]);
  });
});

describe("approvalProblem", () => {
  const base = { status: "booked", linked: true, facts: facts(), enteredByUserId: "u-enterer", approverUserId: "u-boss", anotherManager: true };

  it("lets another manager approve, not as a self-approval", () => {
    expect(approvalProblem(base)).toEqual({ problem: null, selfDecision: false });
  });

  it("refuses an approved or refused invoice", () => {
    expect(approvalProblem({ ...base, status: "approved" }).problem).toMatch(/approved already/);
    expect(approvalProblem({ ...base, status: "refused" }).problem).toMatch(/refused/);
  });

  it("refuses until the supplier is linked to the Customer Database (D13)", () => {
    expect(approvalProblem({ ...base, linked: false, facts: null }).problem).toMatch(/Link the supplier first/);
    // Checked before the VAT register, which needs the supplier.
    expect(approvalProblem({ ...base, linked: false, facts: facts({ vatUnreliable: true }) }).problem).toMatch(/Link the supplier first/);
  });

  it("stops a Czech VAT payer that is unreliable or whose account is not published (D14)", () => {
    expect(approvalProblem({ ...base, facts: facts({ vatUnreliable: true }) }).problem).toMatch(/unreliable VAT payer/);
    expect(approvalProblem({ ...base, facts: facts({ bankAccountPublished: false }) }).problem).toMatch(/not published in the VAT register/);
    expect(approvalProblem({ ...base, facts: facts({ vatUnreliable: true, bankAccountPublished: false }) }).problem).toMatch(/unreliable/);
  });

  it("does not apply the VAT register stop to a supplier that is no Czech VAT payer", () => {
    expect(approvalProblem({ ...base, facts: facts({ dic: "DE123456789", vatUnreliable: true, bankAccountPublished: false }) })).toEqual({ problem: null, selfDecision: false });
    expect(approvalProblem({ ...base, facts: facts({ dic: "", bankAccountPublished: false }) }).problem).toBeNull();
    expect(approvalProblem({ ...base, facts: facts({ bankAccountPublished: false, vatCheckedAt: null }) }).problem).toBeNull();
  });

  it("four eyes: the enterer does not approve while another manager can (D9)", () => {
    expect(approvalProblem({ ...base, approverUserId: "u-enterer" })).toEqual({ problem: expect.stringMatching(/another manager approves it/), selfDecision: false });
  });

  it("lets the enterer approve when no other manager exists, marked as a self-approval", () => {
    expect(approvalProblem({ ...base, approverUserId: "u-enterer", anotherManager: false })).toEqual({ problem: null, selfDecision: true });
  });

  it("does not count an invoice gathered from lines (no enterer) as anyone's own", () => {
    expect(approvalProblem({ ...base, enteredByUserId: null, approverUserId: "u-boss", anotherManager: false })).toEqual({ problem: null, selfDecision: false });
    expect(approvalProblem({ ...base, enteredByUserId: "", approverUserId: "" })).toEqual({ problem: null, selfDecision: false });
  });

  it("does not approve an invoice with no amount: none of its lines has a real cost (User Council A1)", () => {
    expect(approvalProblem({ ...base, noAmount: true })).toEqual({ problem: expect.stringMatching(/has no amount yet: fill in the real cost/), selfDecision: false });
    // Said before the supplier link, so what to do first is the amount.
    expect(approvalProblem({ ...base, noAmount: true, linked: false, facts: null }).problem).toMatch(/no amount/);
    expect(approvalProblem({ ...base, noAmount: false }).problem).toBeNull();
  });
});

describe("hasNoAmount", () => {
  it("is true only when no line has a real cost", () => {
    expect(hasNoAmount([{ realAmount: null }, { realAmount: null }])).toBe(true);
    expect(hasNoAmount([])).toBe(true);
    expect(hasNoAmount([{ realAmount: null }, { realAmount: "1450.00" }])).toBe(false);
    // A real cost of 0 is an amount typed, not a missing one.
    expect(hasNoAmount([{ realAmount: "0" }])).toBe(false);
  });
});

describe("claimsOf / holdsPayment", () => {
  const SHIP_A = "ship-a";
  const SHIP_B = "ship-b";
  const invoice = { id: "inv-1", numberKey: "FV2026-0417", shipmentIds: [SHIP_A] };
  const claim = (over: Record<string, unknown>) => ({ id: "c", shipmentId: SHIP_A, supplierInvoiceId: null, invoiceNumber: "", status: "open", ...over });

  it("takes the claims tied to the invoice, on any shipment", () => {
    const tied = claim({ id: "c1", supplierInvoiceId: "inv-1", shipmentId: SHIP_B });
    expect(claimsOf(invoice, [tied])).toEqual([tied]);
  });

  it("matches a claim typed before it could be tied by its number, on a job of the invoice", () => {
    const typed = claim({ id: "c2", invoiceNumber: " fv 2026-0417" });
    expect(claimsOf(invoice, [typed])).toEqual([typed]);
  });

  it("leaves out a claim of another number, on another job, or tied to another invoice", () => {
    expect(claimsOf(invoice, [claim({ invoiceNumber: "FV2026-0418" })])).toEqual([]);
    expect(claimsOf(invoice, [claim({ invoiceNumber: "FV2026-0417", shipmentId: SHIP_B })])).toEqual([]);
    // Tied to another invoice: not this one's, even with the same number on the same job.
    expect(claimsOf(invoice, [claim({ supplierInvoiceId: "inv-2", invoiceNumber: "FV2026-0417" })])).toEqual([]);
    expect(claimsOf(invoice, [claim({ invoiceNumber: "" })])).toEqual([]);
  });

  it("holds the payment only while a claim is open (D15)", () => {
    expect(holdsPayment([{ status: "accepted" }, { status: "open" }])).toBe(true);
    expect(holdsPayment([{ status: "accepted" }, { status: "rejected" }, { status: "withdrawn" }])).toBe(false);
    expect(holdsPayment([])).toBe(false);
  });
});

describe("paymentProblem", () => {
  const base = { status: "approved", paidOn: null, day: "2026-11-15", today: "2026-11-17", bookedOn: "2026-11-03", openClaim: false };

  it("lets an approved, unpaid, unclaimed invoice be paid between its booking and today", () => {
    expect(paymentProblem(base)).toBeNull();
    expect(paymentProblem({ ...base, day: "2026-11-17" })).toBeNull();
    expect(paymentProblem({ ...base, day: "2026-11-03" })).toBeNull();
    expect(paymentProblem({ ...base, bookedOn: null, day: "2020-01-01" })).toBeNull();
  });

  it("pays only an approved invoice (D11)", () => {
    expect(paymentProblem({ ...base, status: "booked" })).toMatch(/Approve the invoice first/);
    expect(paymentProblem({ ...base, status: "refused" })).toMatch(/Approve the invoice first/);
  });

  it("pays it once", () => {
    expect(paymentProblem({ ...base, paidOn: "2026-11-10" })).toBe("This invoice is marked paid already (2026-11-10)");
  });

  it("holds it while a claim is open (D15)", () => {
    expect(paymentProblem({ ...base, openClaim: true })).toMatch(/claim on this invoice is open/);
  });

  it("refuses a day after today or before it was booked", () => {
    expect(paymentProblem({ ...base, day: "2026-11-18" })).toMatch(/after today/);
    expect(paymentProblem({ ...base, day: "2026-11-02" })).toBe("The day it was paid cannot be before it was booked (2026-11-03)");
  });

  it("does not pay an invoice with no amount (User Council A1)", () => {
    expect(paymentProblem({ ...base, noAmount: true })).toMatch(/has no amount yet: fill in the real cost/);
    expect(paymentProblem({ ...base, noAmount: false })).toBeNull();
  });
});

describe("linkedMasterSiblings", () => {
  const linked = { id: "inv-c", numberKey: "FV1", supplierKey: "c:supplier-1" };
  const byText = { id: "inv-n", numberKey: "FV2", supplierKey: "n:msc" };
  const invoices = new Map([linked, byText].map((h) => [h.id, h]));
  const line = (over: Partial<{ masterJobId: string; vendor: string; invoiceNumber: string; supplierInvoiceId: string | null }> = {}) => ({
    masterJobId: "mj1",
    vendor: "MSC",
    invoiceNumber: "FV 1",
    supplierInvoiceId: "inv-c",
    ...over,
  });

  it("points a new line of the same master job, supplier text and number at the linked invoice", () => {
    const siblings = linkedMasterSiblings([line()], invoices);
    expect(siblings.get(masterSiblingKey({ masterJobId: "mj1", vendor: " msc ", invoiceNumber: "fv1" }))).toBe(linked);
    // another master job, another supplier text or another number is another invoice
    expect(siblings.get(masterSiblingKey({ masterJobId: "mj2", vendor: "MSC", invoiceNumber: "FV1" }))).toBeUndefined();
    expect(siblings.get(masterSiblingKey({ masterJobId: "mj1", vendor: "Maersk", invoiceNumber: "FV1" }))).toBeUndefined();
  });

  it("leaves out an invoice still matched by the text, and a line renumbered away from its invoice", () => {
    expect(linkedMasterSiblings([line({ invoiceNumber: "FV2", supplierInvoiceId: "inv-n" })], invoices).size).toBe(0);
    expect(linkedMasterSiblings([line({ invoiceNumber: "FV3" })], invoices).size).toBe(0);
    expect(linkedMasterSiblings([line({ supplierInvoiceId: null })], invoices).size).toBe(0);
  });
});
