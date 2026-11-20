import { describe, expect, it } from "vitest";
import { EXPORT_TASKS } from "../[jobNumber]/_components/taskDefinitions";
import { BILLING_HINT, asksBillingRelease, billingGaps, isBillingStatus, type BillingReleaseFacts } from "./billingRelease";

// User Council O11, owner's answer Q9 (b): setting Shipment Status "Billing" warns - never blocks - with what the job
// still lacks, from facts the app already has.
describe("setting a job to Billing", () => {
  it("is asked about when the status becomes Billing on a job that was not", () => {
    expect(asksBillingRelease("status", "Billing [EXP]", "Booking Confirmation Pending [EXP]")).toBe(true);
    expect(asksBillingRelease("status", "Billing [IMP]", "")).toBe(true);
    expect(asksBillingRelease("status", "Billing [DOM]", null)).toBe(true);
  });

  it("asks nothing for another status, another field, or a job already in Billing", () => {
    expect(asksBillingRelease("status", "Billed [EXP]", "Billing [EXP]")).toBe(false);
    expect(asksBillingRelease("status", "Billing [EXP]", "Billing [EXP]")).toBe(false);
    expect(asksBillingRelease("status", "Pre-Alert Sent [EXP]", "Booking Confirmation Pending [EXP]")).toBe(false);
    expect(asksBillingRelease("freeComments", "Billing [EXP]", "")).toBe(false);
  });

  it("reads Billing in each direction, and nothing else", () => {
    for (const s of ["Billing [IMP]", " Billing [EXP] ", "Billing [DOM]"]) expect(isBillingStatus(s)).toBe(true);
    for (const s of ["Billed [IMP]", "Billing", "billing [IMP]", "", null, undefined]) expect(isBillingStatus(s)).toBe(false);
    expect(BILLING_HINT).toBe("Releases the job to Invoicing → To bill");
  });
});

describe("what the job still lacks", () => {
  // CZFCL00000057 as the tester released it: a departed-not export, nothing filled in - 0 of 13 tasks, 0 / 6 documents, no real costs.
  const bare: BillingReleaseFacts = {
    shipment: {
      tradeDirection: "Export",
      department: "Ocean Freight",
      freightMode: "Sea Freight",
      actualDeparture: null,
      actualArrival: null,
      actualDeliveryDate: null,
      houseBolNumber: "",
      masterBolNumber: "",
      documentTypes: [],
      dangerous: "No",
      cargoDimensions: [],
    },
    selling: [{ qty: "1", amount: "0" }],
    buying: [{ estQty: null, estAmount: "1500", realAmount: null, invoiceNumber: "" }],
    ticked: new Set(),
  };
  const exportTasks = EXPORT_TASKS.filter((t) => t.key !== "exp_billed").length;

  it("lists each gap, in the order a clerk looks", () => {
    expect(billingGaps(bare)).toEqual([
      "No selling charge with a value on the Costs tab",
      "1 buying line without a real cost or supplier invoice",
      "No ATD (the invoice's tax date)",
      "No B/L number",
      `${exportTasks} of ${exportTasks} tasks not ticked`,
      "Documents missing: Commercial Invoice, Packing list, Bill of Lading, Booking confirmation, Customs document, CMR / POD",
    ]);
  });

  it("is empty for a job that has it all", () => {
    expect(
      billingGaps({
        shipment: {
          ...bare.shipment,
          actualDeparture: "2026-11-20",
          masterBolNumber: "HLCUHAM123",
          documentTypes: ["Invoice", "Packing list", "Bill of Lading", "Booking confirmation", "Customs document", "CMR / POD"],
        },
        // A line of no value is no charge, but the freight is; blank quantity counts as 1.
        selling: [{ qty: "1", amount: "0" }, { qty: null, amount: "1900" }],
        // A real cost or the supplier's invoice number each settle an estimate; a line of no value asks nothing.
        buying: [
          { estQty: "1", estAmount: "1500", realAmount: "1480", invoiceNumber: "" },
          { estQty: "1", estAmount: "300", realAmount: null, invoiceNumber: "INV-7" },
          { estQty: "1", estAmount: "0", realAmount: null, invoiceNumber: "" },
        ],
        // Every task but the Billed one: that tick is the step being taken.
        ticked: new Set(EXPORT_TASKS.filter((t) => t.key !== "exp_billed").map((t) => t.key)),
      }),
    ).toEqual([]);
  });

  it("goes by the tax date of the job: an import's ATA, a Domestic or Road Department job's delivery", () => {
    const only = (shipment: Partial<BillingReleaseFacts["shipment"]>) =>
      billingGaps({ shipment: { ...bare.shipment, ...shipment }, selling: null, buying: null, ticked: null }).filter((g) => g.includes("tax date"));
    expect(only({ tradeDirection: "Import" })).toEqual(["No ATA (the invoice's tax date)"]);
    expect(only({ tradeDirection: "Import", actualArrival: "2026-11-20" })).toEqual([]);
    expect(only({ tradeDirection: "Domestic" })).toEqual(["No delivery date (the invoice's tax date)"]);
    expect(only({ department: "Road Department", actualDeparture: "2026-11-20" })).toEqual(["No delivery date (the invoice's tax date)"]);
    expect(only({ actualDeparture: "2026-11-20" })).toEqual([]);
  });

  it("asks a B/L number of a sea job only", () => {
    const bl = (freightMode: string, over: Partial<BillingReleaseFacts["shipment"]> = {}) =>
      billingGaps({ shipment: { ...bare.shipment, freightMode, ...over }, selling: null, buying: null, ticked: null }).includes("No B/L number");
    expect(bl("Sea Freight")).toBe(true);
    expect(bl("Sea Freight", { houseBolNumber: "CTO123" })).toBe(false);
    expect(bl("Air Freight")).toBe(false);
    expect(bl("Road Freight")).toBe(false);
  });

  it("says nothing of a part not read, and names a job with no buying line at all", () => {
    const gaps = billingGaps({ ...bare, selling: null, buying: [], ticked: null });
    expect(gaps).toContain("No buying cost on the Costs tab");
    expect(gaps.some((g) => g.includes("selling") || g.includes("tasks"))).toBe(false);
    expect(billingGaps({ ...bare, buying: null }).some((g) => g.includes("buying"))).toBe(false);
  });

  it("asks the safety paperwork of dangerous goods too", () => {
    const docs = billingGaps({ ...bare, shipment: { ...bare.shipment, dangerous: "Yes" } }).find((g) => g.startsWith("Documents missing"));
    expect(docs).toContain("MSDS");
  });
});
