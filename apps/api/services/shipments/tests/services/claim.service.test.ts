import { beforeEach, describe, expect, it, vi } from "vitest";

// A shipment's claims are changed only while the shipment is live: a deleted one's are not shown,
// and its Claim field stays as it was deleted. A claim on costs is tied to a supplier invoice, with
// an amount, a currency and a status that Accounts Payable reads. Run against stand-ins for the
// repository, the shipments service and the auth service's user lookup.
const claims = vi.hoisted(() => ({
  updateClaim: vi.fn(),
  deleteClaim: vi.fn(),
  syncShipmentFlag: vi.fn(),
  createForCompany: vi.fn(),
  listByShipmentId: vi.fn(),
  findClaim: vi.fn(),
  listCostClaims: vi.fn(),
}));
const shipments = vi.hoisted(() => ({ requireLive: vi.fn() }));
const lookup = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: claims }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));
vi.mock("../../../../lib/companyUsers", () => lookup);

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { claimService } from "../../services/claim.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const CLAIM = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const INVOICE = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const USER = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c04";
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
};
const costClaim = { ...claim, kind: "cost", cargoState: "", supplier: "Rail Cargo", invoiceNumber: "F-77", reason: "Double charge", amount: "120,50 EUR" };

const written = () => claims.updateClaim.mock.calls.at(-1)![3];
const created = () => claims.createForCompany.mock.calls.at(-1)![1];

beforeEach(() => {
  vi.clearAllMocks();
  shipments.requireLive.mockResolvedValue(undefined);
  claims.updateClaim.mockResolvedValue(claim);
  claims.createForCompany.mockImplementation(async (_company: string, row: object) => ({ ...costClaim, ...row }));
  claims.deleteClaim.mockResolvedValue(true);
  claims.findClaim.mockResolvedValue(costClaim);
  claims.listCostClaims.mockResolvedValue([]);
  lookup.userEmailOf.mockResolvedValue("eva@firma.cz");
});

describe("a claim", () => {
  it("is changed and deleted on a live shipment, its Claim field kept in step", async () => {
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { cargoState: "Damaged" })).resolves.toMatchObject({ id: CLAIM });
    await claimService.delete(SHIPMENT, CLAIM, "c1");
    expect(shipments.requireLive).toHaveBeenCalledWith(SHIPMENT, "c1");
    expect(claims.syncShipmentFlag).toHaveBeenCalledTimes(2);
  });

  it("of a deleted shipment is neither changed nor deleted, and the shipment isn't written", async () => {
    shipments.requireLive.mockRejectedValue(APIError.notFound("Shipment not found"));
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { note: "Wet" })).rejects.toMatchObject({ code: "not_found" });
    await expect(claimService.delete(SHIPMENT, CLAIM, "c1")).rejects.toMatchObject({ code: "not_found" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(claims.deleteClaim).not.toHaveBeenCalled();
    expect(claims.syncShipmentFlag).not.toHaveBeenCalled();
  });

  it("keeps its free-text fields as they were: written as sent, without reading the claim first", async () => {
    await claimService.update(SHIPMENT, CLAIM, "c1", { supplier: "Rail Cargo", invoiceNumber: "F-77", reason: "Double charge", amount: "120,50 EUR", noticeDate: "" });
    expect(written()).toEqual({ supplier: "Rail Cargo", invoiceNumber: "F-77", reason: "Double charge", amount: "120,50 EUR", noticeDate: null });
    expect(claims.findClaim).not.toHaveBeenCalled();
  });

  it("is shown with its supplier invoice, amount, currency, status and closing stamps", async () => {
    claims.updateClaim.mockResolvedValue({ ...costClaim, supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "EUR", status: "accepted", closedAt: new Date("2026-11-17T10:00:00Z"), closedBy: "eva@firma.cz" });
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { note: "" })).resolves.toMatchObject({
      supplierInvoiceId: INVOICE,
      claimAmount: "120.50",
      claimCurrency: "EUR",
      status: "accepted",
      closedAt: "2026-11-17T10:00:00.000Z",
      closedBy: "eva@firma.cz",
    });
  });
});

