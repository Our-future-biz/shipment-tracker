import { APIError } from "encore.dev/api";
import type { Shipment } from "../services/warehouseImport.service";

// Shipments as the tests' mocked shipments service answers them. A test sets what a shipment
// looks like (`shipmentData`) or makes it fail (`failingShipments`); anything else is a blank
// import shipment. Used from the vi.mock("~encore/clients") factories.

export const shipmentData = new Map<string, Partial<Shipment>>();
export const failingShipments = new Map<string, Error>();

export function fakeShipment(id: string): Shipment {
  return {
    id,
    jobNumber: `SEA-${id.slice(0, 6)}`,
    tradeDirection: "",
    loadType: "",
    freightMode: "",
    containerNumber: "",
    customsProcedure: "",
    customsStatus: "Waiting For Commercial Paperwork",
    customer: "",
    ...shipmentData.get(id),
  } as unknown as Shipment;
}

export async function getShipment({ shipmentId }: { shipmentId: string }) {
  const err = failingShipments.get(shipmentId);
  if (err) throw err;
  return { shipment: fakeShipment(shipmentId) };
}

export const notFound = () => APIError.notFound("Shipment not found");
