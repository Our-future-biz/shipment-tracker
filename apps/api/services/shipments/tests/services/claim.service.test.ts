import { beforeEach, describe, expect, it, vi } from "vitest";

// A shipment's claims are changed only while the shipment is live: a deleted one's are not shown,
// and its Claim field stays as it was deleted. Run against stand-ins for the repository and the
// shipments service.
const claims = vi.hoisted(() => ({ updateClaim: vi.fn(), deleteClaim: vi.fn(), syncShipmentFlag: vi.fn(), createForCompany: vi.fn(), listByShipmentId: vi.fn() }));
const shipments = vi.hoisted(() => ({ requireLive: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: claims }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { claimService } from "../../services/claim.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const CLAIM = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const claim = { id: CLAIM, shipmentId: SHIPMENT, kind: "cargo", cargoState: "Damaged", note: "", supplier: "", invoiceNumber: "", reason: "", amount: "", noticeDate: null, createdAt: new Date("2026-11-06T09:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  shipments.requireLive.mockResolvedValue(undefined);
  claims.updateClaim.mockResolvedValue(claim);
  claims.deleteClaim.mockResolvedValue(true);
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
});
