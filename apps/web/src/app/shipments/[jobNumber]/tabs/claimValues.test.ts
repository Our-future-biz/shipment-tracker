import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { claimAmountText, claimChanges, claimFilled, claimStatusOf, costClaimSendable } from "./claimValues";

const claim = {
  id: "c1",
  shipmentId: "s1",
  kind: "cargo",
  cargoState: "Damaged",
  note: "Box crushed",
  supplier: "",
  invoiceNumber: "",
  reason: "",
  amount: "",
  noticeDate: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  supplierInvoiceId: null,
  claimAmount: null,
  claimCurrency: "",
  status: "open",
  closedAt: null,
  closedBy: "",
} as interfaces.ClaimItem;

describe("a changed claim", () => {
  it("sends only the fields that changed", () => {
    expect(claimChanges(claim, { cargoState: "Damaged", note: "Box crushed, two pallets", noticeDate: "" })).toEqual({ note: "Box crushed, two pallets" });
  });

  it("sends nothing when nothing changed, an empty date included", () => {
    expect(claimChanges(claim, { cargoState: "Damaged", note: "Box crushed", noticeDate: "" })).toEqual({});
  });

  it("sends a date set or cleared", () => {
    expect(claimChanges(claim, { noticeDate: "2026-11-03" })).toEqual({ noticeDate: "2026-11-03" });
    expect(claimChanges({ ...claim, noticeDate: "2026-11-03" }, { noticeDate: "" })).toEqual({ noticeDate: "" });
  });
});

describe("a new claim", () => {
  it("sends every field", () => {
    const values = { cargoState: "", note: "Wet", noticeDate: "" };
    expect(claimChanges(undefined, values)).toBe(values);
  });

  it("needs something filled in", () => {
    expect(claimFilled({ cargoState: "", note: "  ", noticeDate: "" })).toBe(false);
    expect(claimFilled({ supplier: "", invoiceNumber: "FA-12", reason: "", amount: "" })).toBe(true);
  });
});

// Council Outlay 9, D15: a claim on costs names its supplier invoice, the amount as a figure and where it stands.
describe("a claim on costs", () => {
  const cost = { ...claim, kind: "cost", cargoState: "", note: "", supplier: "Maersk", invoiceNumber: "FA-1", claimAmount: "1200.50", claimCurrency: "EUR" } as interfaces.ClaimItem;

  it("sends nothing for the same figure written another way, nor for an untouched invoice link and status", () => {
    expect(claimChanges(cost, { claimAmount: "1,200.5", claimCurrency: "EUR", supplierInvoiceId: "", status: "open" })).toEqual({});
  });

  it("sends a figure changed or cleared, a link set and a status moved", () => {
    expect(claimChanges(cost, { claimAmount: "1200.6" })).toEqual({ claimAmount: "1200.6" });
    expect(claimChanges(cost, { claimAmount: "" })).toEqual({ claimAmount: "" });
    expect(claimChanges({ ...cost, claimAmount: null }, { claimAmount: "0" })).toEqual({ claimAmount: "0" });
    expect(claimChanges(cost, { supplierInvoiceId: "inv-1", status: "accepted" })).toEqual({ supplierInvoiceId: "inv-1", status: "accepted" });
  });

  it("is not filled in by its status alone", () => {
    expect(claimFilled({ supplier: "", reason: " ", claimAmount: "", status: "open" })).toBe(false);
    expect(claimFilled({ supplierInvoiceId: "inv-1", status: "open" })).toBe(true);
  });

  it("sends the figure and the currency as the server takes them", () => {
    expect(costClaimSendable({ claimAmount: "1 200,50", claimCurrency: " eur" })).toEqual({ claimAmount: "1200.5", claimCurrency: "EUR" });
    expect(costClaimSendable({ claimAmount: "about 100" })).toEqual({ claimAmount: "about 100" });
    expect(costClaimSendable({ reason: "Late" })).toEqual({ reason: "Late" });
  });

  it("shows the claimed figure, else the amount typed on an older claim", () => {
    expect(claimAmountText(cost)).toBe("1,200.50 EUR");
    expect(claimAmountText({ claimAmount: null, claimCurrency: "", amount: "CZK 500" })).toBe("CZK 500");
  });

  it("knows its status by name, an unknown one as Open", () => {
    expect(claimStatusOf("rejected").label).toBe("Rejected");
    expect(claimStatusOf("").label).toBe("Open");
  });
});
