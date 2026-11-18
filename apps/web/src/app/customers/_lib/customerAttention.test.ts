import { describe, expect, it } from "vitest";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { ReceivableItem } from "@/hooks/useReceivables";
import { buildCustomerAttention } from "./customerAttention";

const NOW = new Date("2026-10-13T12:00:00").getTime();

const customer = (over: Partial<CustomerItem> = {}): CustomerItem => ({
  id: "c", ico: "1", dic: "", companyName: "Acme", legalForm: "", registeredAddress: "", city: "", country: "CZ",
  registrationDate: "2010-01-01", nace: "20110", industry: "", typicalCargo: "", stability: "", riskLevel: "", roles: ["customer"],
  dataSource: "", lastRegistryUpdate: "", status: "Active", salesOwner: "", salesOwnerUserId: "u", label: "STANDARD",
  creditLimit: 1000, currency: "EUR", secondaryCurrencies: [], paymentTerms: "30 days", freightPaymentTerms: "", dutyPaymentTerms: "",
  companyWebsite: "", logoUrl: "", logoSource: "", logoUpdatedAt: "", totalRevenue: 0, totalProfit: 0, totalShipments: 0,
  lastActivityDate: "", supplierRating: null, supplierRatingReason: "", supplierRatingBy: "", supplierRatingAt: null,
  supplierTerms: { paymentDays: null, currency: null, vatUnreliable: false, bankAccountPublished: false, vatCheckedAt: "", bankAccounts: [], bankAccountsChangedAt: null, bankAccountsChangedBy: "" },
  approvalStatus: "", language: "en",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const TODAY = "2026-10-13";
const ledger = (typed: InvoiceItem[] = [], issued: ReceivableItem[] = []) => ({ issued, typed });

const keys = (c: CustomerItem, invoices: InvoiceItem[] = []) =>
  buildCustomerAttention({ customer: c, ledger: ledger(invoices), today: TODAY, contacts: [], documents: [], notes: [], rates: { CZK: 1, EUR: 25 }, now: NOW }).map((i) => i.key);

describe("buildCustomerAttention", () => {
  it("flags a high-risk industry read from NACE (20 = chemicals)", () => {
    expect(keys(customer())).toContain("high-risk-industry");
  });

  it("follows a risk level set by hand: Low silences it, High raises it", () => {
    expect(keys(customer({ riskLevel: "Low" }))).not.toContain("high-risk-industry");
    expect(keys(customer({ nace: "", riskLevel: "High" }))).toContain("high-risk-industry");
  });

  it("names the industry set by hand", () => {
    const items = buildCustomerAttention({
      customer: customer({ industry: "Explosives" }), ledger: ledger(), today: TODAY, contacts: [], documents: [], notes: [], rates: { CZK: 1 }, now: NOW,
    });
    expect(items.find((i) => i.key === "high-risk-industry")?.detail).toContain("Explosives");
  });

  it("says when open invoices in a currency without a rate are left out", () => {
    const invoice = {
      id: "i", customerId: "c", invoiceNumber: "X", amount: 500, currency: "USD", dueDate: "2026-10-30", status: "Open",
      issuedAt: "2026-10-01", source: "typed", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    } as InvoiceItem;
    expect(keys(customer(), [invoice])).toContain("invoices-not-counted");
  });

  it("says the invoices were not checked when they could not be loaded, rather than nothing about them", () => {
    const input = { customer: customer(), ledger: ledger(), today: TODAY, contacts: [], documents: [], notes: [], rates: { CZK: 1, EUR: 25 }, now: NOW };
    expect(buildCustomerAttention({ ...input, invoicesUnavailable: true }).map((i) => i.key)).toContain("invoices-not-checked");
    expect(buildCustomerAttention(input).map((i) => i.key)).not.toContain("invoices-not-checked");
  });

  it("says today's rates could not be loaded, not that ČNB publishes no rate, when only CZK is known for that", () => {
    const invoice = {
      id: "i", customerId: "c", invoiceNumber: "X", amount: 500, currency: "EUR", dueDate: "2026-10-30", status: "Open",
      issuedAt: "2026-10-01", source: "typed", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    } as InvoiceItem;
    const input = { customer: customer(), ledger: ledger([invoice]), today: TODAY, contacts: [], documents: [], notes: [], rates: { CZK: 1 }, now: NOW };
    const failed = buildCustomerAttention({ ...input, ratesUnavailable: true }).find((i) => i.key === "invoices-not-counted");
    expect(failed?.detail).toBe("Today's exchange rates could not be loaded; the open invoices in EUR are left out of the outstanding sum and the credit check.");
    const noRate = buildCustomerAttention(input).find((i) => i.key === "invoices-not-counted");
    expect(noRate?.detail).toBe("ČNB publishes no rate for EUR; the open invoices in EUR are left out of the outstanding sum and the credit check.");
  });
});

describe("buildCustomerAttention: what is owed, one truth with Accounts Receivable", () => {
  const typed = (over: Partial<InvoiceItem>): InvoiceItem => ({
    id: "t", customerId: "c", invoiceNumber: "OLD-1", amount: 0, currency: "EUR", dueDate: "2026-10-30", status: "Open",
    issuedAt: "2026-10-01", source: "typed", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
  });
  const issued = (over: Partial<ReceivableItem>): ReceivableItem => ({
    id: "r", number: "INV-1", customerId: "c", customer: "Acme", shipmentId: "s", jobNumber: "J1", issueDate: "2026-09-01",
    duzp: "2026-09-01", dueDate: "2026-10-01", currency: "EUR", net: 0, vat: 0, gross: 0, grossCzk: 0, credited: 0, paid: 0, writtenOff: 0, bankCharges: 0,
    leftToPay: 0, status: "unpaid", marks: [], daysOverdue: 0, agingBucket: null, paymentTerms: "30 days", promisedOn: null,
    disputed: false, reminderLevel: 0, lastRemindedOn: null, lastPaidOn: null, creditNoteNumbers: [], creditNotes: [], personInCharge: "",
    holidayCover: "", salesOwner: "", mine: false, myCustomer: false, issuedBy: "", version: 1, ...over,
  });
  const build = (l: ReturnType<typeof ledger>, today = TODAY) =>
    buildCustomerAttention({ customer: customer(), ledger: l, today, contacts: [], documents: [], notes: [], rates: { CZK: 1, EUR: 25 }, now: NOW });

  it("counts an issued invoice's left to pay and a typed row together, with the server's days overdue", () => {
    const items = build(
      ledger([typed({ amount: 50, dueDate: "2026-10-03" })], [issued({ gross: 1000, paid: 800, leftToPay: 200, status: "part_paid", marks: ["overdue"], daysOverdue: 12, agingBucket: "1-30" })]),
    );
    const overdue = items.find((i) => i.key === "invoices-overdue");
    expect(overdue).toMatchObject({ title: "2 invoices overdue", detail: "Oldest is 12 days past due.", meta: "250 EUR" });
  });

  it("says the credit limit is exceeded on what is left to pay, not on the invoices' gross", () => {
    expect(build(ledger([], [issued({ gross: 5000, paid: 4500, leftToPay: 500, status: "part_paid" })])).map((i) => i.key)).not.toContain("credit-limit");
    expect(build(ledger([typed({ amount: 600 })], [issued({ gross: 5000, paid: 4500, leftToPay: 500, status: "part_paid" })])).map((i) => i.key)).toContain("credit-limit");
  });

  it("finds a typed row overdue by the business day it is given, from the day after its due day", () => {
    const l = ledger([typed({ amount: 10, dueDate: "2026-10-13" })]);
    expect(build(l, "2026-10-13").map((i) => i.key)).not.toContain("invoices-overdue");
    expect(build(l, "2026-10-14").find((i) => i.key === "invoices-overdue")?.detail).toBe("Oldest is 1 day past due.");
  });
});

describe("buildCustomerAttention for a supplier only", () => {
  it("asks nothing a customer is asked for (owner, credit, customer papers, prepayment, credit risk)", () => {
    const supplier = customer({ roles: ["haulier"], salesOwnerUserId: null, creditLimit: 0, registrationDate: "2026-01-01", riskLevel: "High" });
    const found = keys(supplier);
    for (const key of ["no-sales-owner", "no-credit-limit", "documents-missing", "new-company", "high-risk-industry"]) expect(found).not.toContain(key);
  });

  it("still says it has nobody to call and nothing logged, as for any company", () => {
    expect(keys(customer({ roles: ["shipping_line"] }))).toEqual(expect.arrayContaining(["no-contact-person", "no-interaction"]));
  });

  it("keeps every customer rule for a supplier that is also a customer", () => {
    expect(keys(customer({ roles: ["haulier", "customer"], salesOwnerUserId: null, creditLimit: 0 }))).toEqual(expect.arrayContaining(["no-sales-owner", "no-credit-limit"]));
  });
});
