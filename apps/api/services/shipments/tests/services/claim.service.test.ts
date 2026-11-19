import { beforeEach, describe, expect, it, vi } from "vitest";

// A shipment's claims (Council Outlay 11, D20, D21). They are changed only while the shipment is
// live, by its Handled By, Holiday Cover or a manager, and deleted by a manager; a claim on costs is
// tied to a supplier invoice, with an amount, a currency and a status Accounts Payable reads; a cargo
// claim has its own life, an owner and amounts. Creation, status and owner changes, deletion and the
// job's Claim field go into the job's history in the claim's own turn. Run against stand-ins for the
// repositories, the shipments service, the time limits and the auth service's look-ups.
const claims = vi.hoisted(() => ({
  updateClaim: vi.fn(),
  deleteClaim: vi.fn(),
  syncShipmentFlag: vi.fn(),
  insertClaim: vi.fn(),
  listByShipmentId: vi.fn(),
  findClaim: vi.fn(),
  listCostClaims: vi.fn(),
  inTransaction: vi.fn(),
}));
const jobs = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const history = vi.hoisted(() => ({ create: vi.fn() }));
const shipments = vi.hoisted(() => ({ mayChangeDetails: vi.fn() }));
const limits = vi.hoisted(() => ({ of: vi.fn() }));
const lookup = vi.hoisted(() => ({ userEmailOf: vi.fn(), companyUsers: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: claims }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: jobs }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: history }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));
vi.mock("../../services/claimTimeLimits.service", () => ({ claimTimeLimitsService: limits }));
vi.mock("../../../../lib/companyUsers", () => lookup);

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { GENERAL_PRACTICE, TIME_LIMITS_OFF } from "../../lib/claimTimeLimits";
import { CLAIM_DELETE_REFUSAL, CLAIM_EDIT_REFUSAL, CARGO_ONLY_REFUSAL, COST_ONLY_REFUSAL, OWNER_NOT_A_USER, claimService } from "../../services/claim.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const CLAIM = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const INVOICE = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const USER = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c04";
const JAN = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c06";
const TX = { tx: true };
const operator = { userID: USER, companyID: "c1", role: "user" };
const manager = { ...operator, role: "manager" };
const job = { id: SHIPMENT, companyId: "c1", personInCharge: "eva@firma.cz", holidayCover: "", tradeDirection: "Import", freightMode: "Sea Freight", department: "", actualDeliveryDate: "2026-11-10", actualArrival: "2026-11-08" };
const claim = {
  id: CLAIM,
  shipmentId: SHIPMENT,
  kind: "cargo",
  cargoState: "Damaged",
  note: "",
  supplier: "",
  invoiceNumber: "",
  reason: "",
  amount: "",
  noticeDate: null,
  createdAt: new Date("2026-11-06T09:00:00Z"),
  supplierInvoiceId: null,
  claimAmount: null,
  claimCurrency: "",
  status: "open",
  closedAt: null,
  closedBy: "",
  ownerUserId: USER,
  ownerName: "eva@firma.cz",
  insurerNotifiedOn: null,
  settledAmount: null,
  settledCurrency: "",
};
const ownedByJan = { ...claim, id: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c07", ownerUserId: JAN, ownerName: "jan@firma.cz" };
const costClaim = { ...claim, kind: "cost", cargoState: "", supplier: "Rail Cargo", invoiceNumber: "F-77", reason: "Double charge", amount: "120,50 EUR", ownerUserId: null, ownerName: "" };

const written = () => claims.updateClaim.mock.calls.at(-1)![3];
const created = () => claims.insertClaim.mock.calls.at(-1)![1];
const lines = () => history.create.mock.calls.map(([entry]) => entry);

beforeEach(() => {
  vi.clearAllMocks();
  jobs.getByIdForCompany.mockResolvedValue(job);
  shipments.mayChangeDetails.mockResolvedValue(true);
  limits.of.mockResolvedValue(TIME_LIMITS_OFF);
  claims.inTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work(TX));
  claims.findClaim.mockResolvedValue(claim);
  // The claim as it was last read, with the change.
  claims.updateClaim.mockImplementation(async (_id: string, _s: string, _c: string, data: object) => ({ ...(await claims.findClaim.mock.results.at(-1)!.value), ...data }));
  claims.insertClaim.mockImplementation(async (_company: string, row: object) => ({ ...claim, status: "open", ...row }));
  claims.deleteClaim.mockResolvedValue(claim);
  claims.syncShipmentFlag.mockResolvedValue({ before: "Yes", after: "Yes" });
  claims.listByShipmentId.mockResolvedValue([claim, costClaim]);
  claims.listCostClaims.mockResolvedValue([]);
  lookup.userEmailOf.mockResolvedValue("eva@firma.cz");
  lookup.companyUsers.mockResolvedValue([{ id: JAN, email: "jan@firma.cz", displayName: "Jan" }]);
});

