import { beforeEach, describe, expect, it, vi } from "vitest";

// The Road / Domestic job Trucking asks for: written through the shipment service (stood in for here).
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: {} }));
vi.mock("../../services/shipment.service", () => ({
  shipmentService: { create: vi.fn(async () => ({ shipment: { id: "s1", jobNumber: "CZ00000099" } })) },
}));

import { shipmentService } from "../../services/shipment.service";
import { roadJobService } from "../../services/roadJob.service";
import type { RoadJobInput } from "../../interfaces/interfaces";

const input = (over: Partial<RoadJobInput> = {}): RoadJobInput => ({
  customerId: "00000000-0000-0000-0000-0000000000c1",
  customerName: "Alfa",
  shipper: "Alfa",
  consignee: "Beta",
  pickupAddress: "Alfa, 110 00 Praha",
  pickupSiteId: null,
  pickupPostcode: "11000",
  pickupCountry: "CZ",
  deliveryAddress: "Beta, 602 00 Brno",
  deliverySiteId: null,
  deliveryPostcode: "60200",
  deliveryCountry: "CZ",
  pickupDate: "2026-10-15",
  pickupTime: "",
  plannedDeliveryDate: null,
  cargoDescription: "",
  customerReference: "",
  quoteNumber: null,
  createdBy: "Trucking",
  ...over,
});

const created = () => vi.mocked(shipmentService.create).mock.calls.at(-1)![1];

beforeEach(() => vi.clearAllMocks());

describe("a Road / Domestic job for Trucking", () => {
  it("is a Full Load unless Trucking asks for a Consolidation (an LTL consignment)", async () => {
    await roadJobService.create("company", input());
    expect(created()).toMatchObject({ freightMode: "Road Freight", tradeDirection: "Domestic", loadType: "Full Load" });
    await roadJobService.create("company", input({ loadType: "Consolidation" }));
    expect(created()).toMatchObject({ loadType: "Consolidation" });
  });
});