describe("a claim on costs", () => {
  it("is tied to a supplier invoice with an amount and a currency, stored as the columns take them", async () => {
    await claimService.update(SHIPMENT, CLAIM, "c1", { supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "eur" }, USER);
    expect(written()).toEqual({ supplierInvoiceId: INVOICE, claimAmount: "120.50", claimCurrency: "EUR" });
    await claimService.update(SHIPMENT, CLAIM, "c1", { supplierInvoiceId: "", claimAmount: "", claimCurrency: "" }, USER);
    expect(written()).toEqual({ supplierInvoiceId: null, claimAmount: null, claimCurrency: "" });
  });

  it("refuses a bad invoice id, amount, currency or status before anything is read or written", async () => {
    const bad = [
      [{ supplierInvoiceId: "F-77" }, "The supplier invoice must be given by its id"],
      [{ claimAmount: "120,50" }, "The claimed amount must be a number with at most 2 decimal places, like 120.50"],
      [{ claimCurrency: "EURO" }, "The currency must be a 3-letter code, like EUR"],
      [{ status: "closed" }, "The claim status must be one of: open, accepted, rejected, withdrawn"],
    ] as const;
    for (const [input, message] of bad) {
      await expect(claimService.update(SHIPMENT, CLAIM, "c1", input, USER)).rejects.toMatchObject({ code: "invalid_argument", message });
      await expect(claimService.create(SHIPMENT, "c1", "cost", input, USER)).rejects.toMatchObject({ code: "invalid_argument", message });
    }
    expect(shipments.requireLive).not.toHaveBeenCalled();
    expect(claims.updateClaim).not.toHaveBeenCalled();
    expect(claims.createForCompany).not.toHaveBeenCalled();
  });

  it("is the only claim with those fields: a claim on the shipment refuses them, empty ones only clear", async () => {
    claims.findClaim.mockResolvedValue(claim);
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { supplierInvoiceId: INVOICE }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { status: "accepted" }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(claimService.create(SHIPMENT, "c1", "cargo", { claimAmount: "5" }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
    await claimService.update(SHIPMENT, CLAIM, "c1", { cargoState: "Lost", claimAmount: "" }, USER);
    expect(written()).toEqual({ cargoState: "Lost", claimAmount: null });
  });

  it("of an unknown claim is not found", async () => {
    claims.findClaim.mockResolvedValue(null);
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { status: "accepted" }, USER)).rejects.toMatchObject({ code: "not_found" });
    expect(claims.updateClaim).not.toHaveBeenCalled();
  });

  it("closed is stamped when and by whom (by e-mail); reopened, the stamps are cleared", async () => {
    await claimService.update(SHIPMENT, CLAIM, "c1", { status: "accepted" }, USER);
    expect(lookup.userEmailOf).toHaveBeenCalledWith(USER);
    expect(written()).toEqual({ status: "accepted", closedAt: expect.any(Date), closedBy: "eva@firma.cz" });

    claims.findClaim.mockResolvedValue({ ...costClaim, status: "accepted", closedAt: new Date(), closedBy: "eva@firma.cz" });
    lookup.userEmailOf.mockClear();
    await claimService.update(SHIPMENT, CLAIM, "c1", { status: "open" }, USER);
    expect(written()).toEqual({ status: "open", closedAt: null, closedBy: "" });
    expect(lookup.userEmailOf).not.toHaveBeenCalled();
  });

  it("saved again in the status it has keeps its stamps", async () => {
    claims.findClaim.mockResolvedValue({ ...costClaim, status: "rejected", closedAt: new Date(), closedBy: "jan@firma.cz" });
    await claimService.update(SHIPMENT, CLAIM, "c1", { status: "rejected", reason: "Too late" }, USER);
    expect(written()).toEqual({ reason: "Too late", status: "rejected" });
    expect(lookup.userEmailOf).not.toHaveBeenCalled();
  });

  it("is created open without stamps, or closed with them", async () => {
    await claimService.create(SHIPMENT, "c1", "cost", { supplierInvoiceId: INVOICE, claimAmount: "80" }, USER);
    expect(created()).toEqual({ shipmentId: SHIPMENT, kind: "cost", supplierInvoiceId: INVOICE, claimAmount: "80" });
    await claimService.create(SHIPMENT, "c1", "cost", { status: "withdrawn" }, USER);
    expect(created()).toEqual({ shipmentId: SHIPMENT, kind: "cost", status: "withdrawn", closedAt: expect.any(Date), closedBy: "eva@firma.cz" });
    expect(claims.syncShipmentFlag).toHaveBeenCalledTimes(2);
  });

  it("is not closed when who closes it can't be read", async () => {
    lookup.userEmailOf.mockRejectedValue(APIError.unavailable("Who you are could not be read just now — try again in a moment"));
    await expect(claimService.update(SHIPMENT, CLAIM, "c1", { status: "accepted" }, USER)).rejects.toMatchObject({ code: "unavailable" });
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
