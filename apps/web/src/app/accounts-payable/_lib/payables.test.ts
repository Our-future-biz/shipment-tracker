import { describe, expect, it } from "vitest";
import {
  actionsFor,
  apRow,
  arrivedOnUnbilledJob,
  claimJobs,
  claimStart,
  differsFromEstimate,
  expectedCheck,
  invoiceCheck,
  raiseClaimState,
  expectedCsv,
  expectedMatches,
  haulierChip,
  haulierRow,
  inTab,
  invoicesCsv,
  lineHref,
  matchesFilters,
  mergeRows,
  paidDayProblem,
  reasonOk,
  rowMarks,
  statusChip,
  supplierOptions,
  tabCount,
  type PayableExpected,
  type PayableHaulier,
  type PayableInvoice,
} from "./payables";
import type { interfaces } from "@/lib/api/client";

const invoice = (over: Partial<PayableInvoice> = {}): PayableInvoice => ({
  id: "inv-1",
  supplierCustomerId: "sup-1",
  haulierId: null,
  supplier: "MSC Czech s.r.o.",
  vendor: "MSC Czech",
  invoiceNumber: "FV-2026-0417",
  kind: "invoice",
  issueDate: "2026-11-03",
  due: "2026-11-17",
  dueSource: "invoice",
  daysOverdue: 0,
  bookedOn: "2026-11-03",
  paidNotBefore: "2026-11-03",
  amounts: [{ currency: "EUR", amount: 12500 }],
  totalNet: null,
  vatAmount: null,
  totalGross: null,
  currency: "EUR",
  status: "booked",
  paidOn: null,
  paidBy: "",
  decidedBy: "",
  decidedAt: null,
  decisionReason: "",
  selfDecision: false,
  source: "reading",
  enteredBy: "libor@example.com",
  document: null,
  lines: [],
  jobs: ["CZFCL00000023", "CZFCL00000030"],
  marks: [],
  claims: [],
  claimed: false,
  mine: false,
  aboveEstimate: false,
  jobBilled: false,
  arrivedAfterBilling: false,
  version: 3,
  ...over,
});

const haulier = (over: Partial<PayableHaulier> = {}): PayableHaulier => ({
  id: "h-1",
  haulierCustomerId: "hc-1",
  haulierName: "Haulier XY s.r.o.",
  invoiceNumber: "2611004",
  issueDate: "2026-11-05",
  dueDate: "2026-12-05",
  currency: "CZK",
  net: 25620,
  vat: 5380,
  gross: 31000,
  status: "APPROVED",
  paidOn: null,
  claimed: 0,
  refs: ["TCZ2026000022"],
  daysOverdue: 0,
  ...over,
});

const expected = (over: Partial<PayableExpected> = {}): PayableExpected => ({
  lineId: "l-1",
  shipmentId: "s-1",
  jobNumber: "CZFCL00000047",
  customer: "Škoda Auto",
  category: "ocean_freight",
  description: "40HC Hamburg",
  vendor: "Hapag-Lloyd",
  supplierCustomerId: null,
  estimate: 1800,
  currency: "USD",
  jobStatus: "In transit",
  createdOn: "2026-11-01",
  mine: true,
  jobBilled: false,
  ...over,
});

describe("tabs", () => {
  it("puts an approved, unpaid invoice in To pay, but not a credit note nor a paid one (D3)", () => {
    expect(inTab(apRow(invoice({ status: "approved" })), "to_pay")).toBe(true);
    expect(inTab(apRow(invoice({ status: "approved", kind: "credit_note" })), "to_pay")).toBe(false);
    expect(inTab(apRow(invoice({ status: "approved", paidOn: "2026-11-10" })), "to_pay")).toBe(false);
    expect(inTab(apRow(invoice({ status: "booked" })), "to_pay")).toBe(false);
  });

  it("lists by status, claim, overdue and paid", () => {
    expect(inTab(apRow(invoice()), "to_approve")).toBe(true);
    expect(inTab(apRow(invoice({ status: "refused" })), "refused")).toBe(true);
    expect(inTab(apRow(invoice({ claimed: true })), "claimed")).toBe(true);
    expect(inTab(apRow(invoice({ daysOverdue: 4 })), "overdue")).toBe(true);
    expect(inTab(apRow(invoice({ paidOn: "2026-11-10", status: "approved" })), "paid")).toBe(true);
    expect(inTab(apRow(invoice()), "expected")).toBe(false);
  });

  it("shows haulier invoices only in All, To pay, Overdue and Paid (D17)", () => {
    const h = haulierRow(haulier());
    expect(inTab(h, "all")).toBe(true);
    expect(inTab(h, "to_pay")).toBe(true);
    expect(inTab(h, "to_approve")).toBe(false);
    expect(inTab(h, "refused")).toBe(false);
    expect(inTab(h, "claimed")).toBe(false);
    expect(inTab(haulierRow(haulier({ status: "NEEDS_APPROVAL" })), "to_pay")).toBe(false);
    expect(inTab(haulierRow(haulier({ paidOn: "2026-11-12" })), "paid")).toBe(true);
    expect(inTab(haulierRow(haulier({ daysOverdue: 2 })), "overdue")).toBe(true);
  });

  it("counts the server's invoices and the haulier invoices a tab lists", () => {
    const counts = { all: 5, toPay: 2, overdue: 1, toApprove: 3, refused: 0, claimed: 1, paid: 1, expected: 9 };
    const hs = [haulier(), haulier({ id: "h-2", status: "REJECTED" })];
    expect(tabCount("all", counts, hs)).toBe(7);
    expect(tabCount("to_pay", counts, hs)).toBe(3);
    expect(tabCount("to_approve", counts, hs)).toBe(3);
    expect(tabCount("expected", counts, hs)).toBe(9);
  });

  it("places haulier invoices among the others by their issue day, newest first", () => {
    const rows = mergeRows([invoice({ id: "a", bookedOn: "2026-11-09" }), invoice({ id: "b", bookedOn: "2026-11-01" })], [haulier({ issueDate: "2026-11-05" })]);
    expect(rows.map((r) => r.key)).toEqual(["ap:a", "h:h-1", "ap:b"]);
  });
});

