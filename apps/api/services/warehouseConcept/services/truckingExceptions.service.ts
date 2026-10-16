import { APIError } from "encore.dev/api";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { isUuid } from "../../../lib/uuid";

// What Trucking reads of our OS&D exceptions (Damaged / Short / Over) for its consignments' jobs:
// read-only, nothing is published or changed here.

const MAX_SHIPMENTS = 500;

export interface ShipmentException {
  id: string;
  shipmentId: string;
  /** Damaged | Short | Over */
  kind: string;
  pieces: number;
  note: string;
  /** open | resolved */
  status: string;
  createdAt: string;
}

class TruckingExceptionsService {
  /** The exceptions of the shipments' positions, oldest first; unknown ids give nothing. */
  async forShipments(companyId: string, shipmentIds: string[]): Promise<ShipmentException[]> {
    const ids = [...new Set((Array.isArray(shipmentIds) ? shipmentIds : []).filter((id) => typeof id === "string" && isUuid(id)))];
    if (ids.length > MAX_SHIPMENTS) throw APIError.invalidArgument(`At most ${MAX_SHIPMENTS} shipments at once`);
    const rows = await gateExceptionRepository.forShipments(companyId, ids);
    return rows.map((r) => ({
      id: r.id,
      shipmentId: r.shipmentId!,
      kind: r.kind,
      pieces: r.pieces,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const truckingExceptionsService = new TruckingExceptionsService();
