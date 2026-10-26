import { beforeEach, describe, expect, it, vi } from "vitest";

// The Road / Domestic job Trucking asks for: written through the shipment service (stood in for here).
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: {} }));
vi.mock("../../services/shipment.service", () => ({
  shipmentService: { create: vi.fn(async () => ({ shipment: { id: "s1", jobNumber: "CZ00000099" } })) },
}));

import { auth } from "~encore/clients";
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
  createdBy: "Trucking · Jana Nováková",
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

describe("Created By of a road job", () => {
  const JANA = "00000000-0000-0000-0000-0000000000a1";
  const SYSTEM = "00000000-0000-0000-0000-0000000000a2";

  beforeEach(() => {
    // The service identity is no user of the company: the users list leaves it out.
    vi.mocked(auth.usersList).mockResolvedValue({ users: [{ id: JANA, email: "Jana@Firma.cz", displayName: "Jana Nováková" }] } as never);
  });

  it("names the user Trucking acts for by e-mail", async () => {
    await roadJobService.create("company", input(), JANA);
    expect(created()).toMatchObject({ createdBy: "Trucking · jana@firma.cz" });
  });

  it("keeps what Trucking sent for its service identity, where it names no person", async () => {
    await roadJobService.create("company", input({ createdBy: "Trucking · Trucking (system)" }), SYSTEM);
    expect(created()).toMatchObject({ createdBy: "Trucking · Trucking (system)" });
    await roadJobService.create("company", input({ createdBy: "Trucking" }), SYSTEM);
    expect(created()).toMatchObject({ createdBy: "Trucking" });
  });

  it("never stores a name Trucking sent: without a user, or when the users can't be read, it is just Trucking", async () => {
    await roadJobService.create("company", input());
    expect(created()).toMatchObject({ createdBy: "Trucking" });
    await roadJobService.create("company", input(), SYSTEM);
    expect(created()).toMatchObject({ createdBy: "Trucking" });
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await roadJobService.create("company", input(), JANA);
    expect(created()).toMatchObject({ createdBy: "Trucking" });
  });
});