describe("who may", () => {
  it("add and change a claim: the job's people or a manager, as its details; nothing is written otherwise", async () => {
    shipments.mayChangeDetails.mockResolvedValue(false);
    // Somebody else's claim: its owner's door (below) is not this user's.
    claims.findClaim.mockResolvedValue(ownedByJan);
    await expect(claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Damaged" })).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_EDIT_REFUSAL });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet" })).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_EDIT_REFUSAL });
    expect(shipments.mayChangeDetails).toHaveBeenCalledWith(job, USER, "user");
    expect(claims.insertClaim).not.toHaveBeenCalled();
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(history.create).not.toHaveBeenCalled();
  });

  it("add and change a claim on costs: anyone of the company (D15, Accounts Payable's \"Raise claim\") - the stored claim's kind decides", async () => {
    shipments.mayChangeDetails.mockResolvedValue(false);
    claims.findClaim.mockResolvedValue(costClaim);
    await expect(claimService.create(operator, SHIPMENT, "cost", { supplier: "Rail Cargo", claimAmount: "80" })).resolves.toMatchObject({ kind: "cost" });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { reason: "Double charge", status: "withdrawn" })).resolves.toMatchObject({ status: "withdrawn" });
    expect(shipments.mayChangeDetails).not.toHaveBeenCalled();
    // A cargo claim on the same job stays the job's people's (and its owner's).
    claims.findClaim.mockResolvedValue(ownedByJan);
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet" })).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_EDIT_REFUSAL });
  });

  it("change a cargo claim: also its named owner, who need not be on the job - that one claim only; adding and deleting stay closed (K23)", async () => {
    shipments.mayChangeDetails.mockResolvedValue(false);
    // The claim is the operator's own (the fixture's owner is USER).
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet", status: "notified", noticeDate: "2026-11-11" })).resolves.toMatchObject({ status: "notified" });
    expect(written()).toMatchObject({ note: "Wet", status: "notified" });
    // Its owner as stored decides: named in any case.
    claims.findClaim.mockResolvedValue({ ...claim, ownerUserId: USER.toUpperCase() });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Dry" })).resolves.toBeTruthy();
    // Not a new claim, and not a delete.
    await expect(claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Damaged" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(claimService.delete(operator, SHIPMENT, CLAIM)).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_DELETE_REFUSAL });
    // A claim nobody owns is nobody's door.
    claims.findClaim.mockResolvedValue({ ...claim, ownerUserId: null, ownerName: "" });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet" })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("are told on the list: the claims the user owns, where they are not on the job", async () => {
    shipments.mayChangeDetails.mockResolvedValue(false);
    claims.listByShipmentId.mockResolvedValue([claim, ownedByJan, costClaim]);
    await expect(claimService.list(operator, SHIPMENT)).resolves.toMatchObject({ mayEdit: false, ownedClaimIds: [CLAIM] });
    // Whoever may change all of them is given none apart.
    shipments.mayChangeDetails.mockResolvedValue(true);
    await expect(claimService.list(operator, SHIPMENT)).resolves.toMatchObject({ mayEdit: true, ownedClaimIds: [] });
  });

  it("delete a claim on costs too: a manager only", async () => {
    claims.deleteClaim.mockResolvedValue(costClaim);
    await expect(claimService.delete(operator, SHIPMENT, CLAIM)).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_DELETE_REFUSAL });
    await claimService.delete(manager, SHIPMENT, CLAIM);
    expect(lines()[0]).toMatchObject({ field: "claimDeleted", oldValue: "Claim on costs (Rail Cargo, F-77) · 120,50 EUR · Open · Double charge" });
  });

  it("delete one: a manager only, asked before anything is read", async () => {
    await expect(claimService.delete(operator, SHIPMENT, CLAIM)).rejects.toMatchObject({ code: "permission_denied", message: CLAIM_DELETE_REFUSAL });
    expect(jobs.getByIdForCompany).not.toHaveBeenCalled();
    expect(claims.deleteClaim).not.toHaveBeenCalled();
  });

  it("is told on the list, with whether the time limits are on", async () => {
    shipments.mayChangeDetails.mockResolvedValue(false);
    await expect(claimService.list(operator, SHIPMENT)).resolves.toMatchObject({ mayEdit: false, mayEditCost: true, mayDelete: false, timeLimitsOn: false });
    shipments.mayChangeDetails.mockResolvedValue(true);
    await expect(claimService.list(manager, SHIPMENT)).resolves.toMatchObject({ mayEdit: true, mayDelete: true });
  });
});

