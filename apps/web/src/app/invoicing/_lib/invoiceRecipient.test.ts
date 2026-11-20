import { describe, expect, it } from "vitest";
import { accountsContactEmail, invoiceRecipient } from "./invoiceRecipient";

const contact = (id: string, email: string, role = "Sales", isMain = false, createdAt = "2026-01-01T00:00:00Z") => ({ id, email, role, isMain, createdAt });

describe("accountsContactEmail (as a payment reminder picks the contact)", () => {
  it("takes Accounts payable, else Finance / Accounting, else the main contact, each with an e-mail", () => {
    const main = contact("m", "boss@alza.cz", "Owner", true);
    const finance = contact("f", "fin@alza.cz", "Finance / Accounting");
    const ap = contact("a", "ap@alza.cz", "Accounts payable");
    expect(accountsContactEmail([main, finance, ap])).toBe("ap@alza.cz");
    expect(accountsContactEmail([main, finance])).toBe("fin@alza.cz");
    expect(accountsContactEmail([main, contact("x", "x@alza.cz")])).toBe("boss@alza.cz");
    expect(accountsContactEmail([contact("ap2", " ", "Accounts payable"), main])).toBe("boss@alza.cz");
    expect(accountsContactEmail([contact("x", "x@alza.cz")])).toBe("");
  });

  it("among several of one role takes the main one, then the oldest", () => {
    const older = contact("o", "old@alza.cz", "Accounts payable", false, "2025-01-01T00:00:00Z");
    const newer = contact("n", "new@alza.cz", "Accounts payable", false, "2026-01-01T00:00:00Z");
    expect(accountsContactEmail([newer, older])).toBe("old@alza.cz");
    expect(accountsContactEmail([older, { ...newer, isMain: true }])).toBe("new@alza.cz");
  });
});

describe("invoiceRecipient (B20)", () => {
  const contacts = [contact("m", "boss@alza.cz", "Owner", true)];

  it("keeps the shipment's Customer's contact first", () => {
    expect(invoiceRecipient("pic@alza.cz", { customerId: "c1", contactsOf: "c1", contacts })).toBe("pic@alza.cz");
  });

  it("without one, takes the billed customer's accounts or main contact", () => {
    expect(invoiceRecipient("", { customerId: "c1", contactsOf: "c1", contacts })).toBe("boss@alza.cz");
  });

  it("never takes another company's contacts", () => {
    expect(invoiceRecipient("", { customerId: "c2", contactsOf: "c1", contacts })).toBe("");
  });
});
