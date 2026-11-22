import { beforeEach, describe, expect, it, vi } from "vitest";

// Documents → Shipments asks for the shipment of a House B/L before a reading creates a new job.
// Run against stand-ins for the repositories and the shipment service.
const shipments = vi.hoisted(() => ({ liveByHouseBols: vi.fn() }));
const masterJobs = vi.hoisted(() => ({ liveByMasterBol: vi.fn() }));
const service = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: masterJobs }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));

import { readingMatchService } from "../../services/readingMatch.service";

beforeEach(() => vi.resetAllMocks());

describe("shipmentOfHouseBol", () => {
  it("gives the oldest live shipment of the House B/L, whole", async () => {
    shipments.liveByHouseBols.mockResolvedValue([
      { id: "s1", jobNumber: "CZ00000010", key: "HBL123" },
      { id: "s2", jobNumber: "CZ00000011", key: "HBL123" },
    ]);
    service.getById.mockResolvedValue({ id: "s1", jobNumber: "CZ00000010" });
    await expect(readingMatchService.shipmentOfHouseBol("c1", "hbl-123")).resolves.toEqual({ id: "s1", jobNumber: "CZ00000010" });
    expect(shipments.liveByHouseBols).toHaveBeenCalledWith("c1", ["hbl-123"]);
    expect(service.getById).toHaveBeenCalledWith("s1", "c1");
  });

  it("gives null when no live shipment has it", async () => {
    shipments.liveByHouseBols.mockResolvedValue([]);
    await expect(readingMatchService.shipmentOfHouseBol("c1", "HBL123")).resolves.toBeNull();
    expect(service.getById).not.toHaveBeenCalled();
  });

  it("asks nothing for a House B/L of no letters or digits", async () => {
    await expect(readingMatchService.shipmentOfHouseBol("c1", " / - ")).resolves.toBeNull();
    expect(shipments.liveByHouseBols).not.toHaveBeenCalled();
  });
});