describe("a claim", () => {
  it("of a deleted or unknown shipment is neither changed nor deleted, and nothing is written", async () => {
    jobs.getByIdForCompany.mockResolvedValue(null);
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet" })).rejects.toMatchObject({ code: "not_found" });
    await expect(claimService.delete(manager, SHIPMENT, CLAIM)).rejects.toMatchObject({ code: "not_found" });
    await expect(claimService.list(operator, "not-an-id")).rejects.toMatchObject({ code: "not_found" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(claims.deleteClaim).not.toHaveBeenCalled();
    expect(claims.syncShipmentFlag).not.toHaveBeenCalled();
  });

  it("keeps its free-text fields as sent, in one turn with the job's Claim field; no history line when neither status nor owner moved", async () => {
    await claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet", noticeDate: "" });
    expect(written()).toEqual({ note: "Wet", noticeDate: null });
    expect(claims.updateClaim.mock.calls.at(-1)![4]).toBe(TX);
    expect(claims.syncShipmentFlag).toHaveBeenCalledWith(SHIPMENT, "c1", TX);
    expect(history.create).not.toHaveBeenCalled();
  });

  it("deleted by a manager is kept in the job's history as what it was", async () => {
    await claimService.delete(manager, SHIPMENT, CLAIM);
    expect(lines()).toEqual([{ companyId: "c1", shipmentId: SHIPMENT, userId: USER, field: "claimDeleted", oldValue: "Cargo claim (Damaged) · Open", newValue: null }]);
    expect(history.create.mock.calls[0]![1]).toBe(TX);
  });

  it("added is in the job's history, and so is the job's Claim field turning", async () => {
    claims.syncShipmentFlag.mockResolvedValue({ before: "No", after: "Yes" });
    await claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Lost", claimAmount: "1200", claimCurrency: "eur" });
    expect(lines().map((l) => [l.field, l.oldValue, l.newValue])).toEqual([
      ["claimCreated", null, "Cargo claim (Lost) · 1200 EUR · Open"],
      ["claim", "No", "Yes"],
    ]);
  });

  it("deleted when it is not there is not found, and nothing is written", async () => {
    claims.deleteClaim.mockResolvedValue(null);
    await expect(claimService.delete(manager, SHIPMENT, CLAIM)).rejects.toMatchObject({ code: "not_found" });
    expect(history.create).not.toHaveBeenCalled();
  });

  it("saved answers no error when the time limits can't be read: read before its turn, the answer then has no deadlines", async () => {
    limits.of.mockRejectedValue(new Error("down"));
    await expect(claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Lost" })).resolves.toMatchObject({ cargoState: "Lost", noticeDeadline: null });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { note: "Wet" })).resolves.toMatchObject({ note: "Wet", noticeDeadline: null });
    // Read before the transaction, never after its commit.
    const [readFirst, readSecond] = limits.of.mock.invocationCallOrder;
    const [turnFirst, turnSecond] = claims.inTransaction.mock.invocationCallOrder;
    expect(readFirst).toBeLessThan(turnFirst!);
    expect(readSecond).toBeLessThan(turnSecond!);
    expect(readSecond).toBeGreaterThan(turnFirst!);
  });

  it("changed meanwhile by somebody else is not written over", async () => {
    claims.findClaim.mockResolvedValueOnce(claim).mockResolvedValueOnce({ ...claim, status: "notified", noticeDate: "2026-11-11" });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { status: "withdrawn" })).rejects.toMatchObject({ code: "aborted" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
  });
});

describe("a cargo claim's life", () => {
  it("is raised open, owned by whoever raised it, with a claimed amount", async () => {
    await claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Damaged", claimAmount: "80", claimCurrency: "EUR" });
    expect(created()).toEqual({ shipmentId: SHIPMENT, kind: "cargo", cargoState: "Damaged", claimAmount: "80", claimCurrency: "EUR", ownerUserId: USER, ownerName: "eva@firma.cz" });
  });

  it("is owned by nobody when who raised it can't be read, and by an active user of the company when named", async () => {
    lookup.userEmailOf.mockRejectedValue(APIError.unavailable("down"));
    await claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Damaged" });
    expect(created()).toMatchObject({ ownerUserId: USER, ownerName: "" });
    await claimService.create(operator, SHIPMENT, "cargo", { cargoState: "Damaged", ownerUserId: JAN.toUpperCase() });
    expect(created()).toMatchObject({ ownerUserId: JAN, ownerName: "jan@firma.cz" });
    await expect(claimService.create(operator, SHIPMENT, "cargo", { ownerUserId: INVOICE })).rejects.toMatchObject({ code: "invalid_argument", message: OWNER_NOT_A_USER });
    lookup.companyUsers.mockRejectedValue(new Error("down"));
    await expect(claimService.create(operator, SHIPMENT, "cargo", { ownerUserId: JAN })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("moves through its statuses, each move in the job's history; closing is stamped", async () => {
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "notified", noticeDate: "2026-11-11" });
    expect(written()).toEqual({ status: "notified", noticeDate: "2026-11-11", closedAt: null, closedBy: "" });
    expect(lines()).toEqual([expect.objectContaining({ field: "claimStatus", oldValue: "Cargo claim (Damaged): Open", newValue: "Cargo claim (Damaged): Carrier notified" })]);

    history.create.mockClear();
    claims.findClaim.mockResolvedValue({ ...claim, status: "with_insurer", insurerNotifiedOn: "2026-11-12" });
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "settled", settledAmount: "500", settledCurrency: "eur" });
    expect(written()).toEqual({ status: "settled", settledAmount: "500", settledCurrency: "EUR", closedAt: expect.any(Date), closedBy: "eva@firma.cz" });
    expect(lines()[0]).toMatchObject({ oldValue: "Cargo claim (Damaged): With the insurer", newValue: "Cargo claim (Damaged): Settled" });
  });

  it("asks for what its status needs: the carrier's day, the insurer's day, the settled amount", async () => {
    const asked = [
      [{ status: "notified" }, "Say when the carrier was notified: fill in the notice date"],
      [{ status: "with_insurer" }, "Say when the insurer was notified: fill in the day"],
      [{ status: "settled", settledAmount: "500" }, "Say what was settled: the settled amount and its currency"],
    ] as const;
    for (const [input, message] of asked) {
      await expect(claimService.update(operator, SHIPMENT, CLAIM, input)).rejects.toMatchObject({ code: "invalid_argument", message });
    }
    // Already notified, the day stands: no need to send it again.
    claims.findClaim.mockResolvedValue({ ...claim, noticeDate: "2026-11-11" });
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "notified" });
    expect(written()).toMatchObject({ status: "notified" });
  });

  it("has its own statuses and fields, and none of a claim on costs'", async () => {
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { status: "accepted" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The status of a claim on the shipment must be one of: open, notified, with_insurer, settled, rejected, withdrawn",
    });
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { supplierInvoiceId: INVOICE })).rejects.toMatchObject({ message: COST_ONLY_REFUSAL });
    await expect(claimService.create(operator, SHIPMENT, "cost", { settledAmount: "5" })).rejects.toMatchObject({ message: CARGO_ONLY_REFUSAL });
    await expect(claimService.create(operator, SHIPMENT, "cost", { status: "settled" })).rejects.toMatchObject({ message: "The claim status must be one of: open, accepted, rejected, withdrawn" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(claims.insertClaim).not.toHaveBeenCalled();
  });

  it("changes owner in the job's history", async () => {
    await claimService.update(operator, SHIPMENT, CLAIM, { ownerUserId: JAN });
    expect(written()).toEqual({ ownerUserId: JAN, ownerName: "jan@firma.cz" });
    expect(lines()).toEqual([expect.objectContaining({ field: "claimOwner", oldValue: "Cargo claim (Damaged): eva@firma.cz", newValue: "Cargo claim (Damaged): jan@firma.cz" })]);
    history.create.mockClear();
    await claimService.update(operator, SHIPMENT, CLAIM, { ownerUserId: "" });
    expect(written()).toEqual({ ownerUserId: null, ownerName: "" });
    expect(lines()[0]).toMatchObject({ newValue: "Cargo claim (Damaged): nobody" });
  });

  it("shows its deadlines only while the time limits are on", async () => {
    const [cargo] = (await claimService.list(operator, SHIPMENT)).claims;
    expect(cargo).toMatchObject({ isOpen: true, deadlineFrom: null, noticeDeadline: null, suitDeadline: null });
    limits.of.mockResolvedValue({ enabled: true, limits: GENERAL_PRACTICE });
    const answer = await claimService.list(operator, SHIPMENT);
    expect(answer.timeLimitsOn).toBe(true);
    // Sea: 3 days and 1 year from the actual delivery (10.11.).
    expect(answer.claims[0]).toMatchObject({ deadlineFrom: "delivery", noticeDeadline: "2026-11-13", suitDeadline: "2027-11-10" });
    // A claim on costs has none.
    expect(answer.claims[1]).toMatchObject({ isOpen: true, deadlineFrom: null, noticeDeadline: null, suitDeadline: null });
  });
});