describe("status and marks", () => {
  it("says Booked, Approved, Refused, and Paid once the payment is noted (D3)", () => {
    expect(statusChip(invoice()).label).toBe("Booked");
    expect(statusChip(invoice({ status: "approved" })).label).toBe("Approved");
    expect(statusChip(invoice({ status: "refused" })).label).toBe("Refused");
    expect(statusChip(invoice({ status: "approved", paidOn: "2026-11-10" })).label).toBe("Paid");
  });

  it("keeps Trucking's own chip for a haulier invoice", () => {
    expect(haulierChip(haulier({ status: "NEEDS_APPROVAL" })).label).toBe("Needs approval");
    expect(haulierChip(haulier({ paidOn: "2026-11-12" })).label).toBe("Paid");
    expect(haulierChip(haulier({ status: "SOMETHING_NEW" })).label).toBe("SOMETHING_NEW");
  });

  it("names every mark in plain words, overdue and claimed first", () => {
    const marks = rowMarks(invoice({ daysOverdue: 1, claimed: true, marks: ["not_linked", "vat_unreliable"], aboveEstimate: true, jobBilled: true, selfDecision: true }));
    expect(marks.map((m) => m.label)).toEqual(["1 day overdue", "Claimed", "Not linked", "Unreliable VAT payer", "Above estimate", "Job billed", "Self-approval"]);
    expect(marks.every((m) => m.tip.length > 0)).toBe(true);
  });
});

describe("filters", () => {
  const f = { search: "", onlyMine: false, supplier: "" };

  it("searches the supplier, the number and the jobs, diacritics aside", () => {
    expect(matchesFilters(apRow(invoice()), { ...f, search: "fv-2026" })).toBe(true);
    expect(matchesFilters(apRow(invoice()), { ...f, search: "msc 00000030" })).toBe(true);
    expect(matchesFilters(apRow(invoice({ supplier: "Celní služby" })), { ...f, search: "celni" })).toBe(true);
    expect(matchesFilters(apRow(invoice()), { ...f, search: "hapag" })).toBe(false);
  });

  it("keeps only my jobs, leaving haulier invoices out (they name no Person in Charge here)", () => {
    expect(matchesFilters(apRow(invoice({ mine: true })), { ...f, onlyMine: true })).toBe(true);
    expect(matchesFilters(apRow(invoice()), { ...f, onlyMine: true })).toBe(false);
    expect(matchesFilters(haulierRow(haulier()), { ...f, onlyMine: true })).toBe(false);
  });

  it("tells suppliers apart by their Customer Database company, else by the name", () => {
    const rows = [apRow(invoice()), apRow(invoice({ id: "2", supplierCustomerId: null, supplier: "Vanguard" })), haulierRow(haulier())];
    const options = supplierOptions(rows, [expected()]);
    expect(options.map((o) => o.label)).toEqual(["Hapag-Lloyd", "Haulier XY s.r.o.", "MSC Czech s.r.o.", "Vanguard"]);
    const vanguard = options.find((o) => o.label === "Vanguard")!.value;
    expect(matchesFilters(rows[1]!, { ...f, supplier: vanguard })).toBe(true);
    expect(matchesFilters(rows[0]!, { ...f, supplier: vanguard })).toBe(false);
    const hapag = options.find((o) => o.label === "Hapag-Lloyd")!.value;
    expect(expectedMatches(expected(), { ...f, supplier: hapag })).toBe(true);
  });
});

