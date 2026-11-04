import { describe, expect, it } from "vitest";
import type { CustomerItem } from "@/hooks/useCustomers";
import { buildSupplierAttention, type SupplierAttentionInput } from "./supplierAttention";

const company = (over: Partial<CustomerItem> = {}): CustomerItem => ({
  id: "s", ico: "1", dic: "", companyName: "Kovo Doprava", legalForm: "", registeredAddress: "", city: "", country: "CZ",
  registrationDate: "", nace: "", industry: "", typicalCargo: "", stability: "", riskLevel: "", roles: ["haulier"],
  dataSource: "", lastRegistryUpdate: "", status: "Prospect", salesOwner: "", salesOwnerUserId: null, label: "TARGET CUSTOMER",
  creditLimit: 0, currency: "EUR", secondaryCurrencies: [], paymentTerms: "", freightPaymentTerms: "", dutyPaymentTerms: "",
  companyWebsite: "", logoUrl: "", logoSource: "", logoUpdatedAt: "", totalRevenue: 0, totalProfit: 0, totalShipments: 0,
  lastActivityDate: "", supplierRating: 4, supplierRatingReason: "", supplierRatingBy: "m@x.cz", supplierRatingAt: "2026-10-01T08:00:00Z",
  supplierTerms: { paymentDays: 30, currency: "CZK", vatUnreliable: false, bankAccountPublished: true, vatCheckedAt: "2026-10-01", bankAccounts: ["19-2000145399/0800"], bankAccountsChangedAt: null, bankAccountsChangedBy: "" },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});
const dispatch = [{ role: "Dispatch / Operations" }] as SupplierAttentionInput["contacts"];
const input = (over: Partial<SupplierAttentionInput> = {}): SupplierAttentionInput => ({
  customer: company(), haulierIssues: [], tariffs: [], contacts: dispatch, documents: [], today: "2026-11-04", ...over,
});
const keys = (over: Partial<SupplierAttentionInput> = {}) => buildSupplierAttention(input(over)).map((i) => i.key);

describe("a supplier's Needs attention", () => {
  it("is nothing for a well-kept supplier, and nothing at all for a company that is no supplier", () => {
    expect(keys()).toEqual([]);
    expect(keys({ customer: company({ roles: ["customer"], supplierRating: null }), contacts: [] })).toEqual([]);
  });

  it("takes Trucking's check as it is: what blocks a trip first, as critical", () => {
    const items = buildSupplierAttention(input({
      haulierIssues: [
        { code: "insurance_expiring", severity: "warn", message: "Insurance expires on 20 Nov 2026" },
        { code: "blocked", severity: "block", message: "Blocked by M. Novák: two lost pallets" },
      ],
    }));
    expect(items.map((i) => [i.severity, i.title])).toEqual([["critical", "Blocked in Trucking"], ["warning", "Trucking"]]);
  });

  it("asks to rate an unrated supplier, names a low rating with its reason, and an old one", () => {
    expect(keys({ customer: company({ supplierRating: null }) })).toEqual(["not-rated"]);
    const low = buildSupplierAttention(input({ customer: company({ supplierRating: 2, supplierRatingReason: "Late PODs" }) }));
    expect(low.map((i) => [i.key, i.detail])).toEqual([["low-rating", "Late PODs"]]);
    expect(keys({ customer: company({ supplierRating: 0 }) })).toEqual(["low-rating"]);
    expect(keys({ customer: company({ supplierRatingAt: "2025-10-30T10:00:00Z" }) })).toEqual(["rating-stale"]);
    expect(keys({ customer: company({ supplierRatingAt: "2025-11-05T10:00:00Z" }) })).toEqual([]);
  });

  it("names a role with no tariff that prices today, and tariffs ending within 30 days", () => {
    const tariff = { role: "rail_operator" as const, label: "Rail tariffs", href: "", tariffCount: 2, activeCount: 1, activeUntil: "2026-12-31" };
    expect(keys({ tariffs: [tariff] })).toEqual([]);
    expect(keys({ tariffs: [{ ...tariff, activeCount: 0 }] })).toEqual(["no-tariff-rail_operator"]);
    expect(keys({ tariffs: [{ ...tariff, activeUntil: "2026-12-04" }] })).toEqual(["tariff-ending-rail_operator"]);
    // Not loaded yet: nothing is said about tariffs.
    expect(keys({ tariffs: null })).toEqual([]);
  });

  it("names a dated paper that expired or ends within 30 days, and only those types", () => {
    const doc = (id: string, type: string, validTo: string) => ({ id, name: id, type, validTo }) as never;
    expect(keys({ documents: [doc("ins", "Carrier liability insurance", "2026-11-01"), doc("lic", "Transport licence", "2026-11-20"), doc("ok", "Certificate", "2027-06-01"), doc("contract", "Contract", "2020-01-01")] })).toEqual([
      "document-expired-ins",
      "document-ending-lic",
    ]);
  });

  it("asks for a dispatch contact, unless the contacts could not be read", () => {
    expect(keys({ contacts: [] })).toEqual(["no-dispatch-contact"]);
    expect(keys({ contacts: null })).toEqual([]);
  });

  describe("the VAT register checks", () => {
    const terms = (over: Partial<CustomerItem["supplierTerms"]>) => company({ roles: ["rail_operator"], supplierTerms: { ...company().supplierTerms, ...over } });

    it("name an unreliable payer as critical, and a check never made or over 6 months old", () => {
      const unreliable = buildSupplierAttention(input({ customer: terms({ vatUnreliable: true }) }));
      expect(unreliable.map((i) => [i.key, i.severity])).toEqual([["vat-unreliable", "critical"]]);
      expect(keys({ customer: terms({ vatCheckedAt: "" }) })).toEqual(["vat-not-checked"]);
      expect(keys({ customer: terms({ vatCheckedAt: "2026-05-03" }) })).toEqual(["vat-check-old"]);
      expect(keys({ customer: terms({ vatCheckedAt: "2026-05-05" }) })).toEqual([]);
    });

    it("leave a haulier's unreliable payer and check to Trucking, which says them itself", () => {
      const haulier = company({ supplierTerms: { ...company().supplierTerms, vatUnreliable: true, vatCheckedAt: "" } });
      expect(keys({ customer: haulier })).toEqual([]);
    });

    it("name a checked supplier with no published account, and an account added in the last 30 days, a haulier too", () => {
      expect(keys({ customer: terms({ bankAccounts: [] }) })).toEqual(["no-published-account"]);
      expect(keys({ customer: terms({ bankAccountPublished: false }) })).toEqual(["no-published-account"]);
      // Never checked: only that is said.
      expect(keys({ customer: terms({ vatCheckedAt: "", bankAccounts: [] }) })).toEqual(["vat-not-checked"]);
      expect(keys({ customer: company({ supplierTerms: { ...company().supplierTerms, bankAccountsChangedAt: "2026-10-20T08:00:00Z", bankAccountsChangedBy: "jana@x.cz" } }) })).toEqual(["bank-account-added"]);
      expect(keys({ customer: company({ supplierTerms: { ...company().supplierTerms, bankAccountsChangedAt: "2026-10-01T08:00:00Z" } }) })).toEqual([]);
    });
  });
});