describe("a claim on costs", () => {
  beforeEach(() => {
    claims.findClaim.mockResolvedValue(costClaim);
  });

  it("is tied to a supplier invoice with an amount and a currency, stored as the columns take them", async () => {
    await claimService.update(operator, SHIPMENT, CLAIM, { supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "eur" });
    expect(written()).toEqual({ supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "EUR" });
    await claimService.update(operator, SHIPMENT, CLAIM, { supplierInvoiceId: "", claimAmount: "", claimCurrency: "" });
    expect(written()).toEqual({ supplierInvoiceId: null, claimAmount: null, claimCurrency: "" });
  });

  it("refuses a bad invoice id, amount, currency or status before anything is read or written", async () => {
    const bad = [
      [{ supplierInvoiceId: "F-77" }, "The supplier invoice must be given by its id"],
      [{ claimAmount: "120,50" }, "The claimed amount must be a number with at most 2 decimal places, like 120.50"],
      [{ claimCurrency: "EURO" }, "The currency must be a 3-letter code, like EUR"],
      [{ settledAmount: "1,5" }, "The settled amount must be a number with at most 2 decimal places, like 120.50"],
    ] as const;
    for (const [input, message] of bad) {
      await expect(claimService.update(operator, SHIPMENT, CLAIM, input)).rejects.toMatchObject({ code: "invalid_argument", message });
      await expect(claimService.create(operator, SHIPMENT, "cost", input)).rejects.toMatchObject({ code: "invalid_argument", message });
    }
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { status: "closed" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(jobs.getByIdForCompany).not.toHaveBeenCalled();
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(claims.insertClaim).not.toHaveBeenCalled();
  });

  it("of an unknown claim is not found", async () => {
    claims.findClaim.mockResolvedValue(null);
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { status: "accepted" })).rejects.toMatchObject({ code: "not_found" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
  });

  it("closed is stamped when and by whom (by e-mail); reopened, the stamps are cleared", async () => {
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "accepted" });
    expect(lookup.userEmailOf).toHaveBeenCalledWith(USER);
    expect(written()).toEqual({ status: "accepted", closedAt: expect.any(Date), closedBy: "eva@firma.cz" });
    expect(lines()[0]).toMatchObject({ field: "claimStatus", oldValue: "Claim on costs (Rail Cargo, F-77): Open", newValue: "Claim on costs (Rail Cargo, F-77): Accepted" });

    claims.findClaim.mockResolvedValue({ ...costClaim, status: "accepted", closedAt: new Date(), closedBy: "eva@firma.cz" });
    lookup.userEmailOf.mockClear();
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "open" });
    expect(written()).toEqual({ status: "open", closedAt: null, closedBy: "" });
    expect(lookup.userEmailOf).not.toHaveBeenCalled();
  });

  it("saved again in the status it has keeps its stamps, and no history line", async () => {
    claims.findClaim.mockResolvedValue({ ...costClaim, status: "rejected", closedAt: new Date(), closedBy: "jan@firma.cz" });
    await claimService.update(operator, SHIPMENT, CLAIM, { status: "rejected", reason: "Too late" });
    expect(written()).toEqual({ reason: "Too late", status: "rejected" });
    expect(lookup.userEmailOf).not.toHaveBeenCalled();
    expect(history.create).not.toHaveBeenCalled();
  });

  it("is created open without stamps or owner, or closed with stamps", async () => {
    await claimService.create(operator, SHIPMENT, "cost", { supplierInvoiceId: INVOICE, claimAmount: "80" });
    expect(created()).toEqual({ shipmentId: SHIPMENT, kind: "cost", supplierInvoiceId: INVOICE, claimAmount: "80" });
    await claimService.create(operator, SHIPMENT, "cost", { status: "withdrawn" });
    expect(created()).toEqual({ shipmentId: SHIPMENT, kind: "cost", status: "withdrawn", closedAt: expect.any(Date), closedBy: "eva@firma.cz" });
    expect(claims.syncShipmentFlag).toHaveBeenCalledTimes(2);
  });

  it("is not closed when who closes it can't be read", async () => {
    lookup.userEmailOf.mockRejectedValue(APIError.unavailable("Who you are could not be read just now — try again in a moment"));
    await expect(claimService.update(operator, SHIPMENT, CLAIM, { status: "accepted" })).rejects.toMatchObject({ code: "unavailable" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
  });
});