const line = (over: Partial<interfaces.PayableLineItem> = {}): interfaces.PayableLineItem => ({
  lineId: "ln-1",
  kind: "job",
  shipmentId: "s-23",
  masterJobId: null,
  jobNumber: "CZFCL00000023",
  customer: "Škoda Auto",
  category: "ocean_freight",
  description: "",
  estimate: 4000,
  estCurrency: "EUR",
  amount: 4000,
  currency: "EUR",
  difference: 0,
  jobInvoicingStatus: "Not Invoiced",
  ...over,
});

describe("the operator's checks", () => {
  it("differs from estimate when a line's difference is not 0, never when none can be worked out", () => {
    expect(differsFromEstimate(invoice({ lines: [line({ difference: 200 })] }))).toBe(true);
    expect(differsFromEstimate(invoice({ lines: [line(), line({ lineId: "ln-2", difference: -0.5 })] }))).toBe(true);
    expect(differsFromEstimate(invoice({ lines: [line(), line({ lineId: "ln-2", difference: null })] }))).toBe(false);
    expect(differsFromEstimate(invoice({ lines: [line({ difference: 0.001 })] }))).toBe(false);
    expect(differsFromEstimate(invoice())).toBe(false);
  });

  it("arrived on a job not yet billed unless a job is billed or the invoice was refused", () => {
    expect(arrivedOnUnbilledJob(invoice())).toBe(true);
    expect(arrivedOnUnbilledJob(invoice({ jobBilled: true }))).toBe(false);
    expect(arrivedOnUnbilledJob(invoice({ status: "refused" }))).toBe(false);
  });

  it("takes arrived after billing from the server, and leaves haulier invoices out of every check", () => {
    expect(invoiceCheck(apRow(invoice({ arrivedAfterBilling: true })), "after_billing")).toBe(true);
    expect(invoiceCheck(apRow(invoice()), "after_billing")).toBe(false);
    expect(invoiceCheck(apRow(invoice()), "unbilled_job")).toBe(true);
    expect(invoiceCheck(apRow(invoice({ lines: [line({ difference: 5 })] })), "differs")).toBe(true);
    for (const c of ["differs", "unbilled_job", "after_billing"] as const) expect(invoiceCheck(haulierRow(haulier()), c)).toBe(false);
  });

  it("keeps an expected cost whose job is billed already", () => {
    expect(expectedCheck(expected({ jobBilled: true }), "job_billed")).toBe(true);
    expect(expectedCheck(expected(), "job_billed")).toBe(false);
  });
});

describe("raise a claim (D15)", () => {
  it("is offered on every invoice but a refused one, and needs a shipment to be raised on", () => {
    expect(raiseClaimState(invoice({ lines: [line()] }))).toEqual({ shown: true, blocked: "" });
    expect(raiseClaimState(invoice({ status: "approved", paidOn: "2026-11-10", lines: [line()] })).shown).toBe(true);
    expect(raiseClaimState(invoice({ status: "refused", lines: [line()] })).shown).toBe(false);
    const masterOnly = raiseClaimState(invoice({ lines: [line({ kind: "master_job", shipmentId: null, masterJobId: "m-1" })] }));
    expect(masterOnly.shown).toBe(true);
    expect(masterOnly.blocked).not.toBe("");
  });

  it("lists the shipments of its job lines once each, in line order", () => {
    const lines = [
      line({ lineId: "a", shipmentId: "s-30", jobNumber: "CZFCL00000030" }),
      line({ lineId: "b" }),
      line({ lineId: "c", shipmentId: "s-30", jobNumber: "CZFCL00000030" }),
      line({ lineId: "d", kind: "master_job", shipmentId: null, masterJobId: "m-1", jobNumber: "MCZ00000006" }),
    ];
    expect(claimJobs(invoice({ lines }))).toEqual([
      { shipmentId: "s-30", jobNumber: "CZFCL00000030" },
      { shipmentId: "s-23", jobNumber: "CZFCL00000023" },
    ]);
  });

  it("starts the claim on the invoice, with the supplier as the lines name it, its number and currency", () => {
    const start = claimStart(invoice());
    expect(start.values).toEqual({ supplierInvoiceId: "inv-1", supplier: "MSC Czech", invoiceNumber: "FV-2026-0417", claimCurrency: "EUR" });
    expect(start.option).toEqual({ value: "inv-1", label: "MSC Czech · FV-2026-0417", vendor: "MSC Czech", invoiceNumber: "FV-2026-0417", currency: "EUR" });
    expect(claimStart(invoice({ vendor: "", currency: "", amounts: [{ currency: "USD", amount: 5 }] })).values).toMatchObject({ supplier: "MSC Czech s.r.o.", claimCurrency: "USD" });
  });
});

