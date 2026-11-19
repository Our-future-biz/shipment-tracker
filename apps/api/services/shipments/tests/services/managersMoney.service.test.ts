import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ managersMoneyRows: vi.fn() }));
const claims = vi.hoisted(() => ({ openCostClaimsByShipmentIds: vi.fn() }));
const history = vi.hoisted(() => ({ latestByShipmentIds: vi.fn() }));
const holidays = vi.hoisted(() => ({ _internalHolidaysCzNational: vi.fn() }));
const customers = vi.hoisted(() => ({ _internalCustomerCreditFacts: vi.fn() }));
const fx = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
const invoicing = vi.hoisted(() => ({ _internalOperationsMoney: vi.fn(), _internalCreditOwedShipments: vi.fn() }));
const team = vi.hoisted(() => ({ cockpitUsers: vi.fn(), teamFacts: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ holidays, customers, fx, invoicing }));
// The cockpit's own readers are not asked by the Money tab: only its jobs, users and holidays are shared (cockpitJobsRead).
vi.mock("../../services/managersCockpitExtra.service", () => ({ extraSignals: vi.fn() }));
vi.mock("../../services/managersCockpitTeam.service", () => team);
vi.mock("../../services/cutoffDismissal.service", () => ({ cutoffDismissalsOf: vi.fn(), DISMISSALS_NOT_KNOWN: "dismissed cut-offs" }));
vi.mock("../../services/managersCockpitAudit.service", () => ({ managersAuditLine: vi.fn(), AUDIT_PARTS: { all: "the audit line" } }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: {} }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: {} }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: {} }));
vi.mock("../../services/claimTimeLimits.service", () => ({ claimTimeLimitsService: { of: vi.fn() } }));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: claims }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: history }));

import { COCKPIT_JOB_LIMIT, MONEY_ANSWER_KEPT_MINUTES, MONEY_INVOICED_JOB_LIMIT } from "../../lib/cockpitThresholds";
import type { InvoicingMoneyJob } from "../../lib/managersMoney";
import { REPORTS_NOT_KNOWN } from "../../services/managersCockpit.service";
import { MONEY_NOT_KNOWN, forgetMoneyAnswers, managersMoneyService } from "../../services/managersMoney.service";

// The reads of the Money tab, against stand-ins for the repositories and the other services:
// which jobs each part is asked about, what the answer says when a part fails, and how long an
// answer is kept. The rules themselves are tests/managersMoney.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const MANAGER = "u-manager";
const EVERYONE = { mode: "all", direction: "all", handledBy: null, reports: "all", userId: MANAGER } as const;
const USERS = [
  { id: "u1", email: "jan@firma.cz", reportsToUserId: MANAGER },
  { id: "u2", email: "eva@firma.cz", reportsToUserId: null },
  { id: MANAGER, email: "boss@firma.cz", reportsToUserId: null },
];

// A job as managersMoneyRows hands it over, as far as the Money tab reads it.
const row = (n: number, over = {}) => ({
  id: `id-${n}`,
  jobNumber: `CZFCL${String(n).padStart(8, "0")}`,
  customer: "ACME s.r.o.",
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booked [IMP]",
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  actualDeliveryDate: null,
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  houseBolRelease: "",
  warehouseReleasedDate: null,
  createdAt: new Date("2026-11-01T08:00:00Z"),
  updatedAt: new Date("2026-11-01T08:00:00Z"),
  invoicingStatus: "Not Invoiced",
  customerId: null as string | null,
  ...over,
});
/** The jobs the read hands over: each group up to the limit the statement is given for it, as the statement reads them. */
const givenJobs = (rows: ReturnType<typeof row>[]) =>
  shipments.managersMoneyRows.mockImplementation(async (_companyId: string, _since: string, limits: { active: number; invoiced: number }) => {
    const invoiced = (r: ReturnType<typeof row>) => r.invoicingStatus === "Invoiced";
    const read = [...rows.filter((r) => !invoiced(r)).slice(0, limits.active), ...rows.filter(invoiced).slice(0, limits.invoiced)];
    return read.map((r) => ({ ...r, customerId: customersOf[r.id] ?? r.customerId }));
  });
/** The customer each job is linked to. */
let customersOf: Record<string, string | null> = {};
const basics = (of: Record<string, string | null>) => {
  customersOf = of;
};
/** Costs Breakdown's totals as Invoicing answers them: a healthy job, or what a test says of it. */
const totals = (over: Partial<InvoicingMoneyJob["totals"]> = {}): InvoicingMoneyJob["totals"] => ({
  sellingCzk: 50_000,
  estimateCzk: 40_000,
  realCzk: 0,
  estimateOfRealCzk: 0,
  realOfEstimatedCzk: 0,
  costCzk: 40_000,
  profitCzk: 10_000,
  marginPct: 20,
  missingCurrencies: [],
  ratesNote: "",
  ...over,
});
const LOSS = totals({ sellingCzk: 10_000, estimateCzk: 14_210, costCzk: 14_210, profitCzk: -4210, marginPct: -42.1 });
const person = (handledBy: string, over = {}) => ({ handledBy, isUser: true, active: 1, notYetInvoiced: [], jobsAtLoss: 0, estimatesOpen: 0, supplierInvoicesWaiting: 0, costClaimsOpen: 0, ...over });
const money = (shipmentId: string, over: Partial<InvoicingMoneyJob> = {}): InvoicingMoneyJob => ({
  shipmentId,
  notYetInvoiced: [],
  untickedSelling: [],
  creditOwed: [],
  lateChargeSince: null,
  sellingLines: 2,
  costLines: 2,
  totals: totals(),
  invoicedOn: null,
  notRecharged: [],
  supplierInvoices: { toApprove: 0, waitingIds: [], refused: 0, lastRefusedOn: null, claimed: 0, approvedOverdue: 0, oldestWaitingSince: null, afterBilling: [] },
  estimatesOpen: { lines: 0, oldestSince: null, amounts: [] },
  ...over,
});
/** Invoicing answering every job asked about with nothing wrong - or with what a test says of one. */
const invoicingAnswers = (of: Record<string, Partial<InvoicingMoneyJob>> = {}) =>
  invoicing._internalOperationsMoney.mockImplementation(async ({ shipmentIds }: { shipmentIds: string[] }) => ({ jobs: shipmentIds.map((id) => money(id, of[id])), unreadable: [], notKnown: [], invoicesRead: true }));