describe("the claims on costs Accounts Payable reads", () => {
  const OTHER = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c05";

  it("are read for the shipments or the supplier invoices asked about, each id once, non-ids left out", async () => {
    await claimService.costClaims("c1", [SHIPMENT, SHIPMENT.toUpperCase(), "nope"], [INVOICE]);
    expect(claims.listCostClaims).toHaveBeenCalledWith("c1", [SHIPMENT], [INVOICE]);
    await claimService.costClaims("c1", [], [INVOICE, OTHER]);
    expect(claims.listCostClaims).toHaveBeenLastCalledWith("c1", [], [INVOICE, OTHER]);
  });

  it("are none, without a query, when nothing (or nothing that is an id) is asked about", async () => {
    await expect(claimService.costClaims("c1", [], [])).resolves.toEqual([]);
    await expect(claimService.costClaims("c1", ["x"], [""])).resolves.toEqual([]);
    await expect(claimService.costClaims("c1")).resolves.toEqual([]);
    expect(claims.listCostClaims).not.toHaveBeenCalled();
  });

  it("are refused beyond 2000 ids of a kind", async () => {
    const many = Array.from({ length: 2001 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    await expect(claimService.costClaims("c1", many, [])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(claims.listCostClaims).not.toHaveBeenCalled();
  });

  it("tell the invoice, both amounts, the currency, the status and the notice day", async () => {
    claims.listCostClaims.mockResolvedValue([
      { ...costClaim, supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "EUR", noticeDate: "2026-11-10", status: "open" },
    ]);
    await expect(claimService.costClaims("c1", [], [INVOICE])).resolves.toEqual([
      {
        id: CLAIM,
        shipmentId: SHIPMENT,
        supplierInvoiceId: INVOICE,
        supplier: "Rail Cargo",
        invoiceNumber: "F-77",
        reason: "Double charge",
        amount: "120,50 EUR",
        claimAmount: "120.50",
        claimCurrency: "EUR",
        status: "open",
        noticeDate: "2026-11-10",
        createdAt: "2026-11-06T09:00:00.000Z",
      },
    ]);
  });
});
