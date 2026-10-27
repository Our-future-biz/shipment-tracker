import { beforeEach, describe, expect, it, vi } from "vitest";

// The MBL Shipper / Consignee of a master job, linked to the Customer Database: run against
// stand-ins for the repositories, the shipment service and the customers service.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ customers: { customerGet: vi.fn() } }));
vi.mock("../../repositories/masterJob.repository", () => ({
  masterJobRepository: { getByIdForCompany: vi.fn(), updateForCompany: vi.fn(), shipmentCounts: vi.fn() },
}));
vi.mock("../../repositories/masterJobContainer.repository", () => ({ masterJobContainerRepository: {} }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: { findByMasterJobId: vi.fn() } }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: {} }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: { update: vi.fn(), isInvoiced: vi.fn() } }));

import { customers } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { masterJobService } from "../../services/masterJob.service";

const repository = vi.mocked(masterJobRepository);
const customerGet = vi.mocked(customers.customerGet);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const JOB = "5b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const ALFA = "00000000-0000-0000-0000-0000000000a1";
const record = (over: Record<string, unknown> = {}) => ({
  id: JOB,
  companyId: COMPANY,
  mczNumber: "MCZ00000001",
  loadType: "",
  shipper: "",
  shipperId: null,
  consignee: "",
  consigneeId: null,
  createdAt: new Date("2026-10-26T10:00:00Z"),
  updatedAt: new Date("2026-10-26T10:00:00Z"),
  deletedAt: null,
  ...over,
});
const update = (data: Record<string, unknown>) => masterJobService.update(JOB, COMPANY, data as never, USER);
const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  repository.getByIdForCompany.mockResolvedValue(record() as never);
  repository.updateForCompany.mockImplementation(async (_id, _companyId, data) => record(data as Record<string, unknown>) as never);
  repository.shipmentCounts.mockResolvedValue(new Map());
  // No houses on the master job.
  vi.mocked(shipmentRepository.findByMasterJobId).mockResolvedValue([]);
  customerGet.mockResolvedValue({ customer: { id: ALFA, companyName: "Alfa s.r.o." } } as never);
});

describe("the MBL Shipper and Consignee", () => {
  it("store the Customer Database's current name with the id, whatever text the save sends", async () => {
    await update({ shipperId: ALFA, shipper: "ALFA SRO", consigneeId: ALFA });
    expect(customerGet).toHaveBeenCalledWith({ id: ALFA });
    expect(written()).toMatchObject({ shipperId: ALFA, shipper: "Alfa s.r.o.", consigneeId: ALFA, consignee: "Alfa s.r.o." });
  });

  it("keep the text when unlinked", async () => {
    await update({ shipperId: null, shipper: "As on the MBL" });
    expect(customerGet).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ shipperId: null, shipper: "As on the MBL" });
  });

  it("refuse an id that is no customer of the company, before anything is written", async () => {
    customerGet.mockRejectedValue(APIError.notFound("Customer not found"));
    await expect(update({ consigneeId: ALFA })).rejects.toMatchObject({ code: "invalid_argument", message: "Unknown consignee" });
    await expect(update({ shipperId: "not-an-id" })).rejects.toMatchObject({ code: "invalid_argument", message: "Unknown shipper" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("are not looked up for a save that does not link them", async () => {
    await update({ vessel: "MSC Anna" });
    expect(customerGet).not.toHaveBeenCalled();
  });
});
