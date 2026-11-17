import { describe, expect, it } from "vitest";
import { closingStamps, costClaimColumns, fillsCostFields } from "../lib/costClaim";

const INVOICE = "5B0E4D53-08A5-4E5E-9A0B-0E2F6A1F1C09";

describe("the fields of a claim on costs", () => {
  it("are stored as columns take them: the id lower case, an empty id or amount as null, the currency upper case", () => {
    expect(costClaimColumns({ supplierInvoiceId: INVOICE, claimAmount: " 120.50 ", claimCurrency: "eur", status: "open" })).toEqual({
      columns: { supplierInvoiceId: INVOICE.toLowerCase(), claimAmount: "120.50", claimCurrency: "EUR", status: "open" },
    });
    expect(costClaimColumns({ supplierInvoiceId: "", claimAmount: "", claimCurrency: "" })).toEqual({
      columns: { supplierInvoiceId: null, claimAmount: null, claimCurrency: "" },
    });
  });

  it("leaves out what is not sent, so it stays as it is", () => {
    expect(costClaimColumns({})).toEqual({ columns: {} });
    expect(costClaimColumns({ claimAmount: "7" })).toEqual({ columns: { claimAmount: "7" } });
  });

  it("refuses an invoice that is no id", () => {
    expect(costClaimColumns({ supplierInvoiceId: "INV-1" })).toEqual({ problem: "The supplier invoice must be given by its id" });
  });

  it("refuses an amount that is no number, below zero, with more than 2 decimals or too big for the column", () => {
    for (const claimAmount of ["12,50", "abc", "-5", "1.234", "1234567890123", "1e3"]) {
      expect(costClaimColumns({ claimAmount })).toEqual({ problem: "The claimed amount must be a number with at most 2 decimal places, like 120.50" });
    }
    expect(costClaimColumns({ claimAmount: "999999999999.99" })).toEqual({ columns: { claimAmount: "999999999999.99" } });
  });

  it("refuses a currency that is no 3-letter code", () => {
    for (const claimCurrency of ["EU", "EURO", "€", "12A"]) {
      expect(costClaimColumns({ claimCurrency })).toEqual({ problem: "The currency must be a 3-letter code, like EUR" });
    }
  });

  it("takes only the four statuses", () => {
    for (const status of ["open", "accepted", "rejected", "withdrawn"]) expect(costClaimColumns({ status })).toEqual({ columns: { status } });
    for (const status of ["", "Open", "closed"]) {
      expect(costClaimColumns({ status })).toEqual({ problem: "The claim status must be one of: open, accepted, rejected, withdrawn" });
    }
  });

  it("are filled in when a value or a status is sent; empty ones only clear", () => {
    expect(fillsCostFields({ supplierInvoiceId: "", claimAmount: " ", claimCurrency: "" })).toBe(false);
    expect(fillsCostFields({ claimCurrency: "EUR" })).toBe(true);
    expect(fillsCostFields({ status: "open" })).toBe(true);
  });
});

describe("closing a claim on costs", () => {
  const now = new Date("2026-11-17T10:00:00Z");

  it("stamps when and who on accepted, rejected or withdrawn", () => {
    for (const next of ["accepted", "rejected", "withdrawn"] as const) {
      expect(closingStamps(next, "open", "eva@firma.cz", now)).toEqual({ closedAt: now, closedBy: "eva@firma.cz" });
    }
    // From one closed status to another is closed again, now.
    expect(closingStamps("rejected", "accepted", "eva@firma.cz", now)).toEqual({ closedAt: now, closedBy: "eva@firma.cz" });
  });

  it("clears the stamps when it is reopened", () => {
    expect(closingStamps("open", "withdrawn", "eva@firma.cz", now)).toEqual({ closedAt: null, closedBy: "" });
  });

  it("keeps them when the status is sent as it already is", () => {
    expect(closingStamps("accepted", "accepted", "eva@firma.cz", now)).toBeNull();
    expect(closingStamps("open", "open", "eva@firma.cz", now)).toBeNull();
  });
});
