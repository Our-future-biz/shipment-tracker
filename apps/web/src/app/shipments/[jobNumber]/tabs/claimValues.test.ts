import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import {
  CARRIER_DAY_NEEDED,
  INSURER_DAY_NEEDED,
  SETTLED_AMOUNT_NEEDED,
  cargoClaimProblem,
  claimAmountText,
  claimChanges,
  claimDeadlines,
  claimFilled,
  claimSendable,
  claimStatusOf,
  deadlineFromText,
  figureText,
  isOpenStatus,
} from "./claimValues";

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
  isOpen: true,
  closedAt: null,
  closedBy: "",
  ownerUserId: null,
  ownerName: "",
  insurerNotifiedOn: null,
  settledAmount: null,
  settledCurrency: "",
  deadlineFrom: null,
  noticeDeadline: null,
  suitDeadline: null,
} as interfaces.ShipmentClaimView;

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
  const cost = { ...claim, kind: "cost", cargoState: "", note: "", supplier: "Maersk", invoiceNumber: "FA-1", claimAmount: "1200.50", claimCurrency: "EUR" } as interfaces.ShipmentClaimView;

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
    expect(claimSendable({ claimAmount: "1 200,50", claimCurrency: " eur" })).toEqual({ claimAmount: "1200.5", claimCurrency: "EUR" });
    expect(claimSendable({ claimAmount: "about 100" })).toEqual({ claimAmount: "about 100" });
    expect(claimSendable({ reason: "Late" })).toEqual({ reason: "Late" });
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

// Council Outlay 11, D20 / D21: a claim on the shipment has a life, an owner, amounts and deadlines.
describe("a claim on the shipment", () => {
  const cargo = claim;

  it("knows its own statuses by name, an unknown one as Open, apart from a claim on costs", () => {
    expect(claimStatusOf("with_insurer", "cargo").label).toBe("With the insurer");
    expect(claimStatusOf("notified", "cargo").label).toBe("Carrier notified");
    expect(claimStatusOf("accepted", "cargo").label).toBe("Open");
    expect(claimStatusOf("settled").label).toBe("Open");
  });

  it("is open until settled, rejected or withdrawn; a claim on costs only while Open", () => {
    expect(["open", "notified", "with_insurer"].every((s) => isOpenStatus("cargo", s))).toBe(true);
    expect(["settled", "rejected", "withdrawn"].some((s) => isOpenStatus("cargo", s))).toBe(false);
    expect(isOpenStatus("cost", "open")).toBe(true);
    expect(isOpenStatus("cost", "accepted")).toBe(false);
  });

  it("asks for the day or the amount its status needs, in the server's words", () => {
    expect(cargoClaimProblem({ status: "open" })).toBeNull();
    expect(cargoClaimProblem({ status: "notified", noticeDate: "" })).toBe(CARRIER_DAY_NEEDED);
    expect(cargoClaimProblem({ status: "notified", noticeDate: "2026-11-18" })).toBeNull();
    expect(cargoClaimProblem({ status: "with_insurer", noticeDate: "2026-11-18" })).toBe(INSURER_DAY_NEEDED);
    expect(cargoClaimProblem({ status: "with_insurer", insurerNotifiedOn: "2026-11-19" })).toBeNull();
    expect(cargoClaimProblem({ status: "settled", settledAmount: "500", settledCurrency: "" })).toBe(SETTLED_AMOUNT_NEEDED);
    expect(cargoClaimProblem({ status: "settled", settledAmount: " ", settledCurrency: "EUR" })).toBe(SETTLED_AMOUNT_NEEDED);
    expect(cargoClaimProblem({ status: "settled", settledAmount: "500", settledCurrency: "EUR" })).toBeNull();
    // closed without settling needs nothing
    expect(cargoClaimProblem({ status: "rejected" })).toBeNull();
  });

  it("sends only what changed of its owner, amounts and days, a figure written another way being no change", () => {
    const was = { ...cargo, ownerUserId: "u1", ownerName: "a@cto.cz", claimAmount: "1200.50", claimCurrency: "EUR", settledAmount: "800.00", settledCurrency: "EUR" };
    expect(claimChanges(was, { ownerUserId: "u1", claimAmount: "1,200.5", settledAmount: "800", settledCurrency: "EUR", insurerNotifiedOn: "" })).toEqual({});
    expect(claimChanges(was, { ownerUserId: "", settledAmount: "750", insurerNotifiedOn: "2026-11-19", status: "with_insurer" })).toEqual({
      ownerUserId: "",
      settledAmount: "750",
      insurerNotifiedOn: "2026-11-19",
      status: "with_insurer",
    });
  });

  it("when new, leaves an empty owner out (whoever adds it then owns it) and is not filled in by it", () => {
    expect(claimChanges(undefined, { note: "Wet", ownerUserId: "" })).toEqual({ note: "Wet" });
    expect(claimChanges(undefined, { note: "Wet", ownerUserId: "u2" })).toEqual({ note: "Wet", ownerUserId: "u2" });
    expect(claimFilled({ cargoState: "", note: "", ownerUserId: "", status: "open", claimAmount: "" })).toBe(false);
  });

  it("sends its settled figure and currency as the server takes them", () => {
    expect(claimSendable({ settledAmount: "1 000,5", settledCurrency: "czk " })).toEqual({ settledAmount: "1000.5", settledCurrency: "CZK" });
    expect(figureText("1000.5", "CZK")).toBe("1,000.50 CZK");
    expect(figureText(null, "CZK")).toBe("");
  });

  it("shows its deadlines only while the time limits are on, the notice one until the carrier is notified", () => {
    const dated = { ...cargo, deadlineFrom: "delivery" as const, noticeDeadline: "2026-11-20", suitDeadline: "2027-11-17" };
    expect(claimDeadlines(dated, false, "2026-11-19")).toEqual([]);
    expect(claimDeadlines(dated, true, "2026-11-19")).toEqual([
      { label: "Notify the carrier by", day: "20.11.2026", passed: false },
      { label: "Time bar for a suit", day: "17.11.2027", passed: false },
    ]);
    expect(claimDeadlines(dated, true, "2026-11-21")[0]).toEqual({ label: "Notify the carrier by", day: "20.11.2026", passed: true });
    expect(claimDeadlines({ ...dated, noticeDate: "2026-11-19" }, true, "2026-11-21").map((d) => d.label)).toEqual(["Time bar for a suit"]);
    // a closed claim has nothing due
    expect(claimDeadlines({ ...dated, isOpen: false }, true, "2026-11-19")).toEqual([]);
    // a claim on costs has no such deadlines
    expect(claimDeadlines({ ...dated, kind: "cost" }, true, "2026-11-19")).toEqual([]);
    expect(deadlineFromText("arrival")).toBe("from arrival");
    expect(deadlineFromText(null)).toBe("");
  });
});