/** The jobs' ids as each call to Invoicing asked about them, the last call's by default. */
const askedOfInvoicing = (call = -1): string[] => invoicing._internalOperationsMoney.mock.calls.at(call)![0].shipmentIds;

beforeEach(() => {
  vi.clearAllMocks();
  forgetMoneyAnswers();
  basics({});
  givenJobs([]);
  claims.openCostClaimsByShipmentIds.mockResolvedValue([]);
  history.latestByShipmentIds.mockResolvedValue([]);
  holidays._internalHolidaysCzNational.mockResolvedValue({ dates: [] });
  customers._internalCustomerCreditFacts.mockResolvedValue({ customers: [] });
  invoicing._internalCreditOwedShipments.mockResolvedValue({ shipmentIds: [] });
  fx.fxRatesOn.mockResolvedValue({ date: "2026-11-18", fixingDate: "2026-11-18", rates: [{ currency: "EUR", rate: 25 }] });
  invoicingAnswers();
  team.cockpitUsers.mockResolvedValue(USERS);
});

describe("the Money tab's reads", () => {
  it("reads the cockpit's own jobs, and asks every part about the jobs it kept", async () => {
    givenJobs([row(1, { status: "Billing [IMP]", estimatedArrival: "2026-11-05", actualArrival: "2026-11-06" }), row(2), row(3, { status: "Billing [EXP]", tradeDirection: "Export", estimatedDeparture: "2026-11-02" })]);
    basics({ "id-1": "c-1", "id-2": "c-1", "id-3": "c-2" });
    invoicingAnswers({ "id-1": { notYetInvoiced: [{ currency: "CZK", amount: 100 }] }, "id-3": { notYetInvoiced: [{ currency: "CZK", amount: 250 }], invoicedOn: "2026-11-03" } });
    customers._internalCustomerCreditFacts.mockResolvedValue({ customers: ["c-1", "c-2"].map((customerId) => ({ customerId, creditLimit: 0, currency: "CZK", unpaid: [{ currency: "EUR", amount: 5 }], overdueCount: 0, oldestOverdueDue: null })) });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // One statement for the active jobs and those invoiced within the last 90 days, each up to its own limit: one more of each than is kept.
    expect(shipments.managersMoneyRows).toHaveBeenCalledTimes(1);
    // Besides them the jobs owing a credit, by id: none here.
    expect(shipments.managersMoneyRows).toHaveBeenCalledWith(COMPANY, "2026-08-20", { active: COCKPIT_JOB_LIMIT + 1, invoiced: MONEY_INVOICED_JOB_LIMIT + 1 }, []);
    const ids = ["id-1", "id-2", "id-3"];
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledTimes(1);
    // With each job's dates: Invoicing values a job whose rates are not fixed by them, and fixes nothing.
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledWith({
      shipmentIds: ids,
      jobDates: [
        { shipmentId: "id-1", tradeDirection: "Import", estimatedArrival: "2026-11-05", estimatedDeparture: null, actualArrival: "2026-11-06", actualDeparture: null },
        { shipmentId: "id-2", tradeDirection: "Import", estimatedArrival: null, estimatedDeparture: null, actualArrival: null, actualDeparture: null },
        { shipmentId: "id-3", tradeDirection: "Export", estimatedArrival: null, estimatedDeparture: "2026-11-02", actualArrival: null, actualDeparture: null },
      ],
    });
    expect(claims.openCostClaimsByShipmentIds).toHaveBeenCalledWith(COMPANY, ids);
    // The history is asked for the status of the jobs in Billing only.
    expect(history.latestByShipmentIds).toHaveBeenCalledWith(COMPANY, [{ fields: ["status"], shipmentIds: ["id-1", "id-3"] }]);
    // Each customer once; nobody owes in another currency than its limit's, so no rates are asked for.
    expect(customers._internalCustomerCreditFacts).toHaveBeenCalledTimes(1);
    expect(customers._internalCustomerCreditFacts).toHaveBeenCalledWith({ customerIds: ["c-1", "c-2"] });
    expect(fx.fxRatesOn).not.toHaveBeenCalled();
    expect(m).toMatchObject({ asOf: NOW.toISOString(), today: "2026-11-18", capped: false, holidaysKnown: true, notKnown: [] });
    // Both jobs in Billing have stood there since their creation on 1 Nov with work left to bill - the one with an open invoice too.
    expect(m.attention.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
      ["CZFCL00000001", ["In Billing since 01.11., 100.00 CZK not invoiced · with Invoicing"]],
      ["CZFCL00000003", ["In Billing since 01.11., 250.00 CZK not invoiced · with Invoicing"]],
    ]);
    expect(m.tiles.signalsNotKnown).toEqual([]);
  });

  it("asks only about the jobs of the mode, the direction and My reports - the Handled By filter narrows nothing that is read", async () => {
    givenJobs([row(1), row(2, { freightMode: "Air Freight", personInCharge: "eva@firma.cz" }), row(3, { freightMode: "Air Freight", tradeDirection: "Export" })]);
    await managersMoneyService.money(COMPANY, { ...EVERYONE, mode: "air" }, NOW);
    expect(askedOfInvoicing()).toEqual(["id-2", "id-3"]);
    await managersMoneyService.money(COMPANY, { ...EVERYONE, mode: "air", direction: "export" }, NOW);
    expect(askedOfInvoicing()).toEqual(["id-3"]);
    expect(claims.openCostClaimsByShipmentIds).toHaveBeenLastCalledWith(COMPANY, ["id-3"]);
    // Jan reports to the manager; Eva does not.
    await managersMoneyService.money(COMPANY, { ...EVERYONE, reports: "mine" }, NOW);
    expect(askedOfInvoicing()).toEqual(["id-1", "id-3"]);
    const eva = await managersMoneyService.money(COMPANY, { ...EVERYONE, handledBy: "eva@firma.cz" }, NOW);
    expect(askedOfInvoicing()).toEqual(["id-1", "id-2", "id-3"]);
    expect(eva.people.map((p) => p.handledBy)).toEqual(["jan@firma.cz", "eva@firma.cz"]);
  });

  it("says capped when the company has more active jobs than are read, and asks nobody about the one left out", async () => {
    givenJobs(Array.from({ length: COCKPIT_JOB_LIMIT + 1 }, (_, i) => row(i)));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.capped).toBe(true);
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledTimes(1);
    expect(askedOfInvoicing()).toHaveLength(COCKPIT_JOB_LIMIT);
  });

  it("reads nothing more for a company with no job", async () => {
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(invoicing._internalOperationsMoney).not.toHaveBeenCalled();
    expect(customers._internalCustomerCreditFacts).not.toHaveBeenCalled();
    expect(m).toMatchObject({ tiles: { notYetInvoiced: [], notYetInvoicedJobs: 0, marginNotKnown: 0 }, people: [], notKnown: [] });
  });

  it("puts together what Invoicing, the customers, the claims and the history say of a job", async () => {
    givenJobs([row(1, { status: "Billing [IMP]", actualArrival: "2026-11-15" })]);
    basics({ "id-1": "c-1" });
    invoicingAnswers({ "id-1": { notYetInvoiced: [{ currency: "EUR", amount: 1450 }], totals: LOSS } });
    customers._internalCustomerCreditFacts.mockResolvedValue({ customers: [{ customerId: "c-1", creditLimit: 100_000, currency: "CZK", unpaid: [{ currency: "CZK", amount: 150_000 }], overdueCount: 2, oldestOverdueDue: "2026-10-01" }] });
    claims.openCostClaimsByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", createdAt: new Date("2026-10-01T08:00:00Z"), claimAmount: "240.00", claimCurrency: "EUR", supplierInvoiceId: null, supplier: "", invoiceNumber: "", reason: "", amount: "", note: "" }]);
    history.latestByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", field: "status", newValue: "Billing [IMP]", changedAt: new Date("2026-11-12T08:00:00Z") }]);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.urgent.rows.map((r) => r.tags)).toEqual([
      [
        { text: "Customer over limit", urgent: true, kind: "credit" },
        { text: "Customer has overdue invoices · 2", urgent: true, kind: "credit" },
        { text: "Loss −4,210 CZK", urgent: true, kind: "margin" },
        { text: "In Billing since 12.11., 1,450.00 EUR not invoiced · with Invoicing", urgent: false, kind: "not_invoiced" },
        { text: "Cost claim open since 01.10. · 240.00 EUR", urgent: false, kind: "cost_claim" },
      ],
    ]);
    // The one CZK total: 1,450 EUR at today's 25.
    expect(m.tiles).toMatchObject({ notYetInvoiced: [{ currency: "EUR", amount: 1450 }], notYetInvoicedCzk: { amount: 36_250, label: "at the latest ČNB rate (18.11.)" }, notYetInvoicedJobs: 1 });
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(1);
    expect(m.people).toEqual([person("jan@firma.cz", { notYetInvoiced: [{ currency: "EUR", amount: 1450 }], jobsAtLoss: 1, costClaimsOpen: 1 })]);
  });

  it("asks for today's ČNB rates only when a customer owes in another currency than its limit's", async () => {
    givenJobs([row(1)]);
    basics({ "id-1": "c-1" });
    customers._internalCustomerCreditFacts.mockResolvedValue({ customers: [{ customerId: "c-1", creditLimit: 100_000, currency: "CZK", unpaid: [{ currency: "EUR", amount: 5000 }], overdueCount: 0, oldestOverdueDue: null }] });
    fx.fxRatesOn.mockResolvedValue({ rates: [{ currency: "EUR", rate: 25 }, { currency: "XXX", rate: 0 }] });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(1);
    expect(fx.fxRatesOn).toHaveBeenCalledWith({});
    expect(m.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Customer over limit"]]);
    expect(m.notKnown).toEqual([]);
  });
});

