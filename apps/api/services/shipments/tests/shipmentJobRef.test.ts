import { beforeEach, describe, expect, it, vi } from "vitest";

// What the Loading Planner is told about a shipment it links a plan to (a stand-in for the
// repository, which finds a live shipment only in the company it is asked for).
const repository = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
vi.mock("../repositories/shipment.repository", () => ({ shipmentRepository: repository }));

import { shipmentJobNumberOf } from "../services/shipmentJobRef.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SHIPMENT = "44444444-4444-4444-8444-444444444444";

beforeEach(() => vi.clearAllMocks());

describe("shipmentJobNumberOf", () => {
  it("answers the job number of the company's live shipment as it is now", async () => {
    repository.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, jobNumber: "CZLCL00000053" });
    await expect(shipmentJobNumberOf(SHIPMENT, COMPANY)).resolves.toBe("CZLCL00000053");
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY);
  });

  it("answers null when the company has no such live shipment", async () => {
    repository.getByIdForCompany.mockResolvedValue(null);
    await expect(shipmentJobNumberOf(SHIPMENT, COMPANY)).resolves.toBeNull();
  });

  it("answers null for an id that is no id, without asking the database", async () => {
    await expect(shipmentJobNumberOf("CZ00000053", COMPANY)).resolves.toBeNull();
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });
});
