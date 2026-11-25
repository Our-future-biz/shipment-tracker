import { beforeEach, describe, expect, it, vi } from "vitest";

// What the Loading Planner is told about a shipment it links a plan to (stand-ins for the
// repositories, which find a live shipment and its rows only in the company they are asked for).
const repository = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const dimensions = vi.hoisted(() => ({ listByShipmentId: vi.fn() }));
vi.mock("../repositories/shipment.repository", () => ({ shipmentRepository: repository }));
vi.mock("../repositories/cargoDimension.repository", () => ({ cargoDimensionRepository: dimensions }));

import { shipmentJobRefOf } from "../services/shipmentJobRef.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SHIPMENT = "44444444-4444-4444-8444-444444444444";
const BOOKED = { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "300", packageType: "Pallet(s)", stackable: "", containerId: null };
const row = {
  id: "d1",
  companyId: COMPANY,
  shipmentId: SHIPMENT,
  containerId: null,
  position: 0,
  pieces: "4",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  dimensionUnit: "cm",
  weightPerPcKg: "450",
  volumePerPcM3: "",
  packageType: "Pallet(s)",
  stackable: "Stackable / Overstowable",
  palletType: "EUR",
  adrUn: "1263",
  adrClass: "3",
  adrPackingGroup: "II",
  adrLimitedQuantity: false,
};

beforeEach(() => vi.clearAllMocks());

describe("shipmentJobRefOf", () => {
  it("answers the job number of the company's live shipment as it is now, and reads no cargo unless asked", async () => {
    repository.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, jobNumber: "CZLCL00000053", bookedDimensions: [] });
    await expect(shipmentJobRefOf(SHIPMENT, COMPANY)).resolves.toEqual({ jobNumber: "CZLCL00000053" });
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY);
    expect(dimensions.listByShipmentId).not.toHaveBeenCalled();
  });

  it("answers null when the company has no such live shipment, with no cargo however asked", async () => {
    repository.getByIdForCompany.mockResolvedValue(null);
    await expect(shipmentJobRefOf(SHIPMENT, COMPANY, true)).resolves.toEqual({ jobNumber: null });
    expect(dimensions.listByShipmentId).not.toHaveBeenCalled();
  });

  it("answers null for an id that is no id, without asking the database", async () => {
    await expect(shipmentJobRefOf("CZ00000053", COMPANY, true)).resolves.toEqual({ jobNumber: null });
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("asked with the cargo, gives the shipment's Dimensions rows of the company as its page has them, and its booked dimensions", async () => {
    repository.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, jobNumber: "CZLCL00000053", bookedDimensions: [BOOKED] });
    dimensions.listByShipmentId.mockResolvedValue([row]);
    const answer = await shipmentJobRefOf(SHIPMENT, COMPANY, true);
    expect(dimensions.listByShipmentId).toHaveBeenCalledWith(SHIPMENT, COMPANY);
    expect(answer).toEqual({
      jobNumber: "CZLCL00000053",
      cargo: {
        cargoDimensions: [
          {
            containerId: null,
            pieces: "4",
            lengthCm: "120",
            widthCm: "80",
            heightCm: "150",
            dimensionUnit: "cm",
            weightPerPcKg: "450",
            volumePerPcM3: "",
            packageType: "Pallet(s)",
            stackable: "Stackable / Overstowable",
            palletType: "EUR",
            adrUn: "1263",
            adrClass: "3",
            adrPackingGroup: "II",
            adrLimitedQuantity: false,
          },
        ],
        bookedDimensions: [BOOKED],
      },
    });
  });

  it("gives no booked dimensions for a shipment whose booked dimensions were never copied from its quote", async () => {
    repository.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, jobNumber: "CZ00000053", bookedDimensions: null });
    dimensions.listByShipmentId.mockResolvedValue([]);
    await expect(shipmentJobRefOf(SHIPMENT, COMPANY, true)).resolves.toEqual({ jobNumber: "CZ00000053", cargo: { cargoDimensions: [], bookedDimensions: [] } });
  });
});