describe("the one CZK total of the work not yet invoiced", () => {
  const unbilled = (amounts: { currency: string; amount: number }[]) => invoicingAnswers({ "id-1": { notYetInvoiced: amounts } });

  it("is converted at the latest ČNB sheet - read once, and only when something stands in another currency - and labelled with the day of its fixing", async () => {
    givenJobs([row(1)]);
    unbilled([{ currency: "CZK", amount: 500 }]);
    const inCzk = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // All in CZK: no rate is needed, none is asked for - and none is named: the label is "".
    expect(fx.fxRatesOn).not.toHaveBeenCalled();
    expect(inCzk.tiles.notYetInvoicedCzk).toEqual({ amount: 500, label: "" });

    unbilled([{ currency: "CZK", amount: 500 }, { currency: "EUR", amount: 100 }]);
    // Saturday's sheet holds Friday's fixing: the label says which day the rate is of.
    fx.fxRatesOn.mockResolvedValue({ date: "2026-11-18", fixingDate: "2026-11-16", rates: [{ currency: "EUR", rate: 25 }] });
    const mixed = await managersMoneyService.money(COMPANY, EVERYONE, later(10));
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(1);
    expect(mixed.tiles.notYetInvoicedCzk).toEqual({ amount: 3000, label: "at the latest ČNB rate (16.11.)" });
    expect(mixed.tiles.notYetInvoiced).toEqual([{ currency: "CZK", amount: 500 }, { currency: "EUR", amount: 100 }]);
    expect(mixed.notKnown).toEqual([]);
  });

  it("says when the sheet's fixing is old - a newer one should be stored and is not (m20) - and converts an invoiced job's late charge too", async () => {
    givenJobs([row(1), row(2, { invoicingStatus: "Invoiced" })]);
    invoicingAnswers({ "id-1": { notYetInvoiced: [{ currency: "CZK", amount: 500 }] }, "id-2": { notYetInvoiced: [{ currency: "EUR", amount: 100 }] } });
    fx.fxRatesOn.mockResolvedValue({ date: "2026-11-18", fixingDate: "2026-11-16", missing: true, rates: [{ currency: "EUR", rate: 25 }] });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // Only the invoiced job has another currency than CZK: the sheet is asked for all the same.
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(1);
    expect(m.tiles.notYetInvoicedCzk).toEqual({ amount: 3000, label: "(ČNB rate of 16.11., newer not imported)" });
  });

  it("is none when a currency has no rate that day: the answer names the currency, the chips stand alone - and that answer is kept", async () => {
    givenJobs([row(1)]);
    unbilled([{ currency: "EUR", amount: 100 }, { currency: "BGN", amount: 7 }]);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.tiles.notYetInvoicedCzk).toBeNull();
    expect(m.tiles.notYetInvoiced).toEqual([{ currency: "BGN", amount: 7 }, { currency: "EUR", amount: 100 }]);
    expect(m.notKnown).toEqual(["the CZK total of work not yet invoiced: no ČNB rate for BGN"]);
    // ČNB publishing no rate for a currency is no failed read: asking again in a minute would change nothing.
    await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(shipments.managersMoneyRows).toHaveBeenCalledTimes(1);
  });

  it("is none when the sheet could not be read - the answer names the sheet, not a currency ČNB has no rate for - and that answer is not kept", async () => {
    givenJobs([row(1)]);
    unbilled([{ currency: "EUR", amount: 100 }]);
    fx.fxRatesOn.mockRejectedValueOnce(new Error("fx is down"));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.tiles.notYetInvoicedCzk).toBeNull();
    expect(m.tiles.notYetInvoiced).toEqual([{ currency: "EUR", amount: 100 }]);
    expect(m.notKnown).toEqual([MONEY_NOT_KNOWN.rates]);
    expect(MONEY_NOT_KNOWN.rates).toBe("today's ČNB rates");
    const again = await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(again.tiles.notYetInvoicedCzk).toEqual({ amount: 2500, label: "at the latest ČNB rate (18.11.)" });
    expect(shipments.managersMoneyRows).toHaveBeenCalledTimes(2);
  });
});