describe("actions", () => {
  it("offers nothing but the details to someone who is not a manager (D5)", () => {
    const a = actionsFor(invoice(), false);
    expect(Object.entries(a).filter(([, s]) => s.shown).map(([k]) => k)).toEqual(["editDetails"]);
    expect(actionsFor(invoice({ status: "approved" }), false).editDetails.shown).toBe(false);
  });

  it("lets a manager approve a linked booked invoice, refuse it and link its supplier", () => {
    const a = actionsFor(invoice(), true);
    expect(a.approve).toEqual({ shown: true, blocked: "" });
    expect(a.refuse.shown).toBe(true);
    expect(a.linkSupplier.shown).toBe(true);
    expect(a.markPaid.shown).toBe(false);
  });

  it("holds the approval of an invoice not linked, or failing the VAT register (D13, D14)", () => {
    expect(actionsFor(invoice({ supplierCustomerId: null, marks: ["not_linked"] }), true).approve.blocked).toMatch(/Link the supplier first/);
    expect(actionsFor(invoice({ marks: ["account_not_published"] }), true).approve.blocked).toMatch(/not published/);
  });

  it("pays only an approved, unpaid invoice with no open claim (D11, D15)", () => {
    expect(actionsFor(invoice({ status: "approved" }), true).markPaid).toEqual({ shown: true, blocked: "" });
    expect(actionsFor(invoice({ status: "approved", claimed: true }), true).markPaid.blocked).toMatch(/claim/);
    const paid = actionsFor(invoice({ status: "approved", paidOn: "2026-11-10" }), true);
    expect(paid.markPaid.shown).toBe(false);
    expect(paid.takeBackPayment.shown).toBe(true);
    expect(paid.takeBackApproval.shown).toBe(false);
    expect(paid.refuse.shown).toBe(false);
    expect(paid.editDetails.shown).toBe(false);
  });

  it("leaves a refused invoice as it was", () => {
    const a = actionsFor(invoice({ status: "refused" }), true);
    expect(Object.values(a).some((s) => s.shown)).toBe(false);
  });

  it("asks a reason of three characters at least, and a paid day between booking and today", () => {
    expect(reasonOk("  no ")).toBe(false);
    expect(reasonOk("Wrong rate")).toBe(true);
    const received = invoice({ bookedOn: "2026-11-03", paidNotBefore: "2026-11-03" });
    expect(paidDayProblem("2026-11-18", "2026-11-17", received)).toMatch(/after today/);
    expect(paidDayProblem("2026-11-01", "2026-11-17", received)).toMatch(/before it was booked/);
    expect(paidDayProblem("2026-11-17", "2026-11-17", received)).toBe("");
    // Never stamped received (a master job's, gathered from older lines): any past day, as the server allows.
    // It goes by the received day the server checks, not by the booked day shown.
    expect(paidDayProblem("2025-01-10", "2026-11-17", invoice({ bookedOn: "2026-11-03", paidNotBefore: null }))).toBe("");
  });
});

describe("CSV (D20)", () => {
  it("writes one line per invoice and currency, and haulier invoices with VAT", () => {
    const rows = invoicesCsv([apRow(invoice({ amounts: [{ currency: "EUR", amount: 100 }, { currency: "USD", amount: -5 }] })), haulierRow(haulier())]);
    expect(rows[0]![0]).toBe("Source");
    expect(rows).toHaveLength(4);
    expect(rows[1]!.slice(10, 13)).toEqual(["100.00", "EUR", "without VAT"]);
    expect(rows[2]!.slice(10, 12)).toEqual(["-5.00", "USD"]);
    expect(rows[3]![0]).toBe("Trucking");
    expect(rows[3]!.slice(10, 13)).toEqual(["31000.00", "CZK", "with VAT"]);
  });

  it("writes the expected costs one line each, the charge by its name", () => {
    expect(expectedCsv([expected()])).toEqual([
      ["Job", "Customer", "Charge", "Description", "Vendor", "Estimate", "Currency", "Job status", "Created on"],
      ["CZFCL00000047", "Škoda Auto", "Ocean freight (OF / BAS)", "40HC Hamburg", "Hapag-Lloyd", "1800.00", "USD", "In transit", "2026-11-01"],
    ]);
  });
});

describe("links", () => {
  it("opens a shipment's line on its Costs Breakdown and a master job's on the master jobs page", () => {
    expect(lineHref({ kind: "job", shipmentId: "s-1", masterJobId: null })).toBe("/shipments/s-1?tab=costs");
    expect(lineHref({ kind: "master_job", shipmentId: null, masterJobId: "m-1" })).toBe("/master-jobs?open=m-1");
  });
});
