import { describe, expect, it } from "vitest";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { buildCustomerAttention } from "./customerAttention";

const NOW = new Date("2026-10-13T12:00:00").getTime();

const customer = (over: Partial<CustomerItem> = {}): CustomerItem => ({
  id: "c", ico: "1", dic: "", companyName: "Acme", legalForm: "", registeredAddress: "", city: "", country: "CZ",
  registrationDate: "2010-01-01", nace: "20110", industry: "", typicalCargo: "", stability: "", riskLevel: "",
  dataSource: "", lastRegistryUpdate: "", status: "Active", salesOwner: "", salesOwnerUserId: "u", label: "STANDARD",
  creditLimit: 1000, currency: "EUR", paymentTerms: "30 days", freightPaymentTerms: "", dutyPaymentTerms: "",
  companyWebsite: "", logoData: "", logoSource: "", logoUpdatedAt: "", totalRevenue: 0, totalProfit: 0, totalShipments: 0,
  lastActivityDate: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const keys = (c: CustomerItem, invoices: InvoiceItem[] = []) =>
  buildCustomerAttention({ customer: c, invoices, contacts: [], documents: [], notes: [], rates: { CZK: 1, EUR: 25 }, now: NOW }).map((i) => i.key);

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
      customer: customer({ industry: "Explosives" }), invoices: [], contacts: [], documents: [], notes: [], rates: { CZK: 1 }, now: NOW,
    });
    expect(items.find((i) => i.key === "high-risk-industry")?.detail).toContain("Explosives");
  });

  it("says when open invoices in a currency without a rate are left out", () => {
    const invoice = {
      id: "i", customerId: "c", invoiceNumber: "X", amount: 500, currency: "USD", dueDate: "2026-10-30", status: "Open",
      issuedAt: "2026-10-01", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    } as InvoiceItem;
    expect(keys(customer(), [invoice])).toContain("invoices-not-counted");
  });
});