describe("the jobs that read Invoiced", () => {
  const INVOICED = { invoicingStatus: "Invoiced" };

  it("are read with the active ones and asked of Invoicing and the claims - never of the customers' credit or the history", async () => {
    givenJobs([row(1, { status: "Billing [IMP]", customerId: "c-1" }), row(2, { ...INVOICED, status: "Billing [IMP]", customerId: "c-2" })]);
    invoicingAnswers({
      "id-1": { notYetInvoiced: [{ currency: "CZK", amount: 100 }] },
      "id-2": { notYetInvoiced: [{ currency: "CZK", amount: 999 }], invoicedOn: "2026-11-10", totals: LOSS },
    });
    customers._internalCustomerCreditFacts.mockImplementation(async ({ customerIds }: { customerIds: string[] }) => ({
      customers: customerIds.map((customerId) => ({ customerId, creditLimit: 0, currency: "CZK", unpaid: [], overdueCount: 2, oldestOverdueDue: "2026-10-01" })),
    }));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(askedOfInvoicing()).toEqual(["id-1", "id-2"]);
    expect(claims.openCostClaimsByShipmentIds).toHaveBeenCalledWith(COMPANY, ["id-1", "id-2"]);
    expect(customers._internalCustomerCreditFacts).toHaveBeenCalledWith({ customerIds: ["c-1"] });
    expect(history.latestByShipmentIds).toHaveBeenCalledWith(COMPANY, [{ fields: ["status"], shipmentIds: ["id-1"] }]);
    // The invoiced job: its loss and its charge added after invoicing, nothing of credit or "In Billing". The active one: both.
    expect(m.urgent.rows.map((r) => [r.jobNumber, r.invoiced, r.tags.map((t) => t.text)])).toEqual([["CZFCL00000002", true, ["Loss −4,210 CZK", "Work not invoiced on a job that reads Invoiced · 999.00 CZK"]]]);
    expect(m.attention.rows.map((r) => [r.jobNumber, r.invoiced, r.tags.map((t) => t.text)])).toEqual([
      ["CZFCL00000001", false, ["In Billing since 01.11., 100.00 CZK not invoiced · with Invoicing", "Customer has overdue invoices · 2"]],
    ]);
    // Work not yet invoiced: the active job's, and the invoiced job's late charge.
    expect(m.tiles).toMatchObject({ notYetInvoiced: [{ currency: "CZK", amount: 1099 }], notYetInvoicedCzk: { amount: 1099, label: "" }, notYetInvoicedJobs: 2 });
    expect(m.people).toEqual([person("jan@firma.cz", { notYetInvoiced: [{ currency: "CZK", amount: 1099 }], jobsAtLoss: 1 })]);
    expect(m).toMatchObject({ capped: false, notKnown: [] });
  });

  it("reads the invoiced jobs owing a credit however long ago they were invoiced, past the limit too (M3)", async () => {
    const invoiced = (n: number) => Array.from({ length: n }, (_, i) => row(10_000 + i, INVOICED));
    const owedLongAgo = row(99, INVOICED);
    invoicing._internalCreditOwedShipments.mockResolvedValue({ shipmentIds: [owedLongAgo.id] });
    givenJobs([...invoiced(MONEY_INVOICED_JOB_LIMIT), owedLongAgo]);
    invoicingAnswers({ [owedLongAgo.id]: { creditOwed: [{ currency: "CZK", amount: 50 }] } });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // Asked for by id, beside the lately invoiced ones - and not left out for their limit, nor counted in it.
    expect(shipments.managersMoneyRows).toHaveBeenCalledWith(COMPANY, expect.any(String), expect.any(Object), [owedLongAgo.id]);
    expect(invoicing._internalOperationsMoney.mock.calls.flatMap((call) => call[0].shipmentIds)).toContain(owedLongAgo.id);
    expect(m.capped).toBe(false);
    expect(m.attention.rows.concat(m.urgent.rows).find((r) => r.jobNumber === owedLongAgo.jobNumber)?.tags.map((t) => t.text)).toEqual([
      expect.stringContaining("Credit owed"),
    ]);

    // Not known which jobs owe a credit: read as before, and said.
    forgetMoneyAnswers();
    vi.clearAllMocks();
    invoicing._internalCreditOwedShipments.mockRejectedValue(new Error("invoicing down"));
    givenJobs([row(1)]);
    invoicingAnswers();
    const without = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(shipments.managersMoneyRows).toHaveBeenCalledWith(COMPANY, expect.any(String), expect.any(Object), []);
    expect(without.notKnown).toContain(MONEY_NOT_KNOWN.creditOwed);
  });

  it("keeps two thousand active jobs and a thousand invoiced ones, and says capped when there were more of either", async () => {
    const active = (n: number) => Array.from({ length: n }, (_, i) => row(i));
    const invoiced = (n: number) => Array.from({ length: n }, (_, i) => row(10_000 + i, INVOICED));
    givenJobs([...active(3), ...invoiced(MONEY_INVOICED_JOB_LIMIT)]);
    const all = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(all.capped).toBe(false);
    expect(invoicing._internalOperationsMoney.mock.calls.flatMap((call) => call[0].shipmentIds)).toHaveLength(3 + MONEY_INVOICED_JOB_LIMIT);

    forgetMoneyAnswers();
    vi.clearAllMocks();
    givenJobs([...active(3), ...invoiced(MONEY_INVOICED_JOB_LIMIT + 1)]);
    expect((await managersMoneyService.money(COMPANY, EVERYONE, NOW)).capped).toBe(true);
    expect(invoicing._internalOperationsMoney.mock.calls.flatMap((call) => call[0].shipmentIds)).toHaveLength(3 + MONEY_INVOICED_JOB_LIMIT);

    forgetMoneyAnswers();
    vi.clearAllMocks();
    // More than two thousand ids: Invoicing is asked in calls of two thousand.
    givenJobs([...active(COCKPIT_JOB_LIMIT), ...invoiced(5)]);
    expect((await managersMoneyService.money(COMPANY, EVERYONE, NOW)).capped).toBe(false);
    expect(invoicing._internalOperationsMoney.mock.calls.map((call) => call[0].shipmentIds.length)).toEqual([COCKPIT_JOB_LIMIT, 5]);
  });

  it("still reads the invoiced jobs when the company has more active jobs than both limits together", async () => {
    // More than the 3,002 rows one shared limit would take: every one of them active, the invoiced ones after.
    const many = COCKPIT_JOB_LIMIT + MONEY_INVOICED_JOB_LIMIT + 10;
    givenJobs([...Array.from({ length: many }, (_, i) => row(i)), ...Array.from({ length: 3 }, (_, i) => row(10_000 + i, INVOICED))]);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // Capped for the active ones alone: the invoiced ones were read whole, so what the capped note says of them is true.
    expect(m.capped).toBe(true);
    const asked = invoicing._internalOperationsMoney.mock.calls.flatMap((call) => call[0].shipmentIds);
    expect(asked).toHaveLength(COCKPIT_JOB_LIMIT + 3);
    expect(asked.slice(-3)).toEqual(["id-10000", "id-10001", "id-10002"]);
  });

  it("asks Invoicing its calls one after the other: never two at once", async () => {
    givenJobs([...Array.from({ length: COCKPIT_JOB_LIMIT }, (_, i) => row(i)), ...Array.from({ length: 5 }, (_, i) => row(10_000 + i, INVOICED))]);
    let open = 0;
    let most = 0;
    invoicing._internalOperationsMoney.mockImplementation(async ({ shipmentIds }: { shipmentIds: string[] }) => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((done) => setTimeout(done, 1));
      open -= 1;
      return { jobs: shipmentIds.map((id) => money(id)), unreadable: [], notKnown: [], invoicesRead: true };
    });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
    expect(m.notKnown).toEqual([]);
  });
});

