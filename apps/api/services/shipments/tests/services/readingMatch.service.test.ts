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

  // Review of system-23: a House B/L is not unique on a manual create or edit - an old cancelled job with it
  // was offered, and written into, instead of the active one.
  it("gives the oldest shipment of the House B/L that is not cancelled; a cancelled one only when no other has it", async () => {
    shipments.liveByHouseBols.mockResolvedValue([
      { id: "s1", jobNumber: "CZ00000010", key: "HBL123", status: "Cancelled Shipment" },
      { id: "s2", jobNumber: "CZ00000011", key: "HBL123", status: "Booked [IMP]" },
      { id: "s3", jobNumber: "CZ00000012", key: "HBL123", status: "Booked [IMP]" },
    ]);
    service.getById.mockImplementation(async (id: string) => ({ id }));
    await expect(readingMatchService.shipmentOfHouseBol("c1", "HBL123")).resolves.toEqual({ id: "s2" });
    expect(service.getById).toHaveBeenCalledExactlyOnceWith("s2", "c1");

    shipments.liveByHouseBols.mockResolvedValue([
      { id: "s1", jobNumber: "CZ00000010", key: "HBL123", status: "Cancelled Shipment" },
      { id: "s4", jobNumber: "CZ00000013", key: "HBL123", status: " Cancelled Shipment " },
    ]);
    await expect(readingMatchService.shipmentOfHouseBol("c1", "HBL123")).resolves.toEqual({ id: "s1" });
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

// A consolidation's reading: each House B/L's shipment, by the same rule.
describe("matches", () => {
  it("gives each House B/L's oldest shipment that is not cancelled, a cancelled one only when no other has it", async () => {
    shipments.liveByHouseBols.mockResolvedValue([
      { id: "s1", jobNumber: "CZ00000010", key: "HBL1", status: "Cancelled Shipment" },
      { id: "s2", jobNumber: "CZ00000011", key: "HBL1", status: "Booked [EXP]" },
      { id: "s3", jobNumber: "CZ00000012", key: "HBL2", status: "Cancelled Shipment" },
    ]);
    const { shipments: found, masterJob } = await readingMatchService.matches("c1", ["hbl-1", "HBL2", "HBL3"], "");
    expect(found).toEqual([
      { houseBol: "hbl-1", shipmentId: "s2", jobNumber: "CZ00000011" },
      { houseBol: "HBL2", shipmentId: "s3", jobNumber: "CZ00000012" },
    ]);
    expect(masterJob).toBeNull();
  });
});