describe("what the Money tab says when a part could not be read", () => {
  it("names Invoicing and gives none of its figures or signals when its call fails - the rest still answers", async () => {
    givenJobs([row(1, { status: "Billing [IMP]" })]);
    invoicing._internalOperationsMoney.mockRejectedValue(new Error("invoicing is down"));
    claims.openCostClaimsByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", createdAt: new Date("2026-10-01T08:00:00Z"), claimAmount: "240.00", claimCurrency: "EUR", supplierInvoiceId: null, supplier: "", invoiceNumber: "", reason: "", amount: "", note: "" }]);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual([MONEY_NOT_KNOWN.invoicing]);
    expect(MONEY_NOT_KNOWN.invoicing).toBe("Invoicing: selling, costs and supplier invoices");
    expect(m.tiles).toMatchObject({ notYetInvoiced: null, notYetInvoicedCzk: null, notYetInvoicedJobs: null, marginNotKnown: null });
    expect(m.people[0]).toMatchObject({ notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: null, supplierInvoicesWaiting: null, costClaimsOpen: 1 });
    expect(m.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Cost claim open since 01.10. · 240.00 EUR"]]);
  });

  it("names Invoicing when its answer is unreadable", async () => {
    givenJobs([row(1)]);
    invoicing._internalOperationsMoney.mockResolvedValue({ items: [] });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual([MONEY_NOT_KNOWN.invoicing]);
    expect(m.tiles.notYetInvoiced).toBeNull();
  });

  it("hands through what Invoicing itself could not read, and names the jobs it did not answer", async () => {
    givenJobs([row(1), row(2), row(3)]);
    invoicing._internalOperationsMoney.mockResolvedValue({
      jobs: [
        money("id-1", { notYetInvoiced: [{ currency: "EUR", amount: 10 }], supplierInvoices: null }),
        money("id-2", { notYetInvoiced: [{ currency: "EUR", amount: 99 }], supplierInvoices: null }),
      ],
      unreadable: ["id-2"],
      notKnown: ["supplier invoices", "Invoicing: the jobs' rates"],
      invoicesRead: true,
    });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // Job 2 was named unreadable, job 3 not answered at all: neither is in a figure.
    expect(m.notKnown).toEqual(["Invoicing: supplier invoices", "Invoicing: the jobs' rates", "Invoicing: 2 jobs could not be read"]);
    expect(m.tiles).toMatchObject({ notYetInvoiced: [{ currency: "EUR", amount: 10 }], notYetInvoicedJobs: 1 });
    expect(m.people[0]).toMatchObject({ supplierInvoicesWaiting: null, estimatesOpen: 0 });
  });

  it("reads work as 'not invoiced' only when Invoicing says it read its customer invoices", async () => {
    givenJobs([row(1, { status: "Billing [IMP]" })]);
    const unbilled = money("id-1", { notYetInvoiced: [{ currency: "CZK", amount: 100 }], totals: LOSS });
    // The invoices could not be read: what Invoicing sends as "not yet invoiced" says nothing then.
    invoicing._internalOperationsMoney.mockResolvedValue({ jobs: [unbilled], unreadable: [], notKnown: ["customer invoices"], invoicesRead: false });
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual(["Invoicing: customer invoices"]);
    expect(m.attention.total).toBe(0);
    expect(m.tiles).toMatchObject({ notYetInvoiced: null, notYetInvoicedJobs: null, marginNotKnown: 0, signalsNotKnown: ["not_invoiced", "unticked", "cost_after_billing"] });
    // The loss does not hang on the invoices: the job is in Billing.
    expect(m.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Loss −4,210 CZK"]]);
    expect(m.people[0]).toMatchObject({ notYetInvoiced: null, jobsAtLoss: 1, estimatesOpen: 0, supplierInvoicesWaiting: 0 });
    // It goes by Invoicing's own word, not by what it names: another family missing leaves the invoices read.
    invoicing._internalOperationsMoney.mockResolvedValue({ jobs: [{ ...unbilled, estimatesOpen: null }], unreadable: [], notKnown: ["estimates with no supplier invoice"], invoicesRead: true });
    const known = await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(known.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Loss −4,210 CZK", "In Billing since 01.11., 100.00 CZK not invoiced · with Invoicing"]]);
    expect(known.people[0]).toMatchObject({ notYetInvoiced: [{ currency: "CZK", amount: 100 }], jobsAtLoss: 1, estimatesOpen: null });
    expect(known.tiles.signalsNotKnown).toEqual(["accrual"]);
    // An answer that does not say: not read.
    invoicing._internalOperationsMoney.mockResolvedValue({ jobs: [unbilled], unreadable: [], notKnown: [] });
    const silent = await managersMoneyService.money(COMPANY, EVERYONE, later(2));
    expect(silent.attention.total).toBe(0);
    expect(silent.tiles.notYetInvoiced).toBeNull();
  });

  it("names the customers' credit when the credit facts could not be read", async () => {
    givenJobs([row(1)]);
    basics({ "id-1": "c-1" });
    customers._internalCustomerCreditFacts.mockRejectedValue(new Error("customers is down"));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual([MONEY_NOT_KNOWN.credit]);
    expect(m.notKnown).toEqual(["customers' credit"]);
    // Invoicing's figures are untouched by it.
    expect(m.tiles).toMatchObject({ notYetInvoiced: [], notYetInvoicedJobs: 0 });
  });

  it("names today's ČNB rates when they could not be read - no limit is said to lack a rate, the overdue invoices are said all the same", async () => {
    givenJobs([row(1)]);
    basics({ "id-1": "c-1" });
    customers._internalCustomerCreditFacts.mockResolvedValue({ customers: [{ customerId: "c-1", creditLimit: 100_000, currency: "CZK", unpaid: [{ currency: "EUR", amount: 5000 }], overdueCount: 1, oldestOverdueDue: "2026-10-01" }] });
    fx.fxRatesOn.mockRejectedValue(new Error("fx is down"));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual(["today's ČNB rates"]);
    expect(m.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Customer has overdue invoices · 1"]]);
    // Not whole: the next ask reads again.
    await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(2);
  });

  it("names the cost claims, and since when a job is in Billing, each by itself", async () => {
    givenJobs([row(1, { status: "Billing [IMP]" })]);
    claims.openCostClaimsByShipmentIds.mockRejectedValue(new Error("no"));
    history.latestByShipmentIds.mockRejectedValue(new Error("no"));
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual(["cost claims", "since when a job is in Billing"]);
    expect(m.people[0]).toMatchObject({ costClaimsOpen: null, jobsAtLoss: 0 });
    // Without the history nobody can say since when: no tag, though the job is in Billing with no invoice.
    expect(m.attention.total).toBe(0);
  });

  it("says so when the holidays could not be read, and still answers", async () => {
    holidays._internalHolidaysCzNational.mockRejectedValue(new Error("the holidays service is down"));
    givenJobs([row(1)]);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m).toMatchObject({ holidaysKnown: false, notKnown: [] });
  });

  it("refuses My reports when the users could not be read, and fails as a whole without the jobs", async () => {
    team.cockpitUsers.mockResolvedValue(null);
    await expect(managersMoneyService.money(COMPANY, { ...EVERYONE, reports: "mine" }, NOW)).rejects.toMatchObject({ code: "unavailable", message: REPORTS_NOT_KNOWN });
    // Everybody's jobs need no users - but who is not a user is not known, and the answer says so.
    await expect(managersMoneyService.money(COMPANY, EVERYONE, NOW)).resolves.toMatchObject({ notKnown: [MONEY_NOT_KNOWN.users] });
    forgetMoneyAnswers();
    shipments.managersMoneyRows.mockRejectedValue(new Error("the database is down"));
    await expect(managersMoneyService.money(COMPANY, EVERYONE, NOW)).rejects.toThrow("the database is down");
  });

  it("marks nobody as not a user while the users could not be read, names them, and keeps no such answer", async () => {
    givenJobs([row(1), row(2, { personInCharge: "gone@firma.cz" })]);
    team.cockpitUsers.mockResolvedValueOnce(null);
    const m = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(m.notKnown).toEqual(["who in Handled By is not a user"]);
    expect(m.people.map((p) => [p.handledBy, p.isUser])).toEqual([
      ["gone@firma.cz", null],
      ["jan@firma.cz", null],
    ]);
    // Not whole: a minute on the users are asked again - and read, they say who is not a user.
    const again = await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(team.cockpitUsers).toHaveBeenCalledTimes(2);
    expect(again.notKnown).toEqual([]);
    expect(again.people.map((p) => [p.handledBy, p.isUser])).toEqual([
      ["gone@firma.cz", false],
      ["jan@firma.cz", true],
    ]);
  });
});

describe("how long a Money answer is kept", () => {
  const reads = () => shipments.managersMoneyRows.mock.calls.length;

  it("answers from memory for five minutes per company, mode, direction and reports: nothing is read, and the answer says when it was", async () => {
    givenJobs([row(1)]);
    const first = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    const again = await managersMoneyService.money(COMPANY, EVERYONE, later(MONEY_ANSWER_KEPT_MINUTES - 1));
    expect(again).toEqual(first);
    expect(again.asOf).toBe(NOW.toISOString());
    expect(reads()).toBe(1);
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledTimes(1);
    // Five minutes on it is read again.
    const fresh = await managersMoneyService.money(COMPANY, EVERYONE, later(MONEY_ANSWER_KEPT_MINUTES));
    expect(fresh.asOf).toBe(later(MONEY_ANSWER_KEPT_MINUTES).toISOString());
    expect(reads()).toBe(2);
  });

  it("reads nothing when a Handled By is picked: the facts are the same, and the filter is applied to them", async () => {
    givenJobs([row(1, { status: "Billing [IMP]" }), row(2, { status: "Billing [IMP]", personInCharge: "eva@firma.cz" })]);
    invoicingAnswers({ "id-1": { totals: LOSS, notYetInvoiced: [{ currency: "CZK", amount: 100 }] }, "id-2": { totals: LOSS, notYetInvoiced: [{ currency: "CZK", amount: 40 }] } });
    const everyone = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    const eva = await managersMoneyService.money(COMPANY, { ...EVERYONE, handledBy: " EVA@firma.cz " }, later(1));
    const nobody = await managersMoneyService.money(COMPANY, { ...EVERYONE, handledBy: "nobody", userId: "u-other" }, later(2));
    // One read for the three: the jobs, Invoicing, the claims - each once.
    expect(reads()).toBe(1);
    expect(invoicing._internalOperationsMoney).toHaveBeenCalledTimes(1);
    expect(claims.openCostClaimsByShipmentIds).toHaveBeenCalledTimes(1);
    expect(everyone).toMatchObject({ handledBy: null, urgent: { total: 2 }, tiles: { notYetInvoiced: [{ currency: "CZK", amount: 140 }], notYetInvoicedJobs: 2, signals: { margin: 2 } } });
    expect(eva).toMatchObject({ handledBy: "eva@firma.cz", urgent: { total: 1 }, tiles: { notYetInvoiced: [{ currency: "CZK", amount: 40 }], notYetInvoicedJobs: 1, signals: { margin: 1 } } });
    expect(eva.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000002"]);
    expect(nobody).toMatchObject({ handledBy: "nobody", urgent: { total: 0 }, tiles: { notYetInvoiced: [], notYetInvoicedJobs: 0 } });
    // The people line is the same whoever is picked, and every answer says when the facts were read.
    expect(eva.people).toEqual(everyone.people);
    expect(nobody.people).toEqual(everyone.people);
    expect([everyone.asOf, eva.asOf, nobody.asOf]).toEqual([NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
  });

  it("keeps the facts per mode, direction and company - and My reports per user", async () => {
    givenJobs([row(1)]);
    await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    await managersMoneyService.money(COMPANY, { ...EVERYONE, mode: "air" }, NOW);
    await managersMoneyService.money(COMPANY, { ...EVERYONE, direction: "import" }, NOW);
    await managersMoneyService.money("another-company", EVERYONE, NOW);
    expect(reads()).toBe(4);
    // The same scope by another manager: the same facts.
    await managersMoneyService.money(COMPANY, { ...EVERYONE, userId: "u-other" }, later(1));
    await managersMoneyService.money(COMPANY, { ...EVERYONE, mode: "air", handledBy: "jan@firma.cz", userId: "u-other" }, later(1));
    expect(reads()).toBe(4);
    // My reports is the caller's own.
    await managersMoneyService.money(COMPANY, { ...EVERYONE, reports: "mine" }, later(1));
    await managersMoneyService.money(COMPANY, { ...EVERYONE, reports: "mine", userId: "u-other" }, later(1));
    await managersMoneyService.money(COMPANY, { ...EVERYONE, reports: "mine", handledBy: "jan@firma.cz" }, later(2));
    expect(reads()).toBe(6);
  });

  it("does not keep an answer that lacks a part, nor one that failed: the next ask reads again", async () => {
    givenJobs([row(1)]);
    invoicing._internalOperationsMoney.mockRejectedValueOnce(new Error("invoicing is down"));
    const lacking = await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    expect(lacking.notKnown).toEqual([MONEY_NOT_KNOWN.invoicing]);
    const whole = await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    expect(whole.notKnown).toEqual([]);
    expect(reads()).toBe(2);
    // That one is whole, and kept.
    await managersMoneyService.money(COMPANY, EVERYONE, later(2));
    expect(reads()).toBe(2);

    forgetMoneyAnswers();
    shipments.managersMoneyRows.mockRejectedValueOnce(new Error("the database is down"));
    await expect(managersMoneyService.money(COMPANY, EVERYONE, later(3))).rejects.toThrow("the database is down");
    await expect(managersMoneyService.money(COMPANY, EVERYONE, later(3))).resolves.toMatchObject({ notKnown: [] });
  });

  it("does not keep an answer read without the holidays, or one in which Invoicing left a job out", async () => {
    givenJobs([row(1), row(2)]);
    holidays._internalHolidaysCzNational.mockRejectedValueOnce(new Error("the holidays service is down"));
    await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    invoicing._internalOperationsMoney.mockResolvedValueOnce({ jobs: [money("id-1")], unreadable: [], notKnown: [], invoicesRead: true });
    await managersMoneyService.money(COMPANY, EVERYONE, later(1));
    await managersMoneyService.money(COMPANY, EVERYONE, later(2));
    expect(reads()).toBe(3);
    await managersMoneyService.money(COMPANY, EVERYONE, later(3));
    expect(reads()).toBe(3);
  });

  it("shares one read between two asks at the same moment", async () => {
    givenJobs([row(1)]);
    const [a, b] = await Promise.all([managersMoneyService.money(COMPANY, EVERYONE, NOW), managersMoneyService.money(COMPANY, EVERYONE, NOW)]);
    expect(a).toEqual(b);
    expect(reads()).toBe(1);
  });
});

describe("how many reads a Money answer holds at once", () => {
  it("sends its statements and calls through one limiter: never more than five at a time", async () => {
    givenJobs([row(1, { status: "Billing [IMP]", customerId: "c-1" })]);
    let open = 0;
    let most = 0;
    const slow = <T>(value: T) => async (): Promise<T> => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((done) => setTimeout(done, 1));
      open -= 1;
      return value;
    };
    claims.openCostClaimsByShipmentIds.mockImplementation(slow([]));
    history.latestByShipmentIds.mockImplementation(slow([]));
    invoicing._internalOperationsMoney.mockImplementation(slow({ jobs: [money("id-1")], unreadable: [], notKnown: [], invoicesRead: true }));
    customers._internalCustomerCreditFacts.mockImplementation(slow({ customers: [] }));
    await managersMoneyService.money(COMPANY, EVERYONE, NOW);
    // The four parts start together, each a statement or a call of its own.
    expect(most).toBe(4);
    expect(customers._internalCustomerCreditFacts).toHaveBeenCalledTimes(1);
  });
});
